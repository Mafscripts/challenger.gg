CREATE TABLE "BanAppeal" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'awaiting_ceo',
  "ban_reason" TEXT NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanAppeal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BanAppealMessage" (
  "id" TEXT NOT NULL,
  "appeal_id" TEXT NOT NULL,
  "sender_id" TEXT NOT NULL,
  "sender_role" TEXT NOT NULL,
  "sender_name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BanAppealMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BanAppeal_user_id_key" ON "BanAppeal"("user_id");
CREATE INDEX "BanAppeal_updated_date_id_idx" ON "BanAppeal"("updated_date", "id");
CREATE INDEX "BanAppeal_status_updated_date_idx" ON "BanAppeal"("status", "updated_date");
CREATE UNIQUE INDEX "BanAppealMessage_sender_id_request_id_key" ON "BanAppealMessage"("sender_id", "request_id");
CREATE INDEX "BanAppealMessage_appeal_id_created_date_id_idx" ON "BanAppealMessage"("appeal_id", "created_date", "id");
ALTER TABLE "BanAppeal" ADD CONSTRAINT "BanAppeal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanAppealMessage" ADD CONSTRAINT "BanAppealMessage_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "BanAppeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
