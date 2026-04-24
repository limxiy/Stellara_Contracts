import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { RiskType } from '@prisma/client';
import { PricingBreakdownDto, PoolRiskMetricsDto } from './dto/dynamic-pricing.dto';

export interface PricingConfig {
  baseRates: Record<RiskType, number>;
  trustScoreWeight: number;
  poolUtilizationWeight: number;
  historicalClaimWeight: number;
  maxPremiumRate: number;
  minPremiumRate: number;
  trustScoreThresholds: {
    excellent: number;
    good: number;
    fair: number;
  };
  utilizationThresholds: {
    high: number;
    medium: number;
    low: number;
  };
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  
  private pricingConfig: PricingConfig = {
    baseRates: {
      [RiskType.PROJECT_FAILURE]: 0.05,
      [RiskType.SMART_CONTRACT_EXPLOIT]: 0.08,
      [RiskType.MARKET_VOLATILITY]: 0.03,
      [RiskType.PARAMETRIC_WEATHER]: 0.04,
    },
    trustScoreWeight: 0.15,
    poolUtilizationWeight: 0.20,
    historicalClaimWeight: 0.25,
    maxPremiumRate: 0.25,
    minPremiumRate: 0.01,
    trustScoreThresholds: {
      excellent: 750,
      good: 600,
      fair: 500,
    },
    utilizationThresholds: {
      high: 0.75,
      medium: 0.50,
      low: 0.25,
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate dynamic premium based on multiple risk factors
   */
  async calculateDynamicPremium(
    userId: string,
    poolId: string,
    riskType: RiskType,
    coverageAmount: number,
    customRiskMultiplier?: number,
  ): Promise<PricingBreakdownDto> {
    this.logger.log(`Calculating dynamic premium for user ${userId}, pool ${poolId}`);

    // 1. Calculate base premium
    const basePremium = this.calculateBasePremium(riskType, coverageAmount);

    // 2. Get risk adjustment factor
    const riskAdjustment = await this.calculateRiskAdjustment(
      poolId,
      riskType,
      customRiskMultiplier,
    );

    // 3. Get trust score discount
    const trustScoreDiscount = await this.calculateTrustScoreDiscount(userId);

    // 4. Get pool utilization adjustment
    const poolUtilizationAdjustment = await this.calculatePoolUtilizationAdjustment(poolId);

    // 5. Get historical claim rate adjustment
    const historicalClaimAdjustment = await this.calculateHistoricalClaimAdjustment(poolId, riskType);

    // 6. Calculate final premium with all adjustments
    const finalPremium = this.applyAdjustments(
      basePremium,
      riskAdjustment,
      trustScoreDiscount,
      poolUtilizationAdjustment,
      historicalClaimAdjustment,
    );

    // 7. Calculate effective premium rate
    const premiumRate = finalPremium / coverageAmount;

    // 8. Build breakdown
    const breakdown = this.buildBreakdown({
      basePremium,
      riskAdjustment,
      trustScoreDiscount,
      poolUtilizationAdjustment,
      historicalClaimAdjustment,
      finalPremium,
      premiumRate,
    });

    return {
      basePremium,
      riskAdjustment,
      trustScoreDiscount,
      poolUtilizationAdjustment,
      historicalClaimAdjustment,
      finalPremium,
      premiumRate,
      breakdown,
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  calculatePremium(riskType: RiskType, coverageAmount: number): number {
    return this.calculateBasePremium(riskType, coverageAmount);
  }

  /**
   * Calculate base premium from static rates
   */
  private calculateBasePremium(riskType: RiskType, coverageAmount: number): number {
    const baseRate = this.pricingConfig.baseRates[riskType];
    if (baseRate === undefined) {
      throw new BadRequestException(`Unknown risk type: ${riskType}`);
    }
    return coverageAmount * baseRate;
  }

  /**
   * Calculate risk adjustment based on pool-specific risk factors
   */
  private async calculateRiskAdjustment(
    poolId: string,
    riskType: RiskType,
    customMultiplier?: number,
  ): Promise<number> {
    if (customMultiplier !== undefined) {
      return customMultiplier - 1.0;
    }

    // Get pool-specific risk metrics
    const metrics = await this.getPoolRiskMetrics(poolId, riskType);
    
    // Adjust based on risk type severity
    const riskTypeMultiplier = this.getRiskTypeMultiplier(riskType);
    
    // Combine factors
    const adjustment = (metrics.claimRate * 0.6 + metrics.lossRatio * 0.4) * riskTypeMultiplier;
    
    return Math.max(-0.3, Math.min(0.5, adjustment));
  }

  /**
   * Calculate trust score discount for user
   */
  private async calculateTrustScoreDiscount(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true, reputationScore: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found, using default trust score`);
      return 0;
    }

    const trustScore = user.trustScore || 500;
    const trustThresholds = this.pricingConfig.trustScoreThresholds;

    if (trustScore >= trustThresholds.excellent) {
      return -0.20; // 20% discount for excellent trust
    } else if (trustScore >= trustThresholds.good) {
      return -0.10; // 10% discount for good trust
    } else if (trustScore >= trustThresholds.fair) {
      return -0.05; // 5% discount for fair trust
    } else {
      return 0.10; // 10% surcharge for low trust
    }
  }

  /**
   * Calculate pool utilization adjustment
   */
  private async calculatePoolUtilizationAdjustment(poolId: string): Promise<number> {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      this.logger.warn(`Pool ${poolId} not found, using default utilization`);
      return 0;
    }

    const utilizationRate = pool.capital.toNumber() > 0
      ? pool.lockedCapital.toNumber() / pool.capital.toNumber()
      : 0;

    const utilizationThresholds = this.pricingConfig.utilizationThresholds;

    if (utilizationRate >= utilizationThresholds.high) {
      return 0.25; // 25% surcharge for high utilization
    } else if (utilizationRate >= utilizationThresholds.medium) {
      return 0.10; // 10% surcharge for medium utilization
    } else if (utilizationRate <= utilizationThresholds.low) {
      return -0.05; // 5% discount for low utilization (attract more policies)
    }

    return 0;
  }

  /**
   * Calculate historical claim rate adjustment
   */
  private async calculateHistoricalClaimAdjustment(
    poolId: string,
    riskType: RiskType,
  ): Promise<number> {
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    // Get historical claims for this pool and risk type
    const historicalClaims = await this.prisma.claim.findMany({
      where: {
        poolId,
        policy: {
          riskType,
        },
        createdAt: {
          gte: oneYearAgo,
        },
      },
      select: {
        claimAmount: true,
        status: true,
        payoutAmount: true,
      },
    });

    const totalClaims = historicalClaims.length;
    if (totalClaims === 0) {
      return -0.05; // No claims history = slight discount
    }

    const approvedClaims = historicalClaims.filter(c => c.status === 'APPROVED' || c.status === 'PAID');
    const claimRate = approvedClaims.length / totalClaims;
    
    const totalPayouts = historicalClaims
      .filter(c => c.payoutAmount)
      .reduce((sum, c) => sum + (c.payoutAmount?.toNumber() || 0), 0);

    // Higher payout ratio = higher adjustment
    const payoutRatio = totalPayouts / (totalClaims * 10000); // Normalize
    
    const adjustment = (claimRate * 0.7 + payoutRatio * 0.3) * 0.3;
    
    return Math.max(-0.1, Math.min(0.4, adjustment));
  }

  /**
   * Apply all adjustments to base premium
   */
  private applyAdjustments(
    basePremium: number,
    riskAdjustment: number,
    trustScoreDiscount: number,
    poolUtilizationAdjustment: number,
    historicalClaimAdjustment: number,
  ): number {
    const totalAdjustment = 
      riskAdjustment +
      trustScoreDiscount * this.pricingConfig.trustScoreWeight +
      poolUtilizationAdjustment * this.pricingConfig.poolUtilizationWeight +
      historicalClaimAdjustment * this.pricingConfig.historicalClaimWeight;

    let finalPremium = basePremium * (1 + totalAdjustment);

    // Enforce min/max premium rates
    const minPremium = basePremium * 0.5;
    const maxPremium = basePremium * 2.0;

    finalPremium = Math.max(minPremium, Math.min(maxPremium, finalPremium));

    return Math.round(finalPremium * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get risk type multiplier based on inherent risk
   */
  private getRiskTypeMultiplier(riskType: RiskType): number {
    const multipliers = {
      [RiskType.PROJECT_FAILURE]: 1.0,
      [RiskType.SMART_CONTRACT_EXPLOIT]: 1.5,
      [RiskType.MARKET_VOLATILITY]: 0.8,
      [RiskType.PARAMETRIC_WEATHER]: 1.2,
    };
    return multipliers[riskType] || 1.0;
  }

  /**
   * Get comprehensive pool risk metrics
   */
  async getPoolRiskMetrics(poolId: string, riskType?: RiskType): Promise<PoolRiskMetricsDto> {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
      include: {
        insurancePolicies: true,
        claims: true,
      },
    });

    if (!pool) {
      throw new BadRequestException(`Pool ${poolId} not found`);
    }

    const totalPolicies = pool.insurancePolicies.length;
    const totalClaims = pool.claims.length;
    const claimRate = totalPolicies > 0 ? totalClaims / totalPolicies : 0;

    const totalPayouts = pool.claims
      .filter(c => c.payoutAmount && (c.status === 'PAID' || c.status === 'APPROVED'))
      .reduce((sum, c) => sum + (c.payoutAmount?.toNumber() || 0), 0);

    const totalCapital = pool.capital.toNumber();
    const lossRatio = totalCapital > 0 ? totalPayouts / totalCapital : 0;

    const utilizationRate = totalCapital > 0
      ? pool.lockedCapital.toNumber() / totalCapital
      : 0;

    const averageClaimAmount = totalClaims > 0
      ? pool.claims.reduce((sum, c) => sum + c.claimAmount.toNumber(), 0) / totalClaims
      : 0;

    return {
      poolId,
      totalPolicies,
      totalClaims,
      claimRate,
      totalPayouts,
      lossRatio,
      utilizationRate,
      averageClaimAmount,
    };
  }

  /**
   * Build pricing breakdown for transparency
   */
  private buildBreakdown(data: {
    basePremium: number;
    riskAdjustment: number;
    trustScoreDiscount: number;
    poolUtilizationAdjustment: number;
    historicalClaimAdjustment: number;
    finalPremium: number;
    premiumRate: number;
  }): PricingBreakdownDto['breakdown'] {
    return [
      {
        factor: 'Base Premium',
        impact: data.basePremium,
        description: `Standard rate for selected risk type`,
      },
      {
        factor: 'Risk Adjustment',
        impact: data.basePremium * data.riskAdjustment,
        description: `Pool-specific risk factors (${(data.riskAdjustment * 100).toFixed(1)}%)`,
      },
      {
        factor: 'Trust Score Discount',
        impact: data.basePremium * data.trustScoreDiscount * this.pricingConfig.trustScoreWeight,
        description: `User reputation-based adjustment (${(data.trustScoreDiscount * 100).toFixed(1)}%)`,
      },
      {
        factor: 'Pool Utilization',
        impact: data.basePremium * data.poolUtilizationAdjustment * this.pricingConfig.poolUtilizationWeight,
        description: `Capital availability factor (${(data.poolUtilizationAdjustment * 100).toFixed(1)}%)`,
      },
      {
        factor: 'Historical Claims',
        impact: data.basePremium * data.historicalClaimAdjustment * this.pricingConfig.historicalClaimWeight,
        description: `Past claim performance (${(data.historicalClaimAdjustment * 100).toFixed(1)}%)`,
      },
      {
        factor: 'Final Premium',
        impact: data.finalPremium,
        description: `Total premium after all adjustments (${(data.premiumRate * 100).toFixed(2)}% rate)`,
      },
    ];
  }

  /**
   * Update pricing configuration
   */
  updateConfig(updates: Partial<PricingConfig>): void {
    this.pricingConfig = {
      ...this.pricingConfig,
      ...updates,
    };
    this.logger.log('Pricing configuration updated');
  }

  /**
   * Get current pricing configuration
   */
  getConfig(): PricingConfig {
    return { ...this.pricingConfig };
  }
}
