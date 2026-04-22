import { Injectable } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';

@Injectable()
export class ReinsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  async createContract(poolId: string, coverageLimit: number, premiumRate: number) {
    const contract = await this.prisma.reinsuranceContract.create({
      data: {
        poolId,
        coverageLimit: coverageLimit.toString(),
        premiumRate: premiumRate.toString(),
      },
    });

    return contract;
  }

  async getContractsByPool(poolId: string) {
    return this.prisma.reinsuranceContract.findMany({
      where: { poolId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
