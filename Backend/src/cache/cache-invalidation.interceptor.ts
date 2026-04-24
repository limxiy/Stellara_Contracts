import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import {
  CACHE_INVALIDATE_TAGS,
  CACHE_INVALIDATE_ENTITY,
} from './cache.decorators';
import { CacheInvalidationService } from './cache-invalidation.service';

/**
 * Interceptor that handles cache invalidation based on decorators
 * Applied globally to automatically invalidate cache after method execution
 */
@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInvalidationInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(async (result) => {
        try {
          const handler = context.getHandler();

          // Check for tag invalidation
          const tagsToInvalidate = this.reflector.get<string[]>(
            CACHE_INVALIDATE_TAGS,
            handler,
          );
          if (tagsToInvalidate && tagsToInvalidate.length > 0) {
            await this.cacheInvalidationService.cacheService.invalidateByTags(
              tagsToInvalidate,
            );
            this.logger.log(
              `Cache tags invalidated: ${tagsToInvalidate.join(', ')}`,
            );
          }

          // Check for entity invalidation
          const entityInvalidation = this.reflector.get<{
            entityType: string;
            entityIdParam: string;
            action: 'create' | 'update' | 'delete';
          }>(CACHE_INVALIDATE_ENTITY, handler);

          if (entityInvalidation) {
            const request = context.switchToHttp().getRequest();
            const entityId =
              request.params[entityInvalidation.entityIdParam] ||
              request.body?.[entityInvalidation.entityIdParam];

            if (entityId) {
              await this.cacheInvalidationService.invalidate(
                entityInvalidation.entityType,
                entityId,
                entityInvalidation.action,
              );
              this.logger.log(
                `Cache for ${entityInvalidation.entityType}:${entityId} invalidated`,
              );
            }
          }
        } catch (error) {
          this.logger.error('Cache invalidation error:', error);
          // Don't throw - let the response go through even if cache invalidation fails
        }
      }),
    );
  }
}

// Note: CacheInvalidationService is accessed via cacheService property
// This will be properly injected in the module configuration
