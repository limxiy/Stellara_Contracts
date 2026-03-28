import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { NetworkCongestionService } from './network-congestion.service';

/**
 * GasPriceForecasterService
 *
 * Provides structured fee forecasts derived from the latest congestion snapshot.
 * Exposes helpers used by the settlement optimizer for:
 *   - Optimal fee recommendation for a given urgency
 *   - P95 threshold check (used to identify URGENT settlements)
 *   - Fee trend direction (rising / falling / stable)
 */
@Injectable()
export class GasPriceForecasterService {
  private readonly logger = new Logger(GasPriceForecasterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly congestionService: NetworkCongestionService,
  ) {}

  /**
   * Returns the recommended fee (stroops) to attach to a transaction
   * based on the urgency level.
   *
   * URGENT   → use the P95 threshold (guaranteed fast inclusion)
   * HIGH     → current base fee × 1.5
   * NORMAL   → current base fee × 1.1
   * LOW      → current base fee (minimum)
   */
  async getRecommendedFee(
    urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
  ): Promise<{ feeStroops: number; rationale: string }> {
    const snapshot = await this.getLatestSnapshot();
    if (!snapshot) {
      return { feeStroops: 100, rationale: 'No snapshot data; using minimum base fee' };
    }

    const base = snapshot.baseFeeStroops as number;
    const p95 = (snapshot.p95FeeThreshold as number) ?? base * 5;

    switch (urgency) {
      case 'URGENT':
        return {
          feeStroops: Math.max(p95, base * 2),
          rationale: `P95 threshold (${p95} stroops) — guaranteed fast inclusion`,
        };
      case 'HIGH':
        return {
          feeStroops: Math.round(base * 1.5),
          rationale: `1.5× base fee (${base} stroops) for HIGH priority`,
        };
      case 'NORMAL':
        return {
          feeStroops: Math.round(base * 1.1),
          rationale: `1.1× base fee (${base} stroops) for NORMAL priority`,
        };
      case 'LOW':
      default:
        return {
          feeStroops: base,
          rationale: `Base fee (${base} stroops) — non-urgent transaction`,
        };
    }
  }

  /**
   * Returns the optimal fee for submitting at a specific future minute offset.
   * Uses forecast data from the latest snapshot.
   */
  async getForecastedFeeAt(
    minutesAhead: 5 | 10 | 15,
  ): Promise<{ feeStroops: number; congestionScore: number }> {
    const snapshot = await this.getLatestSnapshot();
    if (!snapshot) {
      return { feeStroops: 100, congestionScore: 0.2 };
    }

    const feeField = `predictedFeeP${minutesAhead}m`;
    const scoreField = `predictedScoreP${minutesAhead}m`;

    return {
      feeStroops: (snapshot[feeField] as number) ?? (snapshot.baseFeeStroops as number),
      congestionScore: (snapshot[scoreField] as number) ?? (snapshot.congestionScore as number),
    };
  }

  /**
   * Checks whether a given total fee exceeds the P95 threshold, marking the
   * transaction as URGENT priority.
   */
  async isAboveP95Threshold(totalFeeStroops: number): Promise<boolean> {
    const p95 = await this.congestionService.getP95FeeThreshold();
    return totalFeeStroops >= p95;
  }

  /**
   * Returns the fee trend: 'RISING', 'FALLING', or 'STABLE'.
   * Used by the optimizer to decide whether to defer or submit immediately.
   */
  async getFeeTrend(): Promise<{
    trend: 'RISING' | 'FALLING' | 'STABLE';
    changePercent: number;
  }> {
    const recent = await (this.prisma as any).networkCongestionSnapshot.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 5,
      select: { baseFeeStroops: true },
    });

    if (recent.length < 2) {
      return { trend: 'STABLE', changePercent: 0 };
    }

    const newest = recent[0].baseFeeStroops as number;
    const oldest = recent[recent.length - 1].baseFeeStroops as number;
    const changePercent = oldest === 0 ? 0 : ((newest - oldest) / oldest) * 100;

    if (changePercent > 10) return { trend: 'RISING', changePercent };
    if (changePercent < -10) return { trend: 'FALLING', changePercent };
    return { trend: 'STABLE', changePercent };
  }

  /**
   * Returns the optimal submission window (minutes to wait) to minimise cost
   * for a non-urgent transaction.
   */
  async getOptimalDeferralMinutes(): Promise<number> {
    const prediction = await this.congestionService.getLatestPrediction();
    switch (prediction.recommendation) {
      case 'DEFER_5M':
        return 5;
      case 'DEFER_10M':
        return 10;
      case 'DEFER_15M':
        return 15;
      default:
        return 0;
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async getLatestSnapshot(): Promise<Record<string, unknown> | null> {
    return (this.prisma as any).networkCongestionSnapshot.findFirst({
      orderBy: { recordedAt: 'desc' },
    });
  }
}
