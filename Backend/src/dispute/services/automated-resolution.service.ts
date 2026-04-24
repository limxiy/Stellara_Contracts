import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ReputationService } from '../../reputation/reputation.service';
import { DisputeType, DisputeStatus, ResolutionType } from '@prisma/client';

@Injectable()
export class AutomatedResolutionService {
  private readonly logger = new Logger(AutomatedResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Check if a dispute can be automatically resolved
   */
  async checkAutomatedResolution(disputeId: string): Promise<boolean> {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      include: {
        user: true,
        disputedActivity: true,
      },
    });

    if (!dispute) {
      this.logger.error(`Dispute ${disputeId} not found`);
      return false;
    }

    try {
      switch (dispute.disputeType) {
        case DisputeType.SCORE_CALCULATION_ERROR:
          return await this.handleScoreCalculationError(dispute);
        case DisputeType.TECHNICAL_GLITCH:
          return await this.handleTechnicalGlitch(dispute);
        case DisputeType.DUPLICATE_ACTIVITY:
          return await this.handleDuplicateActivity(dispute);
        default:
          return false;
      }
    } catch (error) {
      this.logger.error(`Error in automated resolution for dispute ${disputeId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle score calculation errors
   */
  private async handleScoreCalculationError(dispute: any): Promise<boolean> {
    this.logger.log(`Checking score calculation for dispute ${dispute.id}`);

    // Recalculate the user's reputation score
    await this.reputationService.updateReputationScore(dispute.userId);
    
    const updatedUser = await this.prisma.user.findUnique({
      where: { id: dispute.userId },
      select: { reputationScore: true },
    });

    if (!updatedUser) return false;

    const scoreDifference = Math.abs(updatedUser.reputationScore - dispute.previousScore);

    // If there's a significant difference, auto-resolve
    if (scoreDifference > 5) {
      await this.createAutomatedResolution(
        dispute.id,
        ResolutionType.AUTOMATED_CORRECTION,
        `Score calculation error detected and corrected. Previous score: ${dispute.previousScore}, New score: ${updatedUser.reputationScore}`,
        updatedUser.reputationScore,
        {
          previousScore: dispute.previousScore,
          newScore: updatedUser.reputationScore,
          scoreDifference,
          correctionReason: 'AUTOMATIC_RECALCULATION',
        },
      );

      this.logger.log(`Auto-resolved dispute ${dispute.id} with score correction`);
      return true;
    }

    return false;
  }

  /**
   * Handle technical glitches
   */
  private async handleTechnicalGlitch(dispute: any): Promise<boolean> {
    this.logger.log(`Checking technical glitch for dispute ${dispute.id}`);

    // Check if there are any system logs or errors around the disputed activity time
    if (dispute.disputedActivity) {
      const activityTime = dispute.disputedActivity.occurredAt;
      const errorWindowStart = new Date(activityTime.getTime() - 5 * 60 * 1000); // 5 minutes before
      const errorWindowEnd = new Date(activityTime.getTime() + 5 * 60 * 1000); // 5 minutes after

      // Check for system errors in the time window
      const systemErrors = await this.prisma.indexerLog.findMany({
        where: {
          timestamp: {
            gte: errorWindowStart,
            lte: errorWindowEnd,
          },
          level: 'ERROR',
        },
      });

      if (systemErrors.length > 0) {
        // Found system errors, likely a technical glitch
        await this.createAutomatedResolution(
          dispute.id,
          ResolutionType.AUTOMATED_CORRECTION,
          `Technical glitch detected during activity recording. System errors found in the activity time window.`,
          dispute.previousScore, // Restore previous score
          {
            systemErrors: systemErrors.map(log => ({
              message: log.message,
              timestamp: log.timestamp,
              metadata: log.metadata,
            })),
            activityTime: dispute.disputedActivity.occurredAt,
            correctionReason: 'TECHNICAL_GLITCH_DETECTED',
          },
        );

        this.logger.log(`Auto-resolved dispute ${dispute.id} due to technical glitch`);
        return true;
      }
    }

    return false;
  }

  /**
   * Handle duplicate activity detection
   */
  private async handleDuplicateActivity(dispute: any): Promise<boolean> {
    this.logger.log(`Checking duplicate activity for dispute ${dispute.id}`);

    if (!dispute.disputedActivity) return false;

    // Look for similar activities within a short time window
    const timeWindow = 60 * 60 * 1000; // 1 hour
    const activityTime = dispute.disputedActivity.occurredAt;
    
    const duplicateActivities = await this.prisma.reputationActivity.findMany({
      where: {
        subjectId: dispute.userId,
        activityType: dispute.disputedActivity.activityType,
        value: dispute.disputedActivity.value,
        referenceId: dispute.disputedActivity.referenceId,
        occurredAt: {
          gte: new Date(activityTime.getTime() - timeWindow),
          lte: new Date(activityTime.getTime() + timeWindow),
        },
        id: {
          not: dispute.disputedActivity.id,
        },
      },
    });

    if (duplicateActivities.length > 0) {
      // Found duplicate activities, remove this one
      await this.prisma.reputationActivity.delete({
        where: { id: dispute.disputedActivity.id },
      });

      // Recalculate score after removing duplicate
      await this.reputationService.updateReputationScore(dispute.userId);
      
      const updatedUser = await this.prisma.user.findUnique({
        where: { id: dispute.userId },
        select: { reputationScore: true },
      });

      await this.createAutomatedResolution(
        dispute.id,
        ResolutionType.ACTIVITY_CORRECTION,
        `Duplicate activity detected and removed. Found ${duplicateActivities.length} similar activities in the time window.`,
        updatedUser?.reputationScore || dispute.previousScore,
        {
          duplicateActivities: duplicateActivities.map(activity => ({
            id: activity.id,
            occurredAt: activity.occurredAt,
            value: activity.value,
          })),
          removedActivityId: dispute.disputedActivity.id,
          correctionReason: 'DUPLICATE_ACTIVITY_REMOVED',
        },
      );

      this.logger.log(`Auto-resolved dispute ${dispute.id} by removing duplicate activity`);
      return true;
    }

    return false;
  }

  /**
   * Create an automated resolution
   */
  private async createAutomatedResolution(
    disputeId: string,
    resolutionType: ResolutionType,
    explanation: string,
    finalScore: number,
    evidence: any,
  ): Promise<void> {
    const resolution = await this.prisma.disputeResolution.create({
      data: {
        disputeId,
        finalScore,
        scoreAdjustment: finalScore ? 0 : 0, // Will be calculated in the main service
        resolutionType,
        explanation,
        evidence,
        moderatorId: 'system', // System moderator
        isFinal: true,
        canAppeal: resolutionType !== ResolutionType.AUTOMATED_CORRECTION,
        appealDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Update dispute status
    await this.prisma.reputationDispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.RESOLVED,
        resolutionId: resolution.id,
        resolvedAt: new Date(),
        automatedResolution: true,
      },
    });

    // Apply score adjustment if needed
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      select: { previousScore: true, userId: true },
    });

    if (dispute && finalScore !== dispute.previousScore) {
      const scoreAdjustment = finalScore - dispute.previousScore;

      await this.prisma.user.update({
        where: { id: dispute.userId },
        data: { reputationScore: finalScore },
      });

      // Record in reputation history
      await this.prisma.reputationHistory.create({
        data: {
          userId: dispute.userId,
          scoreChange: scoreAdjustment,
          reason: `DISPUTE_RESOLUTION: ${resolutionType}`,
        },
      });

      // Update the resolution with correct score adjustment
      await this.prisma.disputeResolution.update({
        where: { id: resolution.id },
        data: { scoreAdjustment },
      });
    }
  }

  /**
   * Batch process pending disputes for automated resolution
   */
  async processPendingAutomatedResolutions(): Promise<number> {
    this.logger.log('Starting batch processing of automated resolutions');

    const pendingDisputes = await this.prisma.reputationDispute.findMany({
      where: {
        status: DisputeStatus.PENDING,
        automatedResolution: false,
        disputeType: {
          in: [
            DisputeType.SCORE_CALCULATION_ERROR,
            DisputeType.TECHNICAL_GLITCH,
            DisputeType.DUPLICATE_ACTIVITY,
          ],
        },
      },
      take: 50, // Process in batches
    });

    let resolvedCount = 0;

    for (const dispute of pendingDisputes) {
      try {
        const resolved = await this.checkAutomatedResolution(dispute.id);
        if (resolved) {
          resolvedCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to process dispute ${dispute.id}: ${error.message}`);
      }
    }

    this.logger.log(`Batch processing completed. Resolved ${resolvedCount}/${pendingDisputes.length} disputes`);
    return resolvedCount;
  }

  /**
   * Get automated resolution statistics
   */
  async getAutomatedResolutionStats(): Promise<any> {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const totalDisputes = await this.prisma.reputationDispute.count({
      where: {
        submittedAt: {
          gte: last30Days,
        },
      },
    });

    const automatedResolutions = await this.prisma.reputationDispute.count({
      where: {
        submittedAt: {
          gte: last30Days,
        },
        automatedResolution: true,
      },
    });

    const byType = await this.prisma.reputationDispute.groupBy({
      by: ['disputeType'],
      where: {
        submittedAt: {
          gte: last30Days,
        },
        automatedResolution: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalDisputes,
      automatedResolutions,
      automationRate: totalDisputes > 0 ? (automatedResolutions / totalDisputes) * 100 : 0,
      byType: byType.reduce((acc, item) => {
        acc[item.disputeType] = item._count.id;
        return acc;
      }, {}),
    };
  }
}
