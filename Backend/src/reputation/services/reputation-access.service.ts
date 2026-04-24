import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { REPUTATION_THRESHOLDS } from '../guards/reputation.guard';

export interface UserReputationAccess {
  userId: string;
  reputationScore: number;
  accessLevel: string;
  canAccessPremium: boolean;
  canParticipateInGovernance: boolean;
  maxFundingLimit: number;
  features: string[];
}

@Injectable()
export class ReputationAccessService {
  private readonly logger = new Logger(ReputationAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get comprehensive access information for a user based on their reputation
   */
  async getUserAccess(userId: string): Promise<UserReputationAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reputationScore: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const score = user.reputationScore;
    const accessLevel = this.getAccessLevel(score);
    const features = this.getAvailableFeatures(score);

    return {
      userId,
      reputationScore: score,
      accessLevel,
      canAccessPremium: score >= REPUTATION_THRESHOLDS.PREMIUM_ACCESS,
      canParticipateInGovernance: score >= REPUTATION_THRESHOLDS.GOVERNANCE_PARTICIPATION,
      maxFundingLimit: this.calculateFundingLimit(score),
      features,
    };
  }

  /**
   * Check if user can access premium features
   */
  async canAccessPremium(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reputationScore: true },
    });

    return user?.reputationScore >= REPUTATION_THRESHOLDS.PREMIUM_ACCESS;
  }

  /**
   * Check if user can participate in governance voting
   */
  async canParticipateInGovernance(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reputationScore: true },
    });

    return user?.reputationScore >= REPUTATION_THRESHOLDS.GOVERNANCE_PARTICIPATION;
  }

  /**
   * Calculate dynamic funding limit based on reputation score
   * Higher reputation = higher funding limits
   */
  calculateFundingLimit(reputationScore: number): number {
    const baseLimit = 1000; // Base limit in USD

    if (reputationScore >= REPUTATION_THRESHOLDS.ELITE_ACCESS) {
      return baseLimit * 50; // $50,000
    } else if (reputationScore >= REPUTATION_THRESHOLDS.HIGH_VALUE_FUNDING) {
      return baseLimit * 20; // $20,000
    } else if (reputationScore >= REPUTATION_THRESHOLDS.PREMIUM_ACCESS) {
      return baseLimit * 10; // $10,000
    } else if (reputationScore >= REPUTATION_THRESHOLDS.ENHANCED_ACCESS) {
      return baseLimit * 5; // $5,000
    } else {
      return baseLimit; // $1,000
    }
  }

  /**
   * Get access level string based on score
   */
  getAccessLevel(score: number): string {
    if (score >= REPUTATION_THRESHOLDS.ELITE_ACCESS) {
      return 'ELITE';
    } else if (score >= REPUTATION_THRESHOLDS.HIGH_VALUE_FUNDING) {
      return 'HIGH_VALUE';
    } else if (score >= REPUTATION_THRESHOLDS.PREMIUM_ACCESS) {
      return 'PREMIUM';
    } else if (score >= REPUTATION_THRESHOLDS.GOVERNANCE_PARTICIPATION) {
      return 'GOVERNANCE';
    } else if (score >= REPUTATION_THRESHOLDS.ENHANCED_ACCESS) {
      return 'ENHANCED';
    } else {
      return 'BASIC';
    }
  }

  /**
   * Get list of available features based on reputation score
   */
  getAvailableFeatures(score: number): string[] {
    const features = ['basic_projects', 'basic_contributions'];

    if (score >= REPUTATION_THRESHOLDS.ENHANCED_ACCESS) {
      features.push('enhanced_analytics', 'priority_support');
    }

    if (score >= REPUTATION_THRESHOLDS.PREMIUM_ACCESS) {
      features.push('premium_projects', 'advanced_tools', 'custom_branding');
    }

    if (score >= REPUTATION_THRESHOLDS.GOVERNANCE_PARTICIPATION) {
      features.push('governance_voting', 'proposal_creation');
    }

    if (score >= REPUTATION_THRESHOLDS.ELITE_ACCESS) {
      features.push('elite_features', 'vip_support', 'early_access');
    }

    return features;
  }

  /**
   * Check if user meets specific threshold
   */
  meetsThreshold(score: number, threshold: number): boolean {
    return score >= threshold;
  }
}
