/**
 * Cache Invalidation Implementation Examples
 *
 * This file demonstrates practical examples of how to implement
 * cache invalidation across different service types.
 */

import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import {
  InvalidateCacheTags,
  InvalidateCacheEntity,
  CacheTags,
  Cacheable,
} from './cache.decorators';

/**
 * Example 1: Project Service with Automatic Cache Invalidation
 */
@Injectable()
export class ProjectServiceExample {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Get all projects with caching
   * Cached with tags for easy invalidation
   */
  async getAllProjects() {
    const cacheKey = 'projects:all';
    const tags = ['projects:list', 'projects:trending', 'projects:featured'];

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Database query here
        return [
          { id: '1', name: 'Project 1', funding: 1000 },
          { id: '2', name: 'Project 2', funding: 2000 },
        ];
      },
      600, // 10 minutes
      tags,
    );
  }

  /**
   * Get specific project - uses entity-based caching
   */
  async getProject(id: string) {
    const cacheKey = `entity:project:${id}`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Database query here
        return { id, name: 'Project', funding: 1000 };
      },
      300, // 5 minutes
      [`project:${id}`, 'projects:list'],
    );
  }

  /**
   * Update project - automatic cache invalidation via decorator
   */
  @InvalidateCacheTags(['projects:list', 'projects:trending'])
  @InvalidateCacheEntity('project', 'id', 'update')
  async updateProject(id: string, data: any) {
    // Database update here
    const updated = { id, ...data };

    // Additional manual invalidation if needed
    await this.cacheInvalidation.invalidate('project', id, 'update', {
      relatedEntities: [
        // If project relates to user reputation, invalidate that too
        { entityType: 'reputation', entityId: data.ownerId },
      ],
    });

    return updated;
  }

  /**
   * Delete project - automatic cache invalidation
   */
  @InvalidateCacheTags(['projects:list', 'projects:trending', 'projects:featured'])
  @InvalidateCacheEntity('project', 'id', 'delete')
  async deleteProject(id: string) {
    // Database delete here
    return { success: true, id };
  }

  /**
   * Bulk update projects
   */
  async bulkUpdateProjects(
    updates: Array<{ id: string; data: any }>,
  ) {
    const results = [];

    for (const { id, data } of updates) {
      results.push(await this.updateProject(id, data));
    }

    // Batch invalidation
    await this.cacheInvalidation.invalidateBatch(
      updates.map(u => ({
        entityType: 'project',
        entityId: u.id,
        action: 'update',
      })),
    );

    return results;
  }
}

/**
 * Example 2: User Service with Reputation Cache
 */
@Injectable()
export class UserServiceExample {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Get user with reputation score
   */
  async getUserWithReputation(userId: string) {
    const cacheKey = `user:${userId}:reputation`;
    const tags = [`user:${userId}`, 'user:reputation:all'];

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const user = {};
        const reputation = 85;
        return { ...user, reputation };
      },
      300,
      tags,
    );
  }

  /**
   * Update user reputation
   */
  @InvalidateCacheEntity('reputation', 'userId', 'update')
  async updateReputation(userId: string, newScore: number) {
    // Database update
    const updated = { userId, score: newScore };

    // Invalidate related user cache
    await this.cache.invalidateByEntity('user', userId);

    return updated;
  }

  /**
   * Get user profile with all related data
   */
  async getUserProfile(userId: string) {
    const versionKey = this.cache.getVersionedKey(
      `user-profile:${userId}`,
      1,
    );

    return this.cache.getOrSet(
      versionKey,
      async () => {
        const [user, reputation, contributions] = await Promise.all([
          this.getUser(userId),
          this.getReputation(userId),
          this.getContributions(userId),
        ]);
        return { user, reputation, contributions };
      },
      600,
      [`user:${userId}`, 'user:profiles'],
    );
  }

  private async getUser(userId: string) {
    return {};
  }

  private async getReputation(userId: string) {
    return 0;
  }

  private async getContributions(userId: string) {
    return [];
  }
}

