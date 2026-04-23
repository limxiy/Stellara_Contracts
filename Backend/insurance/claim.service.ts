import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { ClaimStatus } from '@prisma/client';

@Injectable()
export class ClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async submitClaim(policyId: string, claimAmount: number) {
    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new NotFoundException(`Policy ${policyId} not found`);
    }

    return this.prisma.claim.create({
      data: {
        policyId,
        poolId: policy.poolId,
        claimAmount: claimAmount,
        status: 'PENDING',
      },
    });
  }

  async assessClaim(claimId: string, status: ClaimStatus, payoutAmount?: number) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { policy: true },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status,
        payoutAmount: payoutAmount || (status === 'APPROVED' ? claim.claimAmount : 0),
      },
    });

    if (status === 'APPROVED' && claim.poolId) {
      // Logic to move capital from locked to paid could go here
    }

    return updatedClaim;
  }

  async getClaimsByPolicy(policyId: string) {
    return this.prisma.claim.findMany({
      where: { policyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
