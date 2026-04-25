import { Controller, Get, Query, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import {
  DashboardMetricsDto,
  PlatformOverviewDto,
  TimeSeriesDataDto,
  TopProjectDto,
  UserActivityDto,
} from './dto/analytics.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get real-time dashboard metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard metrics returned', type: DashboardMetricsDto })
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    return this.analyticsService.getDashboardMetrics();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get full platform overview with charts and activity' })
  @ApiQuery({ name: 'range', required: false, description: 'Time range: 1h, 24h, 7d, 30d, 90d', example: '7d' })
  @ApiResponse({ status: 200, description: 'Platform overview returned', type: PlatformOverviewDto })
  async getPlatformOverview(
    @Query('range') range = '7d',
  ): Promise<PlatformOverviewDto> {
    return this.analyticsService.getPlatformOverview(range);
  }

  @Get('charts')
  @ApiOperation({ summary: 'Get time-series chart data' })
  @ApiQuery({ name: 'range', required: false, description: 'Time range: 1h, 24h, 7d, 30d, 90d', example: '7d' })
  @ApiResponse({ status: 200, description: 'Chart data returned', type: [TimeSeriesDataDto] })
  async getCharts(
    @Query('range') range = '7d',
  ): Promise<TimeSeriesDataDto[]> {
    return this.analyticsService.getTimeSeriesCharts(range);
  }

  @Get('top-projects')
  @ApiOperation({ summary: 'Get top projects by funding' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of projects to return', example: 5 })
  @ApiResponse({ status: 200, description: 'Top projects returned', type: [TopProjectDto] })
  async getTopProjects(
    @Query('limit') limit = 5,
  ): Promise<TopProjectDto[]> {
    return this.analyticsService.getTopProjects(Number(limit));
  }

  @Get('user-activity')
  @ApiOperation({ summary: 'Get user activity over time' })
  @ApiQuery({ name: 'range', required: false, description: 'Time range: 1h, 24h, 7d, 30d, 90d', example: '7d' })
  @ApiResponse({ status: 200, description: 'User activity returned', type: [UserActivityDto] })
  async getUserActivity(
    @Query('range') range = '7d',
  ): Promise<UserActivityDto[]> {
    return this.analyticsService.getUserActivity(range);
  }

  @Post('invalidate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidate analytics caches (admin)' })
  @ApiResponse({ status: 204, description: 'Caches invalidated' })
  async invalidateCaches(): Promise<void> {
    await this.analyticsService.invalidateCaches();
  }
}
