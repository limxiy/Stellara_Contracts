import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SettlementOptimizerService } from './settlement-optimizer.service';
import { NetworkCongestionService } from './network-congestion.service';
import { GasPriceForecasterService } from './gas-price-forecaster.service';
import { SlaTrackerService } from './sla-tracker.service';
import {
  EnqueueSettlementDto,
  NetworkCongestionPredictionDto,
  CostSavingsDashboardDto,
  SlaComplianceDashboardDto,
  SettlementJobResponseDto,
  L2OffloadResponseDto,
  QueueSummaryDto,
} from './dto/predictive-settlement.dto';

@ApiTags('Predictive Settlement')
@Controller('settlement/predictive')
export class PredictiveSettlementController {
  constructor(
    private readonly optimizer: SettlementOptimizerService,
    private readonly congestionService: NetworkCongestionService,
    private readonly gasForecastService: GasPriceForecasterService,
    private readonly slaTracker: SlaTrackerService,
  ) {}

  // ─── Settlement Job Endpoints ─────────────────────────────────────────────────

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enqueue a settlement job',
    description:
      'Submits a new settlement job for predictive scheduling. Non-urgent jobs are ' +
      'automatically deferred to the optimal low-congestion window. URGENT jobs' +
      ' (>95th percentile priority) are submitted immediately.',
  })
  @ApiResponse({ status: 201, type: SettlementJobResponseDto })
  async enqueueJob(@Body() dto: EnqueueSettlementDto): Promise<SettlementJobResponseDto> {
    return this.optimizer.enqueue(dto);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get settlement job by ID' })
  @ApiParam({ name: 'id', description: 'Settlement job ID' })
  @ApiResponse({ status: 200, type: SettlementJobResponseDto })
  async getJob(@Param('id') id: string): Promise<SettlementJobResponseDto> {
    return this.optimizer.getJobById(id);
  }

  @Get('jobs/:id/l2-evaluation')
  @ApiOperation({
    summary: 'Evaluate L2 offload eligibility for a queued job',
    description:
      'Returns whether the job should be routed to a Layer-2 provider based on ' +
      'current network congestion, urgency classification, and the configured L2 threshold.',
  })
  @ApiParam({ name: 'id', description: 'Settlement job ID' })
  @ApiResponse({ status: 200, type: L2OffloadResponseDto })
  async evaluateL2(@Param('id') id: string): Promise<L2OffloadResponseDto> {
    return this.optimizer.evaluateL2Offload(id);
  }

  // ─── Queue Status ─────────────────────────────────────────────────────────────

  @Get('queue/summary')
  @ApiOperation({ summary: 'Get current settlement queue summary' })
  @ApiResponse({ status: 200, type: QueueSummaryDto })
  async getQueueSummary(): Promise<QueueSummaryDto> {
    return this.optimizer.getQueueSummary();
  }

  // ─── Network Congestion & Fee Forecasting ─────────────────────────────────────

  @Get('network/congestion')
  @ApiOperation({
    summary: 'Get network congestion prediction',
    description:
      'Returns the latest Stellar network congestion score and 5/10/15-minute ' +
      'ahead forecasts with a timing recommendation (SUBMIT_NOW | DEFER_Xm).',
  })
  @ApiResponse({ status: 200, type: NetworkCongestionPredictionDto })
  async getCongestionPrediction(): Promise<NetworkCongestionPredictionDto> {
    return this.congestionService.getLatestPrediction();
  }

  @Get('fees/trend')
  @ApiOperation({ summary: 'Get current gas/fee trend direction' })
  async getFeeTrend(): Promise<{ trend: string; changePercent: number }> {
    return this.gasForecastService.getFeeTrend();
  }

  @Get('fees/recommended')
  @ApiOperation({
    summary: 'Get recommended fee for a given urgency level',
    description:
      'Returns the optimal fee in stroops for the specified urgency. ' +
      'URGENT uses the P95 threshold to guarantee fast inclusion.',
  })
  @ApiQuery({
    name: 'urgency',
    required: false,
    enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    description: 'Settlement urgency level (default: NORMAL)',
  })
  async getRecommendedFee(
    @Query('urgency') urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL',
  ): Promise<{ feeStroops: number; rationale: string }> {
    return this.gasForecastService.getRecommendedFee(urgency);
  }

  @Get('fees/forecast')
  @ApiOperation({
    summary: 'Get forecasted fee at a specific future time horizon',
  })
  @ApiQuery({
    name: 'minutes',
    required: false,
    enum: ['5', '10', '15'],
    description: 'Minutes ahead to forecast (default: 10)',
  })
  async getForecastedFee(
    @Query('minutes') minutes: string = '10',
  ): Promise<{ feeStroops: number; congestionScore: number }> {
    const m = parseInt(minutes, 10);
    const horizon = ([5, 10, 15].includes(m) ? m : 10) as 5 | 10 | 15;
    return this.gasForecastService.getForecastedFeeAt(horizon);
  }

  // ─── Dashboards ───────────────────────────────────────────────────────────────

  @Get('dashboard/cost-savings')
  @ApiOperation({
    summary: 'Cost savings dashboard',
    description:
      'Shows total stroops and USD saved through predictive deferral, L2 offloading, ' +
      'and fee optimization over a configurable time window.',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    type: Number,
    description: 'Look-back window in hours (default: 24)',
  })
  @ApiResponse({ status: 200, type: CostSavingsDashboardDto })
  async getCostSavingsDashboard(
    @Query('hours') hours: string = '24',
  ): Promise<CostSavingsDashboardDto> {
    return this.optimizer.getCostSavingsDashboard(parseInt(hours, 10) || 24);
  }

  @Get('dashboard/sla-compliance')
  @ApiOperation({
    summary: 'SLA compliance tracking dashboard',
    description:
      'Returns settlement SLA compliance rates broken down by urgency level, ' +
      'with P50/P95/P99 settlement time percentiles.',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    type: Number,
    description: 'Look-back window in hours (default: 24)',
  })
  @ApiResponse({ status: 200, type: SlaComplianceDashboardDto })
  async getSlaComplianceDashboard(
    @Query('hours') hours: string = '24',
  ): Promise<SlaComplianceDashboardDto> {
    return this.slaTracker.getComplianceDashboard(parseInt(hours, 10) || 24);
  }
}
