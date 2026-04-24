import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SocialSharingService {
  constructor(private prisma: PrismaService) {}

  async generateShareableAchievement(achievementId: string) {
    const achievement = await this.prisma.competitionAchievement.findUnique({
      where: { id: achievementId },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
        competition: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
    });

    if (!achievement) {
      throw new Error('Achievement not found');
    }

    const shareUrl = this.generateShareUrl(achievement);
    
    // Update achievement with share URL
    await this.prisma.competitionAchievement.update({
      where: { id: achievementId },
      data: { shareUrl, shared: true },
    });

    return {
      achievement,
      shareUrl,
      shareText: this.generateShareText(achievement),
      shareImage: this.generateShareImage(achievement),
    };
  }

  async generateShareableLeaderboard(competitionId: string, userId?: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      include: {
        leaderboard: {
          orderBy: { rank: 'asc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
              },
            },
          },
        },
      },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const userRank = userId ? competition.leaderboard.find(entry => entry.userId === userId) : null;
    
    const shareUrl = this.generateLeaderboardShareUrl(competitionId, userId);
    
    return {
      competition,
      leaderboard: competition.leaderboard,
      userRank,
      shareUrl,
      shareText: this.generateLeaderboardShareText(competition, userRank),
      shareImage: this.generateLeaderboardShareImage(competition, userRank),
    };
  }

  async generateShareableCompetitionResult(competitionId: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      include: {
        leaderboard: {
          orderBy: { rank: 'asc' },
          take: 3,
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
              },
            },
          },
        },
        prizeDistributions: {
          where: { status: 'PAID' },
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
              },
            },
          },
        },
      },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const shareUrl = this.generateResultShareUrl(competitionId);
    
    return {
      competition,
      topPerformers: competition.leaderboard,
      prizeDistributions: competition.prizeDistributions,
      shareUrl,
      shareText: this.generateResultShareText(competition),
      shareImage: this.generateResultShareImage(competition),
    };
  }

  private generateShareUrl(achievement: any): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    return `${baseUrl}/achievements/${achievement.id}`;
  }

  private generateLeaderboardShareUrl(competitionId: string, userId?: string): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    const userParam = userId ? `?user=${userId}` : '';
    return `${baseUrl}/competitions/${competitionId}/leaderboard${userParam}`;
  }

  private generateResultShareUrl(competitionId: string): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    return `${baseUrl}/competitions/${competitionId}/results`;
  }

  private generateShareText(achievement: any): string {
    const emojis = {
      FIRST_PLACE: '🏆',
      TOP_THREE: '🥇',
      TOP_TEN: '⭐',
      HIGHEST_RETURN: '📈',
      MOST_VOLUME: '💰',
      BEST_RISK_ADJUSTED: '🎯',
      WIN_STREAK: '🔥',
      CONSISTENT_PERFORMANCE: '💎',
    };

    const emoji = emojis[achievement.type] || '🎉';
    
    return `${emoji} I just earned the "${achievement.title}" achievement in the ${achievement.competition.title} trading competition! Join me on Stellara and test your trading skills. ${achievement.shareUrl}`;
  }

  private generateLeaderboardShareText(competition: any, userRank?: any): string {
    if (userRank) {
      return `🏅 I'm currently ranked #${userRank.rank} in the "${competition.title}" trading competition! Come and compete with me on Stellara. ${this.generateLeaderboardShareUrl(competition.id, userRank.userId)}`;
    } else {
      return `📊 Check out the live leaderboard for the "${competition.title}" trading competition! See who's leading the pack on Stellara. ${this.generateLeaderboardShareUrl(competition.id)}`;
    }
  }

  private generateResultShareText(competition: any): string {
    const winner = competition.leaderboard[0];
    return `🎉 The "${competition.title}" trading competition has finished! Congratulations to ${this.maskAddress(winner.user.walletAddress)} for taking 1st place! See all the results on Stellara. ${this.generateResultShareUrl(competition.id)}`;
  }

  private generateShareImage(achievement: any): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    return `${baseUrl}/api/og/achievement/${achievement.id}`;
  }

  private generateLeaderboardShareImage(competition: any, userRank?: any): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    return `${baseUrl}/api/og/leaderboard/${competition.id}${userRank ? `?user=${userRank.userId}` : ''}`;
  }

  private generateResultShareImage(competition: any): string {
    const baseUrl = process.env.BASE_URL || 'https://stellara.com';
    return `${baseUrl}/api/og/results/${competition.id}`;
  }

  private maskAddress(address: string): string {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async trackShare(achievementId: string, platform: string, userId: string) {
    // In a real implementation, this would track sharing analytics
    // For now, we'll just update the achievement share count
    await this.prisma.competitionAchievement.update({
      where: { id: achievementId },
      data: { shared: true },
    });

    return {
      success: true,
      platform,
      timestamp: new Date(),
    };
  }

  async getShareableContent(userId: string) {
    const achievements = await this.prisma.competitionAchievement.findMany({
      where: { userId },
      include: {
        competition: {
          select: {
            id: true,
            title: true,
            type: true,
          },
        },
      },
      orderBy: { earnedAt: 'desc' },
      take: 10,
    });

    const userCompetitions = await this.prisma.competitionParticipant.findMany({
      where: { userId },
      include: {
        competition: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 5,
    });

    const leaderboardEntries = await this.prisma.competitionLeaderboard.findMany({
      where: {
        userId,
        competitionId: { in: userCompetitions.map((p) => p.competitionId) },
      },
    });
    const leaderboardByCompetition = new Map(
      leaderboardEntries.map((entry) => [entry.competitionId, entry]),
    );

    return {
      achievements: achievements.map(achievement => ({
        ...achievement,
        shareUrl: this.generateShareUrl(achievement),
        shareText: this.generateShareText(achievement),
        shareImage: this.generateShareImage(achievement),
      })),
      competitions: userCompetitions.map(participant => ({
        competition: participant.competition,
        userRank: leaderboardByCompetition.get(participant.competitionId) || null,
        shareUrl: this.generateLeaderboardShareUrl(participant.competitionId, userId),
        shareText: this.generateLeaderboardShareText(
          participant.competition,
          leaderboardByCompetition.get(participant.competitionId) || null,
        ),
        shareImage: this.generateLeaderboardShareImage(
          participant.competition,
          leaderboardByCompetition.get(participant.competitionId) || null,
        ),
      })),
    };
  }

  async generateCompetitionInvite(competitionId: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        title: true,
        type: true,
        startTime: true,
        endTime: true,
        prizePool: true,
        maxParticipants: true,
        participants: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const availableSpots = competition.maxParticipants 
      ? competition.maxParticipants - competition.participants.length 
      : null;

    const inviteUrl = `${process.env.BASE_URL || 'https://stellara.com'}/competitions/${competitionId}/join`;
    
    return {
      competition,
      inviteUrl,
      inviteText: this.generateInviteText(competition, availableSpots),
      shareImage: `${process.env.BASE_URL || 'https://stellara.com'}/api/og/invite/${competitionId}`,
      availableSpots,
    };
  }

  private generateInviteText(competition: any, availableSpots?: number): string {
    const spotsText = availableSpots ? ` Only ${availableSpots} spots left!` : '';
    
    return `🎯 I'm inviting you to join the "${competition.title}" trading competition on Stellara! ${competition.prizePool > 0 ? `Prize pool: $${competition.prizePool}` : ''}${spotsText} Don't miss out! ${process.env.BASE_URL || 'https://stellara.com'}/competitions/${competition.id}/join`;
  }
}
