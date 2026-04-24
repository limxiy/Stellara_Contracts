import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MatchingPoolSource } from '@prisma/client';

@Injectable()
export class MatchingPoolService {
  constructor(private prisma: PrismaService) {}

  async createMatchingPool(data: {
    name: string;
    description?: string;
    totalAmount: bigint;
    source?: MatchingPoolSource;
    percentageFee?: number;
    metadata?: any;
  }) {
    return this.prisma.matchingPool.create({
      data: {
        ...data,
        source: data.source || MatchingPoolSource.PROTOCOL_FEES,
        percentageFee: data.percentageFee || 0.01,
        isActive: true,
      },
    });
  }

  async allocateToRound(data: {
    matchingPoolId: string;
    fundingRoundId: string;
    amount: bigint;
  }) {
    const [pool, round] = await Promise.all([
      this.prisma.matchingPool.findUnique({
        where: { id: data.matchingPoolId },
      }),
      this.prisma.fundingRound.findUnique({
        where: { id: data.fundingRoundId },
      }),
    ]);

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    if (!round) {
      throw new NotFoundException('Funding round not found');
    }

    if (!pool.isActive) {
      throw new BadRequestException('Matching pool is not active');
    }

    const availableAmount = pool.totalAmount - pool.allocatedAmount;
    if (data.amount > availableAmount) {
      throw new BadRequestException('Insufficient funds in matching pool');
    }

    // Create allocation
    const allocation = await this.prisma.poolAllocation.create({
      data: {
        matchingPoolId: data.matchingPoolId,
        fundingRoundId: data.fundingRoundId,
        amount: data.amount,
      },
    });

    // Update pool allocated amount
    await this.prisma.matchingPool.update({
      where: { id: data.matchingPoolId },
      data: {
        allocatedAmount: pool.allocatedAmount + data.amount,
      },
    });

    // Update round matching pool
    await this.prisma.fundingRound.update({
      where: { id: data.fundingRoundId },
      data: {
        matchingPool: round.matchingPool + data.amount,
      },
    });

    return allocation;
  }

  async addFundsToPool(poolId: string, amount: bigint) {
    const pool = await this.prisma.matchingPool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    return this.prisma.matchingPool.update({
      where: { id: poolId },
      data: {
        totalAmount: pool.totalAmount + amount,
      },
    });
  }

