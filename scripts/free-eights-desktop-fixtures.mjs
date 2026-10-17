// In-memory example data for capturing the real desktop React application.
// Every API request is fulfilled here; no database or real account is used.
import { DEFAULT_EIGHTS_GAMES } from "../src/lib/freeEightsGames.js";

export function desktopExample() {
  const now = new Date().toISOString();
  const user = { id: "tutorial-player", username: "tutorialplayer", handle: "tutorialplayer", display_name: "TutorialPlayer",
    full_name: "TutorialPlayer", email: "player@example.invalid", email_verified: true, role: "user", navigation_layout: "topbar",
    avatar_url: "/topfragg-mark.svg", credits: 0, wallet_balance: 0, xp_level: 1, region: "eu", created_date: now };
  const users = [user, ...["Luna", "Atlas", "Nova", "Ghost", "Echo", "Raven", "Ace"].map((name, index) => ({
    id: `example-player-${index + 1}`, username: `tutorial${name.toLowerCase()}`, display_name: name,
    activision_id: `${name}#${1234560 + index}`, role: "user", screenshot_rank: ["diamond", "crimson", "iridescent"][index % 3],
    created_date: now, region: "eu", avatar_url: "/topfragg-mark.svg",
  }))];
  const match = { id: "tutorial-match-DEMO1440", match_type: "8s", game_id: "bo7", game_mode: "Hardpoint", game_mode_display: "Hardpoint",
    best_of: 3, team_size: "4v4", players_per_team: 4, player_capacity: 8, host_id: users[1].id, host_name: "Luna",
    status: "open", entry_fee: 0, amount: 0, play_rule: "controller", created_date: now, updated_date: now,
    free_eights_waiting_for_voice: true };
  const state = { user, users, match, joined: false, inVoice: false, teamsReady: false, rank: null };
  state.players = () => users.filter((row) => state.joined || row.id !== user.id).map((row, index) => ({
    id: `tutorial-membership-${row.id}`, wager_id: match.id, user_id: row.id, user_name: row.display_name,
    username: row.username, display_name: row.display_name, activision_id: row.activision_id, screenshot_rank: row.screenshot_rank,
    avatar_url: row.avatar_url, team: index < 4 ? "host" : "challenger", is_captain: index === 0 || index === 4,
    joined_date: now, created_date: now,
  }));
  return state;
}

export async function installDesktopFixtures(context, state) {
  const requests = [];
  await context.addInitScript(() => {
    localStorage.setItem("auth_token", "tutorial-example-token-no-server-access");
    sessionStorage.setItem("bootstrap:tutorial-player", "1");
  });
  await context.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.slice(5);
    requests.push(`${request.method()} ${path}`);
    let body = {}; try { body = request.postDataJSON() || {}; } catch { /* GET requests have no body. */ }
    const rank = () => ({ rank: state.rank, status: "idle", attempts: [], failed_attempts: 0 });
    let response = [];
    if (path === "auth/me") {
      if (request.method() === "PATCH") Object.assign(state.user, body);
      response = state.user;
    } else if (path.startsWith("public/player-overlay/")) response = {player:state.user,stats:{elo:0,has_ranked_matches:false,earnings:0},trophies:{}};
    else if (path === "public/free-eights-games") response = { games: DEFAULT_EIGHTS_GAMES };
    else if (path === "rank-verification/me") response = rank();
    else if (path === "rank-verification/select") { state.rank = body.rank; state.user.screenshot_rank = body.rank; response = rank(); }
    else if (path === "discord/connect") {
      Object.assign(state.user, {discord_user_id:"111111111111111111",discord_username:"tutorialplayer",discord_display_name:"TutorialPlayer",discord_connected_at:new Date().toISOString()});
      response = {authorization_url:`${state.origin}/settings?discord=connected#settings-discord`};
    } else if (path === "discord/sync") response = {success:true,roleAssigned:true,profileRefreshed:true};
    else if (path === "discord/status") response = {connected:Boolean(state.user.discord_user_id),configured:true};
    else if (path === "discord/membership") response = {success:true,member:true,is_member:true};
    else if (path.startsWith("discord/free-eights")) response = { enabled:true,configured:true,fresh:true,snapshot_age_ms:0,
      waiting_room_url:"https://discord.com/channels/111111111111111111/222222222222222222",
      players:state.players().map((player) => ({user_id:player.user_id,team:player.team,status:state.teamsReady?"in_team_voice":state.inVoice?"in_waiting_room":"not_in_waiting_room"})) };
    else if (path.startsWith("functions/")) {
      const name = path.slice("functions/".length);
      response = {success:true};
      if (name === "getFreeEightsOverview") response = {success:true,current_user:state.user,lobbies:[state.match],counts:{[state.match.id]:state.players().length},active_lobby:state.joined?state.match:null};
      else if (name === "getFreeEightsStandings") response = {success:true,rows:state.users.map((user,index)=>({id:`stats-${user.id}`,user_id:user.id,user_name:user.display_name,free_eights_elo:210-index*17,wins:12-index,losses:3}))};
      else if (name === "getFreeEightsPlayerStats") response = {success:true,stats:Object.fromEntries(state.players().map((player,index)=>[player.user_id,{...state.users.find(user=>user.id===player.user_id),wins:8+index,losses:3,free_eights_elo:120+index*17}]))};
      else if (name === "acceptWager") {state.joined=true;response={success:true,wager:state.match};}
      else if (name === "syncEightsLobby") response = {success:true,wager:state.match};
      else if (name === "getChallengeActivity") response = {success:true,matches:[]};
      else if (name === "getCompetitionTrophyCounts") response = {success:true,counts:{}};
      else if (name === "getEightsLiveUpdatesToken") response = {success:false};
    } else if (path.startsWith("profile/trophies")) response = {success:true,counts:{}};
    else if (path.startsWith("profile/")) response = [];
    else if (path.startsWith("entities/")) {
      const [,entity,id] = path.split("/");
      let filter = {}; try { filter = JSON.parse(url.searchParams.get("filter") || "{}"); } catch { /* Empty filter. */ }
      if (entity === "User") response = id ? state.users.find(user=>user.id===id) || state.user : state.users;
      else if (entity === "Wager") response = id ? state.match : filter.host_id || filter.challenger_id ? [] : [state.match];
      else if (entity === "WagerParticipant") response = filter.user_id && !state.joined ? [] : state.players();
      else if (entity === "Wallet") response = [{id:"tutorial-wallet",user_id:state.user.id,available_balance:0,withdrawable_balance:0}];
      else if (entity === "PlayerProfile") response = [{id:"tutorial-profile",user_id:state.user.id,avatar_url:"/topfragg-mark.svg"}];
      else if (entity === "XPStats" || entity === "EightsStats") response = [];
      else response = id ? null : [];
    }
    await route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Private-Network":"true"},body:JSON.stringify(response)});
  });
  return requests;
}
