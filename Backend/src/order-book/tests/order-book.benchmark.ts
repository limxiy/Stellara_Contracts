/**
 * Order Book Performance Benchmark Script
 * 
 * This script benchmarks the order book engine to verify it meets
 * the performance targets:
 * - Operations <100 microseconds (p99)
 * - 50,000+ orders per second throughput
 * - <1KB memory per price level
 */

import { OrderBookEngine } from '../engines/order-book.engine';
import { Order, OrderSide, OrderType, TimeInForce } from '../types/order-book.types';
import { EventEmitter2 } from '@nestjs/event-emitter';

class OrderBookBenchmark {
  private orderBook: OrderBookEngine;
  private eventEmitter: EventEmitter2;

  constructor() {
    this.eventEmitter = new EventEmitter2();
    this.orderBook = new OrderBookEngine(
      {
        symbol: 'BTC-USDT',
        tickSize: 100n,
        lotSize: 100n,
        depthLevels: [10, 25, 50, 100],
      },
      this.eventEmitter,
    );
  }

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks(): Promise<void> {
    console.log('🚀 Starting Order Book Benchmarks\n');
    console.log('=' .repeat(60));

    await this.benchmarkAddOrder();
    await this.benchmarkCancelOrder();
    await this.benchmarkMatchOrder();
    await this.benchmarkThroughput();
    await this.benchmarkMemoryEfficiency();
    await this.benchmarkSnapshotLatency();

    console.log('=' .repeat(60));
    console.log('✅ All benchmarks completed\n');
  }

  /**
   * Benchmark: Add Order Latency
   */
  async benchmarkAddOrder(): Promise<void> {
    console.log('\n📊 Benchmark: Add Order Latency');
    console.log('-' .repeat(40));

    const latencies: number[] = [];
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      const order = this.createTestOrder({
        orderId: `add-bench-${i}`,
        price: 50000n + BigInt(i % 100),
        quantity: 10000000n, // 0.1 * 10^8
      });

      this.orderBook.addOrder(order);

      const latency = (performance.now() - startTime) * 1000; // Convert to microseconds
      latencies.push(latency);
    }

