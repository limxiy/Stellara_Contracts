import { IPFSProvider } from '@/providers/ipfs';
import { ArweaveProvider } from '@/providers/arweave';
import { FilecoinProvider } from '@/providers/filecoin';
import { CacheService } from '@/services/cache';
import { FailoverService } from '@/services/failover';
import { VerificationService } from '@/services/verification';
import { StorageProvider, UploadOptions, UploadResult, RetrieveOptions, RetrieveResult, ContentMetadata, StorageMetrics, GatewayStatus, StorageTier, TierConfiguration } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';

export class StorageGatewayService {
  private providers: Map<string, StorageProvider> = new Map();
  private cacheService: CacheService;
  private failoverService: FailoverService;
  private verificationService: VerificationService;
  private metrics: StorageMetrics;
  private tierConfigurations: Map<StorageTier, TierConfiguration>;

  constructor() {
    this.cacheService = new CacheService();
    this.failoverService = new FailoverService();
    this.verificationService = new VerificationService();
    this.initializeMetrics();
    this.initializeTierConfigurations();
    this.initializeProviders();
  }

  private initializeMetrics(): void {
    this.metrics = {
      uploads: {
        total: 0,
        byProvider: {},
        successRate: 0,
        averageLatency: 0,
      },
      retrievals: {
        total: 0,
        byProvider: {},
        cacheHitRate: 0,
        averageLatency: 0,
      },
      costs: {
        total: 0,
        byProvider: {},
        savings: 0,
      },
      errors: {
        total: 0,
        byProvider: {},
        byType: {},
      },
    };
  }

  private initializeTierConfigurations(): void {
    this.tierConfigurations = new Map([
      [StorageTier.COLD, {
        tier: StorageTier.COLD,
        providers: ['arweave'],
        replicationFactor: 1,
        retentionPeriod: 365 * 5, // 5 years
        costMultiplier: 0.5,
      }],
      [StorageTier.STANDARD, {
        tier: StorageTier.STANDARD,
        providers: ['ipfs', 'arweave'],
        replicationFactor: 2,
        retentionPeriod: 365, // 1 year
        costMultiplier: 1.0,
      }],
      [StorageTier.HOT, {
        tier: StorageTier.HOT,
        providers: ['ipfs', 'filecoin'],
        replicationFactor: 3,
        retentionPeriod: 90, // 90 days
        costMultiplier: 1.5,
      }],
    ]);
  }

  private async initializeProviders(): Promise<void> {
    try {
      // Initialize providers
      const ipfsProvider = new IPFSProvider();
      const arweaveProvider = new ArweaveProvider();
      const filecoinProvider = new FilecoinProvider();

      await ipfsProvider.initialize();
      await arweaveProvider.initialize();
      await filecoinProvider.initialize();

      this.providers.set('ipfs', ipfsProvider);
      this.providers.set('arweave', arweaveProvider);
      this.providers.set('filecoin', filecoinProvider);

      // Register with failover service
      this.failoverService.registerProvider(ipfsProvider);
      this.failoverService.registerProvider(arweaveProvider);
      this.failoverService.registerProvider(filecoinProvider);

      logger.info('All storage providers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize storage providers:', error);
      throw error;
    }
  }

  async upload(
    content: Buffer | string,
    options?: UploadOptions & { tier?: StorageTier; optimizeCosts?: boolean }
  ): Promise<UploadResult[]> {
    const startTime = Date.now();
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = this.verificationService.calculateHash(contentBuffer);

    try {
      // Determine optimal providers based on tier and cost optimization
      const providers = await this.selectProvidersForUpload(
        contentBuffer.length,
        options?.tier || StorageTier.STANDARD,
        options?.optimizeCosts || config.costOptimization.enabled
      );

      // Configure failover
      const failoverConfig = {
        providers,
        strategy: options?.priority === 'high' ? 'parallel' : 'sequential',
        maxRetries: config.retry.maxRetries,
        retryDelay: config.retry.retryDelay,
      };

      // Upload with failover
      const results = await this.failoverService.uploadWithFailover(content, options, failoverConfig);

      // Update metrics
      this.updateUploadMetrics(results, Date.now() - startTime);

      // Cache successful uploads
      for (const result of results) {
        if (result.success) {
          const cacheKey = this.cacheService.generateKey(result.provider, result.identifier);
          await this.cacheService.set(cacheKey, contentBuffer, hash, result.size, result.provider);
        }
      }

      logger.info(`Upload completed: ${results.filter(r => r.success).length}/${results.length} successful`);
      return results;
    } catch (error) {
      logger.error('Upload failed:', error);
      throw error;
    }
  }

