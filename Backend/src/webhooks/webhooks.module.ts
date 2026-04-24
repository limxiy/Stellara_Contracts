import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryTask } from './webhook-delivery.task';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  imports: [CircuitBreakerModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryTask, PrismaService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
