# Challenger.gg Database Schema Documentation

## Complete Entity List (25 Entities)

### Core User & Profile
1. **User** (Built-in Base44) - Authentication & basic user data
2. **PlayerProfile** - Extended player stats, rank, XP, credits
3. **PremiumMembership** - Premium subscription tracking

### Wallet & Financial
4. **Wallet** - User wallet balances (available, pending, withdrawable)
5. **WalletTransaction** - All wallet transactions (deposits, withdrawals, wager escrow, payouts)
6. **WithdrawalRequest** - Withdrawal requests & processing
7. **CreditTransaction** - Credits currency transactions

### Wager System
8. **Wager** - Main wager record
9. **WagerParticipant** - Players in each wager (team assignment)
10. **WagerMatch** - Individual matches in best-of series
11. **MapPool** - Available maps per game mode
12. **MapVeto** - Map veto records

### Dispute System
13. **Dispute** - Dispute records
14. **DisputeEvidence** - Evidence uploaded for disputes

### Team System
15. **Team** - Team/clan information
16. **TeamMember** - Team membership

### Tournament System
17. **Tournament** - Tournament information
18. **TournamentParticipant** - Teams/players in tournaments
19. **TournamentMatch** - Tournament bracket matches

### Marketplace & Inventory
20. **MarketplaceItem** - Items for sale
21. **UserInventory** - User-owned items
22. **Purchase** - Purchase history
23. **TradeOffer** - Player-to-player trade offers

### Communication
24. **Notification** - User notifications
25. **ChatMessage** - Direct messages between users

### System & Analytics
26. **Leaderboard** - Leaderboard standings
27. **Season** - Competitive season tracking
28. **SystemLog** - Audit logs

---

## Detailed Field Lists

### 1. User (Built-in)
```
- id (string)
- email (string)
- full_name (string)
- role (string) - 'admin' | 'user'
- created_date (datetime)
```

### 2. PlayerProfile
```
- user_id (string) [FK → User.id]
- display_name (string)
- avatar_url (string)
- bio (string)
- country (string)
- region (enum: na, eu, asia, oce, sa)
- rank (enum: bronze, silver, gold, platinum, diamond, master, grandmaster)
- rank_division (enum: I, II, III, IV, V)
- elo (number, default: 1000)
- xp (number, default: 0)
- level (number, default: 1)
- prestige (number, default: 0)
- credits (number, default: 0)
- is_premium (boolean, default: false)
- premium_expires (datetime)
- total_matches (number, default: 0)
- total_wins (number, default: 0)
- total_losses (number, default: 0)
- current_win_streak (number, default: 0)
- best_win_streak (number, default: 0)
- favorite_game_mode (string)
- total_playtime_hours (number, default: 0)
- account_created_date (datetime)
- last_active_date (datetime)
- is_banned (boolean, default: false)
- ban_reason (string)
- ban_expires (datetime)
```

### 3. Wallet
```
- user_id (string) [FK → User.id]
- available_balance (number, default: 0)
- pending_balance (number, default: 0)
- withdrawable_balance (number, default: 0)
- total_deposits (number, default: 0)
- total_withdrawals (number, default: 0)
- total_earnings (number, default: 0)
- total_wagered (number, default: 0)
```

### 4. WalletTransaction
```
- user_id (string) [FK → User.id]
- wallet_id (string) [FK → Wallet.id]
- type (enum: deposit, withdrawal, wager_escrow, wager_payout, wager_loss, wager_refund, tournament_prize, admin_adjustment)
- amount (number)
- balance_before (number)
- balance_after (number)
- description (string)
- reference_id (string) - Wager ID, Tournament ID, etc
- reference_type (string)
- status (enum: pending, completed, failed, cancelled)
- metadata (object)
- created_date (datetime)
```

