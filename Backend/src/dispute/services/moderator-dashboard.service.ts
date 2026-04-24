import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { DisputeStatus, DisputePriority, DisputeType } from '@prisma/client';

@Injectable()
export class ModeratorDashboardService {
  private readonly logger = new Logger(ModeratorDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get moderator dashboard overview
   */
  async getDashboardOverview(moderatorId: string) {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get counts for different statuses
    const [
      totalPending,
      myAssigned,
      urgentCount,
      last24hSubmitted,
      last7dResolved,
    ] = await Promise.all([
      this.prisma.reputationDispute.count({
        where: {
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
      }),
      this.prisma.reputationDispute.count({
        where: {
          moderatorId,
          status: {
            in: [DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
      }),
      this.prisma.reputationDispute.count({
        where: {
          priority: DisputePriority.URGENT,
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
      }),
      this.prisma.reputationDispute.count({
        where: {
          submittedAt: {
            gte: last24Hours,
          },
        },
      }),
      this.prisma.reputationDispute.count({
        where: {
          status: DisputeStatus.RESOLVED,
          resolvedAt: {
            gte: last7Days,
          },
        },
      }),
    ]);

    // Get resolution time metrics
    const recentResolutions = await this.prisma.reputationDispute.findMany({
      where: {
        status: DisputeStatus.RESOLVED,
        resolvedAt: {
          gte: last7Days,
        },
      },
      select: {
        submittedAt: true,
        resolvedAt: true,
      },
    });

    const averageResolutionTime = this.calculateAverageResolutionTime(recentResolutions);

    // Get dispute type distribution
    const typeDistribution = await this.prisma.reputationDispute.groupBy({
      by: ['disputeType'],
      where: {
        submittedAt: {
          gte: last7Days,
        },
      },
      _count: {
        id: true,
      },
    });

    return {
      overview: {
        totalPending,
        myAssigned,
        urgentCount,
        last24hSubmitted,
        last7dResolved,
        averageResolutionTime,
      },
      typeDistribution: typeDistribution.reduce((acc, item) => {
        acc[item.disputeType] = item._count.id;
        return acc;
      }, {}),
    };
  }

  /**
   * Get disputes assigned to moderator with filtering and pagination
   */
  async getAssignedDisputes(
    moderatorId: string,
    filters: {
      status?: DisputeStatus[];
      priority?: DisputePriority[];
      disputeType?: DisputeType[];
      page?: number;
      limit?: number;
      sortBy?: 'submittedAt' | 'priority' | 'status';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ) {
    const {
      status,
      priority,
      disputeType,
      page = 1,
      limit = 20,
      sortBy = 'priority',
      sortOrder = 'desc',
    } = filters;

    const where: any = { moderatorId };
    
    if (status && status.length > 0) {
      where.status = { in: status };
    }
    
    if (priority && priority.length > 0) {
      where.priority = { in: priority };
    }
    
    if (disputeType && disputeType.length > 0) {
      where.disputeType = { in: disputeType };
    }

    const skip = (page - 1) * limit;

    const [disputes, total] = await Promise.all([
      this.prisma.reputationDispute.findMany({
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
          comments: {
            where: { isInternal: false },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
        orderBy: this.buildOrderBy(sortBy, sortOrder),
        skip,
        take: limit,
      }),
      this.prisma.reputationDispute.count({ where }),
    ]);

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get available disputes for assignment
   */
  async getAvailableDisputes(
    filters: {
      priority?: DisputePriority[];
      disputeType?: DisputeType[];
      page?: number;
      limit?: number;
    } = {},
  ) {
    const {
      priority,
      disputeType,
      page = 1,
      limit = 20,
    } = filters;

    const where: any = {
      status: DisputeStatus.PENDING,
      moderatorId: null,
    };
    
    if (priority && priority.length > 0) {
      where.priority = { in: priority };
    }
    
    if (disputeType && disputeType.length > 0) {
      where.disputeType = { in: disputeType };
    }

    const skip = (page - 1) * limit;

    const [disputes, total] = await Promise.all([
      this.prisma.reputationDispute.findMany({
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
        skip,
        take: limit,
      }),
      this.prisma.reputationDispute.count({ where }),
    ]);

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get moderator performance metrics
   */
  async getModeratorMetrics(moderatorId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const [
      resolvedCount,
      averageResolutionTime,
      disputesByType,
      appealRate,
    ] = await Promise.all([
      this.prisma.reputationDispute.count({
        where: {
          moderatorId,
          status: DisputeStatus.RESOLVED,
          resolvedAt: {
            gte: startDate,
          },
        },
      }),
      this.getAverageResolutionTimeForModerator(moderatorId, startDate),
      this.prisma.reputationDispute.groupBy({
        by: ['disputeType'],
        where: {
          moderatorId,
          resolvedAt: {
            gte: startDate,
          },
        },
        _count: {
          id: true,
        },
      }),
      this.calculateAppealRateForModerator(moderatorId, startDate),
    ]);

    return {
      period,
      resolvedCount,
      averageResolutionTime,
      disputesByType: disputesByType.reduce((acc, item) => {
        acc[item.disputeType] = item._count.id;
        return acc;
      }, {}),
      appealRate,
    };
  }

  /**
   * Get dispute queue statistics
   */
  async getQueueStatistics() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      statusBreakdown,
      priorityBreakdown,
      typeBreakdown,
      agingBreakdown,
      moderatorWorkload,
    ] = await Promise.all([
      this.prisma.reputationDispute.groupBy({
        by: ['status'],
        where: {
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
        _count: {
          id: true,
        },
      }),
      this.prisma.reputationDispute.groupBy({
        by: ['priority'],
        where: {
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
        },
        _count: {
          id: true,
        },
      }),
      this.prisma.reputationDispute.groupBy({
        by: ['disputeType'],
        where: {
          submittedAt: {
            gte: last24Hours,
          },
        },
        _count: {
          id: true,
        },
      }),
      this.getAgingBreakdown(),
      this.getModeratorWorkload(),
    ]);

    return {
      statusBreakdown: statusBreakdown.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {}),
      priorityBreakdown: priorityBreakdown.reduce((acc, item) => {
        acc[item.priority] = item._count.id;
        return acc;
      }, {}),
      typeBreakdown: typeBreakdown.reduce((acc, item) => {
        acc[item.disputeType] = item._count.id;
        return acc;
      }, {}),
      agingBreakdown,
      moderatorWorkload,
    };
  }

  /**
   * Calculate average resolution time
   */
  private calculateAverageResolutionTime(resolutions: any[]): number {
    if (resolutions.length === 0) return 0;

    const totalTime = resolutions.reduce((sum, resolution) => {
      return sum + (resolution.resolvedAt.getTime() - resolution.submittedAt.getTime());
    }, 0);

    return Math.round((totalTime / resolutions.length) / (1000 * 60 * 60) * 100) / 100; // Hours
  }

  /**
   * Build order by clause for queries
   */
  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc'): any[] {
    const order: any = {};
    order[sortBy] = sortOrder;

    // Add secondary sort for consistent results
    if (sortBy !== 'submittedAt') {
      return [order, { submittedAt: 'desc' }];
    }

    return [order];
  }

  /**
   * Get average resolution time for a specific moderator
   */
  private async getAverageResolutionTimeForModerator(moderatorId: string, startDate: Date): Promise<number> {
    const resolutions = await this.prisma.reputationDispute.findMany({
      where: {
        moderatorId,
        status: DisputeStatus.RESOLVED,
        resolvedAt: {
          gte: startDate,
        },
      },
      select: {
        submittedAt: true,
        resolvedAt: true,
      },
    });

    return this.calculateAverageResolutionTime(resolutions);
  }

  /**
   * Calculate appeal rate for moderator
   */
  private async calculateAppealRateForModerator(moderatorId: string, startDate: Date): Promise<number> {
    const [resolvedCount, appealedCount] = await Promise.all([
      this.prisma.reputationDispute.count({
        where: {
          moderatorId,
          status: DisputeStatus.RESOLVED,
          resolvedAt: {
            gte: startDate,
          },
        },
      }),
      this.prisma.reputationDispute.count({
        where: {
          moderatorId,
          status: DisputeStatus.APPEALED,
          resolvedAt: {
            gte: startDate,
          },
        },
      }),
    ]);

    return resolvedCount > 0 ? (appealedCount / resolvedCount) * 100 : 0;
  }

  /**
   * Get aging breakdown for disputes
   */
  private async getAgingBreakdown(): Promise<any> {
    const now = new Date();
    const timeRanges = [
      { label: '0-24h', start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now },
      { label: '1-3 days', start: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), end: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      { label: '3-7 days', start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
      { label: '7+ days', start: new Date(0), end: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    ];

    const breakdown = {};

    for (const range of timeRanges) {
      const count = await this.prisma.reputationDispute.count({
        where: {
          status: {
            in: [DisputeStatus.PENDING, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
          },
          submittedAt: {
            gte: range.start,
            lt: range.end,
          },
        },
      });
      breakdown[range.label] = count;
    }

    return breakdown;
  }

  /**
   * Get moderator workload distribution
   */
  private async getModeratorWorkload(): Promise<any> {
    const workload = await this.prisma.reputationDispute.groupBy({
      by: ['moderatorId'],
      where: {
        status: {
          in: [DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE],
        },
        moderatorId: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    // Get moderator details
    const moderatorIds = workload.map(w => w.moderatorId).filter(Boolean);
    const moderators = await this.prisma.user.findMany({
      where: {
        id: {
          in: moderatorIds,
        },
      },
      select: {
        id: true,
        walletAddress: true,
        profileData: true,
      },
    });

    const moderatorMap = moderators.reduce((acc, moderator) => {
      acc[moderator.id] = moderator;
      return acc;
    }, {});

    return workload.map(w => ({
      moderatorId: w.moderatorId,
      moderator: moderatorMap[w.moderatorId],
      assignedCount: w._count.id,
    })).sort((a, b) => b.assignedCount - a.assignedCount);
  }
}
