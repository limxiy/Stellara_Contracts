import { Injectable, Logger } from '@nestjs/common';
import { FeeType, CalculatedFee, UserTradingProfile, VolatilityData } from '../types/fee.types';
import { VolumeTierPricingService } from './volume-tier-pricing.service';
import { VolatilityFeeCalculator } from './volatility-fee-calculator.service';
import { CompetitorPriceMonitor } from './competitor-price-monitor.service';
import { PersonalizedFeeOffers } from './personalized-fee-offers.service';
import { FeeABTestingService } from './fee-ab-testing.service';

/**
 * Dynamic Pricing Manager Service
 * Orchestrates all fee calculation components for real-time pricing
 * 
 * Acceptance Criteria:
 * - Real-time fee calculation at trade time
 * - Fee preview before confirmation
 */
@Injectable()
export class DynamicPricingManagerService {
  private readonly logger = new Logger(DynamicPricingManagerService.name);

  constructor(
    private volumePricing: VolumeTierPricingService,
    private volatilityCalc: VolatilityFeeCalculator,
    private competitorMonitor: CompetitorPriceMonitor,
    private personalizedOffers: PersonalizedFeeOffers,
    private abTesting: FeeABTestingService,
  ) {}

  /**
   * Calculate comprehensive dynamic fee for a trade
   */
  calculateDynamicFee(params: {
    userId: string;
    symbol: string;
    tradeAmount: bigint;
    feeType: FeeType;
    profile: UserTradingProfile;
    volatilityData?: VolatilityData;
    activeTestIds?: string[];
  }): CalculatedFee {
    const { userId, symbol, tradeAmount, feeType, profile, volatilityData, activeTestIds } = params;

    this.logger.debug(`Calculating dynamic fee for user ${userId}, symbol ${symbol}`);

    // Step 1: Base fee from volume tier
    let fee = this.volumePricing.calculateFeeWithDiscounts({
      volume30d: profile.totalVolume30d,
      tradeAmount,
      feeType,
      segment: profile.segment,
    });

    // Step 2: Apply volatility adjustment if data provided
    if (volatilityData) {
      this.volatilityCalc.updateVolatilityData(volatilityData);
      fee = this.volatilityCalc.applyVolatilityAdjustment({
        baseFee: fee,
        symbol,
      });
    }

    // Step 3: Apply personalized discount
    fee = this.personalizedOffers.applyPersonalizedDiscount(fee, profile);

    // Step 4: Apply A/B test adjustments
    if (activeTestIds && activeTestIds.length > 0) {
      for (const testId of activeTestIds) {
        const multiplier = this.abTesting.getFeeMultiplier(userId, testId, feeType);
        const adjustedFeeRate = fee.finalFee * multiplier;
        const adjustedFeeAmount = (tradeAmount * BigInt(Math.round(adjustedFeeRate * 100))) / 10000n;
        
        fee.finalFee = adjustedFeeRate;
        fee.feeAmount = adjustedFeeAmount;
        fee.abTestAdjustment = (multiplier - 1) * 100;
      }
    }

    // Step 5: Check competitor-based adjustment
    const competitorAdjustment = this.competitorMonitor.calculateCompetitorAdjustment(
      fee.finalFee,
      symbol,
      feeType,
    );

    if (competitorAdjustment !== 0) {
      const adjustedFeeRate = fee.finalFee * (1 + competitorAdjustment / 100);
      const adjustedFeeAmount = (tradeAmount * BigInt(Math.round(adjustedFeeRate * 100))) / 10000n;
      
      fee.finalFee = adjustedFeeRate;
      fee.feeAmount = adjustedFeeAmount;
      fee.metadata.competitorAdjustment = competitorAdjustment;
    }

    // Ensure fee is within acceptable bounds
    fee.finalFee = Math.max(0.01, Math.min(fee.finalFee, 0.5)); // Cap between 0.01% and 0.5%

    this.logger.debug(
      `Final fee for ${symbol}: ${fee.finalFee.toFixed(4)}% (${fee.feeAmount.toString()} units)`,
    );

    return fee;
  }

