import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import {
  CreateReinsuranceDto,
  UpdateReinsuranceDto,
  ReinsuranceClaimDto,
  SubmitReinsuranceClaimDto,
  SettleReinsuranceClaimDto,
  ReinsuranceQueryDto,
} from './dto/create-reinsurance.dto';

@Injectable()
export class ReinsuranceService {
  private readonly logger = new Logger(ReinsuranceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CONTRACT CRUD OPERATIONS
  // ==========================================

  async createContract(dto: CreateReinsuranceDto) {
    this.logger.log(`Creating reinsurance contract for pool: ${dto.poolId}`);

    // Validate pool exists
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: dto.poolId },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${dto.poolId} not found`);
    }

    // Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Calculate available coverage
    const availableCoverage = dto.coverageLimit;

    const contract = await this.prisma.reinsuranceContract.create({
      data: {
        poolId: dto.poolId,
        reinsurerName: dto.reinsurerName,
        reinsurerContact: dto.reinsurerContact || {},
        type: dto.type as any,
        coverageLimit: dto.coverageLimit,
        premiumRate: dto.premiumRate,
        deductible: dto.deductible || 0,
        attachmentPoint: dto.attachmentPoint || null,
        exhaustionPoint: dto.exhaustionPoint || null,
        startDate,
        endDate,
        status: 'ACTIVE',
        availableCoverage,
        terms: dto.terms || null,
        notes: dto.notes || null,
        metadata: dto.metadata || {},
      },
    });

    this.logger.log(`Reinsurance contract created: ${contract.id}`);
    return contract;
  }

  async getContractById(contractId: string) {
    const contract = await this.prisma.reinsuranceContract.findUnique({
      where: { id: contractId },
      include: {
        pool: true,
        claims: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Reinsurance contract ${contractId} not found`);
    }

    return contract;
  }

  async getContractsByPool(poolId: string, query?: ReinsuranceQueryDto) {
    const where: any = { poolId };

    if (query) {
      if (query.status && query.status !== 'ALL') {
        where.status = query.status;
      }
      if (query.type) {
        where.type = query.type;
      }
      if (query.minCoverageLimit) {
        where.coverageLimit = { gte: query.minCoverageLimit };
      }
      if (query.maxPremiumRate) {
        where.premiumRate = { lte: query.maxPremiumRate };
      }
    }

    return this.prisma.reinsuranceContract.findMany({
      where,
      include: {
        pool: true,
        _count: {
          select: { claims: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateContract(contractId: string, dto: UpdateReinsuranceDto) {
    await this.validateContractExists(contractId);

    this.logger.log(`Updating reinsurance contract: ${contractId}`);

    const contract = await this.prisma.reinsuranceContract.update({
      where: { id: contractId },
      data: {
        reinsurerName: dto.reinsurerName,
        reinsurerContact: dto.reinsurerContact,
        type: dto.type as any,
        coverageLimit: dto.coverageLimit,
        premiumRate: dto.premiumRate,
        deductible: dto.deductible,
        terms: dto.terms,
        notes: dto.notes,
        status: dto.status as any,
      },
    });

    return contract;
  }

  async cancelContract(contractId: string, reason?: string) {
    const contract = await this.validateContractExists(contractId);

    if (contract.status === 'CANCELLED') {
      throw new BadRequestException('Contract is already cancelled');
    }

    // Check for active claims
    const activeClaims = await this.prisma.reinsuranceClaim.count({
      where: {
        contractId,
        status: { in: ['PENDING', 'SUBMITTED_TO_REINSURER', 'UNDER_REVIEW'] },
      },
    });

    if (activeClaims > 0) {
      throw new BadRequestException(
        `Cannot cancel contract with ${activeClaims} active claims`,
      );
    }

    this.logger.log(`Cancelling reinsurance contract: ${contractId}`);

    return this.prisma.reinsuranceContract.update({
      where: { id: contractId },
      data: {
        status: 'CANCELLED',
        notes: reason ? `${contract.notes || ''}\nCancelled: ${reason}` : contract.notes,
      },
    });
  }

  // ==========================================
  // PREMIUM CALCULATION
  // ==========================================

  async calculatePremium(contractId: string, coverageAmount: number) {
    const contract = await this.validateContractExists(contractId);

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException('Contract is not active');
    }

    const coverageLimit = Number(contract.coverageLimit);
    const premiumRate = Number(contract.premiumRate);
    const deductible = Number(contract.deductible);

    // Check if coverage amount exceeds limit
    if (coverageAmount > coverageLimit) {
      throw new BadRequestException(
        `Coverage amount ${coverageAmount} exceeds contract limit ${coverageLimit}`,
      );
    }

    // Calculate premium based on contract type
    let premium = 0;
    switch (contract.type) {
      case 'QUOTA_SHARE':
        // Premium is percentage of coverage
        premium = coverageAmount * premiumRate;
        break;

      case 'EXCESS_OF_LOSS':
        // Premium based on excess layer
        const attachmentPoint = Number(contract.attachmentPoint || 0);
        if (coverageAmount <= attachmentPoint) {
          throw new BadRequestException(
            `Coverage amount ${coverageAmount} below attachment point ${attachmentPoint}`,
          );
        }
        const excessAmount = coverageAmount - attachmentPoint;
        premium = excessAmount * premiumRate;
        break;

      case 'SURPLUS':
        // Premium based on surplus share
        premium = coverageAmount * premiumRate * (1 - deductible / coverageAmount);
        break;

      case 'STOP_LOSS':
        // Premium for aggregate loss protection
        premium = coverageAmount * premiumRate;
        break;

      default:
        premium = coverageAmount * premiumRate;
    }

    // Apply deductible adjustment
    if (deductible > 0) {
      premium *= (1 - deductible / coverageAmount);
    }

    return {
      contractId,
      coverageAmount,
      premium: Math.round(premium * 100) / 100,
      premiumRate,
      deductible,
      calculationDate: new Date(),
    };
  }

  // ==========================================
  // CLAIM ROUTING & MANAGEMENT
  // ==========================================

  async createReinsuranceClaim(dto: ReinsuranceClaimDto) {
    this.logger.log(`Creating reinsurance claim for contract: ${dto.contractId}`);

    const contract = await this.validateContractExists(dto.contractId);

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException('Contract is not active');
    }

    // Validate claim amount
    const claimAmount = dto.claimAmount;
    const deductible = Number(contract.deductible);

    if (claimAmount <= deductible) {
      throw new BadRequestException(
        `Claim amount ${claimAmount} does not exceed deductible ${deductible}`,
      );
    }

    // Calculate recoverable amount
    const recoverableAmount = claimAmount - deductible;
    const availableCoverage = Number(contract.availableCoverage);

    if (recoverableAmount > availableCoverage) {
      throw new BadRequestException(
        `Recoverable amount ${recoverableAmount} exceeds available coverage ${availableCoverage}`,
      );
    }

    // Check if linked to original claim
    if (dto.originalClaimId) {
      const originalClaim = await this.prisma.claim.findUnique({
        where: { id: dto.originalClaimId },
      });

      if (!originalClaim) {
        throw new NotFoundException(`Original claim ${dto.originalClaimId} not found`);
      }
    }

    const reinsuranceClaim = await this.prisma.reinsuranceClaim.create({
      data: {
        contractId: dto.contractId,
        originalClaimId: dto.originalClaimId || null,
        claimAmount,
        requestedAmount: dto.requestedAmount,
        status: 'PENDING',
        supportingDocuments: dto.supportingDocuments || {},
        reinsurerNotes: dto.notes || null,
      },
      include: {
        contract: true,
      },
    });

    this.logger.log(`Reinsurance claim created: ${reinsuranceClaim.id}`);
    return reinsuranceClaim;
  }

  async submitToReinsurer(claimId: string, dto?: SubmitReinsuranceClaimDto) {
    const claim = await this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
      include: { contract: true },
    });

    if (!claim) {
      throw new NotFoundException(`Reinsurance claim ${claimId} not found`);
    }

    if (claim.status !== 'PENDING') {
      throw new BadRequestException(`Claim is not in PENDING status`);
    }

    this.logger.log(`Submitting reinsurance claim to reinsurer: ${claimId}`);

    return this.prisma.reinsuranceClaim.update({
      where: { id: claimId },
      data: {
        status: 'SUBMITTED_TO_REINSURER',
        submittedToReinsurerAt: new Date(),
        reinsurerNotes: dto?.reinsurerNotes || claim.reinsurerNotes,
      },
    });
  }

  async approveClaim(claimId: string, approvedAmount: number, notes?: string) {
    const claim = await this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
      include: { contract: true },
    });

    if (!claim) {
      throw new NotFoundException(`Reinsurance claim ${claimId} not found`);
    }

    if (!['SUBMITTED_TO_REINSURER', 'UNDER_REVIEW'].includes(claim.status)) {
      throw new BadRequestException(`Claim is not in reviewable status`);
    }

    this.logger.log(`Approving reinsurance claim: ${claimId}`);

    // Update contract's available coverage
    const newAvailableCoverage = Number(claim.contract.availableCoverage) - approvedAmount;

    await this.prisma.$transaction([
      this.prisma.reinsuranceClaim.update({
        where: { id: claimId },
        data: {
          status: 'APPROVED',
          approvedAmount,
          reinsurerResponseAt: new Date(),
          reinsurerNotes: notes || claim.reinsurerNotes,
        },
      }),
      this.prisma.reinsuranceContract.update({
        where: { id: claim.contractId },
        data: {
          availableCoverage: newAvailableCoverage,
          totalClaimsReceived: { increment: approvedAmount },
        },
      }),
    ]);

    return this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
      include: { contract: true },
    });
  }

  // ==========================================
  // SETTLEMENT WORKFLOW
  // ==========================================

  async settleClaim(claimId: string, dto: SettleReinsuranceClaimDto) {
    const claim = await this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
      include: { contract: true },
    });

    if (!claim) {
      throw new NotFoundException(`Reinsurance claim ${claimId} not found`);
    }

    if (claim.status !== 'APPROVED') {
      throw new BadRequestException('Claim must be approved before settlement');
    }

    this.logger.log(`Settling reinsurance claim: ${claimId}`);

    const paidAmount = dto.paidAmount || dto.approvedAmount;

    await this.prisma.$transaction([
      this.prisma.reinsuranceClaim.update({
        where: { id: claimId },
        data: {
          status: 'SETTLED',
          approvedAmount: dto.approvedAmount,
          paidAmount,
          settledAt: new Date(),
          reinsurerNotes: dto.reinsurerNotes || claim.reinsurerNotes,
        },
      }),
      this.prisma.reinsuranceContract.update({
        where: { id: claim.contractId },
        data: {
          totalClaimsPaid: { increment: paidAmount },
        },
      }),
    ]);

    // If linked to original claim, update it
    if (claim.originalClaimId) {
      await this.prisma.claim.update({
        where: { id: claim.originalClaimId },
        data: {
          payoutAmount: paidAmount,
          status: 'PAID',
          paidAt: new Date(),
        },
      });
    }

    return this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
      include: { contract: true },
    });
  }

  async rejectClaim(claimId: string, reason: string) {
    const claim = await this.prisma.reinsuranceClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Reinsurance claim ${claimId} not found`);
    }

    if (!['SUBMITTED_TO_REINSURER', 'UNDER_REVIEW'].includes(claim.status)) {
      throw new BadRequestException(`Claim is not in reviewable status`);
    }

    this.logger.log(`Rejecting reinsurance claim: ${claimId}`);

    return this.prisma.reinsuranceClaim.update({
      where: { id: claimId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reinsurerResponseAt: new Date(),
      },
    });
  }

  // ==========================================
  // COVERAGE TRACKING & ANALYTICS
  // ==========================================

  async getCoverageUtilization(contractId: string) {
    const contract = await this.validateContractExists(contractId);

    const coverageLimit = Number(contract.coverageLimit);
    const availableCoverage = Number(contract.availableCoverage);
    const usedCoverage = coverageLimit - availableCoverage;
    const utilizationRate = coverageLimit > 0 ? (usedCoverage / coverageLimit) * 100 : 0;

    // Get claim statistics
    const claims = await this.prisma.reinsuranceClaim.aggregate({
      where: { contractId },
      _count: true,
      _sum: {
        claimAmount: true,
        approvedAmount: true,
        paidAmount: true,
      },
      _avg: {
        claimAmount: true,
        approvedAmount: true,
      },
    });

    return {
      contractId,
      coverageLimit,
      availableCoverage,
      usedCoverage,
      utilizationRate,
      totalClaims: claims._count,
      totalClaimAmount: Number(claims._sum.claimAmount || 0),
      totalApprovedAmount: Number(claims._sum.approvedAmount || 0),
      totalPaidAmount: Number(claims._sum.paidAmount || 0),
      averageClaimAmount: Number(claims._avg.claimAmount || 0),
      averageApprovedAmount: Number(claims._avg.approvedAmount || 0),
    };
  }

  async getContractAnalytics(contractId: string) {
    const contract = await this.validateContractExists(contractId);

    const totalPremiumsPaid = Number(contract.totalPremiumsPaid);
    const totalClaimsPaid = Number(contract.totalClaimsPaid);
    const lossRatio = totalPremiumsPaid > 0 ? (totalClaimsPaid / totalPremiumsPaid) * 100 : 0;

    const claimsByStatus = await this.prisma.reinsuranceClaim.groupBy({
      by: ['status'],
      where: { contractId },
      _count: true,
      _sum: {
        claimAmount: true,
        paidAmount: true,
      },
    });

    return {
      contractId,
      reinsurerName: contract.reinsurerName,
      type: contract.type,
      lossRatio,
      totalPremiumsPaid,
      totalClaimsPaid,
      claimsByStatus: claimsByStatus.map((c: any) => ({
        status: c.status,
        count: c._count,
        totalClaimAmount: Number(c._sum.claimAmount || 0),
        totalPaidAmount: Number(c._sum.paidAmount || 0),
      })),
      contractPerformance: {
        isProfitable: lossRatio < 100,
        riskLevel: this.calculateRiskLevel(lossRatio),
      },
    };
  }

  async getActiveContractsByPool(poolId: string) {
    return this.prisma.reinsuranceContract.findMany({
      where: {
        poolId,
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      orderBy: { availableCoverage: 'desc' },
    });
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private async validateContractExists(contractId: string) {
    const contract = await this.prisma.reinsuranceContract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      throw new NotFoundException(`Reinsurance contract ${contractId} not found`);
    }

    return contract;
  }

  private calculateRiskLevel(lossRatio: number): string {
    if (lossRatio > 150) return 'CRITICAL';
    if (lossRatio > 100) return 'HIGH';
    if (lossRatio > 75) return 'MEDIUM';
    return 'LOW';
  }
}
