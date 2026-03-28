import { Injectable, Logger } from '@nestjs/common';
import { UserSegment, ABTestGroup, FeeType, CalculatedFee, FeeMetadata, UserTradingProfile } from '../types/fee.types';

/**
 * Personalized fee offers engine
 * Creates custom fee discounts and offers based on user behavior and value
 * 
 * Acceptance Criteria:
 * - Offer fee discounts to high-value users
 */
@Injectable()
export class PersonalizedFeeOffers {
  private readonly logger = new Logger(PersonalizedFeeOffers.name);

  // Loyalty score thresholds
  private readonly loyaltyThresholds = {
    bronze: 20,
    silver: 40,
    gold: 60,
    platinum: 80,
    diamond: 95,
  };

  // Additional discounts based on loyalty tier
  private readonly loyaltyDiscounts = {
    bronze: 2,
    silver: 5,
    gold: 10,
    platinum: 15,
    diamond: 25,
  };

  /**
   * Calculate user's loyalty score based on trading behavior
   */
  calculateLoyaltyScore(profile: UserTradingProfile): number {
    let score = 0;

    // Volume component (max 30 points)
    const volumeScore = Math.min(
      Number(profile.totalVolume30d / 10_000_000_000n) * 10, // $10k = 10 points
      30,
    );

    // Trade frequency component (max 20 points)
    const frequencyScore = Math.min(profile.tradeCount30d / 10, 20);

    // Maker ratio component (max 20 points) - rewards liquidity providers
    const makerScore = profile.makerRatio * 20;

    // Revenue generated component (max 30 points)
    const revenueScore = Math.min(
      Number(profile.revenueGenerated30d / 1_000_000n) * 5, // $10 = 5 points
      30,
    );

    score = volumeScore + frequencyScore + makerScore + revenueScore;
    
    return Math.round(Math.min(score, 100));
  }

  /**
   * Get loyalty tier based on score
   */
  getLoyaltyTier(loyaltyScore: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' {
    if (loyaltyScore >= this.loyaltyThresholds.diamond) {
      return 'DIAMOND';
    } else if (loyaltyScore >= this.loyaltyThresholds.platinum) {
      return 'PLATINUM';
    } else if (loyaltyScore >= this.loyaltyThresholds.gold) {
      return 'GOLD';
    } else if (loyaltyScore >= this.loyaltyThresholds.silver) {
      return 'SILVER';
    } else {
      return 'BRONZE';
    }
  }

  /**
   * Calculate personalized discount based on user profile
   */
  calculatePersonalizedDiscount(profile: UserTradingProfile): number {
    const loyaltyScore = this.calculateLoyaltyScore(profile);
    const tier = this.getLoyaltyTier(loyaltyScore);

    // Base discount from loyalty tier
    const baseDiscount = this.loyaltyDiscounts[tier];

    // Segment-based discount
    const segmentDiscount = this.getSegmentBaseDiscount(profile.segment);

    // Special offers (e.g., promotional periods, milestones)
    const specialOfferDiscount = this.calculateSpecialOffers(profile);

    // Total discount (capped at 50%)
    const totalDiscount = Math.min(baseDiscount + segmentDiscount + specialOfferDiscount, 50);

    this.logger.debug(
      `User ${profile.userId}: Loyalty ${tier} (${loyaltyScore}), ` +
      `Total discount: ${totalDiscount.toFixed(2)}%`,
    );

    return totalDiscount;
  }

  /**
   * Get segment base discount
   */
  private getSegmentBaseDiscount(segment: UserSegment): number {
    switch (segment) {
      case UserSegment.RETAIL:
        return 0;
      case UserSegment.PROFESSIONAL:
        return 5;
      case UserSegment.INSTITUTIONAL:
        return 10;
      case UserSegment.VIP:
        return 20;
      default:
        return 0;
    }
  }

  /**
   * Calculate special offer discounts
   */
  private calculateSpecialOffers(profile: UserTradingProfile): number {
    let discount = 0;

    // New user bonus (first 7 days)
    // Would check registration date in production
    // if (isNewUser) discount += 5;

    // Milestone bonus (e.g., 100th trade)
    if (profile.tradeCount30d > 0 && profile.tradeCount30d % 100 === 0) {
      discount += 10;
      this.logger.log(`User ${profile.userId} reached trade milestone!`);
    }

    // High-volume trader bonus
    if (profile.totalVolume30d > 1_000_000_000_000n) { // > $1M
      discount += 5;
    }

    // Consistent trader bonus (trades every day for 7+ days)
    // Would track daily activity in production

    return discount;
  }

  /**
   * Generate personalized fee offer for a user
   */
  generateFeeOffer(profile: UserTradingProfile, feeType: FeeType): {
    standardFee: number;
    discountedFee: number;
    savings: number;
    offerDetails: string;
    validUntil: number;
  } {
    const standardFee = this.getStandardFee(feeType, profile.segment);
    const personalizedDiscount = this.calculatePersonalizedDiscount(profile);
    
    const discountedFee = standardFee * (1 - personalizedDiscount / 100);
    const savings = standardFee - discountedFee;

    const tier = this.getLoyaltyTier(this.calculateLoyaltyScore(profile));

    return {
      standardFee,
      discountedFee,
      savings,
      offerDetails: `Exclusive ${personalizedDiscount.toFixed(1)}% discount for ${tier} members`,
      validUntil: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };
  }

  /**
   * Get standard fee for segment
   */
  private getStandardFee(feeType: FeeType, segment: UserSegment): number {
    const baseFees: Record<FeeType, number> = {
      [FeeType.MAKER]: 0.1,
      [FeeType.TAKER]: 0.2,
      [FeeType.WITHDRAWAL]: 0.05,
      [FeeType.DEPOSIT]: 0,
      [FeeType.SERVICE]: 0.1,
    };

    return baseFees[feeType];
  }

  /**
   * Check if user qualifies for special promotion
   */
  qualifiesForPromotion(profile: UserTradingProfile, promotionId: string): boolean {
    // Example promotion criteria
    switch (promotionId) {
      case 'HIGH_VOLUME_BOOST':
        return profile.totalVolume30d > 500_000_000_000n; // > $500k
      
      case 'MAKER_INCENTIVE':
        return profile.makerRatio < 0.3; // Low maker ratio
      
      case 'REACTIVATION':
        return profile.tradeCount30d === 0 && profile.revenueGenerated30d > 0; // Was active before
      
      default:
        return false;
    }
  }

  /**
   * Apply personalized discount to fee calculation
   */
  applyPersonalizedDiscount(baseFee: CalculatedFee, profile: UserTradingProfile): CalculatedFee {
    const personalizedDiscount = this.calculatePersonalizedDiscount(profile);
    
    // Apply discount
    const discountedFee = baseFee.finalFee * (1 - personalizedDiscount / 100);
    
    // Recalculate fee amount
    const estimatedTradeAmount = baseFee.feeAmount > 0n
      ? (baseFee.feeAmount * 10000n) / BigInt(Math.round(baseFee.finalFee * 100))
      : 0n;

    const discountedFeeAmount = (estimatedTradeAmount * BigInt(Math.round(discountedFee * 100))) / 10000n;

    return {
      ...baseFee,
      finalFee: discountedFee,
      feeAmount: discountedFeeAmount,
      metadata: {
        ...baseFee.metadata,
        userSegment: profile.segment,
      },
    };
  }
}
