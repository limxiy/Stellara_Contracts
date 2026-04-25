import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { IndexerService } from './services/indexer.service';
import { LedgerTrackerService } from './services/ledger-tracker.service';
import { EventHandlerService } from './services/event-handler.service';
import { ReorgHandlerService } from './services/reorg-handler.service';
import { IndexerStateService } from './services/indexer-state.service';
import { ContractRegistryService } from './services/contract-registry.service';
import { AbiParserService } from './services/abi-parser.service';
import { EventReplayService } from './services/event-replay.service';
import { ProjectMetadataService } from './services/project-metadata.service';
import { ReorgMonitoringController } from './controllers/reorg-monitoring.controller';
import { IndexerControlController } from './controllers/indexer-control.controller';
import { ContractRegistryController } from './controllers/contract-registry.controller';
import { EventReplayController } from './controllers/event-replay.controller';
import { DatabaseModule } from '../database.module';
import { NotificationModule } from '../notification/notification.module';
import { ReputationModule } from '../reputation/reputation.module';
import { MetricsModule } from '../metrics/metrics.module';
import stellarConfig, { indexerConfig } from '../config/stellar.config';

/**
 * Blockchain Indexer Module
 *
 * This module provides background indexing of Stellar blockchain events
 * to synchronize on-chain state with the local database.
 */
@Module({
  imports: [
    // Enable scheduled tasks
    ScheduleModule.forRoot(),
    // Database access
    DatabaseModule,
    // Notification service for event-driven notifications
    NotificationModule,
    // Reputation service for trust score updates
    ReputationModule,
    // Metrics collection
    MetricsModule,
    // Configuration
    ConfigModule.forFeature(stellarConfig),
    ConfigModule.forFeature(indexerConfig),
  ],
  controllers: [
    ReorgMonitoringController,
    IndexerControlController,
    ContractRegistryController,
    EventReplayController,
  ],
  providers: [
    // Core indexer service
    IndexerService,
    // Ledger state tracking
    LedgerTrackerService,
    // Event processing
    EventHandlerService,
    // Reorg handling
    ReorgHandlerService,
    // State management
    IndexerStateService,
    // Contract registry and ABI management
    ContractRegistryService,
    AbiParserService,
    // Event replay functionality
    EventReplayService,
    ProjectMetadataService,
  ],
  exports: [
    // Export services for potential external use
    IndexerService,
    LedgerTrackerService,
    EventHandlerService,
    IndexerStateService,
    ContractRegistryService,
    AbiParserService,
    EventReplayService,
    ProjectMetadataService,
  ],
})
export class IndexerModule { }
