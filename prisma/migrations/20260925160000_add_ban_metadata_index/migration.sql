CREATE INDEX IF NOT EXISTS "Ban_metadata_idx" ON "Ban" USING GIN ("metadata");
