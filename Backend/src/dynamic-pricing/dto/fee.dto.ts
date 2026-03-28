import { IsString, IsNumber, IsOptional, IsEnum, IsDateString, Min, Max } from 'class-validator';
import { FeeType, UserSegment, VolatilityLevel } from '../types/fee.types';

/**
 * Request DTO for fee calculation
 */
export class CalculateFeeDto {
  @IsString()
  userId: string;

  @IsString()
  symbol: string;

  @IsString()
  tradeAmount: string; // String representation of bigint

  @IsEnum(FeeType)
  feeType: FeeType;

  @IsOptional()
  @IsString()
  volume30d?: string;

  @IsOptional()
  @IsEnum(UserSegment)
  userSegment?: UserSegment;
}

/**
 * Request DTO for fee preview
 */
export class PreviewFeeDto {
  @IsString()
  userId: string;

  @IsString()
  symbol: string;

  @IsString()
  tradeAmount: string;

  @IsEnum(FeeType)
  feeType: FeeType;
}

/**
 * Response DTO for calculated fee
 */
export class CalculatedFeeResponseDto {
  feeType: FeeType;
  baseFee: number;
  volumeDiscount: number;
  volatilityAdjustment: number;
  segmentDiscount: number;
  abTestAdjustment: number;
  finalFee: number;
  feeAmount: string; // String for JSON serialization
  timestamp: number;
  metadata: FeeMetadataResponseDto;
}

/**
 * Metadata response DTO
 */
export class FeeMetadataResponseDto {
  volumeTier?: number;
  volatilityLevel?: VolatilityLevel;
  userSegment?: UserSegment;
  competitorAdjustment?: number;
  riskScore?: number;
}

/**
 * Fee breakdown response DTO
 */
export class FeeBreakdownResponseDto {
  baseFee: number;
  volumeDiscount: number;
  segmentDiscount: number;
  loyaltyDiscount: number;
  volatilityAdjustment: number;
  abTestAdjustment: number;
  competitorAdjustment: number;
  finalFee: number;
  totalSavings: number;
}

/**
 * Fee preview response DTO
 */
export class FeePreviewResponseDto {
  estimatedFee: CalculatedFeeResponseDto;
  breakdown: FeeBreakdownResponseDto;
  nextTierBenefit?: {
    requiredVolume: string;
    potentialSavings: string;
  };
  marketContext: {
    volatilityLevel: string;
    feeRanking: string;
    marketAverage?: {
      maker: number | null;
      taker: number | null;
    };
  };
}

/**
 * Update volume tiers DTO
 */
export class UpdateVolumeTiersDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  tiers: VolumeTierInputDto[];
}

/**
 * Volume tier input DTO
 */
export class VolumeTierInputDto {
  @IsString()
  minVolume: string;

  @IsOptional()
  @IsString()
  maxVolume?: string;

  @IsNumber()
  @Min(0.01)
  @Max(1.0)
  makerFee: number;

  @IsNumber()
  @Min(0.01)
  @Max(1.0)
  takerFee: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;
}

/**
 * Update volatility data DTO
 */
export class UpdateVolatilityDto {
  @IsString()
  symbol: string;

  @IsNumber()
  hourlyChange: number;

  @IsNumber()
  dailyChange: number;

  @IsNumber()
  weeklyChange: number;
}

/**
 * Competitor fee update DTO
 */
export class UpdateCompetitorFeeDto {
  @IsString()
  exchange: string;

  @IsString()
  symbol: string;

  @IsNumber()
  @Min(0)
  @Max(1.0)
  makerFee: number;

  @IsNumber()
  @Min(0)
  @Max(1.0)
  takerFee: number;

  @IsOptional()
  @IsString()
  source?: string;
}

/**
 * Fee analytics query DTO
 */
export class FeeAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  symbol?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsEnum(UserSegment)
  segment?: UserSegment;
}

/**
 * Fee analytics response DTO
 */
export class FeeAnalyticsResponseDto {
  totalFeesCollected: string;
  avgMakerFee: number;
  avgTakerFee: number;
  feeDistribution: {
    byType: Record<string, string>;
    bySegment: Record<string, string>;
    byTier: Record<string, string>;
  };
  revenueGrowth: number;
  period: {
    start: Date;
    end: Date;
  };
  topRevenueSymbols: Array<{
    symbol: string;
    totalFees: string;
    percentage: number;
  }>;
}

/**
 * A/B test creation DTO
 */
export class CreateABTestDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  assignmentRatio: number[];

  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  controlFeeMultiplier: number;

  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  variantAFeeMultiplier: number;

  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  variantBFeeMultiplier: number;
}
