# Blockchain Reorganization Handling System

This document describes the comprehensive blockchain reorganization (reorg) handling system implemented for the Stellar indexer to ensure data consistency and reliability during blockchain reorgs.

## Overview

Blockchain reorganizations occur when the blockchain state changes, causing previously confirmed blocks to be replaced by different blocks. This can happen due to network forks, consensus changes, or other blockchain events. The reorg handling system ensures that the indexer maintains data consistency and can recover from such events.

## Features Implemented

### 1. Ledger Hash Mismatch Detection
- **Real-time Detection**: Compares expected ledger hashes with actual hashes from the network
- **Hash Chain Validation**: Validates the continuity of the ledger hash chain
- **Depth Detection**: Identifies the depth of reorgs to determine rollback requirements

### 2. Automatic Rollback Mechanism
- **Event Rollback**: Automatically rolls back affected events in reverse chronological order
- **Data Consistency**: Ensures database consistency by undoing changes made by invalid events
- **Type-Specific Rollback**: Different rollback logic for different event types (contributions, projects, milestones, etc.)

### 3. Event Reprocessing
- **Safe Resume**: Automatically resumes processing from the last valid ledger
- **Idempotent Processing**: Ensures events can be safely reprocessed without duplication
- **Complete Recovery**: Reprocesses all events from the reorg point to restore data consistency

### 4. Reorg Depth Tracking and Alerting
- **Metrics Collection**: Tracks reorg frequency, depth, and duration
- **Alert System**: Sends notifications for significant reorgs
- **Health Monitoring**: Provides health status based on reorg patterns

### 5. Idempotent Event Processing
- **Duplicate Detection**: Prevents processing the same event multiple times
- **Transaction Safety**: Uses database transactions for atomic operations
- **Rollback Safety**: Ensures all operations can be safely undone

## Architecture

### Core Components

#### ReorgHandlerService
The main service responsible for detecting and handling reorgs:
```typescript
// Detect and handle reorgs
const safeLedger = await reorgHandler.detectAndHandleReorg(currentLedgerInfo);

// Get reorg statistics
const stats = await reorgHandler.getReorgStats();
```

#### Enhanced LedgerTrackerService
Enhanced with hash tracking and reorg detection:
```typescript
// Detect reorg by comparing ledger hashes
const reorgResult = await ledgerTracker.detectReorg(currentLedger);

// Handle reorg by rolling back to safe point
const safeLedger = await ledgerTracker.handleReorg(reorgResult);
```

#### Enhanced IndexerService
Integrated with reorg detection in the polling loop:
```typescript
// Check for reorgs before processing events
const safeLedger = await reorgHandler.detectAndHandleReorg(latestLedgerInfo);
```

#### ReorgMonitoringController
REST API endpoints for monitoring and management:
```typescript
// GET /indexer/reorg/stats - Get reorg statistics
// GET /indexer/reorg/health - Get health status
// GET /indexer/reorg/cursor - Get current cursor
// POST /indexer/reorg/force-check - Force reorg check
```

## Database Schema

### Enhanced Tables

#### LedgerCursor
```sql
CREATE TABLE ledger_cursors (
  id VARCHAR PRIMARY KEY,
  network VARCHAR UNIQUE,
  last_ledger_seq INTEGER,
  last_ledger_hash VARCHAR, -- Added for reorg detection
  updated_at TIMESTAMP,
  created_at TIMESTAMP
);
```

#### ProcessedEvent
```sql
CREATE TABLE processed_events (
  event_id VARCHAR PRIMARY KEY,
  network VARCHAR,
  ledger_seq INTEGER,
  contract_id VARCHAR,
  event_type VARCHAR,
  transaction_hash VARCHAR,
  created_at TIMESTAMP
);
```

#### IndexerLog
```sql
CREATE TABLE indexer_logs (
  id VARCHAR PRIMARY KEY,
  level VARCHAR,
  message TEXT,
  metadata JSON,
  timestamp TIMESTAMP,
  created_at TIMESTAMP
);
```

## Event Rollback Logic

### Contribution Events
- Delete contribution records
- Recalculate project funds from remaining contributions
- Update project current funds

### Project Events
- Delete project records
- Clean up associated milestones and contributions

### Milestone Events
- Reset milestone status to previous state
- Remove completion dates
- Handle fund releases appropriately

### Insurance Events
- Delete policy records
- Reset claim statuses
- Handle payment rollbacks

## Monitoring and Metrics

### Prometheus Metrics
```prometheus
# Reorg detection metrics
blockchain_reorgs_total{network="testnet"}
blockchain_reorg_depth_bucket{le="1"} 
blockchain_reorg_depth_bucket{le="5"}
blockchain_reorg_depth_bucket{le="10"}
blockchain_reorg_depth_sum
blockchain_reorg_duration_seconds

# Rollback metrics
blockchain_reorg_rollback_events_total{event_type="rollback"}
```

### Health Indicators
- **Reorg Frequency**: Number of reorgs per hour/day
- **Reorg Depth**: Maximum and average reorg depth
- **Rollback Success Rate**: Percentage of successful rollbacks
- **Recovery Time**: Time to recover from reorg

## Configuration

