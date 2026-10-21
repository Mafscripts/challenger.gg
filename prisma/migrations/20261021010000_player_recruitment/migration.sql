CREATE TABLE "RecruitmentPost" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "kind" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "rank" TEXT NOT NULL DEFAULT 'any',
    "availability" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "moderation_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecruitmentPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecruitmentPost_status_created_date_id_idx" ON "RecruitmentPost"("status", "created_date" DESC, "id" DESC);
CREATE INDEX "RecruitmentPost_status_competition_game_id_created_date_id_idx" ON "RecruitmentPost"("status", "competition", "game_id", "created_date" DESC, "id" DESC);
CREATE INDEX "RecruitmentPost_status_expires_at_idx" ON "RecruitmentPost"("status", "expires_at");
CREATE INDEX "RecruitmentPost_user_id_created_date_idx" ON "RecruitmentPost"("user_id", "created_date" DESC);
ALTER TABLE "RecruitmentPost" ADD CONSTRAINT "RecruitmentPost_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recruitment loads only the visible page's roster / membership summaries.
CREATE INDEX IF NOT EXISTS "TeamMember_recruitment_team_active_idx" ON "TeamMember" ((metadata ->> 'team_id')) WHERE COALESCE(metadata ->> 'is_active', 'true') <> 'false';
CREATE INDEX IF NOT EXISTS "TeamMember_recruitment_user_active_idx" ON "TeamMember" ((metadata ->> 'user_id')) WHERE COALESCE(metadata ->> 'is_active', 'true') <> 'false';
