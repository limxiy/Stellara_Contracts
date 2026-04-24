import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { ComparisonType, SnapshotComparison } from '@prisma/client';

@Injectable()
export class SnapshotComparisonService {
  private readonly logger = new Logger(SnapshotComparisonService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compare two snapshots
   */
  async compareSnapshots(
    snapshotId1: string,
    snapshotId2: string,
    comparisonType: ComparisonType = ComparisonType.CUSTOM,
  ): Promise<SnapshotComparison> {
    this.logger.log(`Comparing snapshots ${snapshotId1} and ${snapshotId2}`);

    // Get snapshots
    const [snapshot1, snapshot2] = await Promise.all([
      this.prisma.reputationSnapshot.findUnique({
        where: { id: snapshotId1 },
        include: {
          userSnapshots: true,
        },
      }),
      this.prisma.reputationSnapshot.findUnique({
        where: { id: snapshotId2 },
        include: {
          userSnapshots: true,
        },
      }),
    ]);

    if (!snapshot1 || !snapshot2) {
      throw new Error('One or both snapshots not found');
    }

    // Check if comparison already exists
    const existingComparison = await this.prisma.snapshotComparison.findFirst({
      where: {
        snapshotId1,
        snapshotId2,
        comparisonType,
      },
    });

    if (existingComparison) {
      this.logger.log(`Comparison already exists between snapshots ${snapshotId1} and ${snapshotId2}`);
      return existingComparison;
    }

    // Perform comparison
    const comparison = await this.performComparison(snapshot1, snapshot2, comparisonType);

    // Save comparison
    const savedComparison = await this.prisma.snapshotComparison.create({
      data: {
        snapshotId1,
        snapshotId2,
        comparisonType,
        metrics: comparison.metrics,
        insights: comparison.insights,
        significantChanges: comparison.significantChanges,
        recommendations: comparison.recommendations,
        similarityScore: comparison.similarityScore,
      },
    });

    this.logger.log(`Successfully created comparison with similarity score ${comparison.similarityScore}`);
    return savedComparison;
  }

  /**
   * Perform detailed comparison between snapshots
   */
  private async performComparison(snapshot1: any, snapshot2: any, comparisonType: ComparisonType) {
    const metrics = this.calculateComparisonMetrics(snapshot1, snapshot2);
    const significantChanges = this.identifySignificantChanges(metrics);
    const insights = this.generateInsights(metrics, significantChanges);
    const recommendations = this.generateRecommendations(insights, significantChanges);
    const similarityScore = this.calculateSimilarityScore(metrics);

    return {
      metrics,
      insights,
      significantChanges,
      recommendations,
      similarityScore,
    };
  }

  /**
   * Calculate comparison metrics
   */
  private calculateComparisonMetrics(snapshot1: any, snapshot2: any) {
    const userMap1 = new Map(snapshot1.userSnapshots.map((us: any) => [us.userId, us]));
    const userMap2 = new Map(snapshot2.userSnapshots.map((us: any) => [us.userId, us]));

    // Basic metrics comparison
    const basicMetrics = {
      totalUsers: {
        snapshot1: snapshot1.totalUsers,
        snapshot2: snapshot2.totalUsers,
        change: snapshot2.totalUsers - snapshot1.totalUsers,
        percentChange: this.calculatePercentChange(snapshot1.totalUsers, snapshot2.totalUsers),
      },
      activeUsers: {
        snapshot1: snapshot1.activeUsers,
        snapshot2: snapshot2.activeUsers,
        change: snapshot2.activeUsers - snapshot1.activeUsers,
        percentChange: this.calculatePercentChange(snapshot1.activeUsers, snapshot2.activeUsers),
      },
      averageScore: {
        snapshot1: snapshot1.averageScore,
        snapshot2: snapshot2.averageScore,
        change: snapshot2.averageScore - snapshot1.averageScore,
        percentChange: this.calculatePercentChange(snapshot1.averageScore, snapshot2.averageScore),
      },
      medianScore: {
        snapshot1: snapshot1.medianScore,
        snapshot2: snapshot2.medianScore,
        change: snapshot2.medianScore - snapshot1.medianScore,
        percentChange: this.calculatePercentChange(snapshot1.medianScore, snapshot2.medianScore),
      },
      highestScore: {
        snapshot1: snapshot1.highestScore,
        snapshot2: snapshot2.highestScore,
        change: snapshot2.highestScore - snapshot1.highestScore,
        percentChange: this.calculatePercentChange(snapshot1.highestScore, snapshot2.highestScore),
      },
      lowestScore: {
        snapshot1: snapshot1.lowestScore,
        snapshot2: snapshot2.lowestScore,
        change: snapshot2.lowestScore - snapshot1.lowestScore,
        percentChange: this.calculatePercentChange(snapshot1.lowestScore, snapshot2.lowestScore),
      },
      totalActivities: {
        snapshot1: snapshot1.totalActivities,
        snapshot2: snapshot2.totalActivities,
        change: snapshot2.totalActivities - snapshot1.totalActivities,
        percentChange: this.calculatePercentChange(snapshot1.totalActivities, snapshot2.totalActivities),
      },
      newUsers: {
        snapshot1: snapshot1.newUsers,
        snapshot2: snapshot2.newUsers,
        change: snapshot2.newUsers - snapshot1.newUsers,
        percentChange: this.calculatePercentChange(snapshot1.newUsers, snapshot2.newUsers),
      },
      decayedUsers: {
        snapshot1: snapshot1.decayedUsers,
        snapshot2: snapshot2.decayedUsers,
        change: snapshot2.decayedUsers - snapshot1.decayedUsers,
        percentChange: this.calculatePercentChange(snapshot1.decayedUsers, snapshot2.decayedUsers),
      },
    };

    // Score distribution comparison
    const scoreDistributionComparison = this.compareDistributions(
      snapshot1.scoreDistribution,
      snapshot2.scoreDistribution,
    );

    // Level distribution comparison
    const levelDistributionComparison = this.compareDistributions(
      snapshot1.levelDistribution,
      snapshot2.levelDistribution,
    );

    // User-level changes
    const userChanges = this.analyzeUserChanges(userMap1, userMap2);

    // Ranking changes
    const rankingChanges = this.analyzeRankingChanges(userMap1, userMap2);

    return {
      basicMetrics,
      scoreDistributionComparison,
      levelDistributionComparison,
      userChanges,
      rankingChanges,
      periodComparison: {
        snapshot1Period: {
          start: snapshot1.periodStart,
          end: snapshot1.periodEnd,
          type: snapshot1.period,
        },
        snapshot2Period: {
          start: snapshot2.periodStart,
          end: snapshot2.periodEnd,
          type: snapshot2.period,
        },
        timeDifference: Math.abs(snapshot2.periodStart.getTime() - snapshot1.periodStart.getTime()),
      },
    };
  }

  /**
   * Calculate percent change
   */
  private calculatePercentChange(value1: number, value2: number): number {
    if (value1 === 0) return value2 > 0 ? 100 : 0;
    return Math.round(((value2 - value1) / value1) * 10000) / 100;
  }

  /**
   * Compare distributions
   */
  private compareDistributions(dist1: any, dist2: any) {
    const keys = new Set([...Object.keys(dist1), ...Object.keys(dist2)]);
    const comparison: any = {};

    keys.forEach(key => {
      const val1 = dist1[key] || 0;
      const val2 = dist2[key] || 0;
      const change = val2 - val1;
      const percentChange = val1 > 0 ? (change / val1) * 100 : 0;

      comparison[key] = {
        snapshot1: val1,
        snapshot2: val2,
        change,
        percentChange: Math.round(percentChange * 100) / 100,
      };
    });

    return comparison;
  }

  /**
   * Analyze user-level changes
   */
  private analyzeUserChanges(userMap1: Map<string, any>, userMap2: Map<string, any>) {
    const changes = {
      newUsers: [] as string[],
      lostUsers: [] as string[],
      retainedUsers: [] as string[],
      scoreImprovements: [] as any[],
      scoreDeclines: [] as any[],
      levelChanges: [] as any[],
    };

    // Find new users (in snapshot2 but not in snapshot1)
    for (const [userId, user2] of userMap2) {
      if (!userMap1.has(userId)) {
        changes.newUsers.push(userId);
      }
    }

    // Find lost users (in snapshot1 but not in snapshot2)
    for (const [userId, user1] of userMap1) {
      if (!userMap2.has(userId)) {
        changes.lostUsers.push(userId);
      }
    }

    // Analyze retained users
    for (const [userId, user1] of userMap1) {
      const user2 = userMap2.get(userId);
      if (user2) {
        changes.retainedUsers.push(userId);

        // Score changes
        const scoreChange = user2.reputationScore - user1.reputationScore;
        if (scoreChange > 0) {
          changes.scoreImprovements.push({
            userId,
            previousScore: user1.reputationScore,
            newScore: user2.reputationScore,
            change: scoreChange,
            percentChange: this.calculatePercentChange(user1.reputationScore, user2.reputationScore),
          });
        } else if (scoreChange < 0) {
          changes.scoreDeclines.push({
            userId,
            previousScore: user1.reputationScore,
            newScore: user2.reputationScore,
            change: scoreChange,
            percentChange: this.calculatePercentChange(user1.reputationScore, user2.reputationScore),
          });
        }

        // Level changes
        if (user1.reputationLevel !== user2.reputationLevel) {
          changes.levelChanges.push({
            userId,
            previousLevel: user1.reputationLevel,
            newLevel: user2.reputationLevel,
            change: this.getLevelChangeDirection(user1.reputationLevel, user2.reputationLevel),
          });
        }
      }
    }

    // Sort by magnitude of change
    changes.scoreImprovements.sort((a, b) => b.change - a.change);
    changes.scoreDeclines.sort((a, b) => a.change - b.change);

    return changes;
  }

  /**
   * Analyze ranking changes
   */
  private analyzeRankingChanges(userMap1: Map<string, any>, userMap2: Map<string, any>) {
    const rankingChanges = {
      topMovers: [] as any[],
      topFallers: [] as any[],
      topGainers: [] as any[],
      topLosers: [] as any[],
    };

    // Create rankings for both snapshots
    const users1 = Array.from(userMap1.values()).sort((a, b) => b.reputationScore - a.reputationScore);
    const users2 = Array.from(userMap2.values()).sort((a, b) => b.reputationScore - a.reputationScore);

    const rankMap1 = new Map(users1.map((user, index) => [user.userId, index + 1]));
    const rankMap2 = new Map(users2.map((user, index) => [user.userId, index + 1]));

    // Analyze ranking changes for retained users
    for (const [userId, user1] of userMap1) {
      const user2 = userMap2.get(userId);
      if (user2) {
        const rank1 = rankMap1.get(userId)!;
        const rank2 = rankMap2.get(userId)!;
        const rankChange = rank1 - rank2; // Positive means improved rank

        if (rankChange !== 0) {
          rankingChanges.topMovers.push({
            userId,
            previousRank: rank1,
            newRank: rank2,
            rankChange,
            scoreChange: user2.reputationScore - user1.reputationScore,
          });
        }

        // Top gainers (by score)
        const scoreChange = user2.reputationScore - user1.reputationScore;
        if (scoreChange > 0) {
          rankingChanges.topGainers.push({
            userId,
            previousScore: user1.reputationScore,
            newScore: user2.reputationScore,
            scoreChange,
            rankChange,
          });
        }

        // Top losers (by score)
        if (scoreChange < 0) {
          rankingChanges.topLosers.push({
            userId,
            previousScore: user1.reputationScore,
            newScore: user2.reputationScore,
            scoreChange,
            rankChange,
          });
        }
      }
    }

    // Sort by magnitude
    rankingChanges.topMovers.sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange));
    rankingChanges.topGainers.sort((a, b) => b.scoreChange - a.scoreChange);
    rankingChanges.topLosers.sort((a, b) => a.scoreChange - b.scoreChange);

