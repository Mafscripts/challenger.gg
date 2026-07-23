import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
    const leaving = participants.find((row) => row.user_id === user.id);
    if (!leaving) return Response.json({ error: 'You are not in this lobby' }, { status: 400 });
    const expired = wager.roster_lock_deadline && new Date(wager.roster_lock_deadline).getTime() <= Date.now();
    if (wager.roster_locked || wager.status === 'in_progress' || expired) {
      if (expired && !wager.roster_locked) await base44.asServiceRole.entities.Wager.update(id, { status: 'in_progress', roster_locked: true, match_started_date: wager.match_started_date || new Date().toISOString() });
      return Response.json({ error: 'The roster is locked. This match can no longer be left.' }, { status: 400 });
    }
    await base44.asServiceRole.entities.WagerParticipant.delete(leaving.id);
    const remaining = participants.filter((row) => row.id !== leaving.id);
    if (remaining.length === 0) {
      const cancelled = await base44.asServiceRole.entities.Wager.update(id, { status: 'cancelled', roster_locked: false, roster_lock_deadline: '', cancelled_date: new Date().toISOString() });
      return Response.json({ success: true, wager: cancelled, cancelled: true });
    }
    const balanced = remaining.map((row, index) => ({ ...row, team: index % 2 === 0 ? 'host' : 'challenger' }));
    const host = balanced.find((row) => row.team === 'host') || null;
    const challenger = balanced.find((row) => row.team === 'challenger') || null;
    await Promise.all(balanced.map((row) => base44.asServiceRole.entities.WagerParticipant.update(row.id, { team: row.team, is_captain: row.id === host?.id || row.id === challenger?.id }).catch(() => null)));
    const reopened = await base44.asServiceRole.entities.Wager.update(id, { host_id: host?.user_id || '', host_name: host?.user_name || '', challenger_id: challenger?.user_id || '', challenger_name: challenger?.user_name || '', status: 'open', roster_locked: false, roster_lock_deadline: '', match_started_date: '', final_map_id: '', final_map_name: '', series_maps: [] });
    return Response.json({ success: true, wager: reopened });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
