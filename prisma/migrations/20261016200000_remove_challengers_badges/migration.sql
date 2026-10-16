-- Remove the retired Tryouts badge while preserving all other badges and metadata.
UPDATE "User"
SET "metadata" = jsonb_set(
  "metadata",
  '{badges}',
  COALESCE((
    SELECT jsonb_agg(badge ORDER BY ordinal)
    FROM jsonb_array_elements("metadata"->'badges') WITH ORDINALITY AS entries(badge, ordinal)
    WHERE badge->>'type' IS DISTINCT FROM 'challengers'
  ), '[]'::jsonb)
), "updated_date" = CURRENT_TIMESTAMP
WHERE jsonb_typeof("metadata"->'badges') = 'array'
  AND "metadata"->'badges' @> '[{"type":"challengers"}]'::jsonb;
