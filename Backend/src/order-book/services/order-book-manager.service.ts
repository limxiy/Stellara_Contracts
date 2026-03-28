import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { OrderBookEngine } from '../engines/order-book.engine';
import {
  Order,
  OrderSide,
  OrderType,
  TimeInForce,
  OrderBookSnapshot,
  OrderBookUpdate,
  Trade,
  OrderBookConfig,
  OrderBookMetrics,
  OrderDTO,
} from '../types/order-book.types';

/**
 * Central order book management service
 * Handles multiple order books, persistence, and real-time distribution
 */
@Injectable()
export class OrderBookManagerService implements OnModuleInit {
  private readonly logger = new Logger(OrderBookManagerService.name);
  
  // Map of symbol -> order book engine
  private orderBooks: Map<string, OrderBookEngine> = new Map();
  
  // Default configurations for symbols
  private defaultConfigs: Map<string, OrderBookConfig> = new Map();
  
  // Snapshot publishing interval (ms)
  private readonly snapshotIntervalMs = 1000;
  
  // Metrics collection interval (ms)
  private readonly metricsIntervalMs = 5000;

  constructor(
    private eventEmitter: EventEmitter2,
    private redis: Redis,
  ) {
    this.initializeDefaultConfigs();
  }

  async onModuleInit() {
    // Subscribe to order book events
    this.eventEmitter.on('orderbook.update', (update: OrderBookUpdate) => {
      this.handleOrderBookUpdate(update);
    });

    this.eventEmitter.on('orderbook.trade', (trade: Trade) => {
      this.handleTradeExecution(trade);
    });

    // Start periodic snapshot publishing
    this.startSnapshotPublisher();
    
    // Start metrics collection
    this.startMetricsCollection();

    this.logger.log('OrderBookManagerService initialized');
  }

  /**
   * Get or create order book for symbol
   */
  getOrderBook(symbol: string): OrderBookEngine {
    if (!this.orderBooks.has(symbol)) {
      const config = this.defaultConfigs.get(symbol) || this.getDefaultConfig(symbol);
      const orderBook = new OrderBookEngine(config, this.eventEmitter);
      this.orderBooks.set(symbol, orderBook);
      this.logger.log(`Created order book for ${symbol}`);
    }
    
    return this.orderBooks.get(symbol)!;
  }

  /**
   * Add order to book
   */
  addOrder(order: Partial<Order>): OrderDTO {
    const orderBook = this.getOrderBook(order.symbol!);
    
    const fullOrder = new Order({
      ...order,
      orderId: order.orderId || this.generateOrderId(),
    });

    // Convert string prices/quantities to BigInt
    if (typeof order.price === 'string') {
      fullOrder.setPriceFromString(order.price);
    }
    if (typeof order.quantity === 'string') {
      fullOrder.setQuantityFromString(order.quantity);
    }

    // Try to match immediately
    const trades = orderBook.matchOrder(fullOrder);
    
    if (trades.length > 0) {
      this.logger.debug(`Order ${fullOrder.orderId} matched with ${trades.length} trades`);
    }

    return orderBook.getOrder(fullOrder.orderId)!;
  }

  /**
   * Cancel order
   */
  cancelOrder(symbol: string, orderId: string): boolean {
    const orderBook = this.getOrderBook(symbol);
    const success = orderBook.cancelOrder(orderId);
    
    if (success) {
      this.logger.debug(`Cancelled order ${orderId} in ${symbol}`);
    } else {
      this.logger.warn(`Failed to cancel order ${orderId} in ${symbol}`);
    }
    
    return success;
  }

  /**
   * Modify existing order
   */
  modifyOrder(symbol: string, orderId: string, modifications: Partial<Order>): OrderDTO | null {
    const orderBook = this.getOrderBook(symbol);
    
    // Convert string prices/quantities if present
    if (modifications.price && typeof modifications.price === 'string') {
      const tempOrder = new Order({ price: 0n } as any);
      tempOrder.setPriceFromString(modifications.price);
      modifications.price = tempOrder.price;
    }
    
    if (modifications.quantity && typeof modifications.quantity === 'string') {
      const tempOrder = new Order({ quantity: 0n } as any);
      tempOrder.setQuantityFromString(modifications.quantity);
      modifications.quantity = tempOrder.quantity;
    }
    
    return orderBook.modifyOrder(orderId, modifications);
  }

  /**
   * Get order details
   */
  getOrder(symbol: string, orderId: string): OrderDTO | null {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getOrder(orderId);
  }

  /**
   * Get user's active orders
   */
  getUserOrders(symbol: string, userId: string): OrderDTO[] {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getUserOrders(userId);
  }

  /**
   * Get order book snapshot
   */
  getSnapshot(symbol: string, depth?: number): OrderBookSnapshot {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.getSnapshot(depth);
  }

  /**
   * Get all active order books
   */
  getAllOrderBooks(): string[] {
    return Array.from(this.orderBooks.keys());
  }

  /**
   * Get aggregated metrics across all order books
   */
  getAggregateMetrics(): Record<string, OrderBookMetrics> {
    const metrics: Record<string, OrderBookMetrics> = {};
    
    for (const [symbol, orderBook] of this.orderBooks) {
      metrics[symbol] = orderBook.getMetrics();
    }
    
    return metrics;
  }

