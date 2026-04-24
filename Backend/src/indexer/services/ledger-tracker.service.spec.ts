import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LedgerTrackerService } from './ledger-tracker.service';
import { PrismaService } from '../../prisma.service';

describe('LedgerTrackerService', () => {
  let service: LedgerTrackerService;
  let prisma: PrismaService;

  const mockPrisma = {
    ledgerCursor: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    processedEvent: {
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    indexerLog: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'INDEXER_REORG_DEPTH_THRESHOLD') return 5;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerTrackerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LedgerTrackerService>(LedgerTrackerService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLastCursor', () => {
    it('should return cursor from database', async () => {
      const mockCursor = {
        id: '1',
        network: 'testnet',
        lastLedgerSeq: 100,
        lastLedgerHash: 'hash',
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue(mockCursor);

      const result = await service.getLastCursor();

      expect(prisma.ledgerCursor.findUnique).toHaveBeenCalledWith({
        where: { network: 'testnet' },
      });
      expect(result).toEqual(mockCursor);
    });

    it('should return null if cursor not found', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue(null);

      const result = await service.getLastCursor();

      expect(result).toBeNull();
    });
  });

  describe('detectReorg', () => {
    it('should return no reorg if cursor is missing', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue(null);
      const currentLedger = { sequence: 100, hash: 'hash', prevHash: '', closedAt: new Date(), successfulTransactionCount: 0, failedTransactionCount: 0 };

      const result = await service.detectReorg(currentLedger);

      expect(result.hasReorg).toBe(false);
      expect(result.lastValidLedger).toBe(99);
    });

    it('should detect reorg if hashes mismatch at same sequence', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue({
        lastLedgerSeq: 100,
        lastLedgerHash: 'old-hash',
      });
      const currentLedger = { sequence: 100, hash: 'new-hash', prevHash: '', closedAt: new Date(), successfulTransactionCount: 0, failedTransactionCount: 0 };

      const result = await service.detectReorg(currentLedger);

      expect(result.hasReorg).toBe(true);
      expect(result.reorgDepth).toBe(1);
    });

    it('should detect reorg if current ledger is behind cursor', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue({
        lastLedgerSeq: 110,
        lastLedgerHash: 'hash',
      });
      const currentLedger = { sequence: 100, hash: 'hash', prevHash: '', closedAt: new Date(), successfulTransactionCount: 0, failedTransactionCount: 0 };

      const result = await service.detectReorg(currentLedger);

      expect(result.hasReorg).toBe(true);
      expect(result.reorgDepth).toBe(10);
    });
  });

  describe('handleReorg', () => {
    it('should rollback database and update cursor', async () => {
      const reorgResult = {
        hasReorg: true,
        reorgDepth: 3,
        lastValidLedger: 100,
        newLatestLedger: 100,
      };

      const safeLedger = await service.handleReorg(reorgResult);

      expect(prisma.processedEvent.deleteMany).toHaveBeenCalled();
      expect(prisma.ledgerCursor.update).toHaveBeenCalled();
      expect(safeLedger).toBeLessThan(100);
    });
  });

  describe('initializeCursor', () => {
    it('should upsert cursor with start ledger', async () => {
      mockPrisma.ledgerCursor.upsert.mockResolvedValue({
        id: '1',
        network: 'testnet',
        lastLedgerSeq: 50,
      });

      await service.initializeCursor(50);

      expect(prisma.ledgerCursor.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ lastLedgerSeq: 50 })
      }));
    });
  });

  describe('getStartLedger', () => {
    it('should return cursor sequence + 1 if cursor exists', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue({ lastLedgerSeq: 100 });
      
      const result = await service.getStartLedger(1000);
      
      expect(result).toBe(101);
    });

    it('should use configured start ledger if no cursor', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue(null);
      mockConfigService.get.mockImplementation((key) => {
        if (key === 'INDEXER_START_LEDGER') return 500;
        return 'testnet';
      });

      const result = await service.getStartLedger(1000);

      expect(result).toBe(500);
      expect(prisma.ledgerCursor.upsert).toHaveBeenCalled();
    });

    it('should use latest ledger - 1 if no cursor and no config', async () => {
      mockPrisma.ledgerCursor.findUnique.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);

      const result = await service.getStartLedger(1000);

      expect(result).toBe(1000);
    });
  });

  describe('logProgress', () => {
    it('should create indexer log entry', async () => {
      await service.logProgress(100, 200, 5);

      expect(prisma.indexerLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ level: 'info' })
      }));
    });
  });
});
