import { Injectable, Logger } from '@nestjs/common';
import { OrderBookManagerService } from './order-book-manager.service';
import { OrderBookSnapshot } from '../types/order-book.types';

/**
 * Cross-product spread calculation service
 * Calculates spreads between related trading pairs
 */
@Injectable()
export class SpreadCalculatorService {
  private readonly logger = new Logger(SpreadCalculatorService.name);

  // Predefined spread pairs
  private spreadPairs: Map<string, SpreadPair> = new Map();

  constructor(private orderBookManager: OrderBookManagerService) {
    this.initializeSpreadPairs();
  }

  /**
   * Get spread between two symbols
   */
  getSpread(symbol1: string, symbol2: string): SpreadData | null {
    const snapshot1 = this.orderBookManager.getSnapshot(symbol1);
    const snapshot2 = this.orderBookManager.getSnapshot(symbol2);

    if (!snapshot1 || !snapshot2) {
      return null;
    }

    return this.calculateSpread(snapshot1, snapshot2);
  }

  /**
   * Get all configured spreads
   */
  getAllSpreads(): Record<string, SpreadData> {
    const spreads: Record<string, SpreadData> = {};

    for (const [pairId, pair] of this.spreadPairs) {
      const spread = this.getSpread(pair.symbol1, pair.symbol2);
      if (spread) {
        spreads[pairId] = spread;
      }
    }

    return spreads;
  }

  /**
   * Calculate triangular arbitrage opportunity
   * Example: BTC/USDT, ETH/BTC, ETH/USDT
   */
  getTriangularArbitrage(
    symbol1: string,
    symbol2: string,
    symbol3: string,
  ): TriangularArbitrageData | null {
    const snapshot1 = this.orderBookManager.getSnapshot(symbol1);
    const snapshot2 = this.orderBookManager.getSnapshot(symbol2);
    const snapshot3 = this.orderBookManager.getSnapshot(symbol3);

    if (!snapshot1 || !snapshot2 || !snapshot3) {
      return null;
    }

    return this.calculateTriangularArbitrage(snapshot1, snapshot2, snapshot3);
  }

  /**
   * Get fair value based on correlated assets
   */
  getFairValue(targetSymbol: string, basketSymbols: string[], weights: number[]): FairValueData | null {
    const targetSnapshot = this.orderBookManager.getSnapshot(targetSymbol);
    
    if (!targetSnapshot) {
      return null;
    }

    const basketMidPrices: number[] = [];
    let weightedSum = 0n;

    for (let i = 0; i < basketSymbols.length; i++) {
      const snapshot = this.orderBookManager.getSnapshot(basketSymbols[i]);
      if (!snapshot || snapshot.bids.length === 0 || snapshot.asks.length === 0) {
        continue;
      }

      const midPrice = BigInt(snapshot.midPrice);
      basketMidPrices.push(Number(midPrice));
      
      // Weight the price
      const weight = BigInt(Math.floor(weights[i] * 1000)); // Convert to basis points
      weightedSum += midPrice * weight;
    }

    if (basketMidPrices.length === 0) {
      return null;
    }

    // Calculate weighted average
    const totalWeight = BigInt(Math.floor(weights.reduce((a, b) => a + b, 0) * 1000));
    const fairValue = weightedSum / totalWeight;

    // Compare to actual mid price
    const targetMidPrice = BigInt(targetSnapshot.midPrice);
    const deviation = ((targetMidPrice - fairValue) * 10000n) / fairValue;

    return {
      symbol: targetSymbol,
      fairValue: fairValue.toString(),
      actualPrice: targetMidPrice.toString(),
      deviationBps: Number(deviation),
      isOvervalued: deviation > 0n,
      timestamp: Date.now(),
    };
  }

  /**
   * Get volume-weighted spread across multiple levels
   */
  getVolumeWeightedSpread(symbol1: string, symbol2: string, levels: number = 5): VWAPSpreadData | null {
    const snapshot1 = this.orderBookManager.getSnapshot(symbol1, levels);
    const snapshot2 = this.orderBookManager.getSnapshot(symbol2, levels);

    if (!snapshot1 || !snapshot2 || 
        snapshot1.bids.length === 0 || snapshot1.asks.length === 0 ||
        snapshot2.bids.length === 0 || snapshot2.asks.length === 0) {
      return null;
    }

    // Calculate VWAP for bids and asks
    const vwap1Bid = this.calculateVWAP(snapshot1.bids);
    const vwap1Ask = this.calculateVWAP(snapshot1.asks);
    const vwap2Bid = this.calculateVWAP(snapshot2.bids);
    const vwap2Ask = this.calculateVWAP(snapshot2.asks);

    const spread1 = vwap1Ask - vwap1Bid;
    const spread2 = vwap2Ask - vwap2Bid;
    const crossSpread = vwap2Bid - vwap1Ask;

    return {
      symbol1,
      symbol2,
      vwap1Bid: vwap1Bid.toString(),
      vwap1Ask: vwap1Ask.toString(),
      vwap2Bid: vwap2Bid.toString(),
      vwap2Ask: vwap2Ask.toString(),
      spread1: spread1.toString(),
      spread2: spread2.toString(),
      crossSpread: crossSpread.toString(),
      timestamp: Date.now(),
    };
  }

