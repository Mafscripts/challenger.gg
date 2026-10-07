CREATE TABLE "RankVerification" (
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "attempts" JSONB NOT NULL DEFAULT '[]',
    "last_submitted_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "review_reason" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RankVerification_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "RankVerification_status_updated_date_idx" ON "RankVerification"("status", "updated_date");
