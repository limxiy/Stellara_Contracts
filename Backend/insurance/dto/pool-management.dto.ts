import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreatePoolDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  initialCapital?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxExposureLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  utilizationThreshold?: number;
}

export class UpdatePoolDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxExposureLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  utilizationThreshold?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class DepositCapitalDto {
  @IsNumber()
  @Min(1)
  amount: number;
}

export class WithdrawCapitalDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class PoolRebalanceDto {
  @IsString()
  targetPoolId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class PoolHealthResponse {
  poolId: string;
  poolName: string;
  healthScore: number;
  riskLevel: string;
  liquidityRatio: number;
  utilizationRate: number;
  exposureRatio: number;
  totalCapital: number;
  availableCapital: number;
  lockedCapital: number;
  totalPayouts: number;
  totalPremiums: number;
  profitLoss: number;
  activePolicies: number;
  pendingClaims: number;
  alerts: PoolAlertResponse[];
  recommendations: string[];
}

export class PoolAlertResponse {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  isResolved: boolean;
  createdAt: Date;
}

export class PoolMetricsResponse {
  poolId: string;
  poolName: string;
  liquidity: {
    totalCapital: number;
    availableCapital: number;
    lockedCapital: number;
    liquidityRatio: number;
  };
  exposure: {
    currentExposure: number;
    maxExposureLimit: number | null;
    exposureRatio: number;
    utilizationRate: number;
  };
  performance: {
    totalPremiums: number;
    totalPayouts: number;
    profitLoss: number;
    profitMargin: number;
    claimRate: number;
  };
  risk: {
    riskLevel: string;
    healthScore: number;
    activePolicies: number;
    pendingClaims: number;
    averageClaimSize: number;
  };
}

export class RebalanceHistoryResponse {
  id: string;
  poolId: string;
  reason: string;
  actionsTaken: any;
  previousState: any;
  newState: any;
  executedBy: string | null;
  executedAt: Date;
}
