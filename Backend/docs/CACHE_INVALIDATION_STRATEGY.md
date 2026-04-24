# Cache Invalidation Strategy

## Overview

This document describes the comprehensive cache invalidation system implemented in the Stellara Contracts Backend. The system ensures data consistency by automatically invalidating stale cache entries when underlying data changes.

## Problem Statement

Without a proper cache invalidation strategy, users will see outdated information until cache TTL expires:
- Stale project funding amounts
- Outdated reputation scores
- Incorrect notification counts
- Inconsistent data across pages

## Solution Architecture

### 1. Core Components

#### CacheService (`cache.service.ts`)
Extended Redis-based caching service with invalidation capabilities:
- **Tag-based invalidation**: Group related cache entries using tags
- **Entity-based invalidation**: Invalidate cache by entity type and ID
- **Pattern-based invalidation**: Delete keys matching specific patterns
- **Version-based invalidation**: Support for cache versioning
- **Metrics tracking**: Monitor cache hits, misses, and invalidations

#### CacheInvalidationService (`cache-invalidation.service.ts`)
Business logic layer managing cache invalidation rules:
- Pre-configured rules for common entities (project, user, contribution, notification, reputation)
- Rule registration for custom entities
- Cascade invalidation for related entities
- Batch invalidation support

#### CacheInvalidationInterceptor (`cache-invalidation.interceptor.ts`)
NestJS interceptor that automatically triggers cache invalidation based on decorators

### 2. Key Features

#### 2.1 Tag-Based Invalidation
Group cache entries logically and invalidate all related entries at once.

**Example:**
```typescript
// When storing project list
await cacheService.set('projects:all', projects, 300, ['projects:list', 'projects:trending']);

// Later, when project is updated, invalidate all related tags
await cacheService.invalidateByTag('projects:list');
```

#### 2.2 Entity-Based Invalidation
Invalidate cache by entity type and optional entity ID using consistent key patterns.

**Pattern:** `entity:{entityType}:{entityId}*`

```typescript
// Invalidate all cache for a specific project
await cacheService.invalidateByEntity('project', '123');

// Invalidate all project cache
await cacheService.invalidateByEntity('project');
```

#### 2.3 Pattern-Based Invalidation
Delete cache entries matching wildcard patterns.

```typescript
// Invalidate all user cache
await cacheService.delByPattern('user:*');

// Invalidate specific user's cache
await cacheService.delByPattern('user:123:*');
```

#### 2.4 Version-Based Invalidation
Support multiple versions of the same cache key for gradual migrations.

```typescript
// Create versioned keys
const v1Key = cacheService.getVersionedKey('config', 1);
const v2Key = cacheService.getVersionedKey('config', 2);

// Invalidate all versions when config changes
await cacheService.invalidateVersions('config');
```

#### 2.5 Cascade Invalidation
Automatically invalidate related entities when primary entity changes.

**Example:** When a project is updated:
- Invalidate project cache
- Invalidate related user reputation cache
- Invalidate trending/featured lists

### 3. Implementation Patterns

#### Pattern 1: Decorator-Based Invalidation

```typescript
import { InvalidateCacheTags, InvalidateCacheEntity } from '@backend/cache/cache.decorators';

@Injectable()
export class ProjectService {
  constructor(private readonly cache: CacheService) {}

  // Invalidate specific tags after update
  @InvalidateCacheTags(['projects:list', 'projects:trending'])
  async updateProject(id: string, data: UpdateProjectDto) {
    const project = await this.prisma.project.update({
      where: { id },
      data,
    });
    return project;
  }

  // Invalidate entity cache after delete
  @InvalidateCacheEntity('project', 'id', 'delete')
  async deleteProject(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
```

#### Pattern 2: Manual Invalidation Service Call

```typescript
@Injectable()
export class ContributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async createContribution(data: CreateContributionDto) {
    const contribution = await this.prisma.contribution.create({ data });

    // Invalidate related cache
    await this.cacheInvalidation.invalidate(
      'contribution',
      contribution.id,
      'create',
      {
        relatedEntities: [
          { entityType: 'project', entityId: contribution.projectId },
        ],
      },
    );

    return contribution;
  }
}
```

