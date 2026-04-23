import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { ReputationModule } from './reputation/reputation.module';
import { DatabaseModule } from './database.module';
import { HealthModule } from './health/health.module';
import { IndexerModule } from './indexer/indexer.module';
import { NotificationModule } from './notification/notification.module';
import { StorageModule } from './storage/storage.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { RegenerativeFinanceModule } from './regenerative-finance/regenerative-finance.module';
import { CompetitionModule } from './competition/competition.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { ApiVersionMiddleware } from './common/middleware/api-version.middleware';
import { TimeoutMiddleware } from './common/middleware/timeout.middleware';
import { AppLogger } from './common/logger/app.logger';
import { AppCacheModule } from './cache/cache.module';
import { V1Module } from './modules/v1/v1.module';
import { V2Module } from './modules/v2/v2.module';
import { NonceModule } from './nonce/nonce.module';
import { SanitizationMiddleware } from './common/middleware/sanitization.middleware';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60000,
            limit: 100,
          },
        ],
      }),
    }),
    ReputationModule,
    DatabaseModule,
    HealthModule,
    IndexerModule,
    NotificationModule,
    StorageModule,
    InsuranceModule,
    RegenerativeFinanceModule,
    CompetitionModule,
    AppCacheModule,
    V1Module,
    V2Module,
    NonceModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppLogger, ApiVersionMiddleware, TimeoutMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, LoggingMiddleware, ApiVersionMiddleware, TimeoutMiddleware, SanitizationMiddleware)
      .forRoutes('*');
  }
}
