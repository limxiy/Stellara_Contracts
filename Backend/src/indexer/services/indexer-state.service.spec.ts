import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { IndexerStateService } from './indexer-state.service';

describe('IndexerStateService', () => {
  let service: IndexerStateService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrisma = {
    indexerState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    indexerLog: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerStateService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<IndexerStateService>(IndexerStateService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getState', () => {
    it('should return null when no state exists', async () => {
      mockPrisma.indexerState.findUnique.mockResolvedValue(null);
      
      const result = await service.getState();
      
      expect(result).toBeNull();
      expect(mockPrisma.indexerState.findUnique).toHaveBeenCalledWith({
        where: { network: 'testnet' },
      });
    });

    it('should return state when it exists', async () => {
      const mockState = {
        id: '1',
        network: 'testnet',
        status: 'running',
        lastLedgerSeq: 1000,
        lastLedgerHash: 'hash123',
        processedCount: 50,
        errorCount: 2,
        lastError: null,
        pausedAt: null,
        resumedAt: null,
        resetAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.findUnique.mockResolvedValue(mockState);
      
      const result = await service.getState();
      
      expect(result).toEqual(mockState);
      expect(result?.status).toBe('running');
    });
  });

  describe('initializeState', () => {
    it('should create new state', async () => {
      const mockState = {
        id: '1',
        network: 'testnet',
        status: 'running',
        lastLedgerSeq: 999,
        lastLedgerHash: null,
        processedCount: 0,
        errorCount: 0,
        lastError: null,
        pausedAt: null,
        resumedAt: null,
        resetAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.upsert.mockResolvedValue(mockState);
      
      const result = await service.initializeState(1000);
      
      expect(result).toEqual(mockState);
      expect(mockPrisma.indexerState.upsert).toHaveBeenCalledWith({
        where: { network: 'testnet' },
        update: {
          status: 'running',
          lastLedgerSeq: 999,
          lastLedgerHash: null,
          processedCount: 0,
          errorCount: 0,
          lastError: null,
          pausedAt: null,
          resumedAt: null,
          resetAt: null,
          metadata: null,
        },
        create: {
          network: 'testnet',
          status: 'running',
          lastLedgerSeq: 999,
          processedCount: 0,
          errorCount: 0,
        },
      });
    });
  });

  describe('pauseIndexer', () => {
    it('should pause indexer successfully', async () => {
      const mockState = {
        id: '1',
        network: 'testnet',
        status: 'paused',
        lastLedgerSeq: 1000,
        lastLedgerHash: 'hash123',
        processedCount: 50,
        errorCount: 2,
        lastError: null,
        pausedAt: new Date(),
        resumedAt: null,
        resetAt: null,
        metadata: { pauseReason: 'manual pause' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.update.mockResolvedValue(mockState);
      mockPrisma.indexerState.findUnique.mockResolvedValue({ metadata: {} });
      
      const result = await service.pauseIndexer('manual pause');
      
      expect(result.status).toBe('paused');
      expect(result.pausedAt).toBeDefined();
      expect(mockPrisma.indexerState.update).toHaveBeenCalledWith({
        where: { network: 'testnet' },
        data: {
          status: 'paused',
          pausedAt: expect.any(Date),
          metadata: expect.objectContaining({
            pauseReason: 'manual pause',
          }),
        },
      });
    });
  });

  describe('resumeIndexer', () => {
    it('should resume indexer successfully', async () => {
      const pausedState = {
        id: '1',
        network: 'testnet',
        status: 'paused',
        lastLedgerSeq: 1000,
        lastLedgerHash: 'hash123',
        processedCount: 50,
        errorCount: 2,
        lastError: null,
        pausedAt: new Date(),
        resumedAt: null,
        resetAt: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resumedState = {
        ...pausedState,
        status: 'running',
        resumedAt: new Date(),
        lastError: null,
      };

      mockPrisma.indexerState.findUnique.mockResolvedValue(pausedState);
      mockPrisma.indexerState.update.mockResolvedValue(resumedState);
      mockPrisma.indexerState.findUnique.mockResolvedValue({ metadata: {} });
      
      const result = await service.resumeIndexer();
      
      expect(result.status).toBe('running');
      expect(result.resumedAt).toBeDefined();
      expect(mockPrisma.indexerState.update).toHaveBeenCalledWith({
        where: { network: 'testnet' },
        data: {
          status: 'running',
          resumedAt: expect.any(Date),
          lastError: null,
          metadata: expect.objectContaining({
            resumedAt: expect.any(String),
          }),
        },
      });
    });

    it('should throw error when trying to resume running indexer', async () => {
      const runningState = {
        id: '1',
        network: 'testnet',
        status: 'running',
        lastLedgerSeq: 1000,
        processedCount: 50,
        errorCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.findUnique.mockResolvedValue(runningState);
      
      await expect(service.resumeIndexer()).rejects.toThrow(
        'Cannot resume: indexer is in running state'
      );
    });
  });

  describe('resetIndexer', () => {
    it('should reset indexer state with backup', async () => {
      const resetState = {
        id: '1',
        network: 'testnet',
        status: 'running',
        lastLedgerSeq: 0,
        lastLedgerHash: null,
        processedCount: 0,
        errorCount: 0,
        lastError: null,
        pausedAt: null,
        resumedAt: null,
        resetAt: new Date(),
        metadata: { resetReason: 'manual reset' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.update.mockResolvedValue(resetState);
      mockPrisma.indexerLog.create.mockResolvedValue({});
      mockPrisma.indexerState.findUnique.mockResolvedValue({ metadata: {} });
      
      const result = await service.resetIndexer(0, 'manual reset');
      
      expect(result.status).toBe('running');
      expect(result.lastLedgerSeq).toBe(0);
      expect(result.processedCount).toBe(0);
      expect(result.resetAt).toBeDefined();
      expect(mockPrisma.indexerLog.create).toHaveBeenCalledWith({
        data: {
          level: 'info',
          message: 'Indexer state backup',
          metadata: {
            type: 'state_backup',
            backupData: expect.any(Object),
            timestamp: expect.any(String),
          },
        },
      });
    });
  });

  describe('recordError', () => {
    it('should record error in state', async () => {
      const error = new Error('Test error');
      
      mockPrisma.indexerState.update.mockResolvedValue({});
      mockPrisma.indexerState.findUnique.mockResolvedValue({ metadata: {} });
      
      await service.recordError(error, 1000);
      
      expect(mockPrisma.indexerState.update).toHaveBeenCalledWith({
        where: { network: 'testnet' },
        data: {
          status: 'error',
          lastError: 'Test error',
          errorCount: { increment: 1 },
          metadata: expect.objectContaining({
            lastErrorAt: expect.any(String),
            lastErrorStack: expect.any(String),
            errorLedgerSeq: 1000,
          }),
        },
      });
    });
  });

  describe('getStateStats', () => {
    it('should return stats for initialized state', async () => {
      const mockState = {
        id: '1',
        network: 'testnet',
        status: 'running',
        lastLedgerSeq: 1000,
        processedCount: 100,
        errorCount: 5,
        resumedAt: new Date(Date.now() - 3600000), // 1 hour ago
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.indexerState.findUnique.mockResolvedValue(mockState);
      
      const stats = await service.getStateStats();
      
      expect(stats.initialized).toBe(true);
      expect(stats.status).toBe('running');
      expect(stats.currentLedger).toBe(1000);
      expect(stats.processedCount).toBe(100);
      expect(stats.errorCount).toBe(5);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should return not initialized when no state exists', async () => {
      mockPrisma.indexerState.findUnique.mockResolvedValue(null);
      
      const stats = await service.getStateStats();
      
      expect(stats.initialized).toBe(false);
      expect(stats.message).toBe('Indexer state not found');
    });
  });
});
