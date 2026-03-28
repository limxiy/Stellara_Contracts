import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { NetworkCongestionPredictionDto } from './dto/predictive-settlement.dto';

/**
 * NetworkCongestionService
 *
 * Collects Stellar network metrics every minute and generates 5/10/15-minute
 * ahead congestion and fee forecasts using Exponential Weighted Moving Average
 * (EWMA) with trend detection (Holt's double-exponential smoothing).
 *
 * Forecast horizon: 5–15 minutes
 * Congestion score: 0.0 (idle) – 1.0 (fully saturated)
 */
@Injectable()
export class NetworkCongestionService implements OnModuleInit {
  private readonly logger = new Logger(NetworkCongestionService.name);

  // EWMA state — level S and trend T per field
  private emaState: {
    congestion: { level: number; trend: number };
    baseFee: { level: number; trend: number };
    priorityFee: { level: number; trend: number };
    txVolume: { level: number; trend: number };
  } | null = null;

  // Holt's smoothing parameters
  private readonly alpha = 0.3; // level smoothing
  private readonly beta = 0.1; // trend smoothing

  // Rolling window for percentile calculation (last 200 data points ~ 3.3 hours)
  private readonly feeHistory: number[] = [];
  private readonly HISTORY_WINDOW = 200;

  // Baseline values used when real Horizon data is unavailable (simulation mode)
  private readonly BASELINE_BASE_FEE = 100; // stroops
  private readonly BASELINE_TX_VOLUME = 150;
  private readonly BASELINE_CLOSE_TIME_MS = 5000;

