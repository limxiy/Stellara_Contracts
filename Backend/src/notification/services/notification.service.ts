import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { EmailService } from './email.service';
import { WebPushService } from './web-push.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationsGateway } from '../gateways/notifications.gateway';
import { NotificationsStreamService } from '../streams/notifications-stream.service';

type NotificationPayload = Prisma.InputJsonObject;

interface ChannelDeliveryPayload {
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly dedupWindowMs: number;
  private readonly maxRetryAttempts: number;
  private readonly retryBackoffBaseMs: number;
  private readonly retryMaxAgeMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly webPushService: WebPushService,
    private readonly metricsService: MetricsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly notificationsStream: NotificationsStreamService,
    private readonly configService: ConfigService,
  ) {
    this.dedupWindowMs = this.configService.get<number>('NOTIFICATION_DEDUP_WINDOW_MS', 300000);
    this.maxRetryAttempts = this.configService.get<number>('NOTIFICATION_MAX_RETRY_ATTEMPTS', 3);
    this.retryBackoffBaseMs = this.configService.get<number>('NOTIFICATION_RETRY_BACKOFF_MS', 60000);
    this.retryMaxAgeMinutes = this.configService.get<number>('NOTIFICATION_RETRY_MAX_AGE_MINUTES', 1440);
  }

  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: NotificationPayload,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationSettings: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found for notification`);
      return;
    }

    // Default settings if none exist
    const settings = user.notificationSettings || {
      emailEnabled: true,
      pushEnabled: false,
      notifyContributions: true,
      notifyMilestones: true,
      notifyDeadlines: true,
    };

    // Check specific preferences
    if (type === 'CONTRIBUTION' && !settings.notifyContributions) return;
    if (type === 'MILESTONE' && !settings.notifyMilestones) return;
    if (type === 'DEADLINE' && !settings.notifyDeadlines) return;

    const isDuplicate = await this.isDuplicateNotification(userId, type, title, message);
    if (isDuplicate) {
      this.metricsService.recordNotificationDeduplicated(type);
      this.logger.debug(`Notification deduplicated for user ${userId}: ${type} - ${title}`);
      return;
    }

    // Save notification to history
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data,
      },
    });

    this.notificationsGateway.emitToUser(userId, 'notification.created', {
      id: notification.id,
      type,
      title,
      message,
      data,
      createdAt: notification.createdAt,
    });
    this.notificationsStream.publishToUser(userId, 'notification.created', {
      id: notification.id,
      type,
      title,
      message,
      data,
      createdAt: notification.createdAt,
    });

    // Dispatch via Email
    if (settings.emailEnabled && user.email) {
      await this.dispatchChannel(
        notification.id,
        userId,
        NotificationChannel.EMAIL,
        { title, message, data },
        async () => this.emailService.sendEmail(user.email, title, `<p>${message}</p>`),
      );
    }

    // Dispatch via Web Push
    if (settings.pushEnabled && user.pushSubscription) {
      await this.dispatchChannel(
        notification.id,
        userId,
        NotificationChannel.PUSH,
        { title, message, data },
        async () => this.webPushService.sendNotification(user.pushSubscription as any, {
          title,
          body: message,
          data,
        }),
      );
    }
  }

  async retryOutboxBatch(limit = 50): Promise<{ retried: number; succeeded: number; failed: number }> {
    const now = new Date();
    const maxAgeCutoff = new Date(now.getTime() - this.retryMaxAgeMinutes * 60 * 1000);
    const pending = await this.prisma.notificationOutbox.findMany({
      where: {
        status: { in: [DeliveryStatus.FAILED, DeliveryStatus.PENDING] },
        retryDisabled: false,
        nextRetryAt: { lte: now },
        attempts: { lt: this.maxRetryAttempts },
        createdAt: { gte: maxAgeCutoff },
      },
      orderBy: [{ nextRetryAt: 'asc' }],
      take: limit,
    });

    let succeeded = 0;
    let failed = 0;

    for (const item of pending) {
      const user = await this.prisma.user.findUnique({
        where: { id: item.userId },
        select: { email: true, pushSubscription: true },
      });

      if (!user) {
        await this.prisma.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: DeliveryStatus.FAILED,
            attempts: item.attempts + 1,
            retryDisabled: true,
            lastAttemptAt: now,
            lastError: 'User not found',
          },
        });
        failed++;
        continue;
      }

      const payload = this.parseChannelDeliveryPayload(item.payload);
      try {
        if (item.channel === NotificationChannel.EMAIL) {
          if (!user.email) {
            throw new Error('User email missing');
          }
          await this.emailService.sendEmail(user.email, payload.title, `<p>${payload.message}</p>`);
        } else if (item.channel === NotificationChannel.PUSH) {
          if (!user.pushSubscription) {
            throw new Error('User push subscription missing');
          }
          await this.webPushService.sendNotification(user.pushSubscription as any, {
            title: payload.title,
            body: payload.message,
            data: payload.data,
          });
        }

        await this.prisma.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: DeliveryStatus.SENT,
            attempts: item.attempts + 1,
            lastAttemptAt: now,
            lastError: null,
          },
        });
        this.metricsService.recordNotificationSent(item.channel.toLowerCase());
        succeeded++;
      } catch (error) {
        const attempts = item.attempts + 1;
        const maxedOut = attempts >= this.maxRetryAttempts;
        await this.prisma.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: DeliveryStatus.FAILED,
            attempts,
            retryDisabled: maxedOut,
            lastAttemptAt: now,
            nextRetryAt: this.computeNextRetryAt(attempts),
            lastError: error.message,
          },
        });
        failed++;
      }
    }

    return {
      retried: pending.length,
      succeeded,
      failed,
    };
  }

  async getFailedDeliveries(limit = 100) {
    const [emailOutbox, notificationOutbox] = await this.prisma.$transaction([
      this.prisma.emailOutbox.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.notificationOutbox.findMany({
        where: { status: DeliveryStatus.FAILED },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      emailOutbox,
      notificationOutbox,
      summary: {
        emailFailed: emailOutbox.length,
        notificationFailed: notificationOutbox.length,
      },
    };
  }

  private async dispatchChannel(
    notificationId: string,
    userId: string,
    channel: NotificationChannel,
    payload: ChannelDeliveryPayload,
    sender: () => Promise<void>,
  ): Promise<void> {
    const now = new Date();
    const dedupKey = `${notificationId}:${channel}`;
    const existing = await this.prisma.notificationOutbox.findUnique({ where: { dedupKey } });

    if (!existing) {
      await this.prisma.notificationOutbox.create({
        data: {
          notificationId,
          userId,
          channel,
          dedupKey,
          status: DeliveryStatus.PENDING,
          payload: payload as unknown as Prisma.InputJsonValue,
          maxAttempts: this.maxRetryAttempts,
          nextRetryAt: now,
        },
      });
    } else if (existing.status === DeliveryStatus.SENT) {
      return;
    }

    try {
      await sender();
      await this.prisma.notificationOutbox.update({
        where: { dedupKey },
        data: {
          status: DeliveryStatus.SENT,
          attempts: { increment: 1 },
          lastAttemptAt: now,
          lastError: null,
          retryDisabled: false,
        },
      });
      this.metricsService.recordNotificationSent(channel.toLowerCase());
    } catch (error) {
      const current = await this.prisma.notificationOutbox.findUnique({ where: { dedupKey } });
      const attempts = (current?.attempts || 0) + 1;
      const maxedOut = attempts >= this.maxRetryAttempts;

      await this.prisma.notificationOutbox.update({
        where: { dedupKey },
        data: {
          status: DeliveryStatus.FAILED,
          attempts,
          lastAttemptAt: now,
          retryDisabled: maxedOut,
          nextRetryAt: this.computeNextRetryAt(attempts),
          lastError: error.message,
        },
      });

      this.logger.error(`Failed to send ${channel.toLowerCase()} notification to user ${userId}: ${error.message}`);
    }
  }

  private async isDuplicateNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<boolean> {
    const threshold = new Date(Date.now() - this.dedupWindowMs);
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        type,
        title,
        message,
        createdAt: { gte: threshold },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }

  private computeNextRetryAt(attempts: number): Date {
    const delay = Math.min(this.retryBackoffBaseMs * Math.pow(2, attempts - 1), 60 * 60 * 1000);
    return new Date(Date.now() + delay);
  }

  private parseChannelDeliveryPayload(value: Prisma.JsonValue): ChannelDeliveryPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { title: 'Notification', message: 'No payload available' };
    }

    const raw = value as Record<string, unknown>;
    return {
      title: typeof raw.title === 'string' ? raw.title : 'Notification',
      message: typeof raw.message === 'string' ? raw.message : 'No payload available',
      data: (raw.data as Prisma.InputJsonValue | undefined) ?? undefined,
    };
  }
}
