CREATE TABLE "PartyRoom" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "PartyRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartyRoom_owner_id_status_idx" ON "PartyRoom"("owner_id", "status");
CREATE INDEX "PartyRoom_status_updated_date_idx" ON "PartyRoom"("status", "updated_date");
