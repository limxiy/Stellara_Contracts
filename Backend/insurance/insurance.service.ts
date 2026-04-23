import { Injectable } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { PricingService } from './pricing.service';
import { PoolService } from './pool.service';
import { RiskType } from '@prisma/client';
import { OracleService } from './oracle.service';

@Injectable()
export class InsuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly pools: PoolService,
    private readonly oracle: OracleService,
  ) {}

  async purchasePolicy(userId: string, poolId: string, riskType: RiskType, coverageAmount: number) {
    const premium = this.pricing.calculatePremium(riskType, coverageAmount);
    await this.pools.lockCapital(poolId, coverageAmount);

    return this.prisma.insurancePolicy.create({
      data: {
        userId,
        poolId,
        riskType: riskType,
        coverageAmount: coverageAmount,
        premium: premium,
        status: 'ACTIVE',
      },
    });
  }

  async checkParametricTrigger(policyId: string) {
    const isTriggered = await this.oracle.verifyTriggerCondition(policyId);
    
    if (isTriggered) {
      const policy = await this.prisma.insurancePolicy.findUnique({
        where: { id: policyId },
      });

      if (policy && policy.status === 'ACTIVE') {
        // Create an automated claim
        return this.prisma.claim.create({
          data: {
            policyId,
            poolId: policy.poolId,
            claimAmount: policy.coverageAmount,
            status: 'APPROVED', // Automated approval for parametric
          },
        });
      }
    }
    
    return null;
  }

  async getPoliciesByUser(userId: string) {
    return this.prisma.insurancePolicy.findMany({
      where: { userId },
      include: { pool: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPolicyById(policyId: string) {
    return this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
      include: { pool: true, claims: true },
    });
  }
}
