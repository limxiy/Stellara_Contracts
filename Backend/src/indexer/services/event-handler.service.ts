/**
 * Handler for MILESTONE_REJECTED events
 */
export class MilestoneRejectedHandler implements IEventHandler {
  readonly eventType = 'm_reject';
  private readonly logger = new Logger(MilestoneRejectedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as any;
    return !!(data.projectId !== undefined && data.milestoneId !== undefined);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as any;
    const contractMilestoneId = data.milestoneId?.toString();

    this.logger.log(
      `Processing MILESTONE_REJECTED: Milestone ${data.milestoneId} for project ${data.projectId}`,
    );

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for milestone rejection`);
      return;
    }

    // Update milestone status
    const updateResult = await this.prisma.milestone.updateMany({
      where: {
        projectId: project.id,
        contractMilestoneId,
      },
      data: {
        status: 'REJECTED',
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `No mapped milestone found for project ${data.projectId} and contract milestone ${contractMilestoneId}`,
      );
      return;
    }

    // Notify all contributors of this project
    const contributors = await this.prisma.contribution.findMany({
      where: { projectId: project.id },
      select: { investorId: true },
      distinct: ['investorId'],
    });

    for (const contribution of contributors) {
      try {
        await this.notificationService.notify(
          contribution.investorId,
          'MILESTONE',
          'Project Milestone Failed',
          `A project you back (${project.title}) has a failed milestone!`,
          { projectId: project.id, milestoneId: data.milestoneId }
        );
      } catch (e) {
        this.logger.error(`Failed to notify investor ${contribution.investorId} of milestone: ${e.message}`);
      }
    }

    // Update trust score and record activity for the creator
    if (project.creatorId) {
      await this.reputationService.recordActivity(
        project.creatorId,
        'FAILED_TRANSACTION',
        1.0,
        event.transactionHash,
      );
      await this.reputationService.updateTrustScore(project.creatorId);
      this.logger.log(`Updated reputation and trust score for creator ${project.creatorId}`);
    }
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ParsedContractEvent,
  ProjectCreatedEvent,
  ContributionMadeEvent,
  MilestoneCreatedEvent,
  MilestoneApprovedEvent,
  FundsReleasedEvent,
  ProjectStatusEvent,
} from '../types/event-types';
import { IEventHandler, IEventHandlerRegistry } from '../interfaces/event-handler.interface';
import { NotificationService } from '../../notification/services/notification.service';
import { ReputationService } from '../../reputation/reputation.service';
import { validateEventData } from '../utils/event-validation.util';
import { ProjectMetadataService } from './project-metadata.service';
import { EventHandlerLoader } from './event-handler-loader';

/**
 * Handler for PROJECT_CREATED events
 */
export class ProjectCreatedHandler implements IEventHandler {
  readonly eventType = 'proj_new';
  private readonly logger = new Logger(ProjectCreatedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectMetadataService: ProjectMetadataService,
  ) { }

  private extractMetadataHash(data: ProjectCreatedEvent): string | null {
    const candidates = [
      data.ipfsHash,
      data.metadataHash,
      data.metadataCid,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  validate(event: ParsedContractEvent): boolean {
    try {
      validateEventData('PROJECT_CREATED', event.data);
      return true;
    } catch (error) {
      this.logger.error(`Event validation failed: ${error.message}`, event.data);
      return false;
    }
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ProjectCreatedEvent;
    const contractId = data.projectId.toString();
    const metadataHash = this.extractMetadataHash(data);

    this.logger.log(`Processing PROJECT_CREATED: Project ${data.projectId} by ${data.creator}`);

    // Find or create user
    const user = await this.prisma.user.upsert({
      where: { walletAddress: data.creator },
      update: {},
      create: {
        walletAddress: data.creator,
        reputationScore: 0,
      },
    });

    const existingProject = await this.prisma.project.findUnique({
      where: { contractId },
    });

    const shouldRefreshMetadata =
      !!metadataHash &&
      (existingProject?.ipfsHash !== metadataHash ||
        !existingProject.title ||
        existingProject.title.startsWith('Project '));

    const resolvedMetadata =
      shouldRefreshMetadata || !existingProject
        ? await this.projectMetadataService.resolveProjectMetadata(data.projectId, metadataHash ?? undefined)
        : null;

    const fallbackTitle = `Project ${data.projectId}`;

    // Create project
    await this.prisma.project.upsert({
      where: { contractId },
      update: {
        title: resolvedMetadata?.title ?? existingProject?.title ?? fallbackTitle,
        description: resolvedMetadata?.description ?? existingProject?.description,
        category: resolvedMetadata?.category ?? existingProject?.category ?? 'uncategorized',
        ipfsHash: metadataHash ?? existingProject?.ipfsHash,
        goal: BigInt(data.fundingGoal),
        deadline: new Date(data.deadline * 1000),
        status: 'ACTIVE',
      },
      create: {
        contractId,
        creatorId: user.id,
        title: resolvedMetadata?.title ?? fallbackTitle,
        description: resolvedMetadata?.description,
        category: resolvedMetadata?.category ?? 'uncategorized',
        ipfsHash: metadataHash,
        goal: BigInt(data.fundingGoal),
        deadline: new Date(data.deadline * 1000),
        status: 'ACTIVE',
      },
    });

    this.logger.log(`Created/updated project ${data.projectId}`);
  }
}

/**
 * Handler for CONTRIBUTION_MADE events
 */
export class ContributionMadeHandler implements IEventHandler {
  readonly eventType = 'contrib';
  private readonly logger = new Logger(ContributionMadeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
  ) { }

  validate(event: ParsedContractEvent): boolean {
    try {
      validateEventData('CONTRIBUTION_MADE', event.data);
      return true;
    } catch (error) {
      this.logger.error(`Event validation failed: ${error.message}`, event.data);
      return false;
    }
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ContributionMadeEvent;

    this.logger.log(
      `Processing CONTRIBUTION_MADE: ${data.amount} to project ${data.projectId} from ${data.contributor}`,
    );

    // Find or create user
    const user = await this.prisma.user.upsert({
      where: { walletAddress: data.contributor },
      update: {},
      create: {
        walletAddress: data.contributor,
        reputationScore: 0,
      },
    });

    // Find project
    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for contribution`);
      return;
    }

    // Create contribution and update project funds atomically
    await this.prisma.$transaction([
      this.prisma.contribution.upsert({
        where: { transactionHash: event.transactionHash },
        update: {},
        create: {
          transactionHash: event.transactionHash,
          investorId: user.id,
          projectId: project.id,
          amount: BigInt(data.amount),
          timestamp: event.ledgerClosedAt,
        },
      }),
      this.prisma.project.update({
        where: { id: project.id },
        data: {
          currentFunds: BigInt(data.totalRaised),
        },
      }),
    ]);

    // Dispatch notification
    try {
      await this.notificationService.notify(
        user.id,
        'CONTRIBUTION',
        'Contribution Successful!',
        `Your contribution of ${data.amount} to project ${project.title} was successful.`,
        { projectId: project.id, amount: data.amount }
      );
    } catch (e) {
      this.logger.error(`Failed to send contribution notification to user ${user.id}: ${e.message}`);
    }

    // Record reputation activity
    try {
      await this.reputationService.recordActivity(
        user.id,
        'SUCCESSFUL_TRANSACTION',
        Number(data.amount),
        event.transactionHash,
      );
    } catch (e) {
      this.logger.error(`Failed to record reputation activity for user ${user.id}: ${e.message}`);
    }

    this.logger.log(`Recorded contribution of ${data.amount} for project ${data.projectId}`);
  }
}

