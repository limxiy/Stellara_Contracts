import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * L2IntegrationService
 *
 * Provides a routing layer that can offload non-urgent or high-volume
 * settlement transactions to configurable Layer-2 / sidechain providers.
 *
 * Supported provider types (configured via env):
 *   SETTLEMENT_L2_PROVIDER = "soroban_channels" | "payment_channels" | "none"
 *
 * Design:
 *  - Offload decisions are driven by congestion score and urgency.
 *  - Each provider implementation is a thin adapter; real implementations
 *    will connect to their respective networks/networks.
 *  - Tracks estimated fee savings vs L1 submission cost.
 */
@Injectable()
export class L2IntegrationService {
  private readonly logger = new Logger(L2IntegrationService.name);

  private readonly enabledProvider: string;
  private readonly l2FeeMultiplier: number; // fraction of L1 fee (e.g. 0.1 = 10%)
  private readonly congestionOffloadThreshold: number; // offload when score > this value

  constructor(private readonly configService: ConfigService) {
    this.enabledProvider = this.configService.get<string>('SETTLEMENT_L2_PROVIDER', 'soroban_channels');
    this.l2FeeMultiplier = this.configService.get<number>('SETTLEMENT_L2_FEE_MULTIPLIER', 0.1);
    this.congestionOffloadThreshold = this.configService.get<number>(
      'SETTLEMENT_L2_CONGESTION_THRESHOLD',
      0.6,
    );
  }

  /**
   * Determines whether a settlement job should be routed to an L2 provider.
   *
   * Rules:
   *   - URGENT jobs are never offloaded (guarantee fastest L1 finality).
   *   - When L2 is disabled ("none"), always return false.
   *   - Otherwise offload when network congestion is above the threshold and
   *     the urgency is LOW or NORMAL.
   */
  shouldOffloadToL2(opts: {
    urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    congestionScore: number;
    l1FeeStroops: number;
  }): boolean {
    if (this.enabledProvider === 'none') return false;
    if (opts.urgency === 'URGENT' || opts.urgency === 'HIGH') return false;
    return opts.congestionScore >= this.congestionOffloadThreshold;
  }

  /**
   * Submits a settlement transaction to the configured L2 provider.
   * Returns the provider name, a simulated tx reference, and the fee paid.
   */
  async submitToL2(opts: {
    settlementJobId: string;
    signerAddress: string;
    contractAddress?: string;
    payload: Record<string, unknown>;
    l1FeeStroops: number;
  }): Promise<{
    provider: string;
    txRef: string;
    feePaidStroops: number;
    estimatedFeeSaved: number;
  }> {
    const l2Fee = Math.max(1, Math.round(opts.l1FeeStroops * this.l2FeeMultiplier));
    const savedFee = opts.l1FeeStroops - l2Fee;

    this.logger.debug(
      `L2 offload [${this.enabledProvider}] job=${opts.settlementJobId} l1Fee=${opts.l1FeeStroops} l2Fee=${l2Fee}`,
    );

    switch (this.enabledProvider) {
      case 'soroban_channels':
        return this.submitViaSorobanChannels(opts, l2Fee, savedFee);
      case 'payment_channels':
        return this.submitViaPaymentChannels(opts, l2Fee, savedFee);
      default:
        throw new Error(`Unknown L2 provider: ${this.enabledProvider}`);
    }
  }

  getProviderName(): string {
    return this.enabledProvider;
  }

  isEnabled(): boolean {
    return this.enabledProvider !== 'none';
  }

  // ─── Provider adapters ───────────────────────────────────────────────────────

  private async submitViaSorobanChannels(
    opts: { settlementJobId: string; signerAddress: string; payload: Record<string, unknown> },
    l2Fee: number,
    savedFee: number,
  ): Promise<{ provider: string; txRef: string; feePaidStroops: number; estimatedFeeSaved: number }> {
    // Soroban state channels — batch micro-transactions off-chain and settle
    // final state to L1 periodically. Real implementation connects to a
    // Soroban channel contract.
    const txRef = `soroban_ch_${Date.now()}_${opts.settlementJobId.slice(0, 8)}`;
    return { provider: 'soroban_channels', txRef, feePaidStroops: l2Fee, estimatedFeeSaved: savedFee };
  }

  private async submitViaPaymentChannels(
    opts: { settlementJobId: string; signerAddress: string; payload: Record<string, unknown> },
    l2Fee: number,
    savedFee: number,
  ): Promise<{ provider: string; txRef: string; feePaidStroops: number; estimatedFeeSaved: number }> {
    // Stellar payment channels — pre-signed sequence of transactions that can
    // be submitted cooperatively at low cost. Real implementation exchanges
    // signed envelopes with the counterparty.
    const txRef = `pay_ch_${Date.now()}_${opts.settlementJobId.slice(0, 8)}`;
    return { provider: 'payment_channels', txRef, feePaidStroops: l2Fee, estimatedFeeSaved: savedFee };
  }
}
