-- CreateTable
CREATE TABLE "indexer_states" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "last_ledger_seq" INTEGER NOT NULL,
    "last_ledger_hash" TEXT,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "reset_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "indexer_states_network_key" ON "indexer_states"("network");
