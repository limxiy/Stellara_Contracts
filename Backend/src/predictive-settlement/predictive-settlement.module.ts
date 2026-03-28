import { Module } from '@nestjs/common';
import { PredictiveSettlementController } from './predictive-settlement.controller';
import { SettlementOptimizerService } from './settlement-optimizer.service';
import { NetworkCongestionService } from './network-congestion.service';
import { GasPriceForecasterService } from './gas-price-forecaster.service';
import { L2IntegrationService } from './l2-integration.service';
import { SlaTrackerService } from './sla-tracker.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PredictiveSettlementController],
  providers: [
    SettlementOptimizerService,
    NetworkCongestionService,
    GasPriceForecasterService,
    L2IntegrationService,
    SlaTrackerService,
  ],
  exports: [
    SettlementOptimizerService,
    NetworkCongestionService,
    GasPriceForecasterService,
  ],
})
export class PredictiveSettlementModule {}
