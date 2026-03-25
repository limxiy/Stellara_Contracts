#!/bin/bash
# =============================================================================
# WAL Archive Script for PostgreSQL
# Archives WAL files to AWS S3 for Point-in-Time Recovery (PITR)
# =============================================================================

set -euo pipefail

# Configuration
S3_BUCKET="${WAL_ARCHIVE_BUCKET:-stellara-wal-archives}"
S3_PREFIX="${WAL_ARCHIVE_PREFIX:-wal}"
AWS_REGION="${AWS_REGION:-us-east-1}"
MAX_RETRIES=3
RETRY_DELAY=5

# Arguments from PostgreSQL
WAL_FILE_PATH="$1"
WAL_FILE_NAME="$2"

# Logging
LOG_FILE="/var/log/postgresql/wal-archive.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

log "Starting WAL archive: $WAL_FILE_NAME"

# Validate input
if [[ -z "$WAL_FILE_PATH" || -z "$WAL_FILE_NAME" ]]; then
    log "ERROR: Missing arguments. Usage: wal-archive.sh <path> <filename>"
    exit 1
fi

if [[ ! -f "$WAL_FILE_PATH" ]]; then
    log "ERROR: WAL file not found: $WAL_FILE_PATH"
    exit 1
fi

# Calculate checksum for verification
CHECKSUM=$(sha256sum "$WAL_FILE_PATH" | cut -d' ' -f1)
log "WAL file checksum: $CHECKSUM"

# Generate S3 key with date prefix for organization
DATE_PREFIX=$(date '+%Y/%m/%d')
S3_KEY="${S3_PREFIX}/${DATE_PREFIX}/${WAL_FILE_NAME}"

# Upload to S3 with retry logic
upload_wal() {
    local attempt=1
    
    while [[ $attempt -le $MAX_RETRIES ]]; do
        log "Upload attempt $attempt of $MAX_RETRIES..."
        
        if aws s3 cp "$WAL_FILE_PATH" "s3://${S3_BUCKET}/${S3_KEY}" \
            --region "$AWS_REGION" \
            --metadata "sha256=${CHECKSUM},archived-at=${TIMESTAMP}" \
            --storage-class STANDARD_IA \
            2>> "$LOG_FILE"; then
            
            log "Successfully archived: $WAL_FILE_NAME -> s3://${S3_BUCKET}/${S3_KEY}"
            
            # Verify upload by checking object exists
            if aws s3api head-object \
                --bucket "$S3_BUCKET" \
                --key "$S3_KEY" \
                --region "$AWS_REGION" \
                2>/dev/null; then
                log "Verified upload: $S3_KEY"
                return 0
            else
                log "WARNING: Upload succeeded but verification failed"
            fi
        fi
        
        log "Upload failed, waiting ${RETRY_DELAY}s before retry..."
        sleep $RETRY_DELAY
        ((attempt++))
    done
    
    log "ERROR: Failed to archive $WAL_FILE_NAME after $MAX_RETRIES attempts"
    return 1
}

# Execute upload
if upload_wal; then
    # Optional: Clean up old local WAL files if using pg_wal cleanup
    # This is handled by PostgreSQL's archive_cleanup_command
    exit 0
else
    exit 1
fi
