import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Injectable, Logger } from '@nestjs/common';
import { IEventHandler, IEventHandlerRegistry } from '../interfaces/event-handler.interface';
import { PrismaService } from '../../prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { ReputationService } from '../../reputation/reputation.service';
import { ProjectMetadataService } from './project-metadata.service';

// Import all handler classes
import { ProjectCreatedHandler } from './event-handler.service';
import { ContributionMadeHandler } from './event-handler.service';
import { MilestoneCreatedHandler } from './event-handler.service';
import { MilestoneApprovedHandler } from './event-handler.service';
import { MilestoneRejectedHandler } from './event-handler.service';
import { FundsReleasedHandler } from './event-handler.service';
import { ProjectCompletedHandler } from './event-handler.service';
import { ProjectFailedHandler } from './event-handler.service';
import { PolicyCreatedHandler } from './event-handler.service';
import { ClaimSubmittedHandler } from './event-handler.service';
import { ClaimPaidHandler } from './event-handler.service';

const HANDLER_CLASS_MAP: Record<string, any> = {
  ProjectCreatedHandler,
  ContributionMadeHandler,
  MilestoneCreatedHandler,
  MilestoneApprovedHandler,
  MilestoneRejectedHandler,
  FundsReleasedHandler,
  ProjectCompletedHandler,
  ProjectFailedHandler,
  PolicyCreatedHandler,
  ClaimSubmittedHandler,
  ClaimPaidHandler,
};

export interface EventTypeConfig {
  type: string;
  version: number;
  handler: string;
  schema?: string;
  wildcard?: boolean;
}

@Injectable()
export class EventHandlerLoader {
  private readonly logger = new Logger(EventHandlerLoader.name);
  private readonly configPath = 'Backend/config/event-types.yaml';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
    private readonly projectMetadataService: ProjectMetadataService,
    private readonly registry: IEventHandlerRegistry,
  ) {}

  loadAndRegisterHandlers(): void {
    const config = yaml.load(fs.readFileSync(this.configPath, 'utf8')) as { event_types: EventTypeConfig[] };
    for (const evt of config.event_types) {
      const HandlerClass = HANDLER_CLASS_MAP[evt.handler];
      if (!HandlerClass) {
        this.logger.warn(`No handler class found for ${evt.handler}`);
        continue;
      }
      // Instantiate handler with required dependencies
      let handler: IEventHandler;
      switch (evt.handler) {
        case 'ProjectCreatedHandler':
          handler = new HandlerClass(this.prisma, this.projectMetadataService);
          break;
        case 'ContributionMadeHandler':
        case 'MilestoneApprovedHandler':
        case 'MilestoneRejectedHandler':
          handler = new HandlerClass(this.prisma, this.notificationService, this.reputationService);
          break;
        case 'MilestoneCreatedHandler':
        case 'FundsReleasedHandler':
          handler = new HandlerClass(this.prisma);
          break;
        case 'ProjectCompletedHandler':
        case 'ProjectFailedHandler':
          handler = new HandlerClass(this.prisma, this.reputationService);
          break;
        case 'PolicyCreatedHandler':
        case 'ClaimSubmittedHandler':
          handler = new HandlerClass(this.prisma);
          break;
        case 'ClaimPaidHandler':
          handler = new HandlerClass(this.prisma, this.notificationService);
          break;
        default:
          this.logger.warn(`Unknown handler constructor for ${evt.handler}`);
          continue;
      }
      this.registry.register(handler);
      this.logger.log(`Dynamically registered handler for event type: ${evt.type}`);
    }
  }
}
