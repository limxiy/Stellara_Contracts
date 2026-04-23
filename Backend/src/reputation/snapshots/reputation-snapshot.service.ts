import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import { ReputationService } from '../reputation.service';
import {
  SnapshotPeriod,
  TrendType,
  TrendPeriod,
  TrendDirection,
  ReputationSnapshot,
  ReputationUserSnapshot,
  ReputationTrend
} from '@prisma/client';

@Injectable()
export class ReputationSnapshotService {
  private readonly logger = new Logger(ReputationSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) { }

  /**
   * Create daily snapshot at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async createDailySnapshot() {
    this.logger.log('Creating daily reputation snapshot');
    await this.createSnapshot(SnapshotPeriod.DAILY);
  }

  /**
   * Create weekly snapshot on Sunday at 1 AM
   */
  @Cron('0 1 * * 0') // Every Sunday at 1 AM
  async createWeeklySnapshot() {
    this.logger.log('Creating weekly reputation snapshot');
    await this.createSnapshot(SnapshotPeriod.WEEKLY);
  }

  /**
   * Create monthly snapshot on the 1st at 2 AM
   */
  @Cron('0 2 1 * *') // 1st of every month at 2 AM
  async createMonthlySnapshot() {
    this.logger.log('Creating monthly reputation snapshot');
    await this.createSnapshot(SnapshotPeriod.MONTHLY);
  }

  /**
   * Create quarterly snapshot on the 1st of Jan, Apr, Jul, Oct at 3 AM
   */
  @Cron('0 3 1 1,4,7,10 *') // Quarterly at 3 AM
  async createQuarterlySnapshot() {
    this.logger.log('Creating quarterly reputation snapshot');
    await this.createSnapshot(SnapshotPeriod.QUARTERLY);
  }

  /**
   * Create yearly snapshot on January 1st at 4 AM
   */
  @Cron('0 4 1 1 *') // January 1st at 4 AM
  async createYearlySnapshot() {
    this.logger.log('Creating yearly reputation snapshot');
    await this.createSnapshot(SnapshotPeriod.YEARLY);
  }

