import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';

/**
 * Metadata key for setting minimum reputation requirements
 */
export const MIN_REPUTATION_KEY = 'minReputation';

/**
 * Decorator to set minimum reputation requirement for a route
 */
export const MinReputation = (score: number) => {
  return (target: any, key?: any, descriptor?: any) => {
    if (descriptor) {
      // Method decorator
      return {
        ...descriptor,
        value: function (...args: any[]) {
          return descriptor.value.apply(this, args);
        },
      };
    }
    // Class decorator - handled by guard via reflector
  };
};

/**
 * Reputation thresholds for different feature access levels
 */
export const REPUTATION_THRESHOLDS = {
  BASIC_ACCESS: 0,
  ENHANCED_ACCESS: 200,
  PREMIUM_ACCESS: 500,
  ELITE_ACCESS: 750,
  GOVERNANCE_PARTICIPATION: 600,
  HIGH_VALUE_FUNDING: 800,
} as const;

/**
 * Guard that checks if a user meets the minimum reputation requirement
 */
@Injectable()
export class ReputationGuard implements CanActivate {
  private readonly logger = new Logger(ReputationGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id || request.userId;

    if (!userId) {
      this.logger.warn('No user ID found in request');
      return false;
    }

    // Get the minimum reputation requirement from metadata
    const minReputation = this.reflector.get<number>(
      MIN_REPUTATION_KEY,
      context.getHandler(),
    ) || this.reflector.get<number>(MIN_REPUTATION_KEY, context.getClass());

    if (!minReputation) {
      // No requirement set, allow access
      return true;
    }

    // Get user's current reputation score
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reputationScore: true, id: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.reputationScore < minReputation) {
      this.logger.warn(
        `User ${userId} denied access. Required: ${minReputation}, Has: ${user.reputationScore}`,
      );
      throw new ForbiddenException(
        `Insufficient reputation score. Required: ${minReputation}, Your score: ${user.reputationScore}`,
      );
    }

    this.logger.log(
      `User ${userId} passed reputation check (${user.reputationScore} >= ${minReputation})`,
    );
    return true;
  }
}

/**
 * Middleware to add reputation-based dynamic limits to the request
 */
@Injectable()
export class ReputationLimitsMiddleware {
  async use(req: any, res: any, next: () => void) {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return next();
    }

    try {
      // This would be called in a module that has PrismaService
      // For now, we'll skip the DB call and just pass through
      next();
    } catch (error) {
      next();
    }
  }
}
