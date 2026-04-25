import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache/cache.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  DashboardMetricsDto,
  TimeSeriesDataDto,
  TimeSeriesPointDto,
  TopProjectDto,
  UserActivityDto,
  PlatformOverviewDto,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 60; // 1 minute for real-time feel
  private readonly OVERVIEW_TTL = 120; // 2 minutes for overview

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Get dashboard metrics with caching
   */
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    const cacheKey = 'analytics:dashboard:metrics';
    const cached = await this.cache.get<DashboardMetricsDto>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('analytics');
      return cached;
    }
    this.metrics.recordCacheMiss('analytics');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      totalProjects,
      activeProjects,
      totalContributions,
      contributionsToday,
      totalVolumeAgg,
      volumeTodayAgg,
      totalClaims,
      pendingClaims,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.project.count(),
      this.prisma.project.count({ where: { status: 'ACTIVE' } }),
      this.prisma.contribution.count(),
      this.prisma.contribution.count({ where: { createdAt: { gte: today } } }),
      this.prisma.contribution.aggregate({ _sum: { amount: true } }),
      this.prisma.contribution.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: today } } }),
      this.prisma.claim.count(),
      this.prisma.claim.count({ where: { status: 'PENDING' } }),
    ]);

    const result: DashboardMetricsDto = {
      totalUsers,
      activeUsers,
      newUsersToday,
      totalProjects,
      activeProjects,
      totalContributions,
      contributionsToday,
      totalVolume: totalVolumeAgg._sum.amount?.toString() ?? '0',
      volumeToday: volumeTodayAgg._sum.amount?.toString() ?? '0',
      totalClaims,
      pendingClaims,
      indexerLag: 0, // populated by indexer integration
      systemHealth: 'healthy',
      timestamp: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['analytics:dashboard']);
    return result;
  }

  /**
   * Get platform overview combining metrics, charts, top projects, and user activity
   */
  async getPlatformOverview(range = '7d'): Promise<PlatformOverviewDto> {
    const cacheKey = `analytics:overview:${range}`;
    const cached = await this.cache.get<PlatformOverviewDto>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('analytics');
      return cached;
    }
    this.metrics.recordCacheMiss('analytics');

    const [metrics, charts, topProjects, userActivity] = await Promise.all([
      this.getDashboardMetrics(),
      this.getTimeSeriesCharts(range),
      this.getTopProjects(),
      this.getUserActivity(range),
    ]);

    const result: PlatformOverviewDto = {
      metrics,
      charts,
      topProjects,
      userActivity,
    };

    await this.cache.set(cacheKey, result, this.OVERVIEW_TTL, ['analytics:overview']);
    return result;
  }

  /**
   * Get time-series charts for dashboard
   */
  async getTimeSeriesCharts(range = '7d'): Promise<TimeSeriesDataDto[]> {
    const cacheKey = `analytics:charts:${range}`;
    const cached = await this.cache.get<TimeSeriesDataDto[]>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('analytics');
      return cached;
    }
    this.metrics.recordCacheMiss('analytics');

    const { startDate, endDate, intervalDays } = this.parseRange(range);

    const [userGrowth, contributionVolume, projectCreation] = await Promise.all([
      this.getUserGrowthSeries(startDate, endDate, intervalDays),
      this.getContributionVolumeSeries(startDate, endDate, intervalDays),
      this.getProjectCreationSeries(startDate, endDate, intervalDays),
    ]);

    const result = [userGrowth, contributionVolume, projectCreation];
    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['analytics:charts']);
    return result;
  }

  /**
   * Get top projects by contributions
   */
  async getTopProjects(limit = 5): Promise<TopProjectDto[]> {
    const cacheKey = `analytics:topProjects:${limit}`;
    const cached = await this.cache.get<TopProjectDto[]>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('analytics');
      return cached;
    }
    this.metrics.recordCacheMiss('analytics');

    const projects = await this.prisma.project.findMany({
      take: limit,
      orderBy: { currentFunds: 'desc' },
      include: {
        _count: { select: { contributions: true } },
        contributions: { select: { amount: true } },
      },
    });

    const result: TopProjectDto[] = projects.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      contributions: p._count.contributions,
      totalRaised: p.currentFunds.toString(),
      contributorCount: new Set(p.contributions.map((c) => c.amount.toString())).size,
    }));

    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['analytics:topProjects']);
    return result;
  }

  /**
   * Get user activity over time
   */
  async getUserActivity(range = '7d'): Promise<UserActivityDto[]> {
    const cacheKey = `analytics:userActivity:${range}`;
    const cached = await this.cache.get<UserActivityDto[]>(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit('analytics');
      return cached;
    }
    this.metrics.recordCacheMiss('analytics');

    const { startDate, endDate, intervalDays } = this.parseRange(range);
    const points = this.generateDatePoints(startDate, endDate, intervalDays);

    const result = await Promise.all(
      points.map(async (point) => {
        const nextDate = new Date(point);
        nextDate.setDate(nextDate.getDate() + intervalDays);

        const [newUsers, activeUsers, contributions] = await Promise.all([
          this.prisma.user.count({ where: { createdAt: { gte: point, lt: nextDate } } }),
          this.prisma.user.count({ where: { updatedAt: { gte: point, lt: nextDate } } }),
          this.prisma.contribution.count({ where: { createdAt: { gte: point, lt: nextDate } } }),
        ]);

        return {
          date: point.toISOString().split('T')[0],
          logins: activeUsers,
          newUsers,
          activeUsers,
          contributions,
        };
      }),
    );

    await this.cache.set(cacheKey, result, this.CACHE_TTL, ['analytics:userActivity']);
    return result;
  }

  /**
   * Get real-time metrics snapshot for WebSocket broadcast
   */
  async getRealtimeSnapshot(): Promise<Record<string, unknown>> {
    const metrics = await this.getDashboardMetrics();
    return {
      type: 'snapshot',
      metrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Invalidate analytics caches
   */
  async invalidateCaches(): Promise<void> {
    await this.cache.invalidateByTag('analytics:dashboard');
    await this.cache.invalidateByTag('analytics:overview');
    await this.cache.invalidateByTag('analytics:charts');
    await this.cache.invalidateByTag('analytics:topProjects');
    await this.cache.invalidateByTag('analytics:userActivity');
    this.logger.log('Analytics caches invalidated');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private parseRange(range: string): { startDate: Date; endDate: Date; intervalDays: number } {
    const endDate = new Date();
    const startDate = new Date();
    let intervalDays = 1;

    switch (range) {
      case '1h':
        startDate.setHours(endDate.getHours() - 1);
        intervalDays = 0;
        break;
      case '24h':
        startDate.setDate(endDate.getDate() - 1);
        intervalDays = 1;
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        intervalDays = 1;
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        intervalDays = 1;
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        intervalDays = 7;
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    return { startDate, endDate, intervalDays };
  }

  private generateDatePoints(start: Date, end: Date, intervalDays: number): Date[] {
    const points: Date[] = [];
    const current = new Date(start);
    while (current < end) {
      points.push(new Date(current));
      current.setDate(current.getDate() + Math.max(intervalDays, 1));
    }
    return points;
  }

  private async getUserGrowthSeries(
    startDate: Date,
    endDate: Date,
    intervalDays: number,
  ): Promise<TimeSeriesDataDto> {
    const points = this.generateDatePoints(startDate, endDate, intervalDays);
    const data: TimeSeriesPointDto[] = await Promise.all(
      points.map(async (point) => {
        const nextDate = new Date(point);
        nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 1));
        const count = await this.prisma.user.count({
          where: { createdAt: { gte: point, lt: nextDate } },
        });
        return { timestamp: point.toISOString(), value: count };
      }),
    );
    return { metric: 'user_growth', data };
  }

  private async getContributionVolumeSeries(
    startDate: Date,
    endDate: Date,
    intervalDays: number,
  ): Promise<TimeSeriesDataDto> {
    const points = this.generateDatePoints(startDate, endDate, intervalDays);
    const data: TimeSeriesPointDto[] = await Promise.all(
      points.map(async (point) => {
        const nextDate = new Date(point);
        nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 1));
        const agg = await this.prisma.contribution.aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: point, lt: nextDate } },
        });
        return {
          timestamp: point.toISOString(),
          value: Number(agg._sum.amount ?? 0),
        };
      }),
    );
    return { metric: 'contribution_volume', data };
  }

  private async getProjectCreationSeries(
    startDate: Date,
    endDate: Date,
    intervalDays: number,
  ): Promise<TimeSeriesDataDto> {
    const points = this.generateDatePoints(startDate, endDate, intervalDays);
    const data: TimeSeriesPointDto[] = await Promise.all(
      points.map(async (point) => {
        const nextDate = new Date(point);
        nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 1));
        const count = await this.prisma.project.count({
          where: { createdAt: { gte: point, lt: nextDate } },
        });
        return { timestamp: point.toISOString(), value: count };
      }),
    );
    return { metric: 'project_creation', data };
  }
}
