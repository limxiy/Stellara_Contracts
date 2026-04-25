# Event Replay System

This document describes the event replay system that allows replaying events from specific ledger sequences for debugging and data recovery.

## Overview

The event replay system provides a comprehensive solution for reprocessing blockchain events from specific ledger ranges. It enables:

- **Event Replay**: Replay events from any ledger range
- **Dry-Run Mode**: Test replay operations without making changes
- **Progress Tracking**: Real-time progress monitoring and status updates
- **Conflict Resolution**: Handle duplicate events and data conflicts
- **Data Recovery**: Recover from indexing errors or data corruption
- **Debugging**: Debug event processing issues in specific ranges

## Database Schema

The system introduces two new tables for managing replay operations:

### EventReplay
Stores replay operation metadata and progress tracking.

```sql
CREATE TABLE "event_replays" (
    "id" TEXT PRIMARY KEY,
    "network" TEXT NOT NULL,
    "start_ledger_seq" INTEGER NOT NULL,
    "end_ledger_seq" INTEGER NOT NULL,
    "status" TEXT DEFAULT 'pending',
    "dry_run" BOOLEAN DEFAULT false,
    "conflict_resolution" TEXT DEFAULT 'skip',
    "processed_events" INTEGER DEFAULT 0,
    "total_events" INTEGER DEFAULT 0,
    "skipped_events" INTEGER DEFAULT 0,
    "error_events" INTEGER DEFAULT 0,
    "current_ledger_seq" INTEGER,
    "errors" JSONB,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);
```

### ReplayEvent
Stores individual events processed during replay operations.

