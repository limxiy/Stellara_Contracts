-- Add contract milestone mapping for precise event-to-row updates
ALTER TABLE "milestones"
ADD COLUMN "contract_milestone_id" TEXT;

-- Backfill existing rows with local id as a safe placeholder mapping
UPDATE "milestones"
SET "contract_milestone_id" = "id"
WHERE "contract_milestone_id" IS NULL;

CREATE UNIQUE INDEX "milestones_project_id_contract_milestone_id_key"
ON "milestones"("project_id", "contract_milestone_id");

CREATE INDEX "milestones_project_id_contract_milestone_id_idx"
ON "milestones"("project_id", "contract_milestone_id");
