import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { create } from 'ipfs-http-client';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import {
  IPFSConnectionError,
  IPFSPinningError,
  ImageOptimizationError,
  IPFSVerificationError,
} from './storage.exceptions';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private ipfs: ReturnType<typeof create>;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor(private readonly configService: ConfigService) {
    const ipfsHost = this.configService.get<string>('IPFS_HOST', 'ipfs.infura.io');
    const ipfsPort = this.configService.get<number>('IPFS_PORT', 5001);
    const ipfsProtocol = this.configService.get<string>('IPFS_PROTOCOL', 'https');

    this.ipfs = create({
      host: ipfsHost,
      port: ipfsPort,
      protocol: ipfsProtocol,
    });

    this.logger.log(`IPFS client initialized with ${ipfsProtocol}://${ipfsHost}:${ipfsPort}`);
  }

  /**
   * Retry logic with exponential backoff for transient failures
   */
  private async retryOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `${operationName} failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
        );

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Pin project metadata to IPFS with error handling and retry logic
   */
  async pinProjectMetadata(metadata: any): Promise<string> {
    try {
      this.logger.log('Pinning metadata to IPFS...');

      const result = await this.retryOperation(
        async () => {
          const added = await this.ipfs.add(JSON.stringify(metadata));
          return added;
        },
        'IPFS pin operation',
      );

      const cid = result.path || result.cid.toString();
      this.logger.log(`Successfully pinned metadata to IPFS: ${cid}`);
      return cid;
    } catch (error) {
      this.logger.error(`Failed to pin metadata to IPFS: ${error.message}`, error.stack);
      throw new IPFSPinningError(
        `Failed to pin project metadata: ${error.message}`,
      );
    }
  }

  /**
   * Optimize image with file validation and error handling
   */
  async optimizeImage(imagePath: string, width: number, height: number): Promise<Buffer> {
    try {
      this.logger.log(`Optimizing image: ${imagePath} to ${width}x${height}`);

      // Validate file exists
      const absolutePath = path.resolve(imagePath);
      if (!fs.existsSync(absolutePath)) {
        throw new ImageOptimizationError(`Image file not found: ${absolutePath}`);
      }

      // Validate file is readable
      const stats = fs.statSync(absolutePath);
      if (!stats.isFile()) {
        throw new ImageOptimizationError(`Path is not a file: ${absolutePath}`);
      }

      // Optimize image
      const optimizedImage = await sharp(absolutePath)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      this.logger.log(
        `Image optimized successfully: ${imagePath} (${optimizedImage.length} bytes)`,
      );
      return optimizedImage;
    } catch (error) {
      if (error instanceof ImageOptimizationError) {
        throw error;
      }

      this.logger.error(`Failed to optimize image: ${error.message}`, error.stack);
      throw new ImageOptimizationError(
        `Image optimization failed for ${imagePath}: ${error.message}`,
      );
    }
  }

  /**
   * Verify IPFS hash with proper error handling
   */
  async verifyIPFSHash(hash: string): Promise<boolean> {
    try {
      this.logger.log(`Verifying IPFS hash: ${hash}`);

      if (!hash || hash.trim().length === 0) {
        this.logger.warn('Empty hash provided for verification');
        return false;
      }

      await this.retryOperation(
        async () => {
          await this.ipfs.cat(hash);
        },
        'IPFS verification operation',
      );

      this.logger.log(`IPFS hash verified successfully: ${hash}`);
      return true;
    } catch (error) {
      this.logger.error(
        `IPFS hash verification failed for ${hash}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
