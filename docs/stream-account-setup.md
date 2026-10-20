# YouTube and Kick account connections

Settings → Connections → Streaming accounts contains **Connect YouTube** and **Connect Kick**. These use the provider's sign-in screen and save the authenticated channel identity. Public channel links remain available separately under Channel links & socials. Twitch retains its existing connection flow.

## Server environment

Add the following to the server's `.env`, using client credentials from your own developer applications:

```dotenv
TOPFRAGG_PUBLIC_URL="https://topfragg.gg"
YOUTUBE_CLIENT_ID="your-google-oauth-client-id"
YOUTUBE_CLIENT_SECRET="your-google-oauth-client-secret"
YOUTUBE_OAUTH_REDIRECT_URI="https://topfragg.gg/api/stream-accounts/youtube/callback"
KICK_CLIENT_ID="your-kick-client-id"
KICK_CLIENT_SECRET="your-kick-client-secret"
KICK_OAUTH_REDIRECT_URI="https://topfragg.gg/api/stream-accounts/kick/callback"
```

Keep the existing strong `JWT_SECRET`. The browser-bound OAuth state is encrypted with it. Optionally set a separate strong `STREAM_OAUTH_STATE_SECRET` instead. Keep all secrets on the server; never use a `VITE_` prefix for them or put them in the frontend.

## YouTube

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select your project and enable **YouTube Data API v3**.
2. Configure Google Auth Platform's branding, audience and consent screen. The connection requests the read-only `https://www.googleapis.com/auth/youtube.readonly` scope.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `https://topfragg.gg/api/stream-accounts/youtube/callback`.
4. Copy the client ID and secret to the environment variables above. While the Google app is in testing, add the accounts you will test with as test users. Follow Google's publishing/verification requirements before offering access to the whole community.

See [Google's web-server OAuth guide](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) and [the channels.list endpoint](https://developers.google.com/youtube/v3/docs/channels/list). The callback requests the authenticated user's own channel with `mine=true`; an account without a YouTube channel gets an explanatory error.

## Google branding review

The public Privacy Policy is `/privacy`, linked from the website footer, the existing Terms privacy section and Streaming accounts. Deploy the frontend before setting `https://topfragg.gg/privacy` as the Privacy Policy URL in Google Auth Platform → Branding. It describes the actual channel identity request, storage, use, public display and disconnect controls. Updating the page alone does not guarantee Google's approval.

If Google reports that the home page is not registered to you, verify the Domain property `topfragg.gg` in [Google Search Console](https://search.google.com/search-console/) using the same Google account associated with the OAuth project. Add the exact TXT record Google provides at your domain's DNS provider, then click Verify. Keep the TXT record after verification. Follow Google's displayed waiting period before retrying branding review (the current issue dialog asks for 24 hours).

Declare `https://www.googleapis.com/auth/youtube.readonly` in Data Access → Add or remove scopes. Branding and sensitive data access are separate reviews. Only choose "I have fixed the issues" after the live policy and domain verification are ready.

## Kick

1. Register your application in Kick's developer settings and enable the developer features if your account requires them.
2. Add this exact redirect URI: `https://topfragg.gg/api/stream-accounts/kick/callback`.
3. Copy the app's client ID and secret to the environment variables above. The connection requests only `channel:read`; it does not request stream keys or permission to post messages.

See [Kick's OAuth documentation](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow) and [the channels endpoint](https://docs.kick.com/apis/channels). Kick uses PKCE and returns the authenticated user's channel when called without channel filters.

## Deploy and verify

Deploy both the frontend and API, then restart the API process so it reads the new environment. No database migration is required; verified identities are stored in the existing User metadata. The Connect buttons remain visible with an administrator setup message when credentials are missing.

Test both connections with your own accounts. Confirm the provider's real consent screen opens, the correct channel appears as Connected after returning, and Disconnect removes the connection. Test cancellation and an account with no YouTube channel as well.

The provider access token is used only during the callback to read the channel identity; tokens and refresh tokens are not stored. These connections verify account ownership. They do not continuously check whether someone is live. Match entry still accepts the supported saved channel links as well as the verified connections.
