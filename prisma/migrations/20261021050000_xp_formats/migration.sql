-- Read indexes only. Existing XP teams, memberships and match results are preserved.
CREATE INDEX IF NOT EXISTS "Team_xp_captain_idx" ON "Team" ((metadata->>'captain_id')) WHERE metadata->>'team_type' = 'xp';
CREATE INDEX IF NOT EXISTS "TeamMember_user_team_idx" ON "TeamMember" ((metadata->>'user_id'), (metadata->>'team_id'));
CREATE INDEX IF NOT EXISTS "TeamMember_team_active_idx" ON "TeamMember" ((metadata->>'team_id')) WHERE COALESCE(metadata->>'is_active', 'true') <> 'false';
CREATE INDEX IF NOT EXISTS "XPMatch_format_status_created_idx" ON "XPMatch" ((metadata->>'team_size'), (metadata->>'status'), created_date DESC);
