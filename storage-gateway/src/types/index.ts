export interface StorageProvider {
  name: string;
  upload(content: Buffer | string, options?: UploadOptions): Promise<UploadResult>;
  retrieve(identifier: string, options?: RetrieveOptions): Promise<RetrieveResult>;
  verify?(identifier: string, expectedHash?: string): Promise<VerificationResult>;
  pin?(identifier: string): Promise<PinResult>;
  getCost?(size: number, duration?: number): Promise<CostEstimate>;
  getStatus(): Promise<ProviderStatus>;
}

export interface UploadOptions {
  name?: string;
  contentType?: string;
  replicationFactor?: number;
  duration?: number;
  priority?: 'low' | 'standard' | 'high';
  tags?: Record<string, string>;
}

export interface UploadResult {
  success: boolean;
  identifier: string;
  hash: string;
  size: number;
  cost?: number;
  provider: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  error?: string;
}

export interface RetrieveOptions {
  timeout?: number;
  verifyHash?: boolean;
  preferredProvider?: string;
  useCache?: boolean;
}

export interface RetrieveResult {
  success: boolean;
  content: Buffer;
  hash: string;
  size: number;
  provider: string;
  cached: boolean;
  verified: boolean;
  timestamp: Date;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
  provider: string;
  timestamp: Date;
}

export interface PinResult {
  success: boolean;
  identifier: string;
  provider: string;
  timestamp: Date;
  error?: string;
}

export interface CostEstimate {
  provider: string;
  cost: number;
  currency: string;
  duration: number;
  size: number;
}

export interface ProviderStatus {
  name: string;
  online: boolean;
  latency: number;
  errorRate: number;
  lastCheck: Date;
  features: string[];
}

export interface GatewayStatus {
  uptime: number;
  totalUploads: number;
  totalRetrievals: number;
  cacheHitRate: number;
  providers: ProviderStatus[];
  errors: ErrorEntry[];
}

export interface ErrorEntry {
  timestamp: Date;
  provider: string;
  operation: string;
  error: string;
  resolved: boolean;
}

export interface CacheEntry {
  key: string;
  content: Buffer;
  hash: string;
  size: number;
  provider: string;
  timestamp: Date;
  ttl: number;
  accessCount: number;
}

export interface StorageMetrics {
  uploads: {
    total: number;
    byProvider: Record<string, number>;
    successRate: number;
    averageLatency: number;
  };
  retrievals: {
    total: number;
    byProvider: Record<string, number>;
    cacheHitRate: number;
    averageLatency: number;
  };
  costs: {
    total: number;
    byProvider: Record<string, number>;
    savings: number;
  };
  errors: {
    total: number;
    byProvider: Record<string, number>;
    byType: Record<string, number>;
  };
}

export interface FailoverConfig {
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  providers: string[];
  strategy: 'sequential' | 'parallel' | 'fastest';
}

export interface ContentMetadata {
  name?: string;
  contentType?: string;
  size: number;
  hash: string;
  providers: ProviderReference[];
  uploadedAt: Date;
  tags?: Record<string, string>;
  pinned?: boolean;
}

export interface ProviderReference {
  provider: string;
  identifier: string;
  status: 'active' | 'pending' | 'failed';
  lastVerified?: Date;
}

export enum StorageTier {
  COLD = 'cold',
  STANDARD = 'standard',
  HOT = 'hot',
}

export interface TierConfiguration {
  tier: StorageTier;
  providers: string[];
  replicationFactor: number;
  retentionPeriod: number;
  costMultiplier: number;
}
