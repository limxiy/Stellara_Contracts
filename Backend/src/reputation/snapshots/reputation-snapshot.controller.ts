import { 
  Controller, 
  Get, 
  Post, 
  Query, 
  Param, 
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { ReputationSnapshotService } from './reputation-snapshot.service';
import { SnapshotComparisonService } from './services/snapshot-comparison.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SnapshotPeriod, TrendType, TrendPeriod, ComparisonType } from '@prisma/client';

@ApiTags('Reputation Snapshots')
@Controller('reputation/snapshots')
export class ReputationSnapshotController {
  constructor(
    private readonly snapshotService: ReputationSnapshotService,
    private readonly comparisonService: SnapshotComparisonService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation snapshots' })
  @ApiResponse({ status: 200, description: 'Snapshots returned successfully' })
  @ApiQuery({ name: 'period', required: false, enum: SnapshotPeriod })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSnapshots(
    @Query('period') period?: SnapshotPeriod,
    @Query('limit') limit?: number,
  ) {
    return this.snapshotService.getSnapshots(period, limit);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific snapshot details' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Snapshot details returned' })
  @ApiResponse({ status: 404, description: 'Snapshot not found' })
  async getSnapshot(@Param('id') id: string) {
    return this.snapshotService.getSnapshotById(id);
  }

  @Get(':id/users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get users in a snapshot' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Snapshot users returned' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['reputationScore', 'rank', 'percentile'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'minScore', required: false, type: Number })
  @ApiQuery({ name: 'maxScore', required: false, type: Number })
  async getSnapshotUsers(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: 'reputationScore' | 'rank' | 'percentile',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('minScore') minScore?: number,
    @Query('maxScore') maxScore?: number,
  ) {
    return this.snapshotService.getSnapshotUsers(id, {
      page,
      limit,
      sortBy,
      sortOrder,
      minScore,
      maxScore,
    });
  }

  @Get(':id/user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific user in snapshot' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User snapshot data returned' })
  async getSnapshotUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.snapshotService.getSnapshotUser(id, userId);
  }

  @Post(':id/compare/:compareId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compare two snapshots' })
  @ApiParam({ name: 'id', description: 'First snapshot ID' })
  @ApiParam({ name: 'compareId', description: 'Second snapshot ID' })
  @ApiResponse({ status: 201, description: 'Comparison created successfully' })
  async compareSnapshots(
    @Param('id') id: string,
    @Param('compareId') compareId: string,
    @Query('type') type: ComparisonType = ComparisonType.CUSTOM,
  ) {
    return this.comparisonService.compareSnapshots(id, compareId, type);
  }

  @Get('comparisons/:comparisonId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get specific comparison' })
  @ApiParam({ name: 'comparisonId', description: 'Comparison ID' })
  @ApiResponse({ status: 200, description: 'Comparison details returned' })
  async getComparison(@Param('comparisonId') comparisonId: string) {
    return this.comparisonService.getComparison(comparisonId);
  }

  @Get(':id/comparisons')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comparisons for a snapshot' })
  @ApiParam({ name: 'id', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Snapshot comparisons returned' })
  async getSnapshotComparisons(@Param('id') id: string) {
    return this.comparisonService.getSnapshotComparisons(id);
  }

  @Get('users/:userId/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user snapshot history' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User snapshot history returned' })
  @ApiQuery({ name: 'period', required: false, enum: SnapshotPeriod })
  async getUserSnapshotHistory(
    @Param('userId') userId: string,
    @Query('period') period?: SnapshotPeriod,
  ) {
    return this.snapshotService.getUserSnapshotHistory(userId, period);
  }

  @Get('users/:userId/trends')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user reputation trends' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User trends returned' })
  @ApiQuery({ name: 'trendType', required: false, enum: TrendType })
  @ApiQuery({ name: 'period', required: false, enum: TrendPeriod })
  async getUserTrends(
    @Param('userId') userId: string,
    @Query('trendType') trendType?: TrendType,
    @Query('period') period?: TrendPeriod,
  ) {
    return this.snapshotService.getUserTrends(userId, trendType, period);
  }

  @Get('analytics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation analytics overview' })
  @ApiResponse({ status: 200, description: 'Analytics overview returned' })
  @ApiQuery({ name: 'period', required: false, enum: SnapshotPeriod })
  async getAnalyticsOverview(@Query('period') period?: SnapshotPeriod) {
    return this.snapshotService.getAnalyticsOverview(period);
  }

  @Get('analytics/distribution')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation score distribution' })
  @ApiResponse({ status: 200, description: 'Score distribution returned' })
  @ApiQuery({ name: 'snapshotId', required: false, description: 'Specific snapshot ID (uses latest if not provided)' })
  async getScoreDistribution(@Query('snapshotId') snapshotId?: string) {
    return this.snapshotService.getScoreDistribution(snapshotId);
  }

  @Get('analytics/levels')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation level distribution' })
  @ApiResponse({ status: 200, description: 'Level distribution returned' })
  @ApiQuery({ name: 'snapshotId', required: false, description: 'Specific snapshot ID (uses latest if not provided)' })
  async getLevelDistribution(@Query('snapshotId') snapshotId?: string) {
    return this.snapshotService.getLevelDistribution(snapshotId);
  }

  @Get('analytics/growth')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get platform growth metrics' })
  @ApiResponse({ status: 200, description: 'Growth metrics returned' })
  @ApiQuery({ name: 'period', required: false, enum: SnapshotPeriod })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getGrowthMetrics(
    @Query('period') period?: SnapshotPeriod,
    @Query('limit') limit?: number,
  ) {
    return this.snapshotService.getGrowthMetrics(period, limit);
  }

  @Get('analytics/leaderboard')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get historical leaderboard' })
  @ApiResponse({ status: 200, description: 'Historical leaderboard returned' })
  @ApiQuery({ name: 'snapshotId', required: false, description: 'Specific snapshot ID (uses latest if not provided)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistoricalLeaderboard(
    @Query('snapshotId') snapshotId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.snapshotService.getHistoricalLeaderboard(snapshotId, limit);
  }

  @Get('analytics/movers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get biggest movers and shakers' })
  @ApiResponse({ status: 200, description: 'Movers and shakers returned' })
  @ApiQuery({ name: 'snapshotId1', required: true, description: 'First snapshot ID' })
  @ApiQuery({ name: 'snapshotId2', required: true, description: 'Second snapshot ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMoversAndShakers(
    @Query('snapshotId1') snapshotId1: string,
    @Query('snapshotId2') snapshotId2: string,
    @Query('limit') limit?: number,
  ) {
    return this.snapshotService.getMoversAndShakers(snapshotId1, snapshotId2, limit);
  }

  @Get('analytics/predictions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation predictions' })
  @ApiResponse({ status: 200, description: 'Predictions returned' })
  @ApiQuery({ name: 'userId', required: false, description: 'Specific user ID (optional)' })
  @ApiQuery({ name: 'period', required: false, enum: TrendPeriod })
  async getPredictions(
    @Query('userId') userId?: string,
    @Query('period') period?: TrendPeriod,
  ) {
    return this.snapshotService.getPredictions(userId, period);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create manual snapshot' })
  @ApiResponse({ status: 201, description: 'Snapshot created successfully' })
  @ApiQuery({ name: 'period', required: true, enum: SnapshotPeriod })
  @ApiQuery({ name: 'date', required: false, description: 'Custom date (ISO string)' })
  async createManualSnapshot(
    @Query('period') period: SnapshotPeriod,
    @Query('date') date?: string,
  ) {
    const customDate = date ? new Date(date) : undefined;
    return this.snapshotService.createSnapshot(period, customDate);
  }

  @Post('comparisons/auto')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create automatic period-over-period comparisons' })
  @ApiResponse({ status: 201, description: 'Automatic comparisons created' })
  async createAutomaticComparisons() {
    return this.comparisonService.createPeriodOverPeriodComparisons();
  }

  @Get('export/:snapshotId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export snapshot data' })
  @ApiParam({ name: 'snapshotId', description: 'Snapshot ID' })
  @ApiResponse({ status: 200, description: 'Export data returned' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  @ApiQuery({ name: 'includeUsers', required: false, type: Boolean })
  async exportSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Query('includeUsers') includeUsers: boolean = false,
  ) {
    return this.snapshotService.exportSnapshot(snapshotId, format, includeUsers);
  }

  @Get('dashboard/summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard summary data' })
  @ApiResponse({ status: 200, description: 'Dashboard summary returned' })
  async getDashboardSummary() {
    return this.snapshotService.getDashboardSummary();
  }

  @Get('dashboard/trends')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard trend data' })
  @ApiResponse({ status: 200, description: 'Dashboard trends returned' })
  @ApiQuery({ name: 'period', required: false, enum: TrendPeriod })
  async getDashboardTrends(@Query('period') period?: TrendPeriod) {
    return this.snapshotService.getDashboardTrends(period);
  }

  @Get('dashboard/comparisons')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dashboard comparison data' })
  @ApiResponse({ status: 200, description: 'Dashboard comparisons returned' })
  async getDashboardComparisons() {
    return this.snapshotService.getDashboardComparisons();
  }
}
