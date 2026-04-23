import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { FlagType, FlagSeverity, FlagStatus } from '../enums/competition-type.enum';

@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  constructor(private prisma: PrismaService) {}

  async analyzeTradingPatterns(competitionId: string, userId: string) {
    const trades = await this.prisma.competitionTrade.findMany({
      where: {
        competitionId,
        userId,
      },
      orderBy: { timestamp: 'asc' },
    });

    const alerts = [];

    // Check for wash trading
    alerts.push(...this.detectWashTrading(trades, competitionId, userId));

    // Check for self-dealing patterns
    alerts.push(...this.detectSelfDealing(trades, competitionId, userId));

    // Check for unusual volume patterns
    alerts.push(...this.detectUnusualVolume(trades, competitionId, userId));

    // Check for timing patterns (bots)
    alerts.push(...this.detectBotPatterns(trades, competitionId, userId));

    // Check for multiple account patterns
    alerts.push(...(await this.detectMultipleAccounts(competitionId, userId)));

    return alerts;
  }

  private detectWashTrading(trades: any[], competitionId: string, userId: string) {
    const alerts = [];
    
    // Look for rapid buy/sell of same asset
    for (let i = 1; i < trades.length; i++) {
      const current = trades[i];
      const previous = trades[i - 1];
      
      if (
        current.asset === previous.asset &&
        current.side !== previous.side &&
        Math.abs(current.timestamp.getTime() - previous.timestamp.getTime()) < 60000 // Within 1 minute
      ) {
        const priceDiff = Math.abs(Number(current.price) - Number(previous.price));
        const priceDiffPercent = (priceDiff / Number(previous.price)) * 100;
        
        // If price difference is very small, likely wash trading
        if (priceDiffPercent < 0.1) {
          alerts.push({
            type: FlagType.WASH_TRADING,
            severity: FlagSeverity.HIGH,
            description: 'Rapid buy/sell of same asset at similar price detected',
            evidence: {
              trade1: previous.id,
              trade2: current.id,
              timeDiff: Math.abs(current.timestamp.getTime() - previous.timestamp.getTime()),
              priceDiffPercent,
            },
          });
        }
      }
    }
    
    return alerts;
  }

  private detectSelfDealing(trades: any[], competitionId: string, userId: string) {
    const alerts = [];
    
    // Group trades by asset
    const assetGroups = trades.reduce((groups, trade) => {
      if (!groups[trade.asset]) groups[trade.asset] = [];
      groups[trade.asset].push(trade);
      return groups;
    }, {} as Record<string, any[]>);

    for (const [asset, assetTrades] of Object.entries(assetGroups) as Array<[string, any[]]>) {
      if (assetTrades.length < 4) continue;

      // Look for circular trading patterns
      for (let i = 0; i < assetTrades.length - 3; i++) {
        const window = assetTrades.slice(i, i + 4);
        const buySellPattern = window.map(t => t.side).join('-');
        
        if (buySellPattern === 'BUY-SELL-BUY-SELL' || buySellPattern === 'SELL-BUY-SELL-BUY') {
          const volumes = window.map(t => Number(t.totalValue));
          const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
          const volumeVariance = volumes.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / volumes.length;
          
          // Similar volumes suggest self-dealing
          if (volumeVariance < avgVolume * 0.1) {
            alerts.push({
              type: FlagType.SELF_DEALING,
              severity: FlagSeverity.MEDIUM,
              description: 'Circular trading pattern with similar volumes detected',
              evidence: {
                asset,
                pattern: buySellPattern,
                trades: window.map(t => t.id),
                volumeVariance,
              },
            });
          }
        }
      }
    }
    
    return alerts;
  }

  private detectUnusualVolume(trades: any[], competitionId: string, userId: string) {
    const alerts = [];
    
    if (trades.length < 5) return alerts;

    const volumes = trades.map(t => Number(t.totalValue));
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const maxVolume = Math.max(...volumes);
    const stdDev = Math.sqrt(volumes.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / volumes.length);

    // Check for trades that are many standard deviations above the mean
    const outlierThreshold = avgVolume + (3 * stdDev);
    const outliers = trades.filter(t => Number(t.totalValue) > outlierThreshold);

    if (outliers.length > 0) {
      alerts.push({
        type: FlagType.UNUSUAL_PATTERN,
        severity: FlagSeverity.MEDIUM,
        description: 'Unusually large trade volumes detected',
        evidence: {
          avgVolume,
          maxVolume,
          outlierThreshold,
          outlierCount: outliers.length,
          outliers: outliers.map(t => ({ id: t.id, volume: t.totalValue })),
        },
      });
    }

    return alerts;
  }

  private detectBotPatterns(trades: any[], competitionId: string, userId: string) {
    const alerts = [];
    
    if (trades.length < 10) return alerts;

    // Check for consistent timing patterns
    const intervals = [];
    for (let i = 1; i < trades.length; i++) {
      intervals.push(trades[i].timestamp.getTime() - trades[i - 1].timestamp.getTime());
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;

    // Very low variance in timing suggests bot activity
    if (intervalVariance < avgInterval * 0.05) {
      alerts.push({
        type: FlagType.BOTS,
        severity: FlagSeverity.HIGH,
        description: 'Highly regular trading intervals detected (possible bot activity)',
        evidence: {
          avgInterval,
          intervalVariance,
          tradeCount: trades.length,
        },
      });
    }

    // Check for instant reaction times
    const reactionTimes = [];
    for (let i = 1; i < trades.length; i++) {
      const timeDiff = trades[i].timestamp.getTime() - trades[i - 1].timestamp.getTime();
      if (timeDiff < 1000) { // Less than 1 second
        reactionTimes.push(timeDiff);
      }
    }

    if (reactionTimes.length > trades.length * 0.3) {
      alerts.push({
        type: FlagType.BOTS,
        severity: FlagSeverity.HIGH,
        description: 'Superhuman reaction times detected',
        evidence: {
          instantTrades: reactionTimes.length,
          totalTrades: trades.length,
          percentage: (reactionTimes.length / trades.length) * 100,
        },
      });
    }

    return alerts;
  }

  private async detectMultipleAccounts(competitionId: string, userId: string) {
    const alerts = [];

    // Get all participants in the competition
    const participants = await this.prisma.competitionParticipant.findMany({
      where: { competitionId },
      include: {
        user: true,
        trades: {
          where: { userId },
        },
      },
    });

    // Get user's trading patterns
    const userTrades = await this.prisma.competitionTrade.findMany({
      where: { competitionId, userId },
    });

    if (userTrades.length < 5) return alerts;

    // Compare with other participants
    for (const participant of participants) {
      if (participant.userId === userId) continue;

      const otherTrades = await this.prisma.competitionTrade.findMany({
        where: { competitionId, userId: participant.userId },
      });

      if (otherTrades.length < 5) continue;

      // Check for similar trading patterns
      const similarity = this.calculateTradingPatternSimilarity(userTrades, otherTrades);
      
      if (similarity > 0.8) {
        alerts.push({
          type: FlagType.MULTIPLE_ACCOUNTS,
          severity: FlagSeverity.CRITICAL,
          description: 'Highly similar trading patterns to another participant',
          evidence: {
            similarUserId: participant.userId,
            similarity,
            userTradeCount: userTrades.length,
            otherTradeCount: otherTrades.length,
          },
        });
      }
    }

    return alerts;
  }

  private calculateTradingPatternSimilarity(trades1: any[], trades2: any[]): number {
    // Simple similarity calculation based on:
    // 1. Asset preferences
    // 2. Trade timing patterns
    // 3. Volume patterns

    const assets1 = new Set(trades1.map(t => t.asset));
    const assets2 = new Set(trades2.map(t => t.asset));
    
    // Asset overlap
    const assetOverlap = [...assets1].filter(asset => assets2.has(asset)).length;
    const assetSimilarity = assetOverlap / Math.max(assets1.size, assets2.size);

    // Volume pattern similarity
    const volumes1 = trades1.map(t => Number(t.totalValue));
    const volumes2 = trades2.map(t => Number(t.totalValue));
    
    const avgVol1 = volumes1.reduce((sum, v) => sum + v, 0) / volumes1.length;
    const avgVol2 = volumes2.reduce((sum, v) => sum + v, 0) / volumes2.length;
    
    const volumeSimilarity = 1 - Math.abs(avgVol1 - avgVol2) / Math.max(avgVol1, avgVol2);

    // Overall similarity (weighted average)
    return (assetSimilarity * 0.6 + volumeSimilarity * 0.4);
  }

  async createFlag(alertData: any, competitionId: string, userId: string) {
    const flag = await this.prisma.antiCheatFlag.create({
      data: {
        competitionId,
        userId,
        type: alertData.type,
        severity: alertData.severity,
        description: alertData.description,
        evidence: alertData.evidence,
        status: FlagStatus.PENDING,
      },
    });

    this.logger.warn(`Anti-cheat flag created: ${flag.id} for user ${userId} in competition ${competitionId}`);
    
    return flag;
  }

  async reviewFlag(flagId: string, reviewerId: string, action: string) {
    const flag = await this.prisma.antiCheatFlag.update({
      where: { id: flagId },
      data: {
        status: action === 'confirm' ? FlagStatus.CONFIRMED : FlagStatus.DISMISSED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        action,
      },
    });

    // If confirmed and high severity, consider disqualification
    if (flag.status === FlagStatus.CONFIRMED && (flag.severity === FlagSeverity.HIGH || flag.severity === FlagSeverity.CRITICAL)) {
      await this.prisma.competitionParticipant.update({
        where: {
          competitionId_userId: {
            competitionId: flag.competitionId,
            userId: flag.userId,
          },
        },
        data: {
          disqualified: true,
          disqualificationReason: `Anti-cheat violation: ${flag.description}`,
          status: 'DISQUALIFIED',
        },
      });
    }

    return flag;
  }

  async getFlagsForReview(competitionId?: string) {
    const where = competitionId ? { competitionId, status: FlagStatus.PENDING } : { status: FlagStatus.PENDING };
    
    return this.prisma.antiCheatFlag.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
        competition: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
