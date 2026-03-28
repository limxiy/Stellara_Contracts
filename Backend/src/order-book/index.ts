/**
 * Order Book Module - Public API Exports
 * 
 * High-performance real-time order book management system
 */

// Core Services
export { OrderBookManagerService } from './services/order-book-manager.service';
export { SpreadCalculatorService } from './services/spread-calculator.service';
export { OrderBookPerformanceMonitor } from './services/performance-monitor.service';

// Gateway
export { OrderBookGateway } from './gateways/order-book.gateway';

// Engine (for advanced usage)
export { OrderBookEngine } from './engines/order-book.engine';

// Types and Interfaces
export {
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  PriceLevel,
  OrderBookLevelDTO,
  OrderBookSnapshot,
  OrderBookUpdate,
  Trade,
  OrderDTO,
  OrderBookConfig,
  OrderBookMetrics,
} from './types/order-book.types';

// Module
export { OrderBookModule } from './order-book.module';