  /**
   * Preview fee before trade execution
   */
  previewFee(params: {
    userId: string;
    symbol: string;
    tradeAmount: bigint;
    feeType: FeeType;
    profile: UserTradingProfile;
  }): {
    estimatedFee: CalculatedFee;
    breakdown: FeeBreakdown;
    nextTierBenefit?: { requiredVolume: bigint; savings: bigint };
    marketContext: MarketContext;
  } {
    const { userId, symbol, tradeAmount, feeType, profile } = params;

    // Calculate estimated fee
    const estimatedFee = this.calculateDynamicFee({
      ...params,
      activeTestIds: [],
    });

    // Get volume tier benefit
    const volumePreview = this.volumePricing.previewFee({
      userId,
      volume30d: profile.totalVolume30d,
      tradeAmount,
      feeType,
      segment: profile.segment,
    });

    // Get market context
    const competitivePosition = this.competitorMonitor.getCompetitivePosition(symbol);
    const volatilityRecommendation = this.volatilityCalc.getTradingRecommendation(symbol);

    const breakdown: FeeBreakdown = {
      baseFee: estimatedFee.baseFee,
      volumeDiscount: estimatedFee.volumeDiscount,
      segmentDiscount: estimatedFee.segmentDiscount,
      loyaltyDiscount: this.personalizedOffers.calculatePersonalizedDiscount(profile),
      volatilityAdjustment: estimatedFee.volatilityAdjustment,
      abTestAdjustment: estimatedFee.abTestAdjustment,
      competitorAdjustment: estimatedFee.metadata.competitorAdjustment || 0,
      finalFee: estimatedFee.finalFee,
    };

    const marketContext: MarketContext = {
      volatilityLevel: volatilityRecommendation.action,
      marketPosition: competitivePosition,
      feeRanking: this.competitorMonitor.isFeeCompetitive(estimatedFee.finalFee, symbol, feeType)
        ? 'COMPETITIVE'
        : 'ABOVE_MARKET',
    };

    return {
      estimatedFee,
      breakdown,
      nextTierBenefit: volumePreview.nextTierBenefit ? {
        requiredVolume: volumePreview.nextTierBenefit.requiredVolume,
        savings: volumePreview.nextTierBenefit.savings,
      } : undefined,
      marketContext,
    };
  }

  /**
   * Get fee analytics for dashboard
   */
  async getFeeAnalytics(params: {
    symbol?: string;
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    // In production, this would query the database
    // For now, return structure
    return {
      totalFeesCollected: 0n,
      avgMakerFee: 0,
      avgTakerFee: 0,
      feeDistribution: {
        byType: {},
        bySegment: {},
        byTier: {},
      },
      revenueGrowth: 0,
      period: params,
    };
  }

  /**
   * Update fee configuration dynamically
   */
  updateFeeConfiguration(config: {
    symbol: string;
    volumeTiers?: any[];
    enableVolatilityAdjustment?: boolean;
    enableCompetitorTracking?: boolean;
  }): void {
    if (config.volumeTiers) {
      this.volumePricing.updateVolumeTiers(config.volumeTiers);
    }

    this.logger.log(`Updated fee configuration for ${config.symbol}`);
  }

  /**
   * Get all active A/B tests for a user
   */
  getActiveTestsForUser(userId: string): string[] {
    const activeTests = this.abTesting.getActiveTests();
    return activeTests.map(test => {
      this.abTesting.assignUserToTest(userId, test.name);
      return test.name;
    });
  }
}

/**
 * Fee breakdown for transparency
 */
export interface FeeBreakdown {
  baseFee: number;
  volumeDiscount: number;
  segmentDiscount: number;
  loyaltyDiscount: number;
  volatilityAdjustment: number;
  abTestAdjustment: number;
  competitorAdjustment: number;
  finalFee: number;
}

/**
 * Market context information
 */
export interface MarketContext {
  volatilityLevel: 'NORMAL' | 'CAUTION' | 'HIGH_RISK';
  marketPosition: {
    makerPosition: string;
    takerPosition: string;
    marketAverage: { maker: number | null; taker: number | null };
  };
  feeRanking: 'COMPETITIVE' | 'ABOVE_MARKET' | 'BELOW_MARKET';
}
