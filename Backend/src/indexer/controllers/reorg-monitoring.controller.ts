import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReorgHandlerService } from '../services/reorg-handler.service';
import { LedgerTrackerService } from '../services/ledger-tracker.service';
import { IndexerService } from '../services/indexer.service';

@ApiTags('reorg-monitoring')
@Controller('indexer/reorg')
@UseGuards(JwtAuthGuard)
export class ReorgMonitoringController {
  constructor(
    private readonly reorgHandler: ReorgHandlerService,
    private readonly ledgerTracker: LedgerTrackerService,
    private readonly indexerService: IndexerService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get reorganization statistics and monitoring data' })
  @ApiResponse({ status: 200, description: 'Reorg statistics retrieved successfully' })
  async getReorgStats(@Request() req: any) {
    const stats = await this.reorgHandler.getReorgStats();
    const cursor = await this.ledgerTracker.getLastCursor();
    
    return {
      currentCursor: cursor ? {
        lastLedgerSeq: cursor.lastLedgerSeq,
        lastLedgerHash: cursor.lastLedgerHash,
        updatedAt: cursor.updatedAt,
      } : null,
      reorgStatistics: stats,
      network: process.env.STELLAR_NETWORK || 'testnet',
      indexerStatus: {
        isRunning: this.indexerService['isRunning'] || false,
        lastUpdate: new Date().toISOString(),
      },
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get indexer health and reorg status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealthStatus(@Request() req: any) {
    const cursor = await this.ledgerTracker.getLastCursor();
    const stats = await this.reorgHandler.getReorgStats();
    
    // Determine health status
    const recentReorgs = stats.recentReorgs.filter(r => 
      new Date(r.timestamp).getTime() > Date.now() - 60 * 60 * 1000 // Last hour
    );
    
    const healthStatus = {
      status: recentReorgs.length > 5 ? 'degraded' : 'healthy',
      issues: [] as string[],
    };

    if (recentReorgs.length > 5) {
      healthStatus.issues.push('High frequency of reorgs detected in the last hour');
    }

    if (stats.maxReorgDepth > 50) {
      healthStatus.issues.push('Deep reorgs detected (max depth > 50)');
      healthStatus.status = 'degraded';
    }

    if (!cursor) {
      healthStatus.issues.push('No cursor found - indexer not initialized');
      healthStatus.status = 'unhealthy';
    }

    return {
      ...healthStatus,
      cursor: cursor ? {
        lastLedgerSeq: cursor.lastLedgerSeq,
        lastLedgerHash: cursor.lastLedgerHash,
        updatedAt: cursor.updatedAt,
      } : null,
      recentReorgCount: recentReorgs.length,
      maxReorgDepth: stats.maxReorgDepth,
      avgReorgDepth: stats.avgReorgDepth,
      totalReorgs: stats.totalReorgs,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('cursor')
  @ApiOperation({ summary: 'Get current ledger cursor information' })
  @ApiResponse({ status: 200, description: 'Cursor information retrieved successfully' })
  async getCursor(@Request() req: any) {
    const cursor = await this.ledgerTracker.getLastCursor();
    
    if (!cursor) {
      return {
        cursor: null,
        message: 'No cursor found - indexer not initialized',
      };
    }

    return {
      cursor: {
        id: cursor.id,
        network: cursor.network,
        lastLedgerSeq: cursor.lastLedgerSeq,
        lastLedgerHash: cursor.lastLedgerHash,
        updatedAt: cursor.updatedAt,
        createdAt: cursor.createdAt,
      },
    };
  }

  @Post('force-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force a reorg check (admin only)' })
  @ApiResponse({ status: 200, description: 'Reorg check completed' })
  async forceReorgCheck(@Request() req: any) {
    try {
      // This would trigger a manual reorg check
      // In a real implementation, you'd fetch the latest ledger and run detection
      const latestLedger = await this.indexerService['getLatestLedger']();
      const ledgerInfo = await this.indexerService['getLedgerInfo'](latestLedger);
      
      const reorgResult = await this.reorgHandler['detectAndHandleReorg'](ledgerInfo);
      
      return {
        message: 'Reorg check completed',
        latestLedger,
        reorgResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        message: 'Reorg check failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('events')
  @ApiOperation({ summary: 'Get recent reorg events' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of events to return' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Hours to look back' })
  @ApiResponse({ status: 200, description: 'Reorg events retrieved successfully' })
  async getReorgEvents(
    @Query('limit') limit: number = 50,
    @Query('hours') hours: number = 24,
  ) {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // This would query the indexer logs for reorg events
    // For now, return a placeholder
    return {
      events: [], // Would be populated from actual logs
      limit,
      hours,
      cutoffTime,
      message: 'Reorg events query - implement with actual log storage',
    };
  }

  @Get('depth-distribution')
  @ApiOperation({ summary: 'Get reorg depth distribution statistics' })
  @ApiResponse({ status: 200, description: 'Depth distribution retrieved successfully' })
  async getReorgDepthDistribution(@Request() req: any) {
    const stats = await this.reorgHandler.getReorgStats();
    
    // Calculate depth distribution
    const depthRanges = {
      '1-5': 0,
      '6-10': 0,
      '11-20': 0,
      '21-50': 0,
      '51+': 0,
    };

    stats.recentReorgs.forEach(reorg => {
      const depth = reorg.depth;
      if (depth <= 5) depthRanges['1-5']++;
      else if (depth <= 10) depthRanges['6-10']++;
      else if (depth <= 20) depthRanges['11-20']++;
      else if (depth <= 50) depthRanges['21-50']++;
      else depthRanges['51+']++;
    });

    return {
      depthDistribution: depthRanges,
      totalReorgs: stats.totalReorgs,
      avgDepth: stats.avgReorgDepth,
      maxDepth: stats.maxReorgDepth,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('network-status')
  @ApiOperation({ summary: 'Get network status and reorg risk assessment' })
  @ApiResponse({ status: 200, description: 'Network status retrieved successfully' })
  async getNetworkStatus(@Request() req: any) {
    const cursor = await this.ledgerTracker.getLastCursor();
    const stats = await this.reorgHandler.getReorgStats();
    
    // Assess network stability
    const recentReorgs = stats.recentReorgs.filter(r => 
      new Date(r.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const riskLevel = this.calculateReorgRisk(recentReorgs, stats);
    
    return {
      network: process.env.STELLAR_NETWORK || 'testnet',
      currentLedger: cursor?.lastLedgerSeq || 0,
      lastLedgerHash: cursor?.lastLedgerHash || '',
      reorgRisk: {
        level: riskLevel,
        factors: this.getRiskFactors(recentReorgs, stats),
      },
      recentActivity: {
        reorgs24h: recentReorgs.length,
        maxDepth24h: recentReorgs.length > 0 ? Math.max(...recentReorgs.map(r => r.depth)) : 0,
        avgDepth24h: recentReorgs.length > 0 
          ? recentReorgs.reduce((sum, r) => sum + r.depth, 0) / recentReorgs.length 
          : 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private calculateReorgRisk(recentReorgs: any[], stats: any): 'low' | 'medium' | 'high' {
    const reorgCount24h = recentReorgs.length;
    const maxDepth = stats.maxReorgDepth;
    
    if (reorgCount24h === 0) return 'low';
    if (reorgCount24h <= 2 && maxDepth <= 10) return 'low';
    if (reorgCount24h <= 5 && maxDepth <= 25) return 'medium';
    return 'high';
  }

  private getRiskFactors(recentReorgs: any[], stats: any): string[] {
    const factors = [];
    
    if (recentReorgs.length > 3) {
      factors.push('High frequency of reorgs in last 24 hours');
    }
    
    if (stats.maxReorgDepth > 50) {
      factors.push('Deep reorgs detected (>50 ledgers)');
    }
    
    if (stats.avgReorgDepth > 20) {
      factors.push('High average reorg depth');
    }
    
    if (recentReorgs.some(r => r.depth > 100)) {
      factors.push('Very deep reorg detected (>100 ledgers)');
    }
    
    return factors;
  }
}
