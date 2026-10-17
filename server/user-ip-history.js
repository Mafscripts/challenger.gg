import { requestIpAddress } from "./ban-enforcement.js";

export async function recordUserIp(db, user, req, field = "last_seen_ip") {
  const ip = requestIpAddress(req);
  if (!ip || (field === "last_seen_ip" && user.metadata?.last_seen_ip === ip)) return user;
  const entry = JSON.stringify({ ip, event: field, date: new Date().toISOString() });
  // Merge with the current database metadata, so parallel account updates cannot
  // be overwritten by an IP observation. Keep the latest 50 distinct addresses.
  const rows = await db.$queryRaw`UPDATE "User" SET metadata = metadata
    || jsonb_build_object(${field}::text, ${ip}::text, 'last_seen_ip', ${ip}::text)
    || jsonb_build_object('ip_history', COALESCE((
      SELECT jsonb_agg(item ORDER BY position) FROM (
        SELECT item, position FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(metadata->'ip_history') = 'array' THEN metadata->'ip_history' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS history(item, position)
        WHERE item->>'ip' IS DISTINCT FROM ${ip} ORDER BY position DESC LIMIT 49
      ) recent
    ), '[]'::jsonb) || ${entry}::jsonb), updated_date = NOW()
    WHERE id = ${user.id} RETURNING *`;
  return rows[0] || user;
}