  async retrieve(
    identifier: string,
    options?: RetrieveOptions & { preferredProvider?: string; tier?: StorageTier }
  ): Promise<RetrieveResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (options?.useCache !== false) {
        const cacheKey = this.cacheService.generateKey(options?.preferredProvider || 'any', identifier);
        const cached = await this.cacheService.get(cacheKey);
        
        if (cached) {
          // Verify cached content
          const verification = await this.verificationService.verifyContent(cached.content, cached.hash);
          
          if (verification.valid) {
            this.updateRetrievalMetrics(cached.provider, Date.now() - startTime, true);
            
            return {
              success: true,
              content: cached.content,
              hash: cached.hash,
              size: cached.size,
              provider: cached.provider,
              cached: true,
              verified: true,
              timestamp: new Date(),
            };
          }
        }
      }

      // Determine providers to try
      const providers = await this.selectProvidersForRetrieval(identifier, options);

      // Configure failover
      const failoverConfig = {
        providers,
        strategy: 'fastest',
        maxRetries: config.retry.maxRetries,
        retryDelay: config.retry.retryDelay,
      };

      // Retrieve with failover
      const result = await this.failoverService.retrieveWithFailover(identifier, options, failoverConfig);

      // Verify retrieved content
      if (result.success && config.contentVerification.enabled) {
        const verification = await this.verificationService.verifyContent(result.content);
        result.verified = verification.valid;
        
        if (!verification.valid) {
          result.success = false;
          result.error = 'Content verification failed';
        }
      }

      // Cache successful retrievals
      if (result.success && options?.useCache !== false) {
        const cacheKey = this.cacheService.generateKey(result.provider, identifier);
        await this.cacheService.set(cacheKey, result.content, result.hash, result.size, result.provider);
      }

      // Update metrics
      this.updateRetrievalMetrics(result.provider, Date.now() - startTime, result.cached);