    // Limit to top 10
    rankingChanges.topMovers = rankingChanges.topMovers.slice(0, 10);
    rankingChanges.topGainers = rankingChanges.topGainers.slice(0, 10);
    rankingChanges.topLosers = rankingChanges.topLosers.slice(0, 10);

    return rankingChanges;
  }

  /**
   * Get level change direction
   */
  private getLevelChangeDirection(previousLevel: string, newLevel: string): string {
    const levels = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const prevIndex = levels.indexOf(previousLevel);
    const newIndex = levels.indexOf(newLevel);

    if (newIndex > prevIndex) return 'UPGRADED';
    if (newIndex < prevIndex) return 'DOWNGRADED';
    return 'UNCHANGED';
  }

  /**
   * Identify significant changes
   */
  private identifySignificantChanges(metrics: any) {
    const significantChanges: any[] = [];

    // Basic metrics changes
    Object.entries(metrics.basicMetrics).forEach(([key, value]: [string, any]) => {
      if (Math.abs(value.percentChange) > 10) { // More than 10% change
        significantChanges.push({
          type: 'BASIC_METRIC',
          metric: key,
          change: value.change,
          percentChange: value.percentChange,
          significance: Math.abs(value.percentChange) > 25 ? 'HIGH' : 'MEDIUM',
        });
      }
    });

    // User changes
    const { userChanges } = metrics;
    if (userChanges.newUsers.length > 100) {
      significantChanges.push({
        type: 'USER_ACQUISITION',
        metric: 'newUsers',
        value: userChanges.newUsers.length,
        significance: userChanges.newUsers.length > 500 ? 'HIGH' : 'MEDIUM',
      });
    }

    if (userChanges.lostUsers.length > 100) {
      significantChanges.push({
        type: 'USER_CHURN',
        metric: 'lostUsers',
        value: userChanges.lostUsers.length,
        significance: userChanges.lostUsers.length > 500 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Top movers
    if (metrics.rankingChanges.topMovers.length > 0) {
      const topMover = metrics.rankingChanges.topMovers[0];
      if (Math.abs(topMover.rankChange) > 50) {
        significantChanges.push({
          type: 'RANKING_VOLATILITY',
          metric: 'topRankChange',
          value: topMover.rankChange,
          userId: topMover.userId,
          significance: Math.abs(topMover.rankChange) > 100 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return significantChanges;
  }

  /**
   * Generate insights from comparison
   */
  private generateInsights(metrics: any, significantChanges: any[]) {
    const insights: string[] = [];

    // User growth insights
    const userGrowth = metrics.basicMetrics.totalUsers.percentChange;
    if (userGrowth > 5) {
      insights.push(`Strong user growth of ${userGrowth}% indicates healthy platform adoption`);
    } else if (userGrowth < -5) {
      insights.push(`User base declined by ${Math.abs(userGrowth)}%, requiring attention to retention`);
    }

    // Activity insights
    const activityGrowth = metrics.basicMetrics.totalActivities.percentChange;
    if (activityGrowth > userGrowth) {
      insights.push(`Activity growth (${activityGrowth}%) outpaces user growth, indicating high engagement`);
    } else if (activityGrowth < userGrowth) {
      insights.push(`Activity growth (${activityGrowth}%) lags behind user growth, potential engagement issues`);
    }

    // Score distribution insights
    const scoreDist = metrics.scoreDistributionComparison;
    const highScoreGrowth = scoreDist['801-900']?.percentChange || 0;
    const veryHighScoreGrowth = scoreDist['901-1000']?.percentChange || 0;
    
    if (highScoreGrowth > 20 || veryHighScoreGrowth > 20) {
      insights.push('Significant growth in high-score users suggests mature ecosystem and expert retention');
    }

    // Ranking volatility insights
    const topMover = metrics.rankingChanges.topMovers[0];
    if (topMover && Math.abs(topMover.rankChange) > 100) {
      insights.push('High ranking volatility indicates competitive environment and opportunities for advancement');
    }

    // Level progression insights
    const levelProgression = metrics.userChanges.levelChanges.filter((lc: any) => lc.change === 'UPGRADED').length;
    const levelRegression = metrics.userChanges.levelChanges.filter((lc: any) => lc.change === 'DOWNGRADED').length;
    
    if (levelProgression > levelRegression * 2) {
      insights.push('Strong level progression indicates healthy user advancement and system effectiveness');
    } else if (levelRegression > levelProgression) {
      insights.push('Level regression exceeds progression, may indicate system issues or increased competition');
    }

    return insights;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(insights: string[], significantChanges: any[]) {
    const recommendations: string[] = [];

    // Based on significant changes
    significantChanges.forEach(change => {
      switch (change.type) {
        case 'USER_CHURN':
          if (change.significance === 'HIGH') {
            recommendations.push('Implement user retention campaigns and investigate churn reasons');
            recommendations.push('Review onboarding experience and early engagement mechanisms');
          }
          break;
        case 'USER_ACQUISITION':
          if (change.significance === 'HIGH') {
            recommendations.push('Scale up user acquisition efforts while maintaining quality');
            recommendations.push('Ensure infrastructure can handle increased user load');
          }
          break;
        case 'RANKING_VOLATILITY':
          if (change.significance === 'HIGH') {
            recommendations.push('Monitor ranking system for potential manipulation or bugs');
            recommendations.push('Consider implementing ranking stability mechanisms');
          }
          break;
      }
    });

    // Based on insights
    insights.forEach(insight => {
      if (insight.includes('engagement issues')) {
        recommendations.push('Launch engagement initiatives and community building programs');
        recommendations.push('Analyze user behavior patterns to identify engagement drop-off points');
      }
      
      if (insight.includes('healthy platform adoption')) {
        recommendations.push('Continue successful acquisition strategies');
        recommendations.push('Prepare for scaling challenges and maintain system performance');
      }
      
      if (insight.includes('competitive environment')) {
        recommendations.push('Leverage competitive dynamics for user retention and gamification');
        recommendations.push('Ensure fair competition mechanisms and prevent exploitation');
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Calculate overall similarity score
   */
  private calculateSimilarityScore(metrics: any): number {
    let totalSimilarity = 0;
    let factorCount = 0;

    // Basic metrics similarity (40% weight)
    const basicMetricsSimilarity = this.calculateBasicMetricsSimilarity(metrics.basicMetrics);
    totalSimilarity += basicMetricsSimilarity * 0.4;
    factorCount += 0.4;

    // Distribution similarity (30% weight)
    const distributionSimilarity = this.calculateDistributionSimilarity(
      metrics.scoreDistributionComparison,
      metrics.levelDistributionComparison,
    );
    totalSimilarity += distributionSimilarity * 0.3;
    factorCount += 0.3;

    // User retention similarity (20% weight)
    const retentionSimilarity = this.calculateRetentionSimilarity(metrics.userChanges);
    totalSimilarity += retentionSimilarity * 0.2;
    factorCount += 0.2;

    // Ranking stability similarity (10% weight)
    const rankingSimilarity = this.calculateRankingSimilarity(metrics.rankingChanges);
    totalSimilarity += rankingSimilarity * 0.1;
    factorCount += 0.1;

    return Math.round((totalSimilarity / factorCount) * 1000) / 1000;
  }

  /**
   * Calculate basic metrics similarity
   */
  private calculateBasicMetricsSimilarity(basicMetrics: any): number {
    const similarities = Object.values(basicMetrics).map((metric: any) => {
      const percentChange = Math.abs(metric.percentChange);
      // Convert percent change to similarity (0% change = 1.0 similarity, 100% change = 0.0 similarity)
      return Math.max(0, 1 - (percentChange / 100));
    });

    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  /**
   * Calculate distribution similarity
   */
  private calculateDistributionSimilarity(scoreDist: any, levelDist: any): number {
    const scoreSimilarity = this.calculateSingleDistributionSimilarity(scoreDist);
    const levelSimilarity = this.calculateSingleDistributionSimilarity(levelDist);
    
    return (scoreSimilarity + levelSimilarity) / 2;
  }

  /**
   * Calculate single distribution similarity
   */
  private calculateSingleDistributionSimilarity(distribution: any): number {
    const similarities = Object.values(distribution).map((item: any) => {
      const percentChange = Math.abs(item.percentChange);
      return Math.max(0, 1 - (percentChange / 100));
    });

    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  /**
   * Calculate retention similarity
   */
  private calculateRetentionSimilarity(userChanges: any): number {
    const totalUsers1 = userChanges.retainedUsers.length + userChanges.lostUsers.length;
    const retentionRate = userChanges.retainedUsers.length / totalUsers1;
    
    // High retention rate = high similarity
    return retentionRate;
  }

  /**
   * Calculate ranking similarity
   */
  private calculateRankingSimilarity(rankingChanges: any): number {
    if (rankingChanges.topMovers.length === 0) return 1.0; // No changes = perfect similarity
    
    const avgRankChange = rankingChanges.topMovers.reduce((sum: number, mover: any) => 
      sum + Math.abs(mover.rankChange), 0) / rankingChanges.topMovers.length;
    
    // Lower average rank change = higher similarity
    return Math.max(0, 1 - (avgRankChange / 1000)); // Normalize by max expected change
  }

  /**
   * Get comparison by ID
   */
  async getComparison(comparisonId: string) {
    return this.prisma.snapshotComparison.findUnique({
      where: { id: comparisonId },
      include: {
        snapshot1: true,
        snapshot2: true,
      },
    });
  }

  /**
   * Get comparisons for a snapshot
   */
  async getSnapshotComparisons(snapshotId: string) {
    return this.prisma.snapshotComparison.findMany({
      where: {
        OR: [
          { snapshotId1: snapshotId },
          { snapshotId2: snapshotId },
        ],
      },
      include: {
        snapshot1: {
          select: {
            id: true,
            period: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        snapshot2: {
          select: {
            id: true,
            period: true,
            periodStart: true,
            periodEnd: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Create automatic period-over-period comparisons
   */
  async createPeriodOverPeriodComparisons() {
    this.logger.log('Creating automatic period-over-period comparisons');

    // Get latest snapshots for each period type
    const latestDaily = await this.prisma.reputationSnapshot.findMany({
      where: { period: 'DAILY' },
      orderBy: { periodStart: 'desc' },
      take: 2,
    });

    const latestWeekly = await this.prisma.reputationSnapshot.findMany({
      where: { period: 'WEEKLY' },
      orderBy: { periodStart: 'desc' },
      take: 2,
    });

    const latestMonthly = await this.prisma.reputationSnapshot.findMany({
      where: { period: 'MONTHLY' },
      orderBy: { periodStart: 'desc' },
      take: 2,
    });

    // Create comparisons
    const comparisons = [];

    if (latestDaily.length === 2) {
      comparisons.push(
        this.compareSnapshots(latestDaily[1].id, latestDaily[0].id, ComparisonType.DAY_OVER_DAY),
      );
    }

    if (latestWeekly.length === 2) {
      comparisons.push(
        this.compareSnapshots(latestWeekly[1].id, latestWeekly[0].id, ComparisonType.WEEK_OVER_WEEK),
      );
    }

    if (latestMonthly.length === 2) {
      comparisons.push(
        this.compareSnapshots(latestMonthly[1].id, latestMonthly[0].id, ComparisonType.MONTH_OVER_MONTH),
      );
    }

    await Promise.all(comparisons);
    this.logger.log(`Created ${comparisons.length} automatic comparisons`);
  }
}
