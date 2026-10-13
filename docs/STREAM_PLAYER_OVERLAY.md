# Player stream overlay

The player overlay is a standalone public browser source at `/overlay/player/:identifier`.
The identifier can be a username or the player's stable user ID. Settings copies the ID-based
URL so renaming a player does not break their source.

## Access

- Own profile: **Your Twitch player overlay**.
- Settings: **Connections → Stream overlay**.
- The settings panel includes a live preview, **Copy URL**, and setup instructions.
- OBS source size: **1920 × 160**. Scale and position the source on the stream canvas.
- The document around the dark player bar is transparent, with no navigation or login.
- The source also scales as a complete bar for smaller browser viewports; it keeps every trophy counter.

## Presentation and updates

The bar includes the existing Topfragg shield, TOPFRAGG.GG wordmark, player avatar,
saved name color/animated effect, public badges, ranked ELO, wins/losses, win rate,
lifetime USD earnings, and gold/silver/bronze/premium/Topfragg/hosted trophies, including zeros.
Name effects reuse the website's CSS and assets.

The source requests `GET /api/public/player-overlay/:identifier` every 15 seconds after
the preceding request completes. It updates the existing components without refreshing
the document. On temporary failures, it preserves the last stats, shows a reconnecting
indicator, and retries with a delay of up to 60 seconds.

The API publishes a fixed set of presentation fields and aggregate stats. It does not
return email, wallet balances, transactions, full inventories, or arbitrary account metadata.
Trophies use the existing shared server trophy-count rules. Earnings and overall record
follow the profile page calculations. Ranked stats follow the profile's latest-season ordering.
Snapshots have a bounded five-second server cache shared by concurrent readers; responses
use `Cache-Control: no-store` for browsers and proxies.

## Deployment

Deploy both the frontend and API changes. No database migration is needed.
The overlay route bypasses the normal authenticated app shell and the API requires no session,
so OBS can load it without signing in. The web server must serve the SPA entry point for
`/overlay/player/*`, as it does for other client-side routes.

No builds, tests, type checks, or browser/OBS verification were run, per the current workflow.
Player stats, transparency, animated names, URLs after a username change, and reconnecting
behavior remain for the user's deployment checks.

OBS reference: https://obsproject.com/kb/browser-source
