CREATE TABLE "ReferralProgram" (
  "key" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "max_rewards" INTEGER NOT NULL DEFAULT 250,
  "reward_credits" INTEGER NOT NULL DEFAULT 5,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralReward" (
  "id" TEXT NOT NULL,
  "referred_user_id" TEXT NOT NULL,
  "referrer_user_id" TEXT NOT NULL,
  "referral_code_id" TEXT NOT NULL,
  "credits" INTEGER NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_user_id_key" ON "ReferralCode"("user_id");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE UNIQUE INDEX "ReferralReward_referred_user_id_key" ON "ReferralReward"("referred_user_id");
CREATE INDEX "ReferralReward_referrer_user_id_idx" ON "ReferralReward"("referrer_user_id");
CREATE INDEX "ReferralReward_referral_code_id_idx" ON "ReferralReward"("referral_code_id");
