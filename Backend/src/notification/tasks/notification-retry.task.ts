import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class NotificationRetryTask {
  private readonly logger = new Logger(NotificationRetryTask.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    const summary = await this.notificationService.retryOutboxBatch();
    if (summary.retried > 0) {
      this.logger.log(
        `Retried ${summary.retried} notification deliveries: ${summary.succeeded} succeeded, ${summary.failed} failed`,
      );
    }
  }
}
