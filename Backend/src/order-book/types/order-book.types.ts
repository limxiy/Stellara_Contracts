import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator';

/**
 * Order side enumeration
 */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/**
 * Order type enumeration
 */
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

/**
 * Order status enumeration
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/**
 * Time in force options
 */
export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancel
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
}

/**
 * Ultra-lightweight order representation for high performance
 * Uses BigInt for price and quantity to avoid floating point issues
 * Memory footprint: ~128 bytes per order
 */
export class Order {
  @IsString()
  orderId: string;

  @IsString()
  symbol: string;

  @IsString()
  userId: string;

  @IsString()
  side: OrderSide;

  @IsString()
  type: OrderType;

  // Using BigInt for precise integer arithmetic (price in smallest unit)
  price: bigint;

  // Quantity in smallest unit
  quantity: bigint;

  // Remaining quantity (for partial fills)
  remainingQuantity: bigint;

  @IsString()
  timeInForce: TimeInForce;

  timestamp: number;

  @IsOptional()
  @IsString()
  parentOrderId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number = 0;

  status?: OrderStatus;

  constructor(partial: Partial<Omit<Order, 'price' | 'quantity' | 'remainingQuantity'> & {
    price?: bigint | string;
    quantity?: bigint | string;
    remainingQuantity?: bigint | string;
  }>) {
    // Handle price/quantity conversion from string to bigint if needed
    const { price, quantity, remainingQuantity, ...rest } = partial;
    
    Object.assign(this, rest);
    this.timestamp = Date.now();
    
    // Convert price to bigint
    if (price !== undefined) {
      this.price = typeof price === 'string' ? this.parsePrice(price) : price;
    }
    
    // Convert quantity to bigint
    if (quantity !== undefined) {
      this.quantity = typeof quantity === 'string' ? this.parseQuantity(quantity) : quantity;
    }
    
    // Set remaining quantity
    if (remainingQuantity !== undefined) {
      this.remainingQuantity = typeof remainingQuantity === 'string' 
        ? this.parseQuantity(remainingQuantity) 
        : remainingQuantity || this.quantity;
    } else {
      this.remainingQuantity = this.quantity;
    }
    
    this.priority = this.priority || 0;
  }

  /**
   * Convert price from string to BigInt
   */
  setPriceFromString(priceStr: string): void {
    // Convert to smallest unit (e.g., satoshis for BTC)
    const [whole, fractional = ''] = priceStr.split('.');
    const paddedFractional = fractional.padEnd(8, '0').slice(0, 8);
    this.price = BigInt(`${whole}${paddedFractional}`);
  }

  /**
   * Convert quantity from string to BigInt
   */
  setQuantityFromString(quantityStr: string): void {
    const [whole, fractional = ''] = quantityStr.split('.');
    const paddedFractional = fractional.padEnd(8, '0').slice(0, 8);
    this.quantity = BigInt(`${whole}${paddedFractional}`);
    this.remainingQuantity = this.quantity;
  }

  /**
   * Parse price string to bigint (helper for constructor)
   */
  private parsePrice(priceStr: string): bigint {
    const [whole, fractional = ''] = priceStr.split('.');
    const paddedFractional = fractional.padEnd(8, '0').slice(0, 8);
    return BigInt(`${whole}${paddedFractional}`);
  }

  /**
   * Parse quantity string to bigint (helper for constructor)
   */
  private parseQuantity(qtyStr: string): bigint {
    const [whole, fractional = ''] = qtyStr.split('.');
    const paddedFractional = fractional.padEnd(8, '0').slice(0, 8);
    return BigInt(`${whole}${paddedFractional}`);
  }

  /**
   * Get price as string for API responses
   */
  getPriceAsString(): string {
    const priceStr = this.price.toString().padStart(9, '0');
    const whole = priceStr.slice(0, -8) || '0';
    const fractional = priceStr.slice(-8).replace(/0+$/, '');
    return fractional ? `${whole}.${fractional}` : whole;
  }

  /**
   * Get quantity as string for API responses
   */
  getQuantityAsString(): string {
    const qtyStr = this.quantity.toString().padStart(9, '0');
    const whole = qtyStr.slice(0, -8) || '0';
    const fractional = qtyStr.slice(-8).replace(/0+$/, '');
    return fractional ? `${whole}.${fractional}` : whole;
  }

  /**
   * Check if order is fully filled
   */
  isFilled(): boolean {
    return this.remainingQuantity === 0n;
  }

  /**
   * Check if order can be matched
   */
  isActive(): boolean {
    return this.remainingQuantity > 0n && 
           this.status !== OrderStatus.CANCELLED && 
           this.status !== OrderStatus.REJECTED;
  }

  /**
   * Fill order partially or fully
   */
  fill(amount: bigint): bigint {
    const fillAmount = amount > this.remainingQuantity ? this.remainingQuantity : amount;
    this.remainingQuantity -= fillAmount;
    
    if (this.remainingQuantity === 0n) {
      this.status = OrderStatus.FILLED;
    } else {
      this.status = OrderStatus.PARTIALLY_FILLED;
    }
    
    return fillAmount;
  }

