#!/bin/bash
# =============================================================================
# Full Database Restore Script
# Restores PostgreSQL database from S3 backup
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/postgresql/restore.log"

# Load environment variables
if [ -f "${SCRIPT_DIR}/../.env" ]; then
    export $(grep -v '^#' "${SCRIPT_DIR}/../.env" | xargs)
fi

# Default values
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
DB_NAME="${DATABASE_NAME:-app_db}"
DB_PASSWORD="${DATABASE_PASSWORD:-}"
S3_BUCKET="${S3_BACKUP_BUCKET:-stellara-backups}"
AWS_REGION="${AWS_REGION:-us-east-1}"

# Arguments
BACKUP_KEY="${1:-}"
TARGET_DB="${2:-$DB_NAME}"

usage() {
    echo "Usage: $0 <s3-backup-key> [target-database-name]"
    echo "Example: $0 postgresql/2024/03/25/backup-FULL-2024-03-25T02-00-00.sql my_database"
    exit 1
}

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Validate arguments
if [ -z "$BACKUP_KEY" ]; then
    log "ERROR: Backup key is required"
    usage
fi

if [ -z "$DB_PASSWORD" ]; then
    log "ERROR: DATABASE_PASSWORD must be set"
    exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"
log "=== Starting Full Restore ==="
log "Backup: s3://${S3_BUCKET}/${BACKUP_KEY}"
log "Target Database: ${TARGET_DB}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

BACKUP_FILE="${TEMP_DIR}/backup.sql"

# Download backup from S3
log "Downloading backup from S3..."
if ! aws s3 cp "s3://${S3_BUCKET}/${BACKUP_KEY}" "$BACKUP_FILE" --region "$AWS_REGION"; then
    log "ERROR: Failed to download backup from S3"
    exit 1
fi

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "unknown")
log "Downloaded backup: ${BACKUP_SIZE} bytes"

# Verify backup file
if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found after download"
    exit 1
fi

# Set PostgreSQL password
export PGPASSWORD="$DB_PASSWORD"

# Test database connection
log "Testing database connection..."
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    log "ERROR: Cannot connect to database server"
    exit 1
fi
log "Database connection successful"

# Drop existing database
log "Dropping existing database ${TARGET_DB}..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TARGET_DB" 2>&1 | tee -a "$LOG_FILE" || true

# Create new database
log "Creating new database ${TARGET_DB}..."
if ! createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TARGET_DB" 2>&1 | tee -a "$LOG_FILE"; then
    log "ERROR: Failed to create database"
    exit 1
fi

# Restore database
log "Restoring database from backup..."
START_TIME=$(date +%s)

if ! pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
    --verbose --no-owner --no-privileges \
    "$BACKUP_FILE" 2>&1 | tee -a "$LOG_FILE"; then
    # pg_restore returns 1 for warnings, check if database is usable
    log "WARNING: pg_restore completed with warnings"
fi

END_TIME=$(date +%s)
RESTORE_TIME=$((END_TIME - START_TIME))

# Verify restore
log "Verifying restore..."
TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
    -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)

log "Restore completed in ${RESTORE_TIME} seconds"
log "Tables restored: ${TABLE_COUNT}"

# Run post-restore validation
log "Running post-restore validation..."
"${SCRIPT_DIR}/verify-restore.sh" "$DB_HOST" "$DB_PORT" "$DB_USER" "$TARGET_DB"

log "=== Full Restore Completed Successfully ==="
log "Database ${TARGET_DB} restored from ${BACKUP_KEY}"
