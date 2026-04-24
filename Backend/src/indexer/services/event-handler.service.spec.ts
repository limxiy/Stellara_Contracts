import { Test, TestingModule } from '@nestjs/testing';
import { EventHandlerService } from './event-handler.service';
import { PrismaService } from '../../prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { ReputationService } from '../../reputation/reputation.service';
import { ContractEventType } from '../types/event-types';
import { ProjectMetadataService } from './project-metadata.service';
import { 
  createMockParsedEvent, 
  mockProjectCreatedData, 
  mockContributionMadeData,
  mockMilestoneApprovedData 
} from '../tests/fixtures/event.fixtures';

describe('EventHandlerService', () => {
  let service: EventHandlerService;
  let prisma: PrismaService;
  let notificationService: NotificationService;
  let reputationService: ReputationService;
  let projectMetadataService: ProjectMetadataService;

  const mockPrisma = {
    user: { upsert: jest.fn() },
    project: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    contribution: { findMany: jest.fn(), upsert: jest.fn() },
    milestone: { upsert: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  const mockNotificationService = {
    notify: jest.fn().mockResolvedValue(true),
  };

  const mockReputationService = {
    recordActivity: jest.fn().mockResolvedValue(true),
    updateTrustScore: jest.fn().mockResolvedValue(true),
  };

  const validCreatorAddress = `G${'A'.repeat(55)}`;
  const validTokenAddress = `C${'B'.repeat(55)}`;
  const validContributorAddress = `G${'C'.repeat(55)}`;

  const mockProjectMetadataService = {
    resolveProjectMetadata: jest.fn().mockResolvedValue({
      title: 'Parsed Metadata Title',
      description: 'Parsed description',
      category: 'defi',
      image: 'https://ipfs.io/ipfs/mock-image',
      tags: ['defi', 'lending'],
      ipfsHash: 'QmTestHash123456789012345678901234567890123456',
      completeness: 'complete',
      source: 'ipfs',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventHandlerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ReputationService, useValue: mockReputationService },
        { provide: ProjectMetadataService, useValue: mockProjectMetadataService },
      ],
    }).compile();

    service = module.get<EventHandlerService>(EventHandlerService);
    prisma = module.get<PrismaService>(PrismaService);
    notificationService = module.get<NotificationService>(NotificationService);
    reputationService = module.get<ReputationService>(ReputationService);
    projectMetadataService = module.get<ProjectMetadataService>(ProjectMetadataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEvent', () => {
    it('should route PROJECT_CREATED to correct handler', async () => {
      const event = createMockParsedEvent({
        eventType: 'proj_new',
        data: {
          ...mockProjectCreatedData,
          creator: validCreatorAddress,
          token: validTokenAddress,
          ipfsHash: 'QmTestHash123456789012345678901234567890123456',
        },
      });

      mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1' });
      mockPrisma.project.findUnique.mockResolvedValue(null);

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.user.upsert).toHaveBeenCalled();
      expect(projectMetadataService.resolveProjectMetadata).toHaveBeenCalled();
      expect(prisma.project.upsert).toHaveBeenCalled();
    });

    it('should route CONTRIBUTION_MADE to correct handler and update funds', async () => {
      const event = createMockParsedEvent({
        eventType: 'contrib',
        data: {
          ...mockContributionMadeData,
          contributor: validContributorAddress,
        },
      });

      mockPrisma.user.upsert.mockResolvedValue({ id: 'user-2' });
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', title: 'Test Project' });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(notificationService.notify).toHaveBeenCalled();
    });

    it('should route MILESTONE_APPROVED and update reputation', async () => {
      const event = createMockParsedEvent({
        eventType: 'm_apprv',
        data: mockMilestoneApprovedData,
      });

      mockPrisma.project.findUnique.mockResolvedValue({ 
        id: 'proj-1', 
        title: 'Test Project',
        creatorId: 'creator-1' 
      });
      mockPrisma.milestone.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.contribution.findMany.mockResolvedValue([{ investorId: 'investor-1' }]);

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.milestone.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'proj-1',
          contractMilestoneId: '0',
        }),
      }));
      expect(reputationService.updateTrustScore).toHaveBeenCalledWith('creator-1');
    });

    it('should route MILESTONE_CREATED and persist contract milestone mapping', async () => {
      const event = createMockParsedEvent({
        eventType: 'm_create',
        data: {
          projectId: 1,
          milestoneId: 3,
          title: 'Prototype Delivery',
          description: 'Deliver first prototype',
          fundingAmount: '5000',
        },
      });

      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.milestone.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          projectId_contractMilestoneId: {
            projectId: 'proj-1',
            contractMilestoneId: '3',
          },
        },
      }));
    });

    it('should route MILESTONE_REJECTED and notify investors', async () => {
      const event = createMockParsedEvent({
        eventType: 'm_reject',
        data: { projectId: 'proj-1', milestoneId: 1 },
      });

      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', title: 'Test', creatorId: 'c1' });
      mockPrisma.milestone.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.contribution.findMany.mockResolvedValue([{ investorId: 'i1' }]);

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.milestone.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'REJECTED' }
      }));
      expect(notificationService.notify).toHaveBeenCalled();
    });

    it('should route FUNDS_RELEASED', async () => {
      const event = createMockParsedEvent({
        eventType: 'release',
        data: { projectId: 'proj-1', milestoneId: 1, amount: '1000' },
      });

      mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      mockPrisma.milestone.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.milestone.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'FUNDED' })
      }));
    });

    it('should route PROJECT_COMPLETED', async () => {
      const event = createMockParsedEvent({
        eventType: 'proj_done',
        data: { projectId: 'proj-1' },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        creatorId: null,
        goal: BigInt(1000),
      });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'COMPLETED' }
      }));
    });

    it('should route PROJECT_FAILED', async () => {
      const event = createMockParsedEvent({
        eventType: 'proj_fail',
        data: { projectId: 'proj-1' },
      });

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-1',
        creatorId: null,
        goal: BigInt(1000),
      });

      const result = await service.processEvent(event);

      expect(result).toBe(true);
      expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'CANCELLED' }
      }));
    });

    it('should return false if no handler exists', async () => {
      const event = createMockParsedEvent({
        eventType: 'UNKNOWN_EVENT' as any,
      });

      const result = await service.processEvent(event);

      expect(result).toBe(false);
    });

    it('should return false if validation fails', async () => {
      const event = createMockParsedEvent({
        eventType: 'proj_new',
        data: {}, // Missing required fields
      });

      const result = await service.processEvent(event);

      expect(result).toBe(false);
    });
  });
});
