import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EventReplayService } from '../services/event-replay.service';
import {
  CreateReplayRequest,
  ReplayOptions,
  ReplayFilter,
  StartReplayRequest,
  StartReplayResponse,
  GetReplayResponse,
  CancelReplayResponse,
  ReplayListResponse,
} from '../types/event-replay.types';

@ApiTags('event-replay')
@Controller('indexer/replay')
@UseGuards(JwtAuthGuard)
export class EventReplayController {
  constructor(
    private readonly eventReplayService: EventReplayService,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Start a new event replay operation' })
  @ApiResponse({ status: 202, description: 'Replay started successfully' })
  async startReplay(
    @Request() req: any,
    @Body() request: StartReplayRequest,
  ): Promise<StartReplayResponse> {
    try {
      const replay = await this.eventReplayService.startReplay(request, request.options);
      
      return {
        replayId: replay.id,
        status: replay.status,
        estimatedDuration: 0, // Would be calculated from validation
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
          estimatedEventCount: 0,
          estimatedDuration: 0,
          conflicts: [],
        },
      };
    } catch (error) {
      throw new Error(`Failed to start replay: ${error.message}`);
    }
  }

  @Get(':replayId')
  @ApiOperation({ summary: 'Get replay details and status' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 200, description: 'Replay details retrieved successfully' })
  async getReplay(
    @Param('replayId') replayId: string,
    @Query('includeEvents') includeEvents?: boolean,
    @Query('includeLogs') includeLogs?: boolean,
  ): Promise<GetReplayResponse> {
    try {
      const replay = await this.eventReplayService.getReplay(replayId);
      
      if (!replay) {
        throw new Error('Replay not found');
      }

      const progress = await this.eventReplayService.getReplayProgress(replayId);

      return {
        replay,
        progress: progress!,
        events: includeEvents ? [] : undefined, // Would be populated if requested
        logs: includeLogs ? [] : undefined, // Would be populated if requested
      };
    } catch (error) {
      throw new Error(`Failed to get replay: ${error.message}`);
    }
  }

  @Get(':replayId/progress')
  @ApiOperation({ summary: 'Get replay progress' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 200, description: 'Progress retrieved successfully' })
  async getReplayProgress(@Param('replayId') replayId: string) {
    try {
      const progress = await this.eventReplayService.getReplayProgress(replayId);
      
      if (!progress) {
        throw new Error('Replay not found');
      }

      return {
        success: true,
        progress,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get progress',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Put(':replayId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a running replay' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 200, description: 'Replay cancelled successfully' })
  async cancelReplay(@Param('replayId') replayId: string): Promise<CancelReplayResponse> {
    try {
      await this.eventReplayService.cancelReplay(replayId);
      
      return {
        replayId,
        status: 'cancelled',
        message: 'Replay cancelled successfully',
      };
    } catch (error) {
      throw new Error(`Failed to cancel replay: ${error.message}`);
    }
  }

  @Get(':replayId/result')
  @ApiOperation({ summary: 'Get replay results and summary' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 200, description: 'Results retrieved successfully' })
  async getReplayResult(@Param('replayId') replayId: string) {
    try {
      const result = await this.eventReplayService.getReplayResult(replayId);
      
      if (!result) {
        throw new Error('Replay not found');
      }

      return {
        success: true,
        result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get replay result',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('list')
  @ApiOperation({ summary: 'List replays with filtering' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiQuery({ name: 'dryRun', required: false, type: Boolean, description: 'Filter by dry-run status' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Filter to date (ISO string)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit results' })
  @ApiResponse({ status: 200, description: 'Replays retrieved successfully' })
  async listReplays(@Query() filter: ReplayFilter & { limit?: number }) {
    try {
      const replays = await this.eventReplayService.listReplays(filter);
      
      const limitedReplays = filter.limit ? replays.slice(0, filter.limit) : replays;

      return {
        success: true,
        replays: limitedReplays,
        totalCount: replays.length,
        filter,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to list replays',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get replay statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getReplayStatistics() {
    try {
      const stats = await this.eventReplayService.getReplayStatistics();
      
      return {
        success: true,
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get statistics',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post(':replayId/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry failed events in a replay' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 202, description: 'Retry started successfully' })
  async retryFailedEvents(
    @Param('replayId') replayId: string,
    @Body() body: { eventIds?: string[]; conflictResolution?: 'skip' | 'overwrite' | 'merge' }
  ) {
    try {
      // This would implement retry logic
      // For now, return a placeholder response
      
      return {
        success: true,
        message: 'Retry functionality not yet implemented',
        replayId,
        eventIds: body.eventIds,
        conflictResolution: body.conflictResolution,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retry events',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get(':replayId/events')
  @ApiOperation({ summary: 'Get events processed in a replay' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by event status' })
  @ApiQuery({ name: 'ledgerFrom', required: false, type: Number, description: 'Filter by ledger range (from)' })
  @ApiQuery({ name: 'ledgerTo', required: false, type: Number, description: 'Filter by ledger range (to)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit results' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Offset for pagination' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  async getReplayEvents(
    @Param('replayId') replayId: string,
    @Query() filters: {
      status?: string;
      ledgerFrom?: number;
      ledgerTo?: number;
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      // This would fetch replay events with filtering
      // For now, return a placeholder response
      
      return {
        success: true,
        message: 'Event retrieval functionality not yet implemented',
        replayId,
        filters,
        events: [],
        totalCount: 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get replay events',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a replay request before starting' })
  @ApiResponse({ status: 200, description: 'Validation completed' })
  async validateReplayRequest(@Body() request: CreateReplayRequest) {
    try {
      // This would implement validation logic
      // For now, return a placeholder validation
      
      const estimatedEventCount = Math.abs(request.endLedgerSeq - request.startLedgerSeq) * 2.5;
      const estimatedDuration = estimatedEventCount * 0.1; // seconds

      return {
        success: true,
        validation: {
          isValid: true,
          errors: [],
          warnings: [],
          estimatedEventCount: Math.floor(estimatedEventCount),
          estimatedDuration: Math.floor(estimatedDuration),
          conflicts: [],
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Validation failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active replays' })
  @ApiResponse({ status: 200, description: 'Active replays retrieved successfully' })
  async getActiveReplays() {
    try {
      const activeReplays = await this.eventReplayService.listReplays({ status: 'running' });
      
      return {
        success: true,
        activeReplays,
        count: activeReplays.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to get active replays',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Delete(':replayId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a replay and its events' })
  @ApiParam({ name: 'replayId', description: 'Replay ID' })
  @ApiResponse({ status: 200, description: 'Replay deleted successfully' })
  async deleteReplay(@Param('replayId') replayId: string) {
    try {
      // This would implement deletion logic
      // For now, return a placeholder response
      
      return {
        success: true,
        message: 'Delete functionality not yet implemented',
        replayId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete replay',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
