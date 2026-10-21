CREATE INDEX IF NOT EXISTS "TradeOffer_sender_created_idx" ON "TradeOffer" ((metadata->>'sender_id'), created_date DESC);
CREATE INDEX IF NOT EXISTS "TradeOffer_recipient_created_idx" ON "TradeOffer" ((metadata->>'recipient_id'), created_date DESC);
CREATE INDEX IF NOT EXISTS "UserInventory_owner_created_idx" ON "UserInventory" ((metadata->>'user_id'), created_date DESC);
