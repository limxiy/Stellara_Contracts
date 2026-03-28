import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SlaComplianceDashboardDto } from './dto/predictive-settlement.dto';

/**
 * SlaTrackerService
 *
 * Monitors settled jobs against their SLA deadlines and writes
 * SettlementSlaRecord rows. Provides compliance dashboard data.
 */
@Injectable()
export class SlaTrackerService {
  private readonly logger = new Logger(SlaTrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── SLA record creation ─────────────────────────────────────────────────────

  /**
   * Called when a job transitions to CONFIRMED. Writes the outcome SLA record.
   */
  async recordOutcome(jobId: string): Promise<void> {
    const job = await (this.prisma as any).settlementJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;

    const deadline: Date = job.deadlineAt ?? this.computeDeadline(job.createdAt, job.slaMinutes);
    const confirmedAt: Date = job.confirmedAt ?? new Date();
    const actualMinutes = (confirmedAt.getTime() - job.createdAt.getTime()) / 60_000;
    const slaBreached = confirmedAt > deadline;
    const breachMargin = slaBreached
      ? -((confirmedAt.getTime() - deadline.getTime()) / 60_000)
      : (deadline.getTime() - confirmedAt.getTime()) / 60_000;

    await (this.prisma as any).settlementSlaRecord.upsert({
      where: { settlementJobId: jobId },
      create: {
        settlementJobId: jobId,
        slaMinutes: job.slaMinutes,
        deadlineAt: deadline,
        confirmedAt,
        actualMinutes,
        slaBreached,
        breachMarginMinutes: breachMargin,
        urgency: job.urgency,
      },
      update: {
        confirmedAt,
        actualMinutes,
        slaBreached,
        breachMarginMinutes: breachMargin,
      },
    });

    if (slaBreached) {
      this.logger.warn(
        `SLA BREACH job=${jobId} urgency=${job.urgency} actualMinutes=${actualMinutes.toFixed(1)} sla=${job.slaMinutes}`,
      );
    }
  }

  // ─── Periodic SLA check for overdue jobs ────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async auditPendingJobSlas(): Promise<void> {
    const now = new Date();

    // Find jobs that have passed their deadline but are not yet confirmed/failed
    const overdue = await (this.prisma as any).settlementJob.findMany({
      where: {
        status: { in: ['QUEUED', 'SCHEDULED', 'PROCESSING', 'SUBMITTED'] },
        deadlineAt: { lt: now },
      },
      select: { id: true },
    });

    for (const job of overdue) {
      await (this.prisma as any).settlementSlaRecord.upsert({
        where: { settlementJobId: job.id },
        create: {
          settlementJobId: job.id,
          slaMinutes: 0,
          deadlineAt: now,
          slaBreached: true,
          urgency: 'NORMAL',
        },
        update: { slaBreached: true },
      });
    }

    if (overdue.length > 0) {
      this.logger.warn(`SLA audit: ${overdue.length} overdue jobs found`);
    }
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  async getComplianceDashboard(hours = 24): Promise<SlaComplianceDashboardDto> {
    const since = new Date(Date.now() - hours * 3_600_000);

    const records = await (this.prisma as any).settlementSlaRecord.findMany({
      where: { recordedAt: { gte: since } },
      select: {
        urgency: true,
        slaBreached: true,
        actualMinutes: true,
        slaMinutes: true,
      },
    });

    const total = records.length;
    const breached = records.filter((r: any) => r.slaBreached).length;
    const compliant = total - breached;

    // Per-urgency breakdown
    const urgencies = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    const byUrgency: SlaComplianceDashboardDto['byUrgency'] = {};

    for (const u of urgencies) {
      const group = records.filter((r: any) => r.urgency === u);
      const groupBreached = group.filter((r: any) => r.slaBreached).length;
      const totalMinutes = group
        .filter((r: any) => r.actualMinutes != null)
        .reduce((s: number, r: any) => s + r.actualMinutes, 0);

      byUrgency[u] = {
        total: group.length,
        compliant: group.length - groupBreached,
        breached: groupBreached,
        avgMinutes: group.length > 0 ? totalMinutes / group.length : 0,
      };
    }

    // Settlement time percentiles
    const times = records
      .map((r: any) => r.actualMinutes)
      .filter((v: number | null) => v != null)
      .sort((a: number, b: number) => a - b);

    return {
      period: `${hours}h`,
      totalJobs: total,
      compliantJobs: compliant,
      breachedJobs: breached,
      complianceRate: total > 0 ? (compliant / total) * 100 : 100,
      byUrgency,
      p50SettlementMinutes: this.percentileOf(times, 50),
      p95SettlementMinutes: this.percentileOf(times, 95),
      p99SettlementMinutes: this.percentileOf(times, 99),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private computeDeadline(createdAt: Date, slaMinutes: number): Date {
    return new Date(createdAt.getTime() + slaMinutes * 60_000);
  }

  private percentileOf(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}
