import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { LedgerTrackerService } from './ledger-tracker.service';
import { EventHandlerService } from './event-handler.service';
import { NotificationService } from '../../notification/services/notification.service';
import { MetricsService } from '../../metrics/metrics.service';
import { LedgerInfo, ReorgDetectionResult } from '../types/ledger.types';
import { SorobanEvent, ParsedContractEvent } from '../types/event-types';

/**
 * Service for handling blockchain reorganizations
 * Detects reorgs, rolls back affected data, and reprocesses events
 */
@Injectable()
export class ReorgHandlerService {
  private readonly logger = new Logger(ReorgHandlerService.name);
  private readonly network: string;
  private readonly maxReorgDepth: number;
  private readonly reorgAlertThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ledgerTracker: LedgerTrackerService,
    private readonly eventHandler: EventHandlerService,
    private readonly notificationService: NotificationService,
    private readonly metricsService: MetricsService,
  ) {
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.maxReorgDepth = this.configService.get<number>('INDEXER_MAX_REORG_DEPTH', 100);
    this.reorgAlertThreshold = this.configService.get<number>('INDEXER_REORG_ALERT_THRESHOLD', 10);
  }

  /**
   * Detect and handle blockchain reorganizations
   * This method should be called before processing new events
   */
  async detectAndHandleReorg(currentLedger: LedgerInfo): Promise<number> {
    this.logger.debug(`Checking for reorg at ledger ${currentLedger.sequence}`);

    // Detect reorg
    const reorgResult = await this.ledgerTracker.detectReorg(currentLedger);
    
    if (!reorgResult.hasReorg) {
      return reorgResult.newLatestLedger;
    }

    this.logger.warn(
      `Re-org detected! Depth: ${reorgResult.reorgDepth}, ` +
      `Last valid ledger: ${reorgResult.lastValidLedger}, ` +
      `New latest ledger: ${reorgResult.newLatestLedger}`
    );

    // Record reorg metrics
    await this.recordReorgMetrics(reorgResult);

    // Send alert if reorg depth exceeds threshold
    if (reorgResult.reorgDepth >= this.reorgAlertThreshold) {
      await this.sendReorgAlert(reorgResult, currentLedger);
    }

    // Handle the reorg by rolling back and reprocessing
    const safeLedger = await this.handleReorgRollback(reorgResult);
    
    return safeLedger;
  }

  /**
   * Handle the actual rollback and reprocessing
   */
  private async handleReorgRollback(reorgResult: ReorgDetectionResult): Promise<number> {
    const rollbackStart = Date.now();
    
    try {
      // Step 1: Identify affected ledgers and events
      const affectedLedgers = await this.getAffectedLedgers(reorgResult.lastValidLedger);
      
      if (affectedLedgers.length === 0) {
        this.logger.log('No affected ledgers found, reorg handled by cursor update');
        return await this.ledgerTracker.handleReorg(reorgResult);
      }

      this.logger.log(`Found ${affectedLedgers.length} affected ledgers to rollback`);

      // Step 2: Collect events to rollback for idempotent undo
      const eventsToRollback = await this.getEventsToRollback(affectedLedgers);
      
      // Step 3: Perform rollback in reverse chronological order
      await this.performRollback(eventsToRollback);
      
      // Step 4: Update cursor to safe position
      const safeLedger = await this.ledgerTracker.handleReorg(reorgResult);
      
      // Step 5: Record rollback completion
      await this.recordReorgCompletion(reorgResult, affectedLedgers.length, eventsToRollback.length);
      
      const rollbackDuration = (Date.now() - rollbackStart) / 1000;
      this.logger.log(
        `Re-org rollback completed in ${rollbackDuration}s. ` +
        `Rolled back ${affectedLedgers.length} ledgers, ${eventsToRollback.length} events. ` +
        `Resuming from ledger ${safeLedger}`
      );

      return safeLedger;
    } catch (error) {
      this.logger.error(`Failed to handle reorg rollback: ${error.message}`, error.stack);
      await this.sendReorgFailureAlert(reorgResult, error);
      throw error;
    }
  }

  /**
   * Get list of affected ledgers that need to be rolled back
   */
  private async getAffectedLedgers(lastValidLedger: number): Promise<number[]> {
    const processedEvents = await this.prisma.processedEvent.findMany({
      where: {
        network: this.network,
        ledgerSeq: {
          gt: lastValidLedger,
        },
      },
      select: {
        ledgerSeq: true,
      },
      orderBy: {
        ledgerSeq: 'desc',
      },
      distinct: ['ledgerSeq'],
    });

    return processedEvents.map(event => event.ledgerSeq);
  }

  /**
   * Get all events that need to be rolled back
   */
  private async getEventsToRollback(affectedLedgers: number[]): Promise<any[]> {
    return await this.prisma.processedEvent.findMany({
      where: {
        network: this.network,
        ledgerSeq: {
          in: affectedLedgers,
        },
      },
      orderBy: {
        ledgerSeq: 'desc',
      },
    });
  }

  /**
   * Perform rollback of events in reverse chronological order
   * This ensures data consistency and allows for proper undo operations
   */
  private async performRollback(eventsToRollback: any[]): Promise<void> {
    this.logger.log(`Rolling back ${eventsToRollback.length} events`);

    // Group events by type for batch processing
    const eventsByType = this.groupEventsByType(eventsToRollback);

    // Process each event type with its specific rollback logic
    for (const [eventType, events] of Object.entries(eventsByType)) {
      await this.rollbackEventsByType(eventType, events);
    }

    // Delete processed event records
    await this.prisma.processedEvent.deleteMany({
      where: {
        network: this.network,
        eventId: {
          in: eventsToRollback.map(event => event.eventId),
        },
      },
    });

    this.logger.log(`Deleted ${eventsToRollback.length} processed event records`);
  }

  /**
   * Group events by their type for specialized rollback handling
   */
  private groupEventsByType(events: any[]): Record<string, any[]> {
    return events.reduce((groups, event) => {
      const eventType = event.eventType;
      if (!groups[eventType]) {
        groups[eventType] = [];
      }
      groups[eventType].push(event);
      return groups;
    }, {} as Record<string, any[]>);
  }

  /**
   * Rollback events of a specific type with appropriate undo logic
   */
  private async rollbackEventsByType(eventType: string, events: any[]): Promise<void> {
    this.logger.debug(`Rolling back ${events.length} events of type ${eventType}`);

    switch (eventType) {
      case 'contrib':
        await this.rollbackContributionEvents(events);
        break;
      case 'proj_new':
        await this.rollbackProjectCreationEvents(events);
        break;
      case 'm_apprv':
        await this.rollbackMilestoneApprovalEvents(events);
        break;
      case 'm_create':
        await this.rollbackMilestoneCreationEvents(events);
        break;
      case 'release':
        await this.rollbackFundsReleaseEvents(events);
        break;
      case 'proj_done':
        await this.rollbackProjectCompletionEvents(events);
        break;
      case 'proj_fail':
        await this.rollbackProjectFailureEvents(events);
        break;
      case 'policy_new':
        await this.rollbackPolicyCreationEvents(events);
        break;
      case 'claim_sub':
        await this.rollbackClaimSubmissionEvents(events);
        break;
      case 'claim_paid':
        await this.rollbackClaimPaymentEvents(events);
        break;
      default:
        this.logger.warn(`No rollback logic for event type ${eventType}, skipping`);
        break;
    }
  }

  /**
   * Rollback contribution events
   */
  private async rollbackContributionEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        // Delete the contribution record
        await this.prisma.contribution.deleteMany({
          where: {
            transactionHash: event.transactionHash,
          },
        });

        // Update project current funds (recalculate from remaining contributions)
        await this.recalculateProjectFunds(event.contractId);
      } catch (error) {
        this.logger.error(`Failed to rollback contribution event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback project creation events
   */
  private async rollbackProjectCreationEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        // Extract project ID from event data (would need proper parsing)
        const projectId = this.extractProjectIdFromEvent(event);
        if (projectId) {
          await this.prisma.project.deleteMany({
            where: {
              contractId: projectId,
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback project creation event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback milestone approval events
   */
  private async rollbackMilestoneApprovalEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const { projectId, milestoneId } = this.extractMilestoneDataFromEvent(event);
        if (projectId && milestoneId) {
          await this.prisma.milestone.updateMany({
            where: {
              project: {
                contractId: projectId,
              },
              contractMilestoneId: milestoneId.toString(),
            },
            data: {
              status: 'PENDING',
              completionDate: null,
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback milestone approval event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback milestone creation events
   */
  private async rollbackMilestoneCreationEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const { projectId, milestoneId } = this.extractMilestoneDataFromEvent(event);
        if (projectId && milestoneId) {
          await this.prisma.milestone.deleteMany({
            where: {
              project: {
                contractId: projectId,
              },
              contractMilestoneId: milestoneId.toString(),
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback milestone creation event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback funds release events
   */
  private async rollbackFundsReleaseEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const { projectId, milestoneId } = this.extractMilestoneDataFromEvent(event);
        if (projectId && milestoneId) {
          await this.prisma.milestone.updateMany({
            where: {
              project: {
                contractId: projectId,
              },
              contractMilestoneId: milestoneId.toString(),
            },
            data: {
              status: 'APPROVED',
              completionDate: null,
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback funds release event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback project completion events
   */
  private async rollbackProjectCompletionEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const projectId = this.extractProjectIdFromEvent(event);
        if (projectId) {
          await this.prisma.project.updateMany({
            where: {
              contractId: projectId,
            },
            data: {
              status: 'ACTIVE',
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback project completion event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback project failure events
   */
  private async rollbackProjectFailureEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const projectId = this.extractProjectIdFromEvent(event);
        if (projectId) {
          await this.prisma.project.updateMany({
            where: {
              contractId: projectId,
            },
            data: {
              status: 'ACTIVE',
            },
          });
        }
      } catch (error) {
        this.logger.error(`Failed to rollback project failure event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback policy creation events
   */
  private async rollbackPolicyCreationEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        await this.prisma.insurancePolicy.deleteMany({
          where: {
            id: event.eventId, // Assuming eventId is policyId
          },
        });
      } catch (error) {
        this.logger.error(`Failed to rollback policy creation event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback claim submission events
   */
  private async rollbackClaimSubmissionEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        await this.prisma.claim.deleteMany({
          where: {
            id: event.eventId, // Assuming eventId is claimId
          },
        });
      } catch (error) {
        this.logger.error(`Failed to rollback claim submission event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Rollback claim payment events
   */
  private async rollbackClaimPaymentEvents(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        await this.prisma.claim.updateMany({
          where: {
            id: event.eventId, // Assuming eventId is claimId
          },
          data: {
            status: 'APPROVED',
            payoutAmount: null,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to rollback claim payment event ${event.eventId}: ${error.message}`);
      }
    }
  }

  /**
   * Recalculate project funds after contribution rollback
   */
  private async recalculateProjectFunds(contractId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { contractId },
    });

    if (!project) {
      return;
    }

    // Sum all remaining contributions
    const contributions = await this.prisma.contribution.aggregate({
      where: {
        projectId: project.id,
      },
      _sum: {
        amount: true,
      },
    });

    await this.prisma.project.update({
      where: { id: project.id },
      data: {
        currentFunds: contributions._sum.amount || BigInt(0),
      },
    });
  }

  /**
   * Extract project ID from event data
   * This is a placeholder - proper implementation would parse event data
   */
  private extractProjectIdFromEvent(event: any): string | null {
    // In a real implementation, this would parse the event data properly
    // For now, return the contractId as a fallback
    return event.contractId || null;
  }

  /**
   * Extract milestone data from event
   * This is a placeholder - proper implementation would parse event data
   */
  private extractMilestoneDataFromEvent(event: any): { projectId: string | null; milestoneId: string | null } {
    // In a real implementation, this would parse the event data properly
    return {
      projectId: event.contractId || null,
      milestoneId: null, // Would be extracted from event data
    };
  }

  /**
   * Record reorg metrics for monitoring
   */
  private async recordReorgMetrics(reorgResult: ReorgDetectionResult): Promise<void> {
    this.metricsService.recordReorg(reorgResult.reorgDepth);
    
    // Store reorg event in database
    await this.prisma.indexerLog.create({
      data: {
        level: 'warn',
        message: `Blockchain re-org detected with depth ${reorgResult.reorgDepth}`,
        metadata: {
          reorgDepth: reorgResult.reorgDepth,
          lastValidLedger: reorgResult.lastValidLedger,
          newLatestLedger: reorgResult.newLatestLedger,
          network: this.network,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Record reorg completion
   */
  private async recordReorgCompletion(
    reorgResult: ReorgDetectionResult,
    ledgersRolledBack: number,
    eventsRolledBack: number,
  ): Promise<void> {
    await this.prisma.indexerLog.create({
      data: {
        level: 'info',
        message: `Re-org rollback completed successfully`,
        metadata: {
          reorgDepth: reorgResult.reorgDepth,
          ledgersRolledBack,
          eventsRolledBack,
          network: this.network,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Send alert notification for significant reorgs
   */
  private async sendReorgAlert(reorgResult: ReorgDetectionResult, currentLedger: LedgerInfo): Promise<void> {
    const alertMessage = 
      `🚨 Blockchain Re-org Alert!\n\n` +
      `Network: ${this.network}\n` +
      `Re-org Depth: ${reorgResult.reorgDepth} ledgers\n` +
      `Last Valid Ledger: ${reorgResult.lastValidLedger}\n` +
      `Current Ledger: ${currentLedger.sequence}\n` +
      `Current Hash: ${currentLedger.hash}\n\n` +
      `The indexer is rolling back affected events and will reprocess from the safe point.`;

    try {
      // Find admin users for alerts
      const alertUsers = await this.prisma.user.findMany({
        where: {
          // Add criteria for admin users or those with alert preferences
        },
        select: { id: true },
        take: 10, // Limit to avoid spam
      });

      for (const user of alertUsers) {
        await this.notificationService.notify(
          user.id,
          'SYSTEM',
          'Blockchain Re-org Detected',
          alertMessage,
          {
            alertType: 'reorg',
            reorgDepth: reorgResult.reorgDepth,
            network: this.network,
          }
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send reorg alert: ${error.message}`);
    }
  }

  /**
   * Send alert for reorg handling failures
   */
  private async sendReorgFailureAlert(reorgResult: ReorgDetectionResult, error: Error): Promise<void> {
    const alertMessage = 
      `🚨 Critical: Re-org Handling Failed!\n\n` +
      `Network: ${this.network}\n` +
      `Re-org Depth: ${reorgResult.reorgDepth}\n` +
      `Error: ${error.message}\n\n` +
      `Manual intervention may be required. The indexer may be in an inconsistent state.`;

    try {
      const alertUsers = await this.prisma.user.findMany({
        where: {
          // Add criteria for admin users
        },
        select: { id: true },
        take: 10,
      });

      for (const user of alertUsers) {
        await this.notificationService.notify(
          user.id,
          'SYSTEM',
          'Critical: Re-org Handling Failed',
          alertMessage,
          {
            alertType: 'reorg_failure',
            reorgDepth: reorgResult.reorgDepth,
            error: error.message,
            network: this.network,
          }
        );
      }
    } catch (alertError) {
      this.logger.error(`Failed to send reorg failure alert: ${alertError.message}`);
    }
  }

  /**
   * Get reorg statistics for monitoring
   */
  async getReorgStats(): Promise<{
    recentReorgs: any[];
    totalReorgs: number;
    avgReorgDepth: number;
    maxReorgDepth: number;
  }> {
    const recentReorgs = await this.prisma.indexerLog.findMany({
      where: {
        level: 'warn',
        message: {
          contains: 're-org detected',
          mode: 'insensitive',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const reorgLogs = await this.prisma.indexerLog.findMany({
      where: {
        level: 'warn',
        message: {
          contains: 're-org detected',
          mode: 'insensitive',
        },
      },
    });

    const reorgDepths = reorgLogs
      .map(log => log.metadata as any)
      .filter(metadata => metadata?.reorgDepth)
      .map(metadata => metadata.reorgDepth);

    return {
      recentReorgs: recentReorgs.map(log => ({
        timestamp: log.createdAt,
        depth: (log.metadata as any)?.reorgDepth,
        message: log.message,
      })),
      totalReorgs: reorgDepths.length,
      avgReorgDepth: reorgDepths.length > 0 
        ? reorgDepths.reduce((sum, depth) => sum + depth, 0) / reorgDepths.length 
        : 0,
      maxReorgDepth: reorgDepths.length > 0 ? Math.max(...reorgDepths) : 0,
    };
  }
}