```sql
CREATE TABLE "replay_events" (
    "id" TEXT PRIMARY KEY,
    "replay_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "ledger_seq" INTEGER NOT NULL,
    "contract_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "status" TEXT DEFAULT 'pending',
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Start Event Replay
```
POST /indexer/replay/start
```

Start a new event replay operation for a specific ledger range.

**Request Body:**
```json
{
  "startLedgerSeq": 1000000,
  "endLedgerSeq": 1001000,
  "dryRun": false,
  "conflictResolution": "skip",
  "contractIds": ["CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A"],
  "eventTypes": ["PROJECT_CREATED", "CONTRIBUTION_MADE"],
  "metadata": {
    "reason": "Debugging missing events",
    "requestedBy": "admin@example.com"
  },
  "options": {
    "batchSize": 100,
    "maxRetries": 3,
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "replayId": "replay_123456",
  "status": "pending",
  "estimatedDuration": 120,
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Overlapping with active replay"],
    "estimatedEventCount": 2500,
    "estimatedDuration": 120,
    "conflicts": []
  }
}
```

### Get Replay Status
```
GET /indexer/replay/{replayId}
```

Get detailed information about a replay operation.

**Query Parameters:**
- `includeEvents`: Include processed events in response
- `includeLogs`: Include replay logs in response

**Response:**
```json
{
  "replay": {
    "id": "replay_123456",
    "network": "testnet",
    "startLedgerSeq": 1000000,
    "endLedgerSeq": 1001000,
    "status": "running",
    "dryRun": false,
    "conflictResolution": "skip",
    "processedEvents": 1250,
    "totalEvents": 2500,
    "skippedEvents": 25,
    "errorEvents": 5,
    "currentLedgerSeq": 1000500,
    "startedAt": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "progress": {
    "replayId": "replay_123456",
    "status": "running",
    "currentLedgerSeq": 1000500,
    "totalLedgers": 1001,
    "processedLedgers": 501,
    "processedEvents": 1250,
    "totalEvents": 2500,
    "skippedEvents": 25,
    "errorEvents": 5,
    "estimatedTimeRemaining": 30,
    "eventsPerSecond": 42.5
  }
}
```

### Get Replay Progress
```
GET /indexer/replay/{replayId}/progress
```

Get real-time progress information for a running replay.

**Response:**
```json
{
  "success": true,
  "progress": {
    "replayId": "replay_123456",
    "status": "running",
    "currentLedgerSeq": 1000500,
    "totalLedgers": 1001,
    "processedLedgers": 501,
    "processedEvents": 1250,
    "totalEvents": 2500,
    "skippedEvents": 25,
    "errorEvents": 5,
    "estimatedTimeRemaining": 30,
    "eventsPerSecond": 42.5
  },
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### Cancel Replay
```
PUT /indexer/replay/{replayId}/cancel
```

Cancel a running replay operation.

**Response:**
```json
{
  "replayId": "replay_123456",
  "status": "cancelled",
  "message": "Replay cancelled successfully"
}
```

### Get Replay Results
```
GET /indexer/replay/{replayId}/result
```

Get comprehensive results and summary for a completed replay.

**Response:**
```json
{
  "success": true,
  "result": {
    "replay": {
      "id": "replay_123456",
      "status": "completed",
      "processedEvents": 2470,
      "totalEvents": 2500,
      "skippedEvents": 25,
      "errorEvents": 5
    },
    "events": [
      {
        "id": "event_1",
        "replayId": "replay_123456",
        "eventId": "event_abc123",
        "ledgerSeq": 1000001,
        "contractId": "CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A",
        "eventType": "PROJECT_CREATED",
        "transactionHash": "tx_hash_123",
        "status": "processed",
        "processedAt": "2024-01-15T10:31:00Z"
      }
    ],
    "summary": {
      "totalEvents": 2500,
      "processedEvents": 2470,
      "skippedEvents": 25,
      "errorEvents": 5,
      "duration": 60000,
      "eventsPerSecond": 41.2,
      "conflicts": [
        {
          "type": "duplicate_event",
          "count": 25,
          "examples": ["event_abc123", "event_def456"]
        }
      ],
      "warnings": ["Some events were skipped due to conflicts"]
    }
  },
  "timestamp": "2024-01-15T10:40:00Z"
}
```

### List Replays
```
GET /indexer/replay/list
```

List replay operations with filtering options.

**Query Parameters:**
- `status`: Filter by status (`pending`, `running`, `completed`, `failed`, `cancelled`)
- `dryRun`: Filter by dry-run status
- `dateFrom`: Filter from date (ISO string)
- `dateTo`: Filter to date (ISO string)
- `limit`: Limit number of results

**Response:**
```json
{
  "success": true,
  "replays": [
    {
      "id": "replay_123456",
      "network": "testnet",
      "status": "completed",
      "startLedgerSeq": 1000000,
      "endLedgerSeq": 1001000,
      "dryRun": false,
      "processedEvents": 2470,
      "totalEvents": 2500,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "totalCount": 1,
  "filter": {
    "status": "completed"
  },
  "timestamp": "2024-01-15T10:40:00Z"
}
```

### Get Statistics
```
GET /indexer/replay/statistics
```

Get comprehensive statistics about replay operations.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalReplays": 15,
    "activeReplays": 2,
    "completedReplays": 10,
    "failedReplays": 3,
    "averageDuration": 45000,
    "totalEventsReplayed": 37500,
    "successRate": 66.7,
    "mostActiveNetwork": "testnet",
    "recentReplays": [
      {
        "id": "replay_123456",
        "status": "completed",
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ]
  },
  "timestamp": "2024-01-15T10:40:00Z"
}
```

### Validate Replay Request
```
POST /indexer/replay/validate
```

Validate a replay request before starting.

**Request Body:**
```json
{
  "startLedgerSeq": 1000000,
  "endLedgerSeq": 1001000,
  "dryRun": false,
  "conflictResolution": "skip"
}
```

**Response:**
```json
{
  "success": true,
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": ["Large ledger range may take longer to process"],
    "estimatedEventCount": 2500,
    "estimatedDuration": 120,
    "conflicts": []
  },
  "timestamp": "2024-01-15T10:40:00Z"
}
```

### Get Active Replays
```
GET /indexer/replay/active
```

Get currently running replay operations.

**Response:**
```json
{
  "success": true,
  "activeReplays": [
    {
      "id": "replay_789abc",
      "status": "running",
      "startLedgerSeq": 2000000,
      "endLedgerSeq": 2005000,
      "progress": 45
    }
  ],
  "count": 1,
  "timestamp": "2024-01-15T10:40:00Z"
}
```

## Replay Status Types

### Replay Status
- **pending**: Replay is queued but not started
- **running**: Replay is currently processing
- **completed**: Replay finished successfully
- **failed**: Replay failed due to errors
- **cancelled**: Replay was cancelled by user

### Event Status
- **pending**: Event is queued for processing
- **processed**: Event was successfully processed
- **skipped**: Event was skipped (dry run or conflict)
- **error**: Event processing failed

### Conflict Resolution Strategies
- **skip**: Skip conflicting events (default)
- **overwrite**: Delete existing events and reprocess
- **merge**: Attempt to merge data (future enhancement)

## Usage Examples

### Start a Simple Replay
```bash
curl -X POST http://localhost:3000/indexer/replay/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startLedgerSeq": 1000000,
    "endLedgerSeq": 1000100,
    "dryRun": false,
    "conflictResolution": "skip"
  }'