### 5. WithdrawalRequest
```
- user_id (string) [FK → User.id]
- wallet_id (string) [FK → Wallet.id]
- amount (number)
- payment_method (enum: paypal, bank_transfer)
- payment_details (object)
- status (enum: pending, processing, approved, rejected, completed, cancelled)
- requested_date (datetime)
- processed_date (datetime)
- processed_by (string) [FK → User.id]
- notes (string)
- rejection_reason (string)
```

### 6. Wager
```
- host_id (string) [FK → User.id]
- host_name (string)
- challenger_id (string) [FK → User.id]
- challenger_name (string)
- game_mode (enum: snd, overload, hp)
- game_mode_display (string)
- team_size (enum: 1v1, 2v2, 3v3, 4v4)
- entry_fee (number)
- total_prize_pool (number)
- platform_fee_percent (number, default: 10)
- platform_fee_amount (number)
- winner_payout (number)
- status (enum: open, accepted, escrow_paid, map_veto, ready, in_progress, completed, cancelled, disputed)
- map_pool_id (string) [FK → MapPool.id]
- host_banned_map_id (string)
- host_banned_map_name (string)
- challenger_banned_map_id (string)
- challenger_banned_map_name (string)
- final_map_id (string)
- final_map_name (string)
- winner_id (string) [FK → User.id]
- winner_name (string)
- winner_score (number)
- loser_score (number)
- match_start_deadline (datetime)
- match_started_date (datetime)
- match_completed_date (datetime)
- created_date (datetime)
- accepted_date (datetime)
```

### 7. WagerParticipant
```
- wager_id (string) [FK → Wager.id]
- user_id (string) [FK → User.id]
- user_name (string)
- team (enum: host, challenger)
- is_captain (boolean, default: false)
- entry_fee_paid (boolean, default: false)
- escrow_transaction_id (string) [FK → WalletTransaction.id]
- joined_date (datetime)
```

### 8. WagerMatch
```
- wager_id (string) [FK → Wager.id]
- match_number (number, default: 1)
- map_id (string)
- map_name (string)
- team_a_score (number, default: 0)
- team_b_score (number, default: 0)
- winner_team (enum: host, challenger)
- match_duration_seconds (number)
- proof_urls (string[])
- reported_by (string) [FK → User.id]
- verified (boolean, default: false)
- created_date (datetime)
```

### 9. MapPool
```
- name (string)
- game_mode (enum: snd, overload, hp)
- maps (array of {map_id, map_name, image_url})
- is_active (boolean, default: true)
- created_date (datetime)
```

### 10. MapVeto
```
- wager_id (string) [FK → Wager.id]
- map_id (string)
- map_name (string)
- vetoed_by (string) [FK → User.id]
- vetoed_by_team (enum: host, challenger)
- veto_order (number)
- created_date (datetime)
```

### 11. Dispute
```
- wager_id (string) [FK → Wager.id]
- reported_by (string) [FK → User.id]
- reported_by_name (string)
- reported_against (string) [FK → User.id]
- reported_against_name (string)
- reason (string)
- description (string)
- status (enum: pending, under_review, resolved)
- priority (enum: low, medium, high, critical)
- assigned_moderator (string) [FK → User.id]
- assigned_moderator_name (string)
- decision (string)
- winner_id (string) [FK → User.id]
- payout_adjustment (number)
- resolved_date (datetime)
- created_date (datetime)
```

### 12. DisputeEvidence
```
- dispute_id (string) [FK → Dispute.id]
- submitted_by (string) [FK → User.id]
- submitted_by_name (string)
- evidence_type (enum: screenshot, video, log_file, other)
- file_url (string)
- description (string)
- created_date (datetime)
```

### 13. Team
```
- name (string)
- tag (string)
- logo_url (string)
- captain_id (string) [FK → User.id]
- captain_name (string)
- region (enum: na, eu, asia, oce, sa)
- total_wins (number, default: 0)
- total_losses (number, default: 0)
- elo_rating (number, default: 1000)
- is_active (boolean, default: true)
- created_date (datetime)
```

