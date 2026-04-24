import { Module } from '@nestjs/common';
import { InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';
import { PoolService } from './pool.service';
import { PoolManagementService } from './pool-management.service';
import { ClaimService } from './claim.service';
import { ReinsuranceService } from './reinsurance.service';
import { PricingService } from './pricing.service';
import { OracleService } from './oracle.service';
import { InsuranceAnalyticsService } from './insurance-analytics.service';
import { FraudDetectionService } from './fraud-detection.service';
import { InsuranceContractService } from './insurance-contract.service';
import { IpfsService } from './ipfs.service';
import { ParametricAssessmentService } from './parametric-assessment.service';

@Module({
  controllers: [InsuranceController],
  providers: [
    InsuranceService,
    PoolService,
    PoolManagementService,
    ClaimService,
    ReinsuranceService,
    PricingService,
    OracleService,
    InsuranceAnalyticsService,
    FraudDetectionService,
    InsuranceContractService,
    IpfsService,
    ParametricAssessmentService,
  ],
  exports: [
    InsuranceService,
    PoolService,
    PoolManagementService,
    ClaimService,
    ReinsuranceService,
    PricingService,
    OracleService,
    InsuranceAnalyticsService,
    FraudDetectionService,
    InsuranceContractService,
    IpfsService,
    ParametricAssessmentService,
  ],
})
export class InsuranceModule {}
