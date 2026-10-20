# TopFragg iPhone app

This repository contains an iPhone project using Capacitor 8, with bundled React screens, TopFragg artwork, safe-area spacing, bottom navigation and browser-based account connections. The user registered the bundle ID `gg.topfragg.app` and created the **Topfragg.gg** app record in App Store Connect.

The simulator and signed Codemagic builds have passed. The first real-device login on build **1.0 (2)** showed **Load failed**: a live probe confirmed `https://topfragg.gg/api/auth/login` redirects its preflight to `http://www.topfragg.gg/...`, while the canonical `https://www.topfragg.gg/api` responds directly with correct native CORS headers. The app now defaults to that canonical HTTPS host. The user deployed the production API, installed build **1.0 (3)** and supplied an authenticated iPhone screenshot. Subsequent mobile layout fixes need a new signed build and real-device retest. The external group's last reported state was waiting for Apple's beta review.

## What you do next on Windows

1. Create a personal [Codemagic account](https://codemagic.io/) and connect the repository containing this code. The source changes must reach that repository before Codemagic can see them.
2. Select the **TopFragg iPhone simulator check** workflow from `codemagic.yaml`. It checks the app on a Mac build machine without Apple signing credentials. Its simulator ZIP cannot be installed on a real iPhone or run on Windows.
3. To install through TestFlight, finish [Apple Developer enrollment](https://developer.apple.com/programs/enroll/). Register the App ID `gg.topfragg.app` and create its App Store Connect app. Confirm the identifier before the first release; it is only a proposed identifier until registered in your account.
4. In Codemagic Settings, add the Apple Developer Portal integration named exactly **Codemagic TopFragg**. The user has confirmed this integration and uploaded the matching Apple Distribution certificate under the reference **topfragg-distribution**. Under **Code signing identities → iOS provisioning profiles**, upload the downloaded App Store Connect `.mobileprovision` file with reference **topfragg-appstore**. Confirm its bundle ID is `gg.topfragg.app` and its Certificate column shows a green checkmark. Keep private keys and passwords in Codemagic, outside this repository and chat.
5. After these settings and the server update below are ready, manually run **TopFragg signed iPhone build** on the latest `codex/gray-ui-rework` commit. It produces an IPA and uploads it to App Store Connect through the saved integration. Once Apple finishes processing, use the app's **TestFlight → Internal Testing** section to add your own tester and install through the TestFlight iPhone app. Export-compliance questions or agreements may still require action in App Store Connect. Automatic beta review submission, App Store review submission and public release are disabled.

Codemagic and Apple account setup are separate from developing this code. No paid build or enrollment has been started by preparing the project. Refer to [Codemagic pricing](https://docs.codemagic.io/billing/pricing/) and [Apple membership](https://developer.apple.com/programs/) for current account costs.

## Server update required before phone testing

- Deploy the updated API before using account Connect buttons in the app. It adds `POST /api/mobile/oauth/ticket` and `GET /api/mobile/oauth/start`.
- Set `TOPFRAGG_PUBLIC_URL` to the actual canonical HTTPS website origin. Existing Google, Kick, Twitch and Discord callback URLs stay on the HTTPS website.
- The native app uses `https://www.topfragg.gg/api` by default. If the API runs on a different canonical host, set the **build-time** `VITE_NATIVE_API_URL` to its final HTTPS `/api` URL in Codemagic. Remove or update any older override pointing to `https://topfragg.gg/api`. It must match the website origin used by the ticket endpoint; use `TOPFRAGG_PUBLIC_URL=https://www.topfragg.gg` on the server for native account connections. Avoid redirects: preflights can fail, HTTP downgrades are blocked by iOS, and cross-host redirects can drop Authorization headers.
- Codemagic now checks the live API health and login preflight before bundling. The build fails if this host redirects, cannot be reached, or does not allow native POST requests with Content-Type and Authorization. This checks connectivity without using an account or password; a successful build still needs a real iPhone login test.
- When `CORS_ORIGIN` restricts web origins, the API additionally accepts the exact `capacitor://localhost` origin. `NATIVE_APP_ORIGINS` can override this list. Native requests still require authentication and all existing restrictions.
- OAuth launch tickets expire after 90 seconds, are single-use, and never put the player's bearer token into a URL. The server rechecks account restrictions when the browser opens the ticket. Tickets are stored in process memory: with multiple API workers or replicas, use sticky routing or replace the ticket store with a shared atomic store before enabling this flow. A restart expires in-flight attempts safely.
- Browser callbacks currently finish on the website. After connecting, tap **Done** to return to the app; the app refreshes the connected account. The separate browser might ask you to sign in to view the website's Settings page, but linking itself was authorized by the launch ticket. Automatic return via verified universal links is a later improvement.

No database migration is needed for this app foundation. Never copy the server `.env` or provider secrets into app build variables. Values starting with `VITE_` are public in the shipped app.

## Local development commands

- `npm run ios:check` — targeted configuration, OAuth, account-deletion and community-safety security checks; works on Windows.
- `npm run ios:api-check` — read-only live HTTPS/CORS checks for the API used by the next native build.
- `npm run ios:assets` — regenerate the icon and launch images from the existing TopFragg vector logo.
- `npm run ios:build` — bundle the app into the separate ignored `dist-ios` folder. Does not run Prisma generation or change the normal web build.
- `npm run ios:sync` — bundle and copy the app/plugins into the existing iOS project.
- `npm run ios:open` — open Xcode on a Mac.

## Responsive app checks

`scripts/mobile-layout-check.mjs` exercises the local Vite server in iOS build mode at 320, 390 and 430 CSS pixels, and checks tablet/desktop web layouts at 768 and 1440 pixels. Start Vite with `--mode ios --host 127.0.0.1 --port 5180`, then run the script with the path to an installed Playwright `index.mjs` (or use a local `playwright` package). It uses a separate headless Edge session and intercepted fake API responses; no real account, message or competition is changed. Reports and screenshots go to ignored `tmp/mobile-audit-*` folders.

The checks cover the main competition, Settings, Messages, Teams and Admin screens; screen bounds for header menus and message controls; recipient search; emoji selection; and both layout-viewport and visual-viewport keyboard resizing. Intentionally scrollable tables and tab strips are excluded from page overflow failures. `npm run ios:check` also checks active bottom tabs for competition pages and match rooms. Browser emulation does not replace real iPhone checks for the keyboard, safe-area insets, native plugins or microphone access.

Capacitor uses Swift Package Manager. Xcode 26 or later and Node 22 or later are required by [Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup). The manual [Codemagic workflows](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/) have no automatic build triggers or notification recipients. Only the signed workflow uploads to App Store Connect; it does not submit reviews or release the app publicly. The simulator workflow stays unsigned and does not upload to Apple.

## Before a public release

Test login/logout, reconnect/cancel for all four providers, email verification, poor network recovery, reconnecting live matches, microphone permissions, keyboard and notch/home-indicator spacing on a real iPhone. Registration currently opens the secure website so the existing Turnstile check stays enforced. Return to the app and sign in after verifying the account.

The owner requests worldwide availability and has clarified that wallet, Cash Matches, Money 8s and tournament features must remain in the iPhone app. On October 20, 2026, the owner confirmed that all balances and prizes are test credits, without monetary value or payout. These features remain available; no iOS-only route restriction or monetary-record filtering is applied. The public iPhone build explicitly disables purchases through its build configuration. The backend blocks deposits, purchases, subscriptions, conversions and withdrawals while `PUBLIC_COMMERCE_ENABLED` is false. Keep that server flag false, and keep `VITE_PUBLIC_COMMERCE_ENABLED` false for the website. Visible notices explain that dollar symbols represent simulated units and that credits cannot be redeemed or paid out. Monthly rewards are labeled as 100 test credits.

Account deletion is now available under **Settings → Account & security → Delete account**. It requires the current password and exact account name. Active competitions, unresolved financial obligations and platform ownership prevent immediate deletion and direct the user to Support. For this confirmed test-only service, set `TEST_CURRENCY_ONLY=true` on the server so virtual balances can be discarded with the account. If this server setting is absent or false, nonzero balances remain protected from deletion; a client cannot override it. Do not apply the setting to a service holding real monetary balances. The existing deletion transaction removes personal account records and anonymizes shared competition records. No real account was deleted during development. Deploy `POST /api/auth/delete-account` before testing this screen on a phone.

Direct-message conversations now include **Report or block player**. Blocking is enforced on the server in either messaging direction. Reports create private, high-priority tickets in the existing staff support queue; staff must monitor and respond to that queue. Deploy `/api/community/*` with the updated message action before phone testing. Existing database models are reused; no schema migration is introduced.

Push notifications, verified universal links and native background voice are not included. Review the actual data use and SDK privacy manifests, App Store privacy answers, user-generated-content moderation and all wallet/competition/payment features against [Apple's review guidelines](https://developer.apple.com/app-store/review/guidelines/) before submission. The owner must confirm artwork rights, age-rating and privacy declarations, reviewer contact and a working review account. Metadata and screenshots still need to be completed in App Store Connect; public submission has not been performed. Existing commerce controls are retained; the iOS scaffold itself does not make those features eligible for the App Store. Apple approval is not guaranteed by a successful build.

## App Store text draft

These values are prepared for the existing English (U.S.) record, not submitted to Apple. Verify against the final signed build and live API before using them.

- Name: **Topfragg.gg**
- Subtitle: **Competitive gaming companion**
- Support URL: `https://www.topfragg.gg/support`
- Privacy policy URL: `https://www.topfragg.gg/privacy`
- Public support email: `support@topfragg.gg` (owner confirmed).
- Copyright: **2026 Topfragg LLC** (owner confirmed).
- Requested availability: worldwide. Actual storefront selection is still pending.

The `/support` website route has a public contact page for signed-out visitors; signed-in users retain their private ticket center. Deploy this website change before final submission so the App Store support link works without an account. It does not require replacing the selected signed iPhone build merely to update the external support URL's contents.

Description draft:

> Find your next match and connect with the TopFragg community. Organize competitive gaming matches, build your team, follow standings and results, and stay in touch through direct messages.
>
> Explore Ranked, XP Matches, Free 8s, Money 8s and tournaments. Manage your player profile, gaming IDs and supported community connections from one account.
>
> Wallet balances, entry amounts and prizes in this release are virtual test credits with no monetary value. They cannot be purchased, redeemed or paid out. Dollar symbols represent simulated units. TopFragg is a companion for organizing matches played in supported games; those games are not included in this app.

App Review notes draft:

> Wallet, Cash Matches, Money 8s and tournament features remain visible to every user. They use virtual test credits only, without monetary value, redemption or cash payout. Dollar symbols denote simulated units. Purchases, deposits, withdrawals, premium subscriptions and purchases with credits are disabled in this release. Staff can grant test credits, and the monthly 8s reward is 100 virtual test credits.
>
> Account deletion is under Settings → Account & security → Delete account. It requires the current password and exact account name. Use an ordinary test account without active matches; platform-owner accounts require transfer of ownership before deletion. In direct-message conversations, the shield button offers reporting and blocking. Reports enter the staff support queue. Website-based account connections use the secure browser and return to the app after the user closes it.
>
> Supply a working ordinary review account and reviewer contact information directly in App Store Connect's App Review fields. Do not put credentials in this repository. If a region/network restriction prevents reviewer access, resolve that restriction before submission rather than providing an unusable account.