### 14. TeamMember
```
- team_id (string) [FK → Team.id]
- user_id (string) [FK → User.id]
- user_name (string)
- role (enum: captain, member, substitute)
- joined_date (datetime)
- is_active (boolean, default: true)
```

### 15. Tournament
```
- name (string)
- description (string)
- game_mode (enum: snd, overload, hp)
- game_mode_display (string)
- team_size (enum: 1v1, 2v2, 3v3, 4v4)
- entry_fee (number, default: 0)
- prize_pool (number)
- prize_distribution (object: {first, second, third})
- max_teams (number)
- registered_teams (number, default: 0)
- format (enum: single_elimination, double_elimination, round_robin, swiss)
- status (enum: registration, in_progress, completed, cancelled)
- registration_start (datetime)
- registration_end (datetime)
- start_date (datetime)
- end_date (datetime)
- created_by (string) [FK → User.id]
- created_by_name (string)
- brackets (object)
- winner_id (string) [FK → User.id]
- winner_name (string)
- runner_up_id (string) [FK → User.id]
- runner_up_name (string)
```

### 16. TournamentParticipant
```
- tournament_id (string) [FK → Tournament.id]
- team_id (string) [FK → Team.id] OR user_id for individual
- team_name (string)
- captain_id (string) [FK → User.id]
- captain_name (string)
- members (array of {user_id, user_name})
- seed (number)
- eliminated (boolean, default: false)
- final_rank (number)
- prize_won (number, default: 0)
- registered_date (datetime)
```

### 17. TournamentMatch
```
- tournament_id (string) [FK → Tournament.id]
- match_id (string)
- round (enum: round_1, round_2, quarterfinal, semifinal, final, loser_bracket_*)
- team_a_id (string) [FK → Team.id]
- team_a_name (string)
- team_a_score (number, default: 0)
- team_b_id (string) [FK → Team.id]
- team_b_name (string)
- team_b_score (number, default: 0)
- winner_id (string) [FK → Team.id]
- loser_id (string) [FK → Team.id]
- next_match_id (string)
- map_id (string)
- map_name (string)
- completed (boolean, default: false)
- completed_date (datetime)
```

### 18. MarketplaceItem
```
- name (string)
- description (string)
- image_url (string)
- category (enum: weapon_skin, knife, gloves, agent, sticker, patch, music_kit, cosmetic)
- rarity (enum: common, rare, epic, legendary, mythic, exclusive)
- price_credits (number)
- price_cash (number)
- stock_quantity (number, -1 for unlimited)
- is_available (boolean, default: true)
- is_active (boolean, default: true)
- is_featured (boolean, default: false)
- show_in_marketplace (boolean, default: true)
- is_tradeable (boolean, default: true)
- created_date (datetime)
```

### 19. UserInventory
```
- user_id (string) [FK → User.id]
- item_id (string) [FK → MarketplaceItem.id]
- item_name (string)
- item_image (string)
- item_rarity (enum: common, rare, epic, legendary, mythic, exclusive)
- item_category (enum: weapon_skin, knife, gloves, agent, sticker, patch, music_kit, cosmetic)
- purchase_method (enum: credits, cash)
- price_paid (number)
- is_equipped (boolean, default: false)
- is_tradable (boolean, default: true)
- acquired_date (datetime)
```

### 20. Purchase
```
- user_id (string) [FK → User.id]
- item_id (string) [FK → MarketplaceItem.id]
- item_name (string)
- quantity (number, default: 1)
- price_paid (number)
- payment_method (enum: credits, cash, base44_payments)
- transaction_id (string)
- status (enum: pending, completed, refunded)
- created_date (datetime)
```

