CREATE TABLE "DiscordGiveaway" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "channel_id" TEXT,
    "message_id" TEXT,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "winner_count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordGiveaway_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordGiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveaway_id" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordGiveawayEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordGiveawayEntry_giveaway_id_discord_user_id_key" ON "DiscordGiveawayEntry"("giveaway_id", "discord_user_id");
