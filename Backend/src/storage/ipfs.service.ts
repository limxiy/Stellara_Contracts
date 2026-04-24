import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { create as createClient } from 'ipfs-http-client';

@Injectable()
export class IpfsService implements OnModuleInit {
  private readonly logger = new Logger(IpfsService.name);
  private client: any;
  private readonly timeout: number;

  constructor(private readonly configService: ConfigService) {
    this.timeout = this.configService.get<number>('IPFS_TIMEOUT_MS', 30000);
  }

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('IPFS_HOST');
    const port = this.configService.get<number>('IPFS_PORT');
    const protocol = this.configService.get<string>('IPFS_PROTOCOL', 'https');

    if (!host || !port) {
      this.logger.warn('IPFS configuration incomplete, IPFS service will be unavailable');
      return;
    }

    try {
      this.client = createClient({
        host,
        port,
        protocol,
        timeout: this.timeout,
        headers: {
          timeout: this.timeout.toString(),
        },
      });
      this.logger.log(`IPFS client initialized with ${protocol}://${host}:${port}, timeout: ${this.timeout}ms`);
    } catch (error) {
      this.logger.error('Failed to initialize IPFS client:', error);
    }
  }

  async upload(data: Buffer | string, options: { contentType?: string } = {}): Promise<string> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    try {
      const result = await this.client.add({
        content: data,
        ...options,
      });
      this.logger.log(`IPFS upload successful: ${result.cid.toString()}`);
      return result.cid.toString();
    } catch (error) {
      this.logger.error('IPFS upload failed:', error);
      throw error;
    }
  }

  async download(cid: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('IPFS client not initialized');
    }

    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of this.client.cat(cid)) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      this.logger.log(`IPFS download successful: ${cid} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      this.logger.error(`IPFS download failed for ${cid}:`, error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  getTimeout(): number {
    return this.timeout;
  }
}