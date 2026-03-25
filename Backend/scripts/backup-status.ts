/**
 * CLI script to check backup status
 * Usage: npm run backup:status
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackupService } from '../src/backup/backup.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const backupService = app.get(BackupService);

  try {
    const status = backupService.getBackupStatus();

    console.log('=== Backup Status ===\n');
    console.log(`Total Backups: ${status.totalBackups}`);
    console.log(`Last Backup: ${status.lastBackupAt ? status.lastBackupAt.toISOString() : 'Never'}`);
    console.log(`Last Backup Status: ${status.lastBackupStatus || 'N/A'}`);
    console.log(`Last Backup Size: ${status.lastBackupSize ? formatBytes(status.lastBackupSize) : 'N/A'}`);
    console.log(`Next Scheduled Backup: ${status.nextScheduledBackup ? status.nextScheduledBackup.toISOString() : 'N/A'}`);
    console.log(`Storage Used: ${formatBytes(status.storageUsedBytes)}`);
    console.log('\nRetention Policy:');
    console.log(`  Daily: ${status.retentionPolicy.daily} days`);
    console.log(`  Weekly: ${status.retentionPolicy.weekly} weeks`);
    console.log(`  Monthly: ${status.retentionPolicy.monthly} months`);

    console.log('\n=== Recent Backups ===');
    const backups = backupService.getAllBackups().slice(0, 5);
    backups.forEach((backup, index) => {
      console.log(`\n${index + 1}. ${backup.id}`);
      console.log(`   Type: ${backup.type}`);
      console.log(`   Status: ${backup.status}`);
      console.log(`   Started: ${backup.startedAt.toISOString()}`);
      console.log(`   Size: ${backup.sizeBytes ? formatBytes(backup.sizeBytes) : 'N/A'}`);
      console.log(`   S3 Location: ${backup.s3Location || 'N/A'}`);
    });
  } catch (error) {
    console.error('Failed to get backup status:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main();
