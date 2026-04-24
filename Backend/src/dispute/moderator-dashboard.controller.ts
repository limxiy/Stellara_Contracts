import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ModeratorDashboardService } from './services/moderator-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DisputeStatus, DisputePriority, DisputeType } from '@prisma/client';

@ApiTags('Moderator Dashboard')
@Controller('moderator/dashboard')
export class ModeratorDashboardController {
  constructor(
    private readonly moderatorDashboardService: ModeratorDashboardService,
  ) {}

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get moderator dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard overview returned' })
  async getOverview(@Request() req: any) {
    return this.moderatorDashboardService.getDashboardOverview(req.user.id);
  }

  @Get('assigned')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get disputes assigned to moderator' })
  @ApiResponse({ status: 200, description: 'Assigned disputes returned' })
  @ApiQuery({ name: 'status', required: false, enum: DisputeStatus, isArray: true })
  @ApiQuery({ name: 'priority', required: false, enum: DisputePriority, isArray: true })
  @ApiQuery({ name: 'disputeType', required: false, enum: DisputeType, isArray: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['submittedAt', 'priority', 'status'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  async getAssignedDisputes(
    @Request() req: any,
    @Query('status') status?: DisputeStatus[],
    @Query('priority') priority?: DisputePriority[],
    @Query('disputeType') disputeType?: DisputeType[],
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: 'submittedAt' | 'priority' | 'status',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.moderatorDashboardService.getAssignedDisputes(req.user.id, {
      status,
      priority,
      disputeType,
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }

  @Get('available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available disputes for assignment' })
  @ApiResponse({ status: 200, description: 'Available disputes returned' })
  @ApiQuery({ name: 'priority', required: false, enum: DisputePriority, isArray: true })
  @ApiQuery({ name: 'disputeType', required: false, enum: DisputeType, isArray: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAvailableDisputes(
    @Query('priority') priority?: DisputePriority[],
    @Query('disputeType') disputeType?: DisputeType[],
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.moderatorDashboardService.getAvailableDisputes({
      priority,
      disputeType,
      page,
      limit,
    });
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get moderator performance metrics' })
  @ApiResponse({ status: 200, description: 'Moderator metrics returned' })
  @ApiQuery({ name: 'period', required: false, enum: ['daily', 'weekly', 'monthly'] })
  async getMetrics(
    @Request() req: any,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ) {
    return this.moderatorDashboardService.getModeratorMetrics(req.user.id, period);
  }

  @Get('queue-statistics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dispute queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue statistics returned' })
  async getQueueStatistics() {
    return this.moderatorDashboardService.getQueueStatistics();
  }
}
