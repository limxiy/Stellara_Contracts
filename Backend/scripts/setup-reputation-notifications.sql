-- Setup script for reputation notification system
-- Run this after updating the Prisma schema

-- Insert default reputation tips
INSERT INTO "reputation_tips" ("id", "category", "title", "description", "impact", "difficulty", "is_active", "created_at", "updated_at") VALUES
('tip-transactions', 'transactions', 'Complete Successful Transactions', 'Successfully completing transactions on time significantly boosts your reliability score.', 'HIGH', 'MEDIUM', true, NOW(), NOW()),
('tip-community', 'community', 'Provide Helpful Reviews', 'Leave thoughtful reviews and comments on projects to increase your community feedback score.', 'MEDIUM', 'EASY', true, NOW(), NOW()),
('tip-projects', 'projects', 'Complete Project Milestones', 'Meeting project milestones on schedule demonstrates reliability and expertise.', 'HIGH', 'HARD', true, NOW(), NOW()),
('tip-social', 'social', 'Engage with the Community', 'Participate in discussions and help other users to build your social reputation.', 'MEDIUM', 'EASY', true, NOW(), NOW()),
('tip-expertise', 'expertise', 'Get Expert Endorsements', 'Receive endorsements from verified experts in your field to boost your expertise score.', 'HIGH', 'MEDIUM', true, NOW(), NOW()),
('tip-reliability', 'reliability', 'Maintain Consistent Activity', 'Regular engagement prevents reputation decay and shows long-term commitment.', 'MEDIUM', 'EASY', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "impact" = EXCLUDED."impact",
  "difficulty" = EXCLUDED."difficulty",
  "updated_at" = NOW();

-- Update existing notification settings to include new reputation fields
UPDATE "notification_settings" SET
  "notify_reputation_changes" = COALESCE("notify_reputation_changes", true),
  "notify_level_ups" = COALESCE("notify_level_ups", true),
  "notify_weekly_summary" = COALESCE("notify_weekly_summary", true),
  "reputation_change_threshold" = COALESCE("reputation_change_threshold", 50),
  "updated_at" = NOW()
WHERE "notify_reputation_changes" IS NULL 
   OR "notify_level_ups" IS NULL 
   OR "notify_weekly_summary" IS NULL 
   OR "reputation_change_threshold" IS NULL;

-- Create default notification settings for users who don't have any
INSERT INTO "notification_settings" ("id", "user_id", "email_enabled", "push_enabled", "notify_contributions", "notify_milestones", "notify_deadlines", "notify_reputation_changes", "notify_level_ups", "notify_weekly_summary", "reputation_change_threshold", "created_at", "updated_at")
SELECT 
  gen_random_uuid(),
  "id",
  true,
  false,
  true,
  true,
  true,
  true,
  true,
  true,
  50,
  NOW(),
  NOW()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "notification_settings" ns WHERE ns."user_id" = u."id"
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_weekly_summaries_user_week" ON "weekly_reputation_summaries"("user_id", "week_start_date");
CREATE INDEX IF NOT EXISTS "idx_reputation_tips_active" ON "reputation_tips"("is_active");
CREATE INDEX IF NOT EXISTS "idx_reputation_tips_category" ON "reputation_tips"("category");

COMMENT ON TABLE "reputation_tips" IS 'Stores improvement tips for reputation building';
COMMENT ON TABLE "weekly_reputation_summaries" IS 'Weekly reputation summaries for users';
COMMENT ON COLUMN "notification_settings"."notify_reputation_changes" IS 'Whether to send notifications for significant reputation score changes';
COMMENT ON COLUMN "notification_settings"."notify_level_ups" IS 'Whether to send notifications when user levels up';
COMMENT ON COLUMN "notification_settings"."notify_weekly_summary" IS 'Whether to send weekly reputation summary emails';
COMMENT ON COLUMN "notification_settings"."reputation_change_threshold" IS 'Minimum score change to trigger notification';
