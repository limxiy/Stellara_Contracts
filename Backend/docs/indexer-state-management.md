# Indexer State Management

This document describes the indexer state management functionality that allows for pause, resume, and reset operations with proper state persistence.

## Overview

The indexer state management system provides:

- **State Persistence**: Indexer state is persisted across restarts
- **Control Operations**: Pause, resume, and reset the indexer
- **Graceful Operations**: Waits for current processing to complete before pausing
- **State Validation**: Validates state integrity before resume operations
- **State Backup**: Creates backups before reset operations
- **Error Tracking**: Tracks errors and provides recovery mechanisms

## Database Schema

The system introduces a new `indexer_states` table:

```sql
CREATE TABLE "indexer_states" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "last_ledger_seq" INTEGER NOT NULL,
    "last_ledger_hash" TEXT,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "reset_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "indexer_states_pkey" PRIMARY KEY ("id")
);
```

## API Endpoints

### Get Status
```
GET /indexer/control/status
```

Returns the current indexer status and state information.

### Pause Indexer
```
POST /indexer/control/pause
Content-Type: application/json

{
  "reason": "Optional reason for pausing",
  "waitForCompletion": true
}
```

Pauses the indexer with graceful completion. Waits for current processing to finish before pausing.

### Resume Indexer
```
POST /indexer/control/resume
```

Resumes the indexer with state validation. Validates the current state before resuming.

### Reset Indexer
```
POST /indexer/control/reset
Content-Type: application/json

{
  "startLedger": 0,
  "reason": "Optional reason for reset",
  "confirm": true
}
```

Resets the indexer state with backup. Requires explicit confirmation.

### Health Check
```
GET /indexer/control/health
```

Returns the health status of the indexer with any issues and recommendations.

### Statistics
```
GET /indexer/control/statistics?hours=24
```

Returns detailed statistics about indexer performance and state.

### Validate State
```
POST /indexer/control/validate
```

Validates the integrity of the indexer state and returns any issues.

## State Transitions

The indexer can be in the following states:

- **running**: Actively processing events
- **paused**: Temporarily stopped (can be resumed)
- **stopped**: Permanently stopped
- **error**: Error state (requires intervention)

Valid state transitions:
- running → paused
- paused → running
- running → error
- error → running (after fixing issues)
- any state → reset (with backup)

## Graceful Pause Implementation

When pausing the indexer:

1. Check if indexer is currently processing
2. If `waitForCompletion` is true, wait for current poll to finish
3. Update state to 'paused' with timestamp
4. Stop polling scheduler (keeps current processing intact)
5. Log pause reason and timestamp

## State Validation on Resume

When resuming the indexer:

1. Verify state exists and is in 'paused' or 'stopped' status
2. Validate ledger sequence is reasonable (not negative)
3. Check error rate and warn if high (>50%)
4. Validate timestamp consistency
5. Update state to 'running' with resume timestamp
6. Restart polling scheduler

## State Backup Before Reset

When resetting the indexer:

1. Create backup of current state in `indexer_logs` table
2. Include full state data with timestamp
3. Reset all counters and timestamps
4. Set status to 'running'
5. Log reset reason and timestamp

## Integration with Indexer Service

The state management is integrated into the main `IndexerService`:

- State is checked before each poll operation
- Processing state is updated after each successful batch
- Errors are recorded in the state
- State is initialized on service startup

## Error Handling

The system provides comprehensive error handling:

- Errors are recorded with timestamps and stack traces
- Error rates are tracked and can trigger alerts
- State validation prevents invalid operations
- Graceful degradation when state is corrupted

## Monitoring and Metrics

The system provides various metrics for monitoring:

- Processing rate (events per hour)
- Error rate (percentage)
- Uptime (seconds since last resume)
- State transition history
- Performance statistics

## Security Considerations

- All control endpoints require JWT authentication
- Reset operations require explicit confirmation
- State operations are logged for audit trails
- Sensitive data is not stored in metadata

## Usage Examples

### Pause for Maintenance
```bash
curl -X POST http://localhost:3000/indexer/control/pause \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Scheduled maintenance", "waitForCompletion": true}'
```

### Resume After Maintenance
```bash
curl -X POST http://localhost:3000/indexer/control/resume \
  -H "Authorization: Bearer <token>"
```

### Reset to Specific Ledger
```bash
curl -X POST http://localhost:3000/indexer/control/reset \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"startLedger": 1000000, "reason": "Reorg recovery", "confirm": true}'
```

### Check Health
```bash
curl -X GET http://localhost:3000/indexer/control/health \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

### Indexer Won't Resume
1. Check current state: `GET /indexer/control/status`
2. Validate state: `POST /indexer/control/validate`
3. Check for errors in logs
4. Ensure state is 'paused' or 'stopped'

### High Error Rate
1. Check health status: `GET /indexer/control/health`
2. Review recent errors in state
3. Check network connectivity
4. Consider reset if errors persist

### State Corruption
1. Use state validation to identify issues
2. Reset indexer with backup to recover
3. Check database integrity
4. Monitor for recurring issues

## Best Practices

1. **Always use graceful pause** with `waitForCompletion: true` during maintenance
2. **Validate state** before resume operations
3. **Monitor error rates** and investigate when >10%
4. **Create backups** before major operations
5. **Document reasons** for state changes in metadata
6. **Monitor health status** regularly
7. **Test recovery procedures** in non-production environments
