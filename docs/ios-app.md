# TopFragg iPhone app

This repository contains an iPhone project using Capacitor 8, with bundled React screens, TopFragg artwork, safe-area spacing, bottom navigation and browser-based account connections. The provisional bundle ID is `gg.topfragg.app`.

On October 19, 2026, the user supplied a Codemagic success screenshot for commit `af27476` on `codex/gray-ui-rework`: **TopFragg iPhone simulator check** completed successfully on a Mac mini M2 in 2 minutes 4 seconds and produced `TopFragg-simulator.zip`. This confirms the Xcode simulator build and packaging passed. Runtime behavior has not yet been verified on a simulator or real iPhone; a signed device build, TestFlight upload and deployment of the updated production API remain unconfirmed.

## What you do next on Windows

1. Create a personal [Codemagic account](https://codemagic.io/) and connect the repository containing this code. The source changes must reach that repository before Codemagic can see them.
2. Select the **TopFragg iPhone simulator check** workflow from `codemagic.yaml`. It checks the app on a Mac build machine without Apple signing credentials. Its simulator ZIP cannot be installed on a real iPhone or run on Windows.
3. To install through TestFlight, finish [Apple Developer enrollment](https://developer.apple.com/programs/enroll/). Register the App ID `gg.topfragg.app` and create its App Store Connect app. Confirm the identifier before the first release; it is only a proposed identifier until registered in your account.
4. In Codemagic, add the matching Apple distribution certificate and App Store provisioning profile under **Code signing identities**. Keep private keys and passwords in Codemagic, outside this repository and chat.
5. After the server update below and simulator check succeed, run **TopFragg signed iPhone build**. This produces an IPA; publishing is intentionally not enabled. We still need to configure the Apple integration and a TestFlight upload once your accounts are ready.

Codemagic and Apple account setup are separate from developing this code. No paid build or enrollment has been started by preparing the project. Refer to [Codemagic pricing](https://docs.codemagic.io/billing/pricing/) and [Apple membership](https://developer.apple.com/programs/) for current account costs.

## Server update required before phone testing

- Deploy the updated API before using account Connect buttons in the app. It adds `POST /api/mobile/oauth/ticket` and `GET /api/mobile/oauth/start`.
- Set `TOPFRAGG_PUBLIC_URL` to the actual canonical HTTPS website origin. Existing Google, Kick, Twitch and Discord callback URLs stay on the HTTPS website.
- The native app uses `https://topfragg.gg/api` by default. If the API redirects to `www` or runs on a different canonical host, set the **build-time** `VITE_NATIVE_API_URL` to its final HTTPS `/api` URL in Codemagic. It must match the website origin used by the ticket endpoint; avoid cross-host redirects that drop Authorization headers.
- When `CORS_ORIGIN` restricts web origins, the API additionally accepts the exact `capacitor://localhost` origin. `NATIVE_APP_ORIGINS` can override this list. Native requests still require authentication and all existing restrictions.
- OAuth launch tickets expire after 90 seconds, are single-use, and never put the player's bearer token into a URL. The server rechecks account restrictions when the browser opens the ticket. Tickets are stored in process memory: with multiple API workers or replicas, use sticky routing or replace the ticket store with a shared atomic store before enabling this flow. A restart expires in-flight attempts safely.
- Browser callbacks currently finish on the website. After connecting, tap **Done** to return to the app; the app refreshes the connected account. The separate browser might ask you to sign in to view the website's Settings page, but linking itself was authorized by the launch ticket. Automatic return via verified universal links is a later improvement.

No database migration is needed for this app foundation. Never copy the server `.env` or provider secrets into app build variables. Values starting with `VITE_` are public in the shipped app.

## Local development commands

- `npm run ios:check` — targeted configuration and OAuth security checks; works on Windows.
- `npm run ios:assets` — regenerate the icon and launch images from the existing TopFragg vector logo.
- `npm run ios:build` — bundle the app into the separate ignored `dist-ios` folder. Does not run Prisma generation or change the normal web build.
- `npm run ios:sync` — bundle and copy the app/plugins into the existing iOS project.
- `npm run ios:open` — open Xcode on a Mac.

Capacitor uses Swift Package Manager. Xcode 26 or later and Node 22 or later are required by [Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup). The manual [Codemagic workflows](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/) have no automatic build triggers, publishing or notification recipients.

## Before a public release

Test login/logout, reconnect/cancel for all four providers, email verification, poor network recovery, reconnecting live matches, microphone permissions, keyboard and notch/home-indicator spacing on a real iPhone. Registration currently opens the secure website so the existing Turnstile check stays enforced. Return to the app and sign in after verifying the account.

Push notifications, verified universal links and native background voice are not included. In-app account deletion is not implemented by this foundation and must be provided before submission if required for this account-based app. Review the actual data use and SDK privacy manifests, App Store privacy answers, user-generated-content moderation and all wallet/competition/payment features against [Apple's review guidelines](https://developer.apple.com/app-store/review/guidelines/) before submission. Existing commerce controls are retained; the iOS scaffold itself does not make those features eligible for the App Store. Apple approval is not guaranteed by a successful build.
