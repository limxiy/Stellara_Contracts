import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';

export type IndexerStatus = 'running' | 'paused' | 'stopped' | 'error';

export interface IndexerState {
  id: string;
  network: string;
  status: IndexerStatus;
  lastLedgerSeq: number;
  lastLedgerHash?: string;
  processedCount: number;
  errorCount: number;
  lastError?: string;
  pausedAt?: Date;
  resumedAt?: Date;
  resetAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface StateBackup {
  id: string;
  network: string;
  backupData: IndexerState;
  createdAt: Date;
}

@Injectable()
export class IndexerStateService {
  private readonly logger = new Logger(IndexerStateService.name);
  private readonly network: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
  }

  /**
   * Get current indexer state
   */
  async getState(): Promise<IndexerState | null> {
    const state = await this.prisma.indexerState.findUnique({
      where: { network: this.network },
    });

    if (!state) {
      return null;
    }

    return {
      id: state.id,
      network: state.network,
      status: state.status as IndexerStatus,
      lastLedgerSeq: state.lastLedgerSeq,
      lastLedgerHash: state.lastLedgerHash || undefined,
      processedCount: state.processedCount,
      errorCount: state.errorCount,
      lastError: state.lastError || undefined,
      pausedAt: state.pausedAt || undefined,
      resumedAt: state.resumedAt || undefined,
      resetAt: state.resetAt || undefined,
      metadata: state.metadata as Record<string, unknown> || undefined,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  /**
   * Initialize indexer state
   */
  async initializeState(startLedger: number): Promise<IndexerState> {
    this.logger.log(`Initializing indexer state for network ${this.network} at ledger ${startLedger}`);

    const state = await this.prisma.indexerState.upsert({
      where: { network: this.network },
      update: {
        status: 'running',
        lastLedgerSeq: startLedger,
        lastLedgerHash: null,
        processedCount: 0,
        errorCount: 0,
        lastError: null,
        pausedAt: null,
        resumedAt: null,
        resetAt: null,
        metadata: null,
      },
      create: {
        network: this.network,
        status: 'running',
        lastLedgerSeq: startLedger,
        processedCount: 0,
        errorCount: 0,
      },
    });

    return this.mapToIndexerState(state);
  }

  /**
   * Update indexer state during processing
   */
  async updateProcessingState(
    ledgerSeq: number,
    ledgerHash?: string,
    processedCount?: number,
    errorCount?: number,
  ): Promise<void> {
    await this.prisma.indexerState.update({
      where: { network: this.network },
      data: {
        lastLedgerSeq: ledgerSeq,
        lastLedgerHash: ledgerHash || null,
        ...(processedCount !== undefined && { processedCount }),
        ...(errorCount !== undefined && { errorCount }),
      },
    });
  }

  /**
   * Pause indexer with graceful completion
   */
  async pauseIndexer(reason?: string): Promise<IndexerState> {
    this.logger.log(`Pausing indexer for network ${this.network}${reason ? `: ${reason}` : ''}`);

    const state = await this.prisma.indexerState.update({
      where: { network: this.network },
      data: {
        status: 'paused',
        pausedAt: new Date(),
        metadata: {
          ...(await this.getCurrentMetadata()),
          pauseReason: reason,
        },
      },
    });

    this.logger.log(`Indexer paused at ledger ${state.lastLedgerSeq}`);
    return this.mapToIndexerState(state);
  }

  /**
   * Resume indexer with state validation
   */
  async resumeIndexer(): Promise<IndexerState> {
    this.logger.log(`Resuming indexer for network ${this.network}`);

    // Validate current state
    const currentState = await this.getState();
    if (!currentState) {
      throw new Error('Cannot resume: indexer state not found');
    }

    if (currentState.status !== 'paused' && currentState.status !== 'stopped') {
      throw new Error(`Cannot resume: indexer is in ${currentState.status} state`);
    }

    // Perform state validation
    await this.validateState(currentState);

    const state = await this.prisma.indexerState.update({
      where: { network: this.network },
      data: {
        status: 'running',
        resumedAt: new Date(),
        lastError: null,
        metadata: {
          ...(await this.getCurrentMetadata()),
          resumedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`Indexer resumed from ledger ${state.lastLedgerSeq}`);
    return this.mapToIndexerState(state);
  }

  /**
   * Reset indexer state with backup
   */
  async resetIndexer(startLedger?: number, reason?: string): Promise<IndexerState> {
    this.logger.log(`Resetting indexer for network ${this.network}${reason ? `: ${reason}` : ''}`);

    // Create backup before reset
    await this.createStateBackup();

    const resetLedger = startLedger || 0;

    const state = await this.prisma.indexerState.update({
      where: { network: this.network },
      data: {
        status: 'running',
        lastLedgerSeq: resetLedger,
        lastLedgerHash: null,
        processedCount: 0,
        errorCount: 0,
        lastError: null,
        pausedAt: null,
        resumedAt: null,
        resetAt: new Date(),
        metadata: {
          resetReason: reason,
          resetLedger,
          resetAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`Indexer reset to ledger ${resetLedger}`);
    return this.mapToIndexerState(state);
  }

  /**
   * Record an error in indexer state
   */
  async recordError(error: Error, ledgerSeq?: number): Promise<void> {
    const errorMessage = error.message;
    const errorStack = error.stack;

    await this.prisma.indexerState.update({
      where: { network: this.network },
      data: {
        status: 'error',
        lastError: errorMessage,
        errorCount: { increment: 1 },
        metadata: {
          ...(await this.getCurrentMetadata()),
          lastErrorAt: new Date().toISOString(),
          lastErrorStack: errorStack,
          errorLedgerSeq: ledgerSeq,
        },
      },
    });

    this.logger.error(`Indexer error recorded: ${errorMessage}`);
  }

  /**
   * Get state statistics
   */
  async getStateStats(): Promise<Record<string, unknown>> {
    const state = await this.getState();
    
    if (!state) {
      return {
        initialized: false,
        message: 'Indexer state not found',
      };
    }

    const uptime = state.status === 'running' && state.resumedAt
      ? Date.now() - state.resumedAt.getTime()
      : 0;

    return {
      initialized: true,
      status: state.status,
      currentLedger: state.lastLedgerSeq,
      processedCount: state.processedCount,
      errorCount: state.errorCount,
      uptime: uptime > 0 ? Math.floor(uptime / 1000) : 0, // seconds
      lastError: state.lastError,
      pausedAt: state.pausedAt,
      resumedAt: state.resumedAt,
      resetAt: state.resetAt,
      network: state.network,
    };
  }

  /**
   * Validate indexer state before resume
   */
  private async validateState(state: IndexerState): Promise<void> {
    // Check if ledger sequence is reasonable
    if (state.lastLedgerSeq < 0) {
      throw new Error('Invalid ledger sequence in state');
    }

    // Check if there are too many errors
    const errorRate = state.processedCount > 0 
      ? state.errorCount / state.processedCount 
      : 0;

    if (errorRate > 0.5) { // More than 50% error rate
      this.logger.warn(`High error rate detected: ${(errorRate * 100).toFixed(2)}%`);
    }

    // Additional validation can be added here
    this.logger.debug('State validation passed');
  }

  /**
   * Create a backup of current state
   */
  private async createStateBackup(): Promise<void> {
    const currentState = await this.getState();
    if (!currentState) {
      this.logger.warn('Cannot create backup: no current state');
      return;
    }

    // Store backup in a separate table or as a log entry
    await this.prisma.indexerLog.create({
      data: {
        level: 'info',
        message: 'Indexer state backup',
        metadata: {
          type: 'state_backup',
          backupData: currentState,
          timestamp: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`State backup created for ledger ${currentState.lastLedgerSeq}`);
  }

  /**
   * Get current metadata from state
   */
  private async getCurrentMetadata(): Promise<Record<string, unknown>> {
    const state = await this.prisma.indexerState.findUnique({
      where: { network: this.network },
      select: { metadata: true },
    });

    return (state?.metadata as Record<string, unknown>) || {};
  }

  /**
   * Map Prisma state to IndexerState interface
   */
  private mapToIndexerState(state: any): IndexerState {
    return {
      id: state.id,
      network: state.network,
      status: state.status as IndexerStatus,
      lastLedgerSeq: state.lastLedgerSeq,
      lastLedgerHash: state.lastLedgerHash || undefined,
      processedCount: state.processedCount,
      errorCount: state.errorCount,
      lastError: state.lastError || undefined,
      pausedAt: state.pausedAt || undefined,
      resumedAt: state.resumedAt || undefined,
      resetAt: state.resetAt || undefined,
      metadata: state.metadata as Record<string, unknown> || undefined,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }
}
