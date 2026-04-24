import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { REPUTATION_LEVELS } from '../reputation.constants';

@Injectable()
export class ReputationNotificationService {
  private readonly logger = new Logger(ReputationNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) { }

  /**
   * Triggered when a user's reputation score changes significantly.
   * Sends notification if the change exceeds the user's threshold.
   */
  async notifyReputationChange(
    userId: string,
    previousScore: number,
    newScore: number,
    reason: string,
  ): Promise<void> {
    const scoreChange = Math.abs(newScore - previousScore);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationSettings: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found for reputation change notification`);
      return;
    }

    const settings = user.notificationSettings || {
      notifyReputationChanges: true,
      reputationChangeThreshold: 50,
    };

    if (!settings.notifyReputationChanges) {
      return;
    }

    if (scoreChange < settings.reputationChangeThreshold) {
      return;
    }

    const isPositive = newScore > previousScore;
    const direction = isPositive ? 'increased' : 'decreased';
    const emoji = isPositive ? '📈' : '📉';

    await this.notificationService.notify(
      userId,
      NotificationType.REPUTATION_CHANGE,
      `${emoji} Reputation Score ${direction}!`,
      `Your reputation score has ${direction} by ${scoreChange} points (${previousScore} → ${newScore}). ${isPositive ? 'Keep up the great work!' : 'Review recent activities to understand the change.'}`,
      {
        previousScore,
        newScore,
        scoreChange,
        direction,
        reason,
      },
    );

    this.logger.log(`Sent reputation change notification to user ${userId}: ${direction} by ${scoreChange} points`);
  }

  /**
   * Triggered when a user levels up to a new reputation tier.
   */
  async notifyLevelUp(
    userId: string,
    previousLevel: string,
    newLevel: string,
    score: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationSettings: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found for level up notification`);
      return;
    }

    const settings = user.notificationSettings || {
      notifyLevelUps: true,
    };

    if (!settings.notifyLevelUps) {
      return;
    }

    const levelEmojis: Record<string, string> = {
      DIAMOND: '💎',
      PLATINUM: '🏆',
      GOLD: '🥇',
      SILVER: '🥈',
      BRONZE: '🥉',
    };

    const emoji = levelEmojis[newLevel] || '⭐';

    await this.notificationService.notify(
      userId,
      NotificationType.LEVEL_UP,
      `${emoji} Congratulations! You've reached ${newLevel} level!`,
      `Amazing achievement! Your reputation score of ${score} has earned you the ${newLevel} level. You've officially leveled up from ${previousLevel}!`,
      {
        previousLevel,
        newLevel,
        score,
        levelUpDate: new Date().toISOString(),
      },
    );

    this.logger.log(`Sent level up notification to user ${userId}: ${previousLevel} → ${newLevel}`);
  }

  /**
   * Sends weekly reputation summary emails to users who have opted in.
   * Runs every Sunday at 9 AM.
   */
  @Cron(CronExpression.EVERY_WEEK_ON_SUNDAY_AT_9AM)
  async sendWeeklyReputationSummaries(): Promise<void> {
    this.logger.log('Starting weekly reputation summary generation...');

    const users = await this.prisma.user.findMany({
      where: {
        notificationSettings: {
          notifyWeeklySummary: true,
        },
      },
      include: {
        notificationSettings: true,
        weeklySummaries: {
          orderBy: { weekStartDate: 'desc' },
          take: 1,
        },
      },
    });

    let processedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      try {
        await this.generateWeeklySummaryForUser(user);
        processedCount++;
      } catch (error) {
        this.logger.error(`Failed to generate weekly summary for user ${user.id}: ${error.message}`);
        skippedCount++;
      }
    }

    this.logger.log(`Weekly summary generation completed: ${processedCount} processed, ${skippedCount} skipped`);
  }

  /**
   * Generates and sends a weekly reputation summary for a specific user.
   */
  private async generateWeeklySummaryForUser(user: any): Promise<void> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // Check if summary already exists for this week
    const existingSummary = await this.prisma.weeklyReputationSummary.findUnique({
      where: {
        userId_weekStartDate: {
          userId: user.id,
          weekStartDate: weekStart,
        },
      },
    });

    if (existingSummary) {
      return;
    }

    // Get current reputation
    const currentReputation = await this.prisma.reputationScore.findUnique({
      where: { subjectId: user.id },
    });

    if (!currentReputation) {
      return;
    }

    // Get previous week's score
    const previousWeekStart = new Date(weekStart);
    previousWeekStart.setDate(weekStart.getDate() - 7);

    const previousSummary = user.weeklySummaries[0];
    const previousScore = previousSummary?.currentScore || currentReputation.compositeScore;
    const scoreChange = Math.round(currentReputation.compositeScore - previousScore);

    // Get activities from the past week
    const weekActivities = await this.prisma.reputationActivity.findMany({
      where: {
        subjectId: user.id,
        occurredAt: {
          gte: weekStart,
        },
      },
    });

    // Calculate top activity type
    const activityCounts = weekActivities.reduce((acc, activity) => {
      acc[activity.activityType] = (acc[activity.activityType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topActivityType = Object.entries(activityCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0];

    // Get improvement tips
    const tips = await this.getImprovementTips(user.id, currentReputation);

    // Create weekly summary record
    await this.prisma.weeklyReputationSummary.create({
      data: {
        userId: user.id,
        weekStartDate,
        previousScore,
        currentScore: Math.round(currentReputation.compositeScore),
        scoreChange,
        level: user.reputationLevel,
        activitiesCount: weekActivities.length,
        topActivityType,
        improvementTips: tips,
      },
    });

    // Send notification
    const trendEmoji = scoreChange > 0 ? '📈' : scoreChange < 0 ? '📉' : '➡️';
    const trendText = scoreChange > 0 ? 'improved' : scoreChange < 0 ? 'declined' : 'remained stable';

    await this.notificationService.notify(
      user.id,
      NotificationType.WEEKLY_REPUTATION_SUMMARY,
      `${trendEmoji} Your Weekly Reputation Summary`,
      `Your reputation ${trendText} by ${Math.abs(scoreChange)} points this week. Current score: ${Math.round(currentReputation.compositeScore)} (${user.reputationLevel} level). You had ${weekActivities.length} activities this week.`,
      {
        weekStartDate: weekStart.toISOString(),
        previousScore,
        currentScore: Math.round(currentReputation.compositeScore),
        scoreChange,
        level: user.reputationLevel,
        activitiesCount: weekActivities.length,
        topActivityType,
        improvementTips: tips,
      },
    );
  }

  /**
   * Gets personalized improvement tips for a user based on their reputation profile.
   */
  async getImprovementTips(userId: string, reputation: any): Promise<any[]> {
    const allTips = await this.prisma.reputationTip.findMany({
      where: { isActive: true },
      orderBy: [{ impact: 'desc' }, { difficulty: 'asc' }],
      take: 5,
    });

    // Filter tips based on user's current profile
    const personalizedTips = allTips.filter(tip => {
      // If user has low success rate, suggest reliability tips
      if (reputation.reliabilityScore < 50 && tip.category === 'reliability') {
        return true;
      }

      // If user has low community score, suggest community tips
      if (reputation.communityScore < 50 && tip.category === 'community') {
        return true;
      }

      // If user has few activities, suggest general activity tips
      if (reputation.activityCount < 10 && tip.category === 'general') {
        return true;
      }

      // Include high-impact tips for everyone
      return tip.impact === 'HIGH';
    });

    return personalizedTips.slice(0, 3).map(tip => ({
      title: tip.title,
      description: tip.description,
      impact: tip.impact,
      difficulty: tip.difficulty,
    }));
  }

  /**
   * Creates initial reputation tips for the system.
   * This can be called during setup or migrations.
   */
  async createDefaultReputationTips(): Promise<void> {
    const defaultTips = [
      {
        category: 'transactions',
        title: 'Complete Successful Transactions',
        description: 'Successfully completing transactions on time significantly boosts your reliability score.',
        impact: 'HIGH',
        difficulty: 'MEDIUM',
      },
      {
        category: 'community',
        title: 'Provide Helpful Reviews',
        description: 'Leave thoughtful reviews and comments on projects to increase your community feedback score.',
        impact: 'MEDIUM',
        difficulty: 'EASY',
      },
      {
        category: 'projects',
        title: 'Complete Project Milestones',
        description: 'Meeting project milestones on schedule demonstrates reliability and expertise.',
        impact: 'HIGH',
        difficulty: 'HARD',
      },
      {
        category: 'social',
        title: 'Engage with the Community',
        description: 'Participate in discussions and help other users to build your social reputation.',
        impact: 'MEDIUM',
        difficulty: 'EASY',
      },
      {
        category: 'expertise',
        title: 'Get Expert Endorsements',
        description: 'Receive endorsements from verified experts in your field to boost your expertise score.',
        impact: 'HIGH',
        difficulty: 'MEDIUM',
      },
      {
        category: 'reliability',
        title: 'Maintain Consistent Activity',
        description: 'Regular engagement prevents reputation decay and shows long-term commitment.',
        impact: 'MEDIUM',
        difficulty: 'EASY',
      },
    ];

    for (const tip of defaultTips) {
      await this.prisma.reputationTip.upsert({
        where: {
          id: `tip-${tip.category.toLowerCase().replace(/\s+/g, '-')}`
        },
        update: tip,
        create: {
          id: `tip-${tip.category.toLowerCase().replace(/\s+/g, '-')}`,
          ...tip,
        },
      });
    }

    this.logger.log('Created default reputation tips');
  }

  /**
   * Monitors reputation changes and triggers appropriate notifications.
   * This should be called after any reputation score update.
   */
  async monitorReputationChange(
    userId: string,
    previousScore: number,
    newScore: number,
    reason: string,
  ): Promise<void> {
    // Check for level up
    const previousLevel = this.getLevelForScore(previousScore);
    const newLevel = this.getLevelForScore(newScore);

    if (previousLevel !== newLevel) {
      await this.notifyLevelUp(userId, previousLevel, newLevel, newScore);
    }

    // Check for significant score change
    await this.notifyReputationChange(userId, previousScore, newScore, reason);
  }

  /**
   * Determines the reputation level for a given score.
   */
  private getLevelForScore(score: number): string {
    for (const level of REPUTATION_LEVELS) {
      if (score >= level.minScore) {
        return level.level;
      }
    }
    return 'BRONZE';
  }
}
