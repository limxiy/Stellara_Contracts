import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PrizeStatus } from '../enums/competition-type.enum';

@Injectable()
export class PrizeDistributionService {
  constructor(private prisma: PrismaService) {}

  async calculatePrizes(competitionId: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      include: {
        leaderboard: {
          orderBy: { rank: 'asc' },
          include: {
            user: true,
          },
        },
      },
    });

    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    const prizeDistributions = [];
    const prizeDistributionRules = competition.prizeDistribution as any[];

    for (const entry of competition.leaderboard) {
      const prizeRule = prizeDistributionRules.find(rule => rule.rank === entry.rank);
      
      if (prizeRule) {
        const prizeAmount = (Number(competition.prizePool) * prizeRule.percentage) / 100;
        
        const prizeDistribution = await this.prisma.prizeDistribution.create({
          data: {
            competitionId,
            userId: entry.userId,
            rank: entry.rank,
            prizeAmount,
            currency: 'USD',
            status: PrizeStatus.PENDING,
          },
        });

        prizeDistributions.push(prizeDistribution);
      }
    }

    return prizeDistributions;
  }

  async distributePrizes(competitionId: string) {
    const prizeDistributions = await this.prisma.prizeDistribution.findMany({
      where: { 
        competitionId,
        status: PrizeStatus.PENDING,
      },
      include: {
        user: true,
        competition: true,
      },
    });

    const results = [];

    for (const prize of prizeDistributions) {
      try {
        // Process prize distribution (in real implementation, this would integrate with payment system)
        const transactionHash = await this.processPrizePayment(prize);
        
        const updatedPrize = await this.prisma.prizeDistribution.update({
          where: { id: prize.id },
          data: {
            status: PrizeStatus.PAID,
            transactionHash,
            distributedAt: new Date(),
          },
        });

        results.push({
          success: true,
          prizeId: prize.id,
          userId: prize.userId,
          amount: prize.prizeAmount,
          transactionHash,
        });
      } catch (error) {
        await this.prisma.prizeDistribution.update({
          where: { id: prize.id },
          data: {
            status: PrizeStatus.FAILED,
          },
        });

        results.push({
          success: false,
          prizeId: prize.id,
          userId: prize.userId,
          error: error.message,
        });
      }
    }

    return results;
  }

  private async processPrizePayment(prize: any): Promise<string> {
    // Mock payment processing - in real implementation, integrate with Stellar or other payment system
    // For now, return a mock transaction hash
    const mockTxHash = `TX_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return mockTxHash;
  }

  async getPrizeHistory(userId?: string, competitionId?: string) {
    const where: any = {};
    
    if (userId) where.userId = userId;
    if (competitionId) where.competitionId = competitionId;

    return this.prisma.prizeDistribution.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
        competition: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingPrizes(competitionId?: string) {
    const where: any = { status: PrizeStatus.PENDING };
    if (competitionId) where.competitionId = competitionId;

    return this.prisma.prizeDistribution.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
        competition: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async retryFailedPrize(prizeId: string) {
    const prize = await this.prisma.prizeDistribution.findUnique({
      where: { id: prizeId },
    });

    if (!prize) {
      throw new NotFoundException('Prize distribution not found');
    }

    if (prize.status !== PrizeStatus.FAILED) {
      throw new BadRequestException('Can only retry failed prize distributions');
    }

    // Reset to pending and retry
    await this.prisma.prizeDistribution.update({
      where: { id: prizeId },
      data: {
        status: PrizeStatus.PENDING,
        transactionHash: null,
        distributedAt: null,
      },
    });

    // Process the prize
    const transactionHash = await this.processPrizePayment(prize);

    return this.prisma.prizeDistribution.update({
      where: { id: prizeId },
      data: {
        status: PrizeStatus.PAID,
        transactionHash,
        distributedAt: new Date(),
      },
    });
  }

  async getPrizeStatistics(competitionId?: string) {
    const where = competitionId ? { competitionId } : {};

    const stats = await this.prisma.prizeDistribution.aggregate({
      where,
      _sum: {
        prizeAmount: true,
      },
      _count: true,
    });

    const statusBreakdown = await this.prisma.prizeDistribution.groupBy({
      by: ['status'],
      where,
      _count: true,
      _sum: {
        prizeAmount: true,
      },
    });

    return {
      totalPrizes: stats._count,
      totalAmount: stats._sum.prizeAmount || 0,
      statusBreakdown: statusBreakdown.map(item => ({
        status: item.status,
        count: item._count,
        amount: item._sum.prizeAmount || 0,
      })),
    };
  }
}
