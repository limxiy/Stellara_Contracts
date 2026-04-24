import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service';

type MetadataCompleteness = 'complete' | 'partial' | 'minimal' | 'fallback';

interface CachedMetadata {
  value: ProjectMetadataResolution;
  expiresAt: number;
}

interface RawProjectMetadata {
  title?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  image?: unknown;
  imageUrl?: unknown;
  tags?: unknown;
}

export interface ProjectMetadataResolution {
  title: string;
  description: string | null;
  category: string;
  image: string | null;
  tags: string[];
  ipfsHash: string | null;
  completeness: MetadataCompleteness;
  source: 'ipfs' | 'fallback';
}

@Injectable()
export class ProjectMetadataService {
  private readonly logger = new Logger(ProjectMetadataService.name);
  private readonly cache = new Map<string, CachedMetadata>();

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async resolveProjectMetadata(
    projectId: number,
    ipfsHash?: string,
  ): Promise<ProjectMetadataResolution> {
    const normalizedHash = this.normalizeHash(ipfsHash);

    if (!normalizedHash) {
      const fallback = this.buildFallback(projectId, null);
      this.recordMetadataOutcome('no_hash', fallback.completeness);
      return fallback;
    }

    const cached = this.getFromCache(normalizedHash);
    if (cached) {
      this.recordMetadataOutcome('cached', cached.completeness);
      return cached;
    }

    const rawMetadata = await this.fetchMetadata(normalizedHash);

    if (!rawMetadata) {
      const fallback = this.buildFallback(projectId, normalizedHash);
      this.recordMetadataOutcome('fetch_failed', fallback.completeness);
      this.setCache(normalizedHash, fallback);
      return fallback;
    }

    const parsed = this.parseMetadata(rawMetadata, projectId, normalizedHash);
    this.setCache(normalizedHash, parsed);
    this.recordMetadataOutcome('fetched', parsed.completeness);
    return parsed;
  }

  private async fetchMetadata(hash: string): Promise<RawProjectMetadata | null> {
    const gateways = this.getGateways();

    for (const gateway of gateways) {
      const url = `${gateway}/${hash}`;

      try {
        const metadata = await this.fetchJson(url);
        if (!metadata || typeof metadata !== 'object') {
          this.logger.warn(`IPFS metadata at ${url} is not a JSON object.`);
          continue;
        }

        return metadata as RawProjectMetadata;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown IPFS fetch error';
        this.logger.warn(`Failed to fetch IPFS metadata from ${url}: ${errorMessage}`);
      }
    }

    return null;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const timeoutMs = this.configService.get<number>('PROJECT_METADATA_FETCH_TIMEOUT_MS', 5000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseMetadata(
    raw: RawProjectMetadata,
    projectId: number,
    ipfsHash: string,
  ): ProjectMetadataResolution {
    const title = this.sanitizeString(raw.title ?? raw.name, 120) || `Project ${projectId}`;
    const description = this.sanitizeString(raw.description, 2000);
    const category = this.normalizeCategory(raw.category);
    const image = this.sanitizeString(raw.image ?? raw.imageUrl, 512);
    const tags = this.normalizeTags(raw.tags);

    const completeness = this.determineCompleteness({
      title,
      description,
      category,
      image,
      tags,
    });

    return {
      title,
      description,
      category,
      image,
      tags,
      ipfsHash,
      completeness,
      source: 'ipfs',
    };
  }

  private determineCompleteness(metadata: {
    title: string;
    description: string | null;
    category: string;
    image: string | null;
    tags: string[];
  }): MetadataCompleteness {
    const hasDescription = Boolean(metadata.description);
    const hasCategory = metadata.category !== 'uncategorized';
    const hasImage = Boolean(metadata.image);
    const hasTags = metadata.tags.length > 0;

    const richFieldCount = [hasDescription, hasCategory, hasImage, hasTags].filter(Boolean).length;

    if (richFieldCount >= 3) {
      return 'complete';
    }

    if (richFieldCount >= 1) {
      return 'partial';
    }

    return 'minimal';
  }

  private normalizeCategory(value: unknown): string {
    const sanitized = this.sanitizeString(value, 64);
    if (!sanitized) {
      return 'uncategorized';
    }

    return sanitized.toLowerCase();
  }

  private normalizeTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.sanitizeString(entry, 32))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 10);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => this.sanitizeString(entry, 32))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, 10);
    }

    return [];
  }

  private sanitizeString(value: unknown, maxLength: number): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return null;
    }

    return cleaned.slice(0, maxLength);
  }

  private normalizeHash(hash?: string): string | null {
    if (!hash || typeof hash !== 'string') {
      return null;
    }

    let normalized = hash.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('ipfs://')) {
      normalized = normalized.slice('ipfs://'.length);
    }

    if (normalized.startsWith('/ipfs/')) {
      normalized = normalized.slice('/ipfs/'.length);
    }

    if (normalized.includes('/')) {
      normalized = normalized.split('/')[0];
    }

    return normalized || null;
  }

  private buildFallback(projectId: number, ipfsHash: string | null): ProjectMetadataResolution {
    return {
      title: `Project ${projectId}`,
      description: null,
      category: 'uncategorized',
      image: null,
      tags: [],
      ipfsHash,
      completeness: 'fallback',
      source: 'fallback',
    };
  }

  private getGateways(): string[] {
    const defaultGateway = this.configService.get<string>('IPFS_GATEWAY_URL', 'https://ipfs.io/ipfs');
    const configuredGateways = this.configService.get<string>('IPFS_GATEWAY_URLS', '');

    const gateways = [
      ...configuredGateways
        .split(',')
        .map((gateway) => gateway.trim())
        .filter(Boolean),
      defaultGateway,
      'https://cloudflare-ipfs.com/ipfs',
    ];

    const normalizedGateways = gateways.map((gateway) => gateway.replace(/\/+$/, ''));
    return Array.from(new Set(normalizedGateways));
  }

  private getCacheTtlMs(): number {
    return this.configService.get<number>('PROJECT_METADATA_CACHE_TTL_MS', 10 * 60 * 1000);
  }

  private getCacheMaxEntries(): number {
    return this.configService.get<number>('PROJECT_METADATA_CACHE_MAX_ENTRIES', 500);
  }

  private getFromCache(hash: string): ProjectMetadataResolution | null {
    const cached = this.cache.get(hash);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(hash);
      return null;
    }

    return cached.value;
  }

  private setCache(hash: string, value: ProjectMetadataResolution): void {
    if (this.cache.size >= this.getCacheMaxEntries()) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(hash, {
      value,
      expiresAt: Date.now() + this.getCacheTtlMs(),
    });
  }

  private recordMetadataOutcome(
    outcome: 'fetched' | 'cached' | 'fetch_failed' | 'no_hash',
    completeness: MetadataCompleteness,
  ): void {
    this.metricsService.recordProjectMetadataFetch(outcome);
    this.metricsService.recordProjectMetadataCompleteness(completeness);
  }
}