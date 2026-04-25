import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics.service';

describe('IndexerMetricsService', () => {
  let service: MetricsService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'METRICS_ENABLED') return 'true';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Batch Processing Metrics', () => {
    it('should record batch processing duration', () => {
      const duration = 2.5;
      const batchSize = 100;

      // This would normally record to prometheus
      service.recordBatchProcessingDuration(duration, batchSize);

      // Verify the method exists and doesn't throw
      expect(() => service.recordBatchProcessingDuration(duration, batchSize)).not.toThrow();
    });

    it('should record ledger processing duration', () => {
      const duration = 1.2;
      const ledgerCount = 50;

      service.recordLedgerProcessingDuration(duration, ledgerCount);

      expect(() => service.recordLedgerProcessingDuration(duration, ledgerCount)).not.toThrow();
    });

    it('should record batch results', () => {
      const batchSize = 100;
      const processedCount = 95;
      const errorCount = 3;
      const skippedCount = 2;
      const duration = 3.0;

      service.recordBatchResults(batchSize, processedCount, errorCount, skippedCount, duration);

      expect(() => service.recordBatchResults(batchSize, processedCount, errorCount, skippedCount, duration)).not.toThrow();
    });
  });

  describe('Event Processing Metrics', () => {
    it('should record event processing duration', () => {
      const duration = 0.1;
      const eventType = 'PROJECT_CREATED';
      const success = true;

      service.recordEventProcessingDuration(duration, eventType, success);

      expect(() => service.recordEventProcessingDuration(duration, eventType, success)).not.toThrow();
    });

    it('should record failed event processing', () => {
      const duration = 0.2;
      const eventType = 'CONTRIBUTION_MADE';
      const success = false;

      service.recordEventProcessingDuration(duration, eventType, success);

      expect(() => service.recordEventProcessingDuration(duration, eventType, success)).not.toThrow();
    });

    it('should update processing rate', () => {
      const eventsPerSecond = 42.5;

      service.updateProcessingRate(eventsPerSecond);

      expect(() => service.updateProcessingRate(eventsPerSecond)).not.toThrow();
    });

    it('should update event rates', () => {
      const successRate = 98.5;
      const errorRate = 1.5;

      service.updateEventRates(successRate, errorRate);

      expect(() => service.updateEventRates(successRate, errorRate)).not.toThrow();
    });
  });

  describe('Lag Monitoring', () => {
    it('should update indexer lag duration', () => {
      const lagSeconds = 125;

      service.updateIndexerLagDuration(lagSeconds);

      expect(() => service.updateIndexerLagDuration(lagSeconds)).not.toThrow();
    });

    it('should record ledger range processing', () => {
      const startLedger = 1000;
      const endLedger = 1100;
      const duration = 5.0;
      const success = true;

      service.recordLedgerRangeProcessing(startLedger, endLedger, duration, success);

      expect(() => service.recordLedgerRangeProcessing(startLedger, endLedger, duration, success)).not.toThrow();
    });
  });

  describe('System Resource Metrics', () => {
    it('should update memory usage', () => {
      const bytes = 524288000; // 500MB

      service.updateMemoryUsage(bytes);

      expect(() => service.updateMemoryUsage(bytes)).not.toThrow();
    });

    it('should update CPU usage', () => {
      const percent = 45.2;

      service.updateCpuUsage(percent);

      expect(() => service.updateCpuUsage(percent)).not.toThrow();
    });

    it('should update uptime', () => {
      const seconds = 86400; // 24 hours

      service.updateUptime(seconds);

      expect(() => service.updateUptime(seconds)).not.toThrow();
    });

    it('should update queue depth', () => {
      const depth = 25;

      service.updateQueueDepth(depth);

      expect(() => service.updateQueueDepth(depth)).not.toThrow();
    });

    it('should record reconnection', () => {
      const reason = 'network_timeout';

      service.recordReconnection(reason);

      expect(() => service.recordReconnection(reason)).not.toThrow();
    });
  });

  describe('Event Processing Statistics', () => {
    it('should record event processing stats', () => {
      const windowDurationSec = 60;
      const totalEvents = 1000;
      const successfulEvents = 985;
      const failedEvents = 10;
      const skippedEvents = 5;

      service.recordEventProcessingStats(
        windowDurationSec,
        totalEvents,
        successfulEvents,
        failedEvents,
        skippedEvents
      );

      expect(() => service.recordEventProcessingStats(
        windowDurationSec,
        totalEvents,
        successfulEvents,
        failedEvents,
        skippedEvents
      )).not.toThrow();
    });
  });

  describe('Indexer Health', () => {
    it('should record indexer health metrics', () => {
      const isHealthy = true;
      const currentLedger = 123456;
      const networkLedger = 123460;
      const memoryUsage = 524288000;
      const cpuUsage = 45.2;
      const uptime = 86400;

      service.recordIndexerHealth(
        isHealthy,
        currentLedger,
        networkLedger,
        memoryUsage,
        cpuUsage,
        uptime
      );

      expect(() => service.recordIndexerHealth(
        isHealthy,
        currentLedger,
        networkLedger,
        memoryUsage,
        cpuUsage,
        uptime
      )).not.toThrow();
    });

    it('should record unhealthy indexer status', () => {
      const isHealthy = false;
      const currentLedger = 123450;
      const networkLedger = 123460;
      const memoryUsage = 1073741824;
      const cpuUsage = 85.0;
      const uptime = 86400;

      service.recordIndexerHealth(
        isHealthy,
        currentLedger,
        networkLedger,
        memoryUsage,
        cpuUsage,
        uptime
      );

      expect(() => service.recordIndexerHealth(
        isHealthy,
        currentLedger,
        networkLedger,
        memoryUsage,
        cpuUsage,
        uptime
      )).not.toThrow();
    });
  });

  describe('Performance Summary', () => {
    it('should return performance summary', () => {
      const summary = service.getPerformanceSummary();

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('object');
      expect(summary).toHaveProperty('processingRate');
      expect(summary).toHaveProperty('successRate');
      expect(summary).toHaveProperty('errorRate');
      expect(summary).toHaveProperty('lagSeconds');
      expect(summary).toHaveProperty('memoryUsage');
      expect(summary).toHaveProperty('cpuUsage');
      expect(summary).toHaveProperty('uptime');
    });

    it('should reset performance counters', () => {
      service.resetPerformanceCounters();

      expect(() => service.resetPerformanceCounters()).not.toThrow();
    });
  });

  describe('Integration with Existing Metrics', () => {
    it('should maintain compatibility with existing indexer metrics', () => {
      const current = 123456;
      const network = 123460;

      service.updateIndexerLag(current, network);

      expect(() => service.updateIndexerLag(current, network)).not.toThrow();
    });

    it('should record indexer poll status', () => {
      const status = 'success';
      const eventCount = 50;

      service.recordIndexerPoll(status, eventCount);

      expect(() => service.recordIndexerPoll(status, eventCount)).not.toThrow();
    });

    it('should record blockchain events', () => {
      const eventType = 'PROJECT_CREATED';

      service.recordBlockchainEvent(eventType);

      expect(() => service.recordBlockchainEvent(eventType)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero values', () => {
      service.updateProcessingRate(0);
      service.updateEventRates(0, 0);
      service.updateMemoryUsage(0);
      service.updateCpuUsage(0);
      service.updateUptime(0);
      service.updateQueueDepth(0);

      expect(() => service.updateProcessingRate(0)).not.toThrow();
      expect(() => service.updateEventRates(0, 0)).not.toThrow();
      expect(() => service.updateMemoryUsage(0)).not.toThrow();
      expect(() => service.updateCpuUsage(0)).not.toThrow();
      expect(() => service.updateUptime(0)).not.toThrow();
      expect(() => service.updateQueueDepth(0)).not.toThrow();
    });

    it('should handle negative values appropriately', () => {
      service.updateIndexerLagDuration(-10); // Should handle gracefully
      service.updateProcessingRate(-5); // Should handle gracefully

      expect(() => service.updateIndexerLagDuration(-10)).not.toThrow();
      expect(() => service.updateProcessingRate(-5)).not.toThrow();
    });

    it('should handle very large values', () => {
      const largeBytes = Number.MAX_SAFE_INTEGER;
      const largeCount = Number.MAX_SAFE_INTEGER;

      service.updateMemoryUsage(largeBytes);
      service.updateUptime(largeCount);

      expect(() => service.updateMemoryUsage(largeBytes)).not.toThrow();
      expect(() => service.updateUptime(largeCount)).not.toThrow();
    });
  });

  describe('Performance Considerations', () => {
    it('should handle rapid metric updates', () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        service.updateProcessingRate(Math.random() * 100);
        service.updateEventRates(Math.random() * 100, Math.random() * 5);
        service.updateMemoryUsage(Math.random() * 1000000000);
        service.updateCpuUsage(Math.random() * 100);
      }

      expect(true).toBe(true); // Test completes without errors
    });

    it('should handle concurrent metric updates', async () => {
      const promises = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        promises.push(Promise.resolve().then(() => {
          service.updateProcessingRate(Math.random() * 100);
          service.recordEventProcessingDuration(0.1, 'TEST_EVENT', true);
        }));
      }

      await Promise.all(promises);

      expect(true).toBe(true); // Test completes without errors
    });
  });
});
