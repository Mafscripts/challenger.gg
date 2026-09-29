import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const rosterSize = (teamSize) => Math.max(1, Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1);
const mapsByMode = {
  snd: ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Fringe'],
  hp: ['Sake', 'Colossus', 'Den', 'Scar', 'Gridlock', 'Hacienda'],
  overload: ['Scar', 'Gridlock', 'Den', 'Exposure'],
};

const shuffled = (rows) => {
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const id = body.wager_id || body.id;
    const wager = await base44.asServiceRole.entities.Wager.get(id);
    if (!wager || wager.match_type !== '8s') return Response.json({ error: '8s lobby not found' }, { status: 404 });
    const participants = await base44.asServiceRole.entities.WagerParticipant.filter({ wager_id: id }, 'joined_date', 20).catch(() => []);
    if (!participants.some((row) => row.user_id === user.id) && !staffRoles.has(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (['completed', 'cancelled'].includes(wager.status)) return Response.json({ success: true, wager, locked: true });

    const full = participants.length >= rosterSize(wager.team_size) * 2;
    if (!full) {
      if (!wager.roster_lock_deadline && !wager.roster_locked) return Response.json({ success: true, wager, locked: false, full: false });
      const reopened = await base44.asServiceRole.entities.Wager.update(id, { status: 'open', roster_locked: false, roster_lock_deadline: '', match_started_date: '', final_map_id: '', final_map_name: '', series_maps: [] });
      return Response.json({ success: true, wager: reopened, locked: false, full: false });
    }
    let currentWager = wager;
    if (!wager.teams_generated_at) {
      const teamSize = rosterSize(wager.team_size);
      const randomized = shuffled(participants);
      const alpha = randomized.slice(0, teamSize);
      const bravo = randomized.slice(teamSize, teamSize * 2);
      await Promise.all(randomized.map((participant) => {
        const team = alpha.some((row) => row.id === participant.id) ? 'host' : 'challenger';
        return base44.asServiceRole.entities.WagerParticipant.update(participant.id, {
          team,
          team_name: team === 'host' ? 'Team Alpha' : 'Team Bravo',
          is_captain: participant.id === alpha[0]?.id || participant.id === bravo[0]?.id,
        });
      }));
      const selectedMaps = shuffled(mapsByMode[wager.game_mode] || mapsByMode.snd).slice(0, Math.max(1, Number(wager.best_of || 3)));
      currentWager = await base44.asServiceRole.entities.Wager.update(id, {
        host_id: alpha[0]?.user_id || '',
        host_name: alpha[0]?.user_name || 'Team Alpha Captain',
        host_team_name: 'Team Alpha',
        challenger_id: bravo[0]?.user_id || '',
        challenger_name: bravo[0]?.user_name || 'Team Bravo Captain',
        challenger_team_name: 'Team Bravo',
        final_map_id: String(selectedMaps[0] || '').toLowerCase().replace(/\s+/g, '_'),
        final_map_name: selectedMaps[0] || '',
        series_maps: selectedMaps,
        teams_generated_at: new Date().toISOString(),
        roster_lock_deadline: new Date(Date.now() + 30000).toISOString(),
      });
    }
    if (currentWager.roster_locked || currentWager.status === 'in_progress') return Response.json({ success: true, wager: currentWager, locked: true, full: true });
    const deadlineMs = currentWager.roster_lock_deadline ? new Date(currentWager.roster_lock_deadline).getTime() : 0;
    if (!deadlineMs) {
      const pending = await base44.asServiceRole.entities.Wager.update(id, { roster_lock_deadline: new Date(Date.now() + 30000).toISOString(), roster_locked: false, status: 'open' });
      return Response.json({ success: true, wager: pending, locked: false, full: true });
    }
    if (deadlineMs > Date.now()) return Response.json({ success: true, wager: currentWager, locked: false, full: true, seconds_remaining: Math.ceil((deadlineMs - Date.now()) / 1000) });
    const locked = await base44.asServiceRole.entities.Wager.update(id, { status: 'in_progress', roster_locked: true, match_started_date: currentWager.match_started_date || new Date().toISOString() });
    return Response.json({ success: true, wager: locked, locked: true, full: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
