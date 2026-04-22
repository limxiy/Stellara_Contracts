import { Controller, Post, Get, Param, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InsuranceService } from './insurance.service';
import { ClaimService } from './claim.service';
import { ReinsuranceService } from './reinsurance.service';
import { PoolService } from './pool.service';
import { PurchasePolicyDto } from './dto/purchase-policy.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreateReinsuranceDto } from './dto/create-reinsurance.dto';

@Controller('insurance')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class InsuranceController {
  constructor(
    private readonly insurance: InsuranceService,
    private readonly claims: ClaimService,
    private readonly reinsurance: ReinsuranceService,
    private readonly pools: PoolService,
  ) {}

  @Post('purchase')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async purchasePolicy(@Body() dto: PurchasePolicyDto) {
    return this.insurance.purchasePolicy(dto.userId, dto.poolId, dto.riskType, dto.coverageAmount);
  }

  @Get('policies/:userId')
  async getPoliciesByUser(@Param('userId') userId: string) {
    return this.insurance.getPoliciesByUser(userId);
  }

  @Post('claims')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createClaim(@Body() dto: CreateClaimDto) {
    return this.claims.createClaim(dto.policyId, dto.claimAmount);
  }

  @Post('claims/:claimId/assess')
  async assessClaim(@Param('claimId') claimId: string) {
    return this.claims.assessClaim(claimId);
  }

  @Post('claims/:claimId/pay')
  async payClaim(@Param('claimId') claimId: string) {
    return this.claims.payClaim(claimId);
  }

  @Get('claims/:policyId')
  async getClaimsByPolicy(@Param('policyId') policyId: string) {
    return this.claims.getClaimsByPolicy(policyId);
  }

  @Post('reinsurance')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createReinsurance(@Body() dto: CreateReinsuranceDto) {
    return this.reinsurance.createContract(dto.poolId, dto.coverageLimit, dto.premiumRate);
  }

  @Post('pools')
  async createPool(@Body() body: { name: string; initialCapital?: number }) {
    return this.pools.createPool(body.name, body.initialCapital || 0);
  }

  @Get('pools')
  async getAllPools() {
    return this.pools.getAllPools();
  }
}
