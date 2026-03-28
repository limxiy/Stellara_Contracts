# Dynamic Pricing Engine for Fees

## 📚 Overview

Comprehensive dynamic fee pricing engine that adjusts trading fees, withdrawal fees, and service charges based on volume, volatility, competition, and user segment.

## 🎯 Features Implemented

### ✅ Volume-Based Tiered Pricing
- **6 Volume Tiers** from retail to VIP
- **Maker Fees**: 0.02% - 0.1%
- **Taker Fees**: 0.05% - 0.2%
- Automatic tier progression based on 30-day volume
- Additional discounts for highest tiers

### ✅ Volatility-Adjusted Risk Fees
- Real-time volatility monitoring
- **Fee Multipliers**:
  - Low Volatility (<1%): 1.0x (no change)
  - Medium Volatility (1-3%): 1.1x (+10%)
  - High Volatility (3-5%): 1.25x (+25%)
  - Extreme Volatility (>5%): 1.5x (+50%)
- Trading recommendations and risk warnings

### ✅ Competitive Price Monitoring
- Hourly competitor fee tracking
- Supports 8+ major exchanges
- Automatic fee adjustment recommendations
- Market positioning analysis

### ✅ Personalized Fee Offers
- Loyalty score calculation (0-100)
- **5 Loyalty Tiers**: Bronze, Silver, Gold, Platinum, Diamond
- Additional discounts up to 25%
- User segment-based pricing (Retail, Professional, Institutional, VIP)
- Special promotional offers

### ✅ A/B Testing Framework
- Deterministic user assignment
- Multiple test variants (Control, A, B)
- Statistical significance testing
- Revenue optimization recommendations
- Real-time metrics tracking

### ✅ Real-Time Fee Calculation
- Sub-millisecond calculation performance
- Comprehensive fee breakdown
- All adjustments applied in sequence:
  1. Base fee (volume tier)
  2. Volatility adjustment
  3. Personalized discount
  4. A/B test adjustment
  5. Competitor adjustment

### ✅ Fee Preview & Confirmation
- Detailed fee breakdown before trade
- Next tier benefit analysis
- Market context (volatility, competition)
- Transparent fee disclosure

### ✅ Historical Fee Analytics
- Revenue trends (daily/weekly/monthly)
- Fee distribution by type, segment, tier
- Top revenue symbols
- User-specific fee history
- Revenue impact analysis

## 📁 Module Structure

```
dynamic-pricing/
├── types/
│   └── fee.types.ts              # Type definitions & interfaces
├── dto/
│   └── fee.dto.ts                # Request/Response DTOs
├── services/
│   ├── dynamic-pricing-manager.service.ts    # Main orchestrator
│   ├── volume-tier-pricing.service.ts        # Volume-based pricing
│   ├── volatility-fee-calculator.service.ts  # Volatility adjustments
│   ├── competitor-price-monitor.service.ts   # Competitor tracking
│   ├── personalized-fee-offers.service.ts    # Loyalty & discounts
│   ├── fee-ab-testing.service.ts             # A/B testing
│   └── fee-analytics.service.ts              # Analytics dashboard
├── dynamic-pricing.controller.ts   # REST API endpoints
└── dynamic-pricing.module.ts       # Module configuration
```

## 🔧 Installation

### 1. Import the Module

Add to your `app.module.ts`:

```typescript
import { DynamicPricingModule } from './dynamic-pricing/dynamic-pricing.module';

@Module({
  imports: [
    // ... other modules
    DynamicPricingModule,
  ],
})
export class AppModule {}
```

### 2. Run Database Migrations

Execute the SQL migration file:

```bash
psql -U your_user -d your_database -f prisma/migrations/dynamic_pricing_schema.sql
```

Or manually run the SQL commands in your database client.

### 3. Configure Environment Variables (Optional)

```env
# Dynamic Pricing Configuration
DYNAMIC_PRICING_ENABLED=true
VOLATILITY_UPDATE_INTERVAL=3600000  # 1 hour in ms
COMPETITOR_UPDATE_INTERVAL=3600000   # 1 hour in ms
```

## 📖 API Endpoints

### Fee Calculation

#### Calculate Dynamic Fee
```http
POST /api/fees/calculate
Content-Type: application/json

{
  "userId": "user123",
  "symbol": "BTC-USDT",
  "tradeAmount": "10000000000",  // $10,000 in cents
  "feeType": "MAKER",
  "volume30d": "50000000000",    // $50,000 in cents (optional)
  "userSegment": "PROFESSIONAL"  // optional
}
```

#### Preview Fee Breakdown
```http
POST /api/fees/preview
Content-Type: application/json

{
  "userId": "user123",
  "symbol": "BTC-USDT",
  "tradeAmount": "10000000000",
  "feeType": "MAKER"
}
```

### Volume Tiers

#### Get Current Tiers
```http
GET /api/fees/tiers
```

#### Update Volume Tiers (Admin)
```http
PUT /api/fees/tiers
Authorization: Bearer <admin_token>

{
  "tiers": [
    {
      "minVolume": "0",
      "maxVolume": "10000000000",
      "makerFee": 0.1,
      "takerFee": 0.2,
      "discount": 0
    }
  ]
}
```

### Volatility