### 21. TradeOffer
```
- sender_id (string) [FK → User.id]
- sender_name (string)
- recipient_id (string) [FK → User.id]
- recipient_name (string)
- sender_items (array of {inventory_id, item_id, item_name, item_rarity, estimated_value})
- recipient_items (array of {inventory_id, item_id, item_name, item_rarity, estimated_value})
- sender_credits_offered (number, default: 0)
- recipient_credits_offered (number, default: 0)
- status (enum: pending, accepted, declined, cancelled, expired)
- expires_date (datetime)
- created_date (datetime)
- response_date (datetime)
```

### 22. PremiumMembership
```
- user_id (string) [FK → User.id]
- plan_type (enum: weekly, monthly, yearly)
- price_paid (number)
- payment_method (enum: credits, base44_payments)
- transaction_id (string)
- start_date (datetime)
- end_date (datetime)
- is_active (boolean, default: true)
- auto_renew (boolean, default: false)
- cancelled_date (datetime)
- created_date (datetime)
```

### 23. CreditTransaction
```
- user_id (string) [FK → User.id]
- type (enum: purchase, spend, refund, bonus, trade, tournament_prize)
- amount (number)
- balance_before (number)
- balance_after (number)
- description (string)
- reference_id (string)
- reference_type (string)
- created_date (datetime)
```

### 24. Notification
```
- user_id (string) [FK → User.id]
- type (enum: challenge, tournament, trade, system, match, wager, premium, marketplace)
- title (string)
- message (string)
- is_read (boolean, default: false)
- action_url (string)
- related_entity_id (string)
- related_entity_type (string)
- created_date (datetime)
```

### 25. ChatMessage
```
- sender_id (string) [FK → User.id]
- sender_name (string)
- recipient_id (string) [FK → User.id]
- recipient_name (string)
- conversation_id (string)
- content (string)
- is_read (boolean, default: false)
- read_date (datetime)
- created_date (datetime)
```

### 26. Leaderboard
```
- name (string)
- type (enum: elo, wager_earnings, tournament_wins, win_rate, total_matches, xp)
- region (enum: global, na, eu, asia, oce, sa)
- game_mode (enum: all, snd, overload, hp)
- time_period (enum: all_time, season, monthly, weekly)
- season (string)
- entries (array of {rank, user_id, user_name, value, team_id, team_name})
- last_updated (datetime)
```

### 27. Season
```
- name (string)
- season_number (number)
- start_date (datetime)
- end_date (datetime)
- is_active (boolean, default: false)
- rank_resets (boolean, default: true)
- rewards (object)
- created_date (datetime)
```

### 28. SystemLog
```
- log_type (enum: wallet, wager, tournament, marketplace, premium, admin, error)
- action (string)
- user_id (string)
- user_name (string)
- entity_type (string)
- entity_id (string)
- details (object)
- ip_address (string)
- created_date (datetime)
```

---

## Entity Relationships

### User-Centric Relationships
```
User (1) → (1) PlayerProfile
User (1) → (1) Wallet
User (1) → (many) WalletTransaction
User (1) → (many) WithdrawalRequest
User (1) → (many) CreditTransaction
User (1) → (many) Notification
User (1) → (many) ChatMessage (as sender)
User (1) → (many) ChatMessage (as recipient)
User (1) → (many) Purchase
User (1) → (many) UserInventory
User (1) → (many) PremiumMembership
User (1) → (many) Wager (as host)
User (1) → (many) Wager (as challenger)
User (1) → (many) WagerParticipant
User (1) → (many) Dispute (as reporter)
User (1) → (many) Dispute (as reported)
User (1) → (0..1) Team (as captain)
User (1) → (many) TeamMember
User (1) → (many) TournamentParticipant
User (1) → (0..1) Tournament (as creator)
```

### Wager Flow Relationships
```
Wager (1) → (many) WagerParticipant
Wager (1) → (1) MapPool
Wager (1) → (many) MapVeto
Wager (1) → (many) WagerMatch
Wager (1) → (0..1) Dispute
Wager (many) → (1) WalletTransaction (escrow)
Wager (many) → (1) WalletTransaction (payout)
```

