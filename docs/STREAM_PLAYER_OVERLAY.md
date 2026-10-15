# Player stream overlay

The player overlay is a standalone public browser source at `/overlay/player/:identifier`.
The identifier can be a username or the player's stable user ID. Settings copies the ID-based
URL so renaming a player does not break their source.

## Access

- Own profile: **Your Twitch player overlay**.
- Settings: **Connections → Stream overlay**.
- The settings panel includes a live preview, **Copy URL**, and setup instructions.
- Choose one of eleven styles in the settings preview. Original blue uses no theme
  parameter; Orange, Black & white and Christmas use `?theme=orange`, `?theme=mono`,
  and `?theme=xmas`. Existing URLs retain their original theme. The Topfragg
  shield and white/cyan wordmark retain their original branding in the first four variants.
  Christmas adds ivory stats, an evergreen player panel, red accents, a Santa hat and
  holly on the shield, snowy pines, gently twinkling lights, falling snow, and a candy-striped trim.
- **Signal**, the fifth style, uses `?theme=signal`. It has its own layout: an acid-lime
  brand tab, charcoal player and stat panels, lavender earnings, and an ivory trophy strip.
  The shield uses the Signal palette and the wordmark stays visible. A subtle scan moves
  along the player panel; values animate only when they change. Saved player name effects,
  badges, every stat, all six trophy counters, and the 1920×80 base dimensions are retained.
- Five additional designs use the same data and canvas, with independent layouts:

  | Style | URL parameter | Design |
  | --- | --- | --- |
  | Apex | `?theme=apex` | Red racing masthead, angular player panel, white timing board and dark trophies. |
  | Obsidian | `?theme=obsidian` | Black and champagne, trophy gallery before a centered serif player nameplate. |
  | Aurora | `?theme=aurora` | Indigo, mint and violet floating panels with transparent gutters and separate stat capsules. |
  | Terminal | `?theme=terminal` | Green phosphor, monospace typography and two rows of inline stats and trophies. |
  | Editorial | `?theme=editorial` | Ivory score sheet, vermilion masthead, dark green nameplate, trophies before serif stat columns. |

  Values animate only when they change. Reduced-motion preferences disable the
  decorative light and cursor animations. Every design retains saved name effects,
  badges, the six stats, all six trophy counters and a reconnecting indicator.
- **Hyperdrive**, the eleventh style, uses `?theme=hyperdrive`. Cyan and magenta
  light trails cross a moving grid behind the content. The logo floats inside
  counter-rotating rings, wordmark letters ripple, the player panel catches light,
  stat borders highlight in sequence, and trophies float with staggered halos.
  These continuous loops use transforms and opacity with stable elements across
  data refreshes. Numbers remain readable and animate only on actual value changes.
  All effects stay inside the same 1920×80 base canvas. Reduced-motion preferences
  show the complete design without movement. No video, audio or additional API
  polling is used for animation.
- OBS source width: match the stream canvas (for example **1920** for 1080p or **2560** for 1440p), height **80**. Align at **X: 0, Y: 0** without shrinking the source.
- The document around the player bar is transparent, with no navigation or login.
- The canvas uses the full browser viewport width with no maximum width. It scales as a complete bar below 1920px and expands its layout above that width; it keeps every trophy counter. Aurora includes transparent gutters inside that same canvas.

## Presentation and updates

The bar includes the existing Topfragg shield, TOPFRAGG.GG wordmark,
saved name color/animated effect, public badges, ranked ELO, Free 8s ELO and SR, wins/losses, win rate,
lifetime USD earnings, and gold/silver/bronze/premium/Topfragg/hosted trophies, including zeros.
Name effects reuse the website's CSS and assets. The Topfragg shield stays still
except in Hyperdrive, where it floats inside animated rings.
In the first four themes, the TOPFRAGG.GG letters fly into place, hold together for three seconds, then fall apart
and repeat in an eight-second cycle. Only transforms and opacity animate; stable letter keys
keep the animation running across data refreshes. Reduced-motion preferences show a static wordmark.
Christmas decorations also keep stable keys across updates and animate only transforms
and opacity. Reduced-motion preferences show static lights, hat, and snow. Every theme
stays within the same 80px browser source; decorations do not extend outside the bar.
Christmas values animate when the displayed value changes, rather than flashing on
every background refresh.

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
Adding themes to an existing overlay deployment requires only the frontend.
The overlay route bypasses the normal authenticated app shell and the API requires no session,
so OBS can load it without signing in. The web server must serve the SPA entry point for
`/overlay/player/*`, as it does for other client-side routes.

The Christmas addition was verified with a production frontend build, targeted ESLint,
and browser checks using public player stats at 1920×80 and 2560×80. The four theme
URLs, all six trophies, transparent page background, existing animated player name,
and the settings theme picker/preview URL were checked. A shared app-shell minimum
height no longer expands an overlay preview beyond its intended 80px height.
OBS itself, username changes, and reconnecting behavior were not exercised in these checks.

OBS reference: https://obsproject.com/kb/browser-source
