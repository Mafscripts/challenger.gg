import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const adminRoles = new Set(['ceo', 'super_admin', 'admin']);
const validStatuses = new Set(['draft', 'open', 'registration', 'closed']);
const validTeamSizes = new Set(Array.from({ length: 8 }, (_, index) => `${index + 1}v${index + 1}`));
const validGameModes = new Set([
  'bo1_snd',
  'snd',
  'hp',
  'overload',
  'snd_hp_snd',
  'bo3_hp_overload_snd',
  'bo5_hp_overload_snd_hp_snd',
]);
const validEntryTypes = new Set(['free', 'invitational', 'credits', 'premium', 'credits_premium']);

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Admin';
const cleanStrings = (rows, limit = 40) => (
  [...new Set((Array.isArray(rows) ? rows : []).map((row) => String(row || '').trim()).filter(Boolean))].slice(0, limit)
);

async function notifyInvite(base44, tournament, userId) {
  const content = `You're officially invited to compete in ${tournament.name}! Assemble your team, claim your spot, and get ready to battle for the title. As the invited captain, you can join with any eligible team you lead.`;
  return Promise.all([
    base44.asServiceRole.entities.Notification.create({
      user_id: userId,
      type: 'tournament',
      title: 'Tournament invitation',
      message: content,
      is_read: false,
      action_url: `/tournaments?tournament=${tournament.id}`,
      related_entity_id: tournament.id,
      related_entity_type: 'Tournament',
      created_date: nowIso(),
    }).catch(() => null),
    base44.asServiceRole.entities.Message.create({
      sender_id: tournament.created_by,
      sender_name: 'Topfragg Tournaments',
      recipient_id: userId,
      subject: `You're invited to compete: ${tournament.name}`,
      content,
      is_read: false,
      action_url: `/tournaments?tournament=${tournament.id}`,
      related_entity_id: tournament.id,
      related_entity_type: 'Tournament',
      message_type: 'tournament_invitation',
      created_date: nowIso(),
    }).catch(() => null),
  ]);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!adminRoles.has(String(user.role || '').toLowerCase())) {
      return Response.json({ success: false, error: 'Admin or higher is required to create tournaments' }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return Response.json({ success: false, error: 'Tournament name is required' }, { status: 400 });

    const entryType = validEntryTypes.has(body.entry_type) ? body.entry_type : 'free';
    const inviteOnly = body.invite_only === true || entryType === 'invitational';
    const invitedUserIds = inviteOnly ? cleanStrings(body.invited_user_ids, 500) : [];
    const mapPools = {
      snd: cleanStrings(body.map_pools?.snd || body.maps),
      hp: cleanStrings(body.map_pools?.hp),
      overload: cleanStrings(body.map_pools?.overload),
    };
    const startDate = body.start_date ? new Date(body.start_date) : null;
    const registrationEnd = body.registration_end ? new Date(body.registration_end) : null;

    const tournament = await base44.asServiceRole.entities.Tournament.create({
      name,
      title: name,
      image_url: String(body.image_url || '').trim().slice(0, 1000),
      game_mode: validGameModes.has(body.game_mode) ? body.game_mode : 'snd_hp_snd',
      game: 'Call of Duty',
      region: body.region || 'global',
      team_size: validTeamSizes.has(body.team_size) ? body.team_size : '2v2',
      entry_fee: Math.max(0, Number(body.entry_fee || 0)),
      entry_type: entryType,
      prize_pool: Math.max(0, Number(body.prize_pool || 0)),
      prize_distribution: body.prize_distribution || {},
      max_teams: Math.max(2, Math.min(256, Number(body.max_teams || 8))),
      registered_teams: 0,
      format: 'single_elimination',
      bracket_type: 'single_elimination',
      status: validStatuses.has(body.status) ? body.status : 'open',
      maps: mapPools.snd,
      map_pools: mapPools,
      start_date: startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : undefined,
      registration_end: registrationEnd && Number.isFinite(registrationEnd.getTime()) ? registrationEnd.toISOString() : undefined,
      is_premium_only: entryType === 'premium' || entryType === 'credits_premium',
      invite_only: inviteOnly,
      invited_user_ids: invitedUserIds,
      reward_item_ids: cleanStrings(body.reward_item_ids, 100),
      reward_items: Array.isArray(body.reward_items) ? body.reward_items.slice(0, 100) : [],
      elimination_reward_item_ids: cleanStrings(body.elimination_reward_item_ids, 100),
      elimination_reward_items: Array.isArray(body.elimination_reward_items) ? body.elimination_reward_items.slice(0, 100) : [],
      bracket_generated: false,
      registration_locked: false,
      created_by: user.id,
      created_by_name: nameFor(user),
      created_date: nowIso(),
    });

    if (inviteOnly && invitedUserIds.length > 0) {
      await Promise.all(invitedUserIds.map((userId) => notifyInvite(base44, tournament, userId)));
    }

    return Response.json({ success: true, tournament });
  } catch (error) {
    console.error('Create tournament error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
