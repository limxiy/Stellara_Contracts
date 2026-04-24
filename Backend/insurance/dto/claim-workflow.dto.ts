import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsObject } from 'class-validator';
import { AssessmentStage, AssessorRole } from '@prisma/client';

export class SubmitClaimDto {
  @IsString()
  policyId: string;

  @IsNumber()
  claimAmount: number;

  @IsOptional()
  @IsBoolean()
  isParametric?: boolean;

  @IsOptional()
  @IsObject()
  parametricTriggerData?: any;
}

export class AdvanceClaimStageDto {
  @IsEnum(AssessmentStage)
  stage: AssessmentStage;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  score?: number;
}

export class AssignAssessorDto {
  @IsString()
  claimId: string;

  @IsString()
  assessorId: string;
}

export class RegisterAssessorDto {
  @IsString()
  userId: string;

  @IsEnum(AssessorRole)
  role: AssessorRole;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsNumber()
  maxConcurrentClaims?: number;
}

export class UploadEvidenceDto {
  @IsString()
  claimId: string;

  @IsString()
  documentType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  uploadedBy: string;
}

export class DisputeClaimDto {
  @IsString()
  claimId: string;

  @IsString()
  raisedBy: string;

  @IsString()
  reason: string;
}

export class ResolveDisputeDto {
  @IsString()
  disputeId: string;

  @IsString()
  resolution: string;

  @IsString()
  resolvedBy: string;
}
