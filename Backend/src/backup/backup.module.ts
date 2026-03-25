import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';
import { RestoreService } from './restore.service';
import { RestoreController } from './restore.controller';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule],
  controllers: [BackupController, RestoreController],
  providers: [BackupService, RestoreService],
  exports: [BackupService, RestoreService],
})
export class BackupModule {}
