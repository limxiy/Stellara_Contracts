import NodeCache from 'node-cache';
import Redis from 'ioredis';
import { CacheEntry } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';

export class CacheService {
  private memoryCache: NodeCache;
  private redisClient: Redis | null = null;
  private isRedisConnected = false;

  constructor() {
    this.memoryCache = new NodeCache({
      stdTTL: config.cache.ttl,
      checkperiod: 600, // Check for expired keys every 10 minutes
      maxKeys: config.cache.memoryCacheSize,
      useClones: false,
    });

    this.memoryCache.on('set', (key, value) => {
      logger.debug(`Memory cache SET: ${key}`);
    });

    this.memoryCache.on('del', (key, value) => {
      logger.debug(`Memory cache DEL: ${key}`);
    });

    this.memoryCache.on('expired', (key, value) => {
      logger.debug(`Memory cache EXPIRED: ${key}`);
    });

    if (config.cache.redisCacheEnabled) {
      this.initializeRedis();
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis client connected');
        this.isRedisConnected = true;
      });

      this.redisClient.on('error', (error) => {
        logger.error('Redis connection error:', error);
        this.isRedisConnected = false;
      });

      this.redisClient.on('close', () => {
        logger.warn('Redis connection closed');
        this.isRedisConnected = false;
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.redisClient = null;
      this.isRedisConnected = false;
    }
  }

  async get(key: string): Promise<CacheEntry | null> {
    // Try Redis first if available
    if (this.isRedisConnected && this.redisClient) {
      try {
        const cached = await this.redisClient.get(key);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          entry.accessCount = (entry.accessCount || 0) + 1;
          await this.redisClient.set(key, JSON.stringify(entry), 'EX', entry.ttl);
          logger.debug(`Redis cache HIT: ${key}`);
          return entry;
        }
      } catch (error) {
        logger.error('Redis get error:', error);
      }
    }

    // Fallback to memory cache
    const entry = this.memoryCache.get<CacheEntry>(key);
    if (entry) {
      entry.accessCount = (entry.accessCount || 0) + 1;
      this.memoryCache.set(key, entry);
      logger.debug(`Memory cache HIT: ${key}`);
      return entry;
    }

    logger.debug(`Cache MISS: ${key}`);
    return null;
  }

  async set(key: string, content: Buffer, hash: string, size: number, provider: string, ttl?: number): Promise<void> {
    const entry: CacheEntry = {
      key,
      content,
      hash,
      size,
      provider,
      timestamp: new Date(),
      ttl: ttl || config.cache.ttl,
      accessCount: 0,
    };

    // Store in Redis if available
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(key, JSON.stringify(entry), 'EX', entry.ttl);
        logger.debug(`Redis cache SET: ${key} (TTL: ${entry.ttl}s)`);
      } catch (error) {
        logger.error('Redis set error:', error);
      }
    }

    // Always store in memory cache as backup
    this.memoryCache.set(key, entry, entry.ttl);
    logger.debug(`Memory cache SET: ${key} (TTL: ${entry.ttl}s)`);
  }

  async delete(key: string): Promise<void> {
    // Delete from Redis
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
        logger.debug(`Redis cache DEL: ${key}`);
      } catch (error) {
        logger.error('Redis delete error:', error);
      }
    }

    // Delete from memory cache
    this.memoryCache.del(key);
    logger.debug(`Memory cache DEL: ${key}`);
  }

  async clear(): Promise<void> {
    // Clear Redis
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.flushdb();
        logger.info('Redis cache cleared');
      } catch (error) {
        logger.error('Redis clear error:', error);
      }
    }

    // Clear memory cache
    this.memoryCache.flushAll();
    logger.info('Memory cache cleared');
  }

  async getStats(): Promise<any> {
    const memoryStats = this.memoryCache.getStats();
    
    let redisStats = null;
    if (this.isRedisConnected && this.redisClient) {
      try {
        const info = await this.redisClient.info('memory');
        redisStats = {
          connected: true,
          memory: this.parseRedisMemoryInfo(info),
        };
      } catch (error) {
        redisStats = { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }

    return {
      memory: {
        ...memoryStats,
        size: this.memoryCache.keys().length,
      },
      redis: redisStats || { connected: false },
    };
  }

  private parseRedisMemoryInfo(info: string): any {
    const lines = info.split('\r\n');
    const memory: any = {};
    
    for (const line of lines) {
      if (line.includes('used_memory:')) {
        memory.used = parseInt(line.split(':')[1]);
      }
      if (line.includes('used_memory_human:')) {
        memory.usedHuman = line.split(':')[1];
      }
      if (line.includes('used_memory_peak:')) {
        memory.peak = parseInt(line.split(':')[1]);
      }
      if (line.includes('used_memory_peak_human:')) {
        memory.peakHuman = line.split(':')[1];
      }
    }
    
    return memory;
  }

  async getPopularContent(limit: number = 10): Promise<CacheEntry[]> {
    const keys = this.memoryCache.keys();
    const entries: CacheEntry[] = [];

    for (const key of keys) {
      const entry = this.memoryCache.get<CacheEntry>(key);
      if (entry && entry.accessCount > 0) {
        entries.push(entry);
      }
    }

    // Sort by access count and return top entries
    return entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  async cleanup(): Promise<void> {
    // Cleanup expired entries from memory cache
    this.memoryCache.keys().forEach(key => {
      const entry = this.memoryCache.get<CacheEntry>(key);
      if (entry && Date.now() - entry.timestamp.getTime() > entry.ttl * 1000) {
        this.memoryCache.del(key);
      }
    });

    logger.debug('Cache cleanup completed');
  }

  async getCacheHitRate(): Promise<number> {
    const stats = this.memoryCache.getStats();
    return stats.hits > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0;
  }

  generateKey(provider: string, identifier: string, options?: any): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    return `${provider}:${identifier}:${Buffer.from(optionsStr).toString('base64')}`;
  }

  async isCached(key: string): Promise<boolean> {
    // Check Redis first
    if (this.isRedisConnected && this.redisClient) {
      try {
        const exists = await this.redisClient.exists(key);
        if (exists) return true;
      } catch (error) {
        logger.error('Redis exists check error:', error);
      }
    }

    // Check memory cache
    return this.memoryCache.has(key);
  }

  async updateTTL(key: string, newTTL: number): Promise<void> {
    // Update Redis TTL
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.expire(key, newTTL);
        logger.debug(`Redis TTL updated: ${key} -> ${newTTL}s`);
      } catch (error) {
        logger.error('Redis TTL update error:', error);
      }
    }

    // Update memory cache TTL
    const entry = this.memoryCache.get<CacheEntry>(key);
    if (entry) {
      entry.ttl = newTTL;
      this.memoryCache.set(key, entry, newTTL);
      logger.debug(`Memory TTL updated: ${key} -> ${newTTL}s`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.disconnect();
      logger.info('Redis client disconnected');
    }
    this.memoryCache.close();
    logger.info('Memory cache closed');
  }
}
