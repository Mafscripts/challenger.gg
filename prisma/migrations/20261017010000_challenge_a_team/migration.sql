CREATE TABLE "ChallengeMatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX "ChallengeMatch_status_created_date_idx" ON "ChallengeMatch"("status", "created_date");
CREATE INDEX "ChallengeMatch_metadata_idx" ON "ChallengeMatch" USING GIN ("metadata");
CREATE TABLE "ChallengeStanding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "xp" INTEGER NOT NULL DEFAULT 0 CHECK ("xp" >= 0),
  "wins" INTEGER NOT NULL DEFAULT 0 CHECK ("wins" >= 0),
  "losses" INTEGER NOT NULL DEFAULT 0 CHECK ("losses" >= 0),
  "updated_date" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ChallengeStanding_kind_subject_id_key" ON "ChallengeStanding"("kind", "subject_id");
CREATE INDEX "ChallengeStanding_kind_xp_idx" ON "ChallengeStanding"("kind", "xp");
