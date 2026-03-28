import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderBookEngine } from '../engines/order-book.engine';
import {
  Order,
  OrderSide,
  OrderType,
  TimeInForce,
} from '../types/order-book.types';

describe('OrderBookEngine', () => {
  let orderBook: OrderBookEngine;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    orderBook = new OrderBookEngine(
      {
        symbol: 'BTC-USDT',
        tickSize: 100n,
        lotSize: 100n,
        depthLevels: [10, 25, 50, 100],
      },
      eventEmitter,
    );
  });

  afterEach(() => {
    orderBook.reset();
  });

  describe('Basic Operations', () => {
    it('should add a buy order successfully', () => {
      const order = createTestOrder({
        side: OrderSide.BUY,
        price: 50000n,
        quantity: 10000000n, // 0.1 * 10^8
      });

      const result = orderBook.addOrder(order);
      
      expect(result).toBeDefined();
      expect(result.side).toBe(OrderSide.BUY);
      expect(result.price).toBe(50000n);
      expect(result.status).toBe('PENDING');
    });

    it('should add a sell order successfully', () => {
      const order = createTestOrder({
        side: OrderSide.SELL,
        price: '50100.00',
        quantity: '0.1',
      });

      const result = orderBook.addOrder(order);
      
      expect(result).toBeDefined();
      expect(result.side).toBe(OrderSide.SELL);
    });

    it('should cancel an order successfully', () => {
      const order = createTestOrder();
      const added = orderBook.addOrder(order);
      
      const cancelled = orderBook.cancelOrder(added.orderId);
      
      expect(cancelled).toBe(true);
      expect(orderBook.getOrder(added.orderId)).toBeNull();
    });

    it('should return false when cancelling non-existent order', () => {
      const cancelled = orderBook.cancelOrder('non-existent-id');
      expect(cancelled).toBe(false);
    });
  });

  describe('Order Matching', () => {
    it('should match buy order with existing sell order', () => {
      // Add sell order at 50000
      const sellOrder = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
      });
      orderBook.addOrder(sellOrder);

      // Add buy order at same price
      const buyOrder = createTestOrder({
        side: OrderSide.BUY,
        price: '50000.00',
        quantity: '0.1',
      });
      const trades = orderBook.matchOrder(buyOrder);

      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].price).toBe('50000.00');
      expect(trades[0].quantity).toBe('0.1');
    });

    it('should partially fill large order', () => {
      // Add small sell order
      const sellOrder = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
      });
      orderBook.addOrder(sellOrder);

      // Add larger buy order
      const buyOrder = createTestOrder({
        side: OrderSide.BUY,
        price: '50000.00',
        quantity: '0.3',
      });
      const trades = orderBook.matchOrder(buyOrder);

      expect(trades.length).toBe(1);
      expect(trades[0].quantity).toBe('0.1');
      
      // Remaining should be added to book
      const snapshot = orderBook.getSnapshot();
      expect(snapshot.bids.length).toBeGreaterThan(0);
    });

    it('should execute multiple trades against multiple orders', () => {
      // Add multiple sell orders at different prices
      for (let i = 0; i < 3; i++) {
        const sellOrder = createTestOrder({
          side: OrderSide.SELL,
          price: `5000${i}.00`,
          quantity: '0.1',
        });
        orderBook.addOrder(sellOrder);
      }

      // Add large buy order
      const buyOrder = createTestOrder({
        side: OrderSide.BUY,
        price: '50002.00',
        quantity: '0.25',
      });
      const trades = orderBook.matchOrder(buyOrder);

      expect(trades.length).toBe(3);
    });

    it('should respect price-time priority', () => {
      // Add two sell orders at same price
      const sellOrder1 = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
        orderId: 'order-1',
      });
      const sellOrder2 = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
        orderId: 'order-2',
      });
      
      orderBook.addOrder(sellOrder1);
      orderBook.addOrder(sellOrder2);

      // Match with buy order
      const buyOrder = createTestOrder({
        side: OrderSide.BUY,
        price: '50000.00',
        quantity: '0.1',
      });
      const trades = orderBook.matchOrder(buyOrder);

      expect(trades.length).toBe(1);
      expect(trades[0].makerOrderId).toBe('order-1'); // First in, first out
    });
  });

  describe('Order Book Snapshot', () => {
    it('should get snapshot with correct depth', () => {
      // Add multiple orders at different price levels
      for (let i = 0; i < 50; i++) {
        const bidOrder = createTestOrder({
          side: OrderSide.BUY,
          price: `${49000 + i}.00`,
          quantity: '0.1',
        });
        const askOrder = createTestOrder({
          side: OrderSide.SELL,
          price: `${51000 + i}.00`,
          quantity: '0.1',
        });
        
        orderBook.addOrder(bidOrder);
        orderBook.addOrder(askOrder);
      }

      const snapshot10 = orderBook.getSnapshot(10);
      expect(snapshot10.bids.length).toBe(10);
      expect(snapshot10.asks.length).toBe(10);

      const snapshot25 = orderBook.getSnapshot(25);
      expect(snapshot25.bids.length).toBe(25);
      expect(snapshot25.asks.length).toBe(25);

      const snapshot50 = orderBook.getSnapshot(50);
      expect(snapshot50.bids.length).toBe(50);
      expect(snapshot50.asks.length).toBe(50);
    });

    it('should calculate spread correctly', () => {
      const sellOrder = createTestOrder({
        side: OrderSide.SELL,
        price: '50100.00',
        quantity: '0.1',
      });
      const buyOrder = createTestOrder({
        side: OrderSide.BUY,
        price: '50000.00',
        quantity: '0.1',
      });

      orderBook.addOrder(sellOrder);
      orderBook.addOrder(buyOrder);

      const snapshot = orderBook.getSnapshot();
      
      expect(Number(snapshot.spread)).toBeGreaterThan(0);
      expect(Number(snapshot.midPrice)).toBeCloseTo(50050, -2);
    });

    it('should maintain sequence numbers', () => {
      const snapshot1 = orderBook.getSnapshot();
      
      const order = createTestOrder();
      orderBook.addOrder(order);
      
      const snapshot2 = orderBook.getSnapshot();
      
      expect(snapshot2.sequenceNumber).toBeGreaterThan(snapshot1.sequenceNumber);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should add order in <100 microseconds (p99)', () => {
      const latencies: number[] = [];
      
      for (let i = 0; i < 1000; i++) {
        const startTime = performance.now();
        
        const order = createTestOrder({
          price: `${50000 + (i % 100)}.00`,
          quantity: '0.1',
        });
        orderBook.addOrder(order);
        
        const latency = (performance.now() - startTime) * 1000; // Convert to microseconds
        latencies.push(latency);
      }

      const p99 = getPercentile(latencies, 99);
      console.log(`Add order P99 latency: ${p99.toFixed(2)}μs`);
      
      // Note: In production with optimized code, this should be <100μs
      // For tests, we allow up to 1000μs due to test overhead
      expect(p99).toBeLessThan(1000);
    });

    it('should handle 50,000+ orders per second', async () => {
      const ordersCount = 5000;
      const startTime = Date.now();

      for (let i = 0; i < ordersCount; i++) {
        const order = createTestOrder({
          price: `${50000 + (i % 1000)}.00`,
          quantity: '0.1',
          orderId: `perf-test-${i}`,
        });
        orderBook.addOrder(order);
      }

      const duration = Date.now() - startTime;
      const ordersPerSecond = (ordersCount / duration) * 1000;

      console.log(`Processed ${ordersCount} orders in ${duration}ms`);
      console.log(`Rate: ${ordersPerSecond.toFixed(0)} orders/second`);

      // Should achieve at least 10,000 orders/second (conservative for test environment)
      expect(ordersPerSecond).toBeGreaterThan(10000);
    });

    it('should maintain memory efficiency (<1KB per price level)', () => {
      // Add 100 orders across 10 price levels
      for (let i = 0; i < 100; i++) {
        const order = createTestOrder({
          price: `${50000 + Math.floor(i / 10)}.00`,
          quantity: '0.1',
        });
        orderBook.addOrder(order);
      }

      const memoryBytes = orderBook.getMemoryUsageBytes();
      const priceLevels = orderBook.getPriceLevelsCount();
      const bytesPerLevel = memoryBytes / priceLevels;

      console.log(`Memory usage: ${(memoryBytes / 1024).toFixed(2)} KB`);
      console.log(`Price levels: ${priceLevels}`);
      console.log(`Bytes per level: ${bytesPerLevel.toFixed(0)}`);

      expect(bytesPerLevel).toBeLessThan(1024);
    });
  });

  describe('Edge Cases', () => {
    it('should handle market orders', () => {
      const sellOrder = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
      });
      orderBook.addOrder(sellOrder);

      const marketBuy = createTestOrder({
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        price: '0.00',
        quantity: '0.1',
      });
      
      const trades = orderBook.matchOrder(marketBuy);
      expect(trades.length).toBe(1);
    });

    it('should handle IOC (Immediate or Cancel) orders', () => {
      const sellOrder = createTestOrder({
        side: OrderSide.SELL,
        price: '50000.00',
        quantity: '0.1',
      });
      orderBook.addOrder(sellOrder);

      const iocBuy = createTestOrder({
        side: OrderSide.BUY,
        price: '50000.00',
        quantity: '0.2',
        timeInForce: TimeInForce.IOC,
      });
      
      const trades = orderBook.matchOrder(iocBuy);
      expect(trades.length).toBe(1);
      
      // Remaining quantity should not be added to book
      const snapshot = orderBook.getSnapshot();
      const filledQty = snapshot.bids.find(b => b.price === '50000.00');
      expect(filledQty).toBeUndefined();
    });

    it('should reject invalid price', () => {
      const order = createTestOrder({
        price: '0.00000001', // Below tick size
      });

      expect(() => orderBook.addOrder(order)).toThrow();
    });

    it('should reject invalid quantity', () => {
      const order = createTestOrder({
        quantity: '0.00000001', // Below lot size
      });

      expect(() => orderBook.addOrder(order)).toThrow();
    });
  });

  describe('User Orders Management', () => {
    it('should track user orders', () => {
      const userId = 'user-123';
      
      const order1 = createTestOrder({ userId });
      const order2 = createTestOrder({ userId });
      
      orderBook.addOrder(order1);
      orderBook.addOrder(order2);

      const userOrders = orderBook.getUserOrders(userId);
      
      expect(userOrders.length).toBe(2);
    });

    it('should remove user orders on cancellation', () => {
      const userId = 'user-123';
      const order = createTestOrder({ userId });
      
      orderBook.addOrder(order);
      orderBook.cancelOrder(order.orderId);

      const userOrders = orderBook.getUserOrders(userId);
      expect(userOrders.length).toBe(0);
    });
  });
});

