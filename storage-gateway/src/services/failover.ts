import pRetry from 'p-retry';
import pMap from 'p-map';
import { StorageProvider, UploadOptions, UploadResult, RetrieveOptions, RetrieveResult, FailoverConfig } from '@/types';
import logger from '@/utils/logger';
import config from '@/config';

export class FailoverService {
  private providers: Map<string, StorageProvider> = new Map();
  private providerStats: Map<string, { successCount: number; errorCount: number; lastError: Date }> = new Map();

  constructor() {
    // Initialize provider stats
  }

  registerProvider(provider: StorageProvider): void {
    this.providers.set(provider.name, provider);
    this.providerStats.set(provider.name, {
      successCount: 0,
      errorCount: 0,
      lastError: new Date(),
    });
  }

  async uploadWithFailover(
    content: Buffer | string,
    options?: UploadOptions,
    failoverConfig?: Partial<FailoverConfig>
  ): Promise<UploadResult[]> {
    const cfg: FailoverConfig = {
      maxRetries: failoverConfig?.maxRetries || config.retry.maxRetries,
      retryDelay: failoverConfig?.retryDelay || config.retry.retryDelay,
      timeout: failoverConfig?.timeout || config.retry.timeout,
      providers: failoverConfig?.providers || Array.from(this.providers.keys()),
      strategy: failoverConfig?.strategy || 'parallel',
    };

    const providerNames = cfg.providers.filter(name => this.providers.has(name));
    
    if (providerNames.length === 0) {
      throw new Error('No available providers for upload');
    }

    switch (cfg.strategy) {
      case 'parallel':
        return this.uploadParallel(content, options, cfg);
      case 'sequential':
        return this.uploadSequential(content, options, cfg);
      case 'fastest':
        return this.uploadFastest(content, options, cfg);
      default:
        return this.uploadParallel(content, options, cfg);
    }
  }

  private async uploadParallel(
    content: Buffer | string,
    options: UploadOptions | undefined,
    config: FailoverConfig
  ): Promise<UploadResult[]> {
    const promises = config.providers.map(providerName => 
      this.uploadWithRetry(providerName, content, options, config)
    );

    const results = await Promise.allSettled(promises);
    return results.map(result => 
      result.status === 'fulfilled' ? result.value : {
        success: false,
        identifier: '',
        hash: '',
        size: Buffer.isBuffer(content) ? content.length : Buffer.from(content).length,
        provider: '',
        timestamp: new Date(),
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      }
    );
  }

