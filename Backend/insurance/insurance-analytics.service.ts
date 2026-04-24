import { Injectable } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';

@Injectable()
export class InsuranceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getClaimsRatio(timeRange?: { start: Date; end: Date }) {
    const where = this.getTimeRangeFilter(timeRange);

    const totalClaims = await this.prisma.claim.aggregate({
      where: { ...where, status: 'PAID' },
      _sum: { payoutAmount: true },
    });

    const totalPremiums = await this.prisma.insurancePolicy.aggregate({
      where,
      _sum: { premium: true },
    });

    const ratio = totalPremiums._sum.premium 
      ? Number(totalClaims._sum.payoutAmount || 0) / Number(totalPremiums._sum.premium)
      : 0;

    return {
      payouts: totalClaims._sum.payoutAmount || 0,
      premiums: totalPremiums._sum.premium || 0,
      ratio: ratio.toFixed(4),
    };
  }

  async getPoolPerformance(timeRange?: { start: Date; end: Date }) {
    const pools = await this.prisma.insurancePool.findMany();
    const performance = await Promise.all(
      pools.map(async (pool) => {
        const policies = await this.prisma.insurancePolicy.aggregate({
          where: { poolId: pool.id, ...this.getTimeRangeFilter(timeRange) },
          _count: true,
          _sum: { premium: true },
        });

        const payouts = await this.prisma.claim.aggregate({
          where: { 
            policy: { poolId: pool.id }, 
            status: 'PAID',
            ...this.getTimeRangeFilter(timeRange)
          },
          _sum: { payoutAmount: true },
        });

        return {
          poolId: pool.id,
          poolName: pool.name,
          policyCount: policies._count,
          totalRevenue: policies._sum.premium || 0,
          totalPayouts: payouts._sum.payoutAmount || 0,
          netProfit: Number(policies._sum.premium || 0) - Number(payouts._sum.payoutAmount || 0),
        };
      })
    );

    return performance;
  }

  async getRiskDistribution(timeRange?: { start: Date; end: Date }) {
    const distribution = await this.prisma.insurancePolicy.groupBy({
      by: ['riskType'],
      where: this.getTimeRangeFilter(timeRange),
      _count: true,
      _sum: { coverageAmount: true },
    });

    return distribution.map((d) => ({
      riskType: d.riskType,
      policyCount: d._count,
      totalExposure: d._sum.coverageAmount,
    }));
  }

  async getRevenue(timeRange?: { start: Date; end: Date }) {
    const revenue = await this.prisma.insurancePolicy.aggregate({
      where: this.getTimeRangeFilter(timeRange),
      _sum: { premium: true },
    });

    return {
      totalRevenue: revenue._sum.premium || 0,
    };
  }

  private getTimeRangeFilter(timeRange?: { start: Date; end: Date }) {
    if (!timeRange) return {};
    return {
      createdAt: {
        gte: timeRange.start,
        lte: timeRange.end,
      },
    };
  }
}
