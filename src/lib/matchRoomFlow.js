import { captainDraftTurn } from "@/lib/freeEightsCaptainDraft";

const idFor = (player) => player.user_id || player.id;
const same = (left, right) => left != null && right != null && String(left) === String(right);
const nameFor = (player) => player.user_name || player.name || player.display_name || player.full_name || player.username || "Player";
const namesFor = (players) => players.slice(0, 3).map(nameFor).join(", ") + (players.length > 3 ? ` +${players.length - 3} more` : "");

// Presentation only: room permissions and mutations stay with each existing mode.
export function matchRoomFlow({
  match, mode, complete, userId, participant, rosterFull, alphaPlayers = [], bravoPlayers = [],
  alphaName = "Team Alpha", bravoName = "Team Bravo", capacity, hasMaps,
  canReport, canReview, ownReported, voice, canStart, locked, hasScoreProposal, currentUserAgreed,
  scoreVoteCount, requiredScoreVotes, needsPayment,
}) {
  if (!match || complete || match.status === "cancelled") return null;
  const status = String(match.status || "open");
  const players = [...alphaPlayers, ...bravoPlayers];
  const freeEights = mode === "eights";
  const challenge = mode === "challenge";
  const draft = freeEights && match.free_eights_captain_draft;
  const steps = [
    { id: "players", label: mode === "tournaments" ? "Teams" : "Players" },
    ...(mode === "ranked" || freeEights || challenge || mode === "wagers" ? [{ id: "setup", label: freeEights || challenge ? "Discord" : mode === "ranked" ? "Ready check" : "Entry" }] : []),
    ...(draft ? [{ id: "draft", label: "Team draft" }] : []),
    { id: "maps", label: "Maps" }, { id: "play", label: "Play" }, { id: "result", label: "Result" },
  ];
  const flow = (phase, title, description, waitingOn, action = null, timerLabel = null) => ({ steps, phase, title, description, waitingOn, action, timerLabel });
  if (["score_conflict", "disputed"].includes(status)) {
    return { ...flow("result", "Result under review", "The result stays pending until staff resolves the dispute. Use the room chat to share relevant evidence.", "Topfragg staff", canReview ? "report" : null), review: true };
  }
  if (rosterFull && mode === "wagers" && (needsPayment || players.some((player) => player.payment_status === "pending"))) {
    return flow("setup", "Entry confirmation", "Each player must complete the existing entry step before play.",
      namesFor(players.filter((player) => player.payment_status === "pending")) || "Entry confirmation", needsPayment ? "payment" : null, "Start window");
  }
  const awaitingResult = ["awaiting_host_report", "awaiting_challenger_report", "awaiting_team_alpha_report", "awaiting_team_bravo_report",
    "awaiting_team_a_report", "awaiting_team_b_report", "awaiting_confirmation", "awaiting_report", "awaiting_completion",
    "pending_confirmation", "pending_completion"].includes(status) || hasScoreProposal || match.eights_score_vote_status === "approved";
  if (awaitingResult) {
    let waitingOn = /awaiting_(team_a|team_alpha|host)_report$/.test(status) ? alphaName
      : /awaiting_(team_b|team_bravo|challenger)_report$/.test(status) ? bravoName : "Both team captains";
    if (freeEights || mode === "money8s") {
      waitingOn = currentUserAgreed ? "Remaining player approvals" : participant ? "Your score approval" : "Player approvals";
    } else if (challenge) {
      waitingOn = match.reports?.alpha && !match.reports?.bravo ? bravoName
        : match.reports?.bravo && !match.reports?.alpha ? alphaName : "Team captains";
    } else if (ownReported && waitingOn === "Both team captains") waitingOn = "The opposing captain";
    const finalizing = status === "awaiting_completion" || match.eights_score_vote_status === "approved";
    return flow("result", finalizing ? "Confirming the result" : "Score confirmation",
      finalizing ? "The reports are being processed. The confirmed result will appear here."
        : hasScoreProposal ? `${scoreVoteCount}/${requiredScoreVotes} player approvals. Review the submitted score before agreeing.`
          : ownReported ? "Your report is saved. The other side must submit the same score."
            : "Both sides must report the same series score before the result is confirmed.",
      finalizing ? "Result processing" : waitingOn,
      !finalizing && canReport && !ownReported && !currentUserAgreed ? "report" : null);
  }
  if (!rosterFull) {
    return flow("players", mode === "tournaments" ? "Waiting for team assignment" : "Waiting for players",
      mode === "tournaments" ? "This room is ready when both teams have advanced into this match."
        : `${players.length}/${capacity} players joined. The next step unlocks when both rosters are full.`,
      mode === "tournaments" ? "The tournament bracket" : "Remaining players", challenge && !participant ? "join" : null, "Lobby window");
  }
  if (mode === "ranked" && status === "ready_check") {
    const readyIds = Array.isArray(match.ready_player_ids) ? match.ready_player_ids : [];
    const missing = players.filter((player) => !readyIds.some((id) => same(id, idFor(player))));
    const ready = readyIds.some((id) => same(id, userId));
    return flow("setup", `Ready check · ${players.length - missing.length}/${players.length}`,
      ready ? "You are ready. The host can start once everyone has confirmed." : "Every player must confirm they are ready before the host starts.",
      namesFor(missing) || "Ready confirmation", participant && !ready ? "ready" : null, "Start window");
  }
  if (status === "open" && draft?.status === "active") {
    const side = captainDraftTurn(draft);
    const captain = players.find((player) => same(idFor(player), draft.captains?.[side]));
    const myTurn = participant && same(draft.captains?.[side], userId);
    return flow("draft", myTurn ? "Your turn to pick" : "Captain draft in progress",
      `Pick ${(draft.picks?.length || 0) + 1}/${Math.max(0, capacity - 2)}. Captains choose one player at a time.`,
      captain ? nameFor(captain) : side === "host" ? alphaName : bravoName, myTurn ? "draft" : null);
  }
  if ((freeEights && status === "open" && match.free_eights_waiting_for_voice) || (challenge && status === "ready_check")) {
    // A stale Discord snapshot must not accuse players of being absent.
    const available = freeEights ? voice?.available : voice?.fresh;
    const states = freeEights ? voice?.playerStates || [] : voice?.players || [];
    const connected = (player) => player.status === "in_waiting_room";
    const missing = states.filter((player) => !connected(player));
    const own = states.find((player) => same(idFor(player), userId));
    const allConnected = available && states.length === capacity && missing.length === 0;
    return flow("setup", !available ? "Checking Discord readiness" : allConnected ? "Everyone is in Discord" : "Join the Discord waiting room",
      !available ? "Checking Discord readiness. Keep the lobby open; the next step waits for a current voice check."
        : canStart ? "Both rosters are connected. A captain can now start the match."
          : `${states.filter(connected).length}/${capacity} players connected. ${draft ? "The captain draft follows once everyone is present." : "Maps unlock when everyone is present."}`,
      canStart ? "A team captain" : !available ? "Discord verification" : namesFor(missing) || "Match setup",
      canStart ? "start" : participant && (!available || !own || !connected(own)) ? "voice" : null);
  }
  if (status === "open" && draft?.status === "pending") {
    return flow("draft", "Preparing the captain draft", "Keep the room open while captains are assigned.", "Captain assignment");
  }
  if (mode === "ranked" && status === "ready") {
    return flow("play", "Ready to start", "Everyone is ready and the map is selected. The host starts the match.", alphaName, "start", "Start window");
  }
  if ((freeEights || mode === "money8s") && !locked) {
    return flow("maps", hasMaps ? "Maps selected · teams settling" : "Preparing maps",
      hasMaps ? "Review the series below. Teams lock and play begins when the lobby timer ends." : "The server will reveal the map series when setup is complete.",
      hasMaps ? "Lobby countdown" : "Map selection", null, "Teams lock in");
  }
  if (status === "map_veto" || (!hasMaps && !["in_progress", "ready"].includes(status) && mode !== "tournaments")) {
    return flow("maps", status === "map_veto" ? "Map selection in progress" : "Preparing maps",
      status === "map_veto" ? "Check the map selection below while match setup is completed." : "Maps are selected by the server. Keep the room open for the next step.",
      status === "map_veto" ? "Map selection" : "Match setup", null, "Start window");
  }
  return flow("play", status === "in_progress" ? "Match in progress" : "Ready to play",
    canReport ? "Play the series using the maps and rules below. Report the final series score after play."
      : "Follow the series and rules below. The eligible players report the result after play.",
    participant ? "Both teams · play the series" : "Match participants", canReport && !ownReported ? "report" : null, "Start window");
}
