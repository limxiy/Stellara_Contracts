# Backup Operations Guide

## Stellara Backend Backup System

**Version:** 1.0  
**Last Updated:** March 2026  
**Owner:** Platform Engineering Team

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Daily Operations](#daily-operations)
3. [Monitoring and Alerting](#monitoring-and-alerting)
4. [Troubleshooting](#troubleshooting)
5. [Maintenance Procedures](#maintenance-procedures)

---

## Architecture Overview

### Backup Components

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │────▶│  WAL Archiving  │────▶│   S3 (WAL)      │
│   (Primary)     │     │  (Continuous)   │     │  (IA/Glacier)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │
         │ Daily 2 AM
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  pg_dump        │────▶│  S3 Upload      │────▶│   S3 (Backups)  │
│  (Full Backup)  │     │  (Multipart)    │     │  (Standard/IA)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         │ Cross-Region
                                                         ▼
                                                ┌─────────────────┐
                                                │  S3 (Replica)   │
                                                │  (us-west-2)    │
                                                └─────────────────┘
```

### Backup Types

| Type | Frequency | Retention | Storage Class |
|------|-----------|-----------|---------------|
| Full Backup | Daily at 2:00 AM UTC | 7 days | Standard |
| Weekly Backup | Sundays | 4 weeks | Standard-IA |
| Monthly Backup | 1st of month | 12 months | Glacier |
| WAL Archives | Continuous | 90 days | Standard-IA |

---

## Daily Operations

### Morning Health Check (9:00 AM)

```bash
#!/bin/bash
# daily-backup-check.sh

echo "=== Daily Backup Health Check ==="

# Check last backup status
curl -s http://localhost:3000/admin/backup/status | jq .

# Check S3 backup exists
aws s3 ls s3://stellara-backups-production/postgresql/$(date +%Y/%m/%d)/ \
  --recursive | tail -5

# Check WAL archive continuity
aws s3 ls s3://stellara-wal-archives-production/wal/$(date +%Y/%m/%d)/ \
  --recursive | wc -l

echo "=== Check Complete ==="
```

### Manual Backup Trigger

```bash
# Trigger immediate backup
curl -X POST http://localhost:3000/admin/backup/trigger \
  -H "Content-Type: application/json" \
  -d '{"type": "FULL", "description": "Pre-deployment backup"}'

# Check backup progress
curl http://localhost:3000/admin/backup/list | jq '.[0]'
```

### Backup Verification

```bash
# Verify specific backup
curl -X POST http://localhost:3000/admin/backup/verify \
  -H "Content-Type: application/json" \
  -d '{"backupId": "uuid-here", "testRestore": true}'
```

---

## Monitoring and Alerting

### Key Metrics

| Metric | Warning | Critical | Description |
|--------|---------|----------|-------------|
| Last Backup Age | > 25 hours | > 49 hours | Time since last successful backup |
| WAL Archive Lag | > 10 min | > 30 min | Time since last WAL archive |
| Backup Size | > 150% avg | > 200% avg | Unusual backup size |
| S3 Upload Time | > 30 min | > 60 min | Backup upload duration |
| Verification Failures | > 1/day | > 3/day | Failed backup verifications |

### CloudWatch Alarms

```yaml
# Example CloudWatch alarm configuration
BackupAgeAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: Stellara-Backup-Age-Critical
    MetricName: LastBackupAge
    Namespace: Stellara/Backup
    Statistic: Maximum
    Period: 3600
    EvaluationPeriods: 1
    Threshold: 49
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref SNSTopic
```

### Health Check Endpoints

```bash
# Backup system health
curl http://localhost:3000/health/backup

# Response format:
{
  "status": "up",
  "lastBackup": "2024-03-25T02:00:00Z",
  "lastBackupAge": "7h30m",
  "walArchiveLag": "2m15s",
  "s3Connection": "ok"
}
```

---

## Troubleshooting

### Common Issues

#### Issue: Backup Fails with "Connection Refused"

**Symptoms:**
- Backup job fails immediately
- Error: "could not connect to server: Connection refused"

**Diagnosis:**
```bash
# Check PostgreSQL status
pg_isready -h localhost -p 5432

# Check connection limits
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

**Resolution:**
1. Verify PostgreSQL is running
2. Check max_connections setting
3. Restart backup after connection issues resolved

#### Issue: S3 Upload Timeout

**Symptoms:**
- Backup completes locally but upload fails
- Error: "RequestTimeout" or connection reset

**Diagnosis:**
```bash
# Test S3 connectivity
aws s3 ls s3://stellara-backups-production/

# Check multipart upload status
aws s3api list-multipart-uploads --bucket stellara-backups-production
```

**Resolution:**
1. Check network connectivity
2. Verify AWS credentials
3. Abort incomplete multipart uploads
4. Retry backup

#### Issue: WAL Archive Lag

**Symptoms:**
- WAL files accumulating locally
- Archive command failing

**Diagnosis:**
```bash
# Check WAL archive status
psql -c "SELECT archived_count, failed_count, last_archived_time 
         FROM pg_stat_archiver;"

# Check disk space
df -h /var/lib/postgresql/data/pg_wal

# Check archive command logs
tail -f /var/log/postgresql/wal-archive.log
```

**Resolution:**
1. Check S3 credentials and permissions
2. Verify network connectivity to S3
3. Clear disk space if full
4. Manually archive stuck WAL files

#### Issue: Backup Verification Fails

**Symptoms:**
- Backup uploads successfully
- Verification reports checksum mismatch

**Diagnosis:**
```bash
# Download and verify checksum
aws s3 cp s3://bucket/backup-file /tmp/backup-file
sha256sum /tmp/backup-file

# Check S3 metadata
aws s3api head-object --bucket bucket --key backup-file
```

**Resolution:**
1. Re-upload backup
2. Check for network issues during upload
3. Verify S3 eventual consistency (wait 1-2 minutes)

---

## Maintenance Procedures

### Monthly Maintenance

#### 1. Review Retention Compliance

```bash
# List backups older than retention policy
aws s3 ls s3://stellara-backups-production/post