#### Pattern 3: Custom Invalidation Rules

```typescript
// In your module initialization
export class MyModule implements OnModuleInit {
  constructor(private readonly cacheInvalidation: CacheInvalidationService) {}

  onModuleInit() {
    this.cacheInvalidation.registerRule('customEntity', {
      entityType: 'customEntity',
      action: 'update',
      tagsToInvalidate: ['custom:list', 'custom:trending'],
      patternsToInvalidate: ['custom:*', 'custom-details:*'],
      cascade: true,
    });
  }
}
```

#### Pattern 4: Cache-Aside with Tags

```typescript
async getProjectWithFunding(projectId: string) {
  const cacheKey = `project-funding:${projectId}`;
  const tags = ['project:funding', `project:${projectId}`];

  return this.cache.getOrSet(
    cacheKey,
    () => this.calculateProjectFunding(projectId),
    300, // 5 minutes TTL
    tags,
  );
}
```

#### Pattern 5: Batch Invalidation

For operations affecting multiple entities, use batch invalidation:

```typescript
async bulkUpdateProjects(projectIds: string[]) {
  // ... perform updates ...

  // Batch invalidate all affected projects
  await this.cacheInvalidation.invalidateBatch(
    projectIds.map(id => ({
      entityType: 'project',
      entityId: id,
      action: 'update',
    })),
  );
}
```

### 4. Cache Invalidation Rules

Pre-configured rules ensure consistent invalidation across entities:

| Entity Type | Actions | Tags Invalidated | Patterns | Cascade |
|-------------|---------|------------------|----------|---------|
| project | * | projects:list, projects:trending, projects:featured | project:*, project-details:* | Yes |
| user | * | users:list, user:reputation* | user:*, user-profile:* | Yes |
| contribution | * | contributions:list, project:funding* | contribution:* | No |
| notification | * | notifications:list, notifications:unread* | notification:* | No |
| reputation | * | reputation:scores, user:reputation* | reputation:* | Yes |
| transaction | * | transactions:list, balance:* | transaction:* | No |

## API Endpoints

### Invalidate by Tags
```
POST /cache/invalidate/tags
Body: { "tags": ["projects:list", "projects:trending"] }
Response: { "invalidatedCount": 45 }
```

### Invalidate by Entity
```
POST /cache/invalidate/entity
Body: { "entityType": "project", "entityId": "123" }
Response: { "invalidatedCount": 12 }
```

### Invalidate by Pattern
```
POST /cache/invalidate/pattern
Body: { "pattern": "user:*" }
Response: { "invalidatedCount": 0 }
```

### Batch Invalidation
```
POST /cache/invalidate/batch
Body: {
  "entities": [
    { "entityType": "project", "entityId": "123", "action": "update" },
    { "entityType": "user", "entityId": "456", "action": "delete" }
  ]
}
Response: { "invalidatedCount": 28 }
```

### Get Metrics
```
GET /cache/metrics
Response: {
  "hits": 1250,
  "misses": 187,
  "sets": 245,
  "invalidations": 89,
  "tagInvalidations": 34,
  "versionInvalidations": 2,
  "errors": 0
}
```

### Get Cache Rules
```
GET /cache/rules/project
Response: [
  {
    "entityType": "project",
    "action": "*",
    "tagsToInvalidate": ["projects:list", "projects:trending", "projects:featured"],
    "patternsToInvalidate": ["project:*", "project-details:*"],
    "cascade": true
  }
]
```

## Events

Cache invalidation emits the following events that can be listened to:

```typescript
// Listen for cache operations
eventEmitter.on('cache.set', ({ key, tags }) => {
  logger.log(`Cache set: ${key} with tags: ${tags.join(', ')}`);
});

eventEmitter.on('cache.invalidate', ({ key }) => {
  logger.log(`Cache invalidated: ${key}`);
});

eventEmitter.on('cache.tag-invalidated', ({ tag, count }) => {
  logger.log(`Tag ${tag} invalidated. ${count} entries removed`);
});

eventEmitter.on('cache.entity-invalidated', ({ entityType, entityId, count }) => {
  logger.log(`Entity ${entityType}:${entityId} cache invalidated. ${count} entries removed`);
});

eventEmitter.on('cache.cleared', () => {
  logger.warn('Entire cache cleared');
});
```

