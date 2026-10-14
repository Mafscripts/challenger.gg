export const TRYOUT_TEAM_SIZE = 4;
export const TRYOUT_CAPACITY = 16;
export const TRYOUT_HP_MAPS = ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"];

export const hasChallengersBadge = (user) => (
  Array.isArray(user?.badges) && user.badges.some((badge) => badge?.type === "challengers")
);

export const canManageTryouts = (user) => [user?.role, user?.admin_role]
  .some((role) => ["admin", "super_admin", "superadmin", "ceo"].includes(String(role || "").toLowerCase()));

export const canAccessTryouts = (user) => canManageTryouts(user) || hasChallengersBadge(user);

export const tryoutTeamLabel = (team) => ({ alpha: "Team Alpha", bravo: "Team Bravo", bench: "Waiting room" }[team] || "Waiting room");

export function tryoutSeriesScore(maps = []) {
  return maps.reduce((score, map) => {
    if (Number.isInteger(map.alpha_score) && Number.isInteger(map.bravo_score)) {
      if (map.alpha_score > map.bravo_score) score.alpha += 1;
      if (map.bravo_score > map.alpha_score) score.bravo += 1;
    }
    return score;
  }, { alpha: 0, bravo: 0 });
}
