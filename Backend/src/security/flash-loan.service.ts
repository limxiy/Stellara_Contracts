import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FortaAlertDto } from './dto/forta-alert.dto';
import { AttackType, MitigationStatus } from '@prisma/client';

@Injectable()
export class FlashLoanService {
  private readonly logger = new Logger(FlashLoanService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processFortaAlert(alert: FortaAlertDto) {
    this.logger.log(`Received Forta alert: ${alert.alertId} with severity ${alert.severity}`);

    const metadata = alert.metadata || {};
    const loanAmount = metadata.loanAmount ? Number(metadata.loanAmount) : 0;
    
    let attackType: AttackType = AttackType.UNKNOWN;
    if (alert.name.toLowerCase().includes('oracle')) attackType = AttackType.ORACLE_MANIPULATION;
    else if (alert.name.toLowerCase().includes('governance')) attackType = AttackType.GOVERNANCE_ATTACK;
    else if (alert.name.toLowerCase().includes('liquidation')) attackType = AttackType.LIQUIDATION_CASCADE;

    // Pattern Matching Logic
    const isLargeLoan = loanAmount > 1000000;
    const isHighSeverity = alert.severity === 'HIGH' || alert.severity === 'CRITICAL';
    const isSuspiciousPattern = metadata.repaymentStatus === 'FAILED' || metadata.hopCount > 10;

    let mitigationStatus: MitigationStatus = MitigationStatus.DETECTED;

    if ((isLargeLoan && isHighSeverity) || isSuspiciousPattern) {
      this.logger.warn(`CRITICAL: Flash loan attack pattern detected! Triggering circuit breaker...`);
      await this.pauseAffectedMarkets(alert.protocol || 'DefaultProtocol');
      mitigationStatus = MitigationStatus.PAUSED;
      
      await this.alertSecurityTeam(alert);
    }

    const forensicData = {
      ...alert,
      graph: this.generateTransactionGraph(alert.hash, metadata),
    };

    return this.prisma.flashLoanDetection.create({
      data: {
        transactionHash: alert.hash,
        network: alert.network || 'stellar',
        loanAmount: loanAmount,
        tokenAddress: metadata.tokenAddress || 'Unknown',
        attackType: attackType,
        status: mitigationStatus,
        evidence: forensicData as any,
      },
    });
  }

  /**
   * Generates a transaction graph for forensic visualization.
   * (Simulation)
   */
  private generateTransactionGraph(txHash: string, metadata: any) {
    return {
      nodes: [
        { id: 'Attacker', type: 'wallet', address: metadata.attackerAddress || '0x...' },
        { id: 'LendingPool', type: 'contract', address: metadata.poolAddress || '0x...' },
        { id: 'DEX', type: 'contract', address: metadata.dexAddress || '0x...' },
        { id: 'TargetProtocol', type: 'contract', address: metadata.targetAddress || '0x...' },
      ],
      edges: [
        { from: 'LendingPool', to: 'Attacker', action: 'Loan', amount: metadata.loanAmount },
        { from: 'Attacker', to: 'DEX', action: 'Swap', amount: metadata.loanAmount },
        { from: 'DEX', to: 'TargetProtocol', action: 'Manipulate', effect: 'PriceImpact' },
        { from: 'Attacker', to: 'LendingPool', action: 'Repay', status: metadata.repaymentStatus },
      ],
    };
  }

  private async pauseAffectedMarkets(protocol: string) {
    this.logger.warn(`[CIRCUIT BREAKER] Emergency pause active for: ${protocol}`);
    // Real implementation would call contract.pause()
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  private async alertSecurityTeam(alert: FortaAlertDto) {
    this.logger.error(`[SECURITY ALERT] Flash loan exploit suspected! Hash: ${alert.hash}`);
    // Send to PagerDuty/Slack
  }

  async getHistoricalAttacks() {
    return this.prisma.flashLoanDetection.findMany({
      orderBy: { detectedAt: 'desc' },
    });
  }

  async getDetectionForensics(id: string) {
    return this.prisma.flashLoanDetection.findUnique({
      where: { id },
    });
  }
}