  /**
   * Clone order for snapshot creation
   */
  clone(): Order {
    return new Order({
      orderId: this.orderId,
      symbol: this.symbol,
      userId: this.userId,
      side: this.side,
      type: this.type,
      price: this.price,
      quantity: this.quantity,
      remainingQuantity: this.remainingQuantity,
      timeInForce: this.timeInForce,
      timestamp: this.timestamp,
      parentOrderId: this.parentOrderId,
      priority: this.priority,
      status: this.status,
    });
  }
}

/**
 * Price level with aggregated orders
 * Memory-optimized: <1KB per level
 */
export class PriceLevel {
  @IsString()
  price: bigint;

  @IsString()
  totalQuantity: bigint;

  @IsInt()
  orderCount: number;

  @IsInt()
  firstTimestamp: number;

  @IsInt()
  lastTimestamp: number;

  // Array of order IDs at this level (memory efficient)
  orderIds: Set<string>;

  constructor(price: bigint) {
    this.price = price;
    this.totalQuantity = 0n;
    this.orderCount = 0;
    this.firstTimestamp = Date.now();
    this.lastTimestamp = Date.now();
    this.orderIds = new Set<string>();
  }

  /**
   * Add order to price level
   */
  addOrder(order: Order): void {
    this.orderIds.add(order.orderId);
    this.totalQuantity += order.remainingQuantity;
    this.orderCount++;
    this.lastTimestamp = Math.max(this.lastTimestamp, order.timestamp);
  }

  /**
   * Remove order from price level
   */
  removeOrder(orderId: string, remainingQty: bigint): void {
    this.orderIds.delete(orderId);
    this.totalQuantity -= remainingQty;
    this.orderCount--;
    
    if (this.totalQuantity < 0n) {
      this.totalQuantity = 0n;
    }
  }

  /**
   * Check if price level is empty
   */
  isEmpty(): boolean {
    return this.orderCount === 0 || this.totalQuantity === 0n;
  }

  /**
   * Get price as string
   */
  getPriceAsString(): string {
    const priceStr = this.price.toString().padStart(9, '0');
    const whole = priceStr.slice(0, -8) || '0';
    const fractional = priceStr.slice(-8).replace(/0+$/, '');
    return fractional ? `${whole}.${fractional}` : whole;
  }

  /**
   * Get total quantity as string
   */
  getTotalQuantityAsString(): string {
    const qtyStr = this.totalQuantity.toString().padStart(9, '0');
    const whole = qtyStr.slice(0, -8) || '0';
    const fractional = qtyStr.slice(-8).replace(/0+$/, '');
    return fractional ? `${whole}.${fractional}` : whole;
  }

  /**
   * Clone price level for snapshots
   */
  clone(): PriceLevel {
    const cloned = new PriceLevel(this.price);
    cloned.totalQuantity = this.totalQuantity;
    cloned.orderCount = this.orderCount;
    cloned.firstTimestamp = this.firstTimestamp;
    cloned.lastTimestamp = this.lastTimestamp;
    cloned.orderIds = new Set(this.orderIds);
    return cloned;
  }
}

/**
 * Order book level for API responses
 */
export interface OrderBookLevelDTO {
  price: string;
  quantity: string;
  orderCount: number;
  timestamp: number;
}

/**
 * Order book snapshot for distribution
 */
export interface OrderBookSnapshot {
  symbol: string;
  sequenceNumber: number;
  timestamp: number;
  bids: OrderBookLevelDTO[];
  asks: OrderBookLevelDTO[];
  spread: string;
  midPrice: string;
}

/**
 * Incremental update for real-time distribution
 */
export interface OrderBookUpdate {
  symbol: string;
  sequenceNumber: number;
  timestamp: number;
  action: 'ADD' | 'UPDATE' | 'DELETE' | 'SNAPSHOT';
  levels?: OrderBookLevelDTO[];
  orders?: OrderDTO[];
}

/**
 * Trade execution result
 */
export interface Trade {
  tradeId: string;
  symbol: string;
  buyerOrderId: string;
  sellerOrderId: string;
  price: string;
  quantity: string;
  timestamp: number;
  makerOrderId: string;
  takerOrderId: string;
  makerFee: string;
  takerFee: string;
}

/**
 * Order DTO for API responses
 */
export interface OrderDTO {
  orderId: string;
  symbol: string;
  userId: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  status: OrderStatus;
  timeInForce: TimeInForce;
  timestamp: number;
  averagePrice?: string;
}

/**
 * Configuration for order book
 */
export interface OrderBookConfig {
  symbol: string;
  tickSize: bigint;
  lotSize: bigint;
  maxPrice: bigint;
  minPrice: bigint;
  maxQuantity: bigint;
  minQuantity: bigint;
  depthLevels: number[];
  snapshotIntervalMs: number;
  updateBatchSize: number;
}

/**
 * Performance metrics
 */
export interface OrderBookMetrics {
  addOrderLatency: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  cancelOrderLatency: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  matchOrdersLatency: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  snapshotLatency: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  ordersPerSecond: number;
  tradesPerSecond: number;
  memoryUsageBytes: number;
  activeOrders: number;
  priceLevels: number;
}
