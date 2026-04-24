import { setupTestApp, teardownTestApp, prisma } from './setup';
import { IndexerService } from '../src/indexer/services/indexer.service';
import { ContractEventType } from '../src/indexer/types/event-types';
import { createSorobanEvent } from './factories/event.factory';
import { SorobanRpc } from '@stellar/stellar-sdk';

describe('Indexer Pipeline (e2e)', () => {
  let indexerService: IndexerService;
  let mockRpcServer: any;

  beforeAll(async () => {
    await setupTestApp();
    indexerService = (global as any).app.get(IndexerService);
    
    // Get the mock instance
    mockRpcServer = (indexerService as any).rpc;
  });

  afterAll(async () => {
    await teardownTestApp();
  });

  beforeEach(async () => {
    // Clear DB between tests
    await (global as any).prisma.processedEvent.deleteMany();
    await (global as any).prisma.milestone.deleteMany();
    await (global as any).prisma.contribution.deleteMany();
    await (global as any).prisma.project.deleteMany();
    await (global as any).prisma.user.deleteMany();
    await (global as any).prisma.ledgerCursor.deleteMany();
    
    jest.clearAllMocks();
  });

  it('should index a PROJECT_CREATED event and store in DB', async () => {
    const contractId = 'CC' + Math.random().toString(36).substring(7).toUpperCase();
    const eventId = 'event-1';
    
    // 1. Prepare mock RPC response
    const mockEvent = createSorobanEvent('proj_new', 'mock-xdr', {
      contractId,
      id: eventId,
      ledger: 1001,
    });

    // Mock parseEventData to return structured data
    // Since we're doing e2e, we'd normally let the real parseEvent run, 
    // but it's currently a stub in IndexerService.
    // Let's mock the internal parseEventData to return what we want for the test.
    jest.spyOn(indexerService as any, 'parseEventData').mockReturnValue({
      projectId: 1,
      creator: 'G-CREATOR',
      fundingGoal: '1000000',
      deadline: Math.floor(Date.now() / 1000) + 86400,
      token: 'XLM',
    });

    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 1001 });
    mockRpcServer.getEvents.mockResolvedValue({
      events: [mockEvent],
      cursor: undefined,
    });

    // 2. Trigger poll
    await indexerService.pollEvents();

    // 3. Verify Database state
    const project = await (global as any).prisma.project.findUnique({
      where: { contractId: '1' }, // Based on our mock data mapping
    });

    expect(project).toBeDefined();
    expect(project.status).toBe('ACTIVE');

    const processed = await (global as any).prisma.processedEvent.findUnique({
      where: { eventId },
    });
    expect(processed).toBeDefined();
    expect(processed.ledgerSeq).toBe(1001);
  });

  it('should handle idempotency - processing same event twice', async () => {
    const eventId = 'idemp-1';
    const mockEvent = createSorobanEvent('proj_new', 'mock-xdr', { id: eventId });

    jest.spyOn(indexerService as any, 'parseEventData').mockReturnValue({
      projectId: 2,
      creator: 'G-CREATOR',
      fundingGoal: '1000',
      deadline: Date.now(),
      token: 'XLM',
    });

    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 1000 });
    mockRpcServer.getEvents.mockResolvedValue({ events: [mockEvent] });

    // Process first time
    await indexerService.pollEvents();
    
    // Process second time
    await indexerService.pollEvents();

    const count = await (global as any).prisma.processedEvent.count({
      where: { eventId },
    });
    expect(count).toBe(1);
  });

  it('should benchmark bulk event processing', async () => {
    const eventCount = 100;
    const events = [];
    for (let i = 0; i < eventCount; i++) {
      events.push(createSorobanEvent('proj_new', 'xdr', { id: `bulk-${i}`, ledger: 1000 + i }));
    }

    jest.spyOn(indexerService as any, 'parseEventData').mockImplementation((_, type, id) => ({
      projectId: parseInt((id as string).split('-')[1]),
      creator: 'G-BULK',
      fundingGoal: '100',
      deadline: Date.now(),
      token: 'XLM',
    }));

    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 1000 + eventCount });
    mockRpcServer.getEvents.mockResolvedValue({ events });

    const startTime = Date.now();
    await indexerService.pollEvents();
    const endTime = Date.now();

    const durationSeconds = (endTime - startTime) / 1000;
    const eventsPerSecond = eventCount / durationSeconds;

    console.log(`Benchmark: Processed ${eventCount} events in ${durationSeconds.toFixed(2)}s (${eventsPerSecond.toFixed(2)} events/sec)`);
    
    expect(eventsPerSecond).toBeGreaterThan(0);
  });

  it('should map and update only the targeted milestone across workflow events', async () => {
    const contractId = 'CC' + Math.random().toString(36).substring(7).toUpperCase();
    const validCreator = `G${'A'.repeat(55)}`;
    const validToken = `C${'B'.repeat(55)}`;
    const validContributor = `G${'C'.repeat(55)}`;

    const projectCreatedEvent = createSorobanEvent('proj_new', 'xdr', {
      contractId,
      id: 'wf-proj',
      ledger: 2001,
    });
    const milestoneOneCreated = createSorobanEvent('m_create', 'xdr', {
      contractId,
      id: 'wf-m1',
      ledger: 2002,
    });
    const milestoneApproved = createSorobanEvent('m_apprv', 'xdr', {
      contractId,
      id: 'wf-apprv',
      ledger: 2004,
    });
    const fundsReleased = createSorobanEvent('release', 'xdr', {
      contractId,
      id: 'wf-funds',
      ledger: 2005,
    });
    const contributionEvent = createSorobanEvent('contrib', 'xdr', {
      contractId,
      id: 'wf-contrib',
      ledger: 2006,
    });

    jest.spyOn(indexerService as any, 'parseEventData').mockImplementation((_: string, eventType: string) => {
      switch (eventType) {
        case 'proj_new':
          return {
            projectId: 10,
            creator: validCreator,
            fundingGoal: '1000000',
            deadline: Math.floor(Date.now() / 1000) + 86400,
            token: validToken,
          };
        case 'm_create':
          return {
            projectId: 10,
            milestoneId: 1,
            title: 'Milestone One',
            description: 'First milestone',
            fundingAmount: '250000',
          };
        case 'm_apprv':
          return {
            projectId: 10,
            milestoneId: 1,
            approvalCount: 2,
          };
        case 'release':
          return {
            projectId: 10,
            milestoneId: 1,
            amount: '250000',
          };
        case 'contrib':
          return {
            projectId: 10,
            contributor: validContributor,
            amount: '50000',
            totalRaised: '50000',
          };
        default:
          return {};
      }
    });

    mockRpcServer.getLatestLedger.mockResolvedValue({ sequence: 2006 });
    mockRpcServer.getEvents.mockResolvedValue({
      events: [
        projectCreatedEvent,
        milestoneOneCreated,
        contributionEvent,
      ],
      cursor: undefined,
    });

    await indexerService.pollEvents();

    const project = await (global as any).prisma.project.findUnique({
      where: { contractId: '10' },
    });

    expect(project).toBeDefined();

    await (global as any).prisma.milestone.create({
      data: {
        projectId: project.id,
        contractMilestoneId: '2',
        title: 'Milestone Two',
        description: 'Second milestone',
        fundingAmount: BigInt(100000),
        status: 'PENDING',
      },
    });

    mockRpcServer.getEvents.mockResolvedValue({
      events: [
        milestoneApproved,
        fundsReleased,
      ],
      cursor: undefined,
    });

    await indexerService.pollEvents();

    const milestone = await (global as any).prisma.milestone.findUnique({
      where: {
        projectId_contractMilestoneId: {
          projectId: project.id,
          contractMilestoneId: '1',
        },
      },
    });

    expect(milestone).toBeDefined();
    expect(milestone.status).toBe('FUNDED');

    const untouchedMilestone = await (global as any).prisma.milestone.findUnique({
      where: {
        projectId_contractMilestoneId: {
          projectId: project.id,
          contractMilestoneId: '2',
        },
      },
    });

    expect(untouchedMilestone).toBeDefined();
    expect(untouchedMilestone.status).toBe('PENDING');

    const allMilestones = await (global as any).prisma.milestone.findMany({
      where: { projectId: project.id },
    });
    expect(allMilestones).toHaveLength(2);
  });
});
