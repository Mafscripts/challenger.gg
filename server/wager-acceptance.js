export function challengerIdentityAfterAccept(wager, {
  isTeamMatch,
  individualSide,
  acceptingUserId,
  acceptingUserName,
}) {
  const acceptingUserIsChallenger = isTeamMatch || individualSide === "challenger";
  return {
    challenger_id: wager.challenger_id || (acceptingUserIsChallenger ? acceptingUserId : ""),
    challenger_name: wager.challenger_name || (acceptingUserIsChallenger ? acceptingUserName : ""),
  };
}
