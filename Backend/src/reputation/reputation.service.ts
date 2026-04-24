import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { calculateTrustScore } from './calculators/trust-score.calculator';
import { calculateReputationScore } from './calculators/score.calculator';
import { ActivityType, DECAY_EXEMPTION_THRESHOLD, DECAY_SCHEDULE } from './reputation.constants';
import { ReputationNotificationService } from './services/reputation-notification.service';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: ReputationNotificationService,
  ) { }

  /**
   * Daily task to apply time-decay to all users.
   * Older activities become less valuable over time, so scores must be
   * periodically refreshed even without new activity.
   * 
   * High performers (score >= DECAY_EXEMPTION_THRESHOLD) are exempt from decay.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyRecalculation() {
    this.logger.log('Starting daily reputation recalculation with decay...');
    const users = await this.prisma.user.findMany({
      select: { id: true, reputationScore: true },
    });

    let processedCount = 0;
    let exemptedCount = 0;

    for (const user of users) {
      try {
        // Check for decay exemption
        if (user.reputationScore >= DECAY_EXEMPTION_THRESHOLD) {
          this.logger.log(`User ${user.id} exempt from decay (score: ${user.reputationScore})`);
          await this.prisma.reputationDecayHistory.create({
            data: {
              userId: user.id,
              previousScore: user.reputationScore,
              newScore: user.reputationScore,
              scoreChange: 0,
              decayFactor: 1.0,
              activitiesCount: 0,
              exempted: true,
              reason: `High performer exemption (score >= ${DECAY_EXEMPTION_THRESHOLD})`,
            },
          });
          exemptedCount++;
          continue;
        }

        await this.updateReputationScore(user.id);
        processedCount++;
      } catch (e) {
        this.logger.error(`Failed to recalculate score for user ${user.id}: ${e.message}`);
      }
    }
    this.logger.log(`Finished daily recalculation: ${processedCount} processed, ${exemptedCount} exempted out of ${users.length} users.`);
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

    // Get previous score for notification tracking
    const previousScore = await this.prisma.reputationScore.findUnique({
      where: { subjectId: userId },
    });

    const previousCompositeScore = previousScore?.compositeScore ?? 0;
    const breakdown = calculateReputationScore(activities);

    // Update user's aggregate score and level in the main users table
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        reputationScore: Math.round(breakdown.compositeScore),
        reputationLevel: breakdown.level,
      },
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
        reliabilityScore: breakdown.reliabilityScore,
        expertiseScore: breakdown.expertiseScore,
        communityScore: breakdown.communityScore,
        activityCount: breakdown.activityCount,
        lowConfidence: breakdown.lowConfidence,
      },
      update: {
        compositeScore: breakdown.compositeScore,
        successRateScore: breakdown.successRateScore,
        peerRatingScore: breakdown.peerRatingScore,
        contributionSizeScore: breakdown.contributionSizeScore,
        communityFeedbackScore: breakdown.communityFeedbackScore,
        reliabilityScore: breakdown.reliabilityScore,
        expertiseScore: breakdown.expertiseScore,
        communityScore: breakdown.communityScore,
        activityCount: breakdown.activityCount,
        lowConfidence: breakdown.lowConfidence,
      },
    });

    // Trigger notifications for significant changes
    await this.notificationService.monitorReputationChange(
      userId,
      Math.round(previousCompositeScore),
      Math.round(breakdown.compositeScore),
      'SCORE_RECALCULATION',
    );

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

  /**
   * Retrieves the decay history for a user to show transparency.
   */
  async getDecayHistory(userId: string) {
    return this.prisma.reputationDecayHistory.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take: 50, // Last 50 decay events
    });
  }
}
