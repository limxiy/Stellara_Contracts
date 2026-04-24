import { Module } from '@nestjs/common';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { MfaGuard } from './mfa.guard';
import { MfaPolicyService } from './mfa-policy.service';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MfaController],
  providers: [MfaService, MfaGuard, MfaPolicyService],
  exports: [MfaService, MfaGuard, MfaPolicyService],
})
export class MfaModule {}