/**
 * Example 3: Notification Service with List Caching
 */
@Injectable()
export class NotificationServiceExample {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Get unread notifications for user
   */
  async getUnreadNotifications(userId: string) {
    const cacheKey = `user:${userId}:notifications:unread`;
    const tags = ['notifications:unread', `user:${userId}`, 'notifications:list'];

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return []; // Database query
      },
      60, // 1 minute for real-time data
      tags,
    );
  }

  /**
   * Create notification - automatic invalidation
   */
  @InvalidateCacheTags(['notifications:list', 'notifications:unread:*'])
  async createNotification(userId: string, data: any) {
    const notification = { id: '1', userId, ...data };

    // Invalidate user-specific notifications
    await this.cache.delByPattern(`user:${userId}:notifications:*`);

    return notification;
  }

  /**
   * Mark notification as read - automatic invalidation
   */
  @InvalidateCacheEntity('notification', 'id', 'update')
  async markAsRead(notificationId: string) {
    // Database update
    return { id: notificationId, read: true };
  }

  /**
   * Get notification count with versioning
   */
  async getUnreadCount(userId: string) {
    const version = 1; // Increment when schema changes
    const versionedKey = this.cache.getVersionedKey(
      `user:${userId}:unread-count`,
      version,
    );

    return this.cache.getOrSet(
      versionedKey,
      async () => {
        const notifications = await this.getUnreadNotifications(userId);
        return notifications.length;
      },
      120,
      ['notifications:counts', `user:${userId}`],
    );
  }
}

/**
 * Example 4: Contribution Service with Event-Driven Invalidation
 */
@Injectable()
export class ContributionServiceExample {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Get project funding amount
   */
  async getProjectFunding(projectId: string) {
    const cacheKey = `project:${projectId}:funding`;
    const tags = [`project:${projectId}`, 'project:funding'];

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return 10000; // Sum from database
      },
      300,
      tags,
    );
  }

  /**
   * Create contribution - with complex invalidation
   */
  async createContribution(projectId: string, contribution: any) {
    const created = { id: '1', projectId, ...contribution };

    // Invalidate project funding and lists
    await this.cacheInvalidation.invalidate('contribution', created.id, 'create', {
      relatedEntities: [
        {
          entityType: 'project',
          entityId: projectId,
        },
      ],
    });

    return created;
  }

  /**
   * Get contributions for project
   */
  async getProjectContributions(projectId: string, limit = 20) {
    const cacheKey = `project:${projectId}:contributions`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return []; // Database query
      },
      300,
      [`project:${projectId}`, 'contributions:list'],
    );
  }

  /**
   * Get user contributions
   */
  async getUserContributions(userId: string) {
    const cacheKey = `user:${userId}:contributions`;

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        return []; // Database query
      },
      300,
      [`user:${userId}`, 'contributions:list'],
    );
  }
}

/**
 * Example 5: Cache Consistency Verification
 * Run periodically to verify cache consistency
 */
@Injectable()
export class CacheConsistencyService {
  constructor(private readonly cache: CacheService) {}

  /**
   * Verify cache against database (periodic job)
   * This should run as a scheduled task
   */
  async verifyCacheConsistency(entityType: string, entityIds: string[]) {
    const issues = [];

    for (const id of entityIds) {
      const cacheKey = `entity:${entityType}:${id}`;

      // Get from cache
      const cached = await this.cache.get(cacheKey);

      // Get from database
      const dbValue = {}; // await this.db.find(entityType, id);

      // Compare
      if (JSON.stringify(cached) !== JSON.stringify(dbValue)) {
        issues.push({
          entityType,
          entityId: id,
          issue: 'Cache/database mismatch',
        });

        // Optionally invalidate the stale cache
        await this.cache.del(cacheKey);
      }
    }

    return issues;
  }
}
