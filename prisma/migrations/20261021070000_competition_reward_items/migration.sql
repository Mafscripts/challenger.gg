CREATE TABLE "CompetitionRewardSettings" (id TEXT PRIMARY KEY DEFAULT 'default', metadata JSONB NOT NULL DEFAULT '{}');
CREATE TABLE "CompetitionRewardGrant" (id TEXT PRIMARY KEY, grant_key TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, source_key TEXT NOT NULL, created_date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, revealed_at TIMESTAMP(3), metadata JSONB NOT NULL DEFAULT '{}');
CREATE INDEX "CompetitionRewardGrant_user_id_revealed_at_created_date_idx" ON "CompetitionRewardGrant" (user_id, revealed_at, created_date);
CREATE INDEX "CompetitionRewardGrant_source_key_idx" ON "CompetitionRewardGrant" (source_key);
CREATE TABLE "CompetitionRewardSeason" (id TEXT PRIMARY KEY, starts_at TIMESTAMP(3) NOT NULL, ends_at TIMESTAMP(3) NOT NULL, status TEXT NOT NULL DEFAULT 'open', metadata JSONB NOT NULL DEFAULT '{}');
CREATE INDEX "CompetitionRewardSeason_status_ends_at_idx" ON "CompetitionRewardSeason" (status, ends_at);
CREATE TABLE "CompetitionRewardCampaign" (id TEXT PRIMARY KEY, created_date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, starts_at TIMESTAMP(3) NOT NULL, ends_at TIMESTAMP(3) NOT NULL, active BOOLEAN NOT NULL DEFAULT true, metadata JSONB NOT NULL DEFAULT '{}');
CREATE INDEX "CompetitionRewardCampaign_active_ends_at_idx" ON "CompetitionRewardCampaign" (active, ends_at);
-- No reward items are seeded. Administrators supply their own artwork and reward pools.
INSERT INTO "CompetitionRewardSettings" (id, metadata) VALUES ('default', '{"enabled":false,"standard_fee":10,"premium_fee":5,"minimum_fee":0,"tournament_drop_chance":0}');

-- Reward standings read only completed result ledgers, never room chat or evidence.
CREATE INDEX IF NOT EXISTS "RankedMatch_reward_completed_updated_idx" ON "RankedMatch" (updated_date) WHERE metadata->>'status' = 'completed';
CREATE INDEX IF NOT EXISTS "Wager_reward_completed_updated_idx" ON "Wager" (updated_date) WHERE metadata->>'status' = 'completed';
CREATE INDEX IF NOT EXISTS "TournamentMatch_reward_completed_updated_idx" ON "TournamentMatch" (updated_date) WHERE metadata->>'status' = 'completed';
CREATE INDEX IF NOT EXISTS "ChallengeMatch_reward_completed_updated_idx" ON "ChallengeMatch" (updated_date) WHERE status = 'completed';
