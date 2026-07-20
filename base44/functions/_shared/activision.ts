const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || 'Player';

export const activisionIdFor = (user) => String(user?.activision_id || '').trim();

export const activisionIdRequiredResponse = (users = []) => {
  const missing = (users || []).filter((user) => user && !activisionIdFor(user));
  if (missing.length === 0) return null;
  const error = missing.length === 1
    ? `${nameFor(missing[0])} needs an Activision ID. Add it in Settings > Gaming IDs before joining competitive matches.`
    : `${missing.slice(0, 3).map(nameFor).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''} need an Activision ID. Every roster member must add one in Settings > Gaming IDs.`;
  return Response.json({ success: false, error, code: 'ACTIVISION_ID_REQUIRED' }, { status: 400 });
};

export const activisionIdRequiredForUserIds = async (base44, userIds = []) => {
  const users = await Promise.all([...new Set(userIds.filter(Boolean))].map((userId) => (
    base44.asServiceRole.entities.User.get(userId).catch(() => null)
  )));
  return activisionIdRequiredResponse(users);
};
