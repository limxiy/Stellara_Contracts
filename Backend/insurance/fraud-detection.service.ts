import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { Claim, ClaimStatus } from '@prisma/client';

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyzes a claim for potential fraud and returns a risk score (0-100).
   */
  async analyzeClaim(claimId: string): Promise<number> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        // policy: true,
      },
    });

    if (!claim) throw new Error('Claim not found');

    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: claim.policyId },
    });

    let riskScore = 0;

    // 1. Detect rapid consecutive claims from same user
    const recentClaims = await this.prisma.claim.count({
      where: {
        policy: {
          userId: policy.userId,
        },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });
    if (recentClaims > 2) riskScore += 40;

    // 2. Flag claims exceeding coverage amount
    if (Number(claim.claimAmount) > Number(policy.coverageAmount)) {
      riskScore += 50;
    }

    // 3. Identify duplicate claim submissions
    const duplicateClaims = await this.prisma.claim.count({
      where: {
        policyId: claim.policyId,
        claimAmount: claim.claimAmount,
        id: { not: claim.id },
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      },
    });
    if (duplicateClaims > 0) riskScore += 60;

    // 4. Track claim pattern anomalies (e.g., claiming exactly the coverage amount)
    if (Number(claim.claimAmount) === Number(policy.coverageAmount)) {
      riskScore += 20;
    }

    // 5. User reputation factor
    const user = await this.prisma.user.findUnique({
      where: { id: policy.userId },
    });
    if (user && user.reputationScore < 30) {
      riskScore += 20;
    }

    return Math.min(100, riskScore);
  }

  async flagSuspiciousClaim(claimId: string, riskScore: number) {
    if (riskScore >= 70) {
      this.logger.warn(`High risk claim detected: ${claimId} (Score: ${riskScore})`);
      // Update claim status or add a flag
      // Assuming we have a way to flag it in the DB, or just log it for now
    }
  }
}
