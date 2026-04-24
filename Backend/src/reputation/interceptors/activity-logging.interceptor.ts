import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma.service';
import { ReputationService } from '../../reputation/reputation.service';
import { ActivityType } from '../../reputation/reputation.constants';

/**
 * Activity weight configuration for different action types.
 * These weights determine the reputation value assigned to each activity.
 */
export const ACTIVITY_WEIGHTS: Record<string, { type: ActivityType; value: number }> = {
  PROJECT_COMPLETION: { type: ActivityType.PROJECT_COMPLETION, value: 100 },
  MILESTONE_COMPLETION: { type: ActivityType.MILESTONE_ACHIEVEMENT, value: 50 },
  CONTRIBUTION_MADE: { type: ActivityType.SUCCESSFUL_TRANSACTION, value: 30 },
  HELPFUL_COMMENT: { type: ActivityType.HELPFUL_COMMENT, value: 15 },
  SOCIAL_INTERACTION: { type: ActivityType.SOCIAL_INTERACTION, value: 10 },
};

/**
 * Interceptor that automatically logs reputation-affecting activities
 * for specific endpoints.
 * 
 * Usage: Add to controllers or methods that should trigger activity logging.
 */
@Injectable()
export class ActivityLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLoggingInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = request.route?.path || request.url;

    // Track the original response
    return next.handle().pipe(
      tap(async (data) => {
        try {
          const activity = this.determineActivity(route, data, request);
          
          if (activity) {
            await this.reputationService.recordActivity(
              activity.subjectId,
              activity.type,
              activity.value,
              activity.referenceId,
              activity.actorId,
            );
            
            this.logger.log(
              `Activity logged: ${activity.type} for user ${activity.subjectId} with value ${activity.value}`,
            );
          }
        } catch (error) {
          // Don't let activity logging failures break the main request
          this.logger.error(`Failed to log activity: ${error.message}`);
        }
      }),
    );
  }

  /**
   * Determine the activity type and metadata based on the route and response.
   */
  private determineActivity(
    route: string,
    response: any,
    request: any,
  ): { subjectId: string; type: ActivityType; value: number; referenceId?: string; actorId?: string } | null {
    // Project completion
    if (route.includes('/projects/:id/complete') && response?.status === 'COMPLETED') {
      return {
        subjectId: response.creatorId || request.userId,
        type: ActivityType.PROJECT_COMPLETION,
        value: ACTIVITY_WEIGHTS.PROJECT_COMPLETION.value,
        referenceId: response.id,
      };
    }

    // Milestone completion
    if (route.includes('/milestones/:id/complete') && response?.status === 'COMPLETED') {
      return {
        subjectId: response.creatorId || request.userId,
        type: ActivityType.MILESTONE_ACHIEVEMENT,
        value: ACTIVITY_WEIGHTS.MILESTONE_COMPLETION.value,
        referenceId: response.id,
      };
    }

    // Contribution made
    if (route.includes('/contributions') && request.method === 'POST') {
      return {
        subjectId: response.investorId || request.userId,
        type: ActivityType.SUCCESSFUL_TRANSACTION,
        value: ACTIVITY_WEIGHTS.CONTRIBUTION_MADE.value + Number(response.amount || 0) / 100,
        referenceId: response.id,
      };
    }

    // Social interaction (comment, review, etc.)
    if (route.includes('/comments') || route.includes('/reviews')) {
      if (request.method === 'POST') {
        return {
          subjectId: request.userId,
          type: ActivityType.SOCIAL_INTERACTION,
          value: ACTIVITY_WEIGHTS.SOCIAL_INTERACTION.value,
          referenceId: response?.id,
        };
      }
    }

    return null;
  }
}
