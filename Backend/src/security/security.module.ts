import { Module } from '@nestjs/common';
import { FlashLoanService } from './flash-loan.service';
import { SecurityController } from './forta-webhook.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [FlashLoanService, PrismaService],
  controllers: [SecurityController],
  exports: [FlashLoanService],
})
export class SecurityModule {}
