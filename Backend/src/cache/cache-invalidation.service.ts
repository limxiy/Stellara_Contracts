import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Cache Invalidation Rules Configuration
 * Defines what cache entries should be invalidated when specific entities change
 */
export interface CacheInvalidationRule {
  entityType: string;
  action: 'create' | 'update' | 'delete' | '*';
  tagsToInvalidate: string[];
  patternsToInvalidate?: string[];
  cascade?: boolean;
}

/**
 * Service responsible for managing cache invalidation rules and triggering invalidations
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  /**
   * Default cache invalidation rules per entity
   * Can be extended and customized per application needs
   */
  private readonly invalidationRules: Map<string, CacheInvalidationRule[]> = new Map([
    [
      'project',
      [
        {
          entityType: 'project',
          action: '*',
          tagsToInvalidate: ['projects:list', 'projects:trending', 'projects:featured'],
          patternsToInvalidate: ['project:*', 'project-details:*'],
          cascade: true,
        },
      ],
    ],
    [
      'user',
      [
        {
          entityType: 'user',
          action: '*',
          tagsToInvalidate: ['users:list', 'user:reputation*'],
          patternsToInvalidate: ['user:*', 'user-profile:*'],
          cascade: true,
        },
      ],
    ],
    [
      'contribution',
      [
        {
          entityType: 'contribution',
          action: '*',
          tagsToInvalidate: ['contributions:list', 'project:funding*'],
          patternsToInvalidate: ['contribution:*'],
          cascade: false,
        },
      ],
    ],
    [
      'notification',
      [
        {
          entityType: 'notification',
          action: '*',
          tagsToInvalidate: ['notifications:list', 'notifications:unread*'],
          patternsToInvalidate: ['notification:*'],
          cascade: false,
        },
      ],
    ],
    [
      'reputation',
      [
        {
          entityType: 'reputation',
          action: '*',
          tagsToInvalidate: ['reputation:scores', 'user:reputation*'],
          patternsToInvalidate: ['reputation:*'],
          cascade: true,
        },
      ],
    ],
    [
      'transaction',
      [
        {
          entityType: 'transaction',
          action: '*',
          tagsToInvalidate: ['transactions:list', 'balance:*'],
          patternsToInvalidate: ['transaction:*'],
          cascade: false,
        },
      ],
    ],
  ]);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Register a custom cache invalidation rule for an entity type
   */
  registerRule(entityType: string, rule: CacheInvalidationRule): void {
    if (!this.invalidationRules.has(entityType)) {
      this.invalidationRules.set(entityType, []);
    }
    this.invalidationRules.get(entityType)!.push(rule);
    this.logger.log(`Registered cache invalidation rule for ${entityType}`);
  }

  /**
   * Get all rules for an entity type
   */
  getRules(entityType: string): CacheInvalidationRule[] {
    return this.invalidationRules.get(entityType) || [];
  }

  /**
   * Invalidate cache based on entity change
   * @param entityType Type of entity that changed
   * @param entityId ID of the entity that changed
   * @param action Action performed (create, update, delete)
   * @param metadata Optional metadata about the change
   */
  async invalidate(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete' = 'update',
    metadata?: Record<string, any>,
  ): Promise<number> {
    let totalInvalidated = 0;

    const rules = this.getRules(entityType);
    if (!rules.length) {
      this.logger.debug(`No invalidation rules found for entity type: ${entityType}`);
      return 0;
    }

    for (const rule of rules) {
      // Check if rule applies to this action
      if (rule.action !== '*' && rule.action !== action) {
        continue;
      }

      // Invalidate by tags
      for (const tag of rule.tagsToInvalidate) {
        try {
          const invalidated = await this.cacheService.invalidateByTag(tag);
          totalInvalidated += invalidated;
        } catch (error) {
          this.logger.error(
            `Error invalidating tag ${tag} for ${entityType}:${entityId}`,
            error,
          );
        }
      }

      // Invalidate by patterns
      if (rule.patternsToInvalidate) {
        for (const pattern of rule.patternsToInvalidate) {
          try {
            // Replace placeholders
            const resolvedPattern = pattern
              .replace('{entityId}', entityId)
              .replace('{entityType}', entityType);
            await this.cacheService.delByPattern(resolvedPattern);
          } catch (error) {
            this.logger.error(
              `Error invalidating pattern ${pattern} for ${entityType}:${entityId}`,
              error,
            );
          }
        }
      }

      // Cascade invalidation to related entities if needed
      if (rule.cascade && metadata?.relatedEntities) {
        for (const related of metadata.relatedEntities) {
          await this.invalidate(related.entityType, related.entityId, action);
        }
      }
    }

    this.logger.log(
      `Cache invalidation complete for ${entityType}:${entityId} (action: ${action}). Invalidated ${totalInvalidated} entries.`,
    );

    return totalInvalidated;
  }

  /**
   * Batch invalidation for multiple entities
   */
  async invalidateBatch(
    entities: Array<{
      entityType: string;
      entityId: string;
      action?: 'create' | 'update' | 'delete';
      metadata?: Record<string, any>;
    }>,
  ): Promise<number> {
    let total = 0;
    for (const entity of entities) {
      total += await this.invalidate(
        entity.entityType,
        entity.entityId,
        entity.action || 'update',
        entity.metadata,
      );
    }
    return total;
  }

  /**
   * Clear entire cache invalidation rules (for testing)
   */
  clearRules(): void {
    this.invalidationRules.clear();
    this.logger.warn('All cache invalidation rules cleared');
  }

  /**
   * Get all registered rules
   */
  getAllRules(): Map<string, CacheInvalidationRule[]> {
    return new Map(this.invalidationRules);
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheService } from './cache.service';

