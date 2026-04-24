# Cache Invalidation Implementation Guide

## Quick Start

### Step 1: Install Dependencies

The required dependency has already been added to `package.json`:
```json
"@nestjs/event-emitter": "^2.0.4"
```

Run `npm install` or `pnpm install` to install.

### Step 2: Import Cache Module

In your `app.module.ts`:

```typescript
import { AppCacheModule } from './cache/cache.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    AppCacheModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### Step 3: Add Cache Invalidation to Services

#### Option A: Using Decorators (Recommended)

```typescript
import { Injectable } from '@nestjs/common';
import { InvalidateCacheTags, InvalidateCacheEntity } from '@backend/cache/cache.decorators';
import { CacheService } from '@backend/cache/cache.service';

@Injectable()
export class ProjectService {
  constructor(private readonly cache: CacheService) {}

  async getProject(id: string) {
    return this.cache.getOrSet(
      `project:${id}`,
      () => this.db.projects.findById(id),
      300,
      [`project:${id}`, 'projects:list']
    );
  }

  @InvalidateCacheTags(['projects:list', 'projects:trending'])
  @InvalidateCacheEntity('project', 'id', 'update')
  async updateProject(id: string, data: UpdateProjectDto) {
    return this.prisma.project.update({ where: { id }, data });
  }

  @InvalidateCacheEntity('project', 'id', 'delete')
  async deleteProject(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
```

#### Option B: Using Service Methods

```typescript
import { Injectable } from '@nestjs/common';
import { CacheInvalidationService } from '@backend/cache/cache-invalidation.service';

@Injectable()
export class ProjectService {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async updateProject(id: string, data: UpdateProjectDto) {
    const result = await this.prisma.project.update({ where: { id }, data });

    // Manual invalidation
    await this.cacheInvalidation.invalidate('project', id, 'update', {
      relatedEntities: [
        { entityType: 'reputation', entityId: data.ownerId },
      ],
    });

    return result;
  }
}
```

## Entity-Specific Implementation Examples

### Projects
```typescript
@Injectable()
export class ProjectService {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getAllProjects() {
    return this.cache.getOrSet(
      'projects:all',
      () => this.prisma.project.findMany(),
      600,
      ['projects:list', 'projects:trending'],
    );
  }

  @InvalidateCacheTags(['projects:list', 'projects:trending', 'projects:featured'])
  async updateProject(id: string, data: any) {
    const result = await this.prisma.project.update({ where: { id }, data });
    
    // Also invalidate individual project cache
    await this.cache.invalidateByEntity('project', id);
    
    return result;
  }
}
```

### Reputation Scores
```typescript
@Injectable()
export class ReputationService {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getUserReputation(userId: string) {
    return this.cache.getOrSet(
      `user:${userId}:reputation`,
      () => this.prisma.reputation.findUnique({
        where: { userId },
      }),
      300,
      [`user:${userId}`, 'reputation:scores'],
    );
  }

  @InvalidateCacheEntity('reputation', 'userId', 'update')
  async updateReputation(userId: string, score: number) {
    const result = await this.prisma.reputation.update({
      where: { userId },
      data: { score },
    });

    // Cascade: invalidate user profile cache too
    await this.cache.invalidateByEntity('user', userId);

    return result;
  }
}
```

### Notifications
```typescript
@Injectable()
export class NotificationService {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getUserNotifications(userId: string, limit = 20) {
    return this.cache.getOrSet(
      `user:${userId}:notifications`,
      () => this.prisma.notification.findMany({
        where: { userId },
        take: limit,
      }),
      60, // Real-time data: 1 minute
      ['notifications:list', `user:${userId}`],
    );
  }

  @InvalidateCacheTags(['notifications:list', 'notifications:unread:*'])
  async createNotification(userId: string, data: any) {
    const notification = await this.prisma.notification.create({
      data: { userId, ...data },
    });

    // Invalidate user-specific notification cache
    await this.cache.invalidateByPattern(`user:${userId}:notifications:*`);

    return notification;
  }

  @InvalidateCacheEntity('notification', 'id', 'update')
  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }
}
```

### Contributions & Funding
```typescript
@Injectable()
export class ContributionService {
  constructor(
    private readonly cache: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getProjectFunding(projectId: string) {
    return this.cache.getOrSet(
      `project:${projectId}:funding`,
      async () => {
        const contributions = await this.prisma.contribution.findMany({
          where: { projectId },
        });
        return contributions.reduce((sum, c) => sum + c.amount, 0);
      },
      300,
      [`project:${projectId}`, 'project:funding'],
    );
  }

  async createContribution(projectId: string, data: any) {
    const contribution = await this.prisma.contribution.create({
      data: { projectId, ...data },
    });

    // Complex invalidation with cascade
    await this.cacheInvalidation.invalidate(
      'contribution',
      contribution.id,
      'create',
      {
        relatedEntities: [
          { entityType: 'project', entityId: projectId },
          { entityType: 'user', entityId: data.userId },
        ],
      },
    );

    return contribution;
  }
}
```

## Monitoring Cache Health

### Check Metrics Periodically

```typescript
@Injectable()
export class CacheHealthService {
  constructor(
    private readonly cache: CacheService,
    private readonly logger: Logger,
  ) {}

