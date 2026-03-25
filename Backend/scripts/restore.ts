/**
 * CLI script to restore from backup
 * Usage: npm run backup:restore <backup-id> [target-time]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RestoreService } from '../src/backup/restore.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const restoreService = app.get(RestoreService);

  const backupId = process.argv[2];
  const targetTimeStr = process.argv[3];

  if (!backupId) {
    console.error('Usage: npm run backup:restore <backup-id> [target-time]');
    console.error('Example: npm run backup:restore postgresql/2024/03/25/backup.sql');
    console.error('Example with PITR: npm run backup:restore postgresql/2024/03/25/backup.sql "2024-03-25 14:30:00"');
    process.exit(1);
  }

  console.log('WARNING: This will restore the database from backup.');
  console.log('Current database data will be lost!');
  console.log(`Backup: ${backupId}`);

  if (targetTimeStr) {
    console.log(`Target Time (PITR): ${targetTimeStr}`);
  }

  console.log('\nTo proceed, type "RESTORE" and press Enter:');

  const stdin = process.stdin;
  stdin.setEncoding('utf-8');

  stdin.on('data', async (data) => {
    const input = data.toString().trim();

    if (input !== 'RESTORE') {
      console.log('Restore cancelled.');
      process.exit(0);
    }

    try {
      // Validate backup first
      console.log('\nValidating backup...');
      const validation = await restoreService.validateBackup(backupId);

      if (!validation.valid) {
        console.error('Backup validation failed:', validation.message);
        process.exit(1);
      }

      console.log('Backup validation: PASSED');
      console.log(`Backup size: ${validation.size ? formatBytes(validation.size) : 'Unknown'}`);

      // Estimate recovery time
      const estimate = await restoreService.estimateRecoveryTime(backupId);
      console.log(`\nEstimated recovery time: ${estimate.estimatedMinutes} minutes`);
      console.log('Factors:');
      estimate.factors.forEach(f => console.log(`  - ${f}`));

      // Start restore
      console.log('\nStarting restore...');
      const startTime = Date.now();

      let job;
      if (targetTimeStr) {
        const targetTime = new Date(targetTimeStr);
        job = await restoreService.pointInTimeRecovery(backupId, targetTime);
      } else {
        job = await restoreService.restoreFromBackup(backupId);
      }

      console.log(`Restore job started: ${job.id}`);
      console.log(`Status: ${job.status}`);

      // Poll for completion
      const pollInterval = setInterval(async () => {
        const status = restoreService.getRestoreStatus(job.id);

        if (status?.status === 'COMPLETED') {
          clearInterval(pollInterval);
          const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
          console.log(`\nRestore completed successfully in ${duration} minutes!`);
          console.log(`Restored to: ${status.restoredToTime}`);
          await app.close();
          process.exit(0);
        } else if (status?.status === 'FAILED') {
          clearInterval(pollInterval);
          console.error('\nRestore failed:', status.errorMessage);
          await app.close();
          process.exit(1);
        } else {
          console.log(`Status: ${status?.status}...`);
        }
      }, 10000);

    } catch (error) {
      console.error('Restore failed:', error);
      await app.close();
      process.exit(1);
    }
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main();