      logger.info(`Retrieval completed: ${result.success ? 'success' : 'failed'} from ${result.provider}`);
      return result;
    } catch (error) {
      logger.error('Retrieval failed:', error);
      throw error;
    }
  }

  private async selectProvidersForUpload(
    size: number,
    tier: StorageTier,
    optimizeCosts: boolean
  ): Promise<string[]> {
    const tierConfig = this.tierConfigurations.get(tier);
    if (!tierConfig) {
      throw new Error(`Unknown storage tier: ${tier}`);
    }

    let providers = [...tierConfig.providers];

    if (optimizeCosts) {
      // Get cost estimates and sort by cost
      const costs = await Promise.all(
        providers.map(async provider => {
          const p = this.providers.get(provider);
          if (!p) return { provider, cost: Infinity };
          try {
            const estimate = await p.getCost(size, tierConfig.retentionPeriod);
            return { provider, cost: estimate.cost };
          } catch {
            return { provider, cost: Infinity };
          }
        })
      );

      costs.sort((a, b) => a.cost - b.cost);
      providers = costs.map(c => c.provider).slice(0, tierConfig.replicationFactor);
    } else {
      providers = providers.slice(0, tierConfig.replicationFactor);
    }

    return providers;
  }

  private async selectProvidersForRetrieval(
    identifier: string,
    options?: RetrieveOptions & { preferredProvider?: string }
  ): Promise<string[]> {
    if (options?.preferredProvider && this.providers.has(options.preferredProvider)) {
      return [options.preferredProvider];
    }

    // Get best performing providers
    const bestProviders = await this.failoverService.getBestProviders(5);
    return bestProviders;
  }

  private updateUploadMetrics(results: UploadResult[], latency: number): void {
    this.metrics.uploads.total++;
    
    const successful = results.filter(r => r.success);
    this.metrics.uploads.successRate = (successful.length / results.length) * 100;
    
    // Update average latency
    this.metrics.uploads.averageLatency = 
      (this.metrics.uploads.averageLatency * (this.metrics.uploads.total - 1) + latency) / this.metrics.uploads.total;

    // Update provider stats
    for (const result of results) {
      if (!this.metrics.uploads.byProvider[result.provider]) {
        this.metrics.uploads.byProvider[result.provider] = 0;
      }
      this.metrics.uploads.byProvider[result.provider]++;
      
      // Update costs
      if (result.cost) {
        this.metrics.costs.total += result.cost;
        if (!this.metrics.costs.byProvider[result.provider]) {
          this.metrics.costs.byProvider[result.provider] = 0;
        }
        this.metrics.costs.byProvider[result.provider] += result.cost;
      }
    }
  }

  private updateRetrievalMetrics(provider: string, latency: number, cached: boolean): void {
    this.metrics.retrievals.total++;
    
    // Update average latency
    this.metrics.retrievals.averageLatency = 
      (this.metrics.retrievals.averageLatency * (this.metrics.retrievals.total - 1) + latency) / this.metrics.retrievals.total;

    // Update provider stats
    if (!this.metrics.retrievals.byProvider[provider]) {
      this.metrics.retrievals.byProvider[provider] = 0;
    }
    this.metrics.retrievals.byProvider[provider]++;

    // Update cache hit rate
    if (cached) {
      const cacheHits = this.metrics.retrievals.cacheHitRate * (this.metrics.retrievals.total - 1) + 100;
      this.metrics.retrievals.cacheHitRate = cacheHits / this.metrics.retrievals.total;
    } else {
      const cacheHits = this.metrics.retrievals.cacheHitRate * (this.metrics.retrievals.total - 1);
      this.metrics.retrievals.cacheHitRate = cacheHits / this.metrics.retrievals.total;
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    const providerStatuses = await Promise.all(
      Array.from(this.providers.values()).map(p => p.getStatus())
    );

    return {
      uptime: process.uptime(),
      totalUploads: this.metrics.uploads.total,
      totalRetrievals: this.metrics.retrievals.total,
      cacheHitRate: this.metrics.retrievals.cacheHitRate,
      providers: providerStatuses,
      errors: [], // TODO: Implement error tracking
    };
  }

  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  async getCostEstimate(
    size: number,
    tier: StorageTier = StorageTier.STANDARD,
    duration?: number
  ): Promise<{ [provider: string]: any }> {
    const tierConfig = this.tierConfigurations.get(tier);
    if (!tierConfig) {
      throw new Error(`Unknown storage tier: ${tier}`);
    }

    const estimates: { [provider: string]: any } = {};
    
    for (const providerName of tierConfig.providers) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          const estimate = await provider.getCost(size, duration || tierConfig.retentionPeriod);
          estimates[providerName] = estimate;
        } catch (error) {
          estimates[providerName] = { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }
    }

    return estimates;
  }

  async pinContent(identifier: string, provider?: string): Promise<any> {
    if (provider && this.providers.has(provider)) {
      const p = this.providers.get(provider)!;
      return await p.pin(identifier);
    }

    // Pin on all available providers
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map(p => p.pin(identifier))
    );

    return results.map((result, index) => ({
      provider: Array.from(this.providers.keys())[index],
      success: result.status === 'fulfilled' ? result.value.success : false,
      error: result.status === 'rejected' ? result.reason : undefined,
    }));
  }

  async verifyContent(identifier: string, expectedHash?: string, provider?: string): Promise<any> {
    if (provider && this.providers.has(provider)) {
      const p = this.providers.get(provider)!;
      return await p.verify(identifier, expectedHash);
    }

    // Verify on all providers
    const results = await Promise.allSettled(
      Array.from(this.providers.values()).map(p => p.verify(identifier, expectedHash))
    );

    return results.map((result, index) => ({
      provider: Array.from(this.providers.keys())[index],
      valid: result.status === 'fulfilled' ? result.value.valid : false,
      error: result.status === 'rejected' ? result.reason : undefined,
    }));
  }

  async cleanup(): Promise<void> {
    await this.cacheService.cleanup();
    await this.cacheService.disconnect();
  }
}
