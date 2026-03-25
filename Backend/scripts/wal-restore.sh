#!/bin/bash
# =============================================================================
# WAL Restore Script for PostgreSQL
# Retrieves WAL files from AWS S3 for Point-in-Time Recovery (PITR)
# =============================================================================

set -euo pipefail

# Configuration
S3_BUCKET="${WAL_ARCHIVE_BUCKET:-stellara-wal-archives}"
S3_PREFIX="${WAL_ARCHIVE_PREFIX:-wal}"
AWS_REGION="${AWS_REGION:-us-east-1}"
MAX_RETRIES=3
RETRY_DELAY=5

# Arguments from PostgreSQL
DESTINATION_PATH="$1"
WAL_FILE_NAME="$2"

# Logging
LOG_FILE="/var/log/postgresql/wal-restore.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

log "Starting WAL restore: $WAL_FILE_NAME -> $DESTINATION_PATH"

# Validate input
if [[ -z "$DESTINATION_PATH" || -z "$WAL_FILE_NAME" ]]; then
    log "ERROR: Missing arguments. Usage: wal-restore.sh <destination> <filename>"
    exit 1
fi

# Create destination directory if needed
mkdir -p "$(dirname "$DESTINATION_PATH")"

# Try to find WAL file in S3 (search through date prefixes)
# PostgreSQL WAL filenames contain timeline and LSN info
# Format: 000000010000000000000001

restore_wal() {
    local attempt=1
    local temp_file="/tmp/${WAL_FILE_NAME}.download"
    
    # Search for the WAL file in S3 (it could be in any date folder)
    log "Searching for $WAL_FILE_NAME in S3..."
    
    S3_KEY=$(aws s3api list-objects-v2 \
        --bucket "$S3_BUCKET" \
        --prefix "${S3_PREFIX}/" \
        --query "Contents[?contains(Key, '${WAL_FILE_NAME}')].Key" \
        --output text \
        --region "$AWS_REGION" 2>/dev/null | head -1)
    
    if [[ -z "$S3_KEY" || "$S3_KEY" == "None" ]]; then
        log "ERROR: WAL file not found in S3: $WAL_FILE_NAME"
        return 1
    fi
    
    log "Found WAL file at: $S3_KEY"
    
    while [[ $attempt -le $MAX_RETRIES ]]; do
        log "Download attempt $attempt of $MAX_RETRIES..."
        
        if aws s3 cp "s3://${S3_BUCKET}/${S3_KEY}" "$temp_file" \
            --region "$AWS_REGION" \
            2>> "$LOG_FILE"; then
            
            # Verify checksum if available
            S3_METADATA=$(aws s3api head-object \
                --bucket "$S3_BUCKET" \
                --key "$S3_KEY" \
                --region "$AWS_REGION" \
                2>/dev/null)
            
            EXPECTED_CHECKSUM=$(echo "$S3_METADATA" | grep -o '"sha256": "[^"]*"' | cut -d'"' -f4)
            
            if [[ -n "$EXPECTED_CHECKSUM" ]]; then
                ACTUAL_CHECKSUM=$(sha256sum "$temp_file" | cut -d' ' -f1)
                if [[ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]]; then
                    log "ERROR: Checksum mismatch! Expected: $EXPECTED_CHECKSUM, Got: $ACTUAL_CHECKSUM"
                    rm -f "$temp_file"
                    return 1
                fi
                log "Checksum verified: $ACTUAL_CHECKSUM"
            fi
            
            # Move to final destination
            mv "$temp_file" "$DESTINATION_PATH"
            chmod 600 "$DESTINATION_PATH"
            
            log "Successfully restored: $WAL_FILE_NAME"
            return 0
        fi
        
        log "Download failed, waiting ${RETRY_DELAY}s before retry..."
        sleep $RETRY_DELAY
        ((attempt++))
    done
    
    log "ERROR: Failed to restore $WAL_FILE_NAME after $MAX_RETRIES attempts"
    rm -f "$temp_file"
    return 1
}

# Execute restore
if restore_wal; then
    exit 0
else
    exit 1
fi
