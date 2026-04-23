import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma } from '@prisma/client';
import { CompetitionType, DurationType, CompetitionStatus, ParticipantStatus } from '../enums/competition-type.enum';
import { CreateCompetitionDto } from '../dto/create-competition.dto';
import { JoinCompetitionDto } from '../dto/join-competition.dto';
import { RecordTradeDto } from '../dto/record-trade.dto';
import { CompetitionMetrics, LeaderboardEntry, AntiCheatAlert } from '../interfaces/competition.interface';

@Injectable()
export class CompetitionService {
  constructor(private prisma: PrismaService) {}

  async createCompetition(createCompetitionDto: CreateCompetitionDto) {
    const {
      startTime,
      endTime,
      createdBy,
      prizeDistribution,
      rules,
      ...competitionData
    } = createCompetitionDto;

    // Validate time
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (start >= end) {
      throw new BadRequestException('End time must be after start time');
    }

    if (start <= new Date()) {
      throw new BadRequestException('Start time must be in the future');
    }

    // Validate prize distribution
    const totalPercentage = prizeDistribution.reduce((sum, rule) => sum + rule.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new BadRequestException('Prize distribution percentages must sum to 100%');
    }

    const competition = await this.prisma.tradingCompetition.create({
      data: {
        ...competitionData,
        startTime: start,
        endTime: end,
        prizeDistribution: prizeDistribution as unknown as Prisma.InputJsonValue,
        rules: rules ? (rules as unknown as Prisma.InputJsonValue) : undefined,
        createdBy,
      },
      include: {
        participants: true,
      },
    });

    return competition;
  }

