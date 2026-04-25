import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SecurityEventType, SecurityEventSeverity } from '../enums/security-event-type.enum';

export class CreateAuditLogDto {
  @ApiProperty({ enum: SecurityEventType, example: 'LOGIN_SUCCESS' })
  eventType: SecurityEventType;

  @ApiPropertyOptional({ description: 'User ID who triggered the event' })
  userId?: string;

  @ApiPropertyOptional({ description: 'Target entity ID (e.g., affected user, resource)' })
  targetId?: string;

  @ApiPropertyOptional({ description: 'Human-readable description' })
  description?: string;

  @ApiPropertyOptional({ description: 'IP address of the actor' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User agent string' })
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Additional metadata as JSON' })
  metadata?: Record<string, unknown>;
}

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SecurityEventType })
  eventType: SecurityEventType;

  @ApiProperty({ enum: SecurityEventSeverity })
  severity: SecurityEventSeverity;

  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  targetId?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiPropertyOptional()
  userAgent?: string;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty()
  createdAt: string;
}

export class AuditLogQueryDto {
  @ApiPropertyOptional({ enum: SecurityEventType, description: 'Filter by event type' })
  eventType?: SecurityEventType;

  @ApiPropertyOptional({ enum: SecurityEventSeverity, description: 'Filter by severity' })
  severity?: SecurityEventSeverity;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by target ID' })
  targetId?: string;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date ISO string' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Search in description', example: 'login' })
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 20 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort field', example: 'createdAt' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', example: 'desc' })
  sortOrder?: 'asc' | 'desc';
}

export class AuditLogStatsDto {
  @ApiProperty()
  totalEvents: number;

  @ApiProperty()
  eventsBySeverity: Record<string, number>;

  @ApiProperty()
  eventsByType: Record<string, number>;

  @ApiProperty()
  topUsers: Array<{ userId: string; count: number }>;

  @ApiProperty()
  periodStart: string;

  @ApiProperty()
  periodEnd: string;
}

export class AuditLogRetentionPolicyDto {
  @ApiProperty({ description: 'Retention period in days' })
  retentionDays: number;

  @ApiProperty({ description: 'Critical event retention in days' })
  criticalRetentionDays: number;

  @ApiProperty({ description: 'Last cleanup timestamp' })
  lastCleanupAt?: string;

  @ApiProperty({ description: 'Records deleted in last cleanup' })
  lastCleanupCount?: number;
}