  async withdrawFromPool(poolId: string, amount: bigint, reason: string) {
    const pool = await this.prisma.matchingPool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    const availableAmount = pool.totalAmount - pool.allocatedAmount;
    if (amount > availableAmount) {
      throw new BadRequestException('Insufficient available funds');
    }

    return this.prisma.matchingPool.update({
      where: { id: poolId },
      data: {
        totalAmount: pool.totalAmount - amount,
        metadata: {
          ...pool.metadata,
          withdrawals: [
            ...(pool.metadata?.withdrawals || []),
            {
              amount: amount.toString(),
              reason,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      },
    });
  }

  async getMatchingPool(poolId: string) {
    return this.prisma.matchingPool.findUnique({
      where: { id: poolId },
      include: {
        allocations: {
          include: {
            fundingRound: true,
          },
          orderBy: { allocatedAt: 'desc' },
        },
      },
    });
  }

  async getActivePools() {
    return this.prisma.matchingPool.findMany({
      where: { isActive: true },
      include: {
        allocations: {
          include: {
            fundingRound: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPoolStatistics(poolId: string) {
    const pool = await this.prisma.matchingPool.findUnique({
      where: { id: poolId },
      include: {
        allocations: {
          include: {
            fundingRound: {
              include: {
                projects: true,
                contributions: true,
              },
            },
          },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    const totalAllocated = pool.allocations.reduce((sum, alloc) => sum + alloc.amount, BigInt(0));
    const availableAmount = pool.totalAmount - pool.allocatedAmount;
    const utilizationRate = pool.totalAmount > BigInt(0) 
      ? Number((totalAllocated * BigInt(100)) / pool.totalAmount) 
      : 0;

    const roundsSupported = pool.allocations.length;
    const totalProjectsSupported = pool.allocations.reduce(
      (sum, alloc) => sum + (alloc.fundingRound?.projects?.length || 0),
      0,
    );

    const totalContributionsMatched = pool.allocations.reduce(
      (sum, alloc) => sum + (alloc.fundingRound?.totalMatched || BigInt(0)),
      BigInt(0),
    );

    return {
      pool: {
        ...pool,
        utilizationRate,
        availableAmount,
      },
      statistics: {
        totalAllocated,
        roundsSupported,
        totalProjectsSupported,
        totalContributionsMatched,
        averageAllocationPerRound: roundsSupported > 0 ? totalAllocated / BigInt(roundsSupported) : BigInt(0),
      },
    };
  }

  async getProtocolFeesPool() {
    return this.prisma.matchingPool.findFirst({
      where: { source: MatchingPoolSource.PROTOCOL_FEES },
      include: {
        allocations: {
          include: {
            fundingRound: true,
          },
          orderBy: { allocatedAt: 'desc' },
        },
      },
    });
  }

  async createProtocolFeesPool(initialAmount: bigint = BigInt(0)) {
    // Check if protocol fees pool already exists
    const existingPool = await this.getProtocolFeesPool();
    
    if (existingPool) {
      throw new BadRequestException('Protocol fees pool already exists');
    }

    return this.createMatchingPool({
      name: 'Protocol Fees Matching Pool',
      description: 'Automatic matching pool funded by 1% of protocol fees',
      totalAmount: initialAmount,
      source: MatchingPoolSource.PROTOCOL_FEES,
      percentageFee: 0.01,
      metadata: {
        autoFund: true,
        feePercentage: 0.01,
      },
    });
  }

  async autoFundFromProtocolFees(protocolRevenue: bigint) {
    const protocolPool = await this.getProtocolFeesPool();
    
    if (!protocolPool) {
      // Create protocol pool if it doesn't exist
      await this.createProtocolFeesPool();
      return this.autoFundFromProtocolFees(protocolRevenue);
    }

    if (!protocolPool.isActive) {
      return null; // Pool is disabled
    }

    const feeAmount = protocolRevenue * BigInt(Math.floor(protocolPool.percentageFee * 100)) / BigInt(100);
    
    if (feeAmount > BigInt(0)) {
      return this.addFundsToPool(protocolPool.id, feeAmount);
    }

    return null;
  }

  async distributeToActiveRounds(poolId: string) {
    const pool = await this.prisma.matchingPool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    const activeRounds = await this.prisma.fundingRound.findMany({
      where: { 
        status: 'ACTIVE', // Using string instead of enum for compatibility
        endTime: { gt: new Date() },
      },
    });

    if (activeRounds.length === 0) {
      return { message: 'No active rounds to distribute to' };
    }

    const availableAmount = pool.totalAmount - pool.allocatedAmount;
    const amountPerRound = availableAmount / BigInt(activeRounds.length);

    const allocations = [];
    for (const round of activeRounds) {
      try {
        const allocation = await this.allocateToRound({
          matchingPoolId: poolId,
          fundingRoundId: round.id,
          amount: amountPerRound,
        });
        allocations.push(allocation);
      } catch (error) {
        console.error(`Failed to allocate to round ${round.id}:`, error);
      }
    }

    return {
      allocations,
      totalDistributed: amountPerRound * BigInt(allocations.length),
      roundsFunded: allocations.length,
    };
  }

  async getPoolPerformanceReport(poolId: string, timeRange?: { start: Date; end: Date }) {
    const pool = await this.prisma.matchingPool.findUnique({
      where: { id: poolId },
      include: {
        allocations: {
          include: {
            fundingRound: {
              include: {
                projects: {
                  include: {
                    contributions: true,
                  },
                },
                contributions: true,
              },
            },
          },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException('Matching pool not found');
    }

    // Filter allocations by time range if specified
    let filteredAllocations = pool.allocations;
    if (timeRange) {
      filteredAllocations = pool.allocations.filter(alloc => 
        alloc.allocatedAt >= timeRange.start && alloc.allocatedAt <= timeRange.end
      );
    }

    const totalAllocated = filteredAllocations.reduce((sum, alloc) => sum + alloc.amount, BigInt(0));
    const totalProjects = filteredAllocations.reduce(
      (sum, alloc) => sum + (alloc.fundingRound?.projects?.length || 0),
      0,
    );
    const totalContributions = filteredAllocations.reduce(
      (sum, alloc) => sum + (alloc.fundingRound?.totalContributions || BigInt(0)),
      BigInt(0),
    );
    const totalMatched = filteredAllocations.reduce(
      (sum, alloc) => sum + (alloc.fundingRound?.totalMatched || BigInt(0)),
      BigInt(0),
    );

    const leverageRatio = totalContributions > BigInt(0) 
      ? Number((totalMatched * BigInt(100)) / totalContributions) / 100
      : 0;

    return {
      pool: pool,
      performance: {
        totalAllocated,
        totalProjects,
        totalContributions,
        totalMatched,
        leverageRatio,
        averageAllocationPerRound: filteredAllocations.length > 0 
          ? totalAllocated / BigInt(filteredAllocations.length) 
          : BigInt(0),
        roundsFunded: filteredAllocations.length,
      },
      timeRange: timeRange || 'all time',
    };
  }
}
