import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const streamerTournamentTypes = new Set(['streamer', 'streamer_tournament']);
const streamerSwitchFormats = new Set(['2v2', '4v4']);

function isStreamerTournament(tournament) {
  return Boolean(
    tournament?.is_streamer_tournament
    || streamerTournamentTypes.has(String(tournament?.tournament_type || '').toLowerCase())
    || streamerTournamentTypes.has(String(tournament?.source || '').toLowerCase())
  );
}

function canModerateStreamerTournament(user, tournament) {
  return Boolean(
    staffRoles.has(user?.role)
    || String(tournament?.host_id || tournament?.created_by || '') === String(user?.id || '')
  );
}

function normalizeStreamerSwitchFormat(value) {
  const format = String(value || '4v4').toLowerCase();
  return streamerSwitchFormats.has(format) ? format : '4v4';
}

function streamerEntrySlotCount(format) {
  return normalizeStreamerSwitchFormat(format) === '4v4' ? 2 : 1;
}

function cleanManualPlayerName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

function normalizeStreamerSwitchEntries(value, format) {
  const slotCount = streamerEntrySlotCount(format);
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows.map((entry, index) => {
    const rawNames = Array.isArray(entry?.player_names)
      ? entry.player_names
      : [entry?.player_one, entry?.player_two, entry?.player_name, entry?.name];
    const playerNames = rawNames.map(cleanManualPlayerName).filter(Boolean).slice(0, slotCount);
    if (playerNames.length !== slotCount) return null;
    const key = playerNames.map((name) => name.toLowerCase()).join('|');
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: String(entry?.id || crypto.randomUUID?.() || `switch-entry-${Date.now()}-${index}`),
      player_names: playerNames,
      linked_user_ids: Array.isArray(entry?.linked_user_ids) ? entry.linked_user_ids.filter(Boolean) : [],
      created_date: entry?.created_date || nowIso(),
    };
  }).filter(Boolean);
}

function matchHasScoreActivity(match) {
  if (!match) return false;
  if (match.completed || match.status === 'completed' || match.winner_id) return true;
  if (['awaiting_team_a_report', 'awaiting_team_b_report', 'score_conflict', 'disputed'].includes(match.status)) return true;
  return [
    'team_a_reported_score_alpha',
    'team_a_reported_score_bravo',
    'team_b_reported_score_alpha',
    'team_b_reported_score_bravo',
    'reported_score_alpha',
    'reported_score_bravo',
  ].some((field) => match[field] !== undefined && match[field] !== null);
}

async function clearGeneratedBracket(base44, tournament) {
  const [matches, participants] = await Promise.all([
    base44.asServiceRole.entities.TournamentMatch.filter({ tournament_id: tournament.id }, 'round', 500).catch(() => []),
    base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id: tournament.id }, 'seed', 500).catch(() => []),
  ]);
  if (matches.some(matchHasScoreActivity)) {
    return { success: false, error: 'This switch bracket already has completed or reported matches' };
  }
  await Promise.all(matches.map((match) => base44.asServiceRole.entities.TournamentMatch.delete(match.id).catch(() => null)));
  await Promise.all(participants.map((participant) => base44.asServiceRole.entities.TournamentParticipant.delete(participant.id).catch(() => null)));
  return { success: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const tournament = await base44.asServiceRole.entities.Tournament.get(body.tournament_id || '').catch(() => null);
    if (!tournament || !isStreamerTournament(tournament)) {
      return Response.json({ success: false, error: 'Streamer tournament not found' }, { status: 404 });
    }
    if (!canModerateStreamerTournament(user, tournament)) {
      return Response.json({ success: false, error: 'Only the streamer host or staff can edit this switcheroo' }, { status: 403 });
    }

    const switchFormat = normalizeStreamerSwitchFormat(body.switch_format || tournament.switch_format || tournament.team_size);
    const entries = normalizeStreamerSwitchEntries(body.entries, switchFormat);
    const reset = await clearGeneratedBracket(base44, tournament);
    if (!reset.success) return Response.json(reset, { status: 400 });

    const updated = await base44.asServiceRole.entities.Tournament.update(tournament.id, {
      team_size: switchFormat,
      switch_format: switchFormat,
      switch_entries: entries,
      switch_teams: [],
      switch_bracket_generated: false,
      bracket_generated: false,
      registration_locked: false,
      registered_teams: 0,
      status: 'open',
      updated_by: user.id,
      updated_date: nowIso(),
    });

    return Response.json({ success: true, tournament: updated, entries });
  } catch (error) {
    console.error('Save streamer switch entries error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