/**
 * Cache Invalidation Rules Configuration
 * Defines what cache entries should be invalidated when specific entities change
 */
export interface CacheInvalidationRule {
  entityType: string;
  action: 'create' | 'update' | 'delete' | '*';
  tagsToInvalidate: string[];
  patternsToInvalidate?: string[];
  cascade?: boolean;
}

/**
 * Service responsible for managing cache invalidation rules and triggering invalidations
 */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  /**
   * Default cache invalidation rules per entity
   * Can be extended and customized per application needs
   */
  private readonly invalidationRules: Map<string, CacheInvalidationRule[]> = new Map([
    [
      'project',
      [
        {
          entityType: 'project',
          action: '*',
          tagsToInvalidate: ['projects:list', 'projects:trending', 'projects:featured'],
          patternsToInvalidate: ['project:*', 'project-details:*'],
          cascade: true,
        },
      ],
    ],
    [
      'user',
      [
        {
          entityType: 'user',
          action: '*',
          tagsToInvalidate: ['users:list', 'user:reputation*'],
          patternsToInvalidate: ['user:*', 'user-profile:*'],
          cascade: true,
        },
      ],
    ],
    [
      'contribution',
      [
        {
          entityType: 'contribution',
          action: '*',
          tagsToInvalidate: ['contributions:list', 'project:funding*'],
          patternsToInvalidate: ['contribution:*'],
          cascade: false,
        },
      ],
    ],
    [
      'notification',
      [
        {
          entityType: 'notification',
          action: '*',
          tagsToInvalidate: ['notifications:list', 'notifications:unread*'],
          patternsToInvalidate: ['notification:*'],
          cascade: false,
        },
      ],
    ],
    [
      'reputation',
      [
        {
          entityType: 'reputation',
          action: '*',
          tagsToInvalidate: ['reputation:scores', 'user:reputation*']:
          patternsToInvalidate: ['reputation:*'],
          cascade: true,
        },
      ],
    ],
    [
      'transaction',
      [
        {
          entityType: 'transaction',
          action: '*',
          tagsToInvalidate: ['transactions:list', 'balance:*'],
          patternsToInvalidate: ['transaction:*'],
          cascade: false,
        },
      ],
    ],
  ]);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Register a custom cache invalidation rule for an entity type
   */
  registerRule(entityType: string, rule: CacheInvalidationRule): void {
    if (!this.invalidationRules.has(entityType)) {
      this.invalidationRules.set(entityType, []);
    }
    this.invalidationRules.get(entityType)!.push(rule);
    this.logger.log(`Registered cache invalidation rule for ${entityType}`);
  }

  /**
   * Get all rules for an entity type
   */
  getRules(entityType: string): CacheInvalidationRule[] {
    return this.invalidationRules.get(entityType) || [];
  }

  /**
   * Invalidate cache based on entity change
   * @param entityType Type of entity that changed
   * @param entityId ID of the entity that changed
   * @param action Action performed (create, update, delete)
   * @param metadata Optional metadata about the change
   */
  async invalidate(
    entityType: string,
    entityId: string,
    action: 'create' | 'update' | 'delete' = 'update',
    metadata?: Record<string, any>,
  ): Promise<number> {
    let totalInvalidated = 0;

    const rules = this.getRules(entityType);
    if (!rules.length) {
      this.logger.debug(`No invalidation rules found for entity type: ${entityType}`);
      return 0;
    }

    for (const rule of rules) {
      // Check if rule applies to this action
      if (rule.action !== '*' && rule.action !== action) {
        continue;
      }

      // Invalidate by tags
      for (const tag of rule.tagsToInvalidate) {
        try {
          const invalidated = await this.cacheService.invalidateByTag(tag);
          totalInvalidated += invalidated;
        } catch (error) {
          this.logger.error(
            `Error invalidating tag ${tag} for ${entityType}:${entityId}`,
            error,
          );
        }
      }

      // Invalidate by patterns
      if (rule.patternsToInvalidate) {
        for (const pattern of rule.patternsToInvalidate) {
          try {
            // Replace placeholders
            const resolvedPattern = pattern
              .replace('{entityId}', entityId)
              .replace('{entityType}', entityType);
            await this.cacheService.delByPattern(resolvedPattern);
          } catch (error) {
            this.logger.error(
              `Error invalidating pattern ${pattern} for ${entityType}:${entityId}`,
              error,
            );
          }
        }
      }

      // Cascade invalidation to related entities if needed
      if (rule.cascade && metadata?.relatedEntities) {
        for (const related of metadata.relatedEntities) {
          await this.invalidate(related.entityType, related.entityId, action);
        }
      }
    }

    this.logger.log(
      `Cache invalidation complete for ${entityType}:${entityId} (action: ${action}). Invalidated ${totalInvalidated} entries.`,
    );

    return totalInvalidated;
  }

  /**
   * Batch invalidation for multiple entities
   */
  async invalidateBatch(
    entities: Array<{
      entityType: string;
      entityId: string;
      action?: 'create' | 'update' | 'delete';
      metadata?: Record<string, any>;
    }>,
  ): Promise<number> {
    let total = 0;
    for (const entity of entities) {
      total += await this.invalidate(
        entity.entityType,
        entity.entityId,
        entity.action || 'update',
        entity.metadata,
      );
    }
    return total;
  }

  /**
   * Clear entire cache invalidation rules (for testing)
   */
  clearRules(): void {
    this.invalidationRules.clear();
    this.logger.warn('All cache invalidation rules cleared');
  }

  /**
   * Get all registered rules
   */
  getAllRules(): Map<string, CacheInvalidationRule[]> {
    return new Map(this.invalidationRules);
  }
}
