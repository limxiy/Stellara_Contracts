-- CreateTable
CREATE TABLE "event_replays" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "start_ledger_seq" INTEGER NOT NULL,
    "end_ledger_seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "conflict_resolution" TEXT NOT NULL DEFAULT 'skip',
    "processed_events" INTEGER NOT NULL DEFAULT 0,
    "total_events" INTEGER NOT NULL DEFAULT 0,
    "skipped_events" INTEGER NOT NULL DEFAULT 0,
    "error_events" INTEGER NOT NULL DEFAULT 0,
    "current_ledger_seq" INTEGER,
    "errors" JSONB,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_replays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_replays_network_status_idx" ON "event_replays"("network", "status");
-- CreateIndex
CREATE INDEX "event_replays_created_at_idx" ON "event_replays"("created_at");

-- CreateTable
CREATE TABLE "replay_events" (
    "id" TEXT NOT NULL,
    "replay_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "ledger_seq" INTEGER NOT NULL,
    "contract_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replay_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "replay_events_replay_id_status_idx" ON "replay_events"("replay_id", "status");
-- CreateIndex
CREATE INDEX "replay_events_replay_id_ledger_seq_idx" ON "replay_events"("replay_id", "ledger_seq");
-- CreateIndex
CREATE INDEX "replay_events_event_id_idx" ON "replay_events"("event_id");

-- AddForeignKey
ALTER TABLE "replay_events" ADD CONSTRAINT "replay_events_replay_id_fkey" FOREIGN KEY ("replay_id") REFERENCES "event_replays"("id") ON DELETE CASCADE ON UPDATE CASCADE;
