import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { NetworkCongestionService } from './network-congestion.service';
import { GasPriceForecasterService } from './gas-price-forecaster.service';
import { L2IntegrationService } from './l2-integration.service';
import { SlaTrackerService } from './sla-tracker.service';
import {
  EnqueueSettlementDto,
  SettlementUrgencyDto,
  SettlementJobResponseDto,
  CostSavingsDashboardDto,
  QueueSummaryDto,
  L2OffloadResponseDto,
} from './dto/predictive-settlement.dto';
import { createHash } from 'node:crypto';

/**
 * SettlementOptimizerService
 *
 * Central orchestrator for the Predictive Settlement Engine.
 *
 * Responsibilities:
 *  1. Accept settlement job submissions and compute priority / schedule times
 *  2. Classify urgency — URGENT when internal priority ≥ P95 fee threshold
 *  3. Evaluate L2 offload eligibility for non-urgent jobs
 *  4. Process queued jobs in batches: submit urgent jobs immediately,
 *     defer non-urgent jobs to optimal low-congestion windows
 *  5. Track cost savings vs baseline
 *  6. Emit SLA records on confirmation
 */
@Injectable()
export class SettlementOptimizerService {
  private readonly logger = new Logger(SettlementOptimizerService.name);

  private readonly batchSize: number;
  private readonly baselineFeeStroops: number;
  private processingInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly congestionService: NetworkCongestionService,
    private readonly gasForecastService: GasPriceForecasterService,
    private readonly l2Service: L2IntegrationService,
    private readonly slaTracker: SlaTrackerService,
  ) {
    this.batchSize = this.configService.get<number>('SETTLEMENT_BATCH_SIZE', 20);
    this.baselineFeeStroops = this.configService.get<number>('SETTLEMENT_BASELINE_FEE', 500);
  }

  // ─── Enqueue ─────────────────────────────────────────────────────────────────

  async enqueue(dto: EnqueueSettlementDto): Promise<SettlementJobResponseDto> {
    const idempotencyKey = dto.idempotencyKey ?? this.buildIdempotencyKey(dto);

    // Idempotency — return existing job rather than creating duplicate
    const existing = await (this.prisma as any).settlementJob.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return this.toResponseDto(existing);
    }

    const urgency = dto.urgency ?? SettlementUrgencyDto.NORMAL;
    const slaMinutes = dto.slaMinutes ?? this.defaultSlaMinutes(urgency);
    const deadlineAt = dto.deadlineAt
      ? new Date(dto.deadlineAt)
      : new Date(Date.now() + slaMinutes * 60_000);

    const priority = await this.computePriorityScore(urgency, deadlineAt);

    // Determine optimal submission time for non-urgent jobs
    const scheduledAt = await this.computeScheduledTime(urgency, deadlineAt);

    const job = await (this.prisma as any).settlementJob.create({
      data: {
        idempotencyKey,
        settlementType: dto.settlementType,
        signerAddress: dto.signerAddress,
        contractAddress: dto.contractAddress ?? null,
        payload: dto.payload,
        urgency,
        status: 'QUEUED',
        priority,
        deadlineAt,
        slaMinutes,
        scheduledAt,
        metadata: dto.metadata ?? null,
        attempts: 0,
      },
    });

    this.logger.log(
      `Enqueued settlement job=${job.id} type=${dto.settlementType} urgency=${urgency} priority=${priority} scheduledAt=${scheduledAt?.toISOString()}`,
    );

    return this.toResponseDto(job);
  }

  // ─── Queue processor (runs every 30 seconds) ─────────────────────────────────

  @Cron('*/30 * * * * *')
  async processQueue(): Promise<void> {
    if (this.processingInProgress) return;
    this.processingInProgress = true;

    try {
      const now = new Date();
      const congestionScore = await this.congestionService.getCurrentCongestionScore();

      // Fetch jobs that are ready (scheduledAt <= now or URGENT with no schedule)
      const readyJobs = await (this.prisma as any).settlementJob.findMany({
        where: {
          status: 'QUEUED',
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: now } },
            { urgency: { in: ['URGENT', 'HIGH'] } },
          ],
        },
        orderBy: [{ urgency: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        take: this.batchSize,
      });

      for (const job of readyJobs) {
        await this.processJob(job, congestionScore);
      }

      if (readyJobs.length > 0) {
        this.logger.debug(`Queue tick: processed ${readyJobs.length} jobs`);
      }
    } catch (err) {
      this.logger.error(`Queue processing error: ${(err as Error).message}`);
    } finally {
      this.processingInProgress = false;
    }
  }

  // ─── Job processing ──────────────────────────────────────────────────────────

  private async processJob(
    job: Record<string, unknown>,
    congestionScore: number,
  ): Promise<void> {
    const jobId = job.id as string;

    try {
      await (this.prisma as any).settlementJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });

      const urgency = job.urgency as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
      const { feeStroops } = await this.gasForecastService.getRecommendedFee(urgency);

      // Evaluate L2 offload
      const shouldOffload = this.l2Service.shouldOffloadToL2({
        urgency,
        congestionScore,
        l1FeeStroops: feeStroops,
      });

      let txHash: string;
      let feePaid: number;
      let l2Provider: string | null = null;
      let feeSaved = 0;

      if (shouldOffload) {
        const l2Result = await this.l2Service.submitToL2({
          settlementJobId: jobId,
          signerAddress: job.signerAddress as string,
          contractAddress: job.contractAddress as string | undefined,
          payload: job.payload as Record<string, unknown>,
          l1FeeStroops: feeStroops,
        });
        txHash = l2Result.txRef;
        feePaid = l2Result.feePaidStroops;
        l2Provider = l2Result.provider;
        feeSaved = l2Result.estimatedFeeSaved;

        this.logger.log(
          `L2 offload job=${jobId} provider=${l2Provider} feeSaved=${feeSaved} stroops`,
        );
      } else {
        // Simulate L1 submission (replace with real TransactionGatewayService call in production)
        txHash = `sim_settle_${createHash('sha256').update(jobId + Date.now()).digest('hex').slice(0, 32)}`;
        feePaid = feeStroops;
        feeSaved = Math.max(0, this.baselineFeeStroops - feeStroops);
      }

      const now = new Date();

      await (this.prisma as any).settlementJob.update({
        where: { id: jobId },
        data: {
          status: 'CONFIRMED',
          txHash,
          feePaidStroops: feePaid,
          estimatedFeeSaved: feeSaved,
          l2Provider,
          congestionAtSubmit: congestionScore,
          submittedAt: now,
          confirmedAt: now,
        },
      });

      // Record cost saving
      if (feeSaved > 0) {
        const strategy = shouldOffload
          ? 'l2_offload'
          : urgency === 'LOW' || urgency === 'NORMAL'
            ? 'deferred'
            : 'fee_optimization';

        await (this.prisma as any).settlementCostSaving.create({
          data: {
            settlementJobId: jobId,
            feePaidStroops: feePaid,
            baselineFeeStroops: this.baselineFeeStroops,
            savedStroops: feeSaved,
            savedUsd: this.stroopsToUsd(feeSaved),
            strategy,
          },
        });
      }

      // SLA outcome recording
      await this.slaTracker.recordOutcome(jobId);
    } catch (err) {
      this.logger.error(`Failed to process job ${jobId}: ${(err as Error).message}`);

      const jobRecord = await (this.prisma as any).settlementJob.findUnique({
        where: { id: jobId },
        select: { attempts: true, maxAttempts: true },
      });

      const nextStatus =
        (jobRecord?.attempts ?? 0) >= (jobRecord?.maxAttempts ?? 5) ? 'FAILED' : 'QUEUED';

      await (this.prisma as any).settlementJob.update({
        where: { id: jobId },
        data: {
          status: nextStatus,
          failureReason: (err as Error).message,
          scheduledAt: nextStatus === 'QUEUED' ? new Date(Date.now() + 30_000) : null,
        },
      });
    }
  }

  // ─── Query methods ────────────────────────────────────────────────────────────

  async getJobById(id: string): Promise<SettlementJobResponseDto> {
    const job = await (this.prisma as any).settlementJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`Settlement job ${id} not found`);
    return this.toResponseDto(job);
  }

  async getQueueSummary(): Promise<QueueSummaryDto> {
    const [queued, scheduled, processing, urgent, nextBatch] = await Promise.all([
      (this.prisma as any).settlementJob.count({ where: { status: 'QUEUED' } }),
      (this.prisma as any).settlementJob.count({ where: { status: 'SCHEDULED' } }),
      (this.prisma as any).settlementJob.count({ where: { status: 'PROCESSING' } }),
      (this.prisma as any).settlementJob.count({
        where: { status: 'QUEUED', urgency: 'URGENT' },
      }),
      (this.prisma as any).settlementJob.findFirst({
        where: { status: 'QUEUED', scheduledAt: { not: null } },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
    ]);

    return {
      queued,
      scheduled,
      processing,
      urgent,
      nextBatchAt: nextBatch?.scheduledAt ?? undefined,
      estimatedThroughputPerMinute: (60 / 30) * this.batchSize, // twice per minute × batch size
    };
  }

  async getCostSavingsDashboard(hours = 24): Promise<CostSavingsDashboardDto> {
    const since = new Date(Date.now() - hours * 3_600_000);

    const savings = await (this.prisma as any).settlementCostSaving.findMany({
      where: { recordedAt: { gte: since } },
      select: { savedStroops: true, savedUsd: true, strategy: true },
    });

    const totalSavedStroops = savings.reduce((s: number, r: any) => s + r.savedStroops, 0);
    const totalSavedUsd = savings.reduce((s: number, r: any) => s + (r.savedUsd ?? 0), 0);

    const savingsByStrategy: CostSavingsDashboardDto['savingsByStrategy'] = {};
    for (const record of savings) {
      const s = record.strategy as string;
      if (!savingsByStrategy[s]) {
        savingsByStrategy[s] = { count: 0, savedStroops: 0 };
      }
      savingsByStrategy[s].count++;
      savingsByStrategy[s].savedStroops += record.savedStroops;
    }

    const totalJobs = await (this.prisma as any).settlementJob.count({
      where: { createdAt: { gte: since } },
    });

    return {
      period: `${hours}h`,
      totalSavedStroops,
      totalSavedUsd: Math.round(totalSavedUsd * 100) / 100,
      totalJobsOptimized: savings.length,
      savingsByStrategy,
      averageSavingPerTx: savings.length > 0 ? totalSavedStroops / savings.length : 0,
      optimizationRate: totalJobs > 0 ? (savings.length / totalJobs) * 100 : 0,
    };
  }

  async evaluateL2Offload(jobId: string): Promise<L2OffloadResponseDto> {
    const job = await (this.prisma as any).settlementJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Settlement job ${jobId} not found`);

    const congestionScore = await this.congestionService.getCurrentCongestionScore();
    const { feeStroops } = await this.gasForecastService.getRecommendedFee(job.urgency);

    const should = this.l2Service.shouldOffloadToL2({
      urgency: job.urgency,
      congestionScore,
      l1FeeStroops: feeStroops,
    });

    if (!should) {
      const reason = job.urgency === 'URGENT' || job.urgency === 'HIGH'
        ? 'High-urgency jobs are always submitted on L1 for fastest finality'
        : congestionScore < 0.6
          ? `Network congestion (${(congestionScore * 100).toFixed(0)}%) is below L2 offload threshold`
          : 'L2 provider not enabled';

      return { jobId, l2Provider: 'none', offloaded: false, reason };
    }

    return {
      jobId,
      l2Provider: this.l2Service.getProviderName(),
      offloaded: true,
      reason: `High congestion (${(congestionScore * 100).toFixed(0)}%) — routing to L2 for cost savings`,
      estimatedFeeSavedStroops: Math.round(feeStroops * 0.9),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async computePriorityScore(
    urgency: string,
    deadlineAt: Date,
  ): Promise<number> {
    const urgencyScore: Record<string, number> = {
      URGENT: 80,
      HIGH: 60,
      NORMAL: 40,
      LOW: 10,
    };

    const base = urgencyScore[urgency] ?? 40;

    // Add deadline urgency: higher score as deadline approaches
    const minutesToDeadline = (deadlineAt.getTime() - Date.now()) / 60_000;
    const deadlinePressure = minutesToDeadline <= 15 ? 20 : minutesToDeadline <= 60 ? 10 : 0;

    // Check if total fee would exceed P95
    const p95 = await this.congestionService.getP95FeeThreshold();
    const feePressure = base >= p95 ? 20 : 0;

    return Math.min(100, base + deadlinePressure + feePressure);
  }

  private async computeScheduledTime(
    urgency: string,
    deadlineAt: Date,
  ): Promise<Date | null> {
    if (urgency === 'URGENT' || urgency === 'HIGH') {
      return null; // Submit immediately
    }

    const deferMinutes = await this.gasForecastService.getOptimalDeferralMinutes();
    if (deferMinutes === 0) {
      return null; // No benefit in deferring
    }

    // Ensure the deferred time doesn't breach the SLA deadline
    const deferredTime = new Date(Date.now() + deferMinutes * 60_000);
    const safetyBufferMs = 5 * 60_000; // 5 min before deadline
    const safeDeadline = new Date(deadlineAt.getTime() - safetyBufferMs);

    return deferredTime < safeDeadline ? deferredTime : null;
  }

  private defaultSlaMinutes(urgency: string): number {
    const defaults: Record<string, number> = {
      URGENT: 5,
      HIGH: 15,
      NORMAL: 60,
      LOW: 240,
    };
    return defaults[urgency] ?? 60;
  }

  private buildIdempotencyKey(dto: EnqueueSettlementDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          type: dto.settlementType,
          signer: dto.signerAddress,
          contract: dto.contractAddress,
          payload: dto.payload,
        }),
      )
      .digest('hex');
  }

  private stroopsToUsd(stroops: number): number {
    // 1 XLM = 10_000_000 stroops; approximate price $0.10/ XLM
    const xlm = stroops / 10_000_000;
    return xlm * 0.1;
  }

  private toResponseDto(job: Record<string, unknown>): SettlementJobResponseDto {
    return {
      id: job.id as string,
      idempotencyKey: job.idempotencyKey as string,
      settlementType: job.settlementType as string,
      urgency: job.urgency as string,
      status: job.status as string,
      priority: job.priority as number,
      deadlineAt: job.deadlineAt as Date | undefined,
      slaMinutes: job.slaMinutes as number,
      scheduledAt: job.scheduledAt as Date | undefined,
      submittedAt: job.submittedAt as Date | undefined,
      confirmedAt: job.confirmedAt as Date | undefined,
      txHash: job.txHash as string | undefined,
      feePaidStroops: job.feePaidStroops as number | undefined,
      estimatedFeeSaved: job.estimatedFeeSaved as number | undefined,
      l2Provider: job.l2Provider as string | undefined,
      createdAt: job.createdAt as Date,
    };
  }
}
