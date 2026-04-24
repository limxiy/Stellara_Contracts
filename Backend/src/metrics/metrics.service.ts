import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

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
}