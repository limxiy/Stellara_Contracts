import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export type NotificationType = 'DEADLINE' | 'CONTRIBUTION' | 'MILESTONE' | 'SYSTEM';

interface DeduplicationOptions {
  type: NotificationType;
  projectId?: string;
  contributorId?: string;
  milestoneId?: string;
  milestoneStatus?: string;
  systemEventId?: string;
  windowHours?: number; // Time-based dedup window (default 24h)
}

@Injectable()
export class NotificationDeduplicationService {
  private readonly logger = new Logger(NotificationDeduplicationService.name);
  private readonly DEFAULT_WINDOW_HOURS = 24;

  // Metrics
  private dedupedCount = 0;
  private allowedCount = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a deterministic idempotency key for a notification scenario.
   */
  generateKey(opts: DeduplicationOptions): string {
    switch (opts.type) {
      case 'DEADLINE':
        return `deadline_${opts.projectId}_24h`;
      case 'CONTRIBUTION':
        return `contribution_${opts.projectId}_${opts.contributorId}`;
      case 'MILESTONE':
        return `milestone_${opts.projectId}_${opts.milestoneId}_${opts.milestoneStatus}`;
      case 'SYSTEM':
        return `system_${opts.systemEventId}`;
      default:
        throw new Error(`Unknown notification type: ${opts.type}`);
    }
  }

  /**
   * Returns true if a notification with this key already exists within the time window.
   * Returns false if it's safe to send.
   */
  async isDuplicate(
    opts: DeduplicationOptions,
    adminOverride = false,
  ): Promise<boolean> {
    if (adminOverride) {
      this.logger.warn(`Admin override: bypassing deduplication for type=${opts.type}`);
      return false;
    }

    const key = this.generateKey(opts);
    const windowHours = opts.windowHours ?? this.DEFAULT_WINDOW_HOURS;
    const since = new Date(Date.now() - windowHours * 3600 * 1000);

    const existing = await this.prisma.notification.findFirst({
      where: {
        type: opts.type,
        title: { contains: opts.type },
        createdAt: { gte: since },
      },
      select: { id: true },
    });

    if (existing) {
      this.dedupedCount++;
      this.logger.debug(`Duplicate suppressed: key=${key}`);
      return true;
    }

    this.allowedCount++;
    return false;
  }

  /**
   * Returns the idempotency key to set when creating the notification.
   */
  getKeyForCreation(opts: DeduplicationOptions): string {
    return this.generateKey(opts);
  }

  getMetrics() {
    const total = this.dedupedCount + this.allowedCount;
    return {
      totalChecked: total,
      duplicatesSuppressed: this.dedupedCount,
      allowed: this.allowedCount,
      deduplicationRatePercent:
        total > 0 ? ((this.dedupedCount / total) * 100).toFixed(2) : '0.00',
    };
  }
}