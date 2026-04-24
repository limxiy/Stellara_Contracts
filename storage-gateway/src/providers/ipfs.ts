import { create } from 'ipfs-core';
import { create as createClient } from 'ipfs-http-client';
import { StorageProvider, UploadOptions, UploadResult, RetrieveOptions, RetrieveResult, VerificationResult, PinResult, CostEstimate, ProviderStatus } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';
import crypto from 'crypto';
import axios from 'axios';

export class IPFSProvider implements StorageProvider {
  public readonly name = 'ipfs';
  private client: any;
  private httpClient: any;
  private isInitialized = false;

  async initialize(): Promise<void> {
    try {
      this.httpClient = createClient({ url: config.ipfs.nodeUrl });
      
      try {
        this.client = await create({
          repo: './ipfs-repo',
          config: {
            Addresses: {
              Swarm: config.ipfs.pinningNodes,
            },
          },
        });
      } catch (error) {
        logger.warn('Failed to create local IPFS node, using HTTP client only:', error);
      }
      
      this.isInitialized = true;
      logger.info('IPFS provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize IPFS provider:', error);
      throw error;
    }
  }

  async upload(content: Buffer | string, options?: UploadOptions): Promise<UploadResult> {
    if (!this.isInitialized) await this.initialize();
    
    const startTime = Date.now();
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
    
    try {
      const result = await this.httpClient.add(contentBuffer, {
        pin: options?.replicationFactor ? options.replicationFactor > 0 : true,
        wrapWithDirectory: false,
      });

      const uploadResult: UploadResult = {
        success: true,
        identifier: result.cid.toString(),
        hash,
        size: result.size,
        provider: this.name,
        timestamp: new Date(),
        metadata: {
          path: result.path,
          pins: result.pins || [],
        },
      };

      if (options?.replicationFactor && options.replicationFactor > 1) {
        await this.replicateContent(result.cid.toString(), options.replicationFactor);
      }

      logger.info(`IPFS upload successful: ${result.cid.toString()} (${result.size} bytes) in ${Date.now() - startTime}ms`);
      return uploadResult;
    } catch (error) {
      logger.error('IPFS upload failed:', error);
      return {
        success: false,
        identifier: '',
        hash,
        size: contentBuffer.length,
        provider: this.name,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async retrieve(identifier: string, options?: RetrieveOptions): Promise<RetrieveResult> {
    if (!this.isInitialized) await this.initialize();
    
    const startTime = Date.now();
    
    try {
      const chunks = [];
      const stream = this.httpClient.cat(identifier);
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const content = Buffer.concat(chunks);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      
      let verified = true;
      if (options?.verifyHash && options.verifyHash !== hash) {
        verified = false;
        throw new Error(`Hash verification failed. Expected: ${options.verifyHash}, Got: ${hash}`);
      }

      const result: RetrieveResult = {
        success: true,
        content,
        hash,
        size: content.length,
        provider: this.name,
        cached: false,
        verified,
        timestamp: new Date(),
      };

      logger.info(`IPFS retrieval successful: ${identifier} (${content.length} bytes) in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      logger.error(`IPFS retrieval failed for ${identifier}:`, error);
      return {
        success: false,
        content: Buffer.alloc(0),
        hash: '',
        size: 0,
        provider: this.name,
        cached: false,
        verified: false,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(identifier: string, expectedHash?: string): Promise<VerificationResult> {
    const retrieveResult = await this.retrieve(identifier, { verifyHash: true });
    
    return {
      valid: retrieveResult.success && retrieveResult.verified,
      expectedHash: expectedHash || retrieveResult.hash,
      actualHash: retrieveResult.hash,
      provider: this.name,
      timestamp: new Date(),
    };
  }

  async pin(identifier: string): Promise<PinResult> {
    if (!this.isInitialized) await this.initialize();
    
    try {
      await this.httpClient.pin.add(identifier);
      
      return {
        success: true,
        identifier,
        provider: this.name,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error(`IPFS pinning failed for ${identifier}:`, error);
      return {
        success: false,
        identifier,
        provider: this.name,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getCost(size: number, duration?: number): Promise<CostEstimate> {
    const baseCost = 0.00001 * size / 1024 / 1024; // Very low cost for IPFS
    const storageCost = duration ? baseCost * (duration / 30) : baseCost; // Monthly basis
    
    return {
      provider: this.name,
      cost: storageCost,
      currency: 'ETH',
      duration: duration || 30,
      size,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const startTime = Date.now();
    let online = false;
    let latency = 0;
    let errorRate = 0;

    try {
      const version = await this.httpClient.version();
      online = true;
      latency = Date.now() - startTime;
      logger.debug(`IPFS status check: ${version.version}, latency: ${latency}ms`);
    } catch (error) {
      errorRate = 100;
      logger.error('IPFS status check failed:', error);
    }

    return {
      name: this.name,
      online,
      latency,
      errorRate,
      lastCheck: new Date(),
      features: ['upload', 'retrieve', 'pin', 'verify', 'directory'],
    };
  }

  private async replicateContent(cid: string, replicationFactor: number): Promise<void> {
    const pinningServices = [
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      'https://pinning.web3.storage/api/v0/pins',
    ];

    const promises = pinningServices.slice(0, replicationFactor - 1).map(async (service) => {
      try {
        // This would require authentication tokens for each service
        logger.info(`Replicating ${cid} to ${service}`);
      } catch (error) {
        logger.warn(`Failed to replicate ${cid} to ${service}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  async getGatewayUrl(identifier: string): Promise<string> {
    return `${config.ipfs.gatewayUrl}/ipfs/${identifier}`;
  }

  async isPinned(identifier: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize();
    
    try {
      const pins = await this.httpClient.pin.ls();
      for await (const pin of pins) {
        if (pin.cid.toString() === identifier) {
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error(`Failed to check pin status for ${identifier}:`, error);
      return false;
    }
  }
}
