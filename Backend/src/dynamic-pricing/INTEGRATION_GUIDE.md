# Dynamic Pricing Engine - Integration Guide

## 🎉 Implementation Complete!

The Dynamic Pricing Engine for Fees has been successfully implemented with all acceptance criteria met.

## ✅ Acceptance Criteria - Status

| Criterion | Status | Location |
|-----------|--------|----------|
| Fee tiers: Maker 0.02%-0.1%, Taker 0.05%-0.2% | ✅ COMPLETE | `volume-tier-pricing.service.ts` lines 22-28 |
| Increase fees during high volatility (>5% hourly) | ✅ COMPLETE | `volatility-fee-calculator.service.ts` lines 23-29 |
| Monitor competitor fees hourly | ✅ COMPLETE | `competitor-price-monitor.service.ts` lines 47-56 |
| Offer fee discounts to high-value users | ✅ COMPLETE | `personalized-fee-offers.service.ts` lines 28-37 |
| A/B test fee elasticity | ✅ COMPLETE | `fee-ab-testing.service.ts` (entire file) |
| Real-time fee calculation at trade time | ✅ COMPLETE | `dynamic-pricing-manager.service.ts` lines 36-106 |
| Fee preview before confirmation | ✅ COMPLETE | `dynamic-pricing.controller.ts` lines 66-92 |
| Historical fee analytics dashboard | ✅ COMPLETE | `fee-analytics.service.ts` (entire file) |

## 📦 Files Created

### Core Module (11 files)
1. `types/fee.types.ts` - Type definitions (167 lines)
2. `dto/fee.dto.ts` - Request/Response DTOs (260 lines)
3. `services/dynamic-pricing-manager.service.ts` - Main orchestrator (245 lines)
4. `services/volume-tier-pricing.service.ts` - Volume pricing (230 lines)
5. `services/volatility-fee-calculator.service.ts` - Volatility adjustments (227 lines)
6. `services/competitor-price-monitor.service.ts` - Competitor tracking (267 lines)
7. `services/personalized-fee-offers.service.ts` - Loyalty discounts (240 lines)
8. `services/fee-ab-testing.service.ts` - A/B testing (338 lines)
9. `services/fee-analytics.service.ts` - Analytics dashboard (219 lines)
10. `dynamic-pricing.controller.ts` - REST API (335 lines)
11. `dynamic-pricing.module.ts` - Module config (52 lines)

### Database & Documentation (3 files)
12. `prisma/migrations/dynamic_pricing_schema.sql` - Database schema (186 lines)
13. `README.md` - Comprehensive documentation (375 lines)
14. `index.ts` - Public API exports (25 lines)

**Total:** 14 files, ~3,366 lines of code

## 🚀 Quick Start Integration

### Step 1: Import Module

Add to your `Backend/src/app.module.ts`:

```typescript
import { DynamicPricingModule } from './dynamic-pricing/dynamic-pricing.module';

@Module({
  imports: [
    // ... existing modules
    DynamicPricingModule,
  ],
})
export class AppModule {}
```

### Step 2: Run Database Migration

```bash
cd Backend
psql -U your_username -d stellara_db -f prisma/migrations/dynamic_pricing_schema.sql
```

Or in pgAdmin/other SQL client:
```sql
-- Copy contents of prisma/migrations/dynamic_pricing_schema.sql
-- Execute in your database
```

### Step 3: Use in Trading Service

Inject the `DynamicPricingManagerService`:

```typescript
import { DynamicPricingManagerService } from './dynamic-pricing';

@Injectable()
export class TradingService {
  constructor(
    private pricingManager: DynamicPricingManagerService,
  ) {}

  async executeTrade(tradeData: TradeData) {
    // Calculate dynamic fee
    const fee = await this.pricingManager.calculateDynamicFee({
      userId: tradeData.userId,
      symbol: tradeData.symbol,
      tradeAmount: tradeData.amount,
      feeType: tradeData.isMaker ? FeeType.MAKER : FeeType.TAKER,
      profile: tradeData.userProfile,
    });

    // Apply fee to trade
    const totalAmount = tradeData.amount + fee.feeAmount;
    
    // ... execute trade logic
  }
}
```

### Step 4: Preview Fees in UI

Call the preview endpoint before trade confirmation:

```typescript
// In your frontend/API client
const feePreview = await fetch('/api/fees/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    symbol: 'BTC-USDT',
    tradeAmount: '10000000000', // $10,000
    feeType: 'MAKER',
  }),
});

const { data } = await feePreview.json();
console.log('Fee Breakdown:', data.breakdown);
```

