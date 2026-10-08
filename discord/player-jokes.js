import { randomInt } from "node:crypto";

export const playerJokes = Object.freeze([
  "aimed at the enemy and somehow hit next Tuesday. 🎯",
  "went 0_o so hard the scoreboard asked if the controller was connected. 🎮",
  "has movement sponsored by the respawn screen. 💀",
  "isn't missing shots — just warning the walls. 🧱",
  "called out ‘one shot’ after doing zero damage. 📢",
  "holds angles so patiently the enemy already started the next match. ⏳",
  "has a minimap, but apparently it's just decoration. 🗺️",
  "is the reason the team has a ‘we go next’ button. 🔄",
  "reloaded with 29 bullets because that last bullet looked suspicious. 🔫",
  "brought a warm-up performance to the grand final. 🏆",
  "plays hide and seek, but the enemy always finds them first. 👀",
  "threw a trophy system and expected an actual trophy. 🏅",
  "has elite movement between the lobby and the respawn screen. 🏃",
  "heard ‘rotate’ and spun around in the spawn. 🌀",
  "is carrying the team... straight back to the lobby. 😂",
  "missed so many shots the enemy sent a thank-you message. 💌",
]);

export function playerJokePayload(userId) {
  return {
    content: `😂 <@${userId}> ${playerJokes[randomInt(playerJokes.length)]}`,
    allowedMentions: { parse: [] },
  };
}
