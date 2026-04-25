/**
 * Event Replay Types
 * 
 * Types for managing event replay operations including progress tracking,
 * conflict resolution, and replay status management.
 */

export type ReplayStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ConflictResolution = 'skip' | 'overwrite' | 'merge';
export type ReplayEventStatus = 'pending' | 'processed' | 'skipped' | 'error';

export interface EventReplay {
  id: string;
  network: string;
  startLedgerSeq: number;
  endLedgerSeq: number;
  status: ReplayStatus;
  dryRun: boolean;
  conflictResolution: ConflictResolution;
  processedEvents: number;
  totalEvents: number;
  skippedEvents: number;
  errorEvents: number;
  currentLedgerSeq?: number;
  errors?: ReplayError[];
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReplayEvent {
  id: string;
  replayId: string;
  eventId: string;
  ledgerSeq: number;
  contractId: string;
  eventType: string;
  transactionHash: string;
  eventData: Record<string, unknown>;
  status: ReplayEventStatus;
  error?: string;
  processedAt?: Date;
  createdAt: Date;
}

export interface ReplayError {
  ledgerSeq: number;
  eventId: string;
  error: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

export interface CreateReplayRequest {
  startLedgerSeq: number;
  endLedgerSeq: number;
  dryRun?: boolean;
  conflictResolution?: ConflictResolution;
  contractIds?: string[];
  eventTypes?: string[];
  metadata?: Record<string, unknown>;
}

export interface ReplayProgress {
  replayId: string;
  status: ReplayStatus;
  currentLedgerSeq: number;
  totalLedgers: number;
  processedLedgers: number;
  processedEvents: number;
  totalEvents: number;
  skippedEvents: number;
  errorEvents: number;
  estimatedTimeRemaining?: number; // seconds
  eventsPerSecond?: number;
}

export interface ReplayResult {
  replay: EventReplay;
  events: ReplayEvent[];
  summary: ReplaySummary;
}

export interface ReplaySummary {
  totalEvents: number;
  processedEvents: number;
  skippedEvents: number;
  errorEvents: number;
  duration: number; // milliseconds
  eventsPerSecond: number;
  conflicts: ConflictSummary[];
  warnings: string[];
}

export interface ConflictSummary {
  type: 'duplicate_event' | 'data_mismatch' | 'missing_reference';
  count: number;
  examples: string[];
}

export interface ReplayFilter {
  status?: ReplayStatus;
  network?: string;
  dryRun?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  createdBy?: string;
}

export interface ReplayStatistics {
  totalReplays: number;
  activeReplays: number;
  completedReplays: number;
  failedReplays: number;
  averageDuration: number;
  totalEventsReplayed: number;
  successRate: number;
  mostActiveNetwork: string;
  recentReplays: EventReplay[];
}

export interface ReplayValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedEventCount: number;
  estimatedDuration: number; // seconds
  conflicts: ConflictSummary[];
}

export interface ReplayOptions {
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  skipValidation?: boolean;
  forceReplay?: boolean;
}

export interface LedgerRange {
  startLedgerSeq: number;
  endLedgerSeq: number;
  totalLedgers: number;
  estimatedEvents: number;
}

export interface EventConflict {
  eventId: string;
  ledgerSeq: number;
  contractId: string;
  eventType: string;
  existingData: Record<string, unknown>;
  newData: Record<string, unknown>;
  conflictType: 'duplicate' | 'mismatch' | 'reference';
  resolution?: ConflictResolution;
}

export interface ReplayLog {
  id: string;
  replayId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  ledgerSeq?: number;
  eventId?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ReplayMetrics {
  replayId: string;
  timestamp: Date;
  ledgerSeq: number;
  eventsProcessed: number;
  eventsSkipped: number;
  eventsError: number;
  processingTime: number; // milliseconds
  memoryUsage: number; // MB
  databaseTime: number; // milliseconds
}

// Request/Response types for API
export interface StartReplayRequest extends CreateReplayRequest {
  options?: ReplayOptions;
}

export interface StartReplayResponse {
  replayId: string;
  status: ReplayStatus;
  estimatedDuration: number;
  validation: ReplayValidation;
}

export interface GetReplayResponse {
  replay: EventReplay;
  progress: ReplayProgress;
  events?: ReplayEvent[];
  logs?: ReplayLog[];
}

export interface CancelReplayResponse {
  replayId: string;
  status: ReplayStatus;
  message: string;
}

export interface ReplayListResponse {
  replays: EventReplay[];
  totalCount: number;
  filter: ReplayFilter;
}

// Internal types for service operations
export interface ReplayContext {
  replay: EventReplay;
  processedEventIds: Set<string>;
  conflicts: EventConflict[];
  metrics: ReplayMetrics[];
  startTime: Date;
}

export interface ReplayBatch {
  ledgerSeq: number;
  events: ReplayEvent[];
  conflicts: EventConflict[];
}

export interface ConflictResolver {
  resolve(conflict: EventConflict, resolution: ConflictResolution): Promise<boolean>;
}

export interface ReplayEventHandler {
  handle(event: ReplayEvent, context: ReplayContext): Promise<boolean>;
  validate(event: ReplayEvent): Promise<boolean>;
}

// Utility types
export interface ReplayConfig {
  defaultBatchSize: number;
  defaultTimeout: number;
  defaultRetryCount: number;
  defaultRetryDelay: number;
  maxConcurrentReplays: number;
  enableMetrics: boolean;
  enableDetailedLogging: boolean;
}
