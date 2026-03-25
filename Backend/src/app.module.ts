import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BackupModule } from './backup/backup.module';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { ErrorHandlingModule } from './common/error-handling.module';
import { IndexerModule } from './indexer/indexer.module';
import { LoggingModule } from './logging/logging.module';
import { Module } from '@nestjs/common';
import { NotificationModule } from './notification/notification.module';
import { ReputationModule } from './reputation/reputation.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { UserController } from './user.controller';
import { WebsocketModule } from './websocket/websocket.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    // Structured logging with correlation IDs and performance tracing
    LoggingModule.forRoot({
      enableRequestLogging: true,
      enablePerformanceTracing: true,
      defaultContext: 'Application',
    }),
    // Global rate limiting with Redis storage
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        ttl: 60, // time window in seconds
        limit: 100, // default requests per window
        storage: new ThrottlerStorageRedisService({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
        }),
      }),
    }),
    // Error handling with global filters
    ErrorHandlingModule,
    // Comprehensive audit logging for compliance
    AuditModule,
    ReputationModule,
    DatabaseModule,
    IndexerModule,
    NotificationModule,
    AuthModule,
    WebsocketModule,
    // Backup and disaster recovery module
    BackupModule,
  ],
  controllers: [AppController, UserController],
  providers: [AppService],
})
export class AppModule { }
