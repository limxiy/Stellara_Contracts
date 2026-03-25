#!/bin/bash
# =============================================================================
# Point-in-Time Recovery (PITR) Script
# Restores PostgreSQL database to a specific point in time using WAL archives
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/postgresql/pitr-restore.log"
PG_DATA="${PGDATA:-/var/lib/postgresql/data}"

# Load environment variables
if [ -f "${SCRIPT_DIR}/../.env" ]; then
    export $(grep -v '^#' "${SCRIPT_DIR}/../.env" | xargs)
fi

# Default values
S3_BUCKET="${S3_BACKUP_BUCKET:-stellara-backups}"
WAL_BUCKET="${WAL_ARCHIVE_BUCKET:-stellara-wal-archives}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Arguments
BACKUP_KEY="${1:-}"
TARGET_TIME="${2:-}"  # Format: "2024-03-25 14:30:00"
RECOVERY_DIR="${3:-/tmp/pitr-recovery}"

usage() {
    echo "Usage: $0 <s3-backup-key> <target-time> [recovery-directory]"
    echo "Example: $0 postgresql/2024/03/25/base-backup.tar '2024-03-25 14:30:00'"
    echo ""
    echo "Note: This script stops the PostgreSQL service and performs PITR."
    echo "      Use with caution in production environments."
    exit 1
}

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Validate arguments
if [ -z "$BACKUP_KEY" ] || [ -z "$TARGET_TIME" ]; then
    log "ERROR: Backup key and target time are required"
    usage
fi

mkdir -p "$(dirname "$LOG_FILE")"
log "=== Starting Point-in-Time Recovery ==="
log "Backup: s3://${S3_BUCKET}/${BACKUP_KEY}"
log "Target Time: ${TARGET_TIME}"
log "Recovery Directory: ${RECOVERY_DIR}"

# Create recovery directory
mkdir -p "$RECOVERY_DIR"

# Download base backup
log "Downloading base backup..."
BASE_BACKUP="${RECOVERY_DIR}/base-backup.tar"
if ! aws s3 cp "s3://${S3_BUCKET}/${BACKUP_KEY}" "$BASE_BACKUP" --region "$AWS_REGION"; then
    log "ERROR: Failed to download base backup"
    exit 1
fi

# Stop PostgreSQL
log "Stopping PostgreSQL service..."
if pg_ctlcluster 16 main status > /dev/null 2>&1; then
    pg_ctlcluster 16 main stop -m fast
elif pg_ctl status -D "$PG_DATA" > /dev/null 2>&1; then
    pg_ctl stop -D "$PG_DATA" -m fast
else
    log "WARNING: Could not stop PostgreSQL - may not be running"
fi

# Backup current data directory
if [ -d "$PG_DATA" ]; then
    BACKUP_CURRENT="${RECOVERY_DIR}/pre-pitr-backup-$(date +%Y%m%d-%H%M%S)"
    log "Backing up current data directory to ${BACKUP_CURRENT}..."
    cp -r "$PG_DATA" "$BACKUP_CURRENT"
fi

# Clean data directory
log "Cleaning data directory..."
rm -rf "${PG_DATA:?}"/*

# Extract base backup
log "Extracting base backup..."
tar -xzf "$BASE_BACKUP" -C "$PG_DATA"

# Create recovery configuration
log "Creating recovery configuration..."
cat > "${PG_DATA}/postgresql.auto.conf" << EOF
# Recovery configuration for PITR
restore_command = '/usr/local/bin/wal-restore.sh "%f" "%p"'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
recovery_target_inclusive = true
EOF

# Create standby.signal to trigger recovery
touch "${PG_DATA}/standby.signal"

# Start PostgreSQL in recovery mode
log "Starting PostgreSQL in recovery mode..."
if command -v pg_ctlcluster > /dev/null; then
    pg_ctlcluster 16 main start
else
    pg_ctl start -D "$PG_DATA" -l "${PG_DATA}/log/recovery.log"
fi

# Monitor recovery progress
log "Monitoring recovery progress..."
MAX_WAIT=3600  # 1 hour timeout
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    sleep 10
    WAITED=$((WAITED + 10))
    
    # Check if recovery is complete
    if psql -U postgres -c "SELECT pg_is_in_recovery();" 2>/dev/null | grep -q "f"; then
        log "Recovery completed successfully!"
        break
    fi
    
    # Log progress every minute
    if [ $((WAITED % 60)) -eq 0 ]; then
        log "Recovery in progress... (${WAITED}s elapsed)"
    fi
done

if [ $WAITED -ge $MAX_WAIT ]; then
    log "ERROR: Recovery timeout after ${MAX_WAIT} seconds"
    exit 1
fi

# Verify recovery
log "Verifying recovery..."
CURRENT_LSN=$(psql -U postgres -t -c "SELECT pg_current_wal_lsn();" 2>/dev/null | xargs)
RECOVERY_TIME=$(psql -U postgres -t -c "SELECT pg_last_xact_replay_timestamp();" 2>/dev/null | xargs)

log "Current WAL LSN: ${CURRENT_LSN}"
log "Recovery timestamp: ${RECOVERY_TIME}"

# Clean up recovery files
log "Cleaning up recovery configuration..."
rm -f "${PG_DATA}/standby.signal"

# Update postgresql.auto.conf to remove recovery settings
cat > "${PG_DATA}/postgresql.auto.conf" << EOF
# Recovery completed at $(date)
# Previous recovery target time: ${TARGET_TIME}
EOF

log "=== Point-in-Time Recovery Completed Successfully ==="
log "Database restored to: ${TARGET_TIME}"
log "Actual recovery timestamp: ${RECOVERY_TIME}"