/**
 * Handler for MILESTONE_CREATED events
 */
export class MilestoneCreatedHandler implements IEventHandler {
  readonly eventType = 'm_create';
  private readonly logger = new Logger(MilestoneCreatedHandler.name);

  constructor(private readonly prisma: PrismaService) { }

  validate(event: ParsedContractEvent): boolean {
    try {
      validateEventData('MILESTONE_CREATED', event.data);
      return true;
    } catch (error) {
      this.logger.error(`Event validation failed: ${error.message}`, event.data);
      return false;
    }
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as MilestoneCreatedEvent;
    const contractMilestoneId = data.milestoneId.toString();

    this.logger.log(
      `Processing MILESTONE_CREATED: Milestone ${data.milestoneId} for project ${data.projectId}`,
    );

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for milestone creation`);
      return;
    }

    await this.prisma.milestone.upsert({
      where: {
        projectId_contractMilestoneId: {
          projectId: project.id,
          contractMilestoneId,
        },
      },
      update: {
        title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `Milestone ${data.milestoneId}`,
        description: typeof data.description === 'string' ? data.description.trim() : null,
        fundingAmount: data.fundingAmount ? BigInt(data.fundingAmount) : BigInt(0),
      },
      create: {
        projectId: project.id,
        contractMilestoneId,
        title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : `Milestone ${data.milestoneId}`,
        description: typeof data.description === 'string' ? data.description.trim() : null,
        fundingAmount: data.fundingAmount ? BigInt(data.fundingAmount) : BigInt(0),
        status: 'PENDING',
      },
    });

    this.logger.log(
      `Mapped contract milestone ${contractMilestoneId} to project ${data.projectId}`,
    );
  }
}

/**
 * Handler for MILESTONE_APPROVED events
 */
export class MilestoneApprovedHandler implements IEventHandler {
  readonly eventType = 'm_apprv';
  private readonly logger = new Logger(MilestoneApprovedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
  ) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as MilestoneApprovedEvent;
    return !!(data.projectId !== undefined && data.milestoneId !== undefined);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as MilestoneApprovedEvent;
    const contractMilestoneId = data.milestoneId.toString();

    this.logger.log(
      `Processing MILESTONE_APPROVED: Milestone ${data.milestoneId} for project ${data.projectId}`,
    );

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for milestone approval`);
      return;
    }

    // Update only the mapped milestone status
    const updateResult = await this.prisma.milestone.updateMany({
      where: {
        projectId: project.id,
        contractMilestoneId,
      },
      data: {
        status: 'APPROVED',
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `No mapped milestone found for project ${data.projectId} and contract milestone ${contractMilestoneId}`,
      );
      return;
    }

    // Notify all contributors of this project
    const contributors = await this.prisma.contribution.findMany({
      where: { projectId: project.id },
      select: { investorId: true },
      distinct: ['investorId'],
    });

    for (const contribution of contributors) {
      try {
        await this.notificationService.notify(
          contribution.investorId,
          'MILESTONE',
          'Project Milestone Reached!',
          `A project you back (${project.title}) has reached a new milestone!`,
          { projectId: project.id, milestoneId: data.milestoneId }
        );
      } catch (e) {
        this.logger.error(`Failed to notify investor ${contribution.investorId} of milestone: ${e.message}`);
      }
    }

    this.logger.log(`Approved milestone for project ${data.projectId}`);

    // Update trust score and record activity for the creator
    if (project.creatorId) {
      await this.reputationService.recordActivity(
        project.creatorId,
        'SUCCESSFUL_TRANSACTION',
        1.0,
        event.transactionHash,
      );
      await this.reputationService.updateTrustScore(project.creatorId);
      this.logger.log(`Updated reputation and trust score for creator ${project.creatorId}`);
    }
  }
}

