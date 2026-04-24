import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class ValidationService {
  constructor(private prisma: PrismaService) {}

  @Cron('*/30 * * * * *') // every 30 seconds
  async validate() {
    const missions = await this.prisma.mission.findMany();

    for (const m of missions) {
      const chainState = await this.fakeChainCheck(m.id);

      if (chainState !== m.status) {
        console.log(`Mismatch: ${m.id}`);

        await this.prisma.mission.update({
          where: { id: m.id },
          data: { status: chainState },
        });
      }
    }
  }

  async fakeChainCheck(id: string) {
    return 'ACTIVE'; // replace with real blockchain call
  }
}