    this.reportLatency('Add Order', latencies);
  }

  /**
   * Benchmark: Cancel Order Latency
   */
  async benchmarkCancelOrder(): Promise<void> {
    console.log('\n📊 Benchmark: Cancel Order Latency');
    console.log('-' .repeat(40));

    const latencies: number[] = [];
    const iterations = 5000;

    // First add orders
    const orderIds: string[] = [];
    for (let i = 0; i < iterations; i++) {
      const order = this.createTestOrder({
        orderId: `cancel-bench-${i}`,
        price: 50000n + BigInt(i % 100),
        quantity: 10000000n, // 0.1 * 10^8
      });
      this.orderBook.addOrder(order);
      orderIds.push(order.orderId);
    }

    // Now cancel them
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      this.orderBook.cancelOrder(orderIds[i]);

      const latency = (performance.now() - startTime) * 1000;
      latencies.push(latency);
    }

    this.reportLatency('Cancel Order', latencies);
  }

  /**
   * Benchmark: Match Order Latency
   */
  async benchmarkMatchOrder(): Promise<void> {
    console.log('\n📊 Benchmark: Match Order Latency');
    console.log('-' .repeat(40));

    const latencies: number[] = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      // Add liquidity
      const sellOrder = this.createTestOrder({
        orderId: `liq-${i}`,
        side: OrderSide.SELL,
        price: 50000n + BigInt(i % 10),
        quantity: 10000000n, // 0.1 * 10^8
      });
      this.orderBook.addOrder(sellOrder);

      // Match against it
      const startTime = performance.now();

      const buyOrder = this.createTestOrder({
        orderId: `match-bench-${i}`,
        side: OrderSide.BUY,
        price: 50000n + BigInt(i % 10),
        quantity: 10000000n, // 0.1 * 10^8
      });
      this.orderBook.matchOrder(buyOrder);

      const latency = (performance.now() - startTime) * 1000;
      latencies.push(latency);
    }

    this.reportLatency('Match Order', latencies);
  }

  /**
   * Benchmark: Throughput (orders per second)
   */
  async benchmarkThroughput(): Promise<void> {
    console.log('\n📊 Benchmark: Throughput (Orders/Second)');
    console.log('-' .repeat(40));

    const ordersCount = 50000;
    const startTime = Date.now();

    for (let i = 0; i < ordersCount; i++) {
      const order = this.createTestOrder({
        orderId: `throughput-${i}`,
        price: 50000n + BigInt(i % 1000),
        quantity: 10000000n, // 0.1 * 10^8
      });
      this.orderBook.addOrder(order);
    }

    const duration = Date.now() - startTime;
    const ordersPerSecond = (ordersCount / duration) * 1000;

    console.log(`Orders Processed: ${ordersCount.toLocaleString()}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Throughput: ${ordersPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} orders/second`);

    if (ordersPerSecond >= 50000) {
      console.log('✅ Target achieved: 50,000+ orders/second');
    } else {
      console.log(`⚠️ Below target: ${(ordersPerSecond / 500).toFixed(1)}% of target`);
    }
  }

  /**
   * Benchmark: Memory Efficiency
   */
  async benchmarkMemoryEfficiency(): Promise<void> {
    console.log('\n📊 Benchmark: Memory Efficiency');
    console.log('-' .repeat(40));

    // Add orders across multiple price levels
    for (let i = 0; i < 1000; i++) {
      const order = this.createTestOrder({
        orderId: `memory-${i}`,
        price: 50000n + BigInt(Math.floor(i / 10)),
        quantity: 10000000n, // 0.1 * 10^8
      });
      this.orderBook.addOrder(order);
    }

    const memoryBytes = this.orderBook.getMemoryUsageBytes();
    const priceLevels = this.orderBook.getPriceLevelsCount();
    const bytesPerLevel = memoryBytes / priceLevels;

    console.log(`Total Memory: ${(memoryBytes / 1024).toFixed(2)} KB`);
    console.log(`Price Levels: ${priceLevels}`);
    console.log(`Memory per Level: ${bytesPerLevel.toFixed(0)} bytes`);

    if (bytesPerLevel < 1024) {
      console.log('✅ Target achieved: <1KB per price level');
    } else {
      console.log(`⚠️ Above target: ${(bytesPerLevel / 1024).toFixed(2)} KB per level`);
    }
  }

  /**
   * Benchmark: Snapshot Latency
   */
  async benchmarkSnapshotLatency(): Promise<void> {
    console.log('\n📊 Benchmark: Snapshot Latency');
    console.log('-' .repeat(40));

    const latencies: number[] = [];
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();

      this.orderBook.getSnapshot(25);

      const latency = (performance.now() - startTime) * 1000;
      latencies.push(latency);
    }

    this.reportLatency('Snapshot', latencies);
  }

  // Helper Methods

  private reportLatency(operation: string, latencies: number[]): void {
    const sorted = [...latencies].sort((a, b) => a - b);
    
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`${operation}:`);
    console.log(`  Average: ${avg.toFixed(2)} μs`);
    console.log(`  P50:     ${p50.toFixed(2)} μs`);
    console.log(`  P95:     ${p95.toFixed(2)} μs`);
    console.log(`  P99:     ${p99.toFixed(2)} μs`);

    if (p99 < 100) {
      console.log('✅ Target achieved: <100μs P99');
    } else {
      console.log(`⚠️ Above target: ${(p99 / 100).toFixed(1)}x of 100μs`);
    }
  }

  private createTestOrder(overrides: Partial<Order> = {}): Order {
    const order = new Order({
      orderId: overrides.orderId || `test-order-${Date.now()}-${Math.random()}`,
      symbol: 'BTC-USDT',
      userId: overrides.userId || 'benchmark-user',
      side: overrides.side || OrderSide.BUY,
      type: overrides.type || OrderType.LIMIT,
      timeInForce: overrides.timeInForce || TimeInForce.GTC,
      ...overrides,
    });

    if (overrides.price && typeof overrides.price === 'string') {
      order.setPriceFromString(overrides.price);
    } else if (!overrides.price) {
      order.setPriceFromString('50000.00');
    }

    if (overrides.quantity && typeof overrides.quantity === 'string') {
      order.setQuantityFromString(overrides.quantity);
    } else if (!overrides.quantity) {
      order.setQuantityFromString('0.1');
    }

    return order;
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  const benchmark = new OrderBookBenchmark();
  benchmark.runAllBenchmarks().catch(console.error);
}

export { OrderBookBenchmark };