```

### Start a Dry Run
```bash
curl -X POST http://localhost:3000/indexer/replay/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startLedgerSeq": 1000000,
    "endLedgerSeq": 1000100,
    "dryRun": true,
    "conflictResolution": "skip"
  }'
```

### Monitor Progress
```bash
curl -X GET http://localhost:3000/indexer/replay/replay_123456/progress \
  -H "Authorization: Bearer <token>"
```

### Cancel a Replay
```bash
curl -X PUT http://localhost:3000/indexer/replay/replay_123456/cancel \
  -H "Authorization: Bearer <token>"
```

### Get Results
```bash
curl -X GET http://localhost:3000/indexer/replay/replay_123456/result \
  -H "Authorization: Bearer <token>"
```

## Conflict Resolution

### Skip Strategy (Default)
When a conflict is detected (event already processed), the event is skipped and marked as skipped. This is the safest option for production environments.

```json
{
  "conflictResolution": "skip",
  "skippedEvents": 25,
  "conflictExamples": ["event_abc123", "event_def456"]
}
```

### Overwrite Strategy
Delete existing processed events and reprocess them. This is useful for data recovery but can be dangerous in production.

```json
{
  "conflictResolution": "overwrite",
  "processedEvents": 2475,
  "overwrittenEvents": 25
}
```

### Merge Strategy
Attempt to merge data from existing and new events. This is a future enhancement for complex data reconciliation.

```json
{
  "conflictResolution": "merge",
  "mergedEvents": 2480,
  "conflictsResolved": 25
}
```

## Dry Run Mode

Dry run mode allows you to test replay operations without making any changes to the database. This is essential for:

- **Testing**: Verify replay logic before production use
- **Validation**: Check for potential conflicts
- **Estimation**: Get accurate time and event count estimates
- **Safety**: No data modification

### Dry Run Behavior
- Events are fetched and parsed but not processed
- Conflicts are detected and reported
- Progress is tracked but no data is modified
- Event status is marked as "skipped"

### Dry Run Results
```json
{
  "replay": {
    "dryRun": true,
    "processedEvents": 0,
    "totalEvents": 2500,
    "skippedEvents": 2500,
    "errorEvents": 0
  },
  "summary": {
    "totalEvents": 2500,
    "processedEvents": 0,
    "skippedEvents": 0,
    "errorEvents": 0,
    "duration": 30000,
    "eventsPerSecond": 83.3,
    "conflicts": [
      {
        "type": "duplicate_event",
        "count": 2500,
        "examples": ["event_abc123", "event_def456"]
      }
    ]
  }
}
```

## Progress Tracking

### Real-time Progress
The system provides real-time progress updates including:

- **Current Ledger**: The ledger currently being processed
- **Processing Speed**: Events per second
- **Time Remaining**: Estimated completion time
- **Error Rate**: Percentage of failed events

### Progress Metrics
```json
{
  "replayId": "replay_123456",
  "status": "running",
  "currentLedgerSeq": 1000500,
  "totalLedgers": 1001,
  "processedLedgers": 501,
  "processedEvents": 1250,
  "totalEvents": 2500,
  "skippedEvents": 25,
  "errorEvents": 5,
  "estimatedTimeRemaining": 30,
  "eventsPerSecond": 42.5
}
```

### Progress Calculation
- **Events Per Second**: `processedEvents / (elapsed_time / 1000)`
- **Time Remaining**: `(remaining_ledgers / processed_ledgers) * elapsed_time / 1000`
- **Error Rate**: `(error_events / processed_events) * 100`

## Error Handling

### Common Errors

#### Invalid Ledger Range
```json
{
  "success": false,
  "message": "Invalid replay request: Start ledger must be less than end ledger"
}
```

#### Maximum Concurrent Replays
```json
{
  "success": false,
  "message": "Maximum concurrent replays (3) reached"
}
```

#### Event Processing Errors
```json
{
  "errorEvents": 5,
  "errors": [
    {
      "ledgerSeq": 1000500,
      "eventId": "event_xyz789",
      "error": "Failed to parse event data",
      "timestamp": "2024-01-15T10:35:00Z",
      "context": {
        "contractId": "CDLZFC3SYJYD5T5Z3W57CN2UYAF6LW5PGQ3STCTXYSY7MP2P3KU4A",
        "eventType": "UNKNOWN_EVENT"
      }
    }
  ]
}
```

### Error Recovery

The system implements several error recovery mechanisms:

1. **Retry Logic**: Automatic retry for transient errors
2. **Circuit Breaker**: Prevents cascade failures
3. **Graceful Degradation**: Continue processing other events
4. **Error Logging**: Detailed error tracking for debugging

## Performance Considerations

### Batch Processing
Events are processed in configurable batches to optimize performance:

- **Default Batch Size**: 100 ledgers
- **Configurable**: Can be adjusted per replay
- **Memory Management**: Prevents memory overload
- **Database Optimization**: Efficient database operations

### Concurrent Replays
The system supports multiple concurrent replays with limits:

- **Default Limit**: 3 concurrent replays
- **Configuration**: Configurable via environment variables
- **Resource Management**: Prevent system overload
- **Queue Management**: Proper replay queuing system

### Memory Usage
- **Event Caching**: Efficient event data caching
- **Batch Cleanup**: Automatic cleanup of processed data
- **Memory Monitoring**: Track memory usage during replays
- **Garbage Collection**: Proper cleanup of temporary data

## Monitoring and Metrics

### Key Metrics
- **Replay Success Rate**: Percentage of successful replays
- **Average Duration**: Average time per replay
- **Events Per Second**: Processing speed measurement
- **Error Rate**: Percentage of failed events
- **Concurrent Replays**: Number of active replays

### Alerting
The system can be configured to send alerts for:

- **High Error Rates**: When error rate exceeds threshold
- **Long Running Replays**: When replays take too long
- **Failed Replays**: When replays fail completely
- **Resource Exhaustion**: When system resources are low

### Logging
Comprehensive logging includes:

- **Replay Operations**: Start, progress, completion
- **Event Processing**: Success, failure, skip events
- **Performance Metrics**: Speed, duration, resource usage
- **Error Details**: Full error context and stack traces

## Configuration

### Environment Variables
```bash
# Replay Configuration
REPLAY_MAX_CONCURRENT=3
REPLAY_BATCH_SIZE=100
REPLAY_DEFAULT_TIMEOUT=30000
REPLAY_ENABLE_METRICS=true
REPLAY_ENABLE_DETAILED_LOGGING=false
```

### Configuration Options
```typescript
interface ReplayConfig {
  defaultBatchSize: number;
  defaultTimeout: number;
  defaultRetryCount: number;
  defaultRetryDelay: number;
  maxConcurrentReplays: number;
  enableMetrics: boolean;
  enableDetailedLogging: boolean;
}
```

## Security Considerations

### Access Control
- **Authentication**: All endpoints require JWT authentication
- **Authorization**: Role-based access for sensitive operations
- **Audit Trail**: All replay operations are logged
- **Permission Checks**: Validate user permissions

### Data Protection
- **Dry Run Mode**: Safe testing without data modification
- **Conflict Resolution**: Configurable conflict handling
- **Error Sanitization**: Sanitized error messages
- **Data Integrity**: Maintain data consistency

### Rate Limiting
- **API Rate Limits**: Prevent abuse of replay endpoints
- **Concurrent Limits**: Prevent system overload
- **Resource Limits**: Protect system resources
- **Queue Management**: Proper request queuing

## Troubleshooting

### Common Issues

#### Replay Stuck at Pending
1. Check if maximum concurrent replays reached
2. Verify replay request validation passed
3. Check system resources and logs
4. Restart replay service if needed

#### Slow Performance
1. Reduce batch size
2. Check database performance
3. Monitor memory usage
4. Optimize event filters

#### High Error Rate
1. Check network connectivity
2. Verify contract ABI availability
3. Review conflict resolution strategy
4. Check event data integrity

### Debug Tools

#### Replay Logs
```typescript
const logs = await eventReplayService.getReplayLogs(replayId);
console.log('Replay logs:', logs);
```

#### Progress Monitoring
```typescript
const progress = await eventReplayService.getReplayProgress(replayId);
console.log('Progress:', progress);
```

#### Event Inspection
```typescript
const events = await eventReplayService.getReplayEvents(replayId);
console.log('Events:', events);
```

## Best Practices

### Planning Replays
1. **Start Small**: Test with small ledger ranges first
2. **Validate First**: Always validate before starting
3. **Dry Run**: Use dry run for testing
4. **Monitor Closely**: Watch progress during execution
5. **Review Results**: Analyze results after completion

### Production Usage
1. **Off-Peak Hours**: Schedule replays during low traffic
2. **Resource Limits**: Monitor system resources
3. **Conflict Strategy**: Choose appropriate conflict resolution
4. **Error Handling**: Implement proper error recovery
5. **Documentation**: Document replay reasons and results

### Data Recovery
1. **Backup First**: Create backups before major replays
2. **Test Thoroughly**: Validate with dry runs
3. **Monitor Progress**: Watch for issues during recovery
4. **Verify Results**: Confirm data integrity after completion

### Performance Optimization
1. **Batch Sizing**: Optimize batch sizes for your system
2. **Filtering**: Use contract and event type filters
3. **Parallel Processing**: Use appropriate concurrency levels
4. **Resource Management**: Monitor and optimize resource usage

## Migration Guide

### From Basic Event Processing
1. **Assess Current State**: Evaluate existing event processing
2. **Plan Replays**: Plan replay operations carefully
3. **Test Thoroughly**: Validate with dry runs
4. **Execute Gradually**: Start with small ranges
5. **Monitor Closely**: Watch for issues during execution

### Integration Steps
1. **Deploy Migration**: Run database migration
2. **Update Services**: Update indexer integration
3. **Configure System**: Set up configuration
4. **Test Integration**: End-to-end testing
5. **Monitor Performance**: Watch system behavior

## Future Enhancements

### Planned Features
- **Automatic Conflict Resolution**: Smart conflict detection and resolution
- **Event Filtering**: Advanced filtering by event properties
- **Parallel Processing**: Enhanced parallel replay capabilities
- **Real-time Streaming**: Live progress updates via WebSocket
- **Advanced Analytics**: Enhanced analytics and reporting

### Extension Points
- **Custom Conflict Resolvers**: Implement custom conflict logic
- **Event Processors**: Custom event processing logic
- **Progress Handlers**: Custom progress tracking
- **Notification Systems**: Custom alerting mechanisms

This comprehensive event replay system provides a robust foundation for debugging, data recovery, and event reprocessing in the Stellar indexer, enabling safe and controlled event replay operations with full progress tracking and conflict resolution.
