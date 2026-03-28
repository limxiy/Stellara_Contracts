import { Injectable, Logger } from '@nestjs/common';
import { VolumeTier, UserSegment, FeeType, CalculatedFee, FeeMetadata } from '../types/fee.types';

/**
 * Volume-based tiered pricing service
 * Implements tiered fee structure based on 30-day trading volume
 * 
 * Fee Tiers (Acceptance Criteria):
 * - Maker: 0.02% - 0.1%
 * - Taker: 0.05% - 0.2%
 */
@Injectable()
export class VolumeTierPricingService {
  private readonly logger = new Logger(VolumeTierPricingService.name);

  // Default volume tiers in quote currency smallest unit (e.g., USDT cents)
  private readonly defaultVolumeTiers: VolumeTier[] = [
    { minVolume: 0n, maxVolume: 10_000_000_000n, makerFee: 0.1, takerFee: 0.2 }, // < $10k
    { minVolume: 10_000_000_000n, maxVolume: 50_000_000_000n, makerFee: 0.08, takerFee: 0.16 }, // $10k-$50k
    { minVolume: 50_000_000_000n, maxVolume: 100_000_000_000n, makerFee: 0.06, takerFee: 0.12 }, // $50k-$100k
    { minVolume: 100_000_000_000n, maxVolume: 500_000_000_000n, makerFee: 0.04, takerFee: 0.08 }, // $100k-$500k
    { minVolume: 500_000_000_000n, maxVolume: 1_000_000_000_000n, makerFee: 0.02, takerFee: 0.05 }, // $500k-$1M
    { minVolume: 1_000_000_000_000n, makerFee: 0.02, takerFee: 0.05, discount: 10 }, // > $1M (VIP)
  ];

  // User segment base discounts
  private readonly segmentDiscounts: Record<UserSegment, number> = {
    [UserSegment.RETAIL]: 0,
    [UserSegment.PROFESSIONAL]: 5,
    [UserSegment.INSTITUTIONAL]: 10,
    [UserSegment.VIP]: 20,
  };

  /**
   * Get applicable volume tier for given trading volume
   */
  getVolumeTier(volume30d: bigint, customTiers?: VolumeTier[]): VolumeTier {
    const tiers = customTiers || this.defaultVolumeTiers;
    
    for (const tier of tiers) {
      if (volume30d >= tier.minVolume) {
        if (!tier.maxVolume || volume30d < tier.maxVolume) {
          return tier;
        }
      }
    }

    // Return highest tier if volume exceeds all tiers
    return tiers[tiers.length - 1];
  }

  /**
   * Calculate volume-based fee discount
   * @returns discount percentage (e.g., 10 for 10%)
   */
  calculateVolumeDiscount(volume30d: bigint, customTiers?: VolumeTier[]): number {
    const tier = this.getVolumeTier(volume30d, customTiers);
    return tier.discount || 0;
  }

  /**
   * Get base fee rate based on volume tier and fee type
   */
  getBaseFeeRate(
    volume30d: bigint,
    feeType: FeeType,
    customTiers?: VolumeTier[],
  ): number {
    const tier = this.getVolumeTier(volume30d, customTiers);

    switch (feeType) {
      case FeeType.MAKER:
        return tier.makerFee;
      case FeeType.TAKER:
        return tier.takerFee;
      default:
        return 0;
    }
  }

  /**
   * Get segment-based discount
   */
  getSegmentDiscount(segment: UserSegment): number {
    return this.segmentDiscounts[segment] || 0;
  }

