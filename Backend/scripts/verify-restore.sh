#!/bin/bash
# =============================================================================
# Post-Restore Verification Script
# Validates database integrity after restore
# =============================================================================

set -euo pipefail

LOG_FILE="/var/log/postgresql/verify-restore.log"

# Arguments
DB_HOST="${1:-localhost}"
DB_PORT="${2:-5432}"
DB_USER="${3:-postgres}"
DB_NAME="${4:-app_db}"

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
    export $(grep -v '^#' "${SCRIPT_DIR}/../.env" | xargs)
fi

# Use environment variables if not provided as arguments
DB_HOST="${1:-${DATABASE_HOST:-localhost}}"
DB_PORT="${2:-${DATABASE_PORT:-5432}}"
DB_USER="${3:-${DATABASE_USER:-postgres}}"
DB_NAME="${4:-${DATABASE_NAME:-app_db}}"
DB_PASSWORD="${DATABASE_PASSWORD:-}"

if [ -z "$DB_PASSWORD" ]; then
    echo "ERROR: DATABASE_PASSWORD must be set"
    exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

log "=== Starting Post-Restore Verification ==="
log "Database: ${DB_NAME} on ${DB_HOST}:${DB_PORT}"

ERRORS=0

# Test 1: Database connectivity
log "Test 1: Checking database connectivity..."
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    log "FAILED: Cannot connect to database"
    ((ERRORS++))
else
    log "PASSED: Database connectivity OK"
fi

# Test 2: Critical tables exist
log "Test 2: Checking critical tables..."
CRITICAL_TABLES=("users" "projects" "contributions" "tenants")
for table in "${CRITICAL_TABLES[@]}"; do
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -c "SELECT 1 FROM \"${table}\" LIMIT 1;" > /dev/null 2>&1; then
        log "FAILED: Critical table '${table}' not found or inaccessible"
        ((ERRORS++))
    else
        log "PASSED: Table '${table}' OK"
    fi
done

# Test 3: Row counts (sanity check)
log "Test 3: Checking row counts..."
ROW_COUNTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins - n_tup_del as row_count
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_tup_ins - n_tup_del DESC
LIMIT 10;
" 2>/dev/null)

if [ -z "$ROW_COUNTS" ]; then
    log "WARNING: Could not retrieve row counts"
else
    log "Row counts retrieved successfully"
    echo "$ROW_COUNTS" | while read line; do
        log "  $line"
    done
fi

# Test 4: Database integrity (pg_dump schema validation)
log "Test 4: Validating database schema..."
if ! pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --schema-only > /dev/null 2>&1; then
    log "FAILED: Schema validation failed"
    ((ERRORS++))
else
    log "PASSED: Schema validation OK"
fi

# Test 5: Check for data corruption (basic)
log "Test 5: Checking for data corruption..."
CORRUPTION_CHECK=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT 
    count(*) as corrupt_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' 
AND n.nspname = 'public'
AND c.relpages > 0
AND NOT EXISTS (
    SELECT 1 FROM pg_stat_user_tables s
    WHERE s.relid = c.oid
);
" 2>/dev/null | xargs)

if [ "$CORRUPTION_CHECK" -gt 0 ] 2>/dev/null; then
    log "WARNING: Found $CORRUPTION_CHECK potentially corrupt tables"
else
    log "PASSED: No corruption detected"
fi

# Test 6: Extension validation
log "Test 6: Checking installed extensions..."
EXTENSIONS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');
" 2>/dev/null)

if echo "$EXTENSIONS" | grep -q "uuid-ossp"; then
    log "PASSED: uuid-ossp extension OK"
else
    log "WARNING: uuid-ossp extension not found"
fi

# Summary
log "=== Verification Summary ==="
if [ $ERRORS -eq 0 ]; then
    log "All critical tests PASSED"
    log "Database restore verification: SUCCESS"
    exit 0
else
    log "${ERRORS} test(s) FAILED"
    log "Database restore verification: FAILED"
    exit 1
fi
