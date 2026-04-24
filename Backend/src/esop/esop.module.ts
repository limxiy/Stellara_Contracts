import { Module } from '@nestjs/common';
import { EsopService } from './esop.service';
import { EsopController } from './esop.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [EsopService, PrismaService],
  controllers: [EsopController],
  exports: [EsopService],
})
export class EsopModule {}
