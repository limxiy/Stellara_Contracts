import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export enum ReinsuranceType {
  QUOTA_SHARE = 'QUOTA_SHARE',
  SURPLUS = 'SURPLUS',
  EXCESS_OF_LOSS = 'EXCESS_OF_LOSS',
  STOP_LOSS = 'STOP_LOSS',
  FACULTATIVE = 'FACULTATIVE',
  TREATY = 'TREATY',
}

export class CreateReinsuranceDto {
  @IsString()
  poolId: string;

  @IsString()
  reinsurerName: string;

  @IsObject()
  @IsOptional()
  reinsurerContact?: Record<string, any>;

  @IsEnum(ReinsuranceType)
  type: ReinsuranceType;

  @IsNumber()
  @Min(0)
  coverageLimit: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  premiumRate: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductible?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  attachmentPoint?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  exhaustionPoint?: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsOptional()
  terms?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateReinsuranceDto {
  @IsString()
  @IsOptional()
  reinsurerName?: string;

  @IsObject()
  @IsOptional()
  reinsurerContact?: Record<string, any>;

  @IsEnum(ReinsuranceType)
  @IsOptional()
  type?: ReinsuranceType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  coverageLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  premiumRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductible?: number;

  @IsString()
  @IsOptional()
  terms?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED'])
  @IsOptional()
  status?: string;
}

export class ReinsuranceClaimDto {
  @IsString()
  contractId: string;

  @IsString()
  @IsOptional()
  originalClaimId?: string;

  @IsNumber()
  @Min(0)
  claimAmount: number;

  @IsNumber()
  @Min(0)
  requestedAmount: number;

  @IsObject()
  @IsOptional()
  supportingDocuments?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SubmitReinsuranceClaimDto {
  @IsString()
  @IsOptional()
  reinsurerNotes?: string;
}

export class SettleReinsuranceClaimDto {
  @IsNumber()
  @Min(0)
  approvedAmount: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number;

  @IsString()
  @IsOptional()
  reinsurerNotes?: string;
}

export class ReinsuranceQueryDto {
  @IsEnum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'ALL'])
  @IsOptional()
  status?: string = 'ACTIVE';

  @IsEnum(['QUOTA_SHARE', 'SURPLUS', 'EXCESS_OF_LOSS', 'STOP_LOSS', 'FACULTATIVE', 'TREATY'])
  @IsOptional()
  type?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minCoverageLimit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPremiumRate?: number;
}
