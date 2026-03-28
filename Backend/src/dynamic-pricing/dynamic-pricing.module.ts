import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DynamicPricingController } from './dynamic-pricing.controller';
import { DynamicPricingManagerService } from './services/dynamic-pricing-manager.service';
import { VolumeTierPricingService } from './services/volume-tier-pricing.service';
import { VolatilityFeeCalculator } from './services/volatility-fee-calculator.service';
import { CompetitorPriceMonitor } from './services/competitor-price-monitor.service';
import { PersonalizedFeeOffers } from './services/personalized-fee-offers.service';
import { FeeABTestingService } from './services/fee-ab-testing.service';
import { FeeAnalyticsService } from './services/fee-analytics.service';

/**
 * Dynamic Pricing Module
 * 
 * Comprehensive fee management system with:
 * - Volume-based tiered pricing (Maker: 0.02%-0.1%, Taker: 0.05%-0.2%)
 * - Volatility-adjusted risk fees (increases during >5% hourly volatility)
 * - Competitive price monitoring (hourly updates)
 * - Personalized fee offers for high-value users
 * - A/B testing framework for fee elasticity
 * - Real-time fee calculation at trade time
 * - Fee preview before confirmation
 * - Historical fee analytics dashboard
 */
@Module({
  imports: [
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    DynamicPricingController,
  ],
  providers: [
    DynamicPricingManagerService,
    VolumeTierPricingService,
    VolatilityFeeCalculator,
    CompetitorPriceMonitor,
    PersonalizedFeeOffers,
    FeeABTestingService,
    FeeAnalyticsService,
  ],
  exports: [
    DynamicPricingManagerService,
    VolumeTierPricingService,
    VolatilityFeeCalculator,
    CompetitorPriceMonitor,
    PersonalizedFeeOffers,
    FeeABTestingService,
    FeeAnalyticsService,
  ],
})
export class DynamicPricingModule {}
