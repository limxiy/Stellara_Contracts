# Indexer Monitoring System

This document describes the comprehensive metrics collection system for monitoring indexer performance, including processing speed, lag, and error rates.

## Overview

The indexer monitoring system provides real-time visibility into indexer performance through:

- **Comprehensive Metrics**: Detailed performance metrics collection
- **Prometheus Export**: Standardized metrics export for monitoring
- **Grafana Dashboards**: Visual monitoring dashboards
- **Health Monitoring**: System health and performance alerts
- **Performance Analytics**: Historical performance analysis

## Metrics Categories

### 1. Processing Performance Metrics

#### Batch Processing Duration
- **Metric**: `indexer_batch_processing_duration_seconds`
- **Type**: Histogram
- **Description**: Time taken to process batches of ledgers
- **Labels**: None
- **Use Case**: Monitor batch processing efficiency

#### Ledger Processing Duration
- **Metric**: `indexer_ledger_processing_duration_seconds`
- **Type**: Histogram
- **Description**: Time taken to process individual ledgers
- **Labels**: `range` (ledger range identifier)
- **Use Case**: Identify processing bottlenecks

#### Event Processing Duration
- **Metric**: `indexer_event_processing_duration_seconds`
- **Type**: Histogram
- **Description**: Time taken to process individual events
- **Labels**: `event_type` (type of event)
- **Use Case**: Monitor event-specific performance

### 2. Lag and Throughput Metrics

#### Indexer Lag (Ledgers)
- **Metric**: `indexer_lag_ledgers`
- **Type**: Gauge
- **Description**: Number of ledgers indexer is behind network
- **Labels**: None
- **Use Case**: Monitor indexing lag

#### Indexer Lag Duration
- **Metric**: `indexer_lag_duration_seconds`
- **Type**: Gauge
- **Description**: Time lag in seconds (ledgers * 5 seconds)
- **Labels**: None
- **Use Case**: More precise lag measurement

#### Processing Rate
- **Metric**: `indexer_processing_rate_events_per_second`
- **Type**: Gauge
- **Description**: Current events processing rate
- **Labels**: None
- **Use Case**: Monitor throughput

### 3. Success and Error Rate Metrics

#### Event Success Rate
- **Metric**: `indexer_event_success_rate`
- **Type**: Gauge
- **Description**: Percentage of successfully processed events
- **Labels**: None
- **Use Case**: Monitor processing reliability

#### Event Error Rate
- **Metric**: `indexer_event_error_rate`
- **Type**: Gauge
- **Description**: Percentage of failed events
- **Labels**: None
- **Use Case**: Monitor error rates

#### Events Processed Counter
- **Metric**: `indexer_events_processed_total`
- **Type**: Counter
- **Description**: Total number of successfully processed events
- **Labels**: `event_type`, `status`
- **Use Case**: Track cumulative processing

#### Events Failed Counter
- **Metric**: `indexer_events_failed_total`
- **Type**: Counter
- **Description**: Total number of failed events
- **Labels**: `event_type`, `status`
- **Use Case**: Track cumulative failures

### 4. System Resource Metrics

#### Memory Usage
- **Metric**: `indexer_memory_usage_bytes`
- **Type**: Gauge
- **Description**: Current memory usage in bytes
- **Labels**: None
- **Use Case**: Monitor memory consumption

#### CPU Usage
- **Metric**: `indexer_cpu_usage_percent`
- **Type**: Gauge
- **Description**: Current CPU usage percentage
- **Labels**: None
- **Use Case**: Monitor CPU utilization

#### Uptime
- **Metric**: `indexer_uptime_seconds`
- **Type**: Gauge
- **Description**: Indexer uptime in seconds
- **Labels**: None
- **Use Case**: Monitor service availability

### 5. Operational Metrics

#### Indexer Polls
- **Metric**: `indexer_polls_total`
- **Type**: Counter
- **Description**: Total number of indexer polls
- **Labels**: `status` (success, partial, error, noop)
- **Use Case**: Monitor polling activity

#### Batch Size
- **Metric**: `indexer_batch_size_ledgers`
- **Type**: Histogram
- **Description**: Size of processed batches
- **Labels**: None
- **Use Case**: Monitor batch processing patterns

#### Queue Depth
- **Metric**: `indexer_queue_depth`
- **Type**: Gauge
- **Description**: Number of pending items in queue
- **Labels**: None
- **Use Case**: Monitor queue backlog

#### Reconnections
- **Metric**: `indexer_reconnects_total`
- **Type**: Counter
- **Description**: Total number of reconnections
- **Labels**: `reason` (connection reason)
- **Use Case**: Monitor connection stability

