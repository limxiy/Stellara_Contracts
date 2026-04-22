import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';

@Injectable()
export class PoolService {
  constructor(private readonly prisma: PrismaService) {}

  async createPool(name: string, initialCapital: number = 0) {
    const pool = await this.prisma.insurancePool.create({
      data: {
        name,
        capital: initialCapital.toString(),
        lockedCapital: '0',
      },
    });

    return pool;
  }

  async addCapital(poolId: string, amount: number) {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${poolId} not found`);
    }

    const updatedPool = await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        capital: (parseFloat(pool.capital.toString()) + amount).toString(),
      },
    });

    return updatedPool;
  }

  async lockCapital(poolId: string, amount: number) {
    const pool = await this.prisma.insurancePool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${poolId} not found`);
    }

    const updatedPool = await this.prisma.insurancePool.update({
      where: { id: poolId },
      data: {
        lockedCapital: (parseFloat(pool.lockedCapital.toString()) + amount).toString(),
      },
    });

    return updatedPool;
  }

  async getPoolById(poolId: string) {
    return this.prisma.insurancePool.findUnique({
      where: { id: poolId },
    });
  }

  async getAllPools() {
    return this.prisma.insurancePool.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
