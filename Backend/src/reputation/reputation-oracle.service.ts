import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { User, ReputationSignal, Endorsement, Dispute } from '@prisma/client';

@Injectable()
export class ReputationOracleService {
  private readonly logger = new Logger(ReputationOracleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregates trust signals from multiple sources and updates user's reputation score.
   */
  async aggregateSignals(userId: string): Promise<number> {
    const signals = await this.prisma.reputationSignal.findMany({
      where: { userId },
    });

    const endorsements = await this.prisma.endorsement.findMany({
      where: { toUserId: userId },
      include: { fromUser: true },
    });

    // 1. Base Score calculation from signals
    // Weighted average: Sum(value * weight) / Sum(weights)
    let totalWeightedScore = 0;
    let totalWeight = 0;

    signals.forEach(signal => {
      totalWeightedScore += signal.value * signal.weight;
      totalWeight += signal.weight;
    });

    let baseScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 50; // default 50

    // 2. Endorsements Adjustment
    // Endorsements from users with high reputation carry more weight
    let endorsementBonus = 0;
    endorsements.forEach(endorsement => {
      const endorserReputation = endorsement.fromUser.reputationScore;
      const weight = (endorserReputation / 100) * endorsement.weight;
      endorsementBonus += weight;
    });

    // 3. Sybil Resistance Check
    const sybilMultiplier = await this.calculateSybilMultiplier(userId);

    // Final Score Calculation
    let finalScore = (baseScore + endorsementBonus) * sybilMultiplier;
    
    // Normalize to 0-100 range
    finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

    await this.prisma.user.update({
      where: { id: userId },
      data: { reputationScore: finalScore },
    });

    // Record history
    await this.prisma.reputationHistory.create({
      data: {
        userId,
        scoreChange: finalScore, // simplified as absolute score for history for now
        reason: 'Aggregated Oracle Update',
      },
    });

    return finalScore;
  }

  /**
   * Detects potential Sybil attacks based on wallet age, transaction history, etc.
   * Returns a multiplier between 0 and 1.
   */
  private async calculateSybilMultiplier(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { contributions: true },
    });

    if (!user) return 0;

    const accountAgeDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    let multiplier = 1.0;

    // Penalty for very new accounts
    if (accountAgeDays < 7) multiplier *= 0.5;
    else if (accountAgeDays < 30) multiplier *= 0.8;

    // Penalty for lack of activity
    if (user.contributions.length === 0) multiplier *= 0.7;

    return multiplier;
  }

  /**
   * Generates a privacy-preserving proof that a user's reputation score is above a threshold.
   * (Simplified Simulation)
   */
  async generateReputationProof(userId: string, threshold: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const isAboveThreshold = user.reputationScore >= threshold;
    
    return {
      userId,
      threshold,
      proof: `zk-proof-${Math.random().toString(36).substring(7)}`,
      isValid: isAboveThreshold,
      timestamp: new Date(),
    };
  }

  /**
   * Submits a signal for a user.
   */
  async submitSignal(data: { userId: string, source: string, value: number, weight: number, metadata?: any }) {
    return this.prisma.reputationSignal.create({
      data: {
        userId: data.userId,
        source: data.source,
        value: data.value,
        weight: data.weight,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Submits an endorsement.
   */
  async submitEndorsement(fromUserId: string, toUserId: string, weight: number, comment?: string) {
    if (fromUserId === toUserId) throw new BadRequestException('Cannot endorse self');

    return this.prisma.endorsement.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      update: { weight, comment },
      create: { fromUserId, toUserId, weight, comment },
    });
  }

  /**
   * Resolves a dispute.
   */
  async resolveDispute(disputeId: string, resolution: string, status: 'RESOLVED' | 'REJECTED') {
    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: { resolution, status, updatedAt: new Date() },
    });
  }

  /**
   * Mints a Soulbound Token (SBT) representing the user's reputation.
   * (Simulation)
   */
  async mintSoulboundToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    if (user.reputationScore < 70) {
      throw new BadRequestException('Reputation score too low to mint SBT (minimum 70 required)');
    }

    return {
      userId,
      tokenId: `sbt-${userId}-${Date.now()}`,
      reputationScore: user.reputationScore,
      metadataUrl: `https://stellara.io/reputation/metadata/${userId}.json`,
      mintedAt: new Date(),
      status: 'MINTED',
    };
  }
}
