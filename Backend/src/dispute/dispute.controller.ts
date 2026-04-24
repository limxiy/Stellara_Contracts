import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Param, 
  Body, 
  Query, 
  UseGuards, 
  NotFoundException,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DisputeService } from './dispute.service';
import { PrismaService } from '../prisma.service';
import { 
  DisputeType, 
  DisputeStatus, 
  DisputePriority, 
  ResolutionType 
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Dispute Management')
@Controller('disputes')
export class DisputeController {
  constructor(
    private readonly disputeService: DisputeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a new reputation dispute' })
  @ApiResponse({ status: 201, description: 'Dispute submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid dispute data' })
  @ApiResponse({ status: 404, description: 'User or activity not found' })
  async submitDispute(
    @Request() req: any,
    @Body() body: {
      disputeType: DisputeType;
      reason: string;
      description: string;
      evidence?: any;
      disputedActivityId?: string;
      requestedScore?: number;
    },
  ) {
    const userId = req.user.id;
    
    return this.disputeService.submitDispute(
      userId,
      body.disputeType,
      body.reason,
      body.description,
      body.evidence,
      body.disputedActivityId,
      body.requestedScore,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dispute details' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute details returned' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async getDispute(@Param('id') id: string, @Request() req: any) {
    const dispute = await this.disputeService.getDispute(id);
    
    // Check if user is the dispute owner or a moderator
    if (dispute.userId !== req.user.id && !req.user.roles?.includes('moderator')) {
      throw new BadRequestException('Access denied');
    }
    
    return dispute;
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user dispute history' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User dispute history returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserDisputes(
    @Param('userId') userId: string,
    @Query('status') status?: DisputeStatus,
    @Request() req: any,
  ) {
    // Users can only see their own disputes unless they're moderators
    if (userId !== req.user.id && !req.user.roles?.includes('moderator')) {
      throw new BadRequestException('Access denied');
    }
    
    return this.disputeService.getUserDisputes(userId, status);
  }

  @Get('pending/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending disputes for moderator review' })
  @ApiResponse({ status: 200, description: 'Pending disputes returned' })
  async getPendingDisputes(@Request() req: any) {
    const moderatorId = req.user.roles?.includes('moderator') ? req.user.id : undefined;
    return this.disputeService.getPendingDisputes(moderatorId);
  }

  @Put(':id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign moderator to dispute' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Moderator assigned successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async assignModerator(
    @Param('id') id: string,
    @Body() body: { moderatorId: string },
  ) {
    return this.disputeService.assignModerator(id, body.moderatorId);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add comment to dispute' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async addComment(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: {
      content: string;
      isInternal?: boolean;
    },
  ) {
    const dispute = await this.disputeService.getDispute(id);
    
    // Check if user is the dispute owner, assigned moderator, or admin
    const isOwner = dispute.userId === req.user.id;
    const isModerator = dispute.moderatorId === req.user.id;
    const isAdmin = req.user.roles?.includes('admin');
    
    if (!isOwner && !isModerator && !isAdmin) {
      throw new BadRequestException('Access denied');
    }
    
    // Only moderators and admins can add internal comments
    const isInternal = body.isInternal && (isModerator || isAdmin);
    
    return this.disputeService.addComment(id, req.user.id, body.content, isInternal);
  }

  @Put(':id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve dispute' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute resolved successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 400, description: 'Dispute already resolved' })
  async resolveDispute(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: {
      resolutionType: ResolutionType;
      explanation: string;
      finalScore?: number;
      evidence?: any;
    },
  ) {
    return this.disputeService.resolveDispute(
      id,
      req.user.id,
      body.resolutionType,
      body.explanation,
      body.finalScore,
      body.evidence,
    );
  }

  @Post(':id/appeal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Appeal dispute resolution' })
  @ApiParam({ name: 'id', description: 'Dispute ID' })
  @ApiResponse({ status: 200, description: 'Dispute appealed successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 400, description: 'Appeal not allowed' })
  async appealDispute(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { reason: string },
  ) {
    return this.disputeService.appealDispute(id, req.user.id, body.reason);
  }

  @Get('metrics/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get dispute resolution metrics' })
  @ApiResponse({ status: 200, description: 'Dispute metrics returned' })
  async getDisputeMetrics(
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ) {
    return this.disputeService.getDisputeMetrics(period);
  }

  @Get('types/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available dispute types' })
  @ApiResponse({ status: 200, description: 'Dispute types returned' })
  async getDisputeTypes() {
    return {
      disputeTypes: Object.values(DisputeType),
      descriptions: {
        SCORE_CALCULATION_ERROR: 'Error in how the reputation score was calculated',
        UNFAIR_ACTIVITY_RECORDING: 'Activity was recorded unfairly or incorrectly',
        MISSING_ACTIVITY: 'Expected activity was not recorded in the system',
        DUPLICATE_ACTIVITY: 'Same activity was recorded multiple times',
        DECAY_DISAGREEMENT: 'Disagreement with reputation decay application',
        TECHNICAL_GLITCH: 'System technical issue affecting reputation',
        OTHER: 'Other reputation-related issues',
      },
    };
  }

  @Get('statuses/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available dispute statuses' })
  @ApiResponse({ status: 200, description: 'Dispute statuses returned' })
  async getDisputeStatuses() {
    return {
      statuses: Object.values(DisputeStatus),
      descriptions: {
        PENDING: 'Dispute submitted and awaiting moderator assignment',
        UNDER_REVIEW: 'Dispute is being reviewed by a moderator',
        AWAITING_EVIDENCE: 'Waiting for additional evidence from user',
        RESOLVED: 'Dispute has been resolved',
        REJECTED: 'Dispute was rejected as invalid',
        APPEALED: 'User has appealed the resolution',
        CLOSED: 'Dispute is closed and no longer active',
      },
    };
  }

  @Get('priorities/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available dispute priorities' })
  @ApiResponse({ status: 200, description: 'Dispute priorities returned' })
  async getDisputePriorities() {
    return {
      priorities: Object.values(DisputePriority),
      descriptions: {
        LOW: 'Minor score adjustments or clarification requests',
        MEDIUM: 'Moderate score differences or standard disputes',
        HIGH: 'Significant score differences or calculation errors',
        URGENT: 'Critical issues requiring immediate attention',
      },
    };
  }

  @Get('resolutions/types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available resolution types' })
  @ApiResponse({ status: 200, description: 'Resolution types returned' })
  async getResolutionTypes() {
    return {
      resolutionTypes: Object.values(ResolutionType),
      descriptions: {
        SCORE_ADJUSTMENT: 'Adjust the reputation score up or down',
        ACTIVITY_CORRECTION: 'Correct or modify the recorded activity',
        DECAY_REVERSAL: 'Reverse applied reputation decay',
        FULL_REVERSAL: 'Complete reversal of reputation changes',
        MANUAL_OVERRIDE: 'Manual override of system calculation',
        AUTOMATED_CORRECTION: 'System automatically corrected the issue',
        REJECTED: 'Dispute rejected as invalid',
      },
    };
  }
}
