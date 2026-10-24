import { tournamentTimestamp } from "./tournamentTime.js";

const modeNames = {
  hp: "Hardpoint",
  snd: "Search & Destroy",
  hijacked: "Hijacked",
  overload: "Overload",
  control: "Control",
};

const legacySeries = {
  mw4: ["hp", "hijacked", "snd"],
  hijacked: ["hijacked", "hijacked", "hijacked"],
  bo1_snd: ["snd"],
  snd: ["snd", "snd", "snd"],
  hp: ["hp", "hp", "hp"],
  overload: ["overload", "overload", "overload"],
  snd_hp_snd: ["snd", "hp", "snd"],
  bo3_hp_overload_snd: ["hp", "overload", "snd"],
  bo5_hp_overload_snd_hp_snd: ["hp", "overload", "snd", "hp", "snd"],
};

const modeToken = (token) => {
  const value = String(token || "").trim().toLowerCase();
  if (["hp", "hardpoint"].includes(value)) return "hp";
  if (["snd", "search and destroy", "search & destroy"].includes(value)) return "snd";
  if (["hijack", "hijacked"].includes(value)) return "hijacked";
  return modeNames[value] ? value : null;
};

// The admin form stores the series length and game modes separately. Legacy
// events store both in game_mode, so retain those established series too.
export function tournamentFormat(tournament = {}) {
  const rawMode = String(tournament.game_mode || "").trim();
  const key = rawMode.toLowerCase();
  const preset = legacySeries[key];
  const requestedBestOf = key.match(/\b(?:bo|best[\s-]*of)\s*(\d{1,2})\b/i)?.[1];
  const requestedLength = Math.max(1, Math.min(15, Number(requestedBestOf || preset?.length || 3)));
  const configured = [...new Set((Array.isArray(tournament.game_modes) ? tournament.game_modes : [])
    .map(modeToken).filter(Boolean))];
  const tokens = key.replace(/\b(?:bo|best[\s-]*of)\s*\d{1,2}\b/gi, "")
    .split(/[\/,|>+]+/).map(modeToken).filter(Boolean);
  const sequence = configured.length
    ? Array.from({ length: requestedLength }, (_, index) => configured[index % configured.length])
    : preset || (tokens.length > 1 ? tokens : Array.from({ length: requestedLength }, () => tokens[0] || "snd"));
  const bracket = String(tournament.bracket_type || tournament.format || "single_elimination").toLowerCase();
  return {
    seriesLabel: `Best of ${sequence.length}`,
    modesLabel: [...new Set(sequence)].map((mode) => modeNames[mode]).join(" / "),
    bracketLabel: bracket === "double_elimination" ? "Double elimination" : "Single elimination",
    teamSizeLabel: tournament.team_size || "1v1",
  };
}

const registrationDeadline = (tournament) => {
  for (const value of [tournament.registration_end, tournament.start_date]) {
    const timestamp = tournamentTimestamp(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
};

export function tournamentRegistration(tournament = {}, { joined = false, user = null, now = Date.now() } = {}) {
  const deadline = registrationDeadline(tournament);
  const result = (status, label, reason, available = false) => ({ status, label, reason, available, deadline });
  if (joined) return result("joined", "Team registered", "Your team is registered for this tournament.");

  const status = String(tournament.status || "").trim().toLowerCase();
  if (status === "cancelled") return result("cancelled", "Tournament cancelled", "This tournament has been cancelled.");
  if (status === "completed") return result("completed", "Tournament completed", "This tournament has ended. View the bracket for its results.");
  if (["live", "in_progress"].includes(status)) return result("live", "Tournament in progress", "Registration is closed. Follow the matches in the bracket.");
  if (status === "draft") return result("draft", "Registration not open", "Registration has not opened yet.");
  if (!["open", "registration"].includes(status)) return result("closed", "Registration closed", "This tournament is no longer accepting teams.");
  if (tournament.registration_locked === true || tournament.bracket_generated === true) {
    return result("locked", "Registration locked", tournament.bracket_generated === true
      ? "The bracket has been generated. No new teams can register."
      : "Registration has been locked by tournament staff.");
  }
  if (deadline && new Date(deadline).getTime() <= Number(now)) return result("closed", "Registration closed", "The registration deadline has passed.");
  const capacity = Number(tournament.max_teams || 0);
  if (capacity > 0 && Number(tournament.registered_teams || 0) >= capacity) return result("full", "Tournament full", "All available team places have been filled.");

  const inviteOnly = tournament.invite_only === true || String(tournament.entry_type || "").toLowerCase() === "invitational";
  const invitedIds = Array.isArray(tournament.invited_user_ids) ? tournament.invited_user_ids.map(String) : [];
  if (inviteOnly && (!user?.id || !invitedIds.includes(String(user.id)))) {
    return result("invite_only", "Invite only", user?.id
      ? "Only invited team captains can register for this tournament."
      : "Sign in with an invited captain account to register for this tournament.");
  }
  return result("open", user?.id ? "Join tournament" : "Sign in to join", "Team captains can register a complete tournament roster.", true);
}

const roundMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
};

// Match the existing winner/runner-up calculation. Old first/second values up
// to 100 are percentages, while newer *_amount values are absolute amounts.
export function tournamentPrizes(tournament = {}) {
  const pool = roundMoney(tournament.prize_pool);
  const distribution = tournament.prize_distribution || {};
  const placementAmount = (placement) => {
    const key = placement === 1 ? "first" : "second";
    const amount = Number(distribution[`${key}_amount`]);
    if (Number.isFinite(amount) && amount > 0) return roundMoney(amount);
    const legacy = Number(distribution[key]);
    if (Number.isFinite(legacy) && legacy > 100) return roundMoney(legacy);
    if (Number.isFinite(legacy) && legacy > 0) return roundMoney(pool * legacy / 100);
    return placement === 1 ? pool : 0;
  };
  const rows = [{ place: 1, label: "1st place", amount: placementAmount(1) }];
  const second = placementAmount(2);
  if (second > 0) rows.push({ place: 2, label: "2nd place", amount: second });
  // Retain an explicitly announced third prize without inventing a percentage
  // split or implying that the first/second automated award covers it.
  const third = roundMoney(distribution.third_amount ?? tournament.third_place_prize);
  if (third > 0) rows.push({ place: 3, label: "3rd place", amount: third });
  return rows;
}
