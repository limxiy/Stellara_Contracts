import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  async getRealTimeLeaderboard(competitionId: string, limit: number = 50) {
    const leaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { competitionId },
      orderBy: { rank: 'asc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
      },
    });

    return leaderboard.map(entry => ({
      ...entry,
      user: {
        ...entry.user,
        walletAddress: this.maskAddress(entry.user.walletAddress),
      },
    }));
  }

  async getLeaderboardWithMetrics(competitionId: string, userId?: string) {
    const leaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { competitionId },
      orderBy: { rank: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
      },
    });

    const userRank = userId ? leaderboard.find(entry => entry.userId === userId) : null;

    return {
      leaderboard: leaderboard.map(entry => ({
        ...entry,
        user: {
          ...entry.user,
          walletAddress: this.maskAddress(entry.user.walletAddress),
        },
      })),
      userRank,
      totalParticipants: leaderboard.length,
    };
  }

  async getLeaderboardHistory(competitionId: string, timeRange: string = '1h') {
    // This would require storing historical snapshots
    // For now, return current state
    return this.getRealTimeLeaderboard(competitionId);
  }

  async getTopPerformers(competitionId: string, metric: string, limit: number = 10) {
    const leaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { competitionId },
      orderBy: this.getOrderByMetric(metric),
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
      },
    });

    return leaderboard.map(entry => ({
      ...entry,
      user: {
        ...entry.user,
        walletAddress: this.maskAddress(entry.user.walletAddress),
      },
    }));
  }

  private getOrderByMetric(metric: string): Prisma.CompetitionLeaderboardOrderByWithRelationInput {
    switch (metric) {
      case 'return':
        return { totalReturn: 'desc' };
      case 'volume':
        return { totalVolume: 'desc' };
      case 'sharpe':
        return { sharpeRatio: 'desc' };
      case 'drawdown':
        return { maxDrawdown: 'asc' };
      case 'winRate':
        return { winRate: 'desc' };
      default:
        return { rank: 'asc' };
    }
  }

  private maskAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async getLeaderboardStats(competitionId: string) {
    const stats = await this.prisma.competitionLeaderboard.aggregate({
      where: { competitionId },
      _avg: {
        totalReturn: true,
        totalVolume: true,
        sharpeRatio: true,
        maxDrawdown: true,
        winRate: true,
      },
      _max: {
        totalReturn: true,
        totalVolume: true,
        sharpeRatio: true,
      },
      _min: {
        maxDrawdown: true,
      },
      _count: true,
    });

    return {
      averageMetrics: stats._avg,
      bestMetrics: {
        totalReturn: stats._max.totalReturn,
        totalVolume: stats._max.totalVolume,
        sharpeRatio: stats._max.sharpeRatio,
        minDrawdown: stats._min.maxDrawdown,
      },
      totalParticipants: stats._count,
    };
  }
}
