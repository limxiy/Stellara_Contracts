-- CreateTable
CREATE TABLE "contract_registry" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "network" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "source_code_url" TEXT,
    "documentation_url" TEXT,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_registry_contract_id_key" ON "contract_registry"("contract_id");

-- CreateTable
CREATE TABLE "contract_abis" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "abi_json" JSONB NOT NULL,
    "abi_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_abis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_abis_contract_id_version_key" ON "contract_abis"("contract_id", "version");

-- AddForeignKey
ALTER TABLE "contract_abis" ADD CONSTRAINT "contract_abis_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract_registry"("contract_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "contract_events" (
    "id" TEXT NOT NULL,
    "abi_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_topic" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_events_abi_id_event_name_key" ON "contract_events"("abi_id", "event_name");
-- CreateIndex
CREATE UNIQUE INDEX "contract_events_contract_id_event_topic_key" ON "contract_events"("contract_id", "event_topic");

-- AddForeignKey
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_abi_id_fkey" FOREIGN KEY ("abi_id") REFERENCES "contract_abis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract_registry"("contract_id") ON DELETE CASCADE ON UPDATE CASCADE;
