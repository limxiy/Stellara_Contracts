import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();

    // Basic query logging (monitoring)
    this.$on('query', (e) => {
      console.log(`[DB QUERY] ${e.query}`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}