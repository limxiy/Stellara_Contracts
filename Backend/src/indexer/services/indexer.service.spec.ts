import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from './indexer.service';
import { PrismaService } from '../../prisma.service';
import { LedgerTrackerService } from './ledger-tracker.service';
import { EventHandlerService } from './event-handler.service';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { createMockSorobanEvent } from '../tests/fixtures/event.fixtures';

// Mock the entire stellar-sdk
jest.mock('@stellar/stellar-sdk', () => {
  return {
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
        getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
        getEvents: jest.fn().mockResolvedValue({
          events: [],
          cursor: undefined,
        }),
      })),
    },
  };
});

describe('IndexerService', () => {
  let service: IndexerService;
  let ledgerTracker: LedgerTrackerService;
  let eventHandler: EventHandlerService;
  let rpcMock: any;

  const mockPrisma = {};
  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'STELLAR_RPC_URL') return 'https://mock-rpc.org';
      return defaultValue;
    }),
  };

  const mockLedgerTracker = {
    getLastCursor: jest.fn(),
    updateCursor: jest.fn(),
    getStartLedger: jest.fn(),
    isEventProcessed: jest.fn(),
    markEventProcessed: jest.fn(),
    logProgress: jest.fn(),
    logError: jest.fn(),
  };

  const mockEventHandler = {
    processEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexerService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LedgerTrackerService, useValue: mockLedgerTracker },
        { provide: EventHandlerService, useValue: mockEventHandler },
      ],
    }).compile();

    service = module.get<IndexerService>(IndexerService);
    ledgerTracker = module.get<LedgerTrackerService>(LedgerTrackerService);
    eventHandler = module.get<EventHandlerService>(EventHandlerService);
    
    // Access the private rpc member for verification
    rpcMock = (service as any).rpc;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize indexer correctly', async () => {
      mockLedgerTracker.getStartLedger.mockResolvedValue(100);
      rpcMock.getHealth.mockResolvedValue({ status: 'healthy' });
      rpcMock.getLatestLedger.mockResolvedValue({ sequence: 1000 });

      await service.onModuleInit();

      expect(rpcMock.getHealth).toHaveBeenCalled();
      expect(ledgerTracker.getStartLedger).toHaveBeenCalledWith(1000);
    });

    it('should log error if initialization fails', async () => {
      rpcMock.getHealth.mockRejectedValue(new Error('Down'));
      
      await expect(service.onModuleInit()).rejects.toThrow('Down');
    });
  });

  describe('pollEvents', () => {
    it('should skip if already running', async () => {
      (service as any).isRunning = true;
      await service.pollEvents();
      expect(rpcMock.getLatestLedger).not.toHaveBeenCalled();
    });

    it('should skip if no new ledgers', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 1000 });
      rpcMock.getLatestLedger.mockResolvedValue({ sequence: 1000 });

      await service.pollEvents();

      expect(rpcMock.getEvents).not.toHaveBeenCalled();
    });

    it('should update cursor even if no events found', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpcMock.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      rpcMock.getEvents.mockResolvedValue({ events: [] });

      await service.pollEvents();

      expect(ledgerTracker.updateCursor).toHaveBeenCalledWith(1000);
    });

    it('should handle event processing failure', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpcMock.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      
      const mockEvent = createMockSorobanEvent({ id: 'e1' });
      rpcMock.getEvents.mockResolvedValue({ events: [mockEvent] });

      mockLedgerTracker.isEventProcessed.mockResolvedValue(false);
      mockEventHandler.processEvent.mockRejectedValue(new Error('Process Fail'));

      await service.pollEvents();

      expect(ledgerTracker.logError).toHaveBeenCalledWith(
        expect.stringContaining('Event processing failed'),
        expect.any(Object)
      );
    });

    it('should fetch and process events', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpcMock.getLatestLedger.mockResolvedValue({ sequence: 1000 });
      
      const mockEvent = createMockSorobanEvent({ id: 'e1', ledger: 995, topic: ['proj_new'], value: 'val' });
      rpcMock.getEvents.mockResolvedValue({
        events: [mockEvent],
      });

      mockLedgerTracker.isEventProcessed.mockResolvedValue(false);
      mockEventHandler.processEvent.mockResolvedValue(true);

      await service.pollEvents();

      expect(rpcMock.getEvents).toHaveBeenCalled();
      expect(eventHandler.processEvent).toHaveBeenCalled();
      expect(ledgerTracker.markEventProcessed).toHaveBeenCalled();
      expect(ledgerTracker.updateCursor).toHaveBeenCalledWith(1000);
    });

    it('should handle RPC errors and log them', async () => {
      mockLedgerTracker.getLastCursor.mockResolvedValue({ lastLedgerSeq: 990 });
      rpcMock.getLatestLedger.mockRejectedValue(new Error('RPC Down'));

      await service.pollEvents();

      expect(ledgerTracker.logError).toHaveBeenCalledWith(
        expect.stringContaining('Poll cycle failed'),
        expect.any(Object)
      );
    });
  });

  describe('fetchEventsWithRetry', () => {
    it('should retry on failure', async () => {
      rpcMock.getEvents
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ events: [] });

      // fetchEventsWithRetry is private, we test it through pollEvents or by casting
      const result = await (service as any).fetchEventsWithRetry(990, 1000);

      expect(rpcMock.getEvents).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });

    it('should throw after max retries', async () => {
      rpcMock.getEvents.mockRejectedValue(new Error('Fatal'));

      await expect((service as any).fetchEventsWithRetry(990, 1000))
        .rejects.toThrow(/Failed to fetch events after/);
    });
  });
});
