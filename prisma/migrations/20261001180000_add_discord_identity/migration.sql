ALTER TABLE "User"
ADD COLUMN "discord_user_id" TEXT,
ADD COLUMN "discord_username" TEXT,
ADD COLUMN "discord_display_name" TEXT,
ADD COLUMN "discord_avatar_url" TEXT,
ADD COLUMN "discord_connected_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_discord_user_id_key" ON "User"("discord_user_id");
