import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { MfaService } from './mfa.service';
import { MfaPolicyService } from './mfa-policy.service';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(
    private readonly mfaService: MfaService,
    private readonly mfaPolicyService: MfaPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('User not authenticated');
    }

    const userId = user.id;
    const route = request.route?.path || request.path;

    const policy = await this.mfaPolicyService.getUserMfaPolicy(userId);
    const status = await this.mfaService.getMfaStatus(userId);

    if (!status.enabled || !status.verified) {
      if (this.mfaPolicyService.isMfaRequiredForRoute(policy, route)) {
        throw new UnauthorizedException(
          'Multi-factor authentication is required for this resource. Please enable MFA.',
        );
      }
      return true;
    }

    const mfaCode = request.headers['x-mfa-code'] as string;
    if (!mfaCode) {
      throw new UnauthorizedException('x-mfa-code header is required');
    }

    const valid = await this.mfaService.verifyToken(userId, mfaCode);
    if (!valid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    request.mfaVerified = true;
    return true;
  }
}
