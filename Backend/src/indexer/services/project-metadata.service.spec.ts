import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProjectMetadataService } from './project-metadata.service';
import { MetricsService } from '../../metrics/metrics.service';

describe('ProjectMetadataService', () => {
  let service: ProjectMetadataService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        IPFS_GATEWAY_URL: 'https://ipfs.io/ipfs',
        IPFS_GATEWAY_URLS: '',
        PROJECT_METADATA_FETCH_TIMEOUT_MS: 1000,
        PROJECT_METADATA_CACHE_TTL_MS: 60_000,
        PROJECT_METADATA_CACHE_MAX_ENTRIES: 100,
      };

      return config[key] ?? defaultValue;
    }),
  };

  const mockMetricsService = {
    recordProjectMetadataFetch: jest.fn(),
    recordProjectMetadataCompleteness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMetadataService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    service = module.get<ProjectMetadataService>(ProjectMetadataService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns fallback metadata when hash is missing', async () => {
    const result = await service.resolveProjectMetadata(42, undefined);

    expect(result.title).toBe('Project 42');
    expect(result.category).toBe('uncategorized');
    expect(result.source).toBe('fallback');
    expect(mockMetricsService.recordProjectMetadataFetch).toHaveBeenCalledWith('no_hash');
  });

  it('fetches metadata from IPFS and sanitizes fields', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: '  My Project\n\u0000',
        description: 'Long description',
        category: 'DeFi ',
        image: 'https://example.com/image.png',
        tags: ['lending', 'yield'],
      }),
    } as Response);

    const result = await service.resolveProjectMetadata(1, 'QmValidHash123456789012345678901234567890123456');

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.title).toBe('My Project');
    expect(result.description).toBe('Long description');
    expect(result.category).toBe('defi');
    expect(result.tags).toEqual(['lending', 'yield']);
    expect(result.source).toBe('ipfs');
    expect(mockMetricsService.recordProjectMetadataFetch).toHaveBeenCalledWith('fetched');
  });

  it('uses cache to avoid repeated IPFS fetches', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Cached Project',
      }),
    } as Response);

    const hash = 'QmCacheHash123456789012345678901234567890123456';

    const first = await service.resolveProjectMetadata(5, hash);
    const second = await service.resolveProjectMetadata(5, hash);

    expect(first.title).toBe('Cached Project');
    expect(second.title).toBe('Cached Project');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockMetricsService.recordProjectMetadataFetch).toHaveBeenCalledWith('cached');
  });

  it('falls back to generic metadata when IPFS fetch fails', async () => {
    jest.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('network failure'));

    const result = await service.resolveProjectMetadata(7, 'QmMissingHash12345678901234567890123456789012345');

    expect(result.title).toBe('Project 7');
    expect(result.source).toBe('fallback');
    expect(mockMetricsService.recordProjectMetadataFetch).toHaveBeenCalledWith('fetch_failed');
    expect(mockMetricsService.recordProjectMetadataCompleteness).toHaveBeenCalledWith('fallback');
  });
});
