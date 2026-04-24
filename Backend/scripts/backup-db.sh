#!/bin/bash

# Database Backup Script for Stellara Contracts
# Usage: ./backup-db.sh [backup_dir]

set -e

BACKUP_DIR=${1:-"./backups"}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/stellara_db_backup_${TIMESTAMP}.sql"
RETENTION_DAYS=30

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

mkdir -p "${BACKUP_DIR}"

echo "Starting database backup at $(date)..."

# Ensure we have the necessary variables
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL is not set."
    exit 1
fi

# Extract DB connection info from DATABASE_URL if needed, or use pg_dump directly with URL
# pg_dump can take the connection string as an argument
pg_dump "${DATABASE_URL}" > "${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_FILE}"

# Compress the backup
gzip "${BACKUP_FILE}"
echo "Backup compressed: ${BACKUP_FILE}.gz"

# Encrypt the backup (optional, if GPG_RECIPIENT is set)
if [ ! -z "$GPG_RECIPIENT" ]; then
    gpg --encrypt --recipient "$GPG_RECIPIENT" "${BACKUP_FILE}.gz"
    rm "${BACKUP_FILE}.gz"
    echo "Backup encrypted: ${BACKUP_FILE}.gz.gpg"
fi

# Off-site storage (S3)
if [ ! -z "$S3_BACKUP_BUCKET" ]; then
    echo "Uploading to S3..."
    aws s3 cp "${BACKUP_FILE}.gz" "s3://${S3_BACKUP_BUCKET}/backups/$(basename ${BACKUP_FILE}.gz)"
    echo "Upload complete."
fi

# Cleanup old backups
echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "stellara_db_backup_*" -mtime +${RETENTION_DAYS} -delete

echo "Backup process finished at $(date)."
