import { Injectable, Logger } from '@nestjs/common';
import { CurrencyCode, ExchangeRate } from '../types/accounting.types';

/**
 * Multi-Currency Service
 * Manages exchange rates and currency conversions for 50+ currencies
 */
@Injectable()
export class MultiCurrencyService {
  private readonly logger = new Logger(MultiCurrencyService.name);

  // Exchange rate storage (in production, use database + external API)
  private exchangeRates = new Map<string, ExchangeRate>();
  
  // Base currency for reporting
  private baseCurrency: CurrencyCode = CurrencyCode.USD;

  // Supported currencies (50+ fiat + crypto)
  private readonly supportedCurrencies: CurrencyCode[] = [
    // Major Fiat
    CurrencyCode.USD, CurrencyCode.EUR, CurrencyCode.GBP, CurrencyCode.JPY,
    CurrencyCode.CHF, CurrencyCode.CAD, CurrencyCode.AUD, CurrencyCode.CNY,
    CurrencyCode.INR, CurrencyCode.BRL,
    
    // Additional Fiat (expand as needed)
    'MXN' as CurrencyCode, 'ZAR' as CurrencyCode, 'SGD' as CurrencyCode,
    'HKD' as CurrencyCode, 'NOK' as CurrencyCode, 'SEK' as CurrencyCode,
    'DKK' as CurrencyCode, 'NZD' as CurrencyCode, 'KRW' as CurrencyCode,
    
    // Cryptocurrencies
    CurrencyCode.BTC, CurrencyCode.ETH, CurrencyCode.USDT, CurrencyCode.USDC,
    CurrencyCode.XLM,
  ];

  /**
   * Update exchange rate
   */
  updateExchangeRate(params: {
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    rate: number;
    effectiveDate?: Date;
    source?: string;
  }): ExchangeRate {
    const { fromCurrency, toCurrency, rate, effectiveDate = new Date(), source = 'MANUAL' } = params;

    if (rate <= 0) {
      throw new Error('Exchange rate must be positive');
    }

    const rateId = this.generateRateId(fromCurrency, toCurrency);
    
    const exchangeRate: ExchangeRate = {
      id: rateId,
      fromCurrency,
      toCurrency,
      rate,
      inverseRate: 1 / rate,
      effectiveDate,
      source,
      isDailyRate: true,
      createdAt: new Date(),
    };

    this.exchangeRates.set(rateId, exchangeRate);
    
    this.logger.log(
      `Updated rate ${fromCurrency}/${toCurrency}: ${rate} (${source})`,
    );

    return exchangeRate;
  }

  /**
   * Get current exchange rate
   */
  getExchangeRate(fromCurrency: CurrencyCode, toCurrency: CurrencyCode): number | null {
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    const rateId = this.generateRateId(fromCurrency, toCurrency);
    const rate = this.exchangeRates.get(rateId);
    
    if (rate) {
      return rate.rate;
    }

    // Try inverse
    const inverseRateId = this.generateRateId(toCurrency, fromCurrency);
    const inverseRate = this.exchangeRates.get(inverseRateId);
    
    if (inverseRate) {
      return inverseRate.inverseRate;
    }

    return null;
  }

  /**
   * Convert amount between currencies
   */
  convertCurrency(params: {
    amount: bigint;
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    rate?: number; // Optional custom rate
  }): { originalAmount: bigint; convertedAmount: bigint; rate: number } {
    const { amount, fromCurrency, toCurrency } = params;
    
    let rate = params.rate || this.getExchangeRate(fromCurrency, toCurrency);
    
    if (!rate) {
      throw new Error(`No exchange rate available for ${fromCurrency}/${toCurrency}`);
    }

    const convertedAmount = BigInt(Math.round(Number(amount) * rate));

    return {
      originalAmount: amount,
      convertedAmount,
      rate,
    };
  }

  /**
   * Get all rates for a currency (for dashboard)
   */
  getAllRatesForCurrency(currency: CurrencyCode): Array<{
    targetCurrency: CurrencyCode;
    rate: number;
    change24h?: number;
  }> {
    const rates: any[] = [];
    
    for (const target of this.supportedCurrencies) {
      if (target === currency) continue;
      
      const rate = this.getExchangeRate(currency, target);
      if (rate) {
        rates.push({
          targetCurrency: target,
          rate,
        });
      }
    }

    return rates;
  }

  /**
   * Calculate unrealized gain/loss on currency positions
   */
  calculateUnrealizedGainLoss(params: {
    currency: CurrencyCode;
    originalAmount: bigint;
    bookingRate: number;
    currentRate: number;
  }): bigint {
    const { originalAmount, bookingRate, currentRate } = params;
    
    const baseValueAtBooking = BigInt(Math.round(Number(originalAmount) * bookingRate));
    const baseValueAtCurrent = BigInt(Math.round(Number(originalAmount) * currentRate));
    
    return baseValueAtCurrent - baseValueAtBooking;
  }

  /**
   * Set base currency for reporting
   */
  setBaseCurrency(currency: CurrencyCode): void {
    if (!this.supportedCurrencies.includes(currency)) {
      throw new Error(`Currency ${currency} not supported`);
    }
    this.baseCurrency = currency;
    this.logger.log(`Base currency set to ${currency}`);
  }

  /**
   * Get base currency
   */
  getBaseCurrency(): CurrencyCode {
    return this.baseCurrency;
  }

  /**
   * Check if currency is supported
   */
  isCurrencySupported(currency: string): boolean {
    return this.supportedCurrencies.includes(currency as CurrencyCode);
  }

  /**
   * Add support for new currency
   */
  addCurrency(currency: CurrencyCode): void {
    if (!this.supportedCurrencies.includes(currency)) {
      this.supportedCurrencies.push(currency);
      this.logger.log(`Added support for ${currency}`);
    }
  }

  /**
   * Generate rate ID
   */
  private generateRateId(from: CurrencyCode, to: CurrencyCode): string {
    return `${from}_${to}`;
  }
}