  /**
   * Calculate total fee with volume and segment discounts
   */
  calculateFeeWithDiscounts(params: {
    volume30d: bigint;
    tradeAmount: bigint;
    feeType: FeeType;
    segment: UserSegment;
    customTiers?: VolumeTier[];
  }): CalculatedFee {
    const { volume30d, tradeAmount, feeType, segment, customTiers } = params;

    // Get base fee rate
    const baseFeeRate = this.getBaseFeeRate(volume30d, feeType, customTiers);

    // Calculate volume discount
    const volumeDiscount = this.calculateVolumeDiscount(volume30d, customTiers);

    // Calculate segment discount
    const segmentDiscount = this.getSegmentDiscount(segment);

    // Total discount (additive, capped at 50%)
    const totalDiscount = Math.min(volumeDiscount + segmentDiscount, 50);

    // Apply discount to base fee
    const finalFeeRate = baseFeeRate * (1 - totalDiscount / 100);

    // Calculate actual fee amount
    const feeAmount = (tradeAmount * BigInt(Math.round(finalFeeRate * 100))) / 10000n;

    const metadata: FeeMetadata = {
      volumeTier: this.getTierIndex(volume30d, customTiers),
      userSegment: segment,
    };

    return {
      feeType,
      baseFee: baseFeeRate,
      volumeDiscount,
      segmentDiscount,
      volatilityAdjustment: 0,
      abTestAdjustment: 0,
      finalFee: finalFeeRate,
      feeAmount,
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * Get tier index for given volume
   */
  private getTierIndex(volume30d: bigint, customTiers?: VolumeTier[]): number {
    const tiers = customTiers || this.defaultVolumeTiers;
    const tier = this.getVolumeTier(volume30d, customTiers);
    return tiers.indexOf(tier);
  }

  /**
   * Preview fee for potential trade
   */
  previewFee(params: {
    userId: string;
    volume30d: bigint;
    tradeAmount: bigint;
    feeType: FeeType;
    segment: UserSegment;
    symbol?: string;
  }): { currentFee: CalculatedFee; nextTierBenefit?: { requiredVolume: bigint; savings: bigint } } {
    const currentFee = this.calculateFeeWithDiscounts({
      volume30d: params.volume30d,
      tradeAmount: params.tradeAmount,
      feeType: params.feeType,
      segment: params.segment,
    });

    // Calculate benefit of reaching next tier
    const currentTier = this.getVolumeTier(params.volume30d);
    const nextTierIndex = this.defaultVolumeTiers.indexOf(currentTier) + 1;
    
    if (nextTierIndex < this.defaultVolumeTiers.length) {
      const nextTier = this.defaultVolumeTiers[nextTierIndex];
      const requiredVolume = nextTier.minVolume;
      const remainingVolume = requiredVolume - params.volume30d;

      // Calculate potential savings at next tier
      const nextTierFee = this.calculateFeeWithDiscounts({
        volume30d: requiredVolume,
        tradeAmount: params.tradeAmount,
        feeType: params.feeType,
        segment: params.segment,
      });

      const savings = currentFee.feeAmount - nextTierFee.feeAmount;

      return {
        currentFee,
        nextTierBenefit: {
          requiredVolume: remainingVolume,
          savings: savings > 0n ? savings : 0n,
        },
      };
    }

    return { currentFee };
  }

  /**
   * Get all volume tiers with requirements
   */
  getAllVolumeTiers(): VolumeTier[] {
    return [...this.defaultVolumeTiers];
  }

  /**
   * Update volume tiers dynamically
   */
  updateVolumeTiers(newTiers: VolumeTier[]): void {
    // Validate tiers
    if (!newTiers || newTiers.length === 0) {
      throw new Error('Volume tiers cannot be empty');
    }

    // Validate fee ranges (acceptance criteria)
    for (const tier of newTiers) {
      if (tier.makerFee < 0.02 || tier.makerFee > 0.1) {
        this.logger.warn(`Maker fee ${tier.makerFee}% outside acceptable range (0.02%-0.1%)`);
      }
      if (tier.takerFee < 0.05 || tier.takerFee > 0.2) {
        this.logger.warn(`Taker fee ${tier.takerFee}% outside acceptable range (0.05%-0.2%)`);
      }
    }

    // Sort tiers by minVolume
    this.defaultVolumeTiers.length = 0;
    this.defaultVolumeTiers.push(...newTiers.sort((a, b) => 
      a.minVolume < b.minVolume ? -1 : 1
    ));

    this.logger.log('Volume tiers updated successfully');
  }
}
