import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
  UploadedFile,
  UseInterceptors,
  Patch,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../src/prisma.service';
import { InsuranceService } from './insurance.service';
import { ClaimService } from './claim.service';
import { ReinsuranceService } from './reinsurance.service';
import { PoolService } from './pool.service';
import { PoolManagementService } from './pool-management.service';
import { PricingService } from './pricing.service';
import { InsuranceAnalyticsService } from './insurance-analytics.service';
import { ParametricAssessmentService } from './parametric-assessment.service';
import {
  SubmitClaimDto,
  AdvanceClaimStageDto,
  AssignAssessorDto,
  RegisterAssessorDto,
  UploadEvidenceDto,
  DisputeClaimDto,
  ResolveDisputeDto,
} from './dto/claim-workflow.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import {
  CreateReinsuranceDto,
  UpdateReinsuranceDto,
  ReinsuranceClaimDto,
  SubmitReinsuranceClaimDto,
  SettleReinsuranceClaimDto,
  ReinsuranceQueryDto,
} from './dto/create-reinsurance.dto';
import { PurchasePolicyDto } from './dto/purchase-policy.dto';
import { CalculatePremiumDto, UpdatePricingConfigDto } from './dto/dynamic-pricing.dto';
import {
  CreatePoolDto,
  UpdatePoolDto,
  DepositCapitalDto,
  WithdrawCapitalDto,
  PoolRebalanceDto,
} from './dto/pool-management.dto';

