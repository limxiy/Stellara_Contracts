import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { ExerciseGrantDto } from './dto/exercise-grant.dto';
import { EsopGrant, ExerciseStatus } from '@prisma/client';

@Injectable()
export class EsopService {
  constructor(private readonly prisma: PrismaService) {}

  async createGrant(data: CreateGrantDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: data.orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const employee = await this.prisma.user.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.prisma.esopGrant.create({
      data: {
        orgId: data.orgId,
        employeeId: data.employeeId,
        type: data.type,
        totalShares: data.totalShares,
        strikePrice: data.strikePrice,
        vestingPeriodMonths: data.vestingPeriodMonths,
        cliffPeriodMonths: data.cliffPeriodMonths,
        vestingFrequency: data.vestingFrequency,
        startDate: new Date(),
      },
    });
  }

  async getGrants(userId: string) {
    return this.prisma.esopGrant.findMany({
      where: { employeeId: userId },
      include: { organization: true, exercises: true },
    });
  }

  calculateVestedShares(grant: EsopGrant): number {
    const now = new Date();
    const monthsElapsed = (now.getFullYear() - grant.startDate.getFullYear()) * 12 + (now.getMonth() - grant.startDate.getMonth());
    
    if (monthsElapsed < grant.cliffPeriodMonths) {
      return 0; // Cliff not reached
    }

    if (monthsElapsed >= grant.vestingPeriodMonths) {
      return grant.totalShares; // Fully vested
    }

    // Monthly vesting after cliff
    return Math.floor((grant.totalShares / grant.vestingPeriodMonths) * monthsElapsed);
  }

  async exerciseGrant(grantId: string, data: ExerciseGrantDto, userId: string) {
    const grant = await this.prisma.esopGrant.findUnique({
      where: { id: grantId },
      include: { exercises: true, organization: true },
    });

    if (!grant) throw new NotFoundException('Grant not found');
    if (grant.employeeId !== userId) throw new BadRequestException('Not authorized to exercise this grant');

    // Exercise Window Check
    const now = new Date();
    if (grant.exerciseWindowStart && now < grant.exerciseWindowStart) {
      throw new BadRequestException(`Exercise window has not opened yet. Starts at ${grant.exerciseWindowStart}`);
    }
    if (grant.exerciseWindowEnd && now > grant.exerciseWindowEnd) {
      throw new BadRequestException(`Exercise window has closed at ${grant.exerciseWindowEnd}`);
    }

    const vestedShares = this.calculateVestedShares(grant);
    const exercisedShares = grant.exercises
      .filter(e => e.status === ExerciseStatus.COMPLETED)
      .reduce((sum, e) => sum + e.shares, 0);

    const availableShares = vestedShares - exercisedShares;

    if (data.sharesToExercise > availableShares) {
      throw new BadRequestException(`Cannot exercise ${data.sharesToExercise} shares. Only ${availableShares} shares available.`);
    }

    // Calculate Tax Withholdings (Simplified)
    let taxWithheld = 0;
    const currentValuation = grant.organization.valuation409A ? Number(grant.organization.valuation409A) : Number(grant.strikePrice);
    
    if (grant.type === 'NSO') {
      const spread = currentValuation - Number(grant.strikePrice);
      if (spread > 0) {
        taxWithheld = spread * data.sharesToExercise * 0.30;
      }
    } else if (grant.type === 'ISO') {
      taxWithheld = 0;
    }

    const exercisePrice = Number(grant.strikePrice) * data.sharesToExercise;

    return this.prisma.$transaction(async (tx) => {
      const exercise = await tx.esopExercise.create({
        data: {
          grantId,
          shares: data.sharesToExercise,
          exercisePrice: exercisePrice,
          taxWithheld: taxWithheld,
          status: ExerciseStatus.COMPLETED,
          executedAt: new Date(),
        },
      });

      const capTableEntry = await tx.capTableEntry.findUnique({
        where: { orgId_userId: { orgId: grant.orgId, userId } },
      });

      if (capTableEntry) {
        await tx.capTableEntry.update({
          where: { id: capTableEntry.id },
          data: { sharesOwned: capTableEntry.sharesOwned + data.sharesToExercise },
        });
      } else {
        await tx.capTableEntry.create({
          data: {
            orgId: grant.orgId,
            userId,
            sharesOwned: data.sharesToExercise,
          },
        });
      }

      return exercise;
    });
  }

  async update409AValuation(orgId: string, valuation: number, effectiveDate: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: orgId },
        data: { valuation409A: valuation },
      });

      return tx.valuationHistory.create({
        data: {
          orgId,
          valuation409A: valuation,
          effectiveDate,
        },
      });
    });
  }

  async mintOptionNFT(grantId: string) {
    const grant = await this.prisma.esopGrant.findUnique({
      where: { id: grantId },
      include: { employee: true, organization: true },
    });

    if (!grant) throw new NotFoundException('Grant not found');

    // Simulation of NFT minting
    return {
      grantId: grant.id,
      employee: grant.employee.walletAddress,
      organization: grant.organization.name,
      tokenId: `esop-nft-${grant.id}`,
      tokenUri: `https://stellara.io/esop/nft/${grant.id}`,
      mintedAt: new Date(),
      status: 'MINTED',
    };
  }

  async getCapTable(orgId: string) {
    return this.prisma.capTableEntry.findMany({
      where: { orgId },
      include: { user: { select: { id: true, walletAddress: true, email: true } } },
    });
  }
}
