import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { WebsocketModule } from './websocket/websocket.module';
import { PaymentModule } from './payment/payment.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';
import { DocsController } from './docs/docs.controller';
import { LoggingModule } from './logging/logging.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitModule } from './rate-limiting/rate-limit.module';
import { SessionModule } from './sessions/session.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { IndexAnalysisModule } from './index-analysis/index-analysis.module';
import { ErrorHandlingModule } from './common/error-handling.module';
import { BackupModule } from './backup/backup.module';
import { QuotaModule } from './quota/quota.module';
import { AdminModule } from './admin/admin.module';
import { TenantModule } from './tenant/tenant.module';
import { UserController } from './user.controller';
import { PrismaModule } from './prisma.module';
import { RabbitmqModule } from './messaging/rabbitmq/rabbitmq.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AbiRegistryModule } from './abi-registry/abi-registry.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    // Structured logging with correlation IDs and performance tracing
    LoggingModule.forRoot({
      enableRequestLogging: true,
      enablePerformanceTracing: true,
      defaultContext: 'Application',
    }),
    RedisModule,
    DatabaseModule,
    PrismaModule,
    LifecycleModule,
    RateLimitModule,
    SessionModule,
    IndexAnalysisModule,
    AuthModule,
    WebsocketModule,
    PaymentModule,
    // Backup and disaster recovery module
    BackupModule,
    QuotaModule,
    AdminModule,
    TenantModule,
    WebhooksModule,
    RabbitmqModule,
    AbiRegistryModule,
    SupportModule,
  ],
  controllers: [AppController, UserController, DocsController],
  providers: [AppService],
})
export class AppModule {}
