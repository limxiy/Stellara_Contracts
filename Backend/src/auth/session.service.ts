import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { SecurityEventType } from '../../audit/enums/security-event-type.enum';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_CONCURRENT_SESSIONS = 5;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async createSession(userId: string, ip?: string, userAgent?: string): Promise<string> {
    const activeSessions = await this.prisma.session.count({
      where: { userId, terminatedAt: null, expiresAt: { gt: new Date() } },
    });

    if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
      // Terminate oldest session
      const oldest = await this.prisma.session.findFirst({
        where: { userId, terminatedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await this.prisma.session.update({
          where: { id: oldest.id },
          data: { terminatedAt: new Date() },
        });
      }
    }

    const token = randomBytes(32).toString('hex');
    await this.prisma.session.create({
      data: {
        userId,
        token,
        ipAddress: ip,
        userAgent,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.SESSION_CREATED,
      userId,
      description: 'New session created',
      ipAddress: ip,
      userAgent,
      metadata: { concurrentSessions: activeSessions },
    });

    return token;
  }

  async validateSession(token: string): Promise<string> {
    const session = await this.prisma.session.findUnique({ where: { token } });

    if (!session || session.terminatedAt || session.expiresAt < new Date()) {
      await this.auditLog.log({
        eventType: SecurityEventType.SESSION_EXPIRED,
        userId: session?.userId,
        description: 'Session validation failed',
      });
      throw new UnauthorizedException('Session invalid or expired');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return session.userId;
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, terminatedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async terminateSession(sessionId: string, requestingUserId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;
    if (session.userId !== requestingUserId) throw new ForbiddenException('Not your session');
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { terminatedAt: new Date() },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.SESSION_TERMINATED,
      userId: session.userId,
      targetId: sessionId,
      description: 'Session terminated by user',
    });
  }

  async terminateAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, terminatedAt: null },
      data: { terminatedAt: new Date() },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.SESSION_TERMINATED,
      userId,
      description: 'All sessions terminated',
    });
  }

  /** Cleanup expired sessions daily */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpired(): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Cleaned up ${count} expired sessions`);
  }
}
