import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { ReputationController } from './reputation.controller';
import { ReputationNotificationController } from './controllers/reputation-notification.controller';
import { ReputationService } from './reputation.service';
import { ReputationNotificationService } from './services/reputation-notification.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [DatabaseModule, NotificationModule],
    controllers: [ReputationController, ReputationNotificationController],
    providers: [ReputationService, ReputationNotificationService],
    exports: [ReputationService, ReputationNotificationService],
})
export class ReputationModule { }
