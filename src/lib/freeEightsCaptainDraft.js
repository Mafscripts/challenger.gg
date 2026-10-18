export const captainDraftPending = (match) => ["pending", "active"].includes(match?.free_eights_captain_draft?.status);
export const captainDraftActive = (match) => match?.free_eights_captain_draft?.status === "active";

export function captainDraftSide(draft, userId) {
  if (!userId) return null;
  return ["host", "challenger"].find((side) => draft?.captains?.[side] === userId) || null;
}

export function captainDraftTurn(draft) {
  if (draft?.status !== "active") return null;
  return (draft.picks?.length || 0) % 2 === 0 ? "host" : "challenger";
}

export function captainDraftPlayerIds(draft, side) {
  return [draft?.captains?.[side], ...(draft?.picks || []).filter((pick) => pick.side === side).map((pick) => pick.user_id)].filter(Boolean);
}
