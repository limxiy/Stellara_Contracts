import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { SorobanRpc } from '@stellar/stellar-sdk';
import * as CircuitBreaker from 'opossum';
import { PrismaService } from '../../prisma.service';
import { LedgerTrackerService } from './ledger-tracker.service';
import { EventHandlerService } from './event-handler.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationService } from '../../notification/services/notification.service';
import { LedgerTrackerService } from './ledger-tracker.service';
import { EventHandlerService } from './event-handler.service';
import { SorobanEvent, ParsedContractEvent, ContractEventType } from '../types/event-types';
import { LedgerInfo } from '../types/ledger.types';

/**
 * Main indexer service that polls Stellar RPC for contract events
 * and synchronizes them to the local database
 */
@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private readonly rpc: SorobanRpc.Server;
  private readonly network: string;
  private readonly pollIntervalMs: number;
  private readonly maxEventsPerFetch: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly contractIds: string[];

  private isRunning = false;
  private isShuttingDown = false;

  // RPC endpoints for failover
  private rpcEndpoints: string[];
  private currentRpcIndex = 0;

  // Circuit breaker for RPC calls
  private rpcCircuitBreaker: CircuitBreaker;
  private readonly circuitBreakerOptions = {
    timeout: 30000, // 30 seconds
    errorThresholdPercentage: 50, // Open circuit after 50% failure rate
    resetTimeout: 30000, // Half-open after 30 seconds
    rollingCountTimeout: 10000, // Rolling window of 10 seconds
    rollingCountBuckets: 10,
    name: 'rpc-circuit-breaker',
    errorFilter: (error: Error) => {
      // Don't count rate limit errors as failures for circuit breaker
      return !error.message.includes('rate limit') && !error.message.includes('429');
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ledgerTracker: LedgerTrackerService,
    private readonly eventHandler: EventHandlerService,
    private readonly metricsService: MetricsService,
    private readonly notificationService: NotificationService,
  ) {
    // Initialize configuration
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    const primaryRpcUrl = this.configService.get<string>(
      'STELLAR_RPC_URL',
      'https://soroban-testnet.stellar.org',
    );

    // Initialize RPC endpoints with failover
    this.rpcEndpoints = this.configService.get<string[]>('STELLAR_RPC_ENDPOINTS', [primaryRpcUrl]);
    if (!this.rpcEndpoints.includes(primaryRpcUrl)) {
      this.rpcEndpoints.unshift(primaryRpcUrl); // Primary first
    }

    this.pollIntervalMs = this.configService.get<number>('INDEXER_POLL_INTERVAL_MS', 5000);
    this.maxEventsPerFetch = this.configService.get<number>('INDEXER_MAX_EVENTS_PER_FETCH', 100);
    this.retryAttempts = this.configService.get<number>('INDEXER_RETRY_ATTEMPTS', 3);
    this.retryDelayMs = this.configService.get<number>('INDEXER_RETRY_DELAY_MS', 1000);

    // Initialize RPC client with primary endpoint
    this.rpc = new SorobanRpc.Server(this.rpcEndpoints[0], {
      allowHttp: this.rpcEndpoints[0].startsWith('http://'),
    });

    // Initialize circuit breaker for RPC calls
    this.rpcCircuitBreaker = new CircuitBreaker(this.fetchEvents.bind(this), this.circuitBreakerOptions);
    this.setupCircuitBreakerEvents();

    // Get contract IDs to monitor
    this.contractIds = this.getContractIds();

    this.logger.log(`Indexer initialized for ${this.network} network`);
    this.logger.log(`RPC URL: ${rpcUrl}`);
    this.logger.log(`Monitoring contracts: ${this.contractIds.join(', ') || 'none configured'}`);
  }

  /**
   * Get list of contract IDs to monitor from configuration
   */
  private getContractIds(): string[] {
    const contracts: string[] = [];

    const projectLaunch = this.configService.get<string>('PROJECT_LAUNCH_CONTRACT_ID');
    if (projectLaunch) contracts.push(projectLaunch);

    const escrow = this.configService.get<string>('ESCROW_CONTRACT_ID');
    if (escrow) contracts.push(escrow);

    const profitDist = this.configService.get<string>('PROFIT_DISTRIBUTION_CONTRACT_ID');
    if (profitDist) contracts.push(profitDist);

    const subscription = this.configService.get<string>('SUBSCRIPTION_POOL_CONTRACT_ID');
    if (subscription) contracts.push(subscription);

    const governance = this.configService.get<string>('GOVERNANCE_CONTRACT_ID');
    if (governance) contracts.push(governance);

    const reputation = this.configService.get<string>('REPUTATION_CONTRACT_ID');
    if (reputation) contracts.push(reputation);

    return contracts;
  }

  /**
   * Setup circuit breaker event handlers
   */
  private setupCircuitBreakerEvents(): void {
    this.rpcCircuitBreaker.on('open', () => {
      this.logger.error('RPC Circuit Breaker OPENED - RPC calls will fail fast');
      this.metricsService.setRpcCircuitBreakerState('open');
      // TODO: Send alert notification to operators
      this.sendAlert('RPC Circuit Breaker Opened', 'RPC calls are failing fast due to repeated errors');
    });

    this.rpcCircuitBreaker.on('halfOpen', () => {
      this.logger.warn('RPC Circuit Breaker HALF-OPEN - Testing RPC connectivity');
      this.metricsService.setRpcCircuitBreakerState('half-open');
    });

    this.rpcCircuitBreaker.on('close', () => {
      this.logger.log('RPC Circuit Breaker CLOSED - RPC calls restored');
      this.metricsService.setRpcCircuitBreakerState('closed');
      this.sendAlert('RPC Circuit Breaker Closed', 'RPC connectivity restored');
    });

    this.rpcCircuitBreaker.on('fallback', (result) => {
      this.logger.warn('RPC Circuit Breaker FALLBACK triggered', result);
    });

    this.rpcCircuitBreaker.on('timeout', () => {
      this.logger.warn('RPC Circuit Breaker TIMEOUT');
      this.metricsService.recordRpcError('timeout');
    });

    this.rpcCircuitBreaker.on('success', (result) => {
      this.metricsService.recordRpcRequest('getEvents', 'success');
    });

    this.rpcCircuitBreaker.on('failure', (error) => {
      this.metricsService.recordRpcRequest('getEvents', 'error');
      this.metricsService.recordRpcError(error.message.includes('rate limit') ? 'rate_limit' : 'other');
    });
  }

  /**
   * Send alert notification to operators
   */
  private async sendAlert(title: string, message: string): Promise<void> {
    try {
      // Find admin users or users with alert preferences
      const alertUsers = await this.prisma.user.findMany({
        where: {
          notificationSettings: {
            emailEnabled: true,
            // Add more conditions for alert preferences if needed
          },
        },
        select: { id: true },
      });

      for (const user of alertUsers) {
        await this.notificationService.notify(
          user.id,
          'SYSTEM_ALERT',
          title,
          message,
          { alertType: 'rpc_failure' }
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send alert notification: ${error.message}`);
    }
  }

  /**
   * Rotate to next RPC endpoint for failover
   */
  private rotateRpcEndpoint(): void {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcEndpoints.length;
    const newRpcUrl = this.rpcEndpoints[this.currentRpcIndex];

    this.logger.warn(`Switching RPC endpoint to: ${newRpcUrl}`);
    this.rpc = new SorobanRpc.Server(newRpcUrl, {
      allowHttp: newRpcUrl.startsWith('http://'),
    });
  }

  /**
   * Lifecycle hook - called when module initializes
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Starting blockchain indexer...');
    await this.initializeIndexer();
  }

  /**
   * Lifecycle hook - called when module destroys
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down blockchain indexer...');
    this.isShuttingDown = true;

    // Wait for current processing to complete
    while (this.isRunning) {
      await this.sleep(100);
    }

    this.logger.log('Indexer shutdown complete');
  }

  /**
   * Initialize the indexer
   */
  private async initializeIndexer(): Promise<void> {
    try {
      // Test RPC connection
      const health = await this.rpc.getHealth();
      this.logger.log(`RPC Health: ${health.status}`);

      // Get latest ledger
      const latestLedger = await this.getLatestLedger();
      this.logger.log(`Latest ledger on network: ${latestLedger}`);

      // Initialize or resume from cursor
      const startLedger = await this.ledgerTracker.getStartLedger(latestLedger);
      this.logger.log(`Starting indexing from ledger ${startLedger}`);

      // Trigger initial sync
      await this.pollEvents();
    } catch (error) {
      this.logger.error(`Failed to initialize indexer: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Scheduled polling job - runs at configured interval
   */
  @Interval(5000) // Will use dynamic interval from config
  async scheduledPoll(): Promise<void> {
    if (this.isShuttingDown) return;
    await this.pollEvents();
  }

  /**
   * Main polling loop - fetches and processes events
   */
  async pollEvents(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Skipping poll - previous poll still running');
      return;
    }

    this.isRunning = true;

    try {
      // Get current cursor
      const cursor = await this.ledgerTracker.getLastCursor();
      const startLedger = cursor ? cursor.lastLedgerSeq + 1 : 1;

      // Get latest ledger from network
      const latestLedger = await this.getLatestLedger();

      // Check if there's anything to process
      if (startLedger > latestLedger) {
        this.logger.debug(`No new ledgers. Current: ${startLedger - 1}, Latest: ${latestLedger}`);
        return;
      }

      this.logger.log(`Polling events from ledger ${startLedger} to ${latestLedger}`);

      // Fetch events with retry logic
      const events = await this.fetchEventsWithRetry(startLedger, latestLedger);

      if (events.length === 0) {
        this.logger.debug('No events found in ledger range');
        // Still update cursor to show progress
        await this.ledgerTracker.updateCursor(latestLedger);
        return;
      }

      this.logger.log(`Found ${events.length} events to process`);

      // Process events
      let processedCount = 0;
      let errorCount = 0;

      for (const event of events) {
        try {
          const success = await this.processEvent(event);
          if (success) processedCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to process event ${event.id}: ${error.message}`);

          // Continue processing other events even if one fails
          // But log the error for monitoring
          await this.ledgerTracker.logError(`Event processing failed: ${event.id}`, {
            eventId: event.id,
            error: error.message,
          });
        }
      }

      // Update cursor to latest processed ledger
      await this.ledgerTracker.updateCursor(latestLedger);

      // Log progress
      await this.ledgerTracker.logProgress(latestLedger, latestLedger, processedCount);

      this.logger.log(`Processed ${processedCount}/${events.length} events (${errorCount} errors)`);
    } catch (error) {
      this.logger.error(`Error in poll cycle: ${error.message}`, error.stack);
      await this.ledgerTracker.logError('Poll cycle failed', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch events from RPC with circuit breaker protection
   */
  private async fetchEventsWithRetry(
    startLedger: number,
    endLedger: number,
  ): Promise<SorobanEvent[]> {
    try {
      // Use circuit breaker to call fetchEvents
      return await this.rpcCircuitBreaker.fire(startLedger, endLedger);
    } catch (error) {
      // Circuit breaker fallback - return empty array to prevent indexer from stopping
      this.logger.error(`RPC Circuit Breaker failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch events from Soroban RPC with endpoint failover
   */
  private async fetchEvents(startLedger: number, endLedger: number): Promise<SorobanEvent[]> {
    const startTime = Date.now();
    const events: SorobanEvent[] = [];
    let cursor: string | undefined;
    let lastError: Error | null = null;

    // Try each RPC endpoint until one succeeds
    for (let attempt = 0; attempt < this.rpcEndpoints.length; attempt++) {
      try {
        // Build filters for contract events
        const filters: SorobanRpc.Api.EventFilter[] = [];

        if (this.contractIds.length > 0) {
          // Add contract ID filters
          for (const contractId of this.contractIds) {
            filters.push({
              type: 'contract',
              contractIds: [contractId],
            });
          }
        } else {
          // If no contracts specified, fetch all contract events
          filters.push({
            type: 'contract',
          });
        }

        do {
          const request = {
            startLedger,
            filters,
            limit: this.maxEventsPerFetch,
            cursor,
          };

          const response = await this.rpc.getEvents(request);

          if (response.events) {
            for (const event of response.events) {
              events.push(this.transformRpcEvent(event));
            }
          }

          cursor = (response as any).cursor;

          // Safety check - don't fetch too many events at once
          if (events.length >= this.maxEventsPerFetch * 5) {
            this.logger.warn(`Event fetch limit reached. Processing ${events.length} events.`);
            break;
          }
        } while (cursor);

        // Success - record metrics
        const duration = (Date.now() - startTime) / 1000;
        this.metricsService.recordRpcRequest('getEvents', 'success', duration);
        return events;

      } catch (error) {
        lastError = error;
        this.logger.warn(`RPC endpoint ${this.rpcEndpoints[this.currentRpcIndex]} failed: ${error.message}`);

        // Rotate to next endpoint
        this.rotateRpcEndpoint();

        // Record error metrics
        this.metricsService.recordRpcError(error.message.includes('rate limit') ? 'rate_limit' : 'endpoint_failure');
      }
    }

    // All endpoints failed
    const duration = (Date.now() - startTime) / 1000;
    this.metricsService.recordRpcRequest('getEvents', 'error', duration);
    throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`);
  }

  /**
   * Transform RPC event to internal format
   */
  private transformRpcEvent(event: SorobanRpc.Api.EventResponse): SorobanEvent {
    return {
      type: event.type,
      ledger: event.ledger,
      ledgerClosedAt: event.ledgerClosedAt,
      contractId: event.contractId.toString(),
      id: event.id,
      pagingToken: event.pagingToken,
      topic: event.topic.map((t: any) => t.toString()),
      value: event.value.toString(),
      inSuccessfulContractCall: event.inSuccessfulContractCall,
      txHash: (event as any).txHash || (event as any).transactionHash || '',
    };
  }

  /**
   * Process a single event
   */
  private async processEvent(event: SorobanEvent): Promise<boolean> {
    // Check if already processed (idempotency)
    const isProcessed = await this.ledgerTracker.isEventProcessed(event.id);
    if (isProcessed) {
      this.logger.debug(`Event ${event.id} already processed, skipping`);
      return false;
    }

    // Parse event
    const parsedEvent = this.parseEvent(event);
    if (!parsedEvent) {
      this.logger.warn(`Failed to parse event ${event.id}`);
      return false;
    }

    // Process through handler
    const success = await this.eventHandler.processEvent(parsedEvent);

    if (success) {
      // Mark as processed
      await this.ledgerTracker.markEventProcessed(
        event.id,
        event.ledger,
        event.contractId,
        parsedEvent.eventType,
        event.txHash,
      );
    }

    return success;
  }

  /**
   * Parse raw event into structured format
   */
  private parseEvent(event: SorobanEvent): ParsedContractEvent | null {
    try {
      // Extract event type from topic
      // Topic structure: [event_type_symbol, ...other_topics]
      const eventTypeSymbol = event.topic[0];
      if (!eventTypeSymbol) {
        this.logger.warn(`Event ${event.id} missing topic`);
        return null;
      }

      // Parse event type
      const eventType = this.parseEventType(eventTypeSymbol);
      if (!eventType) {
        this.logger.debug(`Unknown event type: ${eventTypeSymbol}`);
        return null;
      }

      // Parse event data from XDR value
      const data = this.parseEventData(event.value, eventType);

      return {
        eventId: event.id,
        ledgerSeq: event.ledger,
        ledgerClosedAt: new Date(event.ledgerClosedAt),
        contractId: event.contractId,
        eventType,
        transactionHash: event.txHash,
        data,
        inSuccessfulContractCall: event.inSuccessfulContractCall,
      };
    } catch (error) {
      this.logger.error(`Error parsing event ${event.id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse event type from topic symbol
   */
  private parseEventType(symbol: string): ContractEventType | null {
    // Map symbol to event type enum
    const eventType = Object.values(ContractEventType).find((type) => type === symbol);
    return eventType || null;
  }

  /**
   * Parse event data from XDR value
   * This is a simplified parser - in production, you'd use proper XDR decoding
   */
  private parseEventData(valueXdr: string, eventType: ContractEventType): Record<string, unknown> {
    try {
      // For now, return a placeholder - proper XDR parsing requires
      // the Soroban SDK's ScVal parsing which depends on the specific event structure
      // This should be enhanced based on your actual event data structure

      // Attempt basic XDR parsing if possible
      // Note: Full implementation would use xdr.ScVal.fromXDR() and proper type conversion

      return {
        rawXdr: valueXdr,
        eventType,
        // Add parsed fields based on event type
        // This is where you'd decode the actual event data
      };
    } catch (error) {
      this.logger.warn(`Failed to parse event data: ${error.message}`);
      return { rawXdr: valueXdr };
    }
  }

  /**
   * Get latest ledger from RPC
   */
  private async getLatestLedger(): Promise<number> {
    const latestLedger = await this.rpc.getLatestLedger();
    return latestLedger.sequence;
  }

  /**
   * Get ledger info
   */
  private async getLedgerInfo(sequence: number): Promise<LedgerInfo> {
    // Note: This would use getLedger RPC method
    // For now, return basic info
    return {
      sequence,
      hash: '', // Would be populated from RPC
      prevHash: '',
      closedAt: new Date(),
      successfulTransactionCount: 0,
      failedTransactionCount: 0,
    };
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