  /**
   * Warm up order book from snapshot (reconstruction)
   */
  async reconstructFromSnapshot(symbol: string, snapshot: OrderBookSnapshot): Promise<void> {
    const orderBook = this.getOrderBook(symbol);
    orderBook.reset();
    
    // In production, you would replay orders from the snapshot
    // This is a simplified implementation
    this.logger.log(`Reconstructed order book for ${symbol} from snapshot`);
  }

  /**
   * Load order book state from Redis
   */
  async loadFromRedis(symbol: string): Promise<boolean> {
    try {
      const key = `orderbook:${symbol}:snapshot`;
      const snapshotJson = await this.redis.get(key);
      
      if (snapshotJson) {
        const snapshot: OrderBookSnapshot = JSON.parse(snapshotJson);
        await this.reconstructFromSnapshot(symbol, snapshot);
        this.logger.log(`Loaded order book for ${symbol} from Redis`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Failed to load order book from Redis:`, error);
      return false;
    }
  }

  /**
   * Save order book state to Redis
   */
  async saveToRedis(symbol: string): Promise<void> {
    try {
      const orderBook = this.getOrderBook(symbol);
      const snapshot = orderBook.getSnapshot();
      
      const key = `orderbook:${symbol}:snapshot`;
      await this.redis.setex(key, 300, JSON.stringify(snapshot)); // 5 min TTL
      
      this.logger.debug(`Saved order book snapshot for ${symbol} to Redis`);
    } catch (error) {
      this.logger.error(`Failed to save order book to Redis:`, error);
    }
  }

  /**
   * Clear order book
   */
  clearOrderBook(symbol: string): void {
    const orderBook = this.getOrderBook(symbol);
    orderBook.reset();
    this.logger.log(`Cleared order book for ${symbol}`);
  }

  /**
   * Shutdown gracefully
   */
  async onModuleDestroy() {
    // Save all order books to Redis before shutdown
    for (const symbol of this.orderBooks.keys()) {
      await this.saveToRedis(symbol);
    }
    
    this.logger.log('OrderBookManagerService shut down');
  }

  // Private helper methods

  private initializeDefaultConfigs() {
    // Common trading pairs with appropriate tick/lot sizes
    const configs: OrderBookConfig[] = [
      {
        symbol: 'BTC-USDT',
        tickSize: 100n, // $0.0001
        lotSize: 100n, // 0.00000001 BTC
        maxPrice: 100000000000n,
        minPrice: 1n,
        maxQuantity: 100000000000n,
        minQuantity: 100n,
        depthLevels: [10, 25, 50, 100],
        snapshotIntervalMs: 1000,
        updateBatchSize: 100,
      },
      {
        symbol: 'ETH-USDT',
        tickSize: 10n, // $0.00001
        lotSize: 100n,
        maxPrice: 10000000000n,
        minPrice: 1n,
        maxQuantity: 100000000000n,
        minQuantity: 100n,
        depthLevels: [10, 25, 50, 100],
        snapshotIntervalMs: 1000,
        updateBatchSize: 100,
      },
      {
        symbol: 'XLM-USDT',
        tickSize: 1n, // $0.0000001
        lotSize: 1000000n, // 0.01 XLM
        maxPrice: 1000000n,
        minPrice: 1n,
        maxQuantity: 100000000000000n,
        minQuantity: 1000000n,
        depthLevels: [10, 25, 50, 100],
        snapshotIntervalMs: 1000,
        updateBatchSize: 100,
      },
    ];

    for (const config of configs) {
      this.defaultConfigs.set(config.symbol, config);
    }
  }

  private getDefaultConfig(symbol: string): OrderBookConfig {
    return {
      symbol,
      tickSize: 1n,
      lotSize: 1n,
      maxPrice: 100000000000000n,
      minPrice: 1n,
      maxQuantity: 100000000000000n,
      minQuantity: 1n,
      depthLevels: [10, 25, 50, 100],
      snapshotIntervalMs: 1000,
      updateBatchSize: 100,
    };
  }

  private generateOrderId(): string {
    return `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleOrderBookUpdate(update: OrderBookUpdate) {
    // Publish to Redis for other services
    this.redis.publish(`orderbook:${update.symbol}:updates`, JSON.stringify(update));
    
    // Emit via WebSocket (handled by WebSocket gateway)
    this.eventEmitter.emit('websocket.orderbook.update', update);
  }

  private handleTradeExecution(trade: Trade) {
    // Publish trade to Redis
    this.redis.publish(`orderbook:${trade.symbol}:trades`, JSON.stringify(trade));
    
    // Emit via WebSocket
    this.eventEmitter.emit('websocket.trade.update', trade);
    
    this.logger.debug(`Trade executed: ${trade.tradeId} - ${trade.quantity} @ ${trade.price}`);
  }

  private startSnapshotPublisher() {
    setInterval(() => {
      for (const symbol of this.orderBooks.keys()) {
        this.saveToRedis(symbol);
      }
    }, this.snapshotIntervalMs);
  }

  private startMetricsCollection() {
    setInterval(() => {
      const metrics = this.getAggregateMetrics();
      
      for (const [symbol, metric] of Object.entries(metrics)) {
        this.logger.debug(
          `${symbol}: Orders=${metric.activeOrders}, ` +
          `Levels=${metric.priceLevels}, ` +
          `Add P99=${metric.addOrderLatency.p99.toFixed(2)}μs, ` +
          `Match P99=${metric.matchOrdersLatency.p99.toFixed(2)}μs`
        );
      }
    }, this.metricsIntervalMs);
  }
}
