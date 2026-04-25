import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { EventReplayService } from './event-replay.service';
import { CreateReplayRequest, ReplayStatus, ConflictResolution } from '../types/event-replay.types';

describe('EventReplayService', () => {
  let service: EventReplayService;
  let prisma: PrismaService;
  let configService: ConfigService;

  const mockPrisma = {
    eventReplay: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    replayEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    processedEvent: {
      count: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'REPLAY_MAX_CONCURRENT') return 3;
      if (key === 'REPLAY_BATCH_SIZE') return 100;
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventReplayService,
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

    service = module.get<EventReplayService>(EventReplayService);
    prisma = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startReplay', () => {
    it('should start a new replay operation', async () => {
      const request: CreateReplayRequest = {
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        dryRun: false,
        conflictResolution: 'skip',
      };

      const mockReplay = {
        id: 'replay1',
        network: 'testnet',
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        status: 'pending',
        dryRun: false,
        conflictResolution: 'skip',
        processedEvents: 0,
        totalEvents: 0,
        skippedEvents: 0,
        errorEvents: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.eventReplay.create.mockResolvedValue(mockReplay);
      mockPrisma.eventReplay.count.mockResolvedValue(0); // No active replays

      const result = await service.startReplay(request);

      expect(result.id).toBe('replay1');
      expect(result.status).toBe('pending');
      expect(result.startLedgerSeq).toBe(1000);
      expect(result.endLedgerSeq).toBe(2000);
      expect(result.dryRun).toBe(false);
      expect(result.conflictResolution).toBe('skip');

      expect(mockPrisma.eventReplay.create).toHaveBeenCalledWith({
        data: {
          network: 'testnet',
          startLedgerSeq: 1000,
          endLedgerSeq: 2000,
          dryRun: false,
          conflictResolution: 'skip',
          metadata: {
            contractIds: undefined,
            eventTypes: undefined,
            options: undefined,
          },
        },
      });
    });

    it('should throw error for invalid ledger range', async () => {
      const request: CreateReplayRequest = {
        startLedgerSeq: 2000,
        endLedgerSeq: 1000, // Invalid: start > end
        dryRun: false,
        conflictResolution: 'skip',
      };

      await expect(service.startReplay(request)).rejects.toThrow('Invalid replay request');
    });

    it('should throw error when max concurrent replays reached', async () => {
      const request: CreateReplayRequest = {
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        dryRun: false,
        conflictResolution: 'skip',
      };

      mockPrisma.eventReplay.count.mockResolvedValue(3); // Max concurrent reached
      mockPrisma.eventReplay.create.mockResolvedValue({} as any);

      await expect(service.startReplay(request)).rejects.toThrow('Maximum concurrent replays (3) reached');
    });
  });

  describe('getReplay', () => {
    it('should return replay details', async () => {
      const replayId = 'replay1';
      const mockReplay = {
        id: replayId,
        network: 'testnet',
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        status: 'completed',
        dryRun: false,
        conflictResolution: 'skip',
        processedEvents: 500,
        totalEvents: 500,
        skippedEvents: 0,
        errorEvents: 0,
        currentLedgerSeq: 2000,
        errors: null,
        metadata: null,
        startedAt: new Date(),
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        replayEvents: [],
      };

      mockPrisma.eventReplay.findUnique.mockResolvedValue(mockReplay);

      const result = await service.getReplay(replayId);

      expect(result).toEqual(mockReplay);
      expect(mockPrisma.eventReplay.findUnique).toHaveBeenCalledWith({
        where: { id: replayId },
        include: {
          replayEvents: {
            orderBy: { ledgerSeq: 'asc' },
          },
        },
      });
    });

    it('should return null for non-existent replay', async () => {
      mockPrisma.eventReplay.findUnique.mockResolvedValue(null);

      const result = await service.getReplay('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getReplayProgress', () => {
    it('should return replay progress', async () => {
      const replayId = 'replay1';
      const mockReplay = {
        id: replayId,
        network: 'testnet',
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        status: 'running',
        dryRun: false,
        conflictResolution: 'skip',
        processedEvents: 250,
        totalEvents: 500,
        skippedEvents: 10,
        errorEvents: 5,
        currentLedgerSeq: 1500,
        startedAt: new Date(Date.now() - 60000), // 1 minute ago
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.eventReplay.findUnique.mockResolvedValue(mockReplay);

      const result = await service.getReplayProgress(replayId);

      expect(result).toBeDefined();
      expect(result!.replayId).toBe(replayId);
      expect(result!.status).toBe('running');
      expect(result!.currentLedgerSeq).toBe(1500);
      expect(result!.totalLedgers).toBe(1001);
      expect(result!.processedLedgers).toBe(501);
      expect(result!.processedEvents).toBe(250);
      expect(result!.totalEvents).toBe(500);
      expect(result!.skippedEvents).toBe(10);
      expect(result!.errorEvents).toBe(5);
    });

    it('should return null for non-existent replay', async () => {
      mockPrisma.eventReplay.findUnique.mockResolvedValue(null);

      const result = await service.getReplayProgress('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('cancelReplay', () => {
    it('should cancel a running replay', async () => {
      const replayId = 'replay1';

      mockPrisma.eventReplay.update.mockResolvedValue({} as any);

      await service.cancelReplay(replayId);

      expect(mockPrisma.eventReplay.update).toHaveBeenCalledWith({
        where: { id: replayId },
        data: {
          status: 'cancelled',
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('listReplays', () => {
    it('should list replays with filtering', async () => {
      const filter = { status: 'completed' as ReplayStatus };
      const mockReplays = [
        {
          id: 'replay1',
          network: 'testnet',
          status: 'completed',
          startLedgerSeq: 1000,
          endLedgerSeq: 2000,
          dryRun: false,
          conflictResolution: 'skip',
          processedEvents: 500,
          totalEvents: 500,
          skippedEvents: 0,
          errorEvents: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          replayEvents: [],
        },
        {
          id: 'replay2',
          network: 'testnet',
          status: 'completed',
          startLedgerSeq: 2000,
          endLedgerSeq: 3000,
          dryRun: true,
          conflictResolution: 'overwrite',
          processedEvents: 1000,
          totalEvents: 1000,
          skippedEvents: 0,
          errorEvents: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          replayEvents: [],
        },
      ];

      mockPrisma.eventReplay.findMany.mockResolvedValue(mockReplays);

      const result = await service.listReplays(filter);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('completed');
      expect(result[1].status).toBe('completed');
      expect(mockPrisma.eventReplay.findMany).toHaveBeenCalledWith({
        where: { network: 'testnet', status: 'completed' },
        orderBy: { createdAt: 'desc' },
        include: {
          replayEvents: {
            orderBy: { ledgerSeq: 'asc' },
            take: 10,
          },
        },
      });
    });
  });

  describe('getReplayStatistics', () => {
    it('should return replay statistics', async () => {
      mockPrisma.eventReplay.count.mockResolvedValue(10);
      mockPrisma.eventReplay.count.mockResolvedValueOnce(2); // running
      mockPrisma.eventReplay.count.mockResolvedValueOnce(7); // completed
      mockPrisma.eventReplay.count.mockResolvedValueOnce(1); // failed
      mockPrisma.eventReplay.findMany.mockResolvedValue([]);
      mockPrisma.eventReplay.aggregate.mockResolvedValue({
        _sum: { processedEvents: 3000 },
      });

      const stats = await service.getReplayStatistics();

      expect(stats.totalReplays).toBe(10);
      expect(stats.activeReplays).toBe(2);
      expect(stats.completedReplays).toBe(7);
      expect(stats.failedReplays).toBe(1);
      expect(stats.totalEventsReplayed).toBe(3000);
      expect(stats.successRate).toBe(70); // 7/10 * 100
      expect(stats.mostActiveNetwork).toBe('testnet');
      expect(stats.recentReplays).toEqual([]);
    });
  });

  describe('getReplayResult', () => {
    it('should return replay result and summary', async () => {
      const replayId = 'replay1';
      const mockReplay = {
        id: replayId,
        network: 'testnet',
        startLedgerSeq: 1000,
        endLedgerSeq: 2000,
        status: 'completed',
        dryRun: false,
        conflictResolution: 'skip',
        processedEvents: 500,
        totalEvents: 500,
        skippedEvents: 10,
        errorEvents: 5,
        currentLedgerSeq: 2000,
        errors: null,
        metadata: null,
        startedAt: new Date(Date.now() - 300000), // 5 minutes ago
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        replayEvents: [
          {
            id: 'event1',
            replayId,
            eventId: 'event1',
            ledgerSeq: 1000,
            contractId: 'contract1',
            eventType: 'TEST_EVENT',
            transactionHash: 'hash1',
            eventData: {},
            status: 'processed',
            processedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      };

      mockPrisma.eventReplay.findUnique.mockResolvedValue(mockReplay);

      const result = await service.getReplayResult(replayId);

      expect(result).toBeDefined();
      expect(result!.replay.id).toBe(replayId);
      expect(result!.events).toHaveLength(1);
      expect(result!.summary.totalEvents).toBe(500);
      expect(result!.summary.processedEvents).toBe(500);
      expect(result!.summary.skippedEvents).toBe(10);
      expect(result!.summary.errorEvents).toBe(5);
    });

    it('should return null for non-existent replay', async () => {
      mockPrisma.eventReplay.findUnique.mockResolvedValue(null);

      const result = await service.getReplayResult('non-existent');

      expect(result).toBeNull();
    });
  });
});
