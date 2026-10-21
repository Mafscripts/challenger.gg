CREATE INDEX IF NOT EXISTS "TradeOffer_listing_feed_idx" ON "TradeOffer" (created_date DESC, id DESC) WHERE metadata->>'kind' = 'listing';
CREATE INDEX IF NOT EXISTS "TradeOffer_listing_owner_idx" ON "TradeOffer" ((metadata->>'seller_id'), created_date DESC) WHERE metadata->>'kind' = 'listing';
CREATE INDEX IF NOT EXISTS "TradeOffer_bid_listing_idx" ON "TradeOffer" ((metadata->>'listing_id'), (metadata->>'status'), created_date DESC) WHERE metadata->>'kind' = 'bid';
