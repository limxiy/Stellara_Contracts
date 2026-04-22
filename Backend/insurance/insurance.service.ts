import { Injectable } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { PricingService } from './pricing.service';
import { PoolService } from './pool.service';
import { RiskType } from './enums/risk-type.enum';
import { Prisma } from '@prisma/client';

@Injectable()
export class InsuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly pools: PoolService,
  ) {}

  async purchasePolicy(userId: string, poolId: string, riskType: RiskType, coverageAmount: number) {
    const premium = this.pricing.calculatePremium(riskType, coverageAmount);
    await this.pools.lockCapital(poolId, coverageAmount);

    const policy = await this.prisma.insurancePolicy.create({
      data: {
        userId,
        poolId,
        riskType: riskType as any,
        premium: premium.toString(),
        coverageAmount: coverageAmount.toString(),
      },
    });

    return policy;
  }

  async getPoliciesByUser(userId: string) {
    return this.prisma.insurancePolicy.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPolicyById(policyId: string) {
    return this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
    });
  }
}