  async getCompetition(id: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        leaderboard: {
          orderBy: { rank: 'asc' },
          include: {
            user: true,
          },
        },
        trades: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });

    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    return competition;
  }

  async listCompetitions(status?: CompetitionStatus, type?: CompetitionType) {
    const where: any = {};
    
    if (status) where.status = status;
    if (type) where.type = type;

    return this.prisma.tradingCompetition.findMany({
      where,
      include: {
        _count: {
          select: {
            participants: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async joinCompetition(joinCompetitionDto: JoinCompetitionDto) {
    const { competitionId, userId, initialBalance } = joinCompetitionDto;

    // Check if competition exists and is joinable
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    if (competition.status !== CompetitionStatus.UPCOMING && competition.status !== CompetitionStatus.ACTIVE) {
      throw new BadRequestException('Cannot join this competition');
    }

    if (competition.endTime <= new Date()) {
      throw new BadRequestException('Competition has already ended');
    }

    // Check if user is already a participant
    const existingParticipant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId,
          userId,
        },
      },
    });

    if (existingParticipant) {
      throw new ConflictException('User is already a participant');
    }

    // Check max participants
    if (competition.maxParticipants) {
      const participantCount = await this.prisma.competitionParticipant.count({
        where: { competitionId },
      });

      if (participantCount >= competition.maxParticipants) {
        throw new BadRequestException('Competition is full');
      }
    }

    // Check entry requirements
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.reputationScore < competition.requiredKycTier) {
      throw new BadRequestException('User does not meet KYC requirements');
    }

    const participant = await this.prisma.competitionParticipant.create({
      data: {
        competitionId,
        userId,
        initialBalance: initialBalance || competition.minDeposit,
        status: competition.status === CompetitionStatus.ACTIVE ? ParticipantStatus.ACTIVE : ParticipantStatus.REGISTERED,
      },
      include: {
        user: true,
        competition: true,
      },
    });

    // Create initial leaderboard entry
    await this.prisma.competitionLeaderboard.create({
      data: {
        competitionId,
        userId,
        rank: 0, // Will be updated when competition starts
        score: 0,
        totalReturn: 0,
        totalVolume: 0,
        maxDrawdown: 0,
        winRate: 0,
      },
    });

    return participant;
  }

  async recordTrade(recordTradeDto: RecordTradeDto) {
    const { competitionId, userId, asset, side, quantity, price, totalValue, fee = 0, transactionHash } = recordTradeDto;

    // Verify competition is active
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    if (competition.status !== CompetitionStatus.ACTIVE) {
      throw new BadRequestException('Competition is not active');
    }

    // Get participant
    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId,
          userId,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.status !== ParticipantStatus.ACTIVE) {
      throw new BadRequestException('Participant is not active');
    }

    // Record the trade
    const trade = await this.prisma.competitionTrade.create({
      data: {
        competitionId,
        participantId: participant.id,
        userId,
        asset,
        side,
        quantity,
        price,
        totalValue,
        fee,
        transactionHash,
      },
    });

    // Update participant metrics
    await this.updateParticipantMetrics(competitionId, userId);

    // Check for anti-cheating patterns
    await this.checkAntiCheatPatterns(competitionId, userId);

    return trade;
  }

  async updateParticipantMetrics(competitionId: string, userId: string) {
    const trades = await this.prisma.competitionTrade.findMany({
      where: {
        competitionId,
        userId,
      },
      orderBy: { timestamp: 'asc' },
    });

    if (trades.length === 0) return;

    // Calculate metrics
    let totalVolume = 0;
    let totalProfitLoss = 0;
    let profitableTrades = 0;
    let runningBalance = Number(trades[0].quantity) * Number(trades[0].price);
    let maxBalance = runningBalance;
    let minBalance = runningBalance;
    const balances = [runningBalance];

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      totalVolume += Number(trade.totalValue);
      
      // Simple P&L calculation (would need more sophisticated logic for real scenarios)
      if (i > 0) {
        const prevTrade = trades[i - 1];
        const pnl = (Number(trade.price) - Number(prevTrade.price)) * Number(trade.quantity);
        totalProfitLoss += pnl;
        runningBalance += pnl;
        
        if (pnl > 0) profitableTrades++;
      }

      maxBalance = Math.max(maxBalance, runningBalance);
      minBalance = Math.min(minBalance, runningBalance);
      balances.push(runningBalance);
    }

    const totalReturn = totalProfitLoss;
    const winRate = trades.length > 1 ? (profitableTrades / (trades.length - 1)) * 100 : 0;
    const maxDrawdown = ((maxBalance - minBalance) / maxBalance) * 100;

    // Calculate Sharpe ratio (simplified)
    const returns = [];
    for (let i = 1; i < balances.length; i++) {
      returns.push((balances[i] - balances[i - 1]) / balances[i - 1]);
    }
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const sharpeRatio = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;

    // Update participant
    await this.prisma.competitionParticipant.update({
      where: {
        competitionId_userId: {
          competitionId,
          userId,
        },
      },
      data: {
        totalVolume,
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
      },
    });

    // Update leaderboard
    await this.updateLeaderboard(competitionId, userId, totalReturn, totalVolume, sharpeRatio, maxDrawdown, winRate);
  }

  async updateLeaderboard(
    competitionId: string,
    userId: string,
    totalReturn: number,
    totalVolume: number,
    sharpeRatio: number,
    maxDrawdown: number,
    winRate: number
  ) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) return;

    // Calculate score based on competition type
    let score = 0;
    switch (competition.type) {
      case CompetitionType.HIGHEST_RETURN:
        score = totalReturn;
        break;
      case CompetitionType.MOST_VOLUME:
        score = totalVolume;
        break;
      case CompetitionType.BEST_SHARPE:
        score = sharpeRatio * 100; // Scale for better ranking
        break;
      case CompetitionType.HIGHEST_WINS:
        score = winRate;
        break;
      case CompetitionType.LOWEST_DRAWDOWN:
        score = -maxDrawdown; // Lower drawdown = higher score
        break;
    }

    // Update leaderboard entry
    await this.prisma.competitionLeaderboard.upsert({
      where: {
        competitionId_userId: {
          competitionId,
          userId,
        },
      },
      update: {
        score,
        totalReturn,
        totalVolume,
        sharpeRatio,
        maxDrawdown,
        winRate,
        lastUpdated: new Date(),
      },
      create: {
        competitionId,
        userId,
        rank: 0, // Will be recalculated
        score,
        totalReturn,
        totalVolume,
        sharpeRatio,
        maxDrawdown,
        winRate,
      },
    });

    // Recalculate ranks
    await this.recalculateRanks(competitionId);
  }

  async recalculateRanks(competitionId: string) {
    const leaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { competitionId },
      orderBy: { score: 'desc' },
    });

    for (let i = 0; i < leaderboard.length; i++) {
      await this.prisma.competitionLeaderboard.update({
        where: { id: leaderboard[i].id },
        data: { rank: i + 1 },
      });
    }
  }

  async getLeaderboard(competitionId: string, limit: number = 50) {
    return this.prisma.competitionLeaderboard.findMany({
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
  }

  async checkAntiCheatPatterns(competitionId: string, userId: string) {
    const trades = await this.prisma.competitionTrade.findMany({
      where: {
        competitionId,
        userId,
        timestamp: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Check for wash trading (buy and sell same asset quickly)
    const quickTrades = trades.filter((trade, index) => {
      if (index === 0) return false;
      const prevTrade = trades[index - 1];
      return (
        trade.asset === prevTrade.asset &&
        trade.side !== prevTrade.side &&
        Math.abs(trade.timestamp.getTime() - prevTrade.timestamp.getTime()) < 60000 // Within 1 minute
      );
    });

    if (quickTrades.length > 5) {
      await this.createAntiCheatFlag({
        competitionId,
        userId,
        type: 'WASH_TRADING',
        severity: 'HIGH',
        description: 'Suspicious rapid buy/sell patterns detected',
        evidence: { quickTrades: quickTrades.length },
      });
    }

    // Check for unusual volume patterns
    const volumes = trades.map(t => Number(t.totalValue));
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const maxVolume = Math.max(...volumes);

    if (maxVolume > avgVolume * 10) {
      await this.createAntiCheatFlag({
        competitionId,
        userId,
        type: 'UNUSUAL_PATTERN',
        severity: 'MEDIUM',
        description: 'Unusual trade volume detected',
        evidence: { maxVolume, avgVolume, ratio: maxVolume / avgVolume },
      });
    }
  }

  private async createAntiCheatFlag(alert: Omit<AntiCheatAlert, 'type' | 'severity'> & { type: string, severity: string }) {
    await this.prisma.antiCheatFlag.create({
      data: {
        competitionId: alert.competitionId,
        userId: alert.userId,
        type: alert.type as any,
        severity: alert.severity as any,
        description: alert.description,
        evidence: alert.evidence,
      },
    });
  }

  async getAntiCheatFlags(competitionId: string, status?: string) {
    const where: any = { competitionId };
    if (status) where.status = status;

    return this.prisma.antiCheatFlag.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async finishCompetition(competitionId: string) {
    const competition = await this.prisma.tradingCompetition.findUnique({
      where: { id: competitionId },
      include: {
        participants: true,
        leaderboard: {
          orderBy: { rank: 'asc' },
        },
      },
    });

    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    if (competition.status !== CompetitionStatus.ACTIVE) {
      throw new BadRequestException('Competition is not active');
    }

    // Update competition status
    await this.prisma.tradingCompetition.update({
      where: { id: competitionId },
      data: { status: CompetitionStatus.FINISHED },
    });

    // Calculate prize distributions
    const prizeDistributions = [];
    const prizeRules = Array.isArray(competition.prizeDistribution)
      ? (competition.prizeDistribution as Array<{ rank: number; percentage: number }>)
      : [];

    for (const [index, entry] of competition.leaderboard.entries()) {
      const prizeRule = prizeRules.find(rule => rule.rank === entry.rank);
      if (prizeRule) {
        const prizeAmount = (Number(competition.prizePool) * prizeRule.percentage) / 100;
        
        const prizeDistribution = await this.prisma.prizeDistribution.create({
          data: {
            competitionId,
            userId: entry.userId,
            rank: entry.rank,
            prizeAmount,
            status: 'PENDING',
          },
        });
        
        prizeDistributions.push(prizeDistribution);

        // Update participant with prize and final rank
        await this.prisma.competitionParticipant.update({
          where: {
            competitionId_userId: {
              competitionId,
              userId: entry.userId,
            },
          },
          data: {
            rank: entry.rank,
            prizeAmount,
            status: ParticipantStatus.FINISHED,
          },
        });
      }
    }

    // Generate achievements
    await this.generateAchievements(competitionId);

    return {
      competition,
      prizeDistributions,
      finalStandings: competition.leaderboard,
    };
  }

  private async generateAchievements(competitionId: string) {
    const leaderboard = await this.prisma.competitionLeaderboard.findMany({
      where: { competitionId },
      orderBy: { rank: 'asc' },
      take: 10,
    });

    // First place
    if (leaderboard.length > 0) {
      await this.prisma.competitionAchievement.create({
        data: {
          competitionId,
          userId: leaderboard[0].userId,
          type: 'FIRST_PLACE',
          title: '🏆 Competition Winner',
          description: 'First place in trading competition',
          icon: 'trophy',
        },
      });
    }

    // Top 3
    for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
      await this.prisma.competitionAchievement.create({
        data: {
          competitionId,
          userId: leaderboard[i].userId,
          type: 'TOP_THREE',
          title: `🥇 Top ${i + 1} Finisher`,
          description: `Finished ${i + 1}${this.getOrdinalSuffix(i + 1)} in competition`,
          icon: 'medal',
        },
      });
    }

    // Top 10
    for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
      await this.prisma.competitionAchievement.create({
        data: {
          competitionId,
          userId: leaderboard[i].userId,
          type: 'TOP_TEN',
          title: '⭐ Top 10 Finisher',
          description: 'Finished in top 10 of competition',
          icon: 'star',
        },
      });
    }
  }

  private getOrdinalSuffix(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  async getUserCompetitions(userId: string, status?: CompetitionStatus) {
    const where: any = { userId };
    if (status) where.status = status;

    return this.prisma.competitionParticipant.findMany({
      where,
      include: {
        competition: true,
      },
      orderBy: { joinedAt: 'desc' },
    });
  }

  async getUserAchievements(userId: string) {
    return this.prisma.competitionAchievement.findMany({
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
    });
  }
}
