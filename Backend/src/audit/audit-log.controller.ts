import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  ParseEnumPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import {
  AuditLogQueryDto,
  AuditLogStatsDto,
  AuditLogRetentionPolicyDto,
  CreateAuditLogDto,
} from './dto/audit-log.dto';
import { SecurityEventType, SecurityEventSeverity } from './enums/security-event-type.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth('bearer')
@Controller('audit')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Post('log')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a security audit log entry' })
  @ApiResponse({ status: 201, description: 'Audit log created' })
  async createLog(@Body() dto: CreateAuditLogDto): Promise<void> {
    return this.auditLogService.log(dto);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Query audit logs with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs returned' })
  async queryLogs(@Query() dto: AuditLogQueryDto) {
    return this.auditLogService.query(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit log statistics' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Statistics returned', type: AuditLogStatsDto })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AuditLogStatsDto> {
    return this.auditLogService.getStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('retention-policy')
  @ApiOperation({ summary: 'Get current retention policy' })
  @ApiResponse({ status: 200, description: 'Retention policy returned', type: AuditLogRetentionPolicyDto })
  getRetentionPolicy(): AuditLogRetentionPolicyDto {
    return this.auditLogService.getRetentionPolicy();
  }

  @Post('retention-policy')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update retention policy (admin)' })
  @ApiResponse({ status: 204, description: 'Retention policy updated' })
  updateRetentionPolicy(@Body() policy: Partial<AuditLogRetentionPolicyDto>): void {
    this.auditLogService.updateRetentionPolicy(policy);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs (admin)' })
  @ApiQuery({ name: 'format', enum: ['json', 'csv'], example: 'json' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Exported logs returned' })
  async exportLogs(
    @Query('format') format: 'json' | 'csv' = 'json',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<string> {
    return this.auditLogService.exportLogs(
      format,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Trigger manual audit log cleanup (admin)' })
  @ApiResponse({ status: 204, description: 'Cleanup triggered' })
  async triggerCleanup(): Promise<void> {
    await this.auditLogService.cleanupOldLogs();
  }
}