  private async uploadSequential(
    content: Buffer | string,
    options: UploadOptions | undefined,
    config: FailoverConfig
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    
    for (const providerName of config.providers) {
      try {
        const result = await this.uploadWithRetry(providerName, content, options, config);
        results.push(result);
        
        if (result.success) {
          // Stop on first successful upload for sequential strategy
          break;
        }
      } catch (error) {
        logger.error(`Sequential upload failed for ${providerName}:`, error);
        results.push({
          success: false,
          identifier: '',
          hash: '',
          size: Buffer.isBuffer(content) ? content.length : Buffer.from(content).length,
          provider: providerName,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return results;
  }

  private async uploadFastest(
    content: Buffer | string,
    options: UploadOptions | undefined,
    config: FailoverConfig
  ): Promise<UploadResult[]> {
    // Get provider latencies
    const providerLatencies = await this.getProviderLatencies(config.providers);
    
    // Sort providers by latency (fastest first)
    const sortedProviders = config.providers
      .map(name => ({ name, latency: providerLatencies.get(name) || Infinity }))
      .sort((a, b) => a.latency - b.latency)
      .map(p => p.name);

    // Try fastest providers first
    return this.uploadSequential(content, options, { ...config, providers: sortedProviders });
  }

  async retrieveWithFailover(
    identifier: string,
    options?: RetrieveOptions,
    failoverConfig?: Partial<FailoverConfig>
  ): Promise<RetrieveResult> {
    const cfg: FailoverConfig = {
      maxRetries: failoverConfig?.maxRetries || config.retry.maxRetries,
      retryDelay: failoverConfig?.retryDelay || config.retry.retryDelay,
      timeout: failoverConfig?.timeout || config.retry.timeout,
      providers: failoverConfig?.providers || Array.from(this.providers.keys()),
      strategy: failoverConfig?.strategy || 'fastest',
    };

    const providerNames = cfg.providers.filter(name => this.providers.has(name));
    
    if (providerNames.length === 0) {
      throw new Error('No available providers for retrieval');
    }

    switch (cfg.strategy) {
      case 'parallel':
        return this.retrieveParallel(identifier, options, cfg);
      case 'sequential':
        return this.retrieveSequential(identifier, options, cfg);
      case 'fastest':
        return this.retrieveFastest(identifier, options, cfg);
      default:
        return this.retrieveFastest(identifier, options, cfg);
    }
  }

  private async retrieveParallel(
    identifier: string,
    options: RetrieveOptions | undefined,
    config: FailoverConfig
  ): Promise<RetrieveResult> {
    const promises = config.providers.map(providerName => 
      this.retrieveWithRetry(providerName, identifier, options, config)
    );

    const results = await Promise.allSettled(promises);
    
    // Find the first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        return result.value;
      }
    }

    // Return the first error if all failed
    const firstResult = results[0];
    if (firstResult.status === 'rejected') {
      return {
        success: false,
        content: Buffer.alloc(0),
        hash: '',
        size: 0,
        provider: '',
        cached: false,
        verified: false,
        timestamp: new Date(),
        error: firstResult.reason instanceof Error ? firstResult.reason.message : 'Unknown error',
      };
    }

    return firstResult.status === 'fulfilled' ? firstResult.value : {
      success: false,
      content: Buffer.alloc(0),
      hash: '',
      size: 0,
      provider: '',
      cached: false,
      verified: false,
      timestamp: new Date(),
      error: 'All providers failed',
    };
  }

  private async retrieveSequential(
    identifier: string,
    options: RetrieveOptions | undefined,
    config: FailoverConfig
  ): Promise<RetrieveResult> {
    for (const providerName of config.providers) {
      try {
        const result = await this.retrieveWithRetry(providerName, identifier, options, config);
        if (result.success) {
          return result;
        }
      } catch (error) {
        logger.error(`Sequential retrieval failed for ${providerName}:`, error);
      }
    }

    return {
      success: false,
      content: Buffer.alloc(0),
      hash: '',
      size: 0,
      provider: '',
      cached: false,
      verified: false,
      timestamp: new Date(),
      error: 'All providers failed',
    };
  }

  private async retrieveFastest(
    identifier: string,
    options: RetrieveOptions | undefined,
    config: FailoverConfig
  ): Promise<RetrieveResult> {
    const providerLatencies = await this.getProviderLatencies(config.providers);
    
    const sortedProviders = config.providers
      .map(name => ({ name, latency: providerLatencies.get(name) || Infinity }))
      .sort((a, b) => a.latency - b.latency)
      .map(p => p.name);

    return this.retrieveSequential(identifier, options, { ...config, providers: sortedProviders });
  }

  private async uploadWithRetry(
    providerName: string,
    content: Buffer | string,
    options: UploadOptions | undefined,
    config: FailoverConfig
  ): Promise<UploadResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    return pRetry(async () => {
      const result = await provider.upload(content, options);
      
      if (result.success) {
        this.updateProviderStats(providerName, true);
      } else {
        this.updateProviderStats(providerName, false);
        throw new Error(result.error || 'Upload failed');
      }
      
      return result;
    }, {
      retries: config.maxRetries,
      onFailedAttempt: (error) => {
        logger.warn(`Upload attempt ${error.attemptNumber} failed for ${providerName}:`, error);
      },
    });
  }

  private async retrieveWithRetry(
    providerName: string,
    identifier: string,
    options: RetrieveOptions | undefined,
    config: FailoverConfig
  ): Promise<RetrieveResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    return pRetry(async () => {
      const result = await provider.retrieve(identifier, options);
      
      if (result.success) {
        this.updateProviderStats(providerName, true);
      } else {
        this.updateProviderStats(providerName, false);
        throw new Error(result.error || 'Retrieval failed');
      }
      
      return result;
    }, {
      retries: config.maxRetries,
      onFailedAttempt: (error) => {
        logger.warn(`Retrieval attempt ${error.attemptNumber} failed for ${providerName}:`, error);
      },
    });
  }

  private updateProviderStats(providerName: string, success: boolean): void {
    const stats = this.providerStats.get(providerName);
    if (stats) {
      if (success) {
        stats.successCount++;
      } else {
        stats.errorCount++;
        stats.lastError = new Date();
      }
    }
  }

  private async getProviderLatencies(providerNames: string[]): Promise<Map<string, number>> {
    const latencies = new Map<string, number>();
    
    await pMap(providerNames, async (providerName) => {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          const startTime = Date.now();
          await provider.getStatus();
          const latency = Date.now() - startTime;
          latencies.set(providerName, latency);
        } catch (error) {
          latencies.set(providerName, Infinity);
        }
      }
    }, { concurrency: 5 });

    return latencies;
  }

  getProviderStats(): Map<string, { successCount: number; errorCount: number; errorRate: number; lastError: Date }> {
    const stats = new Map();
    
    for (const [name, providerStats] of this.providerStats) {
      const total = providerStats.successCount + providerStats.errorCount;
      const errorRate = total > 0 ? (providerStats.errorCount / total) * 100 : 0;
      
      stats.set(name, {
        ...providerStats,
        errorRate,
      });
    }
    
    return stats;
  }

  async getBestProviders(count: number = 3): Promise<string[]> {
    const latencies = await this.getProviderLatencies(Array.from(this.providers.keys()));
    const stats = this.getProviderStats();
    
    const providers = Array.from(this.providers.keys())
      .map(name => ({
        name,
        latency: latencies.get(name) || Infinity,
        errorRate: stats.get(name)?.errorRate || 100,
        successCount: stats.get(name)?.successCount || 0,
      }))
      .filter(p => p.latency < Infinity)
      .sort((a, b) => {
        // Sort by combined score (latency + error rate)
        const scoreA = a.latency + (a.errorRate * 100);
        const scoreB = b.latency + (b.errorRate * 100);
        return scoreA - scoreB;
      })
      .slice(0, count)
      .map(p => p.name);

    return providers;
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();
    
    await pMap(Array.from(this.providers.keys()), async (providerName) => {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          const status = await provider.getStatus();
          health.set(providerName, status.online);
        } catch (error) {
          health.set(providerName, false);
        }
      }
    }, { concurrency: 10 });

    return health;
  }
}