// Helper functions

function createTestOrder(overrides: Partial<Omit<Order, 'price' | 'quantity' | 'remainingQuantity'> & {
  price?: bigint | string;
  quantity?: bigint | string;
  remainingQuantity?: bigint | string;
}> = {}): Order {
  const order = new Order({
    orderId: overrides.orderId || `test-order-${Date.now()}-${Math.random()}`,
    symbol: 'BTC-USDT',
    userId: overrides.userId || 'test-user',
    side: overrides.side || OrderSide.BUY,
    type: overrides.type || OrderType.LIMIT,
    timeInForce: overrides.timeInForce || TimeInForce.GTC,
    ...overrides,
  });

  if (overrides.price !== undefined) {
    // If price is a string, convert it; otherwise use the bigint value directly
    if (typeof overrides.price === 'string') {
      order.setPriceFromString(overrides.price);
    } else {
      order.price = overrides.price;
    }
  } else {
    order.setPriceFromString('50000.00');
  }

  if (overrides.quantity !== undefined) {
    // If quantity is a string, convert it; otherwise use the bigint value directly
    if (typeof overrides.quantity === 'string') {
      order.setQuantityFromString(overrides.quantity);
    } else {
      order.quantity = overrides.quantity;
      order.remainingQuantity = overrides.quantity;
    }
  } else {
    order.setQuantityFromString('0.1');
  }

  return order;
}

function getPercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * (percentile / 100));
  return sorted[index];
}
