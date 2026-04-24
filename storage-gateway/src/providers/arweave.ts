import Arweave from 'arweave';
import { StorageProvider, UploadOptions, UploadResult, RetrieveOptions, RetrieveResult, VerificationResult, PinResult, CostEstimate, ProviderStatus } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';
import crypto from 'crypto';
import axios from 'axios';

export class ArweaveProvider implements StorageProvider {
  public readonly name = 'arweave';
  private client: Arweave;
  private wallet: any;
  private isInitialized = false;

  async initialize(): Promise<void> {
    try {
      this.client = new Arweave({
        host: 'arweave.net',
        port: 443,
        protocol: 'https',
      });

      if (config.arweave.walletFile) {
        try {
          const walletData = require(config.arweave.walletFile);
          this.wallet = await this.client.wallets.jwkToAddress(walletData);
          logger.info('Arweave wallet loaded');
        } catch (error) {
          logger.warn('Failed to load Arweave wallet, using read-only mode:', error);
        }
      }

      this.isInitialized = true;
      logger.info('Arweave provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Arweave provider:', error);
      throw error;
    }
  }

  async upload(content: Buffer | string, options?: UploadOptions): Promise<UploadResult> {
    if (!this.isInitialized) await this.initialize();
    
    const startTime = Date.now();
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
    
    try {
      const transaction = await this.client.createTransaction({
        data: contentBuffer.toString('base64'),
      }, this.wallet);

      if (options?.tags) {
        Object.entries(options.tags).forEach(([key, value]) => {
          transaction.addTag(key, value);
        });
      }

      transaction.addTag('Content-Type', options?.contentType || 'application/octet-stream');
      transaction.addTag('App-Name', 'Stellara-Storage-Gateway');
      transaction.addTag('SHA256', hash);

      if (this.wallet) {
        await this.client.transactions.sign(transaction, this.wallet);
        const response = await this.client.transactions.post(transaction);
        
        if (response.status !== 200) {
          throw new Error(`Transaction failed with status: ${response.status}`);
        }
      } else {
        throw new Error('Wallet not available for upload');
      }

      const uploadResult: UploadResult = {
        success: true,
        identifier: transaction.id,
        hash,
        size: contentBuffer.length,
        provider: this.name,
        timestamp: new Date(),
        metadata: {
          transactionId: transaction.id,
          block: transaction.block,
          tags: transaction.tags,
        },
      };

      logger.info(`Arweave upload successful: ${transaction.id} (${contentBuffer.length} bytes) in ${Date.now() - startTime}ms`);
      return uploadResult;
    } catch (error) {
      logger.error('Arweave upload failed:', error);
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
      const response = await this.client.transactions.getData(identifier, {
        decode: true,
      });

      const content = Buffer.from(response as ArrayBuffer);
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

      logger.info(`Arweave retrieval successful: ${identifier} (${content.length} bytes) in ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      logger.error(`Arweave retrieval failed for ${identifier}:`, error);
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
    // Arweave doesn't have traditional pinning - content is permanently stored
    return {
      success: true,
      identifier,
      provider: this.name,
      timestamp: new Date(),
    };
  }

  async getCost(size: number, duration?: number): Promise<CostEstimate> {
    try {
      const price = await this.client.transactions.getPrice(size);
      const arweavePrice = this.client.ar.winstonToAr(price);
      
      return {
        provider: this.name,
        cost: parseFloat(arweavePrice),
        currency: 'AR',
        duration: -1, // Permanent storage
        size,
      };
    } catch (error) {
      logger.error('Failed to get Arweave cost estimate:', error);
      // Fallback estimate
      const arPerMB = 0.0007; // Approximate current rate
      return {
        provider: this.name,
        cost: (size / 1024 / 1024) * arPerMB,
        currency: 'AR',
        duration: -1,
        size,
      };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const startTime = Date.now();
    let online = false;
    let latency = 0;
    let errorRate = 0;

    try {
      const networkInfo = await this.client.network.getInfo();
      online = true;
      latency = Date.now() - startTime;
      logger.debug(`Arweave status check: ${networkInfo.network}, height: ${networkInfo.height}, latency: ${latency}ms`);
    } catch (error) {
      errorRate = 100;
      logger.error('Arweave status check failed:', error);
    }

    return {
      name: this.name,
      online,
      latency,
      errorRate,
      lastCheck: new Date(),
      features: ['upload', 'retrieve', 'verify', 'permanent'],
    };
  }

  async getTransactionStatus(identifier: string): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    
    try {
      const status = await this.client.transactions.getStatus(identifier);
      return status;
    } catch (error) {
      logger.error(`Failed to get transaction status for ${identifier}:`, error);
      return null;
    }
  }

  async getGatewayUrl(identifier: string): Promise<string> {
    return `${config.arweave.gatewayUrl}/${identifier}`;
  }

  async isConfirmed(identifier: string): Promise<boolean> {
    const status = await this.getTransactionStatus(identifier);
    return status && status.confirmed !== null;
  }
}
