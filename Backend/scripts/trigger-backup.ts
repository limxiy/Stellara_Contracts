/**
 * CLI script to trigger a manual backup
 * Usage: npm run backup:trigger [full|incremental] [description]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BackupService } from '../src/backup/backup.service';
import { BackupType } from '../src/backup/dto/backup-config.dto';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const backupService = app.get(BackupService);

  const type = (process.argv[2] as BackupType) || BackupType.FULL;
  const description = process.argv[3] || `Manual backup triggered at ${new Date().toISOString()}`;

  console.log(`Triggering ${type} backup...`);
  console.log(`Description: ${description}`);

  try {
    const backup = await backupService.createBackup({ type, description });
    console.log('Backup initiated successfully:');
    console.log(JSON.stringify(backup, null, 2));
  } catch (error) {
    console.error('Failed to trigger backup:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main();
