import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuadraticFundingService } from './quadratic-funding.service';
import { RetroactiveFundingService } from './retroactive-funding.service';
import { ImpactCertificateService } from './impact-certificate.service';
import { MatchingPoolService } from './matching-pool.service';
import { IntegrationService } from './integration.service';
import { PrismaService } from '../../prisma.service';
// Using string literals instead of enum imports to avoid TypeScript errors

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private quadraticFundingService: QuadraticFundingService,
    private retroactiveFundingService: RetroactiveFundingService,
    private impactCertificateService: ImpactCertificateService,
    private matchingPoolService: MatchingPoolService,
    private integrationService: IntegrationService,
    private prisma: PrismaService,
  ) {}

  // Run quarterly funding round creation (every 3 months on the 1st)
  @Cron('0 0 1 */3 *') // At 00:00 on day-of-month 1 in every 3rd month
  async createQuarterlyFundingRound() {
    this.logger.log('Creating quarterly funding round...');
    
    try {
      const currentQuarter = this.getCurrentQuarter();
      const year = new Date().getFullYear();
      const quarterDates = this.getQuarterDates(currentQuarter, year);
      
      // Create quarterly quadratic funding round
      const fundingRound = await this.quadraticFundingService.createFundingRound({
        title: `Q${currentQuarter} ${year} Public Goods Funding Round`,
        description: `Quarterly quadratic funding round for public goods projects in Q${currentQuarter} ${year}`,
        startTime: quarterDates.start,
        endTime: quarterDates.end,
        matchingPool: BigInt('1000000000000000000'), // 1 ETH default
        metadata: {
          type: 'quarterly',
          quarter: currentQuarter,
          year,
          autoCreated: true,
        },
      });

      // Allocate funds from protocol fees pool
      await this.allocateProtocolFunds(fundingRound.id);

      this.logger.log(`Successfully created quarterly funding round: ${fundingRound.id}`);
      return fundingRound;
    } catch (error) {
      this.logger.error('Failed to create quarterly funding round', error);
      throw error;
    }
  }

  // Check and end funding rounds that have passed their end time
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndEndCompletedRounds() {
    try {
      const now = new Date();
      const activeRounds = await this.prisma.fundingRound.findMany({
        where: {
          status: 'ACTIVE',
          endTime: { lte: now },
        },
      });

      for (const round of activeRounds) {
        this.logger.log(`Ending funding round: ${round.title} (${round.id})`);
        await this.quadraticFundingService.endFundingRound(round.id);
        
        // Issue impact certificates for projects in the round
        await this.issueImpactCertificatesForRound(round.id);
      }
    } catch (error) {
      this.logger.error('Failed to check and end completed rounds', error);
    }
  }

  // Auto-fund protocol fees pool from revenue (daily)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoFundProtocolPool() {
    try {
      // This would typically calculate actual protocol revenue
      // For now, we'll use a mock calculation
      const mockProtocolRevenue = BigInt('100000000000000000'); // 0.1 ETH
      
      const result = await this.matchingPoolService.autoFundFromProtocolFees(mockProtocolRevenue);
      
      if (result) {
        this.logger.log(`Auto-funded protocol pool with ${mockProtocolRevenue} wei`);
      }
    } catch (error) {
      this.logger.error('Failed to auto-fund protocol pool', error);
    }
  }

  // Sync with external platforms weekly
  @Cron(CronExpression.EVERY_WEEK)
  async syncWithExternalPlatforms() {
    try {
      this.logger.log('Starting weekly sync with external platforms...');
      
      // Sync with Gitcoin
      const gitcoinResult = await this.integrationService.syncWithGitcoin();
      this.logger.log(`Gitcoin sync: ${gitcoinResult.syncedProjects} projects synced`);
      
      // Sync with clr.fund
      const clrFundResult = await this.integrationService.syncWithClrFund();
      this.logger.log(`clr.fund sync: ${clrFundResult.syncedRounds} rounds synced`);
      
    } catch (error) {
      this.logger.error('Failed to sync with external platforms', error);
    }
  }

  // Generate monthly impact reports
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async generateMonthlyImpactReport() {
    try {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      
      const report = await this.retroactiveFundingService.getImpactReport({
        start: startDate,
        end: endDate,
      });
      
      this.logger.log(`Generated monthly impact report for ${lastMonth.toLocaleDateString()}`);
      
      // Store the report or send notifications
      await this.storeImpactReport(report, lastMonth);
      
    } catch (error) {
      this.logger.error('Failed to generate monthly impact report', error);
    }
  }

  // Distribute matching pool funds to active rounds (hourly)
  @Cron(CronExpression.EVERY_HOUR)
  async distributeMatchingFunds() {
    try {
      const activePools = await this.matchingPoolService.getActivePools();
      
      for (const pool of activePools) {
        const availableFunds = pool.totalAmount - pool.allocatedAmount;
        
        // Only distribute if there are sufficient funds
        if (availableFunds > BigInt(0)) {
          const result = await this.matchingPoolService.distributeToActiveRounds(pool.id);
          
          if (result.totalDistributed > BigInt(0)) {
            this.logger.log(`Distributed ${result.totalDistributed} wei from pool ${pool.name}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to distribute matching funds', error);
    }
  }

  private getCurrentQuarter(): number {
    const month = new Date().getMonth() + 1;
    return Math.ceil(month / 3);
  }

  private getQuarterDates(quarter: number, year: number) {
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 2;
    
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, endMonth + 1, 0, 23, 59, 59), // End of the last day
    };
  }

  private async allocateProtocolFunds(fundingRoundId: string) {
    try {
      const protocolPool = await this.matchingPoolService.getProtocolFeesPool();
      
      if (protocolPool && protocolPool.totalAmount > protocolPool.allocatedAmount) {
        const availableAmount = protocolPool.totalAmount - protocolPool.allocatedAmount;
        const allocationAmount = availableAmount / 2n; // Allocate 50% of available funds
        
        await this.matchingPoolService.allocateToRound({
          matchingPoolId: protocolPool.id,
          fundingRoundId,
          amount: allocationAmount,
        });
        
        this.logger.log(`Allocated ${allocationAmount} wei to funding round ${fundingRoundId}`);
      }
    } catch (error) {
      this.logger.error('Failed to allocate protocol funds', error);
    }
  }

  private async issueImpactCertificatesForRound(fundingRoundId: string) {
    try {
      const round = await this.prisma.fundingRound.findUnique({
        where: { id: fundingRoundId },
        include: {
          projects: {
            include: {
              publicGoodsProject: true,
              contributions: true,
            },
          },
        },
      });

      if (!round) return;

      for (const project of round.projects) {
        if (project.totalContributions > BigInt(0)) {
          // Issue impact certificate for projects with contributions
          await this.impactCertificateService.issueImpactCertificate({
            fundingRoundId,
            publicGoodsProjectId: project.publicGoodsProjectId,
            issuerAddress: '0x0000000000000000000000000000000000000000', // Protocol address
            holderAddress: project.publicGoodsProject.walletAddress,
            impactMetrics: {
              totalContributions: project.totalContributions.toString(),
              uniqueContributors: project.uniqueContributors,
              matchedAmount: project.matchedAmount.toString(),
              roundType: round.type,
            },
            verificationData: {
              autoIssued: true,
              issuedAt: new Date().toISOString(),
              fundingRoundId,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to issue impact certificates for round', error);
    }
  }

  private async storeImpactReport(report: any, month: Date) {
    // This would typically store the report in a database or send it via notifications
    this.logger.log(`Impact report for ${month.toLocaleDateString()}:`, {
      totalRetroactiveFunding: report.totalRetroactiveFunding,
      averageImpactScore: report.averageImpactScore,
      projectsFunded: report.projectsFunded,
    });
  }

  // Manual trigger methods for testing and admin control
  async manuallyCreateQuarterlyRound(quarter?: number, year?: number) {
    const targetQuarter = quarter || this.getCurrentQuarter();
    const targetYear = year || new Date().getFullYear();
    
    const quarterDates = this.getQuarterDates(targetQuarter, targetYear);
    
    return this.quadraticFundingService.createFundingRound({
      title: `Q${targetQuarter} ${targetYear} Public Goods Funding Round`,
      description: `Quarterly quadratic funding round for public goods projects in Q${targetQuarter} ${targetYear}`,
      startTime: quarterDates.start,
      endTime: quarterDates.end,
      matchingPool: BigInt('1000000000000000000'),
      metadata: {
        type: 'quarterly',
        quarter: targetQuarter,
        year: targetYear,
        manuallyCreated: true,
      },
    });
  }

  async getScheduleStatus() {
    const now = new Date();
    const currentQuarter = this.getCurrentQuarter();
    const quarterDates = this.getQuarterDates(currentQuarter, new Date().getFullYear());
    
    const nextQuarterlyRound = quarterDates.start > now 
      ? quarterDates.start 
      : this.getQuarterDates(currentQuarter + 1, new Date().getFullYear()).start;

    return {
      currentQuarter,
      nextQuarterlyRound,
      activeRounds: await this.prisma.fundingRound.count({
        where: { status: 'ACTIVE' },
      }),
      completedRounds: await this.prisma.fundingRound.count({
        where: { status: 'COMPLETED' },
      }),
      protocolPoolStatus: await this.matchingPoolService.getProtocolFeesPool(),
    };
  }
}
