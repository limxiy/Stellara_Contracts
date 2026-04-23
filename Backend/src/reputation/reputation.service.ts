import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { calculateTrustScore } from './calculators/trust-score.calculator';
import { calculateReputationScore } from './calculators/score.calculator';
import { ActivityType } from '@prisma/client';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily task to apply time-decay to all users.
   * Older activities become less valuable over time, so scores must be
   * periodically refreshed even without new activity.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyRecalculation() {
    this.logger.log('Starting daily reputation recalculation...');
    const users = await this.prisma.user.findMany({ select: { id: true } });
    
    for (const user of users) {
      try {
        await this.updateReputationScore(user.id);
      } catch (e) {
        this.logger.error(`Failed to recalculate score for user ${user.id}: ${e.message}`);
      }
    }
    this.logger.log(`Finished daily recalculation for ${users.length} users.`);
  }

  /**
   * Updates the user's trust score based on project and milestone outcomes.
   * This is a simpler, rule-based score for creators.
   */
  async updateTrustScore(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    });

    const previousScore = user?.trustScore ?? 0;
    const score = await calculateTrustScore(this.prisma, userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: { trustScore: score },
    });

    await this.prisma.reputationHistory.create({
      data: {
        userId,
        scoreChange: score - previousScore,
        reason: 'TRUST_SCORE_RECALCULATION',
      },
    });

    return score;
  }

  /**
   * Records a new reputation-relevant activity and triggers a score recalculation.
   */
  async recordActivity(
    subjectId: string,
    activityType: ActivityType,
    value: number,
    referenceId?: string,
    actorId?: string,
  ) {
    this.logger.log(`Recording ${activityType} for user ${subjectId} with value ${value}`);
    
    const activity = await this.prisma.reputationActivity.create({
      data: {
        subjectId,
        actorId,
        activityType,
        value,
        referenceId,
        occurredAt: new Date(),
      },
    });

    // Recalculate composite score after new activity
    await this.updateReputationScore(subjectId);
    
    return activity;
  }

  /**
   * Recalculates the full multi-factor reputation score for a user.
   */
  async updateReputationScore(userId: string) {
    const activities = await this.prisma.reputationActivity.findMany({
      where: { subjectId: userId },
    });

    const breakdown = calculateReputationScore(activities);

    // Update user's aggregate score in the main users table
    await this.prisma.user.update({
      where: { id: userId },
      data: { reputationScore: Math.round(breakdown.compositeScore) },
    });

    // Cache the detailed breakdown for API consumption
    await this.prisma.reputationScore.upsert({
      where: { subjectId: userId },
      create: {
        subjectId: userId,
        compositeScore: breakdown.compositeScore,
        successRateScore: breakdown.successRateScore,
        peerRatingScore: breakdown.peerRatingScore,
        contributionSizeScore: breakdown.contributionSizeScore,
        communityFeedbackScore: breakdown.communityFeedbackScore,
        activityCount: breakdown.activityCount,
        lowConfidence: breakdown.lowConfidence,
      },
      update: {
        compositeScore: breakdown.compositeScore,
        successRateScore: breakdown.successRateScore,
        peerRatingScore: breakdown.peerRatingScore,
        contributionSizeScore: breakdown.contributionSizeScore,
        communityFeedbackScore: breakdown.communityFeedbackScore,
        activityCount: breakdown.activityCount,
        lowConfidence: breakdown.lowConfidence,
      },
    });

    return breakdown;
  }

  /**
   * Retrieves the current reputation score and factor breakdown for a user.
   */
  async getReputation(userId: string) {
    let score = await this.prisma.reputationScore.findUnique({
      where: { subjectId: userId },
    });

    if (!score) {
      // If no cached score exists, attempt to generate it
      await this.updateReputationScore(userId);
      score = await this.prisma.reputationScore.findUnique({
        where: { subjectId: userId },
      });
    }

    return score;
  }

  /**
   * Retrieves the history of manual or automated score adjustments.
   */
  async getReputationHistory(userId: string) {
    return this.prisma.reputationHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }
}
