CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "password_hash" TEXT,
  "username" TEXT UNIQUE,
  "handle" TEXT UNIQUE,
  "display_name" TEXT,
  "full_name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "admin_role" TEXT,
  "is_admin" BOOLEAN NOT NULL DEFAULT false,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "wallet_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lifetime_earnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trophies" INTEGER NOT NULL DEFAULT 0,
  "rank" TEXT DEFAULT 'novice',
  "division" TEXT DEFAULT 'I',
  "xp_level" INTEGER NOT NULL DEFAULT 1,
  "wager_wins" INTEGER NOT NULL DEFAULT 0,
  "wager_losses" INTEGER NOT NULL DEFAULT 0,
  "current_win_streak" INTEGER NOT NULL DEFAULT 0,
  "total_wager_earnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "biggest_wager_win" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tournament_wins" INTEGER NOT NULL DEFAULT 0,
  "region" TEXT,
  "is_premium" BOOLEAN NOT NULL DEFAULT false,
  "premium_expires" TIMESTAMP(3),
  "is_banned" BOOLEAN NOT NULL DEFAULT false,
  "ban_reason" TEXT,
  "account_created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "power" INTEGER NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RankTier" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "division" TEXT,
  "min_elo" INTEGER NOT NULL,
  "max_elo" INTEGER,
  "color" TEXT NOT NULL,
  "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
  table_name TEXT;
  table_names TEXT[] := ARRAY[
    'Session','UserSettings','Notification','PlayerProfile',
    'AdminAction','AdminAlert','AuditLog','SystemLog','SupportTicket','Ticket','BanRecord','Ban',
    'Wallet','WalletTransaction','WithdrawalRequest','DepositRequest','CreditPurchase','CreditTransaction',
    'RankedStats','RankedMatch','RankedReward','Season',
    'Wager','WagerParticipant','WagerDispute','Dispute','WagerMatch',
    'Tournament','TournamentParticipant','TournamentMatch','TournamentBracket','TournamentWin',
    'MarketplaceItem','Purchase','Inventory','UserInventory','TradeOffer','PremiumMembership','KnifeUnlock',
    'Message','ChatMessage','Conversation','FriendRequest','Friendship','BlockedUser',
    'Team','TeamMember','TeamInvite','TeamMatch',
    'RankedLeaderboard','XPLeaderboard','WagerLeaderboard','TournamentLeaderboard','Leaderboard',
    'EightsLobby','EightsLobbyParticipant','EightsStats',
    'XPStats','MatchHistory','Achievement','Achievements','Statistic','Statistics','ActivityFeed',
    'MapPool','MapVeto'
  ];
BEGIN
  FOREACH table_name IN ARRAY table_names LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        "id" TEXT PRIMARY KEY,
        "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "metadata" JSONB NOT NULL DEFAULT ''{}''::jsonb
      )',
      table_name
    );
  END LOOP;
END $$;
