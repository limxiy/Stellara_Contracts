import { Injectable, Logger } from '@nestjs/common';
import { CompetitorFee, FeeType } from '../types/fee.types';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Competitive price monitoring service
 * Monitors competitor fees hourly and adjusts pricing strategy
 * 
 * Acceptance Criteria:
 * - Monitor competitor fees hourly
 */
@Injectable()
export class CompetitorPriceMonitor {
  private readonly logger = new Logger(CompetitorPriceMonitor.name);

  // Cache for competitor fees (symbol -> exchange -> fee)
  private competitorCache = new Map<string, Map<string, CompetitorFee>>();

  // Known competitor exchanges
  private readonly competitors = [
    'binance',
    'coinbase',
    'kraken',
    'okx',
    'bybit',
    'kucoin',
    'huobi',
    'gate.io',
  ];

  // Fee adjustment thresholds
  private readonly adjustmentThreshold = 0.01; // Adjust if we're 1% higher than average

  constructor(private eventEmitter: EventEmitter2) {
    // Start hourly monitoring
    this.startMonitoring();
  }

  /**
   * Start automated hourly monitoring
   */
  private startMonitoring(): void {
    // In production, this would use @nestjs/schedule
    // For now, we'll set up the structure
    setInterval(() => {
      this.logger.log('Running hourly competitor fee check...');
      this.refreshAllCompetitorFees();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Update competitor fee data
   */
  updateCompetitorFee(fee: CompetitorFee): void {
    let exchangeMap = this.competitorCache.get(fee.symbol);
    
    if (!exchangeMap) {
      exchangeMap = new Map<string, CompetitorFee>();
      this.competitorCache.set(fee.symbol, exchangeMap);
    }

    exchangeMap.set(fee.exchange, fee);
    this.logger.debug(`Updated ${fee.exchange} fees for ${fee.symbol}`);
  }

  /**
   * Get competitor fees for a symbol
   */
  getCompetitorFees(symbol: string): CompetitorFee[] {
    const exchangeMap = this.competitorCache.get(symbol);
    if (!exchangeMap) {
      return [];
    }
    return Array.from(exchangeMap.values());
  }

  /**
   * Calculate average competitor fee for a symbol
   */
  getAverageCompetitorFee(symbol: string, feeType: FeeType): number | null {
    const fees = this.getCompetitorFees(symbol);
    
    if (fees.length === 0) {
      return null;
    }

    const sum = fees.reduce((acc, fee) => {
      return acc + (feeType === FeeType.MAKER ? fee.makerFee : fee.takerFee);
    }, 0);

    return sum / fees.length;
  }

  /**
   * Get minimum competitor fee
   */
  getMinimumCompetitorFee(symbol: string, feeType: FeeType): number | null {
    const fees = this.getCompetitorFees(symbol);
    
    if (fees.length === 0) {
      return null;
    }

    return Math.min(
      ...fees.map(fee => feeType === FeeType.MAKER ? fee.makerFee : fee.takerFee)
    );
  }

  /**
   * Get maximum competitor fee
   */
  getMaximumCompetitorFee(symbol: string, feeType: FeeType): number | null {
    const fees = this.getCompetitorFees(symbol);
    
    if (fees.length === 0) {
      return null;
    }

    return Math.max(
      ...fees.map(fee => feeType === FeeType.MAKER ? fee.makerFee : fee.takerFee)
    );
  }

  /**
   * Check if our fees are competitive
   */
  isFeeCompetitive(ourFee: number, symbol: string, feeType: FeeType): boolean {
    const avgCompetitorFee = this.getAverageCompetitorFee(symbol, feeType);
    
    if (!avgCompetitorFee) {
      return true; // No data, assume competitive
    }

    // We're competitive if we're not significantly higher than average
    return ourFee <= avgCompetitorFee * (1 + this.adjustmentThreshold);
  }

  /**
   * Calculate recommended fee adjustment based on competition
   */
  calculateCompetitorAdjustment(
    ourCurrentFee: number,
    symbol: string,
    feeType: FeeType,
  ): number {
    const avgFee = this.getAverageCompetitorFee(symbol, feeType);
    const minFee = this.getMinimumCompetitorFee(symbol, feeType);

    if (!avgFee) {
      return 0; // No adjustment needed
    }

    // If we're significantly above average, suggest reduction
    if (ourCurrentFee > avgFee * (1 + this.adjustmentThreshold)) {
      // Suggest moving closer to average (but not below min)
      const targetFee = Math.max(avgFee, minFee || avgFee);
      const adjustment = ((targetFee - ourCurrentFee) / ourCurrentFee) * 100;
      
      this.logger.log(
        `Recommending fee adjustment for ${symbol} ${feeType}: ` +
        `${adjustment.toFixed(2)}% (current: ${ourCurrentFee}%, target: ${targetFee}%)`,
      );

      return adjustment;
    }

    // If we're significantly below average, could increase
    if (ourCurrentFee < avgFee * 0.9) {
      const targetFee = avgFee * 0.95; // Move to 95% of average
      const adjustment = ((targetFee - ourCurrentFee) / ourCurrentFee) * 100;
      
      return adjustment;
    }

    return 0; // No adjustment needed
  }

  /**
   * Get competitive positioning analysis
   */
  getCompetitivePosition(symbol: string): {
    makerPosition: 'BELOW_MARKET' | 'AT_MARKET' | 'ABOVE_MARKET';
    takerPosition: 'BELOW_MARKET' | 'AT_MARKET' | 'ABOVE_MARKET';
    marketAverage: { maker: number | null; taker: number | null };
    marketRange: { 
      maker: { min: number | null; max: number | null };
      taker: { min: number | null; max: number | null };
    };
  } {
    const avgMaker = this.getAverageCompetitorFee(symbol, FeeType.MAKER);
    const avgTaker = this.getAverageCompetitorFee(symbol, FeeType.TAKER);
    
    const minMaker = this.getMinimumCompetitorFee(symbol, FeeType.MAKER);
    const maxMaker = this.getMaximumCompetitorFee(symbol, FeeType.MAKER);
    const minTaker = this.getMinimumCompetitorFee(symbol, FeeType.TAKER);
    const maxTaker = this.getMaximumCompetitorFee(symbol, FeeType.TAKER);

    return {
      makerPosition: this.determinePosition(avgMaker),
      takerPosition: this.determinePosition(avgTaker),
      marketAverage: { maker: avgMaker, taker: avgTaker },
      marketRange: {
        maker: { min: minMaker, max: maxMaker },
        taker: { min: minTaker, max: maxTaker },
      },
    };
  }

  /**
   * Determine market position based on average fee
   */
  private determinePosition(avgFee: number | null): 'BELOW_MARKET' | 'AT_MARKET' | 'ABOVE_MARKET' {
    if (!avgFee) {
      return 'AT_MARKET';
    }

    // Simple heuristic based on typical fee ranges
    if (avgFee < 0.05) {
      return 'BELOW_MARKET';
    } else if (avgFee > 0.15) {
      return 'ABOVE_MARKET';
    } else {
      return 'AT_MARKET';
    }
  }

  /**
   * Refresh all competitor fees (would call external APIs in production)
   */
  private refreshAllCompetitorFees(): void {
    // In production, this would:
    // 1. Call competitor APIs or scrape websites
    // 2. Parse fee schedules
    // 3. Update cache with fresh data
    
    this.logger.log('Competitor fee monitoring active');
    this.eventEmitter.emit('competitor.fees.updated', {
      timestamp: Date.now(),
      symbolsCount: this.competitorCache.size,
    });
  }

  /**
   * Clear competitor cache for a symbol
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.competitorCache.delete(symbol);
    } else {
      this.competitorCache.clear();
    }
  }

  /**
   * Get all cached competitor data
   */
  getAllCompetitorData(): Record<string, CompetitorFee[]> {
    const result: Record<string, CompetitorFee[]> = {};
    
    for (const [symbol, exchangeMap] of this.competitorCache.entries()) {
      result[symbol] = Array.from(exchangeMap.values());
    }

    return result;
  }
}
