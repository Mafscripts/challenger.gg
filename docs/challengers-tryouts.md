# Challengers Try outs

The private Try outs area lives at `/try-outs`, with each matchroom at
`/try-outs/:id`. Only players with the `challengers` profile badge and accounts
with the Admin, Super Admin or CEO role can access it. Moderators do not receive
access automatically. The same restrictions apply to the protected API actions;
generic entity endpoints cannot read or modify Try out rooms or assign badges.

## Enable the database table

This feature adds a `TryoutRoom` table. Before starting the updated API:

```sh
npm run prisma:deploy
npm run prisma:generate
```

Build the website and restart the API using the project's usual deployment
process. No Discord bot restart or Discord permissions are needed. Test and
publish the changes when ready; no automated tests were added or run for this
feature at the user's request.

## Give a player access

In **Admin > Users > Manage > Badges & stream requirements**, enable
**Challengers · Try outs access**. The badge is independent of Verified Player
and Streamer badges, and changing those settings preserves Challengers access.
The player receives the badge and the **Try outs** item in their profile menu
once their account information refreshes (or they reload). Removing the badge
removes server access immediately on subsequent requests.

Players need their Activision ID saved under **Settings > Gaming IDs** to join.
Discord linking, Discord voice membership, Premium and rank are not required.
Existing sign-in requirements, such as email verification and bans, still apply.

## Run a session

1. Open **Profile > Try outs** and create a named session.
2. Players join its waiting room. A session holds up to 16 players, including
   the two teams and substitutes. A player can join one active session at a time.
3. Drag joined players into **Team Alpha** or **Team Bravo**. Drop onto a player
   in the other team to swap them. The team selector provides the same movement
   on mobile and by keyboard. Each playing team holds four players.
4. Generate three distinct maps from the existing Black Ops 7 Hardpoint pool:
   Sake, Colossus, Den, Scar, Gridlock and Hacienda.
5. Start the match once both teams contain four eligible players and the maps
   are ready. Teams and map picks lock while the match is live.
6. Use **Admin score entry** below the map cards to record each map's result
   in order. The input fields unlock when the match starts. Only Admin, Super
   Admin and CEO accounts can save scores. Hardpoint winners score 250 and opponents
   score 0–249. The first team to win two maps wins the BO3; a third map is not
   played after a 2–0 result.

Admins can use **Delete room** on the overview or inside the room to permanently
remove an open or cancelled session, including its roster, maps and chat. The
button asks for confirmation, deletion is audited, and active memberships are
released. Live matches and completed results cannot be deleted this way.

Admins can reset a series to correct results or cancel a session. Resetting
clears map results and unlocks the rosters while keeping the selected maps.
Resetting is refused when a roster member has joined another active session.
Players can leave while the lobby is open. Admins can remove waiting players
before the match starts. Admins can observe the matchroom without joining a
team; joining as a player still requires an Activision ID.

Every room has private chat for its joined players and admins. Messages are
limited to 1,500 characters, a brief posting cooldown applies, and the most
recent 200 messages are retained. The page refreshes room state every five
seconds while visible, pausing during drag operations. Room edits are atomic,
admin controls check the current version, and admin changes are audited.

Try out results stay in their own rooms. They do not change Free 8s ELO, wagers,
wallet balances, tournament prizes or public ladder standings.
