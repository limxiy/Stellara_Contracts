import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimeRangeDto {
  @ApiPropertyOptional({ description: 'Start date ISO string', example: '2024-01-01T00:00:00Z' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string', example: '2024-12-31T23:59:59Z' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Preset range: 1h, 24h, 7d, 30d, 90d', example: '24h' })
  range?: string;
}

export class DashboardMetricsDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  newUsersToday: number;

  @ApiProperty()
  totalProjects: number;

  @ApiProperty()
  activeProjects: number;

  @ApiProperty()
  totalContributions: number;

  @ApiProperty()
  contributionsToday: number;

  @ApiProperty()
  totalVolume: string;

  @ApiProperty()
  volumeToday: string;

  @ApiProperty()
  totalClaims: number;

  @ApiProperty()
  pendingClaims: number;

  @ApiProperty()
  indexerLag: number;

  @ApiProperty()
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty()
  timestamp: string;
}

export class TimeSeriesPointDto {
  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  value: number;
}

export class TimeSeriesDataDto {
  @ApiProperty()
  metric: string;

  @ApiProperty({ type: [TimeSeriesPointDto] })
  data: TimeSeriesPointDto[];
}

export class UserActivityDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  logins: number;

  @ApiProperty()
  newUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  contributions: number;
}

export class TopProjectDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  contributions: number;

  @ApiProperty()
  totalRaised: string;

  @ApiProperty()
  contributorCount: number;
}

export class PlatformOverviewDto {
  @ApiProperty()
  metrics: DashboardMetricsDto;

  @ApiProperty({ type: [TimeSeriesDataDto] })
  charts: TimeSeriesDataDto[];

  @ApiProperty({ type: [TopProjectDto] })
  topProjects: TopProjectDto[];

  @ApiProperty({ type: [UserActivityDto] })
  userActivity: UserActivityDto[];
}

export class RealtimeEventDto {
  @ApiProperty()
  event: string;

  @ApiProperty()
  data: unknown;

  @ApiProperty()
  timestamp: string;
}

export class AnalyticsCacheStatsDto {
  @ApiProperty()
  hits: number;

  @ApiProperty()
  misses: number;

  @ApiProperty()
  hitRate: number;
}
