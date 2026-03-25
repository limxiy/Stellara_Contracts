/**
 * CLI script to verify a backup
 * Usage: npm run backup:verify <backup-id>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackupService } from '../src/backup/backup.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const backupService = app.get(BackupService);

  const backupId = process.argv[2];

  if (!backupId) {
    console.error('Usage: npm run backup:verify <backup-id>');
    console.error('Use "npm run backup:status" to list available backups');
    process.exit(1);
  }

  console.log(`Verifying backup: ${backupId}`);

  try {
    const result = await backupService.verifyBackup(backupId);
    if (result) {
      console.log('Backup verification: PASSED');
    } else {
      console.log('Backup verification: FAILED');
      process.exit(1);
    }
  } catch (error) {
    console.error('Backup verification failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