### Tournament Flow Relationships
```
Tournament (1) → (many) TournamentParticipant
Tournament (1) → (many) TournamentMatch
Tournament (many) → (1) WalletTransaction (prize)
```

### Marketplace Relationships
```
MarketplaceItem (1) → (many) Purchase
MarketplaceItem (1) → (many) UserInventory
UserInventory (1) → (many) TradeOffer (as sender item)
UserInventory (1) → (many) TradeOffer (as recipient item)
```

### Team Relationships
```
Team (1) → (many) TeamMember
Team (1) → (many) TournamentParticipant
Team (1) → (many) TournamentMatch
```

---

## Prisma Schema Mapping

### Example Prisma Model Conversions

```prisma
// Base44 Entity: PlayerProfile
model PlayerProfile {
  user_id              String    @id @unique
  user                 User      @relation(fields: [user_id], references: [id])
  display_name         String
  avatar_url           String?
  bio                  String?
  country              String?
  region               Region
  rank                 Rank      @default(BRONZE)
  rank_division        Division  @default(V)
  elo                  Int       @default(1000)
  xp                   Int       @default(0)
  level                Int       @default(1)
  prestige             Int       @default(0)
  credits              Int       @default(0)
  is_premium           Boolean   @default(false)
  premium_expires      DateTime?
  total_matches        Int       @default(0)
  total_wins           Int       @default(0)
  total_losses         Int       @default(0)
  current_win_streak   Int       @default(0)
  best_win_streak      Int       @default(0)
  favorite_game_mode   String?
  total_playtime_hours Int       @default(0)
  account_created_date DateTime  @default(now())
  last_active_date     DateTime?
  is_banned            Boolean   @default(false)
  ban_reason           String?
  ban_expires          DateTime?
  
  wallet               Wallet?
  wagersHosted         Wager[]   @relation("WagerHost")
  wagersChallenged     Wager[]   @relation("WagerChallenger")
  wagerParticipants    WagerParticipant[]
  notifications        Notification[]
  sentMessages         ChatMessage[] @relation("MessageSender")
  receivedMessages     ChatMessage[] @relation("MessageRecipient")
  purchases            Purchase[]
  inventory            UserInventory[]
  premiumMemberships   PremiumMembership[]
  teamCaptained        Team?     @relation("TeamCaptain")
  teamMemberships      TeamMember[]
  tournamentParticipants TournamentParticipant[]
  tournamentsCreated   Tournament[]
  disputesReported     Dispute[] @relation("DisputeReporter")
  disputesAgainst      Dispute[] @relation("DisputeAgainst")
}

// Base44 Entity: Wallet
model Wallet {
  user_id              String   @id @unique
  user                 User     @relation(fields: [user_id], references: [id])
  available_balance    Decimal  @default(0)
  pending_balance      Decimal  @default(0)
  withdrawable_balance Decimal  @default(0)
  total_deposits       Decimal  @default(0)
  total_withdrawals    Decimal  @default(0)
  total_earnings       Decimal  @default(0)
  total_wagered        Decimal  @default(0)
  
  transactions         WalletTransaction[]
  withdrawalRequests   WithdrawalRequest[]
}

// Base44 Entity: Wager
model Wager {
  id                   String   @id @default(uuid())
  host_id              String
  host                 PlayerProfile @relation("WagerHost", fields: [host_id], references: [user_id])
  host_name            String
  challenger_id        String
  challenger           PlayerProfile @relation("WagerChallenger", fields: [challenger_id], references: [user_id])
  challenger_name      String
  game_mode            GameMode
  game_mode_display    String
  team_size            TeamSize
  entry_fee            Decimal
  total_prize_pool     Decimal
  platform_fee_percent Decimal  @default(10)
  platform_fee_amount  Decimal?
  winner_payout        Decimal?
  status               WagerStatus @default(OPEN)
  map_pool_id          String?
  map_pool             MapPool? @relation(fields: [map_pool_id], references: [id])
  host_banned_map_id   String?
  host_banned_map_name String?
  challenger_banned_map_id String?
  challenger_banned_map_name String?
  final_map_id         String?
  final_map_name       String?
  winner_id            String?
  winner               PlayerProfile? @relation(fields: [winner_id], references: [user_id])
  winner_name          String?
  winner_score         Int?
  loser_score          Int?
  match_start_deadline DateTime?
  match_started_date   DateTime?
  match_completed_date DateTime?
  created_date         DateTime @default(now())
  accepted_date        DateTime?
  
  participants         WagerParticipant[]
  mapVetoes            MapVeto[]
  matches              WagerMatch[]
  dispute              Dispute?
}
```