  // Private helper methods

  private initializeSpreadPairs() {
    // Common spread pairs in crypto markets
    const pairs: SpreadPair[] = [
      { id: 'BTC-ETH', symbol1: 'BTC-USDT', symbol2: 'ETH-USDT' },
      { id: 'LAYER1', symbol1: 'BTC-USDT', symbol2: 'SOL-USDT' },
      { id: 'DEFI', symbol1: 'UNI-USDT', symbol2: 'AAVE-USDT' },
    ];

    for (const pair of pairs) {
      this.spreadPairs.set(pair.id, pair);
    }
  }

  private calculateSpread(snapshot1: OrderBookSnapshot, snapshot2: OrderBookSnapshot): SpreadData {
    if (snapshot1.bids.length === 0 || snapshot1.asks.length === 0 ||
        snapshot2.bids.length === 0 || snapshot2.asks.length === 0) {
      throw new Error('Insufficient liquidity for spread calculation');
    }

    const mid1 = BigInt(snapshot1.midPrice);
    const mid2 = BigInt(snapshot2.midPrice);
    
    // Calculate ratio spread
    const ratio = (mid1 * 10000n) / mid2;
    
    // Calculate percentage difference
    const pctDiff = ((mid1 - mid2) * 10000n) / mid2;

    // Best bid/ask for each
    const bestBid1 = BigInt(snapshot1.bids[0].price);
    const bestAsk1 = BigInt(snapshot1.asks[0].price);
    const bestBid2 = BigInt(snapshot2.bids[0].price);
    const bestAsk2 = BigInt(snapshot2.asks[0].price);

    // Cross spread (buy symbol1, sell symbol2)
    const crossSpread = bestBid2 - bestAsk1;

    return {
      symbol1: snapshot1.symbol,
      symbol2: snapshot2.symbol,
      mid1: mid1.toString(),
      mid2: mid2.toString(),
      ratio: ratio.toString(),
      percentageDifference: pctDiff.toString(),
      crossSpread: crossSpread.toString(),
      spread1: snapshot1.spread,
      spread2: snapshot2.spread,
      timestamp: Date.now(),
    };
  }

  private calculateTriangularArbitrage(
    snap1: OrderBookSnapshot,
    snap2: OrderBookSnapshot,
    snap3: OrderBookSnapshot,
  ): TriangularArbitrageData | null {
    // Example: BTC/USDT, ETH/BTC, ETH/USDT
    // Check if BTC/USDT ≈ (ETH/BTC) * (ETH/USDT)
    
    if (snap1.asks.length === 0 || snap2.asks.length === 0 || snap3.bids.length === 0) {
      return null;
    }

    const price1 = BigInt(snap1.asks[0].price); // Buy BTC with USDT
    const price2 = BigInt(snap2.asks[0].price); // Buy ETH with BTC
    const price3 = BigInt(snap3.bids[0].price); // Sell ETH for USDT

    // Calculate implied price
    const impliedPrice = (price1 * price2);
    
    // Calculate profit/loss
    const profitLoss = price3 - impliedPrice;
    const profitPct = (profitLoss * 10000n) / impliedPrice;

    const isArbitrage = profitLoss > 0n;

    return {
      symbol1: snap1.symbol,
      symbol2: snap2.symbol,
      symbol3: snap3.symbol,
      price1: price1.toString(),
      price2: price2.toString(),
      price3: price3.toString(),
      impliedPrice: impliedPrice.toString(),
      profitLoss: profitLoss.toString(),
      profitPercentage: profitPct.toString(),
      isArbitrageOpportunity: isArbitrage,
      timestamp: Date.now(),
    };
  }

  private calculateVWAP(levels: Array<{ price: string; quantity: string }>): bigint {
    let totalValue = 0n;
    let totalQty = 0n;

    for (const level of levels) {
      const price = BigInt(level.price);
      const qty = BigInt(level.quantity);
      
      totalValue += price * qty;
      totalQty += qty;
    }

    return totalQty > 0n ? totalValue / totalQty : 0n;
  }
}

// Type definitions

interface SpreadPair {
  id: string;
  symbol1: string;
  symbol2: string;
}

interface SpreadData {
  symbol1: string;
  symbol2: string;
  mid1: string;
  mid2: string;
  ratio: string;
  percentageDifference: string;
  crossSpread: string;
  spread1: string;
  spread2: string;
  timestamp: number;
}

interface TriangularArbitrageData {
  symbol1: string;
  symbol2: string;
  symbol3: string;
  price1: string;
  price2: string;
  price3: string;
  impliedPrice: string;
  profitLoss: string;
  profitPercentage: string;
  isArbitrageOpportunity: boolean;
  timestamp: number;
}

interface FairValueData {
  symbol: string;
  fairValue: string;
  actualPrice: string;
  deviationBps: number;
  isOvervalued: boolean;
  timestamp: number;
}

interface VWAPSpreadData {
  symbol1: string;
  symbol2: string;
  vwap1Bid: string;
  vwap1Ask: string;
  vwap2Bid: string;
  vwap2Ask: string;
  spread1: string;
  spread2: string;
  crossSpread: string;
  timestamp: number;
}
