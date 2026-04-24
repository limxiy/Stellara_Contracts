import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  tagInvalidations: number;
  versionInvalidations: number;
  errors: number;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis;
  private readonly metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    tagInvalidations: 0,
    versionInvalidations: 0,
    errors: 0,
  };

  // Store tag-to-keys mapping for quick invalidation
  private tagIndex = new Map<string, Set<string>>();

  constructor(
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      lazyConnect: true,
    });
    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
      this.metrics.errors++;
    });
    this.client.connect().catch((err) => {
      this.logger.error(`Redis connect failed: ${err.message}`);
      this.metrics.errors++;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value) {
        this.metrics.hits++;
        return JSON.parse(value) as T;
      }
      this.metrics.misses++;
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      this.metrics.errors++;
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds = 300,
    tags: string[] = [],
  ): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      this.metrics.sets++;

      // Track tags
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        if (!this.tagIndex.has(tagKey)) {
          this.tagIndex.set(tagKey, new Set());
        }
        this.tagIndex.get(tagKey)!.add(key);
        // Also store in Redis for persistence across restarts
        await this.client.sadd(tagKey, key);
        await this.client.expire(tagKey, ttlSeconds);
      }

      // Emit cache set event
      this.eventEmitter.emit('cache.set', { key, tags });
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
      this.metrics.errors++;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.metrics.invalidations++;
      this.eventEmitter.emit('cache.invalidate', { key });
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
      this.metrics.errors++;
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length) {
        await this.client.del(...keys);
        this.metrics.invalidations += keys.length;
        this.eventEmitter.emit('cache.invalidate-pattern', { pattern, count: keys.length });
      }
    } catch (error) {
      this.logger.error(`Cache delete by pattern error for ${pattern}:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Invalidate all cache entries with a specific tag
   * @param tag Cache tag to invalidate
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const tagKey = `tag:${tag}`;
      const keys = await this.client.smembers(tagKey);
      
      if (keys.length > 0) {
        await this.client.del(...keys);
        await this.client.del(tagKey);
        this.metrics.tagInvalidations++;
        this.metrics.invalidations += keys.length;
        this.eventEmitter.emit('cache.tag-invalidated', { tag, count: keys.length });
      }

      // Clear from in-memory index
      this.tagIndex.delete(tagKey);
      
      return keys.length;
    } catch (error) {
      this.logger.error(`Cache tag invalidation error for ${tag}:`, error);
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Invalidate multiple tags at once
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;
    for (const tag of tags) {
      totalInvalidated += await this.invalidateByTag(tag);
    }
    return totalInvalidated;
  }

  /**
   * Invalidate cache by entity type and ID
   * Pattern: entity:{entityType}:{entityId}*
   */
  async invalidateByEntity(entityType: string, entityId?: string): Promise<number> {
    const pattern = entityId
      ? `entity:${entityType}:${entityId}*`
      : `entity:${entityType}:*`;
    
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
      this.metrics.invalidations += keys.length;
      this.eventEmitter.emit('cache.entity-invalidated', { entityType, entityId, count: keys.length });
    }
    return keys.length;
  }

  /**
   * Invalidate cache by entity type and multiple IDs
   */
  async invalidateByEntityIds(entityType: string, entityIds: string[]): Promise<number> {
    let total = 0;
    for (const id of entityIds) {
      total += await this.invalidateByEntity(entityType, id);
    }
    return total;
  }

  /**
   * Create a versioned key - useful for versioning cache entries
   */
  getVersionedKey(key: string, version: number): string {
    return `v${version}:${key}`;
  }

  /**
   * Invalidate all versions of a key
   */
  async invalidateVersions(key: string): Promise<number> {
    try {
      const keys = await this.client.keys(`v*:${key}`);
      if (keys.length > 0) {
        await this.client.del(...keys);
        this.metrics.versionInvalidations++;
        this.metrics.invalidations += keys.length;
        this.eventEmitter.emit('cache.versions-invalidated', { key, count: keys.length });
      }
      return keys.length;
    } catch (error) {
      this.logger.error(`Cache version invalidation error for ${key}:`, error);
      this.metrics.errors++;
      return 0;
    }
  }

  /** Cache-aside helper: return cached value or execute loader and cache result */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds = 300,
    tags: string[] = [],
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    await this.set(key, value, ttlSeconds, tags);
    return value;
  }

  /**
   * Clear all cache - use with caution!
   */
  async clear(): Promise<void> {
    try {
      await this.client.flushdb();
      this.tagIndex.clear();
      this.logger.warn('All cache cleared');
      this.eventEmitter.emit('cache.cleared');
    } catch (error) {
      this.logger.error('Cache clear error:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    Object.keys(this.metrics).forEach((key) => {
      this.metrics[key as keyof CacheMetrics] = 0;
    });
  }

  /**
   * Get cache info
   */
  async getInfo(): Promise<{ metrics: CacheMetrics; redis: string }> {
    try {
      const info = await this.client.info('memory');
      return { metrics: this.metrics, redis: info };
    } catch (error) {
      this.logger.error('Error getting cache info:', error);
      return { metrics: this.metrics, redis: 'error' };
    }
  }
}