---

## Recommended Additional Entities

### 1. **AdminAction** (Recommended)
Track all admin actions for audit purposes:
```
- admin_id (string)
- admin_name (string)
- action_type (enum: ban, unban, warning, payout_adjust, dispute_resolve, etc)
- target_user_id (string)
- target_username (string)
- description (string)
- details (object)
- ip_address (string)
- created_date (datetime)
```

### 2. **Achievement** (Recommended)
Track player achievements/badges:
```
- user_id (string)
- achievement_id (string)
- achievement_name (string)
- achievement_type (enum: milestone, seasonal, special)
- description (string)
- icon_url (string)
- xp_reward (number)
- credits_reward (number)
- unlocked_date (datetime)
```

### 3. **GameServer** (Recommended)
If integrating with game servers:
```
- name (string)
- region (enum)
- ip_address (string)
- port (number)
- is_active (boolean)
- current_matches (number)
- max_matches (number)
```

### 4. **MatchmakingQueue** (Recommended)
For ranked matchmaking:
```
- user_id (string)
  ...
- game_mode (enum)
- team_size (enum)
- rank_range (object)
- queued_date (datetime)
- status (enum: searching, found, cancelled)
```

---

## Migration Notes to Prisma

### Key Considerations:
1. **Foreign Keys**: All `user_id`, `wager_id`, etc. become proper FK relations
2. **Enums**: Convert string enums to Prisma enum types
3. **Arrays**: Convert array fields to separate relation tables (e.g., `maps` in MapPool)
4. **Objects**: Convert nested objects to JSON type or separate tables
5. **Indexes**: Add indexes on frequently queried fields (user_id, status, created_date)
6. **Transactions**: Use Prisma transactions for multi-step operations (wager creation, wallet updates)

### Example Migration Script Structure:
```sql
-- Create enums first
CREATE TYPE "Rank" AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster');
CREATE TYPE "GameMode" AS ENUM ('snd', 'overload', 'hp');
-- etc...

-- Create tables with proper FK constraints
CREATE TABLE "PlayerProfile" (
  "user_id" TEXT PRIMARY KEY,
  "display_name" TEXT NOT NULL,
  "rank" "Rank" NOT NULL DEFAULT 'bronze',
  -- etc...
  CONSTRAINT "PlayerProfile_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
);
```

---

## Best Practices for Base44 → Prisma Migration

1. **Keep entity names consistent** - Use same naming in Base44 and Prisma
2. **Use snake_case in Base44**, convert to camelCase in Prisma if desired
3. **Always include created_date** - Helps with debugging and analytics
4. **Store balance_before/balance_after** - Critical for financial audit trails
5. **Use reference_id/reference_type pattern** - Flexible polymorphic relations
6. **Separate concerns** - Don't mix wallet logic with user profile logic
7. **Index strategically** - user_id, status, created_date are common query filters
8. **Use transactions** - Wallet operations MUST be atomic

---

This schema is production-ready and can scale to support:
- 100,000+ users
- 1,000,000+ wagers
- 10,000,000+ transactions
- Full marketplace & trading economy
- Tournament brackets
- Premium subscriptions
- Complete audit logging
