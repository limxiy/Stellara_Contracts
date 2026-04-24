import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CompetitionType, CompetitionStatus } from '../enums/competition-type.enum';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getCompetitionAnalytics(competitionId: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      include: {
        participants: {
          include: {
            user: true,
            trades: true,
          },
        },
        trades: true,
        leaderboard: true,
        antiCheatFlags: true,
      },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const analytics = {
      overview: {
        totalParticipants: competition.participants.length,
        totalTrades: competition.trades.length,
        totalVolume: competition.trades.reduce((sum, trade) => sum + Number(trade.totalValue), 0),
        totalPrizePool: Number(competition.prizePool),
        averageReturn: this.calculateAverageReturn(competition.leaderboard),
        competitionDuration: this.calculateDuration(competition.startTime, competition.endTime),
      },
      participantMetrics: {
        activeParticipants: competition.participants.filter(p => p.status === 'ACTIVE').length,
        disqualifiedParticipants: competition.participants.filter(p => p.disqualified).length,
        averageTradesPerParticipant: competition.trades.length / competition.participants.length,
        topPerformers: competition.leaderboard.slice(0, 10),
      },
      tradingMetrics: {
        mostTradedAssets: this.getMostTradedAssets(competition.trades),
        averageTradeSize: competition.trades.reduce((sum, trade) => sum + Number(trade.totalValue), 0) / competition.trades.length,
        tradingVolumeByHour: this.getVolumeByHour(competition.trades),
        buySellRatio: this.calculateBuySellRatio(competition.trades),
      },
      antiCheatMetrics: {
        totalFlags: competition.antiCheatFlags.length,
        flagsByType: this.groupFlagsByType(competition.antiCheatFlags),
        flagsBySeverity: this.groupFlagsBySeverity(competition.antiCheatFlags),
        participantsFlagged: new Set(competition.antiCheatFlags.map(f => f.userId)).size,
      },
      progress: {
        timeElapsed: this.calculateTimeElapsed(competition.startTime, competition.endTime),
        estimatedFinalParticipants: this.estimateFinalParticipants(competition.participants),
        currentLeader: competition.leaderboard[0],
      },
    };

    return analytics;
  }

  async getUserAnalytics(userId: string) {
    const userCompetitions = await this.prisma.competitionParticipant.findMany({
      where: { userId },
      include: {
        competition: true,
        trades: true,
      },
    });

    const userLeaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { userId },
    });

    const achievements = await this.prisma.competitionAchievement.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });

    const leaderboardByCompetition = new Map(userLeaderboard.map((entry) => [entry.competitionId, entry]));

    const analytics = {
      overview: {
        totalCompetitions: userCompetitions.length,
        competitionsWon: userCompetitions.filter(p => p.rank === 1).length,
        totalPrizesWon: userCompetitions.reduce((sum, p) => sum + Number(p.prizeAmount || 0), 0),
        totalTrades: userCompetitions.reduce((sum, p) => sum + p.trades.length, 0),
        totalVolume: userCompetitions.reduce((sum, p) => 
          sum + p.trades.reduce((tradeSum, trade) => tradeSum + Number(trade.totalValue), 0), 0),
      },
      performance: {
        averageReturn: this.calculateAverageReturn(userLeaderboard),
        bestReturn: Math.max(...userCompetitions.map(p => Number(p.totalReturn || 0))),
        averageRank: userCompetitions.reduce((sum, p) => sum + (p.rank || 0), 0) / userCompetitions.length,
        winRate: (userCompetitions.filter(p => p.rank && p.rank <= 3).length / userCompetitions.length) * 100,
      },
      achievements: {
        totalAchievements: achievements.length,
        achievementTypes: this.groupAchievementsByType(achievements),
        recentAchievements: achievements.slice(0, 5),
      },
      competitionHistory: userCompetitions.map(p => ({
        competitionId: p.competitionId,
        title: p.competition.title,
        type: p.competition.type,
        rank: leaderboardByCompetition.get(p.competitionId)?.rank || p.rank,
        totalReturn: p.totalReturn,
        prizeAmount: p.prizeAmount,
        finishedAt: p.competition.endTime,
      })).sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()),
    };

    return analytics;
  }

  async getPlatformAnalytics(timeRange: string = '30d') {
    const startDate = this.getStartDate(timeRange);

    const competitions = await this.prisma.tradingCompetition.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        participants: true,
        trades: true,
        prizeDistributions: true,
      },
    });

    const analytics = {
      overview: {
        totalCompetitions: competitions.length,
        totalParticipants: competitions.reduce((sum, c) => sum + c.participants.length, 0),
        totalTrades: competitions.reduce((sum, c) => sum + c.trades.length, 0),
        totalVolume: competitions.reduce((sum, c) => 
          sum + c.trades.reduce((tradeSum, trade) => tradeSum + Number(trade.totalValue), 0), 0),
        totalPrizePool: competitions.reduce((sum, c) => sum + Number(c.prizePool), 0),
        totalPrizesDistributed: competitions.reduce((sum, c) => 
          sum + c.prizeDistributions.filter(p => p.status === 'PAID')
            .reduce((prizeSum, p) => prizeSum + Number(p.prizeAmount), 0), 0),
      },
      competitions: {
        byType: this.groupCompetitionsByType(competitions),
        byStatus: this.groupCompetitionsByStatus(competitions),
        averageParticipants: competitions.reduce((sum, c) => sum + c.participants.length, 0) / competitions.length,
        averagePrizePool: competitions.reduce((sum, c) => sum + Number(c.prizePool), 0) / competitions.length,
      },
      trends: {
        competitionsOverTime: this.getCompetitionsOverTime(competitions, timeRange),
        participantsOverTime: this.getParticipantsOverTime(competitions, timeRange),
        volumeOverTime: this.getVolumeOverTime(competitions, timeRange),
      },
      topPerformers: {
        bestTraders: await this.getTopTraders(timeRange),
        mostActive: await this.getMostActiveUsers(timeRange),
        highestWinners: await this.getHighestWinners(timeRange),
      },
    };

    return analytics;
  }

  private calculateAverageReturn(leaderboard: any[]): number {
    if (leaderboard.length === 0) return 0;
    const total = leaderboard.reduce((sum, entry) => sum + Number(entry.totalReturn || 0), 0);
    return total / leaderboard.length;
  }

  private calculateDuration(startTime: Date, endTime: Date): string {
    const duration = endTime.getTime() - startTime.getTime();
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  }

  private calculateTimeElapsed(startTime: Date, endTime: Date): number {
    const now = new Date();
    const total = endTime.getTime() - startTime.getTime();
    const elapsed = now.getTime() - startTime.getTime();
    return Math.min(100, (elapsed / total) * 100);
  }

  private getMostTradedAssets(trades: any[]): Array<{ asset: string; volume: number; count: number }> {
    const assetStats = trades.reduce((stats, trade) => {
      if (!stats[trade.asset]) {
        stats[trade.asset] = { volume: 0, count: 0 };
      }
      stats[trade.asset].volume += Number(trade.totalValue);
      stats[trade.asset].count += 1;
      return stats;
    }, {});

    return Object.entries(assetStats)
      .map(([asset, stats]: [string, any]) => ({ asset, ...stats }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);
  }

  private getVolumeByHour(trades: any[]): Array<{ hour: number; volume: number }> {
    const volumeByHour = new Array(24).fill(0);
    
    trades.forEach(trade => {
      const hour = new Date(trade.timestamp).getHours();
      volumeByHour[hour] += Number(trade.totalValue);
    });

    return volumeByHour.map((volume, hour) => ({ hour, volume }));
  }

  private calculateBuySellRatio(trades: any[]): { buy: number; sell: number; ratio: number } {
    const buys = trades.filter(t => t.side === 'BUY').length;
    const sells = trades.filter(t => t.side === 'SELL').length;
    const total = buys + sells;
    
    return {
      buy: (buys / total) * 100,
      sell: (sells / total) * 100,
      ratio: buys / sells,
    };
  }

  private groupFlagsByType(flags: any[]): Record<string, number> {
    return flags.reduce((groups, flag) => {
      groups[flag.type] = (groups[flag.type] || 0) + 1;
      return groups;
    }, {});
  }

  private groupFlagsBySeverity(flags: any[]): Record<string, number> {
    return flags.reduce((groups, flag) => {
      groups[flag.severity] = (groups[flag.severity] || 0) + 1;
      return groups;
    }, {});
  }

  private groupAchievementsByType(achievements: any[]): Record<string, number> {
    return achievements.reduce((groups, achievement) => {
      groups[achievement.type] = (groups[achievement.type] || 0) + 1;
      return groups;
    }, {});
  }

  private estimateFinalParticipants(participants: any[]): number {
    const activeGrowthRate = 0.1; // 10% growth estimation
    return Math.floor(participants.length * (1 + activeGrowthRate));
  }

  private getStartDate(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private groupCompetitionsByType(competitions: any[]): Record<string, number> {
    return competitions.reduce((groups, competition) => {
      groups[competition.type] = (groups[competition.type] || 0) + 1;
      return groups;
    }, {});
  }

  private groupCompetitionsByStatus(competitions: any[]): Record<string, number> {
    return competitions.reduce((groups, competition) => {
      groups[competition.status] = (groups[competition.status] || 0) + 1;
      return groups;
    }, {});
  }

  private getCompetitionsOverTime(competitions: any[], timeRange: string): Array<{ date: string; count: number }> {
    const dailyStats = {};
    
    competitions.forEach(competition => {
      const date = competition.createdAt.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    return Object.entries(dailyStats)
      .map(([date, count]) => ({ date, count: count as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private getParticipantsOverTime(competitions: any[], timeRange: string): Array<{ date: string; count: number }> {
    const dailyStats = {};
    
    competitions.forEach(competition => {
      const date = competition.createdAt.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + competition.participants.length;
    });

    return Object.entries(dailyStats)
      .map(([date, count]) => ({ date, count: count as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private getVolumeOverTime(competitions: any[], timeRange: string): Array<{ date: string; volume: number }> {
    const dailyStats = {};
    
    competitions.forEach(competition => {
      const date = competition.createdAt.toISOString().split('T')[0];
      const dailyVolume = competition.trades.reduce((sum, trade) => sum + Number(trade.totalValue), 0);
      dailyStats[date] = (dailyStats[date] || 0) + dailyVolume;
    });

    return Object.entries(dailyStats)
      .map(([date, volume]) => ({ date, volume: volume as number }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getTopTraders(timeRange: string): Promise<Array<{ userId: string; totalReturn: number; competitions: number }>> {
    // This would require complex aggregation - simplified for now
    return [];
  }

  private async getMostActiveUsers(timeRange: string): Promise<Array<{ userId: string; tradeCount: number; volume: number }>> {
    // This would require complex aggregation - simplified for now
    return [];
  }

  private async getHighestWinners(timeRange: string): Promise<Array<{ userId: string; prizeAmount: number; competitions: number }>> {
    // This would require complex aggregation - simplified for now
    return [];
  }
}
