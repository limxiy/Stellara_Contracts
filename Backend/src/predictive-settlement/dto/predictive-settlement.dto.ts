import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export enum SettlementUrgencyDto {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class EnqueueSettlementDto {
  @IsString()
  @IsNotEmpty()
  settlementType: string;

  @IsString()
  @IsNotEmpty()
  signerAddress: string;

  @IsString()
  @IsOptional()
  contractAddress?: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsEnum(SettlementUrgencyDto)
  @IsOptional()
  urgency?: SettlementUrgencyDto;

  @IsInt()
  @Min(1)
  @IsOptional()
  slaMinutes?: number;

  @IsDateString()
  @IsOptional()
  deadlineAt?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class NetworkCongestionPredictionDto {
  network: string;
  currentCongestionScore: number;
  currentBaseFeeStroops: number;
  currentPriorityFeeStroops: number;
  predictedAt: Date;
  forecast: {
    minutes: number;
    congestionScore: number;
    baseFeeStroops: number;
  }[];
  p95FeeThreshold: number;
  recommendation: 'SUBMIT_NOW' | 'DEFER_5M' | 'DEFER_10M' | 'DEFER_15M';
  recommendationReason: string;
}

export class CostSavingsDashboardDto {
  period: string;
  totalSavedStroops: number;
  totalSavedUsd: number;
  totalJobsOptimized: number;
  savingsByStrategy: Record<string, { count: number; savedStroops: number }>;
  averageSavingPerTx: number;
  optimizationRate: number; // percentage of jobs that were deferred/optimized
}

export class SlaComplianceDashboardDto {
  period: string;
  totalJobs: number;
  compliantJobs: number;
  breachedJobs: number;
  complianceRate: number; // percentage
  byUrgency: Record<
    string,
    {
      total: number;
      compliant: number;
      breached: number;
      avgMinutes: number;
    }
  >;
  p50SettlementMinutes: number;
  p95SettlementMinutes: number;
  p99SettlementMinutes: number;
}

export class SettlementJobResponseDto {
  id: string;
  idempotencyKey: string;
  settlementType: string;
  urgency: string;
  status: string;
  priority: number;
  deadlineAt?: Date;
  slaMinutes: number;
  scheduledAt?: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  txHash?: string;
  feePaidStroops?: number;
  estimatedFeeSaved?: number;
  l2Provider?: string;
  createdAt: Date;
}

export class L2OffloadResponseDto {
  jobId: string;
  l2Provider: string;
  offloaded: boolean;
  reason: string;
  estimatedFeeSavedStroops?: number;
}

export class QueueSummaryDto {
  queued: number;
  scheduled: number;
  processing: number;
  urgent: number;
  nextBatchAt?: Date;
  estimatedThroughputPerMinute: number;
}
