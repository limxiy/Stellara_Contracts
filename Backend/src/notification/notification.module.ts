import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './services/notification.service';
import { EmailService } from './services/email.service';
import { WebPushService } from './services/web-push.service';
import { DeadlineAlertTask } from './tasks/deadline-alert.task';
import { EmailRetryTask } from './tasks/email-retry.task';
import { NotificationRetryTask } from './tasks/notification-retry.task';
import { DatabaseModule } from '../database.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsGateway } from './gateways/notifications.gateway';
import { NotificationsStreamService } from './streams/notifications-stream.service';

@Module({
  imports: [DatabaseModule, MetricsModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailService,
    WebPushService,
    DeadlineAlertTask,
    EmailRetryTask,
    NotificationRetryTask,
    NotificationsGateway,
    NotificationsStreamService,
  ],
  exports: [NotificationService, NotificationsGateway, NotificationsStreamService],
})
export class NotificationModule { }
