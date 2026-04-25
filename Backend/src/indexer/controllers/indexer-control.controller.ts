import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { IndexerStateService, IndexerStatus } from '../services/indexer-state.service';
import { IndexerService } from '../services/indexer.service';

@ApiTags('indexer-control')
@Controller('indexer/control')
@UseGuards(JwtAuthGuard)
export class IndexerControlController {
  constructor(
    private readonly indexerStateService: IndexerStateService,
    private readonly indexerService: IndexerService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current indexer status and state' })
  @ApiResponse({ status: 200, description: 'Indexer status retrieved successfully' })
  async getStatus(@Request() req: any) {
    const state = await this.indexerStateService.getState();
    const stats = await this.indexerStateService.getStateStats();
    
    // Get live indexer status
    const isCurrentlyRunning = this.indexerService['isRunning'] || false;
    const isShuttingDown = this.indexerService['isShuttingDown'] || false;

    return {
      state,
      stats,
      liveStatus: {
        isRunning: isCurrentlyRunning,
        isShuttingDown: isShuttingDown,
        status: isShuttingDown ? 'stopping' : isCurrentlyRunning ? 'running' : 'stopped',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause the indexer with graceful completion' })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { 
        reason: { type: 'string', description: 'Reason for pausing' },
        waitForCompletion: { type: 'boolean', default: true, description: 'Wait for current processing to complete' }
      } 
    } 
  })
  @ApiResponse({ status: 200, description: 'Indexer paused successfully' })
  async pauseIndexer(
    @Request() req: any,
    @Body() body: { reason?: string; waitForCompletion?: boolean }
  ) {
    const { reason, waitForCompletion = true } = body;

    try {
      // If waitForCompletion is true, wait for current processing to finish
      if (waitForCompletion) {
        await this.waitForProcessingCompletion();
      }

      const state = await this.indexerStateService.pauseIndexer(reason);
      
      return {
        success: true,
        message: 'Indexer paused successfully',
        state,
        pausedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to pause indexer',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume the indexer with state validation' })
  @ApiResponse({ status: 200, description: 'Indexer resumed successfully' })
  async resumeIndexer(@Request() req: any) {
    try {
      const state = await this.indexerStateService.resumeIndexer();
      
      return {
        success: true,
        message: 'Indexer resumed successfully',
        state,
        resumedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to resume indexer',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset indexer state with backup' })
  @ApiBody({ 
    schema: { 
      type: 'object', 
      properties: { 
        startLedger: { type: 'number', description: 'Starting ledger sequence after reset' },
        reason: { type: 'string', description: 'Reason for reset' },
        confirm: { type: 'boolean', required: true, description: 'Confirmation flag for destructive operation' }
      } 
    } 
  })
  @ApiResponse({ status: 200, description: 'Indexer reset successfully' })
  async resetIndexer(
    @Request() req: any,
    @Body() body: { startLedger?: number; reason?: string; confirm: boolean }
  ) {
    const { startLedger, reason, confirm } = body;

    if (!confirm) {
      return {
        success: false,
        message: 'Reset requires confirmation flag',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Wait for any current processing to complete
      await this.waitForProcessingCompletion();

      const state = await this.indexerStateService.resetIndexer(startLedger, reason);
      
      return {
        success: true,
        message: 'Indexer reset successfully',
        state,
        resetAt: new Date().toISOString(),
        warning: 'Previous state was backed up before reset',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to reset indexer',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Get indexer health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealthStatus(@Request() req: any) {
    const state = await this.indexerStateService.getState();
    const stats = await this.indexerStateService.getStateStats();
    
    const healthStatus = {
      status: 'healthy',
      issues: [] as string[],
      recommendations: [] as string[],
    };

    if (!state) {
      healthStatus.status = 'unhealthy';
      healthStatus.issues.push('Indexer state not found');
      healthStatus.recommendations.push('Initialize indexer state');
    } else {
      // Check error rate
      const errorRate = state.processedCount > 0 
        ? state.errorCount / state.processedCount 
        : 0;

      if (errorRate > 0.1) { // More than 10% error rate
        healthStatus.status = 'degraded';
        healthStatus.issues.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
        healthStatus.recommendations.push('Check indexer logs for errors');
      }

      if (state.status === 'error') {
        healthStatus.status = 'unhealthy';
        healthStatus.issues.push('Indexer is in error state');
        healthStatus.recommendations.push('Check last error and resume if needed');
      }

      if (state.status === 'paused') {
        healthStatus.status = 'paused';
        healthStatus.issues.push('Indexer is paused');
        healthStatus.recommendations.push('Resume indexer when ready');
      }

      // Check if indexer has been running too long without progress
      if (state.status === 'running' && state.resumedAt) {
        const uptime = Date.now() - state.resumedAt.getTime();
        const hoursSinceResume = uptime / (1000 * 60 * 60);
        
        if (hoursSinceResume > 24 && state.processedCount === 0) {
          healthStatus.status = 'degraded';
          healthStatus.issues.push('Indexer running but no progress in 24+ hours');
          healthStatus.recommendations.push('Check indexer configuration and connectivity');
        }
      }
    }

    return {
      ...healthStatus,
      state,
      stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get detailed indexer statistics' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Hours to look back for stats' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Query('hours') hours: number = 24) {
    const state = await this.indexerStateService.getState();
    const stats = await this.indexerStateService.getStateStats();

    // Calculate additional statistics
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    let processingRate = 0;
    let errorRate = 0;

    if (state && state.resumedAt && state.resumedAt > cutoffTime) {
      const uptimeHours = (now.getTime() - state.resumedAt.getTime()) / (1000 * 60 * 60);
      processingRate = uptimeHours > 0 ? state.processedCount / uptimeHours : 0;
      errorRate = state.processedCount > 0 ? state.errorCount / state.processedCount : 0;
    }

    return {
      current: stats,
      performance: {
        processingRatePerHour: Math.round(processingRate * 100) / 100,
        errorRate: Math.round(errorRate * 10000) / 100, // as percentage
        uptimeHours: state?.resumedAt 
          ? Math.round((now.getTime() - state.resumedAt.getTime()) / (1000 * 60 * 60) * 100) / 100
          : 0,
      },
      timeRange: {
        hours,
        cutoffTime,
        currentTime: now,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate indexer state integrity' })
  @ApiResponse({ status: 200, description: 'State validation completed' })
  async validateState(@Request() req: any) {
    try {
      const state = await this.indexerStateService.getState();
      
      if (!state) {
        return {
          valid: false,
          issues: ['Indexer state not found'],
          recommendations: ['Initialize indexer state'],
        };
      }

      const validationResults = {
        valid: true,
        issues: [] as string[],
        warnings: [] as string[],
        recommendations: [] as string[],
      };

      // Validate ledger sequence
      if (state.lastLedgerSeq < 0) {
        validationResults.valid = false;
        validationResults.issues.push('Invalid ledger sequence (negative)');
      }

      // Validate status consistency
      const validStatuses: IndexerStatus[] = ['running', 'paused', 'stopped', 'error'];
      if (!validStatuses.includes(state.status)) {
        validationResults.valid = false;
        validationResults.issues.push(`Invalid status: ${state.status}`);
      }

      // Validate error rate
      const errorRate = state.processedCount > 0 
        ? state.errorCount / state.processedCount 
        : 0;

      if (errorRate > 0.5) {
        validationResults.warnings.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
        validationResults.recommendations.push('Investigate high error rate');
      }

      // Validate timestamps
      if (state.status === 'paused' && !state.pausedAt) {
        validationResults.issues.push('Paused state but no pause timestamp');
        validationResults.valid = false;
      }

      if (state.status === 'running' && state.pausedAt && !state.resumedAt) {
        validationResults.issues.push('Running state but has pause timestamp without resume');
        validationResults.valid = false;
      }

      return {
        ...validationResults,
        state,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Validation error: ${error.message}`],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Wait for current processing to complete
   */
  private async waitForProcessingCompletion(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (this.indexerService['isRunning'] && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.indexerService['isRunning']) {
      throw new Error(`Timeout waiting for processing completion after ${timeoutMs}ms`);
    }
  }
}
