import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RegenerativeFinanceController } from './regenerative-finance.controller';
import { QuadraticFundingService } from './services/quadratic-funding.service';
import { RetroactiveFundingService } from './services/retroactive-funding.service';
import { ImpactCertificateService } from './services/impact-certificate.service';
import { MatchingPoolService } from './services/matching-pool.service';
import { ImpactTrackingService } from './services/impact-tracking.service';
import { IntegrationService } from './services/integration.service';
import { SchedulingService } from './services/scheduling.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [RegenerativeFinanceController],
  providers: [
    PrismaService,
    QuadraticFundingService,
    RetroactiveFundingService,
    ImpactCertificateService,
    MatchingPoolService,
    ImpactTrackingService,
    IntegrationService,
    SchedulingService,
  ],
  exports: [
    QuadraticFundingService,
    RetroactiveFundingService,
    ImpactCertificateService,
    MatchingPoolService,
    ImpactTrackingService,
    IntegrationService,
    SchedulingService,
  ],
})
export class RegenerativeFinanceModule {}
