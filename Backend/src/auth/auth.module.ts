import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditModule } from '../audit/audit.module';
import { RbacService } from './rbac.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionService } from './session.service';
import { RbacGuard } from './guards/rbac.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RbacController } from './controllers/rbac.controller';
import { TokenController } from './controllers/token.controller';
import { SessionController } from './controllers/session.controller';

@Module({
  imports: [AuditModule],
  providers: [PrismaService, RbacService, RefreshTokenService, SessionService, RbacGuard, RateLimitGuard],
  controllers: [RbacController, TokenController, SessionController],
  exports: [RbacService, RefreshTokenService, SessionService, RbacGuard, RateLimitGuard],
})
export class AuthModule {}
