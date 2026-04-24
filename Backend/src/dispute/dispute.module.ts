import { Module } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { DisputeController } from './dispute.controller';
import { ModeratorDashboardController } from './moderator-dashboard.controller';
import { AutomatedResolutionService } from './services/automated-resolution.service';
import { ModeratorDashboardService } from './services/moderator-dashboard.service';
import { PrismaService } from '../prisma.service';
import { ReputationModule } from '../reputation/reputation.module';

@Module({
  imports: [ReputationModule],
  controllers: [DisputeController, ModeratorDashboardController],
  providers: [
    DisputeService,
    PrismaService,
    AutomatedResolutionService,
    ModeratorDashboardService,
  ],
  exports: [DisputeService, AutomatedResolutionService, ModeratorDashboardService],
})
export class DisputeModule { }