/**
 * Handler for FUNDS_RELEASED events
 */
export class FundsReleasedHandler implements IEventHandler {
  readonly eventType = 'release';
  private readonly logger = new Logger(FundsReleasedHandler.name);

  constructor(private readonly prisma: PrismaService) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as FundsReleasedEvent;
    return !!(data.projectId !== undefined && data.amount);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as FundsReleasedEvent;
    const contractMilestoneId = data.milestoneId.toString();

    this.logger.log(
      `Processing FUNDS_RELEASED: ${data.amount} for project ${data.projectId}, milestone ${data.milestoneId}`,
    );

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for funds release`);
      return;
    }

    // Update only the mapped milestone to funded status
    const updateResult = await this.prisma.milestone.updateMany({
      where: {
        projectId: project.id,
        contractMilestoneId,
      },
      data: {
        status: 'FUNDED',
        completionDate: event.ledgerClosedAt,
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `No mapped milestone found for project ${data.projectId} and contract milestone ${contractMilestoneId}`,
      );
      return;
    }

    this.logger.log(`Released funds for project ${data.projectId}`);
  }
}

/**
 * Handler for PROJECT_COMPLETED events
 */
export class ProjectCompletedHandler implements IEventHandler {
  readonly eventType = 'proj_done';
  private readonly logger = new Logger(ProjectCompletedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as ProjectStatusEvent;
    return data.projectId !== undefined;
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ProjectStatusEvent;

    this.logger.log(`Processing PROJECT_COMPLETED: Project ${data.projectId}`);

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for completion`);
      return;
    }

    await this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'COMPLETED' },
    });

    // Record reputation activity for the creator
    if (project.creatorId) {
      await this.reputationService.recordActivity(
        project.creatorId,
        'SUCCESSFUL_TRANSACTION',
        Number(project.goal),
        event.transactionHash,
      );
      await this.reputationService.updateTrustScore(project.creatorId);
      this.logger.log(`Updated reputation and trust score for creator ${project.creatorId}`);
    }

    this.logger.log(`Marked project ${data.projectId} as completed`);
  }
}

