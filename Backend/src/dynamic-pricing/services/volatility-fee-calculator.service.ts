import { Injectable, Logger } from '@nestjs/common';
import { VolatilityData, VolatilityLevel, FeeType, CalculatedFee, FeeMetadata } from '../types/fee.types';

/**
 * Volatility-adjusted risk fee calculator
 * Increases fees during high volatility periods to manage risk
 * 
 * Acceptance Criteria:
 * - Increase fees during high volatility (>5% hourly change)
 */
@Injectable()
export class VolatilityFeeCalculator {
  private readonly logger = new Logger(VolatilityFeeCalculator.name);

  // Volatility thresholds (hourly price change percentage)
  private readonly volatilityThresholds = {
    low: 1.0,      // < 1% hourly change
    medium: 3.0,   // 1-3% hourly change
    high: 5.0,     // 3-5% hourly change
    extreme: 10.0, // > 5% hourly change
  };

  // Fee multipliers based on volatility level
  private readonly feeMultipliers: Record<VolatilityLevel, number> = {
    [VolatilityLevel.LOW]: 1.0,        // No adjustment
    [VolatilityLevel.MEDIUM]: 1.1,     // +10% fee
    [VolatilityLevel.HIGH]: 1.25,      // +25% fee
    [VolatilityLevel.EXTREME]: 1.5,    // +50% fee
  };

  // Cache for volatility data (symbol -> data)
  private volatilityCache = new Map<string, VolatilityData>();

  /**
   * Classify volatility level based on hourly change
   */
  classifyVolatilityLevel(hourlyChange: number): VolatilityLevel {
    const absChange = Math.abs(hourlyChange);

    if (absChange >= this.volatilityThresholds.extreme) {
      return VolatilityLevel.EXTREME;
    } else if (absChange >= this.volatilityThresholds.high) {
      return VolatilityLevel.HIGH;
    } else if (absChange >= this.volatilityThresholds.medium) {
      return VolatilityLevel.MEDIUM;
    } else {
      return VolatilityLevel.LOW;
    }
  }

  /**
   * Calculate volatility index (0-100)
   */
  calculateVolatilityIndex(volatilityData: VolatilityData): number {
    const { hourlyChange, dailyChange, weeklyChange } = volatilityData;

    // Weighted average of different timeframes
    const hourlyWeight = 0.5;
    const dailyWeight = 0.3;
    const weeklyWeight = 0.2;

    const normalizedHourly = Math.min(Math.abs(hourlyChange) / 10, 1) * 100;
    const normalizedDaily = Math.min(Math.abs(dailyChange) / 20, 1) * 100;
    const normalizedWeekly = Math.min(Math.abs(weeklyChange) / 30, 1) * 100;

    const index = 
      normalizedHourly * hourlyWeight +
      normalizedDaily * dailyWeight +
      normalizedWeekly * weeklyWeight;

    return Math.round(index);
  }

  /**
   * Update volatility data for a symbol
   */
  updateVolatilityData(data: VolatilityData): void {
    // Calculate derived fields
    const level = this.classifyVolatilityLevel(data.hourlyChange);
    const volatilityIndex = this.calculateVolatilityIndex(data);

    const enrichedData: VolatilityData = {
      ...data,
      level,
      volatilityIndex,
    };

    this.volatilityCache.set(data.symbol, enrichedData);
    
    if (level === VolatilityLevel.HIGH || level === VolatilityLevel.EXTREME) {
      this.logger.warn(
        `High volatility detected for ${data.symbol}: ${data.hourlyChange.toFixed(2)}% (Level: ${level})`,
      );
    }
  }

  /**
   * Get current volatility data for a symbol
   */
  getVolatilityData(symbol: string): VolatilityData | null {
    return this.volatilityCache.get(symbol) || null;
  }

  /**
   * Calculate volatility adjustment factor
   */
  getVolatilityMultiplier(symbol: string): number {
    const data = this.getVolatilityData(symbol);
    
    if (!data) {
      return 1.0; // Default: no adjustment
    }

    return this.feeMultipliers[data.level];
  }

  /**
   * Apply volatility adjustment to fee calculation
   */
  applyVolatilityAdjustment(params: {
    baseFee: CalculatedFee;
    symbol: string;
  }): CalculatedFee {
    const { baseFee, symbol } = params;
    const multiplier = this.getVolatilityMultiplier(symbol);
    const volatilityData = this.getVolatilityData(symbol);

    // Adjust final fee rate
    const adjustedFeeRate = baseFee.finalFee * multiplier;
    
    // Cap the maximum fee at 0.3% (above max taker fee)
    const cappedFeeRate = Math.min(adjustedFeeRate, 0.3);

    // Calculate adjustment percentage
    const volatilityAdjustment = (multiplier - 1) * 100;

    // Recalculate fee amount with adjusted rate
    // Note: We need the trade amount to recalculate, so we'll estimate
    const estimatedTradeAmount = baseFee.feeAmount > 0n 
      ? (baseFee.feeAmount * 10000n) / BigInt(Math.round(baseFee.finalFee * 100))
      : 0n;

    const adjustedFeeAmount = (estimatedTradeAmount * BigInt(Math.round(cappedFeeRate * 100))) / 10000n;

    return {
      ...baseFee,
      volatilityAdjustment,
      finalFee: cappedFeeRate,
      feeAmount: adjustedFeeAmount,
      metadata: {
        ...baseFee.metadata,
        volatilityLevel: volatilityData?.level,
        riskScore: volatilityData?.volatilityIndex,
      },
    };
  }

  /**
   * Check if fees should be increased due to high volatility
   */
  isHighVolatility(symbol: string): boolean {
    const data = this.getVolatilityData(symbol);
    return data?.level === VolatilityLevel.HIGH || data?.level === VolatilityLevel.EXTREME;
  }

  /**
   * Get volatility-based trading recommendation
   */
  getTradingRecommendation(symbol: string): { 
    action: 'NORMAL' | 'CAUTION' | 'HIGH_RISK'; 
    message: string;
    feeImpact: number;
  } {
    const data = this.getVolatilityData(symbol);
    
    if (!data) {
      return {
        action: 'NORMAL',
        message: 'Normal trading conditions',
        feeImpact: 0,
      };
    }

    const multiplier = this.feeMultipliers[data.level];
    const feeImpact = (multiplier - 1) * 100;

    switch (data.level) {
      case VolatilityLevel.EXTREME:
        return {
          action: 'HIGH_RISK',
          message: `Extreme volatility detected (${data.hourlyChange.toFixed(2)}%). Trading carries high risk.`,
          feeImpact,
        };
      case VolatilityLevel.HIGH:
        return {
          action: 'CAUTION',
          message: `High volatility detected (${data.hourlyChange.toFixed(2)}%). Fees increased to manage risk.`,
          feeImpact,
        };
      default:
        return {
          action: 'NORMAL',
          message: 'Normal market conditions',
          feeImpact: 0,
        };
    }
  }

  /**
   * Clear volatility cache for a symbol
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.volatilityCache.delete(symbol);
    } else {
      this.volatilityCache.clear();
    }
  }

  /**
   * Get all cached volatility data
   */
  getAllVolatilityData(): VolatilityData[] {
    return Array.from(this.volatilityCache.values());
  }
}