## Metrics

The cache service tracks the following metrics:

- **hits**: Number of successful cache hits
- **misses**: Number of cache misses
- **sets**: Number of cache sets
- **invalidations**: Total number of individual cache entries invalidated
- **tagInvalidations**: Number of tag-based invalidation operations
- **versionInvalidations**: Number of version-based invalidation operations
- **errors**: Number of cache operation errors

Access metrics via:
```typescript
const metrics = cacheService.getMetrics();
console.log(`Cache hit rate: ${metrics.hits / (metrics.hits + metrics.misses)}`);
```

## Best Practices

### 1. Consistent Key Structure
Use consistent patterns for cache keys:
- Entity data: `entity:{type}:{id}`
- Lists: `{entity}:list`
- Aggregates: `{entity}:stats`, `{entity}:summary`
- User-specific: `user:{userId}:{resource}`

### 2. Appropriate TTL Values
- Real-time data: 60-300 seconds
- Frequently accessed: 300-600 seconds
- Stable data: 1800-3600 seconds
- Static data: 3600+ seconds

### 3. Tag Organization
- Group related entries with meaningful tags
- Use hierarchical tags: `projects:list`, `projects:trending`, `projects:featured`
- Avoid over-tagging (trade-off between specificity and overhead)

### 4. Invalidation Strategy
- Invalidate on every mutation (create, update, delete)
- Use cascade invalidation for complex relationships
- Implement batch invalidation for bulk operations
- Consider eventual consistency for non-critical data

### 5. Error Handling
Cache invalidation failures should not break the main operation. The interceptor handles this automatically by catching and logging errors.

### 6. Performance Considerations
- Use entity-based invalidation for single entities
- Use tag-based invalidation for logical groups
- Use pattern-based invalidation sparingly (redis KEYS is blocking)
- Monitor cache metrics to identify optimization opportunities

## Troubleshooting

### Cache Not Invalidating
1. Verify the entity type matches configured rules
2. Check cache service logs for errors
3. Confirm Redis connection is active
4. Check if decorator is applied correctly

### High Cache Miss Rate
1. Review TTL values
2. Check if invalidation is too aggressive
3. Analyze access patterns
4. Consider pre-warming cache

### Memory Issues
1. Monitor Redis memory usage
2. Review TTL values (reduce if necessary)
3. Check for pattern-based invalidation overhead
4. Implement cache size limits

## Testing

Example test cases:

```typescript
describe('Cache Invalidation', () => {
  it('should invalidate by tag', async () => {
    const cache = app.get(CacheService);
    await cache.set('key1', 'value1', 300, ['tag1']);
    await cache.set('key2', 'value2', 300, ['tag1']);

    const count = await cache.invalidateByTag('tag1');
    expect(count).toBe(2);

    const val1 = await cache.get('key1');
    expect(val1).toBeNull();
  });

  it('should invalidate by entity', async () => {
    const cache = app.get(CacheService);
    const service = app.get(CacheInvalidationService);

    await service.invalidate('project', '123', 'update');
    // Verify cache entries are cleared
  });
});
```

## Migration Path

For existing applications without cache invalidation:

1. **Phase 1**: Implement CacheService with basic invalidation
2. **Phase 2**: Add invalidation rules for critical entities
3. **Phase 3**: Apply decorators to mutation endpoints
4. **Phase 4**: Implement custom rules for business logic
5. **Phase 5**: Fine-tune TTLs and invalidation strategy based on metrics

## References

- [Redis Key Patterns](https://redis.io/commands/KEYS/)
- [NestJS Caching](https://docs.nestjs.com/techniques/caching)
- [Event Emitter 2](https://github.com/EventEmitter2/EventEmitter2)
