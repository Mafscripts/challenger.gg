-- One-time withdrawal of the current marketplace collection, requested by the owner.
-- Stop the API during deployment: in-flight rewards/purchases must finish before this runs.
-- Future catalog items are unaffected once this migration has completed.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'));
LOCK TABLE "User", "PlayerProfile", "MarketplaceItem", "UserInventory", "Inventory", "KnifeUnlock", "TradeOffer", "Tournament", "Notification" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE retired_market_catalog ON COMMIT DROP AS
SELECT id FROM "MarketplaceItem";

-- Keep genuine standalone competition awards. Catalog copies, cosmetics and
-- orphaned copies of older collections are withdrawn, including equipped items.
CREATE TEMP TABLE retired_market_inventory ON COMMIT DROP AS
SELECT 'UserInventory'::text AS source, id, metadata->>'item_id' AS item_id
FROM "UserInventory" i
WHERE EXISTS (SELECT 1 FROM retired_market_catalog c WHERE c.id = i.metadata->>'item_id')
   OR NOT (
     COALESCE(i.metadata->>'unlock_type', '') IN ('tournament_placement_trophy', 'rank_reward', 'ranked')
     OR COALESCE(i.metadata->>'item_id', '') IN ('standard_tournament_gold_trophy', 'standard_tournament_silver_trophy', 'standard_tournament_bronze_trophy')
     OR COALESCE(i.metadata->>'item_category', '') = 'ranked_reward'
     OR COALESCE(i.metadata->>'is_rank_reward', 'false') = 'true'
   )
UNION ALL
SELECT 'Inventory', id, metadata->>'item_id'
FROM "Inventory" i
WHERE EXISTS (SELECT 1 FROM retired_market_catalog c WHERE c.id = i.metadata->>'item_id')
   OR NOT (
     COALESCE(i.metadata->>'unlock_type', '') IN ('tournament_placement_trophy', 'rank_reward', 'ranked')
     OR COALESCE(i.metadata->>'item_id', '') IN ('standard_tournament_gold_trophy', 'standard_tournament_silver_trophy', 'standard_tournament_bronze_trophy')
     OR COALESCE(i.metadata->>'item_category', i.metadata->>'category', '') = 'ranked_reward'
     OR COALESCE(i.metadata->>'is_rank_reward', 'false') = 'true'
   );

CREATE TEMP TABLE retired_market_refs ON COMMIT DROP AS
SELECT id FROM retired_market_catalog
UNION SELECT id FROM retired_market_inventory
UNION SELECT item_id FROM retired_market_inventory WHERE item_id IS NOT NULL
UNION SELECT id FROM "KnifeUnlock"
UNION SELECT metadata->>'item_id' FROM "KnifeUnlock" WHERE metadata->>'item_id' IS NOT NULL;
CREATE UNIQUE INDEX ON retired_market_refs (id);