### Environment Variables
```bash
# Reorg handling configuration
INDEXER_MAX_REORG_DEPTH=100          # Maximum reorg depth to handle
INDEXER_REORG_ALERT_THRESHOLD=10     # Reorg depth for alerts
INDEXER_REORG_DEPTH_THRESHOLD=5      # Depth threshold for hash validation

# Network configuration
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
```

### Configuration Options
- `maxReorgDepth`: Maximum reorg depth the system will handle
- `reorgAlertThreshold`: Depth at which to send alerts
- `reorgDepthThreshold`: Threshold for hash chain validation

## API Endpoints

### Monitoring Endpoints

#### GET /indexer/reorg/stats
Get comprehensive reorg statistics:
```json
{
  "currentCursor": {
    "lastLedgerSeq": 12345,
    "lastLedgerHash": "abc123...",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "reorgStatistics": {
    "recentReorgs": [...],
    "totalReorgs": 5,
    "avgReorgDepth": 3.2,
    "maxReorgDepth": 15
  },
  "network": "testnet",
  "indexerStatus": {
    "isRunning": true,
    "lastUpdate": "2024-01-01T00:00:00Z"
  }
}
```

#### GET /indexer/reorg/health
Get indexer health status:
```json
{
  "status": "healthy",
  "issues": [],
  "cursor": {...},
  "recentReorgCount": 1,
  "maxReorgDepth": 5,
  "avgReorgDepth": 2.1,
  "totalReorgs": 10,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### GET /indexer/reorg/depth-distribution
Get reorg depth distribution:
```json
{
  "depthDistribution": {
    "1-5": 8,
    "6-10": 2,
    "11-20": 0,
    "21-50": 0,
    "51+": 0
  },
  "totalReorgs": 10,
  "avgDepth": 3.2,
  "maxDepth": 8,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Operational Procedures

### Handling Deep Reorgs
1. **Detection**: System automatically detects reorgs
2. **Assessment**: Evaluates reorg depth and impact
3. **Rollback**: Rolls back affected events
4. **Recovery**: Reprocesses events from safe point
5. **Verification**: Confirms data consistency

### Manual Intervention
If automatic recovery fails:
1. Check `/indexer/reorg/health` endpoint
2. Review indexer logs for errors
3. Use `/indexer/reorg/force-check` to trigger manual check
4. Consider manual cursor reset if needed

### Monitoring Setup
1. Set up Prometheus alerts for reorg metrics
2. Configure notification channels for alerts
3. Monitor health endpoint status
4. Track reorg patterns over time

## Testing

### Unit Tests
- Test reorg detection logic
- Test rollback mechanisms
- Test event reprocessing
- Test idempotent processing

### Integration Tests
- Test end-to-end reorg scenarios
- Test database consistency
- Test API endpoints
- Test metrics collection

### Chaos Testing
- Simulate network reorgs
- Test deep reorg handling
- Test concurrent reorg scenarios
- Test recovery from failures

## Best Practices

### Prevention
- Monitor reorg patterns
- Set appropriate alert thresholds
- Use multiple RPC endpoints
- Implement circuit breakers

### Recovery
- Always rollback in reverse chronological order
- Use database transactions for atomicity
- Verify data consistency after recovery
- Log all reorg events for audit

### Monitoring
- Track reorg frequency and depth
- Monitor recovery time metrics
- Set up health checks
- Alert on anomalous patterns

## Troubleshooting

### Common Issues

#### Reorg Detection Not Working
- Check ledger hash storage
- Verify RPC endpoint reliability
- Review cursor updates
- Check hash chain validation

#### Rollback Failures
- Check database constraints
- Review rollback logic order
- Verify event type handlers
- Check for missing foreign keys

#### Recovery Issues
- Verify idempotent processing
- Check event parsing logic
- Review cursor positioning
- Test with known good state

### Debug Commands
```bash
# Check current cursor
curl http://localhost:3000/indexer/reorg/cursor

# Get health status
curl http://localhost:3000/indexer/reorg/health

# Force reorg check
curl -X POST http://localhost:3000/indexer/reorg/force-check

# Get reorg stats
curl http://localhost:3000/indexer/reorg/stats
```

## Future Enhancements

### Advanced Features
1. **Predictive Analysis**: ML-based reorg prediction
2. **Multi-Chain Support**: Handle reorgs across multiple networks
3. **Real-time Dashboard**: Web-based reorg monitoring
4. **Automated Recovery**: Enhanced automatic recovery procedures

### Performance Optimizations
1. **Batch Rollback**: Batch process rollback operations
2. **Parallel Processing**: Parallel event reprocessing
3. **Caching**: Cache ledger hash validations
4. **Incremental Updates**: Incremental state updates

### Security Enhancements
1. **Reorg Signatures**: Cryptographic verification of reorg events
2. **Access Controls**: Role-based access to reorg controls
3. **Audit Trail**: Comprehensive audit logging
4. **Data Integrity**: Checksums for data verification

## Conclusion

The blockchain reorganization handling system provides comprehensive protection against blockchain state changes, ensuring data consistency and reliability for the Stellar indexer. The system combines automatic detection, rollback, recovery, and monitoring capabilities to maintain system integrity during reorg events.

The implementation follows best practices for blockchain data management and provides robust monitoring and alerting capabilities to ensure operational visibility and rapid response to reorg events.
