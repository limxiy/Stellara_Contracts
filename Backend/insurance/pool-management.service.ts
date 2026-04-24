import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import {
  CreatePoolDto,
  UpdatePoolDto,
  DepositCapitalDto,
  WithdrawCapitalDto,
  PoolHealthResponse,
  PoolMetricsResponse,
  RebalanceHistoryResponse,
} from './dto/pool-management.dto';

@Injectable()
export class PoolManagementService {
  private readonly logger = new Logger(PoolManagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // POOL CRUD OPERATIONS
  // ==========================================

  async createPool(dto: CreatePoolDto) {
    this.logger.log(`Creating new insurance pool: ${dto.name}`);

    const pool = await this.prisma.insurancePool.create({
      data: {
        name: dto.name,
        description: dto.description,
        capital: dto.initialCapital || 0,
        lockedCapital: 0,
        totalPayouts: 0,
        totalPremiums: 0,
        maxExposureLimit: dto.maxExposureLimit || null,
        currentExposure: 0,
        utilizationThreshold: dto.utilizationThreshold || 0.75,
        healthScore: 100,
        isActive: true,
        isRebalancing: false,
      },
    });

    this.logger.log(`Pool created successfully: ${pool.id}`);
    return pool;
  }

  async updatePool(poolId: string, dto: UpdatePoolDto) {
    await this.validatePoolExists(poolId);

    this.logger.log(`Updating pool: ${poolId}`);

    const pool = await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        name: dto.name,
        description: dto.description,
        maxExposureLimit: dto.maxExposureLimit,
        utilizationThreshold: dto.utilizationThreshold,
        isActive: dto.isActive,
      },
    });

    return pool;
  }

  async getPoolById(poolId: string) {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
      include: {
        insurancePolicies: {
          where: { status: 'ACTIVE' },
          take: 10,
        },
        claims: {
          where: { status: { in: ['PENDING', 'REVIEWING'] } },
          take: 10,
        },
        poolAlerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${poolId} not found`);
    }

    return pool;
  }

  async getAllPools() {
    return this.prisma.insurancePool.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // LIQUIDITY TRACKING
  // ==========================================

  async depositCapital(poolId: string, dto: DepositCapitalDto) {
    await this.validatePoolExists(poolId);

    this.logger.log(`Depositing ${dto.amount} to pool ${poolId}`);

    const pool = await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        capital: { increment: dto.amount },
      },
    });

    // Recalculate health score after capital change
    await this.recalculateHealthScore(poolId);

    return pool;
  }

  async withdrawCapital(poolId: string, dto: WithdrawCapitalDto) {
    const pool = await this.validatePoolExists(poolId);

    const totalCapital = Number(pool.capital);
    const lockedCapital = Number(pool.lockedCapital);
    const availableCapital = totalCapital - lockedCapital;

    if (dto.amount > availableCapital) {
      throw new BadRequestException(
        `Insufficient available capital. Available: ${availableCapital}, Requested: ${dto.amount}`,
      );
    }

    this.logger.log(`Withdrawing ${dto.amount} from pool ${poolId}`);

    const updatedPool = await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        capital: { decrement: dto.amount },
      },
    });

    // Recalculate health score
    await this.recalculateHealthScore(poolId);

    return updatedPool;
  }

  async getLiquidityMetrics(poolId: string) {
    const pool = await this.validatePoolExists(poolId);

    const totalCapital = Number(pool.capital);
    const lockedCapital = Number(pool.lockedCapital);
    const availableCapital = totalCapital - lockedCapital;
    const liquidityRatio = totalCapital > 0 ? availableCapital / totalCapital : 0;

    return {
      poolId,
      totalCapital,
      lockedCapital,
      availableCapital,
      liquidityRatio,
      utilizationRate: totalCapital > 0 ? lockedCapital / totalCapital : 0,
    };
  }

  // ==========================================
  // RISK EXPOSURE CALCULATION
  // ==========================================

  async calculateRiskExposure(poolId: string) {
    const pool = await this.validatePoolExists(poolId);

    // Calculate total active policy coverage
    const activePolicies = await this.prisma.insurancePolicy.aggregate({
      where: {
        poolId,
        status: 'ACTIVE',
      },
      _sum: {
        coverageAmount: true,
      },
      _count: true,
    });

    const currentExposure = Number(activePolicies._sum.coverageAmount || 0);
    const totalCapital = Number(pool.capital);
    const exposureRatio = totalCapital > 0 ? currentExposure / totalCapital : 0;

    // Determine risk level
    const riskLevel = this.determineRiskLevel(exposureRatio, pool);

    // Update pool exposure
    await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        currentExposure,
        riskLevel,
      },
    });

    return {
      poolId,
      currentExposure,
      maxExposureLimit: pool.maxExposureLimit ? Number(pool.maxExposureLimit) : null,
      exposureRatio,
      riskLevel,
      activePolicyCount: activePolicies._count,
      totalCapital,
    };
  }

  async checkExposureLimits(poolId: string) {
    const pool = await this.validatePoolExists(poolId);
    const exposure = await this.calculateRiskExposure(poolId);

    const warnings = [];

    if (pool.maxExposureLimit) {
      const maxLimit = Number(pool.maxExposureLimit);
      if (exposure.currentExposure > maxLimit) {
        warnings.push({
          type: 'EXPOSURE_LIMIT_EXCEEDED',
          message: `Current exposure ${exposure.currentExposure} exceeds limit ${maxLimit}`,
          severity: 'CRITICAL',
        });

        await this.createPoolAlert(poolId, 'EXPOSURE_LIMIT_REACHED', 'CRITICAL', warnings[0].message);
      } else if (exposure.currentExposure > maxLimit * 0.9) {
        warnings.push({
          type: 'EXPOSURE_LIMIT_WARNING',
          message: `Current exposure is ${((exposure.currentExposure / maxLimit) * 100).toFixed(1)}% of limit`,
          severity: 'WARNING',
        });

        await this.createPoolAlert(poolId, 'EXPOSURE_LIMIT_REACHED', 'WARNING', warnings[0].message);
      }
    }

    return {
      poolId,
      exposure,
      warnings,
      isWithinLimits: warnings.length === 0,
    };
  }

  // ==========================================
  // POOL REBALANCING
  // ==========================================

  async rebalancePool(poolId: string, reason?: string) {
    const pool = await this.validatePoolExists(poolId);

    if (pool.isRebalancing) {
      throw new BadRequestException('Pool is already being rebalanced');
    }

    this.logger.log(`Starting pool rebalance: ${poolId}`);

    // Mark pool as rebalancing
    await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: { isRebalancing: true },
    });

    try {
      const previousState = await this.capturePoolState(poolId);
      const actions = [];

      // Check if rebalancing is needed
      const healthScore = await this.calculateHealthScore(poolId);
      const exposure = await this.calculateRiskExposure(poolId);
      const utilization = Number(pool.lockedCapital) / Number(pool.capital);

      // Action 1: If utilization is too high, flag for additional capital
      if (utilization > Number(pool.utilizationThreshold)) {
        actions.push({
          action: 'CAPITAL_INCREASE_RECOMMENDED',
          reason: `Utilization ${utilization.toFixed(2)} exceeds threshold ${pool.utilizationThreshold}`,
          suggestedAmount: Number(pool.capital) * 0.2, // Suggest 20% increase
        });
      }

      // Action 2: If exposure is too high, reduce new policy acceptance
      if (exposure.exposureRatio > 3.0) {
        actions.push({
          action: 'REDUCE_EXPOSURE',
          reason: `Exposure ratio ${exposure.exposureRatio.toFixed(2)} is too high`,
          recommendation: 'Pause new policy issuance or increase capital',
        });
      }

      // Action 3: If health score is low, trigger review
      if (healthScore < 60) {
        actions.push({
          action: 'HEALTH_REVIEW_REQUIRED',
          reason: `Health score ${healthScore} is below acceptable threshold`,
          recommendation: 'Conduct comprehensive pool review',
        });
      }

      const newState = await this.capturePoolState(poolId);

      // Record rebalance history
      await this.prisma.poolRebalanceHistory.create({
        data: {
          poolId,
          reason: reason || 'Automated rebalancing',
          actionsTaken: actions,
          previousState,
          newState,
        },
      });

      // Update pool
      const updatedPool = await this.prisma.insurancePool.update({
        where: { id: poolId },
        data: {
          isRebalancing: false,
          lastRebalanceAt: new Date(),
          healthScore,
        },
      });

      this.logger.log(`Pool rebalance completed: ${poolId}`);

      return {
        pool: updatedPool,
        actions,
        previousState,
        newState,
      };
    } catch (error) {
      // Reset rebalancing flag on error
      await this.prisma.insurancePool.update({
        where: { id: poolId },
        data: { isRebalancing: false },
      });

      throw error;
    }
  }

  async getRebalanceHistory(poolId: string) {
    const history = await this.prisma.poolRebalanceHistory.findMany({
      where: { poolId },
      orderBy: { executedAt: 'desc' },
      take: 20,
    });

    return history;
  }

  // ==========================================
  // PROFIT/LOSS DISTRIBUTION
  // ==========================================

  async calculateProfitLoss(poolId: string, timeRange?: { start: Date; end: Date }) {
    const pool = await this.validatePoolExists(poolId);

    const whereClause: any = { poolId };
    if (timeRange) {
      whereClause.createdAt = {
        gte: timeRange.start,
        lte: timeRange.end,
      };
    }

    // Get total premiums
    const premiumAggregate = await this.prisma.insurancePolicy.aggregate({
      where: whereClause,
      _sum: { premium: true },
      _count: true,
    });

    // Get total payouts
    const payoutAggregate = await this.prisma.claim.aggregate({
      where: {
        poolId,
        status: 'PAID',
        ...(timeRange && {
          paidAt: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        }),
      },
      _sum: { payoutAmount: true },
      _count: true,
    });

    const totalPremiums = Number(premiumAggregate._sum.premium || 0);
    const totalPayouts = Number(payoutAggregate._sum.payoutAmount || 0);
    const profitLoss = totalPremiums - totalPayouts;
    const profitMargin = totalPremiums > 0 ? (profitLoss / totalPremiums) * 100 : 0;
    const claimRate = premiumAggregate._count > 0
      ? (payoutAggregate._count / premiumAggregate._count) * 100
      : 0;

    // Update pool totals
    await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        totalPremiums: totalPremiums,
        totalPayouts: totalPayouts,
      },
    });

    return {
      poolId,
      totalPremiums,
      totalPayouts,
      profitLoss,
      profitMargin,
      claimRate,
      policyCount: premiumAggregate._count,
      paidClaimCount: payoutAggregate._count,
    };
  }

  async distributeProfits(poolId: string, distributionStrategy: 'proportional' | 'equal') {
    // This would integrate with staking/rewards system
    // For now, return calculation
    const pnl = await this.calculateProfitLoss(poolId);

    if (pnl.profitLoss <= 0) {
      throw new BadRequestException('No profits to distribute');
    }

    // Get all capital contributors (simplified - would need actual contributor tracking)
    const distribution = {
      poolId,
      totalProfit: pnl.profitLoss,
      strategy: distributionStrategy,
      distributedAmount: pnl.profitLoss * 0.7, // Distribute 70%, keep 30% as reserve
      reserveAmount: pnl.profitLoss * 0.3,
      timestamp: new Date(),
    };

    this.logger.log(`Profit distribution calculated for pool ${poolId}: ${distribution.distributedAmount}`);

    return distribution;
  }

  // ==========================================
  // HEALTH MONITORING & ALERTS
  // ==========================================

  async checkPoolHealth(poolId: string): Promise<PoolHealthResponse> {
    const pool = await this.validatePoolExists(poolId);

    // Calculate health score
    const healthScore = await this.recalculateHealthScore(poolId);

    // Get metrics
    const liquidity = await this.getLiquidityMetrics(poolId);
    const exposure = await this.calculateRiskExposure(poolId);
    const pnl = await this.calculateProfitLoss(poolId);

    // Get active alerts
    const alerts = await this.prisma.poolAlert.findMany({
      where: {
        poolId,
        isResolved: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Get counts
    const activePolicies = await this.prisma.insurancePolicy.count({
      where: { poolId, status: 'ACTIVE' },
    });

    const pendingClaims = await this.prisma.claim.count({
      where: { poolId, status: { in: ['PENDING', 'REVIEWING'] } },
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(pool, healthScore, liquidity, exposure, pnl);

    // Update last health check
    await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: { lastHealthCheckAt: new Date() },
    });

    return {
      poolId: pool.id,
      poolName: pool.name,
      healthScore,
      riskLevel: pool.riskLevel,
      liquidityRatio: liquidity.liquidityRatio,
      utilizationRate: liquidity.utilizationRate,
      exposureRatio: exposure.exposureRatio,
      totalCapital: liquidity.totalCapital,
      availableCapital: liquidity.availableCapital,
      lockedCapital: liquidity.lockedCapital,
      totalPayouts: pnl.totalPayouts,
      totalPremiums: pnl.totalPremiums,
      profitLoss: pnl.profitLoss,
      activePolicies,
      pendingClaims,
      alerts: alerts.map(a => ({
        id: a.id,
        alertType: a.alertType,
        severity: a.severity,
        message: a.message,
        isResolved: a.isResolved,
        createdAt: a.createdAt,
      })),
      recommendations,
    };
  }

  async recalculateHealthScore(poolId: string): Promise<number> {
    const score = await this.calculateHealthScore(poolId);

    await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: { healthScore: score },
    });

    // Alert if health score drops significantly
    if (score < 50) {
      await this.createPoolAlert(
        poolId,
        'HEALTH_SCORE_DROP',
        score < 30 ? 'CRITICAL' : 'WARNING',
        `Pool health score dropped to ${score}`,
      );
    }

    return score;
  }

  async createPoolAlert(
    poolId: string,
    alertType: string,
    severity: string,
    message: string,
    metadata?: any,
  ) {
    const alert = await this.prisma.poolAlert.create({
      data: {
        poolId,
        alertType: alertType as any,
        severity: severity as any,
        message,
        metadata,
      },
    });

    this.logger.warn(`Pool alert created: ${alertType} - ${message}`);

    return alert;
  }

  async resolveAlert(alertId: string) {
    const alert = await this.prisma.poolAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    return alert;
  }

  async getPoolAlerts(poolId: string, includeResolved: boolean = false) {
    return this.prisma.poolAlert.findMany({
      where: {
        poolId,
        ...(includeResolved ? {} : { isResolved: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async validatePoolExists(poolId: string) {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${poolId} not found`);
    }

    return pool;
  }

  private determineRiskLevel(exposureRatio: number, pool: any): string {
    if (exposureRatio > 5.0) return 'CRITICAL';
    if (exposureRatio > 3.0) return 'HIGH';
    if (exposureRatio > 1.5) return 'MEDIUM';
    return 'LOW';
  }

  private async calculateHealthScore(poolId: string): Promise<number> {
    const pool = await this.validatePoolExists(poolId);

    let score = 100;

    // Factor 1: Liquidity ratio (30% weight)
    const totalCapital = Number(pool.capital);
    const lockedCapital = Number(pool.lockedCapital);
    const liquidityRatio = totalCapital > 0 ? (totalCapital - lockedCapital) / totalCapital : 0;

    if (liquidityRatio < 0.1) score -= 30;
    else if (liquidityRatio < 0.2) score -= 20;
    else if (liquidityRatio < 0.3) score -= 10;

    // Factor 2: Exposure ratio (25% weight)
    const activePolicies = await this.prisma.insurancePolicy.aggregate({
      where: { poolId, status: 'ACTIVE' },
      _sum: { coverageAmount: true },
    });

    const currentExposure = Number(activePolicies._sum.coverageAmount || 0);
    const exposureRatio = totalCapital > 0 ? currentExposure / totalCapital : 0;

    if (exposureRatio > 5.0) score -= 25;
    else if (exposureRatio > 3.0) score -= 15;
    else if (exposureRatio > 2.0) score -= 5;

    // Factor 3: Profit/Loss ratio (25% weight)
    const pnl = await this.calculateProfitLoss(poolId);
    if (pnl.totalPremiums > 0) {
      const lossRatio = pnl.totalPayouts / pnl.totalPremiums;
      if (lossRatio > 1.0) score -= 25;
      else if (lossRatio > 0.8) score -= 15;
      else if (lossRatio > 0.6) score -= 5;
    }

    // Factor 4: Pending claims (20% weight)
    const pendingClaims = await this.prisma.claim.count({
      where: { poolId, status: { in: ['PENDING', 'REVIEWING'] } },
    });

    if (pendingClaims > 20) score -= 20;
    else if (pendingClaims > 10) score -= 10;
    else if (pendingClaims > 5) score -= 5;

    return Math.max(0, Math.min(100, score));
  }

  private async capturePoolState(poolId: string) {
    const pool = await this.validatePoolExists(poolId);
    const exposure = await this.calculateRiskExposure(poolId);
    const liquidity = await this.getLiquidityMetrics(poolId);
    const pnl = await this.calculateProfitLoss(poolId);

    return {
      pool: {
        capital: Number(pool.capital),
        lockedCapital: Number(pool.lockedCapital),
        healthScore: pool.healthScore,
        riskLevel: pool.riskLevel,
      },
      exposure,
      liquidity,
      pnl,
      timestamp: new Date(),
    };
  }

  private generateRecommendations(
    pool: any,
    healthScore: number,
    liquidity: any,
    exposure: any,
    pnl: any,
  ): string[] {
    const recommendations = [];

    if (liquidity.liquidityRatio < 0.2) {
      recommendations.push('CRITICAL: Pool liquidity is very low. Consider adding capital immediately.');
    } else if (liquidity.liquidityRatio < 0.3) {
      recommendations.push('WARNING: Pool liquidity is low. Plan capital injection soon.');
    }

    if (exposure.exposureRatio > 3.0) {
      recommendations.push('HIGH EXPOSURE: Reduce risk exposure or increase capital base.');
    }

    if (pnl.profitMargin < 0) {
      recommendations.push('NEGATIVE MARGIN: Review pricing strategy and claim assessment.');
    } else if (pnl.profitMargin < 10) {
      recommendations.push('LOW MARGIN: Consider adjusting premium rates.');
    }

    if (healthScore < 60) {
      recommendations.push('POOL REVIEW: Comprehensive pool review recommended due to low health score.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Pool is operating within normal parameters.');
    }

    return recommendations;
  }
}
