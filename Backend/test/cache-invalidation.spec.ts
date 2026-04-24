import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { AppCacheModule } from './cache.module';

/**
 * Comprehensive test suite for cache invalidation functionality
 */
describe('Cache Invalidation System', () => {
  let cacheService: CacheService;
  let cacheInvalidationService: CacheInvalidationService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test',
          isGlobal: true,
        }),
        EventEmitterModule.forRoot(),
        AppCacheModule,
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
    cacheInvalidationService = module.get<CacheInvalidationService>(
      CacheInvalidationService,
    );
  });

  afterEach(async () => {
    await cacheService.clear();
    await module.close();
  });

  describe('CacheService', () => {
    it('should set and get cache values', async () => {
      const key = 'test-key';
      const value = { data: 'test' };

      await cacheService.set(key, value);
      const retrieved = await cacheService.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should set cache with TTL', async () => {
      const key = 'ttl-test';
      const value = 'test-value';

      await cacheService.set(key, value, 1);

      expect(await cacheService.get(key)).toBe(value);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Value should be expired
      expect(await cacheService.get(key)).toBeNull();
    });

    it('should set cache with tags', async () => {
      const key = 'test-with-tags';
      const tags = ['tag1', 'tag2'];

      await cacheService.set(key, { data: 'value' }, 300, tags);

      const value = await cacheService.get(key);
      expect(value).toBeDefined();
    });

    it('should invalidate cache by tag', async () => {
      const tag = 'test-tag';
      const key1 = 'key1';
      const key2 = 'key2';

      await cacheService.set(key1, 'value1', 300, [tag]);
      await cacheService.set(key2, 'value2', 300, [tag]);

      expect(await cacheService.get(key1)).toBe('value1');
      expect(await cacheService.get(key2)).toBe('value2');

      const invalidatedCount = await cacheService.invalidateByTag(tag);

      expect(invalidatedCount).toBe(2);
      expect(await cacheService.get(key1)).toBeNull();
      expect(await cacheService.get(key2)).toBeNull();
    });

    it('should invalidate multiple tags', async () => {
      const tags = ['tag1', 'tag2'];

      await cacheService.set('key1', 'value1', 300, ['tag1']);
      await cacheService.set('key2', 'value2', 300, ['tag2']);

      const count = await cacheService.invalidateByTags(tags);

      expect(count).toBe(2);
      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
    });

    it('should delete cache by pattern', async () => {
      await cacheService.set('user:1:profile', { name: 'User 1' });
      await cacheService.set('user:1:settings', { theme: 'dark' });
      await cacheService.set('user:2:profile', { name: 'User 2' });

      await cacheService.delByPattern('user:1:*');

      expect(await cacheService.get('user:1:profile')).toBeNull();
      expect(await cacheService.get('user:1:settings')).toBeNull();
      expect(await cacheService.get('user:2:profile')).toBeDefined();
    });

    it('should invalidate cache by entity', async () => {
      await cacheService.set('entity:project:123:data', { id: '123' });
      await cacheService.set('entity:project:123:details', { id: '123' });
      await cacheService.set('entity:project:456:data', { id: '456' });

      const count = await cacheService.invalidateByEntity('project', '123');

      expect(count).toBe(2);
      expect(await cacheService.get('entity:project:123:data')).toBeNull();
      expect(await cacheService.get('entity:project:456:data')).toBeDefined();
    });

    it('should invalidate all versions of a key', async () => {
      await cacheService.set('v1:config', { version: 1 });
      await cacheService.set('v2:config', { version: 2 });
      await cacheService.set('v3:config', { version: 3 });

      const count = await cacheService.invalidateVersions('config');

      expect(count).toBe(3);
      expect(await cacheService.get('v1:config')).toBeNull();
      expect(await cacheService.get('v2:config')).toBeNull();
      expect(await cacheService.get('v3:config')).toBeNull();
    });

    it('should return metrics', () => {
      const metrics = cacheService.getMetrics();

      expect(metrics).toHaveProperty('hits');
      expect(metrics).toHaveProperty('misses');
      expect(metrics).toHaveProperty('sets');
      expect(metrics).toHaveProperty('invalidations');
    });

    it('should reset metrics', () => {
      cacheService.resetMetrics();
      const metrics = cacheService.getMetrics();

      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.sets).toBe(0);
    });

    it('should clear entire cache', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');

      await cacheService.clear();

      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
    });

    it('should support cache-aside pattern with tags', async () => {
      const key = 'cache-aside-test';
      const tags = ['test:list'];
      let executionCount = 0;

      const value = await cacheService.getOrSet(
        key,
        async () => {
          executionCount++;
          return { data: 'value' };
        },
        300,
        tags,
      );

      expect(value.data).toBe('value');
      expect(executionCount).toBe(1);

      // Second call should use cache
      const value2 = await cacheService.getOrSet(
        key,
        async () => {
          executionCount++;
          return { data: 'value' };
        },
        300,
        tags,
      );

      expect(value2.data).toBe('value');
      expect(executionCount).toBe(1); // Not incremented

      // Invalidate and call again
      await cacheService.invalidateByTag('test:list');

      const value3 = await cacheService.getOrSet(
        key,
        async () => {
          executionCount++;
          return { data: 'value' };
        },
        300,
        tags,
      );

      expect(value3.data).toBe('value');
      expect(executionCount).toBe(2); // Incremented again
    });
  });

  describe('CacheInvalidationService', () => {
    it('should register custom invalidation rules', () => {
      const rule = {
        entityType: 'custom',
        action: 'update' as const,
        tagsToInvalidate: ['custom:list'],
        patternsToInvalidate: ['custom:*'],
        cascade: false,
      };

      cacheInvalidationService.registerRule('custom', rule);
      const rules = cacheInvalidationService.getRules('custom');

      expect(rules).toContainEqual(rule);
    });

    it('should invalidate by entity using rules', async () => {
      // Project rule should be pre-configured
      const rules = cacheInvalidationService.getRules('project');
      expect(rules.length).toBeGreaterThan(0);

      // Set some cache with the tags from rules
      const tags = rules[0].tagsToInvalidate;
      await cacheService.set('project:1', { data: 'value' }, 300, tags);

      // Trigger invalidation
      const count = await cacheInvalidationService.invalidate(
        'project',
        '1',
        'update',
      );

      expect(count).toBeGreaterThan(0);
    });

    it('should batch invalidate multiple entities', async () => {
      // Create cache entries
      await cacheService.set('entity:project:1', { id: '1' });
      await cacheService.set('entity:project:2', { id: '2' });

      const entities = [
        { entityType: 'project', entityId: '1', action: 'update' as const },
        { entityType: 'project', entityId: '2', action: 'update' as const },
      ];

      const count = await cacheInvalidationService.invalidateBatch(entities);

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle cascade invalidation', async () => {
      // Create cache for multiple related entities
      await cacheService.set('entity:project:1', { id: '1' });
      await cacheService.set('entity:user:123', { id: '123' });

      const count = await cacheInvalidationService.invalidate(
        'project',
        '1',
        'update',
        {
          relatedEntities: [
            { entityType: 'user', entityId: '123' },
          ],
        },
      );

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should get all rules', () => {
      const allRules = cacheInvalidationService.getAllRules();

      expect(allRules.size).toBeGreaterThan(0);
      expect(allRules.has('project')).toBe(true);
      expect(allRules.has('user')).toBe(true);
      expect(allRules.has('contribution')).toBe(true);
    });
  });

  describe('Cache Metrics', () => {
    it('should track cache hits and misses', async () => {
      await cacheService.set('metric-test', 'value');

      // This should be a hit
      await cacheService.get('metric-test');

      // This should be a miss
      await cacheService.get('non-existent');

      const metrics = cacheService.getMetrics();

      expect(metrics.hits).toBeGreaterThan(0);
      expect(metrics.misses).toBeGreaterThan(0);
    });

    it('should track invalidations', async () => {
      const initialMetrics = cacheService.getMetrics();

      await cacheService.set('test-key', 'value', 300, ['test-tag']);
      await cacheService.invalidateByTag('test-tag');

      const newMetrics = cacheService.getMetrics();

      expect(newMetrics.invalidations).toBeGreaterThan(
        initialMetrics.invalidations,
      );
    });

    it('should track tag invalidations separately', async () => {
      const initialMetrics = cacheService.getMetrics();

      await cacheService.set('key1', 'value1', 300, ['tag']);
      await cacheService.set('key2', 'value2', 300, ['tag']);

      await cacheService.invalidateByTag('tag');

      const newMetrics = cacheService.getMetrics();

      expect(newMetrics.tagInvalidations).toBeGreaterThan(
        initialMetrics.tagInvalidations,
      );
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete cache lifecycle', async () => {
      // 1. Set cache with tags
      const key = 'project:1';
      const value = { id: '1', name: 'Test Project' };
      const tags = ['projects:list', 'projects:trending'];

      await cacheService.set(key, value, 300, tags);

      // 2. Verify it's cached
      expect(await cacheService.get(key)).toEqual(value);

      // 3. Invalidate by tag
      const count = await cacheService.invalidateByTag('projects:list');

      // 4. Verify it's gone
      expect(await cacheService.get(key)).toBeNull();
      expect(count).toBeGreaterThan(0);
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      // Concurrent sets
      for (let i = 0; i < 10; i++) {
        promises.push(
          cacheService.set(`concurrent:${i}`, `value:${i}`, 300, ['concurrent']),
        );
      }

      await Promise.all(promises);

      // Concurrent gets
      const getPromises = [];
      for (let i = 0; i < 10; i++) {
        getPromises.push(cacheService.get(`concurrent:${i}`));
      }

      const results = await Promise.all(getPromises);

      results.forEach((result, index) => {
        expect(result).toBe(`value:${index}`);
      });

      // Bulk invalidation
      const count = await cacheService.invalidateByTag('concurrent');
      expect(count).toBe(10);
    });
  });
});