-- Close only offers referring to withdrawn items. Completed trade and purchase
-- history stays intact; this operation never changes credits or wallet balances.
UPDATE "TradeOffer" o
SET metadata = o.metadata || jsonb_build_object(
  'status', 'cancelled',
  'cancellation_reason', 'The marketplace collection was withdrawn by the platform.',
  'response_date', CURRENT_TIMESTAMP::text,
  'collection_reset', '20261021060000'
), updated_date = CURRENT_TIMESTAMP
WHERE o.metadata->>'status' IN ('pending', 'open')
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(
    (CASE WHEN jsonb_typeof(o.metadata->'items') = 'array' THEN o.metadata->'items' ELSE '[]'::jsonb END)
    || (CASE WHEN jsonb_typeof(o.metadata->'sender_items') = 'array' THEN o.metadata->'sender_items' ELSE '[]'::jsonb END)
    || (CASE WHEN jsonb_typeof(o.metadata->'recipient_items') = 'array' THEN o.metadata->'recipient_items' ELSE '[]'::jsonb END)
  ) AS entry
  WHERE EXISTS (SELECT 1 FROM retired_market_refs r
    WHERE r.id IN (entry->>'inventory_id', entry->>'item_id', entry->>'id', entry #>> '{}'))
);

-- Remove only the withdrawn selections from both copies of profile settings.
UPDATE "User" u
SET metadata = jsonb_set(u.metadata, '{showcase_item_ids}', COALESCE((
  SELECT jsonb_agg(entry.value ORDER BY entry.position)
  FROM jsonb_array_elements(u.metadata->'showcase_item_ids') WITH ORDINALITY AS entry(value, position)
  WHERE NOT EXISTS (SELECT 1 FROM retired_market_refs r WHERE r.id = entry.value #>> '{}')
), '[]'::jsonb)), updated_date = CURRENT_TIMESTAMP
WHERE jsonb_typeof(u.metadata->'showcase_item_ids') = 'array'
AND EXISTS (SELECT 1 FROM retired_market_refs r WHERE u.metadata->'showcase_item_ids' ? r.id);

UPDATE "PlayerProfile" p
SET metadata = jsonb_set(p.metadata, '{showcase_item_ids}', COALESCE((
  SELECT jsonb_agg(entry.value ORDER BY entry.position)
  FROM jsonb_array_elements(p.metadata->'showcase_item_ids') WITH ORDINALITY AS entry(value, position)
  WHERE NOT EXISTS (SELECT 1 FROM retired_market_refs r WHERE r.id = entry.value #>> '{}')
), '[]'::jsonb)), updated_date = CURRENT_TIMESTAMP
WHERE jsonb_typeof(p.metadata->'showcase_item_ids') = 'array'
AND EXISTS (SELECT 1 FROM retired_market_refs r WHERE p.metadata->'showcase_item_ids' ? r.id);

-- Active events must no longer advertise or grant withdrawn bonus items.
-- Completed event snapshots and ordinary placement trophies remain historical records.
UPDATE "Tournament" t
SET metadata = t.metadata || '{"reward_item_ids":[],"reward_items":[],"elimination_reward_item_ids":[],"elimination_reward_items":[],"placement_trophy_item_ids":{"1":[],"2":[],"3":[]},"placement_trophy_items":{"1":[],"2":[],"3":[]}}'::jsonb,
    updated_date = CURRENT_TIMESTAMP
WHERE COALESCE(t.metadata->>'status', '') NOT IN ('completed', 'cancelled', 'closed')
  AND COALESCE(t.metadata->>'completed', 'false') <> 'true'
  AND t.metadata ?| ARRAY['reward_item_ids', 'reward_items', 'elimination_reward_item_ids', 'elimination_reward_items', 'placement_trophy_item_ids', 'placement_trophy_items'];

DELETE FROM "Notification" n
WHERE n.metadata->>'related_entity_type' = 'MarketplaceItem'
  AND EXISTS (SELECT 1 FROM retired_market_catalog c WHERE c.id = n.metadata->>'related_entity_id');

DELETE FROM "UserInventory" i
USING retired_market_inventory r WHERE r.source = 'UserInventory' AND i.id = r.id;
DELETE FROM "Inventory" i
USING retired_market_inventory r WHERE r.source = 'Inventory' AND i.id = r.id;
DELETE FROM "KnifeUnlock";
DELETE FROM "MarketplaceItem" m USING retired_market_catalog r WHERE m.id = r.id;

INSERT INTO "AdminAction" (id, created_date, updated_date, metadata)
SELECT 'marketplace-collection-reset-20261021060000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  jsonb_build_object(
    'action_type', 'marketplace_collection_reset', 'admin_name', 'Deployment migration',
    'description', 'Withdrew the marketplace collection and its copies from all player inventories and profile showcases at the owner''s request.',
    'details', jsonb_build_object('migration', '20261021060000_clear_marketplace_collection',
      'catalog_items_removed', (SELECT COUNT(*) FROM retired_market_catalog),
      'inventory_copies_removed', (SELECT COUNT(*) FROM retired_market_inventory)))
ON CONFLICT (id) DO NOTHING;
COMMIT;