## API Endpoints

### Prometheus Metrics Export
```
GET /metrics/prometheus
```

Returns all metrics in Prometheus format for scraping by Prometheus server.

**Response Format:**
```
# HELP indexer_current_ledger Current ledger processed by indexer
# TYPE indexer_current_ledger gauge
indexer_current_ledger 123456

# HELP indexer_processing_rate_events_per_second Current event processing rate
# TYPE indexer_processing_rate_events_per_second gauge
indexer_processing_rate_events_per_second 42.5

# HELP indexer_event_success_rate Current event success rate percentage
# TYPE indexer_event_success_rate gauge
indexer_event_success_rate 98.5
```

### Metrics Health Status
```
GET /metrics/health
```

Returns health status of the metrics collection system.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "metrics": {
    "processingRate": 42.5,
    "successRate": 98.5,
    "errorRate": 1.5,
    "lagSeconds": 25,
    "memoryUsage": 524288000,
    "cpuUsage": 45.2,
    "uptime": 86400
  }
}
```

### Performance Summary
```
GET /metrics/summary
```

Returns a summary of current indexer performance with recommendations.

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "performance": {
    "processingRate": 42.5,
    "successRate": 98.5,
    "errorRate": 1.5,
    "lagSeconds": 25,
    "memoryUsage": 524288000,
    "cpuUsage": 45.2,
    "uptime": 86400
  },
  "recommendations": [
    "All metrics are within normal ranges"
  ]
}
```

### Export Metrics
```
GET /metrics/export
```

Export metrics in various formats (JSON or CSV).

**Headers:**
- `Accept: application/json` for JSON format
- `Accept: text/csv` for CSV format

**JSON Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "format": "json",
  "metrics": {
    "processing": {
      "rate": 42.5,
      "successRate": 98.5,
      "errorRate": 1.5
    },
    "lag": {
      "seconds": 25,
      "ledgers": 5
    },
    "system": {
      "memoryUsage": 524288000,
      "cpuUsage": 45.2,
      "uptime": 86400
    }
  }
}
```

## Grafana Dashboard

### Dashboard Overview

The included Grafana dashboard provides comprehensive visualization of indexer performance:

#### Key Panels

1. **Indexer Lag**: Real-time lag in ledgers
2. **Processing Rate**: Current events per second
3. **Event Success Rate**: Percentage of successful events
4. **Event Error Rate**: Percentage of failed events
5. **Events Processed Over Time**: Historical processing trends
6. **Batch Processing Duration**: Batch performance histogram
7. **Ledger Processing Duration**: Ledger performance histogram
8. **Event Processing Duration by Type**: Heatmap of event processing times
9. **System Resources**: Memory, CPU, and uptime
10. **Indexer Poll Status**: Polling activity

### Importing the Dashboard

1. Open Grafana
2. Go to Dashboards → Import
3. Upload the `grafana-dashboard-indexer.json` file
4. Configure the Prometheus data source
5. Save the dashboard

### Dashboard Features

- **Real-time Updates**: 10-second refresh interval
- **Threshold Alerts**: Visual indicators for critical metrics
- **Historical Trends**: Time-series visualization
- **Performance Analysis**: Histograms and heatmaps
- **System Health**: Resource utilization monitoring

## Integration with Indexer

### Metrics Collection Points

The metrics are collected at key points in the indexer lifecycle:

#### 1. Batch Processing
```typescript
// Start timing
const batchStartTime = Date.now();

// Process events
await this.processEvents(events);

// Record metrics
const batchDuration = (Date.now() - batchStartTime) / 1000;
this.metricsService.recordBatchProcessingDuration(batchDuration, ledgerCount);
```

#### 2. Event Processing
```typescript
// Start timing
const eventStartTime = Date.now();

// Process event
const success = await this.processEvent(event);

