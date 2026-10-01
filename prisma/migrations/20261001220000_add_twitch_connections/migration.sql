ALTER TABLE "User"
ADD COLUMN "twitch_user_id" TEXT,
ADD COLUMN "twitch_login" TEXT,
ADD COLUMN "twitch_display_name" TEXT,
ADD COLUMN "twitch_avatar_url" TEXT,
ADD COLUMN "twitch_connected_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_twitch_user_id_key" ON "User"("twitch_user_id");