  private readonly simulationMode: boolean;
  private tickCount = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.simulationMode =
      this.configService.get<string>('TX_QUEUE_SIMULATION_MODE', 'true') === 'true';
  }

  async onModuleInit() {
    this.logger.log('NetworkCongestionService initialised');
    // Seed EMA from the most recent snapshots stored in DB
    await this.seedEmaFromHistory();
  }

  // ─── Periodic metric collection ─────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async collectAndForecast(): Promise<void> {
    try {
      const raw = await this.fetchNetworkMetrics();
      const congestionScore = this.computeCongestionScore(raw);

      this.updateEma(congestionScore, raw.baseFeeStroops, raw.priorityFeeStroops, raw.txVolume);
      this.addToFeeHistory(raw.baseFeeStroops + raw.priorityFeeStroops);

      const forecast = this.forecastAhead([5, 10, 15]);
      const p95 = this.computePercentile(95);

      await (this.prisma as any).networkCongestionSnapshot.create({
        data: {
          network: raw.network,
          ledgerSeq: raw.ledgerSeq,
          baseFeeStroops: raw.baseFeeStroops,
          priorityFeeStroops: raw.priorityFeeStroops,
          txVolumePerLedger: raw.txVolume,
          ledgerCloseTimeMs: raw.closeTimeMs,
          congestionScore,
          predictedScoreP5m: forecast[5].congestion,
          predictedScoreP10m: forecast[10].congestion,
          predictedScoreP15m: forecast[15].congestion,
          predictedFeeP5m: forecast[5].fee,
          predictedFeeP10m: forecast[10].fee,
          predictedFeeP15m: forecast[15].fee,
          p95FeeThreshold: p95,
        },
      });

      this.tickCount++;
      if (this.tickCount % 10 === 0) {
        this.logger.debug(
          `Congestion=${congestionScore.toFixed(3)} BaseFee=${raw.baseFeeStroops} P95=${p95} ForecastP15m=${forecast[15].fee}`,
        );
      }
    } catch (err) {
      this.logger.warn(`collectAndForecast error: ${(err as Error).message}`);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getLatestPrediction(): Promise<NetworkCongestionPredictionDto> {
    const latest = await (this.prisma as any).networkCongestionSnapshot.findFirst({
      orderBy: { recordedAt: 'desc' },
    });

    if (!latest) {
      // Return a safe default when no data has been collected yet
      return this.buildDefaultPrediction();
    }

    const forecast = [
      { minutes: 5, congestionScore: latest.predictedScoreP5m ?? latest.congestionScore, baseFeeStroops: latest.predictedFeeP5m ?? latest.baseFeeStroops },
      { minutes: 10, congestionScore: latest.predictedScoreP10m ?? latest.congestionScore, baseFeeStroops: latest.predictedFeeP10m ?? latest.baseFeeStroops },
      { minutes: 15, congestionScore: latest.predictedScoreP15m ?? latest.congestionScore, baseFeeStroops: latest.predictedFeeP15m ?? latest.baseFeeStroops },
    ];

    const recommendation = this.deriveRecommendation(forecast, latest.congestionScore);

    return {
      network: latest.network,
      currentCongestionScore: latest.congestionScore,
      currentBaseFeeStroops: latest.baseFeeStroops,
      currentPriorityFeeStroops: latest.priorityFeeStroops,
      predictedAt: latest.recordedAt,
      forecast,
      p95FeeThreshold: latest.p95FeeThreshold ?? this.BASELINE_BASE_FEE * 5,
      recommendation: recommendation.action,
      recommendationReason: recommendation.reason,
    };
  }

  async getP95FeeThreshold(): Promise<number> {
    const recent = await (this.prisma as any).networkCongestionSnapshot.findFirst({
      orderBy: { recordedAt: 'desc' },
      select: { p95FeeThreshold: true },
    });
    return recent?.p95FeeThreshold ?? this.BASELINE_BASE_FEE * 5;
  }

  async getCurrentCongestionScore(): Promise<number> {
    const recent = await (this.prisma as any).networkCongestionSnapshot.findFirst({
      orderBy: { recordedAt: 'desc' },
      select: { congestionScore: true },
    });
    return recent?.congestionScore ?? 0.0;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private async fetchNetworkMetrics(): Promise<{
    network: string;
    ledgerSeq: number | null;
    baseFeeStroops: number;
    priorityFeeStroops: number;
    txVolume: number;
    closeTimeMs: number;
  }> {
    if (this.simulationMode) {
      return this.simulateNetworkMetrics();
    }

    try {
      const horizonUrl = this.configService.get<string>('STELLAR_HORIZON_URL', 'https://horizon.stellar.org');
      const response = await fetch(`${horizonUrl}/fee_stats`);
      if (!response.ok) {
        throw new Error(`Horizon fee_stats HTTP ${response.status}`);
      }
      const data = (await response.json()) as Record<string, unknown>;
      const feeCharged = data['fee_charged'] as Record<string, string> | undefined;
      const baseFee = parseInt((data['last_ledger_base_fee'] as string) ?? '100', 10);
      const priorityFee = Math.max(0, parseInt(feeCharged?.['p95'] ?? '100', 10) - baseFee);
      const txCount = parseInt((data['ledger_capacity_usage'] as string) ?? '0', 10);

      return {
        network: this.configService.get<string>('STELLAR_NETWORK', 'mainnet'),
        ledgerSeq: parseInt((data['last_ledger'] as string) ?? '0', 10) || null,
        baseFeeStroops: baseFee,
        priorityFeeStroops: priorityFee,
        txVolume: txCount,
        closeTimeMs: this.BASELINE_CLOSE_TIME_MS,
      };
    } catch {
      return this.simulateNetworkMetrics();
    }
  }

  private simulateNetworkMetrics(): {
    network: string;
    ledgerSeq: number | null;
    baseFeeStroops: number;
    priorityFeeStroops: number;
    txVolume: number;
    closeTimeMs: number;
  } {
    // Simulate realistic intraday patterns with noise
    const hour = new Date().getHours();
    const peakFactor = hour >= 9 && hour <= 17 ? 1.5 + Math.random() * 0.5 : 1.0;
    const noise = () => (Math.random() - 0.5) * 20;

    const baseFeeStroops = Math.max(
      100,
      Math.round(this.BASELINE_BASE_FEE * peakFactor + noise()),
    );
    const priorityFeeStroops = Math.max(
      0,
      Math.round(baseFeeStroops * (Math.random() > 0.8 ? 1.2 : 0.1) + noise()),
    );
    const txVolume = Math.max(
      10,
      Math.round(this.BASELINE_TX_VOLUME * peakFactor + noise()),
    );

    return {
      network: 'testnet',
      ledgerSeq: null,
      baseFeeStroops,
      priorityFeeStroops,
      txVolume,
      closeTimeMs: Math.round(this.BASELINE_CLOSE_TIME_MS * (1 + Math.random() * 0.2)),
    };
  }

  private computeCongestionScore(raw: {
    baseFeeStroops: number;
    txVolume: number;
    closeTimeMs: number;
  }): number {
    const feeScore = Math.min(1.0, raw.baseFeeStroops / (this.BASELINE_BASE_FEE * 10));
    const volumeScore = Math.min(1.0, raw.txVolume / 500);
    const latencyScore = Math.min(1.0, raw.closeTimeMs / 15_000);
    return (feeScore * 0.5 + volumeScore * 0.3 + latencyScore * 0.2);
  }

  private updateEma(
    congestion: number,
    baseFee: number,
    priorityFee: number,
    txVolume: number,
  ): void {
    if (!this.emaState) {
      this.emaState = {
        congestion: { level: congestion, trend: 0 },
        baseFee: { level: baseFee, trend: 0 },
        priorityFee: { level: priorityFee, trend: 0 },
        txVolume: { level: txVolume, trend: 0 },
      };
      return;
    }

    const update = (
      prev: { level: number; trend: number },
      value: number,
    ): { level: number; trend: number } => {
      const newLevel = this.alpha * value + (1 - this.alpha) * (prev.level + prev.trend);
      const newTrend = this.beta * (newLevel - prev.level) + (1 - this.beta) * prev.trend;
      return { level: newLevel, trend: newTrend };
    };

    this.emaState.congestion = update(this.emaState.congestion, congestion);
    this.emaState.baseFee = update(this.emaState.baseFee, baseFee);
    this.emaState.priorityFee = update(this.emaState.priorityFee, priorityFee);
    this.emaState.txVolume = update(this.emaState.txVolume, txVolume);
  }

  private forecastAhead(
    minuteHorizons: number[],
  ): Record<number, { congestion: number; fee: number }> {
    const result: Record<number, { congestion: number; fee: number }> = {};

    if (!this.emaState) {
      for (const m of minuteHorizons) {
        result[m] = { congestion: 0.2, fee: this.BASELINE_BASE_FEE };
      }
      return result;
    }

    for (const m of minuteHorizons) {
      // Holt's h-step-ahead forecast: F(t+h) = Level(t) + h * Trend(t)
      const forecastedCongestion = Math.min(
        1.0,
        Math.max(0.0, this.emaState.congestion.level + m * this.emaState.congestion.trend),
      );
      const forecastedFee = Math.max(
        100,
        Math.round(this.emaState.baseFee.level + m * this.emaState.baseFee.trend),
      );
      result[m] = { congestion: forecastedCongestion, fee: forecastedFee };
    }

    return result;
  }

  private addToFeeHistory(totalFee: number): void {
    this.feeHistory.push(totalFee);
    if (this.feeHistory.length > this.HISTORY_WINDOW) {
      this.feeHistory.shift();
    }
  }

  private computePercentile(p: number): number {
    if (this.feeHistory.length === 0) {
      return this.BASELINE_BASE_FEE * 5;
    }
    const sorted = [...this.feeHistory].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  private deriveRecommendation(
    forecast: { minutes: number; congestionScore: number; baseFeeStroops: number }[],
    currentCongestion: number,
  ): { action: 'SUBMIT_NOW' | 'DEFER_5M' | 'DEFER_10M' | 'DEFER_15M'; reason: string } {
    const p5 = forecast.find((f) => f.minutes === 5);
    const p10 = forecast.find((f) => f.minutes === 10);
    const p15 = forecast.find((f) => f.minutes === 15);

    if (!p5 || !p10 || !p15) {
      return { action: 'SUBMIT_NOW', reason: 'Insufficient forecast data' };
    }

    if (currentCongestion <= 0.3) {
      return { action: 'SUBMIT_NOW', reason: 'Network load is low — submit immediately' };
    }

    if (p5.congestionScore < currentCongestion * 0.8) {
      return {
        action: 'DEFER_5M',
        reason: `Congestion expected to drop ${((1 - p5.congestionScore / currentCongestion) * 100).toFixed(0)}% in 5 minutes`,
      };
    }
    if (p10.congestionScore < currentCongestion * 0.75) {
      return {
        action: 'DEFER_10M',
        reason: `Congestion expected to drop ${((1 - p10.congestionScore / currentCongestion) * 100).toFixed(0)}% in 10 minutes`,
      };
    }
    if (p15.congestionScore < currentCongestion * 0.7) {
      return {
        action: 'DEFER_15M',
        reason: `Congestion expected to drop ${((1 - p15.congestionScore / currentCongestion) * 100).toFixed(0)}% in 15 minutes`,
      };
    }

    return { action: 'SUBMIT_NOW', reason: 'No significant improvement forecast — submit now to meet SLAs' };
  }

  private buildDefaultPrediction(): NetworkCongestionPredictionDto {
    return {
      network: 'stellar',
      currentCongestionScore: 0.2,
      currentBaseFeeStroops: this.BASELINE_BASE_FEE,
      currentPriorityFeeStroops: 0,
      predictedAt: new Date(),
      forecast: [
        { minutes: 5, congestionScore: 0.2, baseFeeStroops: this.BASELINE_BASE_FEE },
        { minutes: 10, congestionScore: 0.2, baseFeeStroops: this.BASELINE_BASE_FEE },
        { minutes: 15, congestionScore: 0.2, baseFeeStroops: this.BASELINE_BASE_FEE },
      ],
      p95FeeThreshold: this.BASELINE_BASE_FEE * 5,
      recommendation: 'SUBMIT_NOW',
      recommendationReason: 'No historical data yet — defaulting to submit immediately',
    };
  }

  private async seedEmaFromHistory(): Promise<void> {
    try {
      const recent = await (this.prisma as any).networkCongestionSnapshot.findMany({
        orderBy: { recordedAt: 'desc' },
        take: 10,
        select: {
          congestionScore: true,
          baseFeeStroops: true,
          priorityFeeStroops: true,
          txVolumePerLedger: true,
        },
      });

      if (recent.length === 0) return;

      const avg = (field: keyof typeof recent[0]) =>
        (recent as unknown as Record<string, number>[]).reduce((s, r) => s + (r[field as string] ?? 0), 0) / recent.length;

      this.emaState = {
        congestion: { level: avg('congestionScore'), trend: 0 },
        baseFee: { level: avg('baseFeeStroops'), trend: 0 },
        priorityFee: { level: avg('priorityFeeStroops'), trend: 0 },
        txVolume: { level: avg('txVolumePerLedger'), trend: 0 },
      };

      this.logger.debug(`EMA seeded from ${recent.length} historical snapshots`);
    } catch {
      this.logger.debug('No historical congestion data — EMA will self-initialise');
    }
  }
}
