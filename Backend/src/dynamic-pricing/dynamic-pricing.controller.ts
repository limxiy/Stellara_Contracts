import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DynamicPricingManagerService } from './services/dynamic-pricing-manager.service';
import { FeeAnalyticsService } from './services/fee-analytics.service';
import { VolumeTierPricingService } from './services/volume-tier-pricing.service';
import { VolatilityFeeCalculator } from './services/volatility-fee-calculator.service';
import { CompetitorPriceMonitor } from './services/competitor-price-monitor.service';
import { FeeABTestingService } from './services/fee-ab-testing.service';
import {
  CalculateFeeDto,
  PreviewFeeDto,
  UpdateVolumeTiersDto,
  UpdateVolatilityDto,
  UpdateCompetitorFeeDto,
  CreateABTestDto,
  FeeAnalyticsQueryDto,
} from './dto/fee.dto';
import { UserSegment, ABTestGroup, FeeType, VolatilityLevel, UserTradingProfile } from './types/fee.types';

/**
 * Dynamic Pricing Controller
 * 
 * Provides REST API endpoints for fee management and calculation
 */
@ApiTags('Dynamic Pricing')
@Controller('api/fees')
export class DynamicPricingController {
  private readonly logger = new Logger(DynamicPricingController.name);

  constructor(
    private pricingManager: DynamicPricingManagerService,
    private analyticsService: FeeAnalyticsService,
    private volumePricing: VolumeTierPricingService,
    private volatilityCalc: VolatilityFeeCalculator,
    private competitorMonitor: CompetitorPriceMonitor,
    private abTesting: FeeABTestingService,
  ) {}

  /**
   * Calculate dynamic fee for a trade
   */
  @Post('calculate')
  @ApiOperation({ summary: 'Calculate dynamic fee for a trade' })
  async calculateFee(@Body() dto: CalculateFeeDto) {
    // In production, would fetch user profile from database
    const mockProfile: UserTradingProfile = {
      userId: dto.userId,
      totalVolume30d: dto.volume30d ? BigInt(dto.volume30d) : 0n,
      tradeCount30d: 0,
      avgTradeSize: 0n,
      makerRatio: 0.5,
      revenueGenerated30d: 0n,
      segment: dto.userSegment || UserSegment.RETAIL,
      abTestGroup: ABTestGroup.CONTROL,
      loyaltyScore: 50,
    };

    const fee = this.pricingManager.calculateDynamicFee({
      userId: dto.userId,
      symbol: dto.symbol,
      tradeAmount: BigInt(dto.tradeAmount),
      feeType: dto.feeType,
      profile: mockProfile,
    });

    return {
      success: true,
      data: fee,
    };
  }

  /**
   * Preview fee before trade execution
   */
  @Post('preview')
  @ApiOperation({ summary: 'Preview fee breakdown before trade' })
  async previewFee(@Body() dto: PreviewFeeDto) {
    // In production, would fetch user profile from database
    const mockProfile: UserTradingProfile = {
      userId: dto.userId,
      totalVolume30d: 0n,
      tradeCount30d: 0,
      avgTradeSize: 0n,
      makerRatio: 0.5,
      revenueGenerated30d: 0n,
      segment: UserSegment.RETAIL,
      abTestGroup: ABTestGroup.CONTROL,
      loyaltyScore: 50,
    };

    const preview = this.pricingManager.previewFee({
      userId: dto.userId,
      symbol: dto.symbol,
      tradeAmount: BigInt(dto.tradeAmount),
      feeType: dto.feeType,
      profile: mockProfile,
    });

    return {
      success: true,
      data: preview,
    };
  }

  /**
   * Get current volume tiers
   */
  @Get('tiers')
  @ApiOperation({ summary: 'Get current volume tier structure' })
  getVolumeTiers() {
    const tiers = this.volumePricing.getAllVolumeTiers();
    return {
      success: true,
      data: tiers.map(tier => ({
        ...tier,
        minVolume: tier.minVolume.toString(),
        maxVolume: tier.maxVolume?.toString(),
      })),
    };
  }

  /**
   * Update volume tiers (admin only)
   */
  @Put('tiers')
  @UseGuards(/* AdminGuard */)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update volume tier structure (Admin)' })
  updateVolumeTiers(@Body() dto: UpdateVolumeTiersDto) {
    const tiers = dto.tiers.map(t => ({
      minVolume: BigInt(t.minVolume),
      maxVolume: t.maxVolume ? BigInt(t.maxVolume) : undefined,
      makerFee: t.makerFee,
      takerFee: t.takerFee,
      discount: t.discount,
    }));

    this.volumePricing.updateVolumeTiers(tiers);

    return {
      success: true,
      message: 'Volume tiers updated successfully',
    };
  }

