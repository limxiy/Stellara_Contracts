# Disaster Recovery Runbook

## Stellara Backend Database Disaster Recovery

**Version:** 1.0  
**Last Updated:** March 2026  
**Owner:** Platform Engineering Team  
**Review Cycle:** Quarterly

---

## Table of Contents

1. [Overview](#overview)
2. [Incident Response Procedures](#incident-response-procedures)
3. [Recovery Scenarios](#recovery-scenarios)
4. [Communication Plan](#communication-plan)
5. [Post-Incident Review](#post-incident-review)

---

## Overview

### RTO/RPO Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| RTO (Recovery Time Objective) | 4 hours | Time from incident declaration to service restoration |
| RPO (Recovery Point Objective) | 1 hour | Maximum acceptable data loss |

### Backup Architecture

- **Full Backups:** Daily at 2:00 AM UTC to S3
- **WAL Archiving:** Continuous to S3 (5-minute intervals)
- **Retention:** 7 daily, 4 weekly, 12 monthly backups
- **Encryption:** AES-256 (SSE-KMS)
- **Cross-Region Replication:** Enabled to us-west-2

### Key Resources

| Resource | Location |
|----------|----------|
| Primary Backup Bucket | `s3://stellara-backups-{env}-{account}` |
| WAL Archive Bucket | `s3://stellara-wal-archives-{env}-{account}` |
| Recovery Scripts | `Backend/scripts/` |
| Infrastructure | `Backend/infrastructure/s3-backup-bucket.yml` |

---

## Incident Response Procedures

### Severity Levels

#### SEV 1 - Critical (Complete Data Loss)
- Complete database corruption or deletion
- Primary and replica both unavailable
- **Response Time:** Immediate (15 minutes)
- **Escalation:** CTO, VP Engineering

#### SEV 2 - High (Partial Data Loss)
- Data corruption affecting specific tables
- Point-in-time recovery required
- **Response Time:** 30 minutes
- **Escalation:** Engineering Manager

#### SEV 3 - Medium (Service Degradation)
- Slow queries, performance issues
- Single AZ failure
- **Response Time:** 2 hours
- **Escalation:** On-call engineer

### Incident Response Checklist

#### Immediate Actions (First 15 minutes)

- [ ] Acknowledge incident in PagerDuty/Opsgenie
- [ ] Create incident channel in Slack (#incident-{YYYY-MM-DD})
- [ ] Notify stakeholders per communication plan
- [ ] Assess scope and severity
- [ ] Stop automated deployments
- [ ] Preserve logs and metrics

#### Assessment Phase (15-30 minutes)

- [ ] Determine root cause
- [ ] Identify affected data/time range
- [ ] Check backup availability
- [ ] Estimate recovery time
- [ ] Document findings in incident channel

#### Recovery Phase

- [ ] Execute appropriate recovery procedure
- [ ] Monitor progress
- [ ] Validate restored data
- [ ] Perform smoke tests
- [ ] Gradually restore traffic

#### Post-Recovery

- [ ] Verify all services operational
- [ ] Resume automated deployments
- [ ] Schedule post-mortem
- [ ] Update runbook if needed

---

## Recovery Scenarios

### Scenario 1: Complete Database Loss

**Trigger:** Primary database completely lost or corrupted

#### Recovery Steps

1. **Declare Incident**
   ```bash
   # Log incident start time
   export INCIDENT_START=$(date -u +%s)
   ```

2. **Identify Latest Backup**
   ```bash
   aws s3api list-objects-v2 \
     --bucket stellara-backups-production \
     --prefix "postgresql/" \
     --query 'sort_by(Contents, &LastModified)[-1].{Key: Key, Time: LastModified}'
   ```

3. **Execute Full Restore**
   ```bash
   # Use restore script
   ./scripts/restore-full.sh \
     postgresql/2024/03/25/backup-FULL-2024-03-25T02-00-00.sql \
     app_db
   ```

4. **Verify Recovery**
   ```bash
   ./scripts/verify-restore.sh localhost 5432 postgres app_db
   ```

5. **Apply WAL Archives (if needed for PITR)**
   ```bash
   # If recovering to specific point in time
   ./scripts/restore-pitr.sh \
     postgresql/2024/03/25/base-backup.tar \
     "2024-03-25 14:30:00"
   ```

**Expected Time:** 2-4 hours depending on backup size

---

### Scenario 2: Partial Data Corruption

**Trigger:** Specific tables or records corrupted

#### Recovery Steps

1. **Identify Affected Tables**
   ```sql
   -- Check table integrity
   SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
   FROM pg_stat_user_tables
   WHERE tablename IN ('users', 'projects', 'contributions')
   ORDER BY n_tup_upd DESC;
   ```

2. **Restore to Temporary Database**
   ```bash
   # Restore to temp database for data extraction
   createdb temp_recovery
   pg_restore -d temp_recovery /tmp/backup.sql
   ```

3. **Selective Data Recovery**
   ```sql
   -- Extract clean data from backup
   INSERT INTO users
   SELECT * FROM dblink('dbname=temp_recovery', 
     'SELECT * FROM users WHERE updated_at < ''2024-03-25 14:30:00''')
   AS t(id uuid, email text, ...);
   ```

4. **Validate and Cleanup**
   ```sql
   -- Verify row counts
   SELECT 'users' as table, count(*) FROM users
   UNION ALL
   SELECT 'projects', count(*) FROM projects;
   
   -- Drop temp database
   DROP DATABASE temp_recovery;
   ```

**Expected Time:** 1-2 hours

---

### Scenario 3: Accidental Data Deletion

**Trigger:** User error causing data deletion

#### Recovery Steps

1. **Stop Application Writes**
   ```bash
   # Put application in maintenance mode
   kubectl set env deployment/backend MAINTENANCE_MODE=true
   ```

2. **Identify Deletion Time**
   ```sql
   -- Check PostgreSQL logs for deletion timestamp
   -- Or use application audit logs
   ```

3. **Point-in-Time Recovery**
   ```bash
   # Restore to just before deletion
   ./scripts/restore-pitr.sh \
     postgresql/2024/03/25/base-backup.tar \
     "2024-03-25 10:15:00"  # 1 minute before deletion
   ```

4. **Extract and Reconcile Data**
   ```sql
   -- Export deleted records from recovered database
   COPY (SELECT * FROM deleted_records) TO '/tmp/recovered_data.csv' CSV;
   
   -- Import to production
   COPY deleted_records FROM '/tmp/recovered_data.csv' CSV;
   ```

**Expected Time:** 2-3 hours

---

### Scenario 4: Region Failure

**Trigger:** Complete AWS region unavailable

#### Recovery Steps

1. **Activate DR Region**
   ```bash
   # Switch to us-west-2 (replica region)
   export AWS_REGION=us-west-2
   ```

2. **Promote Cross-Region Replica**
   ```bash
   # S3 buckets are already replicated
   # Update application configuration
   kubectl set env deployment/backend \
     DATABASE_HOST=dr-db.cluster-xxx.us-west-2.rds.amazonaws.com
   ```

3. **Verify Data in DR Region**
   ```bash
   aws s3 ls s3://stellara-backups-production-replica/postgresql/ \
     --recursive | tail -5
   ```

4. **Redirect Traffic**
   ```bash
   # Update DNS/Load Balancer
   # Switch Route53 to DR region
   ```

**Expected Time:** 30-60 minutes (RTO primarily DNS propagation)

---

## Communication Plan

### Notification Matrix

| Severity | Engineering | Leadership | Customers | Timeline |
|----------|-------------|------------|-----------|----------|
| SEV 1 | Immediate | Immediate | After assessment | 15 min |
| SEV 2 | Immediate | 30 min | If user-facing | 30 min |
| SEV 3 | Standard | Daily digest | No | 4 hours |

### Communication Templates

#### Initial Notification (Slack)

```
:alert: INCIDENT DECLARED :alert:

**Severity:** SEV 1 - Critical
**Service:** Database / Backend
**Impact:** Complete service outage
**Started:** 2024-03-25 14:30 UTC
**Incident Channel:** #incident-2024-03-25

**Current Status:** Investigating root cause
**Next Update:** 15 minutes

**IC (Incident Commander):** @oncall-engineer
```

#### Status Update

```
**Update 14:45 UTC**

**Status:** In Progress
**What Happened:** Primary database unresponsive
**What We're Doing:** Executing DR procedure, restoring from backup
**ETA:** 2-3 hours for full recovery
**Impact:** All services unavailable
```

#### All Clear

```
:white_check_mark: INCIDENT RESOLVED :white_check_mark:

**Resolved:** 2024-03-25 16:45 UTC
**Duration:** 2h 15m
**Resolution:** Database restored from backup, all services operational

**Post-mortem:** Scheduled for 2024-03-28 10:00 UTC
```

---

## Post-Incident Review

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD  
**Severity:** SEV X  
**Duration:** X hours Y minutes  
**IC:** Name  

## Summary
Brief description of what happened

## Timeline
- 14:30 - Issue detected
- 14:35 - Incident declared
- 14:45 - Root cause identified
- 16:45 - Service restored

## Root Cause
Detailed explanation of why this happened

## Impact
- Users affected: X
- Data lost: Y
- Revenue impact: $Z

## What Went Well
1. Item 1
2. Item 2

## What Went Wrong
1. Item 1
2. Item 2

## Action Items
| ID | Action | Owner | Due Date |
|----|--------|-------|----------|
| 1  | Fix X  | @user | YYYY-MM-DD |

## Lessons Learned
Key takeaways from this incident
```

### Action Item Tracking

All action items must be:
- Assigned to specific owners
- Given due dates
- Tracked in project management tool
- Reviewed in weekly standup until complete

---

## Appendix

### Emergency Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| On-Call Engineer | Rotation | PagerDuty | #on-call |
| Engineering Manager | Name | +1-xxx-xxxx | @username |
| VP Engineering | Name | +1-xxx-xxxx | @username |
| CTO | Name | +1-xxx-xxxx | @username |

### Useful Commands

```bash
# Check backup status
aws s3 ls s3://stellara-backups-production/postgresql/ --recursive | tail -10

# Check WAL archive status
aws s3 ls s3://stellara-wal-archives-production/wal/ --recursive | tail -10

# Database size
psql -c "SELECT pg_size_pretty(pg_database_size('app_db'));"

# Connection count
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Replication lag
psql -c "SELECT extract(epoch from (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;"
```

### Related Documentation

- [Backup Operations Guide](./backup-operations.md)
- [RTO/RPO Compliance](./rto-rpo-compliance.md)
- [Infrastructure Setup](../infrastructure/s3-backup-bucket.yml)
