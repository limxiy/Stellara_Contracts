import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total')       private readonly httpRequests: Counter<string>,
    @InjectMetric('http_request_duration_seconds') private readonly httpDuration: Histogram<string>,
    @InjectMetric('errors_total')              private readonly errors: Counter<string>,
    @InjectMetric('contributions_total')       private readonly contributions: Counter<string>,
    @InjectMetric('notifications_sent_total')  private readonly notificationsSent: Counter<string>,
    @InjectMetric('notifications_deduplicated_total') private readonly notificationsDeduped: Counter<string>,
    @InjectMetric('active_projects_total')     private readonly activeProjects: Gauge<string>,
    @InjectMetric('active_users_total')        private readonly activeUsers: Gauge<string>,
    @InjectMetric('indexer_current_ledger')    private readonly indexerCurrent: Gauge<string>,
    @InjectMetric('indexer_network_ledger')    private readonly indexerNetwork: Gauge<string>,
    @InjectMetric('indexer_lag_ledgers')       private readonly indexerLag: Gauge<string>,
    @InjectMetric('blockchain_events_processed_total') private readonly blockchainEvents: Counter<string>,
    @InjectMetric('websocket_connections_active') private readonly wsConnections: Gauge<string>,
    @InjectMetric('cache_hits_total')          private readonly cacheHits: Counter<string>,
    @InjectMetric('cache_misses_total')        private readonly cacheMisses: Counter<string>,
    @InjectMetric('db_query_duration_seconds') private readonly dbDuration: Histogram<string>,
    @InjectMetric('rpc_requests_total')        private readonly rpcRequests: Counter<string>,
    @InjectMetric('rpc_request_duration_seconds') private readonly rpcDuration: Histogram<string>,
    @InjectMetric('rpc_errors_total')          private readonly rpcErrors: Counter<string>,
    @InjectMetric('rpc_circuit_breaker_state') private readonly rpcCircuitState: Gauge<string>,
  ) {}

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
  setActiveUsers(count: number)    { this.activeUsers.set(count); }

  // Indexer / Blockchain
  updateIndexerLag(current: number, network: number) {
    this.indexerCurrent.set(current);
    this.indexerNetwork.set(network);
    this.indexerLag.set(Math.max(0, network - current));
  }

  recordBlockchainEvent(eventType: string) {
    this.blockchainEvents.inc({ event_type: eventType });
  }

  // WebSocket
  incrementWsConnections()  { this.wsConnections.inc(); }
  decrementWsConnections()  { this.wsConnections.dec(); }

  // Cache
  recordCacheHit(cache: string)  { this.cacheHits.inc({ cache }); }
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
}