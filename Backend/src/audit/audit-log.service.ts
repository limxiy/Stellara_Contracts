import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import { AppLogger } from '../common/logger/app.logger';
import {
  SecurityEventType,
  SecurityEventSeverity,
  EventSeverityMap,
} from './enums/security-event-type.enum';
import {
  CreateAuditLogDto,
  AuditLogQueryDto,
  AuditLogStatsDto,
  AuditLogRetentionPolicyDto,
} from './dto/audit-log.dto';

interface FailedLoginTracker {
  count: number;
  firstAttempt: Date;
  lastAttempt: Date;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly failedLogins = new Map<string, FailedLoginTracker>();
  private readonly retentionPolicy: AuditLogRetentionPolicyDto = {
    retentionDays: 90,
    criticalRetentionDays: 365,
    lastCleanupAt: undefined,
    lastCleanupCount: 0,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
    private readonly appLogger: AppLogger,
  ) {}

  /**
   * Create an immutable audit log entry.
   * Severity is auto-derived from event type.
   */
  async log(event: CreateAuditLogDto): Promise<void> {
    const severity = EventSeverityMap[event.eventType] ?? SecurityEventSeverity.INFO;

    try {
      await this.prisma.auditLog.create({
        data: {
          eventType: event.eventType,
          severity,
          userId: event.userId,
          targetId: event.targetId,
          description: event.description,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadata ?? {},
        },
      });

      // Record metrics
      this.metrics.recordError('audit_event', event.eventType);

      // Check for suspicious patterns
      await this.detectThreats(event, severity);
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
      this.appLogger.error('Audit log creation failed', error.stack, AuditLogService.name);
    }
  }

  /**
   * Batch insert audit logs for high-throughput scenarios
   */
  async logBatch(events: CreateAuditLogDto[]): Promise<void> {
    try {
      await this.prisma.auditLog.createMany({
        data: events.map((e) => ({
          eventType: e.eventType,
          severity: EventSeverityMap[e.eventType] ?? SecurityEventSeverity.INFO,
          userId: e.userId,
          targetId: e.targetId,
          description: e.description,
          ipAddress: e.ipAddress,
          userAgent: e.userAgent,
          metadata: e.metadata ?? {},
        })),
        skipDuplicates: false,
      });
    } catch (error) {
      this.logger.error(`Failed to batch create audit logs: ${error.message}`, error.stack);
    }
  }

