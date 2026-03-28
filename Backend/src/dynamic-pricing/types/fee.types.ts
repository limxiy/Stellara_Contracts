/**
 * Fee type enumeration
 */
export enum FeeType {
  MAKER = 'MAKER',
  TAKER = 'TAKER',
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  SERVICE = 'SERVICE',
}

/**
 * User segment for personalized pricing
 */
export enum UserSegment {
  RETAIL = 'RETAIL',
  PROFESSIONAL = 'PROFESSIONAL',
  INSTITUTIONAL = 'INSTITUTIONAL',
  VIP = 'VIP',
}

/**
 * Volatility level classification
 */
export enum VolatilityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EXTREME = 'EXTREME',
}

/**
 * A/B test group assignment
 */
export enum ABTestGroup {
  CONTROL = 'CONTROL',
  VARIANT_A = 'VARIANT_A',
  VARIANT_B = 'VARIANT_B',
}

/**
 * Volume tier configuration
 */
export interface VolumeTier {
  minVolume: bigint; // in smallest unit
  maxVolume?: bigint;
  makerFee: number; // percentage (e.g., 0.02 for 0.02%)
  takerFee: number; // percentage
  discount?: number; // additional discount percentage
}

/**
 * Dynamic fee configuration
 */
export interface DynamicFeeConfig {
  symbol: string;
  baseMakerFee: number;
  baseTakerFee: number;
  volatilityMultiplier: number;
  volumeTiers: VolumeTier[];
  userSegmentDiscounts: Record<UserSegment, number>;
  minFee: number;
  maxFee: number;
}

/**
 * Calculated fee result
 */
export interface CalculatedFee {
  feeType: FeeType;
  baseFee: number;
  volumeDiscount: number;
  volatilityAdjustment: number;
  segmentDiscount: number;
  abTestAdjustment: number;
  finalFee: number;
  feeAmount: bigint; // actual amount in smallest unit
  timestamp: number;
  metadata: FeeMetadata;
}

/**
 * Fee calculation metadata
 */
export interface FeeMetadata {
  volumeTier?: number;
  volatilityLevel?: VolatilityLevel;
  userSegment?: UserSegment;
  abTestGroup?: ABTestGroup;
  competitorAdjustment?: number;
  riskScore?: number;
}

/**
 * Competitor fee data
 */
export interface CompetitorFee {
  exchange: string;
  symbol: string;
  makerFee: number;
  takerFee: number;
  timestamp: number;
  source: string;
}

/**
 * Market volatility data
 */
export interface VolatilityData {
  symbol: string;
  hourlyChange: number; // percentage
  dailyChange: number;
  weeklyChange: number;
  volatilityIndex: number; // 0-100
  level: VolatilityLevel;
  timestamp: number;
}

/**
 * User trading profile for personalized pricing
 */
export interface UserTradingProfile {
  userId: string;
  totalVolume30d: bigint;
  tradeCount30d: number;
  avgTradeSize: bigint;
  makerRatio: number; // 0-1
  revenueGenerated30d: bigint;
  segment: UserSegment;
  abTestGroup: ABTestGroup;
  loyaltyScore: number; // 0-100
}

/**
 * Fee analytics data
 */
export interface FeeAnalytics {
  totalFeesCollected: bigint;
  avgMakerFee: number;
  avgTakerFee: number;
  feeDistribution: {
    byType: Record<FeeType, bigint>;
    bySegment: Record<UserSegment, bigint>;
    byTier: Record<number, bigint>;
  };
  revenueGrowth: number; // percentage
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * A/B test results for fee elasticity
 */
export interface ABTestResults {
  testId: string;
  groupName: ABTestGroup;
  conversionRate: number;
  avgTradeSize: bigint;
  totalVolume: bigint;
  revenuePerUser: bigint;
  userRetention: number;
  sampleSize: number;
  statisticalSignificance: number; // p-value
}
