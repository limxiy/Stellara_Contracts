import {
  Controller,
  Get,
  UseGuards,
  Res,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MetricsService } from '../metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
  ) {}

  @Get('prometheus')
  @ApiOperation({ 
    summary: 'Get Prometheus metrics',
    description: 'Returns metrics in Prometheus format for scraping'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics successfully retrieved',
    schema: {
      type: 'string',
      example: '# HELP indexer_current_ledger Current ledger processed by indexer\nindexer_current_ledger 123456'
    }
  })
  async getPrometheusMetrics(@Res() res: Response): Promise<Response> {
    try {
      // Get the prom-client registry
      const { register } = await import('prom-client');
      
      // Set content type for Prometheus
      res.set('Content-Type', register.contentType);
      
      // Return metrics
      return res.send(await register.metrics());
    } catch (error) {
      // If prom-client is not available, return a basic metrics response
      const basicMetrics = this.getBasicMetrics();
      res.set('Content-Type', 'text/plain');
      return res.send(basicMetrics);
    }
  }

  @Get('health')
  @ApiOperation({ 
    summary: 'Get metrics health status',
    description: 'Returns health status of the metrics collection system'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Health status retrieved successfully'
  })
  async getMetricsHealth() {
    try {
      const summary = this.metricsService.getPerformanceSummary();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: {
          processingRate: summary.processingRate,
          successRate: summary.successRate,
          errorRate: summary.errorRate,
          lagSeconds: summary.lagSeconds,
          memoryUsage: summary.memoryUsage,
          cpuUsage: summary.cpuUsage,
          uptime: summary.uptime,
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  @Get('summary')
  @ApiOperation({ 
    summary: 'Get indexer performance summary',
    description: 'Returns a summary of current indexer performance metrics'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance summary retrieved successfully'
  })
  async getPerformanceSummary() {
    const summary = this.metricsService.getPerformanceSummary();
    
    return {
      timestamp: new Date().toISOString(),
      performance: summary,
      recommendations: this.getRecommendations(summary),
    };
  }

  @Get('export')
  @ApiOperation({ 
    summary: 'Export metrics in various formats',
    description: 'Export metrics in JSON, CSV, or other formats'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics exported successfully'
  })
  async exportMetrics(
    @Headers('accept') accept?: string,
  ) {
    const format = accept?.includes('application/json') ? 'json' : 'csv';
    
    try {
      if (format === 'json') {
        return await this.exportJsonMetrics();
      } else {
        return await this.exportCsvMetrics();
      }
    } catch (error) {
      return {
        error: 'Failed to export metrics',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private getBasicMetrics(): string {
    // Basic metrics fallback when prom-client is not available
    const timestamp = new Date().toISOString();
    const summary = this.metricsService.getPerformanceSummary();
    
    return `
# HELP indexer_processing_rate_events_per_second Current event processing rate
# TYPE indexer_processing_rate_events_per_second gauge
indexer_processing_rate_events_per_second ${summary.processingRate}

# HELP indexer_event_success_rate Current event success rate percentage
# TYPE indexer_event_success_rate gauge
indexer_event_success_rate ${summary.successRate}

# HELP indexer_event_error_rate Current event error rate percentage
# TYPE indexer_event_error_rate gauge
indexer_event_error_rate ${summary.errorRate}

# HELP indexer_lag_duration_seconds Current indexer lag in seconds
# TYPE indexer_lag_duration_seconds gauge
indexer_lag_duration_seconds ${summary.lagSeconds}

# HELP indexer_memory_usage_bytes Current memory usage in bytes
# TYPE indexer_memory_usage_bytes gauge
indexer_memory_usage_bytes ${summary.memoryUsage}

# HELP indexer_cpu_usage_percent Current CPU usage percentage
# TYPE indexer_cpu_usage_percent gauge
indexer_cpu_usage_percent ${summary.cpuUsage}

# HELP indexer_uptime_seconds Indexer uptime in seconds
# TYPE indexer_uptime_seconds gauge
indexer_uptime_seconds ${summary.uptime}

# HELP metrics_export_timestamp Timestamp of metrics export
# TYPE metrics_export_timestamp gauge
metrics_export_timestamp ${Date.now() / 1000}
`.trim();
  }

  private getRecommendations(summary: any): string[] {
    const recommendations: string[] = [];
    
    if (summary.errorRate > 5) {
      recommendations.push('High error rate detected - check event processing logs');
    }
    
    if (summary.lagSeconds > 300) {
      recommendations.push('High indexer lag detected - consider increasing processing capacity');
    }
    
    if (summary.processingRate < 10) {
      recommendations.push('Low processing rate - check for bottlenecks');
    }
    
    if (summary.memoryUsage > 1024 * 1024 * 1024) { // 1GB
      recommendations.push('High memory usage - monitor for memory leaks');
    }
    
    if (summary.cpuUsage > 80) {
      recommendations.push('High CPU usage - consider scaling or optimization');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('All metrics are within normal ranges');
    }
    
    return recommendations;
  }

  private async exportJsonMetrics() {
    const summary = this.metricsService.getPerformanceSummary();
    
    return {
      timestamp: new Date().toISOString(),
      format: 'json',
      metrics: {
        processing: {
          rate: summary.processingRate,
          successRate: summary.successRate,
          errorRate: summary.errorRate,
        },
        lag: {
          seconds: summary.lagSeconds,
          ledgers: Math.floor(summary.lagSeconds / 5), // Assuming 5s per ledger
        },
        system: {
          memoryUsage: summary.memoryUsage,
          cpuUsage: summary.cpuUsage,
          uptime: summary.uptime,
        },
      },
    };
  }

  private async exportCsvMetrics() {
    const summary = this.metricsService.getPerformanceSummary();
    const timestamp = new Date().toISOString();
    
    const csv = `timestamp,processing_rate,success_rate,error_rate,lag_seconds,memory_usage,cpu_usage,uptime
${timestamp},${summary.processingRate},${summary.successRate},${summary.errorRate},${summary.lagSeconds},${summary.memoryUsage},${summary.cpuUsage},${summary.uptime}`;
    
    return {
      timestamp,
      format: 'csv',
      data: csv,
    };
  }
}