  /**
   * Update volatility data
   */
  @Post('volatility')
  @ApiOperation({ summary: 'Update market volatility data' })
  updateVolatility(@Body() dto: UpdateVolatilityDto) {
    this.volatilityCalc.updateVolatilityData({
      symbol: dto.symbol,
      hourlyChange: dto.hourlyChange,
      dailyChange: dto.dailyChange,
      weeklyChange: dto.weeklyChange,
      volatilityIndex: 0,
      level: VolatilityLevel.LOW,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: 'Volatility data updated',
    };
  }

  /**
   * Get current volatility status
   */
  @Get('volatility/:symbol')
  @ApiOperation({ summary: 'Get current volatility for a symbol' })
  getVolatility(@Param('symbol') symbol: string) {
    const data = this.volatilityCalc.getVolatilityData(symbol);
    const recommendation = this.volatilityCalc.getTradingRecommendation(symbol);

    return {
      success: true,
      data: {
        volatility: data,
        recommendation,
      },
    };
  }

  /**
   * Update competitor fee data
   */
  @Post('competitors')
  @ApiOperation({ summary: 'Update competitor fee information' })
  updateCompetitorFee(@Body() dto: UpdateCompetitorFeeDto) {
    this.competitorMonitor.updateCompetitorFee({
      exchange: dto.exchange,
      symbol: dto.symbol,
      makerFee: dto.makerFee,
      takerFee: dto.takerFee,
      timestamp: Date.now(),
      source: dto.source || 'manual',
    });

    return {
      success: true,
      message: 'Competitor fee updated',
    };
  }

  /**
   * Get competitive positioning
   */
  @Get('competitive/:symbol')
  @ApiOperation({ summary: 'Get competitive positioning for a symbol' })
  getCompetitivePosition(@Param('symbol') symbol: string) {
    const position = this.competitorMonitor.getCompetitivePosition(symbol);
    return {
      success: true,
      data: position,
    };
  }

  /**
   * Get fee analytics
   */
  @Get('analytics')
  @ApiOperation({ summary: 'Get historical fee analytics' })
  async getAnalytics(@Query() query: FeeAnalyticsQueryDto) {
    const analytics = await this.analyticsService.getFeeAnalytics({
      symbol: query.symbol,
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
      segment: query.segment,
    });

    return {
      success: true,
      data: analytics,
    };
  }

  /**
   * Create A/B test
   */
  @Post('ab-tests')
  @UseGuards(/* AdminGuard */)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new A/B test (Admin)' })
  createABTest(@Body() dto: CreateABTestDto) {
    const testId = this.abTesting.createTest({
      name: dto.name,
      description: dto.description,
      assignmentRatio: dto.assignmentRatio,
      controlFeeMultiplier: dto.controlFeeMultiplier,
      variantAFeeMultiplier: dto.variantAFeeMultiplier,
      variantBFeeMultiplier: dto.variantBFeeMultiplier,
    });

    return {
      success: true,
      testId,
    };
  }

  /**
   * Get active A/B tests
   */
  @Get('ab-tests')
  @ApiOperation({ summary: 'Get all active A/B tests' })
  getActiveABTests() {
    const tests = this.abTesting.getActiveTests();
    return {
      success: true,
      data: tests,
    };
  }

  /**
   * Get A/B test results
   */
  @Get('ab-tests/:testId/results')
  @ApiOperation({ summary: 'Get A/B test results' })
  getABTestResults(@Param('testId') testId: string) {
    const results = this.abTesting.calculateTestResults(testId);
    const winner = this.abTesting.determineWinner(testId);

    return {
      success: true,
      data: {
        results,
        winner,
      },
    };
  }

  /**
   * Get personalized fee offer for user
   */
  @Get('offers/:userId')
  @ApiOperation({ summary: 'Get personalized fee offers for a user' })
  getPersonalizedOffer(@Param('userId') userId: string) {
    // In production, would fetch real profile
    const mockProfile: UserTradingProfile = {
      userId,
      totalVolume30d: 100_000_000_000n,
      tradeCount30d: 50,
      avgTradeSize: 2_000_000_000n,
      makerRatio: 0.4,
      revenueGenerated30d: 100_000_000n,
      segment: UserSegment.PROFESSIONAL,
      abTestGroup: ABTestGroup.CONTROL,
      loyaltyScore: 65,
    };

    const preview = this.pricingManager.previewFee({
      userId,
      symbol: 'BTC-USDT',
      tradeAmount: 10_000_000_000n,
      feeType: FeeType.MAKER,
      profile: mockProfile,
    });

    return {
      success: true,
      data: preview,
    };
  }
}
