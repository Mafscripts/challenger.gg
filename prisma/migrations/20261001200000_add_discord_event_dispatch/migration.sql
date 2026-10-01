CREATE TABLE "DiscordEventDispatch" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DiscordEventDispatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordEventDispatch_event_key_key" ON "DiscordEventDispatch"("event_key");
