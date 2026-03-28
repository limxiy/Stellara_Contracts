# Order Book Module - Setup Guide

## 📦 Installation

### 1. Install Required Dependencies

Run the following command in the `Backend` directory:

```bash
cd Backend
npm install @nestjs/event-emitter
```

### 2. Verify Installation

After installing, verify that TypeScript errors are resolved:

```bash
npm run build
```

The build should complete successfully without module resolution errors.

---

## 🔧 What Was Fixed

### Type Errors in Test Files

The `Order` class constructor now accepts both `string` and `bigint` for `price`, `quantity`, and `remainingQuantity` fields. This allows you to write cleaner test code:

```typescript
// ✅ Both work now:
const order1 = new Order({
  price: '50000.00',        // string
  quantity: '0.1',          // string
});

const order2 = new Order({
  price: 5000000000000n,    // bigint
  quantity: 10000000n,      // bigint
});
```

### Automatic String-to-BigInt Conversion

The constructor automatically converts string prices/quantities to BigInt using the same parsing logic as `setPriceFromString()` and `setQuantityFromString()`.

---

## 🚀 Quick Start

### Import the Module

In your `app.module.ts` or main module file:

```typescript
import { Module } from '@nestjs/common';
import { OrderBookModule } from './src/order-book/order-book.module';

@Module({
  imports: [
    // ... other modules
    OrderBookModule,
  ],
})
export class AppModule {}
```

### Inject and Use Services

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { OrderBookManagerService } from './src/order-book/order-book.module';
import { OrderSide, OrderType, TimeInForce } from './src/order-book/order-book.module';

@Controller('orders')
export class OrderController {
  constructor(
    private orderBookManager: OrderBookManagerService,
  ) {}

  @Post()
  async createOrder(@Body() orderData: any) {
    const result = await this.orderBookManager.addOrder({
      symbol: 'BTC-USDT',
      userId: 'user-123',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      price: '50000.00',
      quantity: '0.1',
      timeInForce: TimeInForce.GTC,
    });

    return result;
  }
}
```

---

## 📊 Run Benchmarks

To verify performance targets:

```bash
ts-node src/order-book/tests/order-book.benchmark.ts
```

Expected output:
```
🚀 Starting Order Book Benchmarks

============================================================
📊 Benchmark: Add Order Latency
----------------------------------------
Add Order:
  Average: XX.XX μs
  P50:     XX.XX μs
  P95:     XX.XX μs
  P99:     XX.XX μs
✅ Target achieved: <100μs P99

... (more benchmarks)
```

---

## 🧪 Run Tests

```bash
npm test -- src/order-book/tests/order-book.engine.spec.ts
```

---

## 📖 Documentation

See the comprehensive README at:
```
Backend/src/order-book/README.md
```

Topics covered:
- Architecture overview
- API reference
- Usage examples
- Configuration guide
- Performance monitoring
- WebSocket integration

---

## ⚠️ Troubleshooting

### "Cannot find module '@nestjs/event-emitter'"

**Solution:** Install the package:
```bash
npm install @nestjs/event-emitter
```

### "Property 'parsePrice' does not exist on type 'Order'"

**Status:** ✅ Fixed in latest update

The `Order` class now includes private `parsePrice()` and `parseQuantity()` helper methods.

### TypeScript Still Showing Errors?

Try these steps:

1. **Restart TypeScript Server** (VS Code):
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Select "TypeScript: Restart TS Server"

2. **Clear Build Cache**:
   ```bash
   rm -rf dist
   npm run build
   ```

3. **Verify tsconfig.json**:
   Ensure your `tsconfig.json` includes:
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "esModuleInterop": true,
       "skipLibCheck": true
     }
   }
   ```

---

## 🎯 Next Steps

1. ✅ Install dependencies (`npm install @nestjs/event-emitter`)
2. ✅ Build the project (`npm run build`)
3. ✅ Run tests (`npm test`)
4. ✅ Run benchmarks (`ts-node src/order-book/tests/order-book.benchmark.ts`)
5. ✅ Integrate into your application
6. ✅ Configure trading pairs as needed

---

## 📞 Support

For issues or questions:
- Check the main README: `Backend/src/order-book/README.md`
- Review test files for usage examples
- Run benchmarks to verify performance

---

**Last Updated:** March 28, 2026
**Version:** 1.0.0
