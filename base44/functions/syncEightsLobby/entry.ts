import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const rosterSize = (teamSize) => Math.max(1, Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1);

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
    if (wager.roster_locked || wager.status === 'in_progress') return Response.json({ success: true, wager, locked: true, full: true });
    const deadlineMs = wager.roster_lock_deadline ? new Date(wager.roster_lock_deadline).getTime() : 0;
    if (!deadlineMs) {
      const pending = await base44.asServiceRole.entities.Wager.update(id, { roster_lock_deadline: new Date(Date.now() + 30000).toISOString(), roster_locked: false, status: 'open' });
      return Response.json({ success: true, wager: pending, locked: false, full: true });
    }
    if (deadlineMs > Date.now()) return Response.json({ success: true, wager, locked: false, full: true, seconds_remaining: Math.ceil((deadlineMs - Date.now()) / 1000) });
    const locked = await base44.asServiceRole.entities.Wager.update(id, { status: 'in_progress', roster_locked: true, match_started_date: wager.match_started_date || new Date().toISOString() });
    return Response.json({ success: true, wager: locked, locked: true, full: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