// Record metrics
const eventDuration = (Date.now() - eventStartTime) / 1000;
this.metricsService.recordEventProcessingDuration(eventDuration, eventType, success);
```

#### 3. Lag Monitoring
```typescript
// Update lag metrics
this.metricsService.updateIndexerLag(currentLedger, networkLedger);
this.metricsService.updateIndexerLagDuration(lagSeconds);
```

#### 4. Rate Calculation
```typescript
// Calculate processing rate
const eventsPerSecond = events.length / batchDuration;
this.metricsService.updateProcessingRate(eventsPerSecond);
```

### Performance Thresholds

The system defines performance thresholds for alerts:

#### Critical Thresholds
- **Error Rate**: > 5%
- **Lag**: > 300 seconds (60 ledgers)
- **Processing Rate**: < 1 event/second
- **Memory Usage**: > 1GB
- **CPU Usage**: > 80%

#### Warning Thresholds
- **Error Rate**: > 2%
- **Lag**: > 60 seconds (12 ledgers)
- **Processing Rate**: < 5 events/second
- **Memory Usage**: > 512MB
- **CPU Usage**: > 60%

## Monitoring Best Practices

### 1. Regular Monitoring
- Check dashboard regularly for performance trends
- Monitor error rates and processing efficiency
- Track lag and throughput metrics
- Review system resource utilization

### 2. Alert Configuration
- Set up alerts for critical thresholds
- Configure notification channels (email, Slack, etc.)
- Test alert configurations regularly
- Adjust thresholds based on system behavior

### 3. Performance Analysis
- Review historical performance data
- Identify patterns and anomalies
- Correlate performance with system events
- Optimize based on insights

### 4. Capacity Planning
- Monitor resource usage trends
- Plan for scaling based on growth
- Consider peak load scenarios
- Optimize resource allocation

## Troubleshooting

### Common Issues

#### High Lag
**Symptoms**: `indexer_lag_ledgers` > 10, `indexer_lag_duration_seconds` > 50

**Causes**:
- Network connectivity issues
- High event volume
- Processing bottlenecks
- Database performance issues

**Solutions**:
- Check network connectivity
- Optimize event processing
- Increase processing capacity
- Review database performance

#### High Error Rate
**Symptoms**: `indexer_event_error_rate` > 5%

**Causes**:
- Invalid event data
- Processing logic errors
- Database connection issues
- External service failures

**Solutions**:
- Review error logs
- Validate event data
- Fix processing logic
- Check database connectivity

#### Low Processing Rate
**Symptoms**: `indexer_processing_rate_events_per_second` < 5

**Causes**:
- Resource constraints
- Inefficient processing
- Network latency
- Database bottlenecks

**Solutions**:
- Increase resources
- Optimize processing logic
- Check network performance
- Review database queries

#### High Memory Usage
**Symptoms**: `indexer_memory_usage_bytes` > 1GB

**Causes**:
- Memory leaks
- Large event batches
- Inefficient data structures
- Cache issues

**Solutions**:
- Profile memory usage
- Optimize batch sizes
- Review data structures
- Clear caches regularly

### Debug Tools

#### Metrics Export
```bash
# Get current metrics
curl http://localhost:3000/metrics/prometheus

# Get health status
curl http://localhost:3000/metrics/health

# Get performance summary
curl http://localhost:3000/metrics/summary
```

#### Log Analysis
```bash
# Check indexer logs for errors
tail -f logs/indexer.log | grep ERROR

# Monitor processing performance
tail -f logs/indexer.log | grep "Processed.*events"
```

#### System Monitoring
```bash
# Monitor system resources
top -p $(pgrep -f indexer)

# Check memory usage
ps aux | grep indexer

# Monitor network connections
netstat -an | grep :3000
```

## Configuration

### Environment Variables
```bash
# Metrics Configuration
METRICS_ENABLED=true
METRICS_PORT=9464
METRICS_PATH=/metrics

# Performance Thresholds
METRICS_ERROR_RATE_THRESHOLD=5.0
METRICS_LAG_THRESHOLD=300
METRICS_PROCESSING_RATE_THRESHOLD=1.0

# System Monitoring
METRICS_MEMORY_THRESHOLD=1073741824
METRICS_CPU_THRESHOLD=80.0
```

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 10s

scrape_configs:
  - job_name: 'stellar-indexer'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics/prometheus'
    scrape_interval: 10s
    scrape_timeout: 5s
```

### Grafana Data Source
```json
{
  "name": "Stellar Indexer",
  "type": "prometheus",
  "url": "http://localhost:9090",
  "access": "proxy",
  "isDefault": true
}
```

## Future Enhancements

### Planned Features
- **Custom Metrics**: Add application-specific metrics
- **Distributed Tracing**: Integrate with tracing systems
- **Advanced Analytics**: Machine learning for anomaly detection
- **Automated Alerts**: Intelligent alerting based on patterns
- **Performance Profiling**: Detailed performance profiling

### Extension Points
- **Custom Collectors**: Implement custom metric collectors
- **Alert Rules**: Define custom alert rules
- **Dashboard Templates**: Create custom dashboard templates
- **Export Formats**: Support additional export formats

This comprehensive monitoring system provides complete visibility into indexer performance, enabling proactive monitoring, troubleshooting, and optimization of the Stellar indexer infrastructure.
