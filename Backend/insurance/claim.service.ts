import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async createClaim(policyId: string, claimAmount: number) {
    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new NotFoundException(`Policy ${policyId} not found`);
    }

    const claim = await this.prisma.claim.create({
      data: {
        policyId,
        claimAmount: claimAmount.toString(),
        status: 'PENDING',
      },
    });

    return claim;
  }

  async assessClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    // Simplified automated assessment
    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: 'APPROVED',
        payoutAmount: claim.claimAmount,
      },
    });

    return updatedClaim;
  }

  async payClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: 'PAID',
      },
    });

    return updatedClaim;
  }

  async getClaimsByPolicy(policyId: string) {
    return this.prisma.claim.findMany({
      where: { policyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
