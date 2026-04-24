import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export enum MfaEnforcementLevel {
  OPTIONAL = 'OPTIONAL',
  RECOMMENDED = 'RECOMMENDED',
  REQUIRED = 'REQUIRED',
}

export interface MfaPolicy {
  level: MfaEnforcementLevel;
  routes?: string[];
  roles?: string[];
}

@Injectable()
export class MfaPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserMfaPolicy(userId: string): Promise<MfaPolicy> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaEnabled: true,
        mfaVerified: true,
        reputationLevel: true,
        trustScore: true,
      },
    });

    if (!user) {
      return { level: MfaEnforcementLevel.OPTIONAL };
    }

    if (user.reputationLevel === 'ADMIN' || user.reputationLevel === 'MODERATOR') {
      return { level: MfaEnforcementLevel.REQUIRED };
    }

    if (user.trustScore > 800) {
      return { level: MfaEnforcementLevel.RECOMMENDED };
    }

    return { level: MfaEnforcementLevel.OPTIONAL };
  }

  isMfaRequiredForRoute(policy: MfaPolicy, route: string): boolean {
    if (policy.level === MfaEnforcementLevel.REQUIRED) {
      return true;
    }

    if (policy.routes && policy.routes.some((r) => route.startsWith(r))) {
      return true;
    }

    return false;
  }

  shouldEnforceMfa(userId: string, route: string): Promise<boolean> {
    return this.getUserMfaPolicy(userId).then((policy) =>
      this.isMfaRequiredForRoute(policy, route),
    );
  }
}
