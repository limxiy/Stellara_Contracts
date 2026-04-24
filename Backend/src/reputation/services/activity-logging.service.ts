import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ReputationService } from '../reputation.service';
import { ActivityType } from '../reputation.constants';

/**
 * Configuration interface for activity weights
 */
export interface ActivityWeightConfig {
  [key: string]: {
    type: ActivityType;
    baseValue: number;
    scalable?: boolean; // If true, value scales with amount
  };
}

/**
 * Default activity weight configuration.
 * Can be overridden via environment variables or database in the future.
 */
export const DEFAULT_ACTIVITY_WEIGHTS: ActivityWeightConfig = {
  PROJECT_COMPLETION: {
    type: ActivityType.PROJECT_COMPLETION,
    baseValue: 100,
  },
  MILESTONE_COMPLETION: {
    type: ActivityType.MILESTONE_ACHIEVEMENT,
    baseValue: 50,
  },
  CONTRIBUTION_MADE: {
    type: ActivityType.SUCCESSFUL_TRANSACTION,
    baseValue: 30,
    scalable: true, // Scales with contribution amount
  },
  HELPFUL_COMMENT: {
    type: ActivityType.HELPFUL_COMMENT,
    baseValue: 15,
  },
  SOCIAL_INTERACTION: {
    type: ActivityType.SOCIAL_INTERACTION,
    baseValue: 10,
  },
  PEER_RATING_RECEIVED: {
    type: ActivityType.PEER_RATING,
    baseValue: 20,
  },
  COMMUNITY_REVIEW_RECEIVED: {
    type: ActivityType.COMMUNITY_REVIEW,
    baseValue: 25,
  },
};

@Injectable()
export class ActivityLoggingService {
  private readonly logger = new Logger(ActivityLoggingService.name);
  private readonly weights: ActivityWeightConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) {
    this.weights = DEFAULT_ACTIVITY_WEIGHTS;
  }

  /**
   * Log a project completion activity
   */
  async logProjectCompletion(creatorId: string, projectId: string) {
    const config = this.weights.PROJECT_COMPLETION;
    return this.reputationService.recordActivity(
      creatorId,
      config.type,
      config.baseValue,
      projectId,
    );
  }

  /**
   * Log a milestone completion activity
   */
  async logMilestoneCompletion(creatorId: string, milestoneId: string) {
    const config = this.weights.MILESTONE_COMPLETION;
    return this.reputationService.recordActivity(
      creatorId,
      config.type,
      config.baseValue,
      milestoneId,
    );
  }

  /**
   * Log a contribution/investment activity
   */
  async logContribution(investorId: string, amount: number, contributionId: string) {
    const config = this.weights.CONTRIBUTION_MADE;
    const value = config.scalable
      ? config.baseValue + amount / 100 // Scale with amount
      : config.baseValue;

    return this.reputationService.recordActivity(
      investorId,
      config.type,
      value,
      contributionId,
    );
  }

  /**
   * Log a helpful comment activity
   */
  async logHelpfulComment(userId: string, commentId: string) {
    const config = this.weights.HELPFUL_COMMENT;
    return this.reputationService.recordActivity(
      userId,
      config.type,
      config.baseValue,
      commentId,
    );
  }

  /**
   * Log a social interaction activity
   */
  async logSocialInteraction(userId: string, referenceId?: string) {
    const config = this.weights.SOCIAL_INTERACTION;
    return this.reputationService.recordActivity(
      userId,
      config.type,
      config.baseValue,
      referenceId,
    );
  }

  /**
   * Log a peer rating activity
   */
  async logPeerRating(userId: string, rating: number, referenceId?: string) {
    const config = this.weights.PEER_RATING_RECEIVED;
    return this.reputationService.recordActivity(
      userId,
      config.type,
      rating,
      referenceId,
    );
  }

  /**
   * Log a community review activity
   */
  async logCommunityReview(userId: string, reviewValue: number, reviewId: string) {
    const config = this.weights.COMMUNITY_REVIEW_RECEIVED;
    return this.reputationService.recordActivity(
      userId,
      config.type,
      reviewValue,
      reviewId,
    );
  }

  /**
   * Get the current activity weight configuration
   */
  getActivityWeights(): ActivityWeightConfig {
    return this.weights;
  }

  /**
   * Update activity weight configuration (for admin use)
   */
  updateActivityWeight(activityKey: string, newWeight: number) {
    if (this.weights[activityKey]) {
      this.weights[activityKey].baseValue = newWeight;
      this.logger.log(`Updated weight for ${activityKey} to ${newWeight}`);
    } else {
      this.logger.warn(`Attempted to update non-existent activity weight: ${activityKey}`);
    }
  }
}
