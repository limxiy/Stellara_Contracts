import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { FundingStatus } from '@prisma/client';

@Injectable()
export class RetroactiveFundingService {
  constructor(private prisma: PrismaService) {}

  async createRetroactiveFunding(data: {
    publicGoodsProjectId: string;
    evaluatorAddress: string;
    impactScore: number;
    fundingAmount: bigint;
    evaluationCriteria: any;
    supportingEvidence?: any;
  }) {
    // Validate project exists
    const project = await this.prisma.publicGoodsProject.findUnique({
      where: { id: data.publicGoodsProjectId },
    });

    if (!project) {
      throw new NotFoundException('Public goods project not found');
    }

    return this.prisma.retroactiveFunding.create({
      data: {
        ...data,
        status: FundingStatus.PENDING,
        evaluatedAt: new Date(),
      },
      include: {
        publicGoodsProject: true,
      },
    });
  }

  async evaluateProjectImpact(data: {
    publicGoodsProjectId: string;
    evaluatorAddress: string;
    impactScore: number;
    evaluationCriteria: any;
    supportingEvidence?: any;
  }) {
    const project = await this.prisma.publicGoodsProject.findUnique({
      where: { id: data.publicGoodsProjectId },
      include: {
        impactMetrics: true,
        retroactiveFunding: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Public goods project not found');
    }

    // Calculate impact score based on metrics and criteria
    const calculatedScore = await this.calculateImpactScore(
      project.impactMetrics,
      data.evaluationCriteria,
    );

    // Determine funding amount based on score
    const fundingAmount = await this.calculateFundingAmount(
      calculatedScore,
      data.evaluationCriteria,
    );

    return this.createRetroactiveFunding({
      ...data,
      impactScore: calculatedScore,
      fundingAmount,
    });
  }

  async approveFunding(fundingId: string, approverAddress: string) {
    const funding = await this.prisma.retroactiveFunding.findUnique({
      where: { id: fundingId },
    });

    if (!funding) {
      throw new NotFoundException('Retroactive funding not found');
    }

    if (funding.status !== FundingStatus.PENDING) {
      throw new BadRequestException('Only pending funding can be approved');
    }

    // Update status to approved
    const updatedFunding = await this.prisma.retroactiveFunding.update({
      where: { id: fundingId },
      data: { status: FundingStatus.APPROVED },
      include: {
        publicGoodsProject: true,
      },
    });

    // Here you would typically trigger the actual payment/transfer
    // For now, we'll mark it as paid for demonstration
    await this.markFundingAsPaid(fundingId);

    return updatedFunding;
  }

  async rejectFunding(fundingId: string, reason: string) {
    const funding = await this.prisma.retroactiveFunding.findUnique({
      where: { id: fundingId },
    });

    if (!funding) {
      throw new NotFoundException('Retroactive funding not found');
    }

    if (funding.status !== FundingStatus.PENDING) {
      throw new BadRequestException('Only pending funding can be rejected');
    }

    return this.prisma.retroactiveFunding.update({
      where: { id: fundingId },
      data: { 
        status: FundingStatus.REJECTED,
        evaluationCriteria: {
          ...funding.evaluationCriteria,
          rejectionReason: reason,
        },
      },
      include: {
        publicGoodsProject: true,
      },
    });
  }

  async markFundingAsPaid(fundingId: string) {
    return this.prisma.retroactiveFunding.update({
      where: { id: fundingId },
      data: { status: FundingStatus.PAID },
    });
  }

  async getPendingEvaluations() {
    return this.prisma.retroactiveFunding.findMany({
      where: { status: FundingStatus.PENDING },
      include: {
        publicGoodsProject: {
          include: {
            impactMetrics: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProjectFundingHistory(projectId: string) {
    return this.prisma.retroactiveFunding.findMany({
      where: { publicGoodsProjectId: projectId },
      include: {
        publicGoodsProject: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTopImpactProjects(limit: number = 10) {
    const projects = await this.prisma.publicGoodsProject.findMany({
      include: {
        retroactiveFunding: {
          where: { status: FundingStatus.APPROVED },
        },
        impactMetrics: true,
      },
    });

    // Calculate average impact scores and total funding
    const projectScores = projects.map(project => {
      const approvedFunding = project.retroactiveFunding;
      const avgScore = approvedFunding.length > 0
        ? approvedFunding.reduce((sum, f) => sum + Number(f.impactScore), 0) / approvedFunding.length
        : 0;
      const totalFunding = approvedFunding.reduce((sum, f) => sum + f.fundingAmount, BigInt(0));

      return {
        ...project,
        averageImpactScore: avgScore,
        totalRetroactiveFunding: totalFunding,
        evaluationCount: approvedFunding.length,
      };
    });

    // Sort by average impact score
    return projectScores
      .sort((a, b) => b.averageImpactScore - a.averageImpactScore)
      .slice(0, limit);
  }

  async getImpactReport(timeRange?: { start: Date; end: Date }) {
    const whereClause = timeRange
      ? {
          createdAt: {
            gte: timeRange.start,
            lte: timeRange.end,
          },
        }
      : {};

    const funding = await this.prisma.retroactiveFunding.findMany({
      where: {
        ...whereClause,
        status: FundingStatus.APPROVED,
      },
      include: {
        publicGoodsProject: true,
      },
    });

    const totalFunding = funding.reduce((sum, f) => sum + f.fundingAmount, BigInt(0));
    const avgImpactScore = funding.length > 0
      ? funding.reduce((sum, f) => sum + Number(f.impactScore), 0) / funding.length
      : 0;
    const projectsFunded = new Set(funding.map(f => f.publicGoodsProjectId)).size;

    return {
      totalRetroactiveFunding: totalFunding,
      averageImpactScore: avgScore,
      projectsFunded,
      evaluationsCount: funding.length,
      fundingByCategory: this.groupFundingByCategory(funding),
      monthlyTrends: await this.getMonthlyFundingTrends(timeRange),
    };
  }

  private async calculateImpactScore(
    metrics: any[],
    criteria: any,
  ): Promise<number> {
    // Implement impact score calculation logic
    // This is a simplified version - in practice, you'd have sophisticated scoring algorithms
    let score = 0;

    // Base score from metrics
    const metricsScore = metrics.reduce((sum, metric) => {
      const weight = criteria.metricWeights?.[metric.metricName] || 1;
      const value = parseFloat(metric.metricValue);
      return sum + (value * weight);
    }, 0);

    score += metricsScore;

    // Bonus factors
    if (criteria.bonuses) {
      if (criteria.bonuses.verifiedMetrics && metrics.every(m => m.verified)) {
        score += criteria.bonuses.verifiedMetrics;
      }
      if (criteria.bonuses.multipleEvaluators) {
        score += criteria.bonuses.multipleEvaluators;
      }
    }

    return Math.min(score, 100); // Cap at 100
  }

  private async calculateFundingAmount(
    impactScore: number,
    criteria: any,
  ): Promise<bigint> {
    // Calculate funding amount based on impact score and criteria
    const baseAmount = BigInt(criteria.baseAmount || 1000);
    const multiplier = BigInt(Math.floor((impactScore / 100) * 10)); // 0-10x multiplier
    
    return baseAmount * multiplier;
  }

  private groupFundingByCategory(funding: any[]) {
    const grouped = funding.reduce((acc, f) => {
      const category = f.publicGoodsProject.category;
      if (!acc[category]) {
        acc[category] = {
          totalFunding: BigInt(0),
          projectCount: 0,
          avgImpactScore: 0,
        };
      }
      acc[category].totalFunding += f.fundingAmount;
      acc[category].projectCount += 1;
      acc[category].avgImpactScore += Number(f.impactScore);
      return acc;
    }, {});

    // Calculate averages
    Object.values(grouped).forEach((category: any) => {
      category.avgImpactScore /= category.projectCount;
    });

    return grouped;
  }

  private async getMonthlyFundingTrends(timeRange?: { start: Date; end: Date }) {
    // Implementation for monthly funding trends
    // This would typically involve more complex date grouping logic
    return [];
  }
}
