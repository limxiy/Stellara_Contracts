import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { IndexerService } from './indexer.service';
import { EventHandlerService } from './event-handler.service';
import { AbiParserService } from './abi-parser.service';
import {
  EventReplay,
  ReplayEvent,
  ReplayStatus,
  ConflictResolution,
  ReplayEventStatus,
  CreateReplayRequest,
  ReplayProgress,
  ReplayResult,
  ReplaySummary,
  ConflictSummary,
  ReplayValidation,
  ReplayOptions,
  LedgerRange,
  EventConflict,
  ReplayContext,
  ReplayMetrics,
  ReplayFilter,
  ReplayStatistics,
} from '../types/event-replay.types';
import { SorobanEvent } from '../types/event-types';

@Injectable()
export class EventReplayService {
  private readonly logger = new Logger(EventReplayService.name);
  private readonly network: string;
  private readonly activeReplays = new Map<string, ReplayContext>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly indexerService: IndexerService,
    private readonly eventHandler: EventHandlerService,
    private readonly abiParserService: AbiParserService,
  ) {
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
  }

  /**
   * Start a new event replay operation
   */
  async startReplay(request: CreateReplayRequest, options?: ReplayOptions): Promise<EventReplay> {
    this.logger.log(`Starting event replay from ledger ${request.startLedgerSeq} to ${request.endLedgerSeq}`);

    // Validate request
    const validation = await this.validateReplayRequest(request);
    if (!validation.isValid) {
      throw new Error(`Invalid replay request: ${validation.errors.join(', ')}`);
    }

    // Check for concurrent replays
    const activeReplayCount = await this.getActiveReplayCount();
    const maxConcurrent = this.configService.get<number>('REPLAY_MAX_CONCURRENT', 3);
    if (activeReplayCount >= maxConcurrent) {
      throw new Error(`Maximum concurrent replays (${maxConcurrent}) reached`);
    }

    // Create replay record
    const replay = await this.prisma.eventReplay.create({
      data: {
        network: this.network,
        startLedgerSeq: request.startLedgerSeq,
        endLedgerSeq: request.endLedgerSeq,
        dryRun: request.dryRun || false,
        conflictResolution: request.conflictResolution || 'skip',
        metadata: {
          ...request.metadata,
          contractIds: request.contractIds,
          eventTypes: request.eventTypes,
          options,
        },
      },
    });

    // Start replay processing asynchronously
    this.processReplay(replay.id).catch(error => {
      this.logger.error(`Replay ${replay.id} failed: ${error.message}`, error.stack);
    });

    return this.mapToEventReplay(replay);
  }

  /**
   * Get replay status and progress
   */
  async getReplay(replayId: string): Promise<EventReplay | null> {
    const replay = await this.prisma.eventReplay.findUnique({
      where: { id: replayId },
      include: {
        replayEvents: {
          orderBy: { ledgerSeq: 'asc' },
        },
      },
    });

    return replay ? this.mapToEventReplay(replay) : null;
  }

  /**
   * Get replay progress
   */
  async getReplayProgress(replayId: string): Promise<ReplayProgress | null> {
    const replay = await this.prisma.eventReplay.findUnique({
      where: { id: replayId },
    });

    if (!replay) {
      return null;
    }

    const totalLedgers = replay.endLedgerSeq - replay.startLedgerSeq + 1;
    const processedLedgers = replay.currentLedgerSeq 
      ? replay.currentLedgerSeq - replay.startLedgerSeq + 1
      : 0;

    const eventsPerSecond = this.calculateEventsPerSecond(replay);
    const estimatedTimeRemaining = this.calculateEstimatedTimeRemaining(replay, processedLedgers, totalLedgers);

    return {
      replayId,
      status: replay.status as ReplayStatus,
      currentLedgerSeq: replay.currentLedgerSeq || replay.startLedgerSeq,
      totalLedgers,
      processedLedgers,
      processedEvents: replay.processedEvents,
      totalEvents: replay.totalEvents,
      skippedEvents: replay.skippedEvents,
      errorEvents: replay.errorEvents,
      estimatedTimeRemaining,
      eventsPerSecond,
    };
  }

  /**
   * Cancel a running replay
   */
  async cancelReplay(replayId: string): Promise<void> {
    this.logger.log(`Cancelling replay ${replayId}`);

    const replay = await this.prisma.eventReplay.update({
      where: { id: replayId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    });

    // Remove from active replays
    this.activeReplays.delete(replayId);

    this.logger.log(`Replay ${replayId} cancelled`);
  }

  /**
   * Get list of replays with filtering
   */
  async listReplays(filter?: ReplayFilter): Promise<EventReplay[]> {
    const where: any = { network: this.network };

    if (filter?.status) where.status = filter.status;
    if (filter?.dryRun !== undefined) where.dryRun = filter.dryRun;
    if (filter?.dateFrom) where.createdAt = { gte: filter.dateFrom };
    if (filter?.dateTo) where.createdAt = { lte: filter.dateTo };

    const replays = await this.prisma.eventReplay.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        replayEvents: {
          orderBy: { ledgerSeq: 'asc' },
          take: 10, // Limit events for list view
        },
      },
    });

    return replays.map(replay => this.mapToEventReplay(replay));
  }

  /**
   * Get replay statistics
   */
  async getReplayStatistics(): Promise<ReplayStatistics> {
    const [
      totalReplays,
      activeReplays,
      completedReplays,
      failedReplays,
      recentReplays,
    ] = await Promise.all([
      this.prisma.eventReplay.count({ where: { network: this.network } }),
      this.prisma.eventReplay.count({ where: { network: this.network, status: 'running' } }),
      this.prisma.eventReplay.count({ where: { network: this.network, status: 'completed' } }),
      this.prisma.eventReplay.count({ where: { network: this.network, status: 'failed' } }),
      this.prisma.eventReplay.findMany({
        where: { network: this.network },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const totalEventsReplayed = await this.prisma.eventReplay.aggregate({
      where: { network: this.network, status: 'completed' },
      _sum: { processedEvents: true },
    });

    const successRate = totalReplays > 0 ? (completedReplays / totalReplays) * 100 : 0;

    return {
      totalReplays,
      activeReplays,
      completedReplays,
      failedReplays,
      averageDuration: 0, // Calculate from completed replays
      totalEventsReplayed: totalEventsReplayed._sum.processedEvents || 0,
      successRate,
      mostActiveNetwork: this.network,
      recentReplays: recentReplays.map(replay => this.mapToEventReplay(replay)),
    };
  }

  /**
   * Get replay result summary
   */
  async getReplayResult(replayId: string): Promise<ReplayResult | null> {
    const replay = await this.prisma.eventReplay.findUnique({
      where: { id: replayId },
      include: {
        replayEvents: {
          orderBy: { ledgerSeq: 'asc' },
        },
      },
    });

    if (!replay) {
      return null;
    }

    const summary = await this.generateReplaySummary(replay);

    return {
      replay: this.mapToEventReplay(replay),
      events: replay.replayEvents.map(event => this.mapToReplayEvent(event)),
      summary,
    };
  }

  /**
   * Main replay processing method
   */
  private async processReplay(replayId: string): Promise<void> {
    const replay = await this.prisma.eventReplay.findUnique({
      where: { id: replayId },
    });

    if (!replay) {
      this.logger.error(`Replay ${replayId} not found`);
      return;
    }

    const context: ReplayContext = {
      replay: this.mapToEventReplay(replay),
      processedEventIds: new Set(),
      conflicts: [],
      metrics: [],
      startTime: new Date(),
    };

    this.activeReplays.set(replayId, context);

    try {
      // Update status to running
      await this.prisma.eventReplay.update({
        where: { id: replayId },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      // Process ledger range
      await this.processLedgerRange(replay, context);

      // Update status to completed
      await this.prisma.eventReplay.update({
        where: { id: replayId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          currentLedgerSeq: replay.endLedgerSeq,
        },
      });

      this.logger.log(`Replay ${replayId} completed successfully`);
    } catch (error) {
      this.logger.error(`Replay ${replayId} failed: ${error.message}`, error.stack);

      // Update status to failed
      await this.prisma.eventReplay.update({
        where: { id: replayId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errors: [error.message],
        },
      });
    } finally {
      this.activeReplays.delete(replayId);
    }
  }

  /**
   * Process a range of ledgers
   */
  private async processLedgerRange(replay: any, context: ReplayContext): Promise<void> {
    const batchSize = this.configService.get<number>('REPLAY_BATCH_SIZE', 100);
    const { startLedgerSeq, endLedgerSeq, dryRun, conflictResolution } = replay;

    for (let currentLedger = startLedgerSeq; currentLedger <= endLedgerSeq; currentLedger += batchSize) {
      // Check if replay was cancelled
      const currentReplay = await this.prisma.eventReplay.findUnique({
        where: { id: replay.id },
      });

      if (currentReplay?.status === 'cancelled') {
        this.logger.log(`Replay ${replay.id} was cancelled`);
        return;
      }

      const batchEndLedger = Math.min(currentLedger + batchSize - 1, endLedgerSeq);

      // Fetch events for this batch
      const events = await this.fetchEventsForLedgerRange(currentLedger, batchEndLedger, replay.metadata);

      // Update current ledger
      await this.prisma.eventReplay.update({
        where: { id: replay.id },
        data: {
          currentLedgerSeq: batchEndLedger,
          totalEvents: replay.totalEvents + events.length,
        },
      });

      // Process events in batch
      await this.processEventBatch(events, replay, context, dryRun, conflictResolution);

      // Update progress
      const processedCount = context.processedEventIds.size;
      await this.prisma.eventReplay.update({
        where: { id: replay.id },
        data: {
          processedEvents: processedCount,
        },
      });

      // Add delay to prevent overwhelming the system
      await this.sleep(100);
    }
  }

  /**
   * Process a batch of events
   */
  private async processEventBatch(
    events: SorobanEvent[],
    replay: any,
    context: ReplayContext,
    dryRun: boolean,
    conflictResolution: ConflictResolution,
  ): Promise<void> {
    for (const event of events) {
      try {
        // Check if event was already processed
        const wasProcessed = await this.isEventAlreadyProcessed(event.id);
        if (wasProcessed && !dryRun) {
          await this.handleConflict(event, replay, conflictResolution);
          continue;
        }

        // Parse event
        const parsedEvent = await this.abiParserService.parseEventWithAbi(event);
        if (!parsedEvent) {
          this.logger.warn(`Failed to parse event ${event.id} during replay`);
          continue;
        }

        if (!dryRun) {
          // Process event through handler
          const success = await this.eventHandler.processEvent(parsedEvent);
          
          // Record replay event
          await this.prisma.replayEvent.create({
            data: {
              replayId: replay.id,
              eventId: event.id,
              ledgerSeq: event.ledger,
              contractId: event.contractId,
              eventType: parsedEvent.eventType,
              transactionHash: event.txHash,
              eventData: parsedEvent.data as any,
              status: success ? 'processed' : 'error',
              processedAt: new Date(),
            },
          });

          if (success) {
            context.processedEventIds.add(event.id);
          }
        } else {
          // Dry run - just record the event without processing
          await this.prisma.replayEvent.create({
            data: {
              replayId: replay.id,
              eventId: event.id,
              ledgerSeq: event.ledger,
              contractId: event.contractId,
              eventType: parsedEvent.eventType,
              transactionHash: event.txHash,
              eventData: parsedEvent.data as any,
              status: 'skipped', // Skipped because it's a dry run
            },
          });
        }
      } catch (error) {
        this.logger.error(`Error processing event ${event.id} during replay: ${error.message}`);
        
        // Record error event
        await this.prisma.replayEvent.create({
          data: {
            replayId: replay.id,
            eventId: event.id,
            ledgerSeq: event.ledger,
            contractId: event.contractId,
            eventType: 'unknown',
            transactionHash: event.txHash,
            eventData: {},
            status: 'error',
            error: error.message,
          },
        });

        // Update error count
        await this.prisma.eventReplay.update({
          where: { id: replay.id },
          data: {
            errorEvents: { increment: 1 },
          },
        });
      }
    }
  }

  /**
   * Handle event conflicts during replay
   */
  private async handleConflict(
    event: SorobanEvent,
    replay: any,
    conflictResolution: ConflictResolution,
  ): Promise<void> {
    switch (conflictResolution) {
      case 'skip':
        await this.prisma.replayEvent.create({
          data: {
            replayId: replay.id,
            eventId: event.id,
            ledgerSeq: event.ledger,
            contractId: event.contractId,
            eventType: 'conflict',
            transactionHash: event.txHash,
            eventData: {},
            status: 'skipped',
          },
        });
        await this.prisma.eventReplay.update({
          where: { id: replay.id },
          data: { skippedEvents: { increment: 1 } },
        });
        break;

      case 'overwrite':
        // Delete existing processed event and reprocess
        await this.prisma.processedEvent.delete({
          where: { eventId: event.id },
        });
        // Continue with normal processing (handled in processEventBatch)
        break;

      case 'merge':
        // For now, treat merge as skip (could be enhanced later)
        await this.prisma.replayEvent.create({
          data: {
            replayId: replay.id,
            eventId: event.id,
            ledgerSeq: event.ledger,
            contractId: event.contractId,
            eventType: 'conflict',
            transactionHash: event.txHash,
            eventData: {},
            status: 'skipped',
          },
        });
        await this.prisma.eventReplay.update({
          where: { id: replay.id },
          data: { skippedEvents: { increment: 1 } },
        });
        break;
    }
  }

  /**
   * Fetch events for a ledger range
   */
  private async fetchEventsForLedgerRange(
    startLedger: number,
    endLedger: number,
    metadata?: any,
  ): Promise<SorobanEvent[]> {
    // This would integrate with the indexer service to fetch events
    // For now, return empty array as placeholder
    this.logger.debug(`Fetching events for ledgers ${startLedger} to ${endLedger}`);
    
    // In a real implementation, you would:
    // 1. Use the indexer service to fetch events from RPC
    // 2. Filter by contract IDs if specified in metadata
    // 3. Filter by event types if specified in metadata
    // 4. Return the events in the correct format
    
    return [];
  }

  /**
   * Check if event was already processed
   */
  private async isEventAlreadyProcessed(eventId: string): Promise<boolean> {
    const count = await this.prisma.processedEvent.count({
      where: { eventId },
    });
    return count > 0;
  }

  /**
   * Validate replay request
   */
  private async validateReplayRequest(request: CreateReplayRequest): Promise<ReplayValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (request.startLedgerSeq >= request.endLedgerSeq) {
      errors.push('Start ledger must be less than end ledger');
    }

    if (request.startLedgerSeq < 0) {
      errors.push('Start ledger must be positive');
    }

    // Check for overlapping replays
    const overlappingReplay = await this.prisma.eventReplay.findFirst({
      where: {
        network: this.network,
        status: 'running',
        startLedgerSeq: { lte: request.endLedgerSeq },
        endLedgerSeq: { gte: request.startLedgerSeq },
      },
    });

    if (overlappingReplay) {
      warnings.push('Overlapping with an active replay');
    }

    // Estimate event count
    const estimatedEventCount = await this.estimateEventCount(request.startLedgerSeq, request.endLedgerSeq);
    const estimatedDuration = estimatedEventCount * 0.1; // Rough estimate

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      estimatedEventCount,
      estimatedDuration,
      conflicts: [],
    };
  }

  /**
   * Estimate event count for ledger range
   */
  private async estimateEventCount(startLedger: number, endLedger: number): Promise<number> {
    // This would use historical data to estimate
    // For now, return a rough estimate
    const ledgerCount = endLedgerSeq - startLedgerSeq + 1;
    return Math.floor(ledgerCount * 2.5); // Rough estimate of 2.5 events per ledger
  }

  /**
   * Generate replay summary
   */
  private async generateReplaySummary(replay: any): Promise<ReplaySummary> {
    const duration = replay.completedAt && replay.startedAt 
      ? replay.completedAt.getTime() - replay.startedAt.getTime()
      : 0;

    const eventsPerSecond = duration > 0 ? (replay.processedEvents / (duration / 1000)) : 0;

    return {
      totalEvents: replay.totalEvents,
      processedEvents: replay.processedEvents,
      skippedEvents: replay.skippedEvents,
      errorEvents: replay.errorEvents,
      duration,
      eventsPerSecond,
      conflicts: [], // Would be populated from actual conflicts
      warnings: [],
    };
  }

  /**
   * Calculate events per second for a replay
   */
  private calculateEventsPerSecond(replay: any): number {
    if (!replay.startedAt) return 0;
    
    const elapsed = Date.now() - replay.startedAt.getTime();
    return elapsed > 0 ? (replay.processedEvents / (elapsed / 1000)) : 0;
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTimeRemaining(
    replay: any,
    processedLedgers: number,
    totalLedgers: number,
  ): number | undefined {
    if (!replay.startedAt || processedLedgers === 0) return undefined;

    const elapsed = Date.now() - replay.startedAt.getTime();
    const avgTimePerLedger = elapsed / processedLedgers;
    const remainingLedgers = totalLedgers - processedLedgers;

    return Math.max(0, remainingLedgers * avgTimePerLedger / 1000);
  }

  /**
   * Get active replay count
   */
  private async getActiveReplayCount(): Promise<number> {
    return await this.prisma.eventReplay.count({
      where: {
        network: this.network,
        status: 'running',
      },
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Map database record to EventReplay
   */
  private mapToEventReplay(replay: any): EventReplay {
    return {
      id: replay.id,
      network: replay.network,
      startLedgerSeq: replay.startLedgerSeq,
      endLedgerSeq: replay.endLedgerSeq,
      status: replay.status as ReplayStatus,
      dryRun: replay.dryRun,
      conflictResolution: replay.conflictResolution as ConflictResolution,
      processedEvents: replay.processedEvents,
      totalEvents: replay.totalEvents,
      skippedEvents: replay.skippedEvents,
      errorEvents: replay.errorEvents,
      currentLedgerSeq: replay.currentLedgerSeq || undefined,
      errors: replay.errors as ReplayError[] || undefined,
      metadata: replay.metadata as Record<string, unknown> || undefined,
      startedAt: replay.startedAt || undefined,
      completedAt: replay.completedAt || undefined,
      createdAt: replay.createdAt,
      updatedAt: replay.updatedAt,
    };
  }

  /**
   * Map database record to ReplayEvent
   */
  private mapToReplayEvent(event: any): ReplayEvent {
    return {
      id: event.id,
      replayId: event.replayId,
      eventId: event.eventId,
      ledgerSeq: event.ledgerSeq,
      contractId: event.contractId,
      eventType: event.eventType,
      transactionHash: event.transactionHash,
      eventData: event.eventData as Record<string, unknown>,
      status: event.status as ReplayEventStatus,
      error: event.error || undefined,
      processedAt: event.processedAt || undefined,
      createdAt: event.createdAt,
    };
  }
}