  @Cron('0 * * * *') // Every hour
  async checkCacheHealth() {
    const metrics = this.cache.getMetrics();
    const hitRate = metrics.hits / (metrics.hits + metrics.misses) || 0;

    this.logger.log(`Cache Hit Rate: ${(hitRate * 100).toFixed(2)}%`);
    this.logger.log(`Invalidations: ${metrics.invalidations}`);
    this.logger.log(`Errors: ${metrics.errors}`);

    if (hitRate < 0.5) {
      this.logger.warn('Low cache hit rate detected');
    }

    if (metrics.errors > 100) {
      this.logger.error('High cache error rate detected');
    }
  }
}
```

### Monitor via Prometheus Endpoint

Cache metrics are available at: `GET /metrics`

```
cache_hits_total{cache="default"} 1250
cache_misses_total{cache="default"} 187
```

## Best Practices Checklist

- [ ] Use consistent cache key naming patterns
- [ ] Set appropriate TTL values for each type of data
- [ ] Apply decorators to all mutation methods
- [ ] Register custom rules for custom entities
- [ ] Test cache invalidation in unit tests
- [ ] Monitor cache metrics in production
- [ ] Document cache keys used in your service
- [ ] Use tags to group related cache entries
- [ ] Implement cascade invalidation for complex relationships
- [ ] Handle cache errors gracefully
- [ ] Review cache hit rates regularly
- [ ] Optimize TTL values based on metrics

## Common Patterns

### Pattern: Real-Time Data with Short TTL
For data that must be fresh (notifications, unread counts):
```typescript
// 60 second TTL
await cache.set(key, value, 60, tags);
```

### Pattern: Stable Data with Long TTL
For data that changes rarely (settings, configurations):
```typescript
// 1 hour TTL
await cache.set(key, value, 3600, tags);
```

### Pattern: Bulk Operations
For operations affecting many entities:
```typescript
const updates = [...]; // Array of entity updates

for (const update of updates) {
  await this.update(update);
}

// Single batch invalidation
await cacheInvalidation.invalidateBatch(
  updates.map(u => ({
    entityType: 'project',
    entityId: u.id,
    action: 'update',
  }))
);
```

### Pattern: Cascade Invalidation
For complex relationships:
```typescript
await cacheInvalidation.invalidate('project', projectId, 'update', {
  relatedEntities: [
    { entityType: 'funding', entityId: projectId },
    { entityType: 'reputation', entityId: ownerId },
  ],
});
```

## Testing

Run the cache invalidation tests:
```bash
npm run test -- test/cache-invalidation.spec.ts
```

## Troubleshooting

### Cache entries not being invalidated
1. Check if Redis is running and connected
2. Verify decorator is applied to the method
3. Check logs for cache service errors
4. Verify entity type matches configured rules

### High memory usage
1. Review TTL values (reduce them)
2. Check for pattern-based invalidation overhead
3. Monitor Redis with `redis-cli INFO memory`
4. Consider implementing cache size limits

### Low cache hit rate
1. Check if invalidation is too aggressive
2. Review TTL values (increase them)
3. Analyze access patterns
4. Consider pre-warming cache for hot data

## Support

For issues or questions, refer to:
- [Cache Invalidation Strategy Guide](./CACHE_INVALIDATION_STRATEGY.md)
- [Example Implementations](./cache-examples.service.ts)
- [Test Suite](../test/cache-invalidation.spec.ts)