  /**
   * Create a reputation snapshot for a specific period
   */
  async createSnapshot(period: SnapshotPeriod, customDate?: Date): Promise<ReputationSnapshot> {
    const now = customDate || new Date();
    const { periodStart, periodEnd } = this.getPeriodDates(period, now);

    this.logger.log(`Creating ${period} snapshot from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Check if snapshot already exists for this period
    const existingSnapshot = await this.prisma.reputationSnapshot.findFirst({
      where: {
        period,
        periodStart,
      },
    });

    if (existingSnapshot) {
      this.logger.log(`Snapshot already exists for ${period} period starting ${periodStart.toISOString()}`);
      return existingSnapshot;
    }

    // Get all users with their reputation data
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        reputationScore: true,
        trustScore: true,
        reputationLevel: true,
        createdAt: true,
      },
    });

    // Get detailed reputation scores for active users
    const detailedScores = await this.prisma.reputationScore.findMany({
      where: {
        subjectId: {
          in: users.map(u => u.id),
        },
      },
    });

    // Get activity counts for the period
    const activitiesInPeriod = await this.prisma.reputationActivity.findMany({
      where: {
        occurredAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    // Get decay history for the period
    const decayHistory = await this.prisma.reputationDecayHistory.findMany({
      where: {
        occurredAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    // Calculate snapshot metrics
    const metrics = this.calculateSnapshotMetrics(users, detailedScores, activitiesInPeriod, decayHistory, periodStart, periodEnd);

    // Create the main snapshot
    const snapshot = await this.prisma.reputationSnapshot.create({
      data: {
        period,
        periodStart,
        periodEnd,
        totalUsers: metrics.totalUsers,
        activeUsers: metrics.activeUsers,
        averageScore: metrics.averageScore,
        medianScore: metrics.medianScore,
        highestScore: metrics.highestScore,
        lowestScore: metrics.lowestScore,
        scoreDistribution: metrics.scoreDistribution,
        levelDistribution: metrics.levelDistribution,
        totalActivities: metrics.totalActivities,
        newUsers: metrics.newUsers,
        decayedUsers: metrics.decayedUsers,
        decayedAmount: metrics.decayedAmount,
        metadata: metrics.metadata,
      },
    });

    // Create user snapshots
    await this.createUserSnapshots(snapshot.id, users, detailedScores, activitiesInPeriod, periodStart, periodEnd);

    // Calculate trends for users
    await this.calculateUserTrends(users, period);

    this.logger.log(`Successfully created ${period} snapshot with ${metrics.totalUsers} users`);
    return snapshot;
  }

  /**
   * Get period start and end dates
   */
  private getPeriodDates(period: SnapshotPeriod, date: Date): { periodStart: Date; periodEnd: Date } {
    const now = new Date(date);
    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
      case SnapshotPeriod.DAILY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        break;
      case SnapshotPeriod.WEEKLY:
        const dayOfWeek = now.getDay();
        periodStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        break;
      case SnapshotPeriod.MONTHLY:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1);
        break;
      case SnapshotPeriod.QUARTERLY:
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 1, 0, 0, 0, -1);
        break;
      case SnapshotPeriod.YEARLY:
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        throw new Error(`Unsupported period: ${period}`);
    }

    return { periodStart, periodEnd };
  }

  /**
   * Calculate snapshot metrics
   */
  private calculateSnapshotMetrics(
    users: any[],
    detailedScores: any[],
    activities: any[],
    decayHistory: any[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const scores = users.map(u => u.reputationScore).filter(s => s > 0);
    const activeUsers = new Set(activities.map(a => a.subjectId)).size;

    // Calculate basic statistics
    const totalUsers = users.length;
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const sortedScores = scores.sort((a, b) => a - b);
    const medianScore = sortedScores.length > 0
      ? sortedScores[Math.floor(sortedScores.length / 2)]
      : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;

    // Calculate score distribution
    const scoreRanges = {
      '0-100': 0,
      '101-200': 0,
      '201-300': 0,
      '301-400': 0,
      '401-500': 0,
      '501-600': 0,
      '601-700': 0,
      '701-800': 0,
      '801-900': 0,
      '901-1000': 0,
    };

    scores.forEach(score => {
      if (score <= 100) scoreRanges['0-100']++;
      else if (score <= 200) scoreRanges['101-200']++;
      else if (score <= 300) scoreRanges['201-300']++;
      else if (score <= 400) scoreRanges['301-400']++;
      else if (score <= 500) scoreRanges['401-500']++;
      else if (score <= 600) scoreRanges['501-600']++;
      else if (score <= 700) scoreRanges['601-700']++;
      else if (score <= 800) scoreRanges['701-800']++;
      else if (score <= 900) scoreRanges['801-900']++;
      else scoreRanges['901-1000']++;
    });

    // Calculate level distribution
    const levelDistribution = users.reduce((acc, user) => {
      acc[user.reputationLevel] = (acc[user.reputationLevel] || 0) + 1;
      return acc;
    }, {});

    // Calculate other metrics
    const totalActivities = activities.length;
    const newUsers = users.filter(u => u.createdAt >= periodStart && u.createdAt <= periodEnd).length;
    const decayedUsers = new Set(decayHistory.map(d => d.userId)).size;
    const decayedAmount = decayHistory.reduce((sum, d) => sum + Math.abs(d.scoreChange), 0);

    return {
      totalUsers,
      activeUsers,
      averageScore: Math.round(averageScore * 100) / 100,
      medianScore,
      highestScore,
      lowestScore,
      scoreDistribution: scoreRanges,
      levelDistribution,
      totalActivities,
      newUsers,
      decayedUsers,
      decayedAmount: Math.round(decayedAmount * 100) / 100,
      metadata: {
        generatedAt: new Date().toISOString(),
        snapshotVersion: '1.0',
      },
    };
  }

  /**
   * Create user snapshots
   */
  private async createUserSnapshots(
    snapshotId: string,
    users: any[],
    detailedScores: any[],
    activities: any[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const scoreMap = new Map(detailedScores.map(s => [s.subjectId, s]));
    const activityMap = new Map();

    // Count activities per user in the period
    activities.forEach(activity => {
      const count = activityMap.get(activity.subjectId) || 0;
      activityMap.set(activity.subjectId, count + 1);
    });

    // Calculate rankings
    const sortedUsers = users
      .map(u => ({ ...u, score: u.reputationScore }))
      .sort((a, b) => b.score - a.score);

    const userSnapshots = users.map((user, index) => {
      const detailedScore = scoreMap.get(user.id);
      const rank = sortedUsers.findIndex(u => u.id === user.id) + 1;
      const percentile = (index / users.length) * 100;

      return {
        snapshotId,
        userId: user.id,
        reputationScore: user.reputationScore,
        trustScore: user.trustScore,
        reputationLevel: user.reputationLevel,
        activityCount: activityMap.get(user.id) || 0,
        successRate: detailedScore?.successRateScore || 0,
        reliabilityScore: detailedScore?.reliabilityScore || 0,
        communityScore: detailedScore?.communityScore || 0,
        expertiseScore: detailedScore?.expertiseScore || 0,
        contributionSize: detailedScore?.contributionSizeScore || 0,
        peerRatingScore: detailedScore?.peerRatingScore || 0,
        communityFeedbackScore: detailedScore?.communityFeedbackScore || 0,
        compositeScore: detailedScore?.compositeScore || 0,
        rank,
        percentile: Math.round(percentile * 100) / 100,
      };
    });

    // Batch insert user snapshots
    await this.prisma.reputationUserSnapshot.createMany({
      data: userSnapshots,
    });

    this.logger.log(`Created ${userSnapshots.length} user snapshots`);
  }

  /**
   * Calculate user trends
   */
  private async calculateUserTrends(users: any[], period: SnapshotPeriod) {
    const trendPeriod = this.mapSnapshotToTrendPeriod(period);

    for (const user of users) {
      try {
        await this.calculateUserScoreTrend(user.id, trendPeriod);
      } catch (error) {
        this.logger.error(`Failed to calculate trend for user ${user.id}: ${error.message}`);
      }
    }
  }

  /**
   * Calculate individual user score trend
   */
  private async calculateUserScoreTrend(userId: string, period: TrendPeriod) {
    const { startDate, endDate } = this.getTrendPeriodDates(period);

    // Get user snapshots for the period
    const snapshots = await this.prisma.reputationUserSnapshot.findMany({
      where: {
        userId,
        snapshot: {
          periodStart: {
            gte: startDate,
          },
          periodEnd: {
            lte: endDate,
          },
        },
      },
      include: {
        snapshot: {
          select: {
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        snapshot: {
          periodStart: 'asc',
        },
      },
    });

    if (snapshots.length < 2) {
      return; // Not enough data for trend calculation
    }

    const startScore = snapshots[0].reputationScore;
    const endScore = snapshots[snapshots.length - 1].reputationScore;
    const scoreChange = endScore - startScore;
    const percentChange = startScore > 0 ? (scoreChange / startScore) * 100 : 0;

    // Calculate daily changes for volatility
    const dailyChanges = [];
    for (let i = 1; i < snapshots.length; i++) {
      dailyChanges.push(snapshots[i].reputationScore - snapshots[i - 1].reputationScore);
    }

    const averageDailyChange = dailyChanges.reduce((sum, change) => sum + change, 0) / dailyChanges.length;
    const volatility = this.calculateStandardDeviation(dailyChanges);

    // Determine trend direction
    const trendDirection = this.determineTrendDirection(percentChange, volatility);

    // Calculate momentum (acceleration of change)
    const momentum = dailyChanges.length >= 2
      ? dailyChanges[dailyChanges.length - 1] - dailyChanges[dailyChanges.length - 2]
      : 0;

    // Predict next score (simple linear regression)
    const predictionScore = endScore + averageDailyChange;
    const confidence = Math.max(0, Math.min(1, 1 - (volatility / Math.abs(endScore))));

    await this.prisma.reputationTrend.upsert({
      where: {
        userId_trendType_period_startDate: {
          userId,
          trendType: TrendType.SCORE_TREND,
          period,
          startDate,
        },
      },
      update: {
        endDate,
        endScore,
        scoreChange,
        percentChange: Math.round(percentChange * 100) / 100,
        averageDailyChange: Math.round(averageDailyChange * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        trendDirection,
        momentum: Math.round(momentum * 100) / 100,
        predictionScore: Math.round(predictionScore),
        confidence: Math.round(confidence * 1000) / 1000,
      },
      create: {
        userId,
        trendType: TrendType.SCORE_TREND,
        period,
        startDate,
        endDate,
        startScore,
        endScore,
        scoreChange,
        percentChange: Math.round(percentChange * 100) / 100,
        averageDailyChange: Math.round(averageDailyChange * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        trendDirection,
        momentum: Math.round(momentum * 100) / 100,
        predictionScore: Math.round(predictionScore),
        confidence: Math.round(confidence * 1000) / 1000,
      },
    });
  }

  /**
   * Map snapshot period to trend period
   */
  private mapSnapshotToTrendPeriod(snapshotPeriod: SnapshotPeriod): TrendPeriod {
    switch (snapshotPeriod) {
      case SnapshotPeriod.DAILY:
        return TrendPeriod.DAILY;
      case SnapshotPeriod.WEEKLY:
        return TrendPeriod.WEEKLY;
      case SnapshotPeriod.MONTHLY:
        return TrendPeriod.MONTHLY;
      case SnapshotPeriod.QUARTERLY:
        return TrendPeriod.QUARTERLY;
      case SnapshotPeriod.YEARLY:
        return TrendPeriod.YEARLY;
      default:
        return TrendPeriod.MONTHLY;
    }
  }

  /**
   * Get trend period dates
   */
  private getTrendPeriodDates(period: TrendPeriod): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case TrendPeriod.DAILY:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
        break;
      case TrendPeriod.WEEKLY:
        startDate = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000); // Last 4 weeks
        break;
      case TrendPeriod.MONTHLY:
        startDate = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000); // Last 6 months
        break;
      case TrendPeriod.QUARTERLY:
        startDate = new Date(now.getTime() - 2 * 90 * 24 * 60 * 60 * 1000); // Last 2 quarters
        break;
      case TrendPeriod.YEARLY:
        startDate = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000); // Last 3 years
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    endDate = now;
    return { startDate, endDate };
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Determine trend direction
   */
  private determineTrendDirection(percentChange: number, volatility: number): TrendDirection {
    const threshold = Math.max(5, volatility * 2); // Minimum 5% or 2x volatility

    if (percentChange < -threshold) {
      return percentChange < -threshold * 2 ? TrendDirection.STRONGLY_DECLINING : TrendDirection.DECLINING;
    } else if (percentChange > threshold) {
      return percentChange > threshold * 2 ? TrendDirection.STRONGLY_INCREASING : TrendDirection.INCREASING;
    } else {
      return TrendDirection.STABLE;
    }
  }

  /**
   * Get available snapshots
   */
  async getSnapshots(period?: SnapshotPeriod, limit = 50) {
    const where = period ? { period } : {};

    return this.prisma.reputationSnapshot.findMany({
      where,
      orderBy: {
        periodStart: 'desc',
      },
      take: limit,
      include: {
        userSnapshots: {
          take: 10, // Limit for performance
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                profileData: true,
              },
            },
          },
          orderBy: {
            reputationScore: 'desc',
          },
        },
      },
    });
  }

  /**
   * Get user snapshot history
   */
  async getUserSnapshotHistory(userId: string, period?: SnapshotPeriod) {
    const where: any = { userId };
    if (period) {
      where.snapshot = { period };
    }

    return this.prisma.reputationUserSnapshot.findMany({
      where,
      include: {
        snapshot: {
          select: {
            period: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        snapshot: {
          periodStart: 'desc',
        },
      },
    });
  }

  /**
   * Get user trends
   */
  async getUserTrends(userId: string, trendType?: TrendType, period?: TrendPeriod) {
    const where: any = { userId };
    if (trendType) where.trendType = trendType;
    if (period) where.period = period;

    return this.prisma.reputationTrend.findMany({
      where,
      orderBy: {
        startDate: 'desc',
      },
    });
  }

  /**
   * Get specific snapshot by ID
   */
  async getSnapshotById(snapshotId: string) {
    return this.prisma.reputationSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        userSnapshots: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                profileData: true,
              },
            },
          },
          orderBy: {
            reputationScore: 'desc',
          },
          take: 100, // Limit for performance
        },
      },
    });
  }

  /**
   * Get users in a snapshot with filtering and pagination
   */
  async getSnapshotUsers(
    snapshotId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: 'reputationScore' | 'rank' | 'percentile';
      sortOrder?: 'asc' | 'desc';
      minScore?: number;
      maxScore?: number;
    } = {},
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'reputationScore',
      sortOrder = 'desc',
      minScore,
      maxScore,
    } = options;

    const where: any = { snapshotId };

    if (minScore !== undefined || maxScore !== undefined) {
      where.reputationScore = {};
      if (minScore !== undefined) where.reputationScore.gte = minScore;
      if (maxScore !== undefined) where.reputationScore.lte = maxScore;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.reputationUserSnapshot.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              walletAddress: true,
              profileData: true,
            },
          },
        },
        orderBy: this.buildUserOrderBy(sortBy, sortOrder),
        skip,
        take: limit,
      }),
      this.prisma.reputationUserSnapshot.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get specific user in snapshot
   */
  async getSnapshotUser(snapshotId: string, userId: string) {
    return this.prisma.reputationUserSnapshot.findUnique({
      where: {
        snapshotId_userId: {
          snapshotId,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            profileData: true,
          },
        },
        snapshot: {
          select: {
            period: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
    });
  }

  /**
   * Get analytics overview
   */
  async getAnalyticsOverview(period?: SnapshotPeriod) {
    const latestSnapshot = await this.getLatestSnapshot(period);

    if (!latestSnapshot) {
      return { message: 'No snapshots available' };
    }

    const previousSnapshot = await this.getPreviousSnapshot(latestSnapshot);

    return {
      current: latestSnapshot,
      previous: previousSnapshot,
      comparison: previousSnapshot ? this.calculateQuickComparison(previousSnapshot, latestSnapshot) : null,
    };
  }

  /**
   * Get score distribution
   */
  async getScoreDistribution(snapshotId?: string) {
    const snapshot = snapshotId
      ? await this.getSnapshotById(snapshotId)
      : await this.getLatestSnapshot();

    if (!snapshot) {
      return { message: 'No snapshots available' };
    }

    return {
      snapshotId: snapshot.id,
      period: snapshot.period,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      distribution: snapshot.scoreDistribution,
    };
  }

  /**
   * Get level distribution
   */
  async getLevelDistribution(snapshotId?: string) {
    const snapshot = snapshotId
      ? await this.getSnapshotById(snapshotId)
      : await this.getLatestSnapshot();

    if (!snapshot) {
      return { message: 'No snapshots available' };
    }

    return {
      snapshotId: snapshot.id,
      period: snapshot.period,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      distribution: snapshot.levelDistribution,
    };
  }

  /**
   * Get growth metrics
   */
  async getGrowthMetrics(period?: SnapshotPeriod, limit = 12) {
    const snapshots = await this.getSnapshots(period, limit);

    return snapshots.map(snapshot => ({
      id: snapshot.id,
      period: snapshot.period,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      totalUsers: snapshot.totalUsers,
      activeUsers: snapshot.activeUsers,
      newUsers: snapshot.newUsers,
      averageScore: snapshot.averageScore,
      totalActivities: snapshot.totalActivities,
    }));
  }

  /**
   * Get historical leaderboard
   */
  async getHistoricalLeaderboard(snapshotId?: string, limit = 100) {
    const snapshot = snapshotId
      ? await this.getSnapshotById(snapshotId)
      : await this.getLatestSnapshot();

    if (!snapshot) {
      return { message: 'No snapshots available' };
    }

    const topUsers = await this.prisma.reputationUserSnapshot.findMany({
      where: { snapshotId: snapshot.id },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            profileData: true,
          },
        },
      },
      orderBy: {
        reputationScore: 'desc',
      },
      take: limit,
    });

    return {
      snapshot: {
        id: snapshot.id,
        period: snapshot.period,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
      },
      leaderboard: topUsers.map((user, index) => ({
        rank: index + 1,
        ...user,
      })),
    };
  }

  /**
   * Get movers and shakers between two snapshots
   */
  async getMoversAndShakers(snapshotId1: string, snapshotId2: string, limit = 50) {
    const [snapshot1, snapshot2] = await Promise.all([
      this.getSnapshotById(snapshotId1),
      this.getSnapshotById(snapshotId2),
    ]);

    if (!snapshot1 || !snapshot2) {
      throw new Error('One or both snapshots not found');
    }

    // Get comparison data
    const comparison = await this.prisma.snapshotComparison.findFirst({
      where: {
        OR: [
          { snapshotId1, snapshotId2 },
          { snapshotId1: snapshotId2, snapshotId2: snapshotId1 },
        ],
      },
    });

    if (comparison) {
      return comparison.metrics.rankingChanges;
    }

    // Create comparison if it doesn't exist
    const newComparison = await this.prisma.snapshotComparison.create({
      data: {
        snapshotId1,
        snapshotId2,
        comparisonType: ComparisonType.CUSTOM,
        metrics: { rankingChanges: [] }, // Will be populated by comparison service
        similarityScore: 0,
      },
    });

    return { message: 'Comparison being created', comparisonId: newComparison.id };
  }

  /**
   * Get predictions
   */
  async getPredictions(userId?: string, period?: TrendPeriod) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (period) where.period = period;

    const trends = await this.prisma.reputationTrend.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            profileData: true,
          },
        },
      },
      orderBy: {
        confidence: 'desc',
      },
      take: userId ? 1 : 50,
    });

    return trends.map(trend => ({
      userId: trend.userId,
      user: trend.user,
      currentScore: trend.endScore,
      predictedScore: trend.predictionScore,
      confidence: trend.confidence,
      trendDirection: trend.trendDirection,
      momentum: trend.momentum,
      period: trend.period,
    }));
  }

  /**
   * Export snapshot data
   */
  async exportSnapshot(snapshotId: string, format: 'json' | 'csv' = 'json', includeUsers = false) {
    const snapshot = await this.getSnapshotById(snapshotId);

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    const exportData = {
      snapshot: {
        id: snapshot.id,
        period: snapshot.period,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        totalUsers: snapshot.totalUsers,
        activeUsers: snapshot.activeUsers,
        averageScore: snapshot.averageScore,
        medianScore: snapshot.medianScore,
        highestScore: snapshot.highestScore,
        lowestScore: snapshot.lowestScore,
        scoreDistribution: snapshot.scoreDistribution,
        levelDistribution: snapshot.levelDistribution,
        totalActivities: snapshot.totalActivities,
        newUsers: snapshot.newUsers,
        decayedUsers: snapshot.decayedUsers,
        decayedAmount: snapshot.decayedAmount,
        createdAt: snapshot.createdAt,
      },
    };

    if (includeUsers && snapshot.userSnapshots) {
      exportData.users = snapshot.userSnapshots.map(userSnapshot => ({
        userId: userSnapshot.userId,
        reputationScore: userSnapshot.reputationScore,
        trustScore: userSnapshot.trustScore,
        reputationLevel: userSnapshot.reputationLevel,
        activityCount: userSnapshot.activityCount,
        rank: userSnapshot.rank,
        percentile: userSnapshot.percentile,
      }));
    }

    if (format === 'csv') {
      // Convert to CSV format (simplified)
      return this.convertToCSV(exportData);
    }

    return exportData;
  }

  /**
   * Get dashboard summary
   */
  async getDashboardSummary() {
    const latestDaily = await this.getLatestSnapshot(SnapshotPeriod.DAILY);
    const latestWeekly = await this.getLatestSnapshot(SnapshotPeriod.WEEKLY);
    const latestMonthly = await this.getLatestSnapshot(SnapshotPeriod.MONTHLY);

    return {
      daily: latestDaily,
      weekly: latestWeekly,
      monthly: latestMonthly,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get dashboard trends
   */
  async getDashboardTrends(period?: TrendPeriod) {
    const trendPeriod = period || TrendPeriod.MONTHLY;

    // Get overall platform trends
    const overallTrends = await this.prisma.reputationTrend.findMany({
      where: {
        period: trendPeriod,
        trendType: TrendType.SCORE_TREND,
      },
      orderBy: {
        startDate: 'desc',
      },
      take: 10,
    });

    return {
      period: trendPeriod,
      trends: overallTrends,
      summary: this.summarizeTrends(overallTrends),
    };
  }

  /**
   * Get dashboard comparisons
   */
  async getDashboardComparisons() {
    const recentComparisons = await this.prisma.snapshotComparison.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      include: {
        snapshot1: {
          select: {
            id: true,
            period: true,
            periodStart: true,
          },
        },
        snapshot2: {
          select: {
            id: true,
            period: true,
            periodStart: true,
          },
        },
      },
    });

    return recentComparisons;
  }

  // Helper methods

  private buildUserOrderBy(sortBy: string, sortOrder: 'asc' | 'desc'): any[] {
    const order: any = {};
    order[sortBy] = sortOrder;
    return [order];
  }

  private async getLatestSnapshot(period?: SnapshotPeriod) {
    const where = period ? { period } : {};

    return this.prisma.reputationSnapshot.findFirst({
      where,
      orderBy: {
        periodStart: 'desc',
      },
    });
  }

  private async getPreviousSnapshot(currentSnapshot: any) {
    return this.prisma.reputationSnapshot.findFirst({
      where: {
        period: currentSnapshot.period,
        periodStart: {
          lt: currentSnapshot.periodStart,
        },
      },
      orderBy: {
        periodStart: 'desc',
      },
    });
  }

  private calculateQuickComparison(previous: any, current: any) {
    return {
      userGrowth: {
        change: current.totalUsers - previous.totalUsers,
        percentChange: this.calculatePercentChange(previous.totalUsers, current.totalUsers),
      },
      scoreChange: {
        change: current.averageScore - previous.averageScore,
        percentChange: this.calculatePercentChange(previous.averageScore, current.averageScore),
      },
      activityGrowth: {
        change: current.totalActivities - previous.totalActivities,
        percentChange: this.calculatePercentChange(previous.totalActivities, current.totalActivities),
      },
    };
  }

  private calculatePercentChange(value1: number, value2: number): number {
    if (value1 === 0) return value2 > 0 ? 100 : 0;
    return Math.round(((value2 - value1) / value1) * 10000) / 100;
  }

  private convertToCSV(data: any): string {
    // Simplified CSV conversion - in production, use a proper CSV library
    const headers = ['Period', 'Total Users', 'Active Users', 'Average Score', 'Total Activities'];
    const row = [
      data.snapshot.period,
      data.snapshot.totalUsers,
      data.snapshot.activeUsers,
      data.snapshot.averageScore,
      data.snapshot.totalActivities,
    ];

    return [headers.join(','), row.join(',')].join('\n');
  }

  private summarizeTrends(trends: any[]) {
    if (trends.length === 0) return {};

    const totalUsers = trends.length;
    const increasing = trends.filter(t => t.trendDirection === TrendDirection.INCREASING || t.trendDirection === TrendDirection.STRONGLY_INCREASING).length;
    const decreasing = trends.filter(t => t.trendDirection === TrendDirection.DECLINING || t.trendDirection === TrendDirection.STRONGLY_DECLINING).length;
    const stable = trends.filter(t => t.trendDirection === TrendDirection.STABLE).length;

    return {
      totalUsers,
      increasing: {
        count: increasing,
        percentage: Math.round((increasing / totalUsers) * 100),
      },
      decreasing: {
        count: decreasing,
        percentage: Math.round((decreasing / totalUsers) * 100),
      },
      stable: {
        count: stable,
        percentage: Math.round((stable / totalUsers) * 100),
      },
    };
  }
}
