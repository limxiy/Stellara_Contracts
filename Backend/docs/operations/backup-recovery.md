# Database Backup and Recovery Procedures

## Overview
This document outlines the strategy and procedures for database backups and disaster recovery for the Stellara Contracts backend.

## Backup Strategy

### Automated Daily Backups
- **Frequency**: Every 24 hours (Daily at 02:00 UTC).
- **Mechanism**: `pg_dump` utility executed via `scripts/backup-db.sh`.
- **Retention**: Local backups are kept for 30 days. Off-site backups are kept according to S3 lifecycle policies (90 days).

### Off-site Storage
- Backups are uploaded to an AWS S3 bucket (`S3_BACKUP_BUCKET`) immediately after creation.
- S3 Cross-Region Replication is enabled for disaster recovery across geographical regions.

### Encryption
- Backups are compressed using `gzip`.
- Sensitive production backups are encrypted using `GPG` before being uploaded to S3.

## Recovery Procedures

### Standard Restoration
To restore a database from a backup file:

1. **Stop the Application**:
   ```bash
   npm run stop
   ```

2. **Prepare the Database**:
   ```bash
   dropdb app_db
   createdb app_db
   ```

3. **Restore from SQL**:
   ```bash
   gunzip -c backup_file.sql.gz | psql app_db
   ```

4. **Verify Data**:
   Check key tables (Users, Projects, Contributions) to ensure data integrity.

### Point-in-Time Recovery (PITR)
Production databases use Write-Ahead Logging (WAL) archiving to support Point-in-Time Recovery.
- **WAL Archiving**: Enabled on RDS/Postgres.
- **Recovery Point Objective (RPO)**: 5 minutes.
- **Recovery Time Objective (RTO)**: 1 hour.

## Monitoring and Alerting
- **Backup Success/Failure**: Monitored via CloudWatch/Datadog.
- **Alerts**: Sent to `#ops-alerts` Slack channel if a backup fails or if the S3 upload fails.

## Testing
- **Quarterly Restoration Test**: Every 3 months, a backup is restored to a staging environment to verify its validity.
- **Last Tested**: 2026-04-23
- **Result**: PASSED
