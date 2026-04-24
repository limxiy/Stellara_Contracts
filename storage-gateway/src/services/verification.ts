import crypto from 'crypto';
import { VerificationResult } from '@/types';
import config from '@/config';
import logger from '@/utils/logger';

export class VerificationService {
  private algorithm: string;

  constructor() {
    this.algorithm = config.contentVerification.hashAlgorithm;
  }

  async verifyContent(content: Buffer, expectedHash?: string): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      const actualHash = this.calculateHash(content);
      const isValid = !expectedHash || actualHash === expectedHash;
      
      const result: VerificationResult = {
        valid: isValid,
        expectedHash: expectedHash || actualHash,
        actualHash,
        provider: 'verification',
        timestamp: new Date(),
      };

      logger.debug(`Content verification completed in ${Date.now() - startTime}ms. Valid: ${isValid}`);
      return result;
    } catch (error) {
      logger.error('Content verification failed:', error);
      return {
        valid: false,
        expectedHash: expectedHash || '',
        actualHash: '',
        provider: 'verification',
        timestamp: new Date(),
      };
    }
  }

  calculateHash(content: Buffer): string {
    switch (this.algorithm) {
      case 'sha256':
        return crypto.createHash('sha256').update(content).digest('hex');
      case 'sha1':
        return crypto.createHash('sha1').update(content).digest('hex');
      case 'md5':
        return crypto.createHash('md5').update(content).digest('hex');
      case 'sha384':
        return crypto.createHash('sha384').update(content).digest('hex');
      case 'sha512':
        return crypto.createHash('sha512').update(content).digest('hex');
      default:
        throw new Error(`Unsupported hash algorithm: ${this.algorithm}`);
    }
  }

  async verifyIntegrity(content: Buffer, metadata: any): Promise<boolean> {
    try {
      // Verify content size matches metadata
      if (metadata.size && content.length !== metadata.size) {
        logger.warn(`Content size mismatch. Expected: ${metadata.size}, Actual: ${content.length}`);
        return false;
      }

      // Verify content hash if provided
      if (metadata.hash) {
        const actualHash = this.calculateHash(content);
        if (actualHash !== metadata.hash) {
          logger.warn(`Content hash mismatch. Expected: ${metadata.hash}, Actual: ${actualHash}`);
          return false;
        }
      }

      // Verify content type if provided
      if (metadata.contentType) {
        const detectedType = this.detectContentType(content);
        if (!this.isContentTypeCompatible(detectedType, metadata.contentType)) {
          logger.warn(`Content type mismatch. Expected: ${metadata.contentType}, Detected: ${detectedType}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Integrity verification failed:', error);
      return false;
    }
  }

  detectContentType(content: Buffer): string {
    // Simple content type detection based on file signatures
    const signatures: { [key: string]: string } = {
      '89504e47': 'image/png',
      'ffd8ffe': 'image/jpeg',
      '47494638': 'image/gif',
      '25504446': 'application/pdf',
      '504b0304': 'application/zip',
      'd0cf11e0': 'application/msword',
      '7b5c7274': 'application/rtf',
      '3c3f786d': 'application/xml',
      '494e53': 'application/json',
    };

    const header = content.subarray(0, 8).toString('hex').toLowerCase();
    
    for (const [signature, mimeType] of Object.entries(signatures)) {
      if (header.startsWith(signature.toLowerCase())) {
        return mimeType;
      }
    }

    // Try to detect text content
    if (this.isTextContent(content)) {
      return 'text/plain';
    }

    return 'application/octet-stream';
  }

  private isTextContent(content: Buffer): boolean {
    // Simple heuristic to detect text content
    const sample = content.subarray(0, Math.min(512, content.length));
    let textBytes = 0;
    
    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textBytes++;
      }
    }
    
    return textBytes / sample.length > 0.7; // 70% text characters
  }

  private isContentTypeCompatible(detected: string, expected: string): boolean {
    // Exact match
    if (detected === expected) {
      return true;
    }

    // Generic type compatibility
    const detectedGeneric = detected.split('/')[0];
    const expectedGeneric = expected.split('/')[0];
    
    if (detectedGeneric === expectedGeneric) {
      return true;
    }

    // Special cases
    if (expectedGeneric === 'text' && detectedGeneric === 'application') {
      return detected.includes('json') || detected.includes('xml') || detected.includes('javascript');
    }

    return false;
  }

  async generateChecksum(content: Buffer, algorithm?: string): Promise<string> {
    const algo = algorithm || this.algorithm;
    return crypto.createHash(algo).update(content).digest('hex');
  }

  async verifyMultipleHashes(content: Buffer, expectedHashes: { [algorithm: string]: string }): Promise<{ [algorithm: string]: boolean }> {
    const results: { [algorithm: string]: boolean } = {};
    
    for (const [algorithm, expectedHash] of Object.entries(expectedHashes)) {
      try {
        const actualHash = crypto.createHash(algorithm).update(content).digest('hex');
        results[algorithm] = actualHash === expectedHash;
      } catch (error) {
        logger.error(`Hash verification failed for ${algorithm}:`, error);
        results[algorithm] = false;
      }
    }
    
    return results;
  }

  async verifyWithSalt(content: Buffer, expectedHash: string, salt: string): Promise<boolean> {
    try {
      const saltedContent = Buffer.concat([Buffer.from(salt), content]);
      const actualHash = crypto.createHash(this.algorithm).update(saltedContent).digest('hex');
      return actualHash === expectedHash;
    } catch (error) {
      logger.error('Salted hash verification failed:', error);
      return false;
    }
  }

  async verifyChunked(content: Buffer, expectedHash: string, chunkSize: number = 1024 * 1024): Promise<boolean> {
    try {
      const hash = crypto.createHash(this.algorithm);
      
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.subarray(i, i + chunkSize);
        hash.update(chunk);
      }
      
      const actualHash = hash.digest('hex');
      return actualHash === expectedHash;
    } catch (error) {
      logger.error('Chunked hash verification failed:', error);
      return false;
    }
  }

  getSupportedAlgorithms(): string[] {
    return ['sha256', 'sha1', 'md5', 'sha384', 'sha512'];
  }

  async benchmarkAlgorithm(content: Buffer, algorithm: string): Promise<number> {
    const startTime = Date.now();
    crypto.createHash(algorithm).update(content).digest('hex');
    return Date.now() - startTime;
  }

  async benchmarkAllAlgorithms(content: Buffer): Promise<{ [algorithm: string]: number }> {
    const results: { [algorithm: string]: number } = {};
    
    for (const algorithm of this.getSupportedAlgorithms()) {
      results[algorithm] = await this.benchmarkAlgorithm(content, algorithm);
    }
    
    return results;
  }
}
