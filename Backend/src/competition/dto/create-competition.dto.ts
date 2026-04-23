import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsDecimal, IsArray, IsObject, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CompetitionType, DurationType } from '../enums/competition-type.enum';

export class CreateCompetitionDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CompetitionType)
  type: CompetitionType;

  @IsEnum(DurationType)
  durationType: DurationType;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsDecimal()
  @Min(0)
  prizePool?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @IsDecimal()
  @Min(0)
  minDeposit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  requiredKycTier?: number;

  @IsOptional()
  @IsDecimal()
  @Min(0)
  entryFee?: number;

  @IsArray()
  @IsObject({ each: true })
  prizeDistribution: PrizeDistributionRule[];

  @IsOptional()
  @IsObject()
  rules?: CompetitionRules;

  @IsString()
  createdBy: string;
}

export class PrizeDistributionRule {
  @IsNumber()
  @Min(1)
  rank: number;

  @IsDecimal()
  @Min(0)
  percentage: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CompetitionRules {
  @IsOptional()
  @IsString()
  allowedAssets?: string[];

  @IsOptional()
  @IsDecimal()
  @Min(0)
  maxPositionSize?: number;

  @IsOptional()
  @IsDecimal()
  @Min(0)
  minTradeSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxTradesPerDay?: number;

  @IsOptional()
  @IsString()
  leverageAllowed?: string;

  @IsOptional()
  @IsString()
  shortSellingAllowed?: string;
}
