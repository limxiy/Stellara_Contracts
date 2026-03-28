import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderBookManagerService } from './order-book-manager.service';
import { OrderBookUpdate, Trade } from '../types/order-book.types';

/**
 * Performance monitoring service for order book operations
 * Tracks latency, throughput, and SLA compliance
 */
@Injectable()
export class OrderBookPerformanceMonitor implements OnModuleInit {
  private readonly logger = new Logger(OrderBookPerformanceMonitor.name);

  // Sliding window metrics (last 60 seconds)
  private metricsWindow: MetricsWindow[] = [];
  
  // Alert thresholds
  private readonly thresholds = {
    addOrderLatencyP99: 100, // microseconds
    cancelOrderLatencyP99: 50, // microseconds
    matchOrderLatencyP99: 200, // microseconds
    broadcastLatencyP99: 1000, // microseconds (1ms)
    ordersPerSecondMin: 1000,
    memoryUsageMax: 1024 * 1024 * 1024, // 1GB
  };

  // Real-time counters
  private currentWindow: MetricsWindow = this.createMetricsWindow();
  private lastCleanupTime: number = Date.now();

  constructor(
    private orderBookManager: OrderBookManagerService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Start metrics collection loop
    this.startMetricsCollection();
    
    // Start alert monitoring
    this.startAlertMonitoring();

    this.logger.log('OrderBookPerformanceMonitor initialized');
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceReport {
    const aggregateMetrics = this.orderBookManager.getAggregateMetrics();
    
    let totalOrders = 0;
    let totalTrades = 0;
    let totalMemory = 0;

    for (const [symbol, metric] of Object.entries(aggregateMetrics)) {
      totalOrders += metric.activeOrders;
      totalMemory += metric.memoryUsageBytes;
    }

    return {
      timestamp: Date.now(),
      activeOrders: totalOrders,
      tradesLastMinute: this.currentWindow.trades,
      ordersAddedLastMinute: this.currentWindow.ordersAdded,
      ordersCancelledLastMinute: this.currentWindow.ordersCancelled,
      avgAddLatency: this.calculateAverageLatency('add'),
      avgCancelLatency: this.calculateAverageLatency('cancel'),
      avgMatchLatency: this.calculateAverageLatency('match'),
      memoryUsageBytes: totalMemory,
      windowsAnalyzed: this.metricsWindow.length,
    };
  }

  /**
   * Check if meeting SLA targets
   */
  checkSLACompliance(): SLAReport {
    const metrics = this.getCurrentMetrics();
    
    const slaChecks = {
      latencyTarget: metrics.avgAddLatency < this.thresholds.addOrderLatencyP99,
      throughputTarget: metrics.ordersAddedLastMinute / 60 >= this.thresholds.ordersPerSecondMin,
      memoryTarget: metrics.memoryUsageBytes < this.thresholds.memoryUsageMax,
    };

    const compliant = Object.values(slaChecks).every(check => check);

    return {
      timestamp: Date.now(),
      isCompliant: compliant,
      checks: slaChecks,
      details: {
        avgAddLatencyUs: metrics.avgAddLatency,
        ordersPerSecond: metrics.ordersAddedLastMinute / 60,
        memoryUsageMB: Math.round(metrics.memoryUsageBytes / (1024 * 1024)),
      },
    };
  }

  /**
   * Get historical performance data
   */
  getHistoricalData(minutes: number = 5): MetricsWindow[] {
    return this.metricsWindow.slice(-minutes);
  }

  /**
   * Record order addition
   */
  recordOrderAdd(latencyUs: number): void {
    this.currentWindow.ordersAdded++;
    this.currentWindow.addLatencies.push(latencyUs);
    
    // Keep only last 1000 samples per window
    if (this.currentWindow.addLatencies.length > 1000) {
      this.currentWindow.addLatencies.shift();
    }
  }

  /**
   * Record order cancellation
   */
  recordOrderCancel(latencyUs: number): void {
    this.currentWindow.ordersCancelled++;
    this.currentWindow.cancelLatencies.push(latencyUs);
    
    if (this.currentWindow.cancelLatencies.length > 1000) {
      this.currentWindow.cancelLatencies.shift();
    }
  }

  /**
   * Record order match
   */
  recordOrderMatch(latencyUs: number): void {
    this.currentWindow.ordersMatched++;
    this.currentWindow.matchLatencies.push(latencyUs);
    
    if (this.currentWindow.matchLatencies.length > 1000) {
      this.currentWindow.matchLatencies.shift();
    }
  }

  /**
   * Record trade execution
   */
  recordTrade(): void {
    this.currentWindow.trades++;
  }

  /**
   * Record WebSocket broadcast
   */
  recordBroadcast(latencyUs: number): void {
    this.currentWindow.broadcastLatencies.push(latencyUs);
    
    if (this.currentWindow.broadcastLatencies.length > 1000) {
      this.currentWindow.broadcastLatencies.shift();
    }
  }

  // Private helper methods

  private startMetricsCollection() {
    // Create new window every minute
    setInterval(() => {
      // Save current window
      this.metricsWindow.push({ ...this.currentWindow });
      
      // Keep only last 60 windows (1 hour)
      if (this.metricsWindow.length > 60) {
        this.metricsWindow.shift();
      }
      
      // Reset current window
      this.currentWindow = this.createMetricsWindow();
      
      this.logger.debug(`Metrics window saved. Total windows: ${this.metricsWindow.length}`);
    }, 60000); // 1 minute
  }

  private startAlertMonitoring() {
    // Check SLA every 10 seconds
    setInterval(() => {
      const slaReport = this.checkSLACompliance();
      
      if (!slaReport.isCompliant) {
        this.logger.warn('SLA compliance breach detected', JSON.stringify(slaReport.details));
        this.eventEmitter.emit('orderbook.sla.breach', slaReport);
      }
    }, 10000);
  }

  private calculateAverageLatency(type: 'add' | 'cancel' | 'match'): number {
    let latencies: number[] = [];
    
    switch (type) {
      case 'add':
        latencies = this.currentWindow.addLatencies;
        break;
      case 'cancel':
        latencies = this.currentWindow.cancelLatencies;
        break;
      case 'match':
        latencies = this.currentWindow.matchLatencies;
        break;
    }

    if (latencies.length === 0) return 0;
    
    const sum = latencies.reduce((a, b) => a + b, 0);
    return Math.round(sum / latencies.length);
  }

  private createMetricsWindow(): MetricsWindow {
    return {
      timestamp: Date.now(),
      ordersAdded: 0,
      ordersCancelled: 0,
      ordersMatched: 0,
      trades: 0,
      addLatencies: [],
      cancelLatencies: [],
      matchLatencies: [],
      broadcastLatencies: [],
    };
  }
}

// Type definitions

interface MetricsWindow {
  timestamp: number;
  ordersAdded: number;
  ordersCancelled: number;
  ordersMatched: number;
  trades: number;
  addLatencies: number[];
  cancelLatencies: number[];
  matchLatencies: number[];
  broadcastLatencies: number[];
}

interface PerformanceReport {
  timestamp: number;
  activeOrders: number;
  tradesLastMinute: number;
  ordersAddedLastMinute: number;
  ordersCancelledLastMinute: number;
  avgAddLatency: number;
  avgCancelLatency: number;
  avgMatchLatency: number;
  memoryUsageBytes: number;
  windowsAnalyzed: number;
}

interface SLAReport {
  timestamp: number;
  isCompliant: boolean;
  checks: {
    latencyTarget: boolean;
    throughputTarget: boolean;
    memoryTarget: boolean;
  };
  details: {
    avgAddLatencyUs: number;
    ordersPerSecond: number;
    memoryUsageMB: number;
  };
}
