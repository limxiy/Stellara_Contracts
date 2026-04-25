import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge, Summary } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total') private readonly httpRequests: Counter<string>,
    @InjectMetric('http_request_duration_seconds') private readonly httpDuration: Histogram<string>,
    @InjectMetric('errors_total') private readonly errors: Counter<string>,
    @InjectMetric('contributions_total') private readonly contributions: Counter<string>,
    @InjectMetric('notifications_sent_total') private readonly notificationsSent: Counter<string>,
    @InjectMetric('notifications_deduplicated_total') private readonly notificationsDeduped: Counter<string>,
    @InjectMetric('active_projects_total') private readonly activeProjects: Gauge<string>,
    @InjectMetric('active_users_total') private readonly activeUsers: Gauge<string>,
    @InjectMetric('indexer_current_ledger') private readonly indexerCurrent: Gauge<string>,
    @InjectMetric('indexer_network_ledger') private readonly indexerNetwork: Gauge<string>,
    @InjectMetric('indexer_lag_ledgers') private readonly indexerLag: Gauge<string>,
    @InjectMetric('indexer_polls_total') private readonly indexerPolls: Counter<string>,
    @InjectMetric('indexer_events_per_poll') private readonly indexerEventsPerPoll: Histogram<string>,
    @InjectMetric('blockchain_events_processed_total') private readonly blockchainEvents: Counter<string>,
    @InjectMetric('websocket_connections_active') private readonly wsConnections: Gauge<string>,
    @InjectMetric('cache_hits_total') private readonly cacheHits: Counter<string>,
    @InjectMetric('cache_misses_total') private readonly cacheMisses: Counter<string>,
    @InjectMetric('db_query_duration_seconds') private readonly dbDuration: Histogram<string>,
    @InjectMetric('rpc_requests_total') private readonly rpcRequests: Counter<string>,
    @InjectMetric('rpc_request_duration_seconds') private readonly rpcDuration: Histogram<string>,
    @InjectMetric('rpc_errors_total') private readonly rpcErrors: Counter<string>,
    @InjectMetric('rpc_circuit_breaker_state') private readonly rpcCircuitState: Gauge<string>,
    @InjectMetric('email_retry_runs_total') private readonly emailRetryRuns: Counter<string>,
    @InjectMetric('email_retry_processed_total') private readonly emailRetryProcessed: Counter<string>,
    @InjectMetric('email_retry_api_key_missing_total') private readonly emailRetryApiKeyMissing: Counter<string>,
    @InjectMetric('email_retry_backoff_skips_total') private readonly emailRetryBackoffSkips: Counter<string>,
    @InjectMetric('email_retry_old_skips_total') private readonly emailRetryOldSkips: Counter<string>,
    @InjectMetric('email_retry_batch_size') private readonly emailRetryBatchSize: Gauge<string>,
    @InjectMetric('email_retry_pending_failed') private readonly emailRetryPendingFailed: Gauge<string>,
    @InjectMetric('email_retry_duration_seconds') private readonly emailRetryDuration: Histogram<string>,
    @InjectMetric('project_metadata_fetch_total') private readonly projectMetadataFetch: Counter<string>,
    @InjectMetric('project_metadata_completeness_total') private readonly projectMetadataCompleteness: Counter<string>,
    // Reorg metrics
    @InjectMetric('blockchain_reorgs_total') private readonly reorgs: Counter<string>,
    @InjectMetric('blockchain_reorg_depth') private readonly reorgDepth: Histogram<string>,
    @InjectMetric('blockchain_reorg_rollback_events_total') private readonly reorgRollbackEvents: Counter<string>,
    @InjectMetric('blockchain_reorg_duration_seconds') private readonly reorgDuration: Histogram<string>,
    // Enhanced indexer performance metrics
    @InjectMetric('indexer_batch_processing_duration_seconds') private readonly batchProcessingDuration: Histogram<string>,
    @InjectMetric('indexer_ledger_processing_duration_seconds') private readonly ledgerProcessingDuration: Histogram<string>,
    @InjectMetric('indexer_event_processing_duration_seconds') private readonly eventProcessingDuration: Histogram<string>,
    @InjectMetric('indexer_lag_duration_seconds') private readonly indexerLagDuration: Gauge<string>,
    @InjectMetric('indexer_processing_rate_events_per_second') private readonly processingRate: Gauge<string>,
    @InjectMetric('indexer_event_success_rate') private readonly eventSuccessRate: Gauge<string>,
    @InjectMetric('indexer_event_error_rate') private readonly eventErrorRate: Gauge<string>,
    @InjectMetric('indexer_events_processed_total') private readonly eventsProcessed: Counter<string>,
    @InjectMetric('indexer_events_failed_total') private readonly eventsFailed: Counter<string>,
    @InjectMetric('indexer_ledgers_processed_total') private readonly ledgersProcessed: Counter<string>,
    @InjectMetric('indexer_batch_size_ledgers') private readonly batchSize: Histogram<string>,
    @InjectMetric('indexer_queue_depth') private readonly queueDepth: Gauge<string>,
    @InjectMetric('indexer_memory_usage_bytes') private readonly memoryUsage: Gauge<string>,
    @InjectMetric('indexer_cpu_usage_percent') private readonly cpuUsage: Gauge<string>,
    @InjectMetric('indexer_reconnects_total') private readonly reconnects: Counter<string>,
    @InjectMetric('indexer_uptime_seconds') private readonly uptime: Gauge<string>,
  ) { }

  // HTTP
  recordHttpRequest(method: string, route: string, status: number, durationSec: number) {
    this.httpRequests.inc({ method, route, status: String(status) });
    this.httpDuration.observe({ method, route }, durationSec);
  }

  // Errors
  recordError(type: string, endpoint: string) {
    this.errors.inc({ type, endpoint });
  }

  // Business
  recordContribution(status: 'success' | 'failed' | 'pending') {
    this.contributions.inc({ status });
  }

  recordNotificationSent(type: string) {
    this.notificationsSent.inc({ type });
  }

  recordNotificationDeduplicated(type: string) {
    this.notificationsDeduped.inc({ type });
  }

  setActiveProjects(count: number) { this.activeProjects.set(count); }
  setActiveUsers(count: number) { this.activeUsers.set(count); }

  // Indexer / Blockchain
  updateIndexerLag(current: number, network: number) {
    this.indexerCurrent.set(current);
    this.indexerNetwork.set(network);
    this.indexerLag.set(Math.max(0, network - current));
  }

  recordIndexerPoll(status: 'success' | 'partial' | 'error' | 'noop', eventCount: number) {
    this.indexerPolls.inc({ status });
    this.indexerEventsPerPoll.observe(eventCount);
  }

  recordBlockchainEvent(eventType: string) {
    this.blockchainEvents.inc({ event_type: eventType });
  }

  // WebSocket
  incrementWsConnections() { this.wsConnections.inc(); }
  decrementWsConnections() { this.wsConnections.dec(); }

  // Cache
  recordCacheHit(cache: string) { this.cacheHits.inc({ cache }); }
  recordCacheMiss(cache: string) { this.cacheMisses.inc({ cache }); }

  // DB
  recordDbQuery(operation: string, durationSec: number) {
    this.dbDuration.observe({ operation }, durationSec);
  }

  // RPC
  recordRpcRequest(method: string, status: 'success' | 'error', durationSec?: number) {
    this.rpcRequests.inc({ method, status });
    if (durationSec !== undefined) {
      this.rpcDuration.observe({ method }, durationSec);
    }
  }

  recordRpcError(errorType: string) {
    this.rpcErrors.inc({ error_type: errorType });
  }

  setRpcCircuitBreakerState(state: 'closed' | 'open' | 'half-open') {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    this.rpcCircuitState.set(stateValue);
  }

  // Email retry
  recordEmailRetryRun(status: 'completed' | 'no_work' | 'skipped_missing_api_key') {
    this.emailRetryRuns.inc({ status });
  }

  recordEmailRetryProcessed(outcome: 'sent' | 'failed' | 'max_attempts_reached') {
    this.emailRetryProcessed.inc({ outcome });
  }

  recordEmailRetryApiKeyMissing() {
    this.emailRetryApiKeyMissing.inc();
  }

  recordEmailRetryBackoffSkip() {
    this.emailRetryBackoffSkips.inc();
  }

  recordEmailRetryOldSkip(count = 1) {
    this.emailRetryOldSkips.inc({ reason: 'max_retry_age' }, count);
  }

  setEmailRetryBatchSize(count: number) {
    this.emailRetryBatchSize.set(count);
  }

  setEmailRetryPendingFailed(count: number) {
    this.emailRetryPendingFailed.set(count);
  }

  recordEmailRetryDuration(durationSec: number) {
    this.emailRetryDuration.observe(durationSec);
  }

  // Project metadata
  recordProjectMetadataFetch(outcome: 'fetched' | 'cached' | 'fetch_failed' | 'no_hash') {
    this.projectMetadataFetch.inc({ outcome });
  }

  recordProjectMetadataCompleteness(level: 'complete' | 'partial' | 'minimal' | 'fallback') {
    this.projectMetadataCompleteness.inc({ level });
  }

  // Reorg metrics
  recordReorg(depth: number) {
    this.reorgs.inc();
    this.reorgDepth.observe(depth);
  }

  recordReorgRollback(eventCount: number) {
    this.reorgRollbackEvents.inc({ event_type: 'rollback' }, eventCount);
  }

  recordReorgDuration(durationSec: number) {
    this.reorgDuration.observe(durationSec);
  }

  // Enhanced Indexer Performance Metrics

  /**
   * Record batch processing duration
   */
  recordBatchProcessingDuration(durationSec: number, batchSize: number) {
    this.batchProcessingDuration.observe(durationSec);
    this.batchSize.observe(batchSize);
  }

  /**
   * Record ledger processing duration
   */
  recordLedgerProcessingDuration(durationSec: number, ledgerCount: number) {
    this.ledgerProcessingDuration.observe(durationSec);
    this.ledgersProcessed.inc({ status: 'success' }, ledgerCount);
  }

  /**
   * Record individual event processing duration
   */
  recordEventProcessingDuration(durationSec: number, eventType: string, success: boolean) {
    this.eventProcessingDuration.observe({ event_type: eventType }, durationSec);

    if (success) {
      this.eventsProcessed.inc({ event_type: eventType });
    } else {
      this.eventsFailed.inc({ event_type: eventType });
    }
  }

  /**
   * Update indexer lag in seconds (more precise than ledger lag)
   */
  updateIndexerLagDuration(lagSeconds: number) {
    this.indexerLagDuration.set(lagSeconds);
  }

  /**
   * Update processing rate (events per second)
   */
  updateProcessingRate(eventsPerSecond: number) {
    this.processingRate.set(eventsPerSecond);
  }

  /**
   * Update event success and error rates
   */
  updateEventRates(successRate: number, errorRate: number) {
    this.eventSuccessRate.set(successRate);
    this.eventErrorRate.set(errorRate);
  }

  /**
   * Record batch processing results
   */
  recordBatchResults(
    batchSize: number,
    processedCount: number,
    errorCount: number,
    skippedCount: number,
    durationSec: number
  ) {
    this.batchProcessingDuration.observe(durationSec);
    this.batchSize.observe(batchSize);
    this.eventsProcessed.inc({ status: 'success' }, processedCount);
    this.eventsFailed.inc({ status: 'error' }, errorCount);

    // Update rates
    const totalEvents = processedCount + errorCount + skippedCount;
    if (totalEvents > 0) {
      const successRate = (processedCount / totalEvents) * 100;
      const errorRate = (errorCount / totalEvents) * 100;
      this.updateEventRates(successRate, errorRate);
    }
  }

  /**
   * Update queue depth (number of pending items)
   */
  updateQueueDepth(depth: number) {
    this.queueDepth.set(depth);
  }

  /**
   * Update memory usage in bytes
   */
  updateMemoryUsage(bytes: number) {
    this.memoryUsage.set(bytes);
  }

  /**
   * Update CPU usage percentage
   */
  updateCpuUsage(percent: number) {
    this.cpuUsage.set(percent);
  }

  /**
   * Record indexer reconnection
   */
  recordReconnection(reason: string) {
    this.reconnects.inc({ reason });
  }

  /**
   * Update indexer uptime in seconds
   */
  updateUptime(seconds: number) {
    this.uptime.set(seconds);
  }

  /**
   * Record ledger range processing
   */
  recordLedgerRangeProcessing(startLedger: number, endLedger: number, durationSec: number, success: boolean) {
    const ledgerCount = endLedger - startLedger + 1;
    this.ledgerProcessingDuration.observe({ range: `${startLedger}-${endLedger}` }, durationSec);

    if (success) {
      this.ledgersProcessed.inc({ status: 'success' }, ledgerCount);
    } else {
      this.ledgersProcessed.inc({ status: 'error' }, ledgerCount);
    }
  }

  /**
   * Record event processing statistics for a time window
   */
  recordEventProcessingStats(
    windowDurationSec: number,
    totalEvents: number,
    successfulEvents: number,
    failedEvents: number,
    skippedEvents: number
  ) {
    // Calculate rates
    const eventsPerSecond = totalEvents / windowDurationSec;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0;
    const errorRate = totalEvents > 0 ? (failedEvents / totalEvents) * 100 : 0;

    this.updateProcessingRate(eventsPerSecond);
    this.updateEventRates(successRate, errorRate);

    // Record counters
    this.eventsProcessed.inc({ status: 'success' }, successfulEvents);
    this.eventsFailed.inc({ status: 'error' }, failedEvents);
  }

  /**
   * Record indexer health metrics
   */
  recordIndexerHealth(
    isHealthy: boolean,
    currentLedger: number,
    networkLedger: number,
    memoryUsage: number,
    cpuUsage: number,
    uptime: number
  ) {
    // Update lag metrics
    this.updateIndexerLag(currentLedger, networkLedger);

    // Calculate lag duration (assuming ~5 seconds per ledger)
    const lagLedgers = Math.max(0, networkLedger - currentLedger);
    const lagSeconds = lagLedgers * 5;
    this.updateIndexerLagDuration(lagSeconds);

    // Update system metrics
    this.updateMemoryUsage(memoryUsage);
    this.updateCpuUsage(cpuUsage);
    this.updateUptime(uptime);

    // Record health status
    this.errors.inc({ type: 'health_check', status: isHealthy ? 'healthy' : 'unhealthy' });
  }

  /**
   * Reset performance counters (useful for testing or restart)
   */
  resetPerformanceCounters() {
    // Note: This would require access to the prom-client registry
    // Implementation depends on the specific prometheus client setup
    this.errors.inc({ type: 'system', action: 'counters_reset' });
  }

  /**
   * Get performance summary (for internal monitoring)
   */
  getPerformanceSummary() {
    // This would typically be implemented by querying the prometheus client
    // For now, return a placeholder structure
    return {
      processingRate: 0,
      successRate: 0,
      errorRate: 0,
      lagSeconds: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      uptime: 0,
    };
  }
}