  /**
   * Query audit logs with filtering, pagination, and sorting
   */
  async query(dto: AuditLogQueryDto) {
    const cacheKey = `audit:query:${JSON.stringify(dto)}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('audit');
      return cached;
    }
    this.metrics.recordCacheMiss('audit');

    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(100, Math.max(1, dto.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortBy = dto.sortBy ?? 'createdAt';
    const sortOrder = dto.sortOrder ?? 'desc';

    const where: Record<string, unknown> = {};

    if (dto.eventType) where.eventType = dto.eventType;
    if (dto.severity) where.severity = dto.severity;
    if (dto.userId) where.userId = dto.userId;
    if (dto.targetId) where.targetId = dto.targetId;
    if (dto.startDate || dto.endDate) {
      where.createdAt = {};
      if (dto.startDate) (where.createdAt as Record<string, Date>).gte = new Date(dto.startDate);
      if (dto.endDate) (where.createdAt as Record<string, Date>).lte = new Date(dto.endDate);
    }
    if (dto.search) {
      where.description = { contains: dto.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const result = {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cache.set(cacheKey, result, 300, ['audit:query']);
    return result;
  }

  /**
   * Get audit log statistics for a time period
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<AuditLogStatsDto> {
    const cacheKey = `audit:stats:${startDate?.toISOString() ?? 'all'}:${endDate?.toISOString() ?? 'all'}`;
    const cached = await this.cache.get<AuditLogStatsDto>(cacheKey);
    if (cached) return cached;

    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [totalEvents, severityAgg, typeAgg, topUsers] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['severity'], where, _count: { severity: true } }),
      this.prisma.auditLog.groupBy({ by: ['eventType'], where, _count: { eventType: true } }),
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ]);

    const eventsBySeverity: Record<string, number> = {};
    for (const s of severityAgg) {
      eventsBySeverity[s.severity] = s._count.severity;
    }

    const eventsByType: Record<string, number> = {};
    for (const t of typeAgg) {
      eventsByType[t.eventType] = t._count.eventType;
    }

    const result: AuditLogStatsDto = {
      totalEvents,
      eventsBySeverity,
      eventsByType,
      topUsers: topUsers.map((u) => ({ userId: u.userId ?? 'unknown', count: u._count.userId })),
      periodStart: startDate?.toISOString() ?? 'all',
      periodEnd: endDate?.toISOString() ?? 'all',
    };

    await this.cache.set(cacheKey, result, 600, ['audit:stats']);
    return result;
  }

  /**
   * Get the current retention policy configuration
   */
  getRetentionPolicy(): AuditLogRetentionPolicyDto {
    return { ...this.retentionPolicy };
  }

  /**
   * Update retention policy
   */
  updateRetentionPolicy(policy: Partial<AuditLogRetentionPolicyDto>): void {
    if (policy.retentionDays !== undefined) this.retentionPolicy.retentionDays = policy.retentionDays;
    if (policy.criticalRetentionDays !== undefined) {
      this.retentionPolicy.criticalRetentionDays = policy.criticalRetentionDays;
    }
  }

  /**
   * Scheduled cleanup of old audit logs based on retention policy.
   * Runs daily at 3 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldLogs(): Promise<void> {
    this.logger.log('Starting audit log cleanup...');

    const now = new Date();
    let totalDeleted = 0;

    // Delete non-critical logs older than retentionDays
    const standardCutoff = new Date(now);
    standardCutoff.setDate(standardCutoff.getDate() - this.retentionPolicy.retentionDays);

    const { count: standardCount } = await this.prisma.auditLog.deleteMany({
      where: {
        severity: { not: SecurityEventSeverity.CRITICAL },
        createdAt: { lt: standardCutoff },
      },
    });
    totalDeleted += standardCount;

    // Delete critical logs older than criticalRetentionDays
    const criticalCutoff = new Date(now);
    criticalCutoff.setDate(criticalCutoff.getDate() - this.retentionPolicy.criticalRetentionDays);

    const { count: criticalCount } = await this.prisma.auditLog.deleteMany({
      where: {
        severity: SecurityEventSeverity.CRITICAL,
        createdAt: { lt: criticalCutoff },
      },
    });
    totalDeleted += criticalCount;

    this.retentionPolicy.lastCleanupAt = now.toISOString();
    this.retentionPolicy.lastCleanupCount = totalDeleted;

    this.logger.log(`Audit log cleanup complete. Deleted ${totalDeleted} records.`);
    this.appLogger.log(`Audit log cleanup: ${totalDeleted} records deleted`, AuditLogService.name);

    // Invalidate caches
    await this.cache.invalidateByTag('audit:query');
    await this.cache.invalidateByTag('audit:stats');
  }

  /**
   * Detect security threats and trigger alerts
   */
  private async detectThreats(
    event: CreateAuditLogDto,
    severity: SecurityEventSeverity,
  ): Promise<void> {
    // Brute force detection: 5 failed logins from same IP in 15 minutes
    if (event.eventType === SecurityEventType.LOGIN_FAILURE && event.ipAddress) {
      const tracker = this.failedLogins.get(event.ipAddress);
      const now = new Date();

      if (tracker) {
        const minutesSinceFirst = (now.getTime() - tracker.firstAttempt.getTime()) / 60000;
        if (minutesSinceFirst > 15) {
          // Reset window
          this.failedLogins.set(event.ipAddress, { count: 1, firstAttempt: now, lastAttempt: now });
        } else {
          tracker.count++;
          tracker.lastAttempt = now;

          if (tracker.count >= 5) {
            this.logger.warn(`Brute force detected from IP: ${event.ipAddress}`);
            await this.log({
              eventType: SecurityEventType.BRUTE_FORCE_ATTEMPT,
              severity: SecurityEventSeverity.CRITICAL,
              ipAddress: event.ipAddress,
              description: `Detected ${tracker.count} failed login attempts in ${Math.round(minutesSinceFirst)} minutes`,
              metadata: { failedAttempts: tracker.count, windowMinutes: Math.round(minutesSinceFirst) },
            });
            this.failedLogins.delete(event.ipAddress);
          }
        }
      } else {
        this.failedLogins.set(event.ipAddress, { count: 1, firstAttempt: now, lastAttempt: now });
      }
    }

    // Clear successful login entries for IP
    if (event.eventType === SecurityEventType.LOGIN_SUCCESS && event.ipAddress) {
      this.failedLogins.delete(event.ipAddress);
    }

    // Alert on critical events
    if (severity === SecurityEventSeverity.CRITICAL) {
      this.appLogger.error(
        `CRITICAL SECURITY EVENT: ${event.eventType}`,
        JSON.stringify(event),
        AuditLogService.name,
      );
    }
  }

  /**
   * Export audit logs for compliance (admin only)
   */
  async exportLogs(format: 'json' | 'csv', startDate?: Date, endDate?: Date): Promise<string> {
    const where: Record<string, unknown> = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    if (format === 'csv') {
      const headers = 'id,eventType,severity,userId,targetId,description,ipAddress,createdAt\n';
      const rows = logs
        .map(
          (l) =>
            `"${l.id}","${l.eventType}","${l.severity}","${l.userId ?? ''}","${l.targetId ?? ''}","${(l.description ?? '').replace(/"/g, '""')}","${l.ipAddress ?? ''}","${l.createdAt.toISOString()}"`,
        )
        .join('\n');
      return headers + rows;
    }

    return JSON.stringify(logs, null, 2);
  }
}
