import { IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { RiskType } from '@prisma/client';

export class CalculatePremiumDto {
  @IsString()
  userId: string;

  @IsString()
  poolId: string;

  @IsEnum(RiskType)
  riskType: RiskType;

  @IsNumber()
  @Min(1)
  coverageAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  customRiskMultiplier?: number;
}

export class PricingBreakdownDto {
  basePremium: number;
  riskAdjustment: number;
  trustScoreDiscount: number;
  poolUtilizationAdjustment: number;
  historicalClaimAdjustment: number;
  finalPremium: number;
  premiumRate: number;
  breakdown: {
    factor: string;
    impact: number;
    description: string;
  }[];
}

export class UpdatePricingConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseRateAdjustment?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  trustScoreWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  poolUtilizationWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  historicalClaimWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPremiumRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPremiumRate?: number;
}

export class PoolRiskMetricsDto {
  poolId: string;
  totalPolicies: number;
  totalClaims: number;
  claimRate: number;
  totalPayouts: number;
  lossRatio: number;
  utilizationRate: number;
  averageClaimAmount: number;
}
