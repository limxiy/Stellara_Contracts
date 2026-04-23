import { Module } from '@nestjs/common';
import { ReputationSnapshotService } from './reputation-snapshot.service';
import { ReputationSnapshotController } from './reputation-snapshot.controller';
import { SnapshotComparisonService } from './services/snapshot-comparison.service';
import { PrismaService } from '../../prisma.service';
import { ReputationModule } from '../reputation.module';

@Module({
  imports: [ReputationModule],
  controllers: [ReputationSnapshotController],
  providers: [
    ReputationSnapshotService,
    SnapshotComparisonService,
    PrismaService,
  ],
  exports: [
    ReputationSnapshotService,
    SnapshotComparisonService,
  ],
})
export class ReputationSnapshotModule {}
