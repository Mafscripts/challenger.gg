**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Prepare the local PostgreSQL schema once:

```bash
npm run prisma:deploy
```

Run the app and local API together:

```bash
npm run dev
```

The website runs on `http://localhost:5173` and the API (including the local
database connection) runs on `http://localhost:4000`. Use `npm run dev:web`
only when you intentionally want to run the website without the local API.

**Reverse proxy and IP bans**

The API trusts loopback proxies by default, for Nginx running on the same host. For other deployments, set `TRUST_PROXY` to the trusted proxy addresses/CIDRs or hop count. Use `TRUST_PROXY=false` to disable proxy trust. The proxy must send `X-Forwarded-For` (or `X-Real-IP` when no forwarded chain is present). IPs are captured at registration, login and when an authenticated session first uses a different public address; private/loopback addresses are excluded.

For Cloudflare -> Nginx -> API, preserve the chain using `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. The API recognizes Cloudflare's published networks and only accepts `CF-Connecting-IP` after verifying a Cloudflare hop from the TCP peer through trusted proxies. Cloudflare edge addresses are excluded from player-IP matching, visitor history and IP-ban targets, including previously stored addresses. Real visitor addresses populate on subsequent activity. Keep `src/lib/cloudflareIps.js` aligned with Cloudflare's official IPv4/IPv6 lists. Do not replace the chain with unverified client-supplied headers.

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