/**
 * Handler for PROJECT_FAILED events
 */
export class ProjectFailedHandler implements IEventHandler {
  readonly eventType = 'proj_fail';
  private readonly logger = new Logger(ProjectFailedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as ProjectStatusEvent;
    return data.projectId !== undefined;
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ProjectStatusEvent;

    this.logger.log(`Processing PROJECT_FAILED: Project ${data.projectId}`);

    const project = await this.prisma.project.findUnique({
      where: { contractId: data.projectId.toString() },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for failure`);
      return;
    }

    await this.prisma.project.update({
      where: { id: project.id },
      data: { status: 'CANCELLED' },
    });

    // Record reputation activity for the creator
    if (project.creatorId) {
      await this.reputationService.recordActivity(
        project.creatorId,
        'FAILED_TRANSACTION',
        Number(project.goal),
        event.transactionHash,
      );
      await this.reputationService.updateTrustScore(project.creatorId);
      this.logger.log(`Updated reputation and trust score for creator ${project.creatorId}`);
    }

    this.logger.log(`Marked project ${data.projectId} as failed/cancelled`);
  }
}

/**
 * Handler for POLICY_CREATED events
 */
export class PolicyCreatedHandler implements IEventHandler {
  readonly eventType = 'policy_new';
  private readonly logger = new Logger(PolicyCreatedHandler.name);

  constructor(private readonly prisma: PrismaService) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as PolicyCreatedEvent;
    return !!(data.policyId && data.user && data.poolId);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as PolicyCreatedEvent;

    this.logger.log(`Processing POLICY_CREATED: Policy ${data.policyId} for user ${data.user}`);

    // Find user by wallet address
    const user = await this.prisma.user.findUnique({
      where: { walletAddress: data.user },
    });

    if (!user) {
      this.logger.warn(`User ${data.user} not found for policy creation`);
      return;
    }

    await this.prisma.insurancePolicy.upsert({
      where: { id: data.policyId },
      update: {
        riskType: data.riskType as any,
        premium: data.premium,
        coverageAmount: data.coverageAmount,
      },
      create: {
        id: data.policyId,
        userId: user.id,
        poolId: data.poolId,
        riskType: data.riskType as any,
        premium: data.premium,
        coverageAmount: data.coverageAmount,
      },
    });

    this.logger.log(`Synced policy ${data.policyId} to database`);
  }
}

/**
 * Handler for CLAIM_SUBMITTED events
 */
export class ClaimSubmittedHandler implements IEventHandler {
  readonly eventType = 'claim_sub';
  private readonly logger = new Logger(ClaimSubmittedHandler.name);

  constructor(private readonly prisma: PrismaService) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as ClaimSubmittedEvent;
    return !!(data.claimId && data.policyId);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ClaimSubmittedEvent;

    this.logger.log(`Processing CLAIM_SUBMITTED: Claim ${data.claimId} for policy ${data.policyId}`);

    await this.prisma.claim.upsert({
      where: { id: data.claimId },
      update: {
        claimAmount: data.claimAmount,
        status: 'PENDING',
      },
      create: {
        id: data.claimId,
        policyId: data.policyId,
        claimAmount: data.claimAmount,
        status: 'PENDING',
      },
    });
  }
}

/**
 * Handler for CLAIM_PAID events
 */
export class ClaimPaidHandler implements IEventHandler {
  readonly eventType = 'claim_paid';
  private readonly logger = new Logger(ClaimPaidHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) { }

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as unknown as ClaimPaidEvent;
    return !!(data.claimId && data.payoutAmount);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as unknown as ClaimPaidEvent;

    this.logger.log(`Processing CLAIM_PAID: Claim ${data.claimId} with payout ${data.payoutAmount}`);

    const claim = await this.prisma.claim.update({
      where: { id: data.claimId },
      data: {
        status: 'PAID',
        payoutAmount: data.payoutAmount,
      },
      include: {
        // policy: true, // Need to check if relation exists in schema
      },
    });

    // Notify user
    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id: claim.policyId },
    });

    if (policy) {
      await this.notificationService.notify(
        policy.userId,
        'SYSTEM',
        'Insurance Payout Successful',
        `Your insurance claim of ${data.payoutAmount} has been paid!`,
        { claimId: data.claimId, policyId: claim.policyId }
      );
    }
  }
}

/**
 * Service that manages event handlers and routes events to appropriate handlers
 */

@Injectable()
export class EventHandlerService implements IEventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerService.name);
  private readonly handlers = new Map<string, IEventHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
    private readonly projectMetadataService: ProjectMetadataService,
  ) {
    // Dynamically load and register handlers from config
    const loader = new EventHandlerLoader(
      this.prisma,
      this.notificationService,
      this.reputationService,
      this.projectMetadataService,
      this
    );
    loader.loadAndRegisterHandlers();
  }

  /**
   * Register an event handler
   */
  register(handler: IEventHandler): void {
    this.handlers.set(handler.eventType, handler);
    this.logger.debug(`Registered handler for ${handler.eventType}`);
  }

  /**
   * Get handler for a specific event type
   */
  getHandler(eventType: string): IEventHandler | undefined {
    return this.handlers.get(eventType);
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): IEventHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Process a parsed contract event
   * Routes to appropriate handler if available
   */
  async processEvent(event: ParsedContractEvent): Promise<boolean> {
    const handler = this.getHandler(event.eventType);

    if (!handler) {
      this.logger.debug(`No handler registered for event type: ${event.eventType}`);
      return false;
    }

    try {
      // Validate event data
      if (!handler.validate(event)) {
        this.logger.warn(`Event validation failed for ${event.eventType}`);
        return false;
      }

      // Process the event
      await handler.handle(event);
      return true;
    } catch (error) {
      this.logger.error(`Error processing event ${event.eventType}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if an event type is supported
   */
  isSupported(eventType: string): boolean {
    return this.handlers.has(eventType);
  }
}
