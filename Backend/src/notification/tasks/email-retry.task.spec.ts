import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailRetryTask } from './email-retry.task';
import { PrismaService } from '../../prisma.service';
import { EmailService } from '../services/email.service';
import { MetricsService } from '../../metrics/metrics.service';
import * as sgMail from '@sendgrid/mail';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(),
}));

describe('EmailRetryTask', () => {
  let task: EmailRetryTask;

  const mockPrisma = {
    emailOutbox: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEmailService = {
    checkOutboxAlertThreshold: jest.fn().mockResolvedValue(undefined),
  };

  const mockMetricsService = {
    recordEmailRetryApiKeyMissing: jest.fn(),
    recordEmailRetryRun: jest.fn(),
    recordEmailRetryOldSkip: jest.fn(),
    setEmailRetryBatchSize: jest.fn(),
    setEmailRetryPendingFailed: jest.fn(),
    recordEmailRetryDuration: jest.fn(),
    recordEmailRetryBackoffSkip: jest.fn(),
    recordEmailRetryProcessed: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const applyDefaultConfig = () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        SENDGRID_API_KEY: 'test-api-key',
        SENDGRID_FROM_EMAIL: 'noreply@novafund.xyz',
        EMAIL_RETRY_MAX_ATTEMPTS: 3,
        EMAIL_RETRY_MAX_AGE_DAYS: 7,
        EMAIL_RETRY_BASE_BACKOFF_MS: 1000,
        EMAIL_RETRY_BATCH_SIZE: 50,
      };

      return config[key] ?? defaultValue;
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.emailOutbox.count.mockReset();
    mockPrisma.emailOutbox.findMany.mockReset();
    mockPrisma.emailOutbox.update.mockReset();
    mockEmailService.checkOutboxAlertThreshold.mockReset();
    mockEmailService.checkOutboxAlertThreshold.mockResolvedValue(undefined);
    mockConfigService.get.mockReset();
    applyDefaultConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailRetryTask,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    task = module.get<EmailRetryTask>(EmailRetryTask);
  });

  it('skips entire batch when SENDGRID_API_KEY is missing', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'SENDGRID_API_KEY') return undefined;
      return defaultValue;
    });

    await task.handleCron();

    expect(mockMetricsService.recordEmailRetryApiKeyMissing).toHaveBeenCalled();
    expect(mockMetricsService.recordEmailRetryRun).toHaveBeenCalledWith('skipped_missing_api_key');
    expect(mockEmailService.checkOutboxAlertThreshold).toHaveBeenCalled();
    expect(mockPrisma.emailOutbox.findMany).not.toHaveBeenCalled();
  });

  it('retries eligible failed emails and marks them as sent', async () => {
    const eligibleEmail = {
      id: 'email-1',
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      attempts: 0,
      updatedAt: new Date(Date.now() - 5000),
      createdAt: new Date(),
    };

    mockPrisma.emailOutbox.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.emailOutbox.findMany.mockResolvedValueOnce([eligibleEmail]);
    (sgMail.send as jest.Mock).mockResolvedValueOnce({});

    await task.handleCron();

    expect(sgMail.setApiKey).toHaveBeenCalledWith('test-api-key');
    expect(sgMail.send).toHaveBeenCalledTimes(1);
    expect(mockPrisma.emailOutbox.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: {
        status: 'SENT',
        attempts: 1,
        lastError: null,
      },
    });
    expect(mockMetricsService.recordEmailRetryProcessed).toHaveBeenCalledWith('sent');
  });

  it('continues processing subsequent emails after one retry failure', async () => {
    const now = Date.now();
    const firstEmail = {
      id: 'email-1',
      to: 'a@example.com',
      subject: 'A',
      html: '<p>A</p>',
      attempts: 0,
      updatedAt: new Date(now - 5000),
      createdAt: new Date(now - 5000),
    };

    const secondEmail = {
      id: 'email-2',
      to: 'b@example.com',
      subject: 'B',
      html: '<p>B</p>',
      attempts: 0,
      updatedAt: new Date(now - 5000),
      createdAt: new Date(now - 5000),
    };

    mockPrisma.emailOutbox.count.mockResolvedValue(0);
    mockPrisma.emailOutbox.findMany.mockResolvedValueOnce([firstEmail, secondEmail]);
    (sgMail.send as jest.Mock)
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce({});

    await task.handleCron();

    expect(sgMail.send).toHaveBeenCalledTimes(2);
    expect(mockPrisma.emailOutbox.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'email-1' },
      data: {
        attempts: 1,
        lastError: 'transient failure',
      },
    });
    expect(mockPrisma.emailOutbox.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'email-2' },
      data: {
        status: 'SENT',
        attempts: 1,
        lastError: null,
      },
    });
  });

  it('skips emails still in exponential backoff window', async () => {
    const justFailedEmail = {
      id: 'email-1',
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      attempts: 2,
      updatedAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    };

    mockPrisma.emailOutbox.count.mockResolvedValue(0);
    mockPrisma.emailOutbox.findMany.mockResolvedValueOnce([justFailedEmail]);

    await task.handleCron();

    expect(sgMail.send).not.toHaveBeenCalled();
    expect(mockPrisma.emailOutbox.update).not.toHaveBeenCalled();
    expect(mockMetricsService.recordEmailRetryBackoffSkip).toHaveBeenCalled();
  });

  it('filters out failed emails older than max retry age', async () => {
    mockPrisma.emailOutbox.count.mockResolvedValueOnce(1);
    mockPrisma.emailOutbox.findMany.mockResolvedValueOnce([]);

    await task.handleCron();

    expect(mockMetricsService.recordEmailRetryOldSkip).toHaveBeenCalledWith(1);
    expect(sgMail.send).not.toHaveBeenCalled();
  });

  it('returns dashboard metrics with pending backoff and next eligible delay', async () => {
    const now = Date.now();
    mockPrisma.emailOutbox.count
      .mockResolvedValueOnce(3) // pendingRetryable
      .mockResolvedValueOnce(2) // permanentFailures
      .mockResolvedValueOnce(1) // expiredFailures
      .mockResolvedValueOnce(4); // sentFromRetry

    mockPrisma.emailOutbox.findMany.mockResolvedValueOnce([
      {
        attempts: 2,
        updatedAt: new Date(now - 1000),
      },
      {
        attempts: 0,
        updatedAt: new Date(now - 1500),
      },
    ]);

    const dashboard = await task.getRetryDashboard();

    expect(dashboard.counts.pendingRetryable).toBe(3);
    expect(dashboard.counts.permanentFailures).toBe(2);
    expect(dashboard.counts.expiredFailures).toBe(1);
    expect(dashboard.counts.sentFromRetry).toBe(4);
    expect(dashboard.counts.pendingBackoff).toBe(1);
    expect(dashboard.nextEligibleInMs).not.toBeNull();
  });
});