@Controller('insurance')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class InsuranceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insurance: InsuranceService,
    private readonly claims: ClaimService,
    private readonly reinsurance: ReinsuranceService,
    private readonly pools: PoolService,
    private readonly poolManagement: PoolManagementService,
    private readonly pricing: PricingService,
    private readonly analytics: InsuranceAnalyticsService,
    private readonly parametric: ParametricAssessmentService,
  ) {}

  // ==========================================
  // ANALYTICS ENDPOINTS
  // ==========================================

  @Get('analytics/claims-ratio')
  async getClaimsRatio(@Param('start') start?: string, @Param('end') end?: string) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    return this.analytics.getClaimsRatio(range);
  }

  @Get('analytics/pool-performance')
  async getPoolPerformance(@Param('start') start?: string, @Param('end') end?: string) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    return this.analytics.getPoolPerformance(range);
  }

  @Get('analytics/risk-distribution')
  async getRiskDistribution(@Param('start') start?: string, @Param('end') end?: string) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    return this.analytics.getRiskDistribution(range);
  }

  @Get('analytics/revenue')
  async getRevenue(@Param('start') start?: string, @Param('end') end?: string) {
    const range = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    return this.analytics.getRevenue(range);
  }

  // ==========================================
  // POLICY ENDPOINTS
  // ==========================================

  @Post('purchase')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async purchasePolicy(@Body() dto: PurchasePolicyDto) {
    return this.insurance.purchasePolicy(dto.userId, dto.poolId, dto.riskType, dto.coverageAmount);
  }

  @Get('policies/:userId')
  async getPoliciesByUser(@Param('userId') userId: string) {
    return this.insurance.getPoliciesByUser(userId);
  }

  // ==========================================
  // CLAIM SUBMISSION & WORKFLOW
  // ==========================================

  @Post('claims')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async submitClaim(@Body() dto: SubmitClaimDto) {
    return this.claims.submitClaim(
      dto.policyId,
      dto.claimAmount,
      dto.isParametric,
      dto.parametricTriggerData,
    );
  }

  @Get('claims/:claimId')
  async getClaimById(@Param('claimId') claimId: string) {
    return this.claims.getClaimById(claimId);
  }

  @Get('claims/policy/:policyId')
  async getClaimsByPolicy(@Param('policyId') policyId: string) {
    return this.claims.getClaimsByPolicy(policyId);
  }

  @Get('claims/status/:status')
  async getClaimsByStatus(@Param('status') status: string) {
    return this.claims.getClaimsByStatus(status as any);
  }

  @Post('claims/:claimId/stage')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async advanceStage(
    @Param('claimId') claimId: string,
    @Body() dto: AdvanceClaimStageDto,
    @Body('assessorId') assessorId: string,
  ) {
    return this.claims.advanceStage(claimId, dto.stage, assessorId, dto.notes, dto.score);
  }

  @Post('claims/:claimId/assess')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async assessClaim(
    @Param('claimId') claimId: string,
    @Body('status') status: string,
    @Body('assessorId') assessorId: string,
    @Body('payoutAmount') payoutAmount?: number,
    @Body('notes') notes?: string,
  ) {
    return this.claims.assessClaim(claimId, status as any, assessorId, payoutAmount, notes);
  }

  @Post('claims/:claimId/pay')
  async payClaim(@Param('claimId') claimId: string) {
    return this.claims.payClaim(claimId);
  }

  // ==========================================
  // PARAMETRIC CLAIMS
  // ==========================================

  @Post('claims/parametric/check/:policyId')
  async checkParametricTrigger(@Param('policyId') policyId: string) {
    return this.parametric.createParametricClaim(policyId);
  }

  @Post('claims/parametric/assess/:claimId')
  async assessParametricClaim(@Param('claimId') claimId: string) {
    return this.parametric.assessParametricClaim(claimId);
  }

  // ==========================================
  // ASSESSOR MANAGEMENT
  // ==========================================

  @Post('assessors/register')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async registerAssessor(@Body() dto: RegisterAssessorDto) {
    return this.prisma.assessor.create({
      data: {
        userId: dto.userId,
        role: dto.role,
        specialization: dto.specialization,
        maxConcurrentClaims: dto.maxConcurrentClaims || 10,
      },
    });
  }

  @Post('claims/:claimId/assign-assessor')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async assignAssessor(
    @Param('claimId') claimId: string,
    @Body('assessorId') assessorId: string,
  ) {
    return this.claims.assignAssessor(claimId, assessorId);
  }

  @Post('claims/:claimId/auto-assign')
  async autoAssignAssessor(@Param('claimId') claimId: string) {
    return this.claims.autoAssignAssessor(claimId);
  }

  // ==========================================
  // EVIDENCE MANAGEMENT (IPFS)
  // ==========================================

  @Post('claims/:claimId/evidence')
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(
    @Param('claimId') claimId: string,
    @UploadedFile() file: any,
    @Body('documentType') documentType: string,
    @Body('uploadedBy') uploadedBy: string,
    @Body('description') description?: string,
  ) {
    if (!file) {
      throw new Error('File is required');
    }
    return this.claims.uploadEvidence(
      claimId,
      documentType,
      file.buffer,
      uploadedBy,
      description,
    );
  }

  @Get('claims/:claimId/evidence')
  async getClaimEvidence(@Param('claimId') claimId: string) {
    return this.claims.getClaimEvidence(claimId);
  }

  // ==========================================
  // DISPUTE RESOLUTION
  // ==========================================

  @Post('claims/:claimId/dispute')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async raiseDispute(
    @Param('claimId') claimId: string,
    @Body('raisedBy') raisedBy: string,
    @Body('reason') reason: string,
  ) {
    return this.claims.raiseDispute(claimId, raisedBy, reason);
  }

  @Post('disputes/:disputeId/resolve')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async resolveDispute(
    @Param('disputeId') disputeId: string,
    @Body('resolution') resolution: string,
    @Body('resolvedBy') resolvedBy: string,
    @Body('newClaimStatus') newClaimStatus?: string,
  ) {
    return this.claims.resolveDispute(
      disputeId,
      resolution,
      resolvedBy,
      newClaimStatus as any,
    );
  }

  @Post('disputes/:disputeId/escalate')
  async escalateDispute(@Param('disputeId') disputeId: string) {
    return this.claims.escalateDispute(disputeId);
  }

  // ==========================================
  // REINSURANCE CONTRACT MANAGEMENT
  // ==========================================

  @Post('reinsurance/contracts')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createReinsuranceContract(@Body() dto: CreateReinsuranceDto) {
    return this.reinsurance.createContract(dto);
  }

  @Get('reinsurance/contracts/:contractId')
  async getReinsuranceContract(@Param('contractId') contractId: string) {
    return this.reinsurance.getContractById(contractId);
  }

  @Get('reinsurance/pools/:poolId/contracts')
  async getPoolReinsuranceContracts(
    @Param('poolId') poolId: string,
    @Query() query: ReinsuranceQueryDto,
  ) {
    return this.reinsurance.getContractsByPool(poolId, query);
  }

  @Patch('reinsurance/contracts/:contractId')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateReinsuranceContract(
    @Param('contractId') contractId: string,
    @Body() dto: UpdateReinsuranceDto,
  ) {
    return this.reinsurance.updateContract(contractId, dto);
  }

  @Post('reinsurance/contracts/:contractId/cancel')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async cancelReinsuranceContract(
    @Param('contractId') contractId: string,
    @Body('reason') reason?: string,
  ) {
    return this.reinsurance.cancelContract(contractId, reason);
  }

  // ==========================================
  // REINSURANCE PREMIUM CALCULATION
  // ==========================================

  @Post('reinsurance/contracts/:contractId/calculate-premium')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async calculateReinsurancePremium(
    @Param('contractId') contractId: string,
    @Body('coverageAmount') coverageAmount: number,
  ) {
    return this.reinsurance.calculatePremium(contractId, coverageAmount);
  }

  // ==========================================
  // REINSURANCE CLAIM MANAGEMENT
  // ==========================================

  @Post('reinsurance/claims')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createReinsuranceClaim(@Body() dto: ReinsuranceClaimDto) {
    return this.reinsurance.createReinsuranceClaim(dto);
  }

  @Get('reinsurance/claims/:claimId')
  async getReinsuranceClaim(@Param('claimId') claimId: string) {
    return this.reinsurance.getContractById(claimId);
  }

  @Get('reinsurance/contracts/:contractId/claims')
  async getContractReinsuranceClaims(@Param('contractId') contractId: string) {
    const contract = await this.reinsurance.getContractById(contractId);
    return contract.claims || [];
  }

  @Post('reinsurance/claims/:claimId/submit')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async submitToReinsurer(
    @Param('claimId') claimId: string,
    @Body() dto?: SubmitReinsuranceClaimDto,
  ) {
    return this.reinsurance.submitToReinsurer(claimId, dto);
  }

  @Post('reinsurance/claims/:claimId/approve')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async approveReinsuranceClaim(
    @Param('claimId') claimId: string,
    @Body('approvedAmount') approvedAmount: number,
    @Body('notes') notes?: string,
  ) {
    return this.reinsurance.approveClaim(claimId, approvedAmount, notes);
  }

  @Post('reinsurance/claims/:claimId/reject')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async rejectReinsuranceClaim(
    @Param('claimId') claimId: string,
    @Body('reason') reason: string,
  ) {
    return this.reinsurance.rejectClaim(claimId, reason);
  }

  // ==========================================
  // REINSURANCE SETTLEMENT WORKFLOW
  // ==========================================

  @Post('reinsurance/claims/:claimId/settle')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async settleReinsuranceClaim(
    @Param('claimId') claimId: string,
    @Body() dto: SettleReinsuranceClaimDto,
  ) {
    return this.reinsurance.settleClaim(claimId, dto);
  }

  // ==========================================
  // REINSURANCE ANALYTICS & REPORTING
  // ==========================================

  @Get('reinsurance/contracts/:contractId/utilization')
  async getCoverageUtilization(@Param('contractId') contractId: string) {
    return this.reinsurance.getCoverageUtilization(contractId);
  }

  @Get('reinsurance/contracts/:contractId/analytics')
  async getContractAnalytics(@Param('contractId') contractId: string) {
    return this.reinsurance.getContractAnalytics(contractId);
  }

  @Get('reinsurance/pools/:poolId/active-contracts')
  async getActiveContracts(@Param('poolId') poolId: string) {
    return this.reinsurance.getActiveContractsByPool(poolId);
  }

  // ==========================================
  // POOL ENDPOINTS
  // ==========================================

  @Get('pools')
  async getAllPools() {
    return this.pools.getAllPools();
  }

  // ==========================================
  // DYNAMIC PRICING ENDPOINTS
  // ==========================================

  @Post('pricing/calculate')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async calculatePremium(@Body() dto: CalculatePremiumDto) {
    return this.pricing.calculateDynamicPremium(
      dto.userId,
      dto.poolId,
      dto.riskType,
      dto.coverageAmount,
      dto.customRiskMultiplier,
    );
  }

  @Get('pricing/pool/:poolId/metrics')
  async getPoolRiskMetrics(@Param('poolId') poolId: string) {
    return this.pricing.getPoolRiskMetrics(poolId);
  }

  @Get('pricing/config')
  async getPricingConfig() {
    return this.pricing.getConfig();
  }

  @Patch('pricing/config')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updatePricingConfig(@Body() dto: UpdatePricingConfigDto) {
    this.pricing.updateConfig({
      baseRates: dto.baseRateAdjustment
        ? undefined
        : undefined,
      trustScoreWeight: dto.trustScoreWeight,
      poolUtilizationWeight: dto.poolUtilizationWeight,
      historicalClaimWeight: dto.historicalClaimWeight,
      maxPremiumRate: dto.maxPremiumRate,
      minPremiumRate: dto.minPremiumRate,
    });
    return { success: true, message: 'Pricing configuration updated' };
  }

  // ==========================================
  // POOL MANAGEMENT ENDPOINTS
  // ==========================================

  @Post('pools/create')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createPool(@Body() dto: CreatePoolDto) {
    return this.poolManagement.createPool(dto);
  }

  @Patch('pools/:poolId')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updatePool(
    @Param('poolId') poolId: string,
    @Body() dto: UpdatePoolDto,
  ) {
    return this.poolManagement.updatePool(poolId, dto);
  }

  @Get('pools/:poolId/details')
  async getPoolDetails(@Param('poolId') poolId: string) {
    return this.poolManagement.getPoolById(poolId);
  }

  @Post('pools/:poolId/deposit')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async depositCapital(
    @Param('poolId') poolId: string,
    @Body() dto: DepositCapitalDto,
  ) {
    return this.poolManagement.depositCapital(poolId, dto);
  }

  @Post('pools/:poolId/withdraw')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async withdrawCapital(
    @Param('poolId') poolId: string,
    @Body() dto: WithdrawCapitalDto,
  ) {
    return this.poolManagement.withdrawCapital(poolId, dto);
  }

  @Get('pools/:poolId/liquidity')
  async getLiquidityMetrics(@Param('poolId') poolId: string) {
    return this.poolManagement.getLiquidityMetrics(poolId);
  }

  @Get('pools/:poolId/exposure')
  async getRiskExposure(@Param('poolId') poolId: string) {
    return this.poolManagement.calculateRiskExposure(poolId);
  }

  @Get('pools/:poolId/exposure/check')
  async checkExposureLimits(@Param('poolId') poolId: string) {
    return this.poolManagement.checkExposureLimits(poolId);
  }

  @Post('pools/:poolId/rebalance')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async rebalancePool(
    @Param('poolId') poolId: string,
    @Body('reason') reason?: string,
  ) {
    return this.poolManagement.rebalancePool(poolId, reason);
  }

  @Get('pools/:poolId/rebalance-history')
  async getRebalanceHistory(@Param('poolId') poolId: string) {
    return this.poolManagement.getRebalanceHistory(poolId);
  }

  @Get('pools/:poolId/profit-loss')
  async getProfitLoss(
    @Param('poolId') poolId: string,
    @Param('start') start?: string,
    @Param('end') end?: string,
  ) {
    const timeRange = start && end ? { start: new Date(start), end: new Date(end) } : undefined;
    return this.poolManagement.calculateProfitLoss(poolId, timeRange);
  }

  @Post('pools/:poolId/distribute-profits')
  async distributeProfits(
    @Param('poolId') poolId: string,
    @Body('strategy') strategy: string = 'proportional',
  ) {
    return this.poolManagement.distributeProfits(poolId, strategy as any);
  }

  @Get('pools/:poolId/health')
  async checkPoolHealth(@Param('poolId') poolId: string) {
    return this.poolManagement.checkPoolHealth(poolId);
  }

  @Post('pools/:poolId/health/recalculate')
  async recalculateHealthScore(@Param('poolId') poolId: string) {
    return this.poolManagement.recalculateHealthScore(poolId);
  }

  @Get('pools/:poolId/alerts')
  async getPoolAlerts(
    @Param('poolId') poolId: string,
    @Param('includeResolved') includeResolved?: string,
  ) {
    return this.poolManagement.getPoolAlerts(poolId, includeResolved === 'true');
  }

  @Patch('alerts/:alertId/resolve')
  async resolveAlert(@Param('alertId') alertId: string) {
    return this.poolManagement.resolveAlert(alertId);
  }

  @Get('pools/metrics/:poolId')
  async getPoolMetrics(@Param('poolId') poolId: string) {
    const pool = await this.poolManagement.getPoolById(poolId);
    const liquidity = await this.poolManagement.getLiquidityMetrics(poolId);
    const exposure = await this.poolManagement.calculateRiskExposure(poolId);
    const pnl = await this.poolManagement.calculateProfitLoss(poolId);

    return {
      poolId: pool.id,
      poolName: pool.name,
      liquidity,
      exposure,
      performance: pnl,
      risk: {
        riskLevel: pool.riskLevel,
        healthScore: pool.healthScore,
      },
    };
  }
}
