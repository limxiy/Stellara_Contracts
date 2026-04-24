import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { 
  DisputeType, 
  DisputeStatus, 
  DisputePriority, 
  ResolutionType,
  DisputeStatus,
  ReputationDispute,
  DisputeResolution
} from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Submit a new reputation dispute
   */
  async submitDispute(
    userId: string,
    disputeType: DisputeType,
    reason: string,
    description: string,
    evidence?: any,
    disputedActivityId?: string,
    requestedScore?: number,
  ) {
    this.logger.log(`User ${userId} submitting dispute of type ${disputeType}`);

    // Validate user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get current reputation score
    const currentScore = user.reputationScore;

    // Validate disputed activity if provided
    if (disputedActivityId) {
      const activity = await this.prisma.reputationActivity.findUnique({
        where: { id: disputedActivityId },
      });
      if (!activity) {
        throw new NotFoundException('Reputation activity not found');
      }
      if (activity.subjectId !== userId) {
        throw new BadRequestException('Cannot dispute activity belonging to another user');
      }
    }

    // Check for existing disputes on the same activity
    if (disputedActivityId) {
      const existingDispute = await this.prisma.reputationDispute.findFirst({
        where: {
          disputedActivityId,
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
      });
      if (existingDispute) {
        throw new BadRequestException('A dispute for this activity is already in progress');
      }
    }

    // Determine priority based on dispute type and score impact
    const priority = this.calculateDisputePriority(disputeType, currentScore, requestedScore);

    const dispute = await this.prisma.reputationDispute.create({
      data: {
        userId,
        disputedActivityId,
        disputeType,
        reason,
        description,
        evidence: evidence ? JSON.parse(JSON.stringify(evidence)) : null,
        previousScore: currentScore,
        requestedScore,
        status: DisputeStatus.PENDING,
        priority,
      },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
          },
        },
        disputedActivity: true,
      },
    });

    // Check for automated resolution eligibility
    await this.checkAutomatedResolution(dispute.id);

    this.logger.log(`Dispute ${dispute.id} submitted successfully`);
    return dispute;
  }

  /**
   * Get dispute details
   */
  async getDispute(disputeId: string) {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
            profileData: true,
          },
        },
        disputedActivity: true,
        moderator: {
          select: {
            id: true,
            walletAddress: true,
            profileData: true,
          },
        },
        resolution: true,
        comments: {
          include: {
            author: {
              select: {
                id: true,
                walletAddress: true,
                profileData: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  /**
   * Get user's dispute history
   */
  async getUserDisputes(userId: string, status?: DisputeStatus) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    return this.prisma.reputationDispute.findMany({
      where,
      include: {
        disputedActivity: true,
        resolution: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Get disputes for moderator review
   */
  async getPendingDisputes(moderatorId?: string) {
    const where: any = {
      status: {
        in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
      },
    };

    if (moderatorId) {
      where.moderatorId = moderatorId;
    }

    return this.prisma.reputationDispute.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            reputationScore: true,
            profileData: true,
          },
        },
        disputedActivity: true,
      },
      orderBy: [
        { priority: 'desc' },
        { submittedAt: 'asc' },
      ],
    });
  }

  /**
   * Assign moderator to dispute
   */
  async assignModerator(disputeId: string, moderatorId: string) {
    const dispute = await this.prisma.reputationDispute.update({
      where: { id: disputeId },
      data: {
        moderatorId,
        status: DisputeStatus.UNDER_REVIEW,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(`Dispute ${disputeId} assigned to moderator ${moderatorId}`);
    return dispute;
  }

  /**
   * Add comment to dispute
   */
  async addComment(disputeId: string, authorId: string, content: string, isInternal = false) {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return this.prisma.disputeComment.create({
      data: {
        disputeId,
        authorId,
        content,
        isInternal,
      },
      include: {
        author: {
          select: {
            id: true,
            walletAddress: true,
            profileData: true,
          },
        },
      },
    });
  }

  /**
   * Resolve dispute
   */
  async resolveDispute(
    disputeId: string,
    moderatorId: string,
    resolutionType: ResolutionType,
    explanation: string,
    finalScore?: number,
    evidence?: any,
  ) {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      include: { user: true },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new BadRequestException('Dispute is already resolved');
    }

    const scoreAdjustment = finalScore ? finalScore - dispute.previousScore : 0;

    // Create resolution record
    const resolution = await this.prisma.disputeResolution.create({
      data: {
        disputeId,
        finalScore,
        scoreAdjustment,
        resolutionType,
        explanation,
        evidence: evidence ? JSON.parse(JSON.stringify(evidence)) : null,
        moderatorId,
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
      },
    });

    // Apply score adjustment if needed
    if (finalScore !== undefined && finalScore !== dispute.previousScore) {
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

      this.logger.log(`Applied score adjustment of ${scoreAdjustment} for user ${dispute.userId}`);
    }

    this.logger.log(`Dispute ${disputeId} resolved with type ${resolutionType}`);
    return resolution;
  }

  /**
   * Appeal dispute resolution
   */
  async appealDispute(disputeId: string, userId: string, reason: string) {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      include: { resolution: true },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.userId !== userId) {
      throw new BadRequestException('Cannot appeal dispute belonging to another user');
    }

    if (dispute.status !== DisputeStatus.RESOLVED) {
      throw new BadRequestException('Can only appeal resolved disputes');
    }

    if (!dispute.resolution?.canAppeal) {
      throw new BadRequestException('This dispute cannot be appealed');
    }

    if (dispute.resolution.appealDeadline && dispute.resolution.appealDeadline < new Date()) {
      throw new BadRequestException('Appeal deadline has passed');
    }

    // Update dispute status to appealed
    const updatedDispute = await this.prisma.reputationDispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.APPEALED,
        moderatorId: null, // Reassign to new moderator
        reviewedAt: null,
      },
    });

    this.logger.log(`Dispute ${disputeId} appealed by user ${userId}`);
    return updatedDispute;
  }

  /**
   * Calculate dispute priority based on type and impact
   */
  private calculateDisputePriority(
    disputeType: DisputeType,
    currentScore: number,
    requestedScore?: number,
  ): DisputePriority {
    const scoreDifference = requestedScore ? Math.abs(requestedScore - currentScore) : 0;

    // High priority for technical glitches and calculation errors
    if ([DisputeType.SCORE_CALCULATION_ERROR, DisputeType.TECHNICAL_GLITCH].includes(disputeType)) {
      return DisputePriority.HIGH;
    }

    // Urgent for large score differences
    if (scoreDifference > 100) {
      return DisputePriority.URGENT;
    }

    // High priority for significant differences
    if (scoreDifference > 50) {
      return DisputePriority.HIGH;
    }

    // Medium priority for moderate differences
    if (scoreDifference > 20) {
      return DisputePriority.MEDIUM;
    }

    return DisputePriority.LOW;
  }

  /**
   * Check if dispute can be automatically resolved
   */
  private async checkAutomatedResolution(disputeId: string) {
    const dispute = await this.prisma.reputationDispute.findUnique({
      where: { id: disputeId },
      include: { disputedActivity: true },
    });

    if (!dispute) return;

    // Check for clear calculation errors
    if (dispute.disputeType === DisputeType.SCORE_CALCULATION_ERROR && dispute.disputedActivity) {
      // Recalculate the activity impact
      try {
        await this.reputationService.updateReputationScore(dispute.userId);
        const updatedUser = await this.prisma.user.findUnique({
          where: { id: dispute.userId },
          select: { reputationScore: true },
        });

        if (updatedUser.reputationScore !== dispute.previousScore) {
          // Score was corrected, auto-resolve
          await this.resolveDispute(
            disputeId,
            'system', // System moderator
            ResolutionType.AUTOMATED_CORRECTION,
            'Score calculation error automatically corrected',
            updatedUser.reputationScore,
          );

          await this.prisma.reputationDispute.update({
            where: { id: disputeId },
            data: { automatedResolution: true },
          });

          this.logger.log(`Dispute ${disputeId} automatically resolved`);
        }
      } catch (error) {
        this.logger.error(`Failed to auto-resolve dispute ${disputeId}: ${error.message}`);
      }
    }
  }

  /**
   * Update dispute metrics (called by cron job)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async updateDisputeMetrics() {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const metrics = await this.calculateDisputeMetrics(periodStart, now);

    await this.prisma.disputeMetrics.upsert({
      where: {
        period_periodStart: {
          period: 'daily',
          periodStart,
        },
      },
      update: metrics,
      create: {
        ...metrics,
        period: 'daily',
        periodStart,
        periodEnd: now,
      },
    });
  }

  /**
   * Calculate dispute metrics for a time period
   */
  private async calculateDisputeMetrics(startDate: Date, endDate: Date) {
    const disputes = await this.prisma.reputationDispute.findMany({
      where: {
        submittedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        resolution: true,
      },
    });

    const totalDisputes = disputes.length;
    const pendingDisputes = disputes.filter(d => 
      [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE].includes(d.status)
    ).length;
    const resolvedDisputes = disputes.filter(d => d.status === DisputeStatus.RESOLVED).length;
    const automatedResolutions = disputes.filter(d => d.automatedResolution).length;

    // Calculate average resolution time
    const resolvedDisputesWithTime = disputes.filter(d => 
      d.status === DisputeStatus.RESOLVED && d.resolvedAt && d.submittedAt
    );
    const averageResolutionTime = resolvedDisputesWithTime.length > 0
      ? resolvedDisputesWithTime.reduce((sum, d) => 
          sum + (d.resolvedAt.getTime() - d.submittedAt.getTime()), 0
        ) / resolvedDisputesWithTime.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Calculate success rate (disputes where user got some adjustment)
    const successfulResolutions = disputes.filter(d => 
      d.resolution && d.resolution.scoreAdjustment !== 0
    ).length;
    const successRate = resolvedDisputes > 0 ? successfulResolutions / resolvedDisputes : 0;

    // Calculate appeal rate
    const appealedDisputes = disputes.filter(d => d.status === DisputeStatus.APPEALED).length;
    const appealRate = resolvedDisputes > 0 ? appealedDisputes / resolvedDisputes : 0;

    return {
      totalDisputes,
      pendingDisputes,
      resolvedDisputes,
      automatedResolutions,
      averageResolutionTime: Math.round(averageResolutionTime * 100) / 100,
      successRate: Math.round(successRate * 10000) / 10000,
      appealRate: Math.round(appealRate * 10000) / 10000,
    };
  }

  /**
   * Get dispute metrics
   */
  async getDisputeMetrics(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const endDate = new Date();
    let startDate: Date;

    switch (period) {
      case 'weekly':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'daily':
      default:
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    return this.prisma.disputeMetrics.findMany({
      where: {
        period,
        periodStart: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { periodStart: 'desc' },
    });
  }
}
