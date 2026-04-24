import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import * as sgMail from '@sendgrid/mail';
import { EmailService } from '../services/email.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class EmailRetryTask {
  private readonly logger = new Logger(EmailRetryTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly metricsService: MetricsService,
  ) {}

  private getMaxAttempts(): number {
    return this.configService.get<number>('EMAIL_RETRY_MAX_ATTEMPTS', 3);
  }

  private getMaxRetryAgeDays(): number {
    return this.configService.get<number>('EMAIL_RETRY_MAX_AGE_DAYS', 7);
  }

  private getBaseBackoffMs(): number {
    return this.configService.get<number>('EMAIL_RETRY_BASE_BACKOFF_MS', 5 * 60 * 1000);
  }

  private getBatchSize(): number {
    return this.configService.get<number>('EMAIL_RETRY_BATCH_SIZE', 50);
  }

  private getBackoffDelayMs(attempts: number): number {
    return this.getBaseBackoffMs() * 2 ** Math.max(0, attempts);
  }

  private isEligibleByBackoff(updatedAt: Date, attempts: number, nowMs: number): boolean {
    const elapsedMs = nowMs - updatedAt.getTime();
    return elapsedMs >= this.getBackoffDelayMs(attempts);
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown retry error';
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    const startedAtMs = Date.now();
    this.logger.debug('Checking email outbox for failed messages...');

    const maxAttempts = this.getMaxAttempts();
    const maxRetryAgeDays = this.getMaxRetryAgeDays();
    const batchSize = this.getBatchSize();
    const cutoffDate = new Date(startedAtMs - maxRetryAgeDays * 24 * 60 * 60 * 1000);

    const sendGridApiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!sendGridApiKey) {
      this.logger.error('SENDGRID_API_KEY missing, skipping entire retry batch.');
      this.metricsService.recordEmailRetryApiKeyMissing();
      this.metricsService.recordEmailRetryRun('skipped_missing_api_key');
      await this.emailService.checkOutboxAlertThreshold();
      return;
    }

    sgMail.setApiKey(sendGridApiKey);

    const staleCount = await this.prisma.emailOutbox.count({
      where: {
        status: 'FAILED',
        attempts: {
          lt: maxAttempts,
        },
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    if (staleCount > 0) {
      this.logger.warn(
        `Skipping ${staleCount} stale failed emails older than ${maxRetryAgeDays} days.`,
      );
      this.metricsService.recordEmailRetryOldSkip(staleCount);
    }

    const failedEmails = await this.prisma.emailOutbox.findMany({
      where: {
        status: 'FAILED',
        attempts: {
          lt: maxAttempts,
        },
        createdAt: {
          gte: cutoffDate,
        },
      },
      orderBy: {
        updatedAt: 'asc',
      },
      take: batchSize,
    });

    this.metricsService.setEmailRetryBatchSize(failedEmails.length);
    this.metricsService.setEmailRetryPendingFailed(failedEmails.length);

    if (failedEmails.length === 0) {
      this.metricsService.recordEmailRetryRun('no_work');
      this.metricsService.recordEmailRetryDuration((Date.now() - startedAtMs) / 1000);
      await this.emailService.checkOutboxAlertThreshold();
      return;
    }

    for (const email of failedEmails) {
      if (!sendGridApiKey) {
        this.logger.warn('SENDGRID_API_KEY missing during loop iteration. Skipping current email.');
        continue;
      }

      if (!this.isEligibleByBackoff(email.updatedAt, email.attempts, startedAtMs)) {
        this.metricsService.recordEmailRetryBackoffSkip();
        continue;
      }

      try {
        this.logger.log(
          `Retrying email to ${email.to} (attempt ${email.attempts + 1}/${maxAttempts})`,
        );

        await sgMail.send({
          to: email.to,
          from: this.configService.get<string>('SENDGRID_FROM_EMAIL', 'noreply@novafund.xyz'),
          subject: email.subject,
          html: email.html,
        });

        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            status: 'SENT',
            attempts: email.attempts + 1,
            lastError: null,
          },
        });

        this.metricsService.recordEmailRetryProcessed('sent');

        this.logger.log(`Successfully sent retried email to ${email.to}`);
      } catch (error: unknown) {
        const errorMessage = this.extractErrorMessage(error);
        this.logger.error(`Retry failed for email ${email.id}: ${errorMessage}`);

        const nextAttempts = email.attempts + 1;

        await this.prisma.emailOutbox.update({
          where: { id: email.id },
          data: {
            attempts: nextAttempts,
            lastError: errorMessage,
          },
        });

        this.metricsService.recordEmailRetryProcessed(
          nextAttempts >= maxAttempts ? 'max_attempts_reached' : 'failed',
        );
      }
    }

    await this.emailService.checkOutboxAlertThreshold();
    this.metricsService.recordEmailRetryRun('completed');
    this.metricsService.recordEmailRetryDuration((Date.now() - startedAtMs) / 1000);
  }

  async getRetryDashboard() {
    const nowMs = Date.now();
    const maxAttempts = this.getMaxAttempts();
    const maxRetryAgeDays = this.getMaxRetryAgeDays();
    const cutoffDate = new Date(nowMs - maxRetryAgeDays * 24 * 60 * 60 * 1000);

    const [
      pendingRetryable,
      permanentFailures,
      expiredFailures,
      sentFromRetry,
      retryableItems,
    ] = await Promise.all([
      this.prisma.emailOutbox.count({
        where: {
          status: 'FAILED',
          attempts: { lt: maxAttempts },
          createdAt: { gte: cutoffDate },
        },
      }),
      this.prisma.emailOutbox.count({
        where: {
          status: 'FAILED',
          attempts: { gte: maxAttempts },
        },
      }),
      this.prisma.emailOutbox.count({
        where: {
          status: 'FAILED',
          attempts: { lt: maxAttempts },
          createdAt: { lt: cutoffDate },
        },
      }),
      this.prisma.emailOutbox.count({
        where: {
          status: 'SENT',
          attempts: { gt: 0 },
        },
      }),
      this.prisma.emailOutbox.findMany({
        where: {
          status: 'FAILED',
          attempts: { lt: maxAttempts },
          createdAt: { gte: cutoffDate },
        },
        select: {
          attempts: true,
          updatedAt: true,
        },
      }),
    ]);

    let pendingBackoff = 0;
    let nextEligibleInMs: number | null = null;

    for (const item of retryableItems) {
      const delayMs = this.getBackoffDelayMs(item.attempts);
      const elapsedMs = nowMs - item.updatedAt.getTime();

      if (elapsedMs < delayMs) {
        pendingBackoff += 1;
        const waitMs = delayMs - elapsedMs;
        if (nextEligibleInMs === null || waitMs < nextEligibleInMs) {
          nextEligibleInMs = waitMs;
        }
      }
    }

    return {
      timestamp: new Date(nowMs).toISOString(),
      apiKeyConfigured: Boolean(this.configService.get<string>('SENDGRID_API_KEY')),
      config: {
        maxAttempts,
        maxRetryAgeDays,
        baseBackoffMs: this.getBaseBackoffMs(),
        batchSize: this.getBatchSize(),
      },
      counts: {
        pendingRetryable,
        pendingBackoff,
        permanentFailures,
        expiredFailures,
        sentFromRetry,
      },
      nextEligibleInMs,
    };
  }
}
