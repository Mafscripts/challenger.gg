# Match cancellation and chat stability

Cancelled matches remain stored for history, refunds and audit records. This update changes room access and loading; it does not delete those records or change cancellation permissions, voting thresholds, refunds or ELO rules.

## Cancellation

- After successful cancellation, the current room is replaced in browser history by its competition overview.
- A fresh server read checks the status when opening a room. Direct URLs and browser Back cannot restore a cancelled match as an active room.
- Free 8s, Money 8s, wagers, Ranked, XP and tournament match rooms have cancellation redirects. Tournament rooms also check their parent tournament's cancellation status.
- Rooms are keyed by match ID so a slow request from an old room cannot overwrite the next room's state.
- A late background read cannot undo a cancellation or replace a newer match record. Newer result corrections remain supported.
- Free/Money 8s cancellation publishes an update through the existing lobby WebSocket.
- The server rejects new chat posts to cancelled matches and tournament matches whose parent was cancelled. Completed match history remains available.
- Cancelled rooms skip unnecessary roster/setup loading. Tournament rooms now refresh their match and parent status every three seconds while visible, and on window focus.

## Shared chat

- Overlapping polls/focus refreshes share one in-flight read.
- A confirmed send remains visible if a poll that started before it returns an older snapshot. Acknowledged messages are deduplicated by ID.
- Failed reads preserve messages and show a retry status. A later successful read clears the error.
- An unchanged snapshot does not redraw the message list.
- Each room gets its own chat state; late reads/sends from another room are discarded.
- The list follows new messages only while the user is near the bottom, or after their own send. It also follows the newest message when a full message window retains the same count.
- Polling pauses while the tab is hidden. Sending has an immediate in-flight guard against repeated submissions.
- Chat reuses the authenticated account context instead of adding an authentication request before it can be used.
- Ranked, XP and tournament background reloads retain the visible room and chat; only the initial room load uses the full-page loading screen. Failed background reloads retain the last valid room.
- Free 8s read-only functions no longer clear authentication/entity caches after every refresh.

## Files changed in this update

- `src/components/match/MatchChat.jsx`
- `src/components/match/CancelledMatchRedirect.jsx`
- `src/components/match/useRoomRecord.js`
- `src/lib/matchChatFeed.js`
- `src/lib/cancelledMatchRoom.js`
- `src/api/base44Client.js`
- `src/pages/EightsMatchRoom.jsx`
- `src/pages/WagersMatchRoom.jsx`
- `src/pages/RankedMatchRoom.jsx`
- `src/pages/XPMatchRoom.jsx`
- `src/pages/TournamentMatchRoom.jsx`
- `server/routes/functions.js`
- `server/match-room-stability.test.js`
- `docs/MATCH_ROOM_STABILITY.md`

## Verification

Automated tests use local HTTP requests, controlled delayed promises and in-memory database adapters. They cover overlapping refreshes, send/poll races, deduplication, failure recovery, stale room responses, rolling windows, redirect destinations and cancelled-room server chat protection. Existing Free 8s ELO/Discord tests remain part of the regression suite.

```sh
node --test server/*.test.js discord/*.test.js
npm run build
```

No database migration, new environment variables or bot configuration is required. Deploy the frontend and backend together.

Manual browser checks after deployment:

1. Cancel a test match successfully. Confirm return to the correct competition page. For a vote, first obtain the existing required approvals.
2. Press Back, refresh, and paste the old room URL. Confirm it redirects instead of rendering an active room.
3. Keep a second player/staff browser open while cancelling. Confirm its room exits after the live update or next status refresh.
4. Send during a slow chat refresh. Confirm the message remains visible exactly once.
5. Interrupt the connection temporarily. Confirm messages remain visible, the retry status appears, and recovery clears it.
6. Read older messages while another player sends. Confirm your scroll position is not forced to the bottom. At the bottom, confirm new messages remain visible even after reaching the message limit.
7. Switch rooms during a slow load or send. Confirm the new room has its own messages/draft.
8. Refresh a room or submit a normal ready/score action. Confirm the chat stays mounted and your unsent draft remains present.

Production database latency, real browser history/scroll behavior and actual Discord moves still require the manual/live checks above.
