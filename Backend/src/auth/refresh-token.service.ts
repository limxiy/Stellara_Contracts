import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes, createHmac } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { SecurityEventType } from '../../audit/enums/security-event-type.enum';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 min

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  // In-memory access token store: token -> { userId, expiresAt }
  private readonly accessTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Issue a new access + refresh token pair */
  async issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateToken();
    const refreshToken = this.generateToken();

    this.accessTokens.set(accessToken, { userId, expiresAt: Date.now() + ACCESS_TTL_MS });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.TOKEN_ISSUED,
      userId,
      description: 'New token pair issued',
      metadata: { accessTokenPrefix: accessToken.slice(0, 8) },
    });

    return { accessToken, refreshToken };
  }

  /** Rotate: revoke old refresh token, issue new pair */
  async rotate(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const hashed = this.hash(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { token: hashed } });

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.TOKEN_REFRESHED,
      userId: record.userId,
      description: 'Refresh token rotated',
    });

    return this.issueTokens(record.userId);
  }

  /** Revoke all refresh tokens for a user (logout) */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditLog.log({
      eventType: SecurityEventType.TOKEN_REVOKED,
      userId,
      description: 'All tokens revoked (logout)',
    });

    // Purge in-memory access tokens for user
    for (const [token, data] of this.accessTokens) {
      if (data.userId === userId) this.accessTokens.delete(token);
    }
  }

  /** Validate access token, returns userId */
  validateAccessToken(token: string): string {
    const entry = this.accessTokens.get(token);
    if (!entry || Date.now() > entry.expiresAt) {
      this.accessTokens.delete(token);
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return entry.userId;
  }

  /** Cleanup expired tokens daily */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpired(): Promise<void> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Cleaned up ${count} expired refresh tokens`);
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hash(token: string): string {
    return createHmac('sha256', process.env.JWT_SECRET ?? 'stellara-secret').update(token).digest('hex');
  }
}