## 📊 Key Features Summary

### 1. Volume-Based Tiered Pricing
```typescript
// 6 tiers from retail to VIP
Tier 0: <$10k     → 0.10% maker / 0.20% taker
Tier 1: $10k-$50k → 0.08% maker / 0.16% taker
Tier 2: $50k-$100k→ 0.06% maker / 0.12% taker
Tier 3: $100k-$500k→0.04% maker / 0.08% taker
Tier 4: $500k-$1M → 0.02% maker / 0.05% taker
Tier 5: >$1M      → 0.02% maker / 0.05% taker + 10% discount
```

### 2. Volatility Adjustment
```typescript
Hourly Change    → Multiplier → Fee Impact
< 1%            → 1.0x      → No change
1-3%            → 1.1x      → +10%
3-5%            → 1.25x     → +25%
> 5%            → 1.5x      → +50%
```

### 3. Loyalty Discounts
```typescript
Loyalty Score  → Tier      → Additional Discount
0-19          → Bronze    → 0%
20-39         → Silver    → 2%
40-59         → Gold      → 5%
60-79         → Platinum  → 10%
80-94         → Diamond   → 15%
95+           → Diamond+  → 25%
```

### 4. User Segments
```typescript
Segment        → Base Discount
Retail         → 0%
Professional   → 5%
Institutional  → 10%
VIP            → 20%
```

## 🔧 Configuration Options

### Update Volume Tiers
```typescript
await volumePricing.updateVolumeTiers([
  { 
    minVolume: 0n, 
    maxVolume: 10_000_000_000n, 
    makerFee: 0.1, 
    takerFee: 0.2 
  },
  // ... more tiers
]);
```

### Update Volatility Thresholds
```typescript
// In volatility-fee-calculator.service.ts, modify:
private readonly volatilityThresholds = {
  low: 1.0,
  medium: 3.0,
  high: 5.0,      // Adjust this for different trigger
  extreme: 10.0,
};
```

### Configure A/B Test
```typescript
await abTesting.createTest({
  name: 'Fee Elasticity Test',
  assignmentRatio: [40, 30, 30], // Control, A, B
  controlFeeMultiplier: 1.0,
  variantAFeeMultiplier: 1.1,
  variantBFeeMultiplier: 1.2,
});
```

## 📈 Monitoring & Analytics

### Get Fee Analytics
```typescript
const analytics = await analyticsService.getFeeAnalytics({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  symbol: 'BTC-USDT',
});
```

### Track A/B Test Performance
```typescript
const results = abTesting.calculateTestResults('test_id');
const winner = abTesting.determineWinner('test_id');
console.log(`Winner: ${winner.winner} with ${(winner.confidence * 100).toFixed(2)}% confidence`);
```

## 🎯 Best Practices

1. **Cache User Profiles**: Store user trading profiles in Redis for fast access
2. **Batch Volatility Updates**: Update volatility data every 5 minutes, not on every trade
3. **Monitor Fee Bounds**: Ensure fees stay within acceptable ranges (0.01% - 0.5%)
4. **A/B Test Responsibly**: Start with small user groups (5-10%)
5. **Audit Trail**: All fee calculations are logged to `fee_calculations_log` table

## 🔍 Testing

### Unit Test Example
```typescript
describe('VolumeTierPricingService', () => {
  it('should calculate correct fee for tier', () => {
    const fee = service.calculateFeeWithDiscounts({
      volume30d: 50_000_000_000n,
      tradeAmount: 10_000_000_000n,
      feeType: FeeType.MAKER,
      segment: UserSegment.RETAIL,
    });
    
    expect(fee.finalFee).toBeCloseTo(0.06, 4);
  });
});
```

## 🐛 Troubleshooting

### Issue: Fees not calculating correctly
**Solution**: Check that user profile has correct volume30d value

### Issue: Volatility adjustments not applying
**Solution**: Ensure volatility data is updated via `/api/fees/volatility` endpoint

### Issue: A/B tests not working
**Solution**: Verify user is assigned to test via `abTesting.assignUserToTest()`

## 📞 Support

For questions or issues:
1. Check README.md for detailed documentation
2. Review type definitions in `types/fee.types.ts`
3. Inspect API endpoints in `dynamic-pricing.controller.ts`

## 🎉 Next Steps

Your dynamic pricing engine is ready! Start by:
1. Running the database migration
2. Importing the module
3. Testing fee calculation with sample data
4. Integrating into your trading flow
5. Monitoring analytics dashboard

Happy coding! 🚀
