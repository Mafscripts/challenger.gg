CREATE TABLE "FreeTrialProgram" (
  "key" TEXT NOT NULL DEFAULT 'animated_name_effects',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "starts_date" TIMESTAMP(3),
  "ends_date" TIMESTAMP(3),
  "stopped_date" TIMESTAMP(3),
  "updated_by" TEXT,
  "updated_by_name" TEXT,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreeTrialProgram_pkey" PRIMARY KEY ("key")
);