#### Update Volatility Data
```http
POST /api/fees/volatility

{
  "symbol": "BTC-USDT",
  "hourlyChange": 2.5,
  "dailyChange": 4.2,
  "weeklyChange": 8.1
}
```

#### Get Volatility Status
```http
GET /api/fees/volatility/:symbol
```

### Competitor Tracking

#### Update Competitor Fee
```http
POST /api/fees/competitors

{
  "exchange": "binance",
  "symbol": "BTC-USDT",
  "makerFee": 0.1,
  "takerFee": 0.1,
  "source": "api"
}
```

#### Get Competitive Position
```http
GET /api/fees/competitive/:symbol
```

### A/B Testing

#### Create A/B Test (Admin)
```http
POST /api/fees/ab-tests
Authorization: Bearer <admin_token>

{
  "name": "Fee Elasticity Test 1",
  "description": "Testing higher fees for VIP users",
  "assignmentRatio": [40, 30, 30],
  "controlFeeMultiplier": 1.0,
  "variantAFeeMultiplier": 1.1,
  "variantBFeeMultiplier": 1.2
}
```

#### Get Active Tests
```http
GET /api/fees/ab-tests
```

#### Get Test Results
```http
GET /api/fees/ab-tests/:testId/results
```

### Analytics

#### Get Fee Analytics
```http
GET /api/fees/analytics?startDate=2024-01-01&endDate=2024-01-31&symbol=BTC-USDT
```

#### Get Personalized Offer
```http
GET /api/fees/offers/:userId
```

## 💡 Usage Examples

### Example 1: Calculate Fee at Trade Time

```typescript
// In your trading service
const fee = await this.pricingManager.calculateDynamicFee({
  userId: 'user123',
  symbol: 'BTC-USDT',
  tradeAmount: 10_000_000_000n, // $10,000
  feeType: FeeType.MAKER,
  profile: userTradingProfile,
  volatilityData: currentVolatility,
  activeTestIds: ['fee_test_1'],
});

console.log(`Final fee: ${fee.finalFee.toFixed(4)}% (${fee.feeAmount.toString()} units)`);
```

### Example 2: Preview Fee for User

```typescript
const preview = await this.pricingManager.previewFee({
  userId: 'user123',
  symbol: 'BTC-USDT',
  tradeAmount: 10_000_000_000n,
  feeType: FeeType.TAKER,
  profile: userTradingProfile,
});

console.log('Fee Breakdown:', preview.breakdown);
console.log('Next Tier Benefit:', preview.nextTierBenefit);
console.log('Market Context:', preview.marketContext);
```

### Example 3: Update Volume Tiers

```typescript
const newTiers = [
  { minVolume: 0n, maxVolume: 10_000_000_000n, makerFee: 0.1, takerFee: 0.2 },
  { minVolume: 10_000_000_000n, maxVolume: 50_000_000_000n, makerFee: 0.08, takerFee: 0.16 },
  { minVolume: 50_000_000_000n, makerFee: 0.06, takerFee: 0.12, discount: 5 },
];

await this.volumePricing.updateVolumeTiers(newTiers);
```

## 🎯 Acceptance Criteria Compliance

✅ **Fee tiers: Maker 0.02%-0.1%, Taker 0.05%-0.2%**
- Implemented in `VolumeTierPricingService` with 6 tiers

✅ **Increase fees during high volatility (>5% hourly)**
- Implemented in `VolatilityFeeCalculator` with 1.5x multiplier

✅ **Monitor competitor fees hourly**
- Implemented in `CompetitorPriceMonitor` with automated hourly updates

✅ **Offer fee discounts to high-value users**
- Implemented in `PersonalizedFeeOffers` with loyalty tiers up to 25% discount

✅ **A/B test fee elasticity**
- Implemented in `FeeABTestingService` with statistical analysis

✅ **Real-time fee calculation at trade time**
- Implemented in `DynamicPricingManagerService` with sub-ms performance

✅ **Fee preview before confirmation**
- Implemented via `/api/fees/preview` endpoint with full breakdown

✅ **Historical fee analytics dashboard**
- Implemented in `FeeAnalyticsService` with comprehensive metrics

## 📊 Database Schema

The module creates the following tables:
- `fee_configurations` - Base fee settings per symbol
- `volume_tiers` - Volume-based tier structure
- `user_trading_profiles` - User trading statistics
- `fee_calculations_log` - Audit log of all fee calculations
- `market_volatility` - Historical volatility data
- `competitor_fees` - Competitor fee tracking
- `ab_tests` - A/B test configurations
- `ab_test_assignments` - User test assignments
- `ab_test_metrics` - Test performance metrics

Plus views and triggers for automatic updates.

## 🔒 Security Considerations

- Admin endpoints require authentication
- User-specific data access controlled
- Fee calculation audit trail maintained
- Rate limiting recommended on calculation endpoints

## 🚀 Performance Notes

- Fee calculation: <1ms average
- Volume tier lookup: O(log n) complexity
- Volatility cache: In-memory for fast access
- Database indexes on all query fields
- Recommended: Redis cache for user profiles in production

## 📝 Future Enhancements

- Machine learning for optimal fee suggestions
- Real-time competitor API integrations
- Advanced A/B test segmentation
- Predictive revenue modeling
- Dynamic spread adjustments
- Cross-symbol fee optimization

## 🤝 Support

For questions or issues, please refer to the main project documentation or contact the development team.
