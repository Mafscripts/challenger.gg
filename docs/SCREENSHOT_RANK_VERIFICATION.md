# Screenshot ranks

Players upload a rank card from their own profile. Supported profile pills are
Diamond, Crimson, Iridescent and Top 250. This is a separate screenshot rank:
existing Topfragg ELO, Free 8s ELO and match results are unchanged. No username,
Activision ID, or screenshot ownership check is performed.

## Recognition

The four user-provided images are stored in `server/rank-references/`. The server
decodes uploads with Sharp and uses OpenCV ORB features and RANSAC homography to
find the emblem, including inside a larger screenshot. Geometry and distributed
shape matches are required; hue similarity contributes only 10% to the match
score. Division numerals and Top 250 placement are excluded from the reference
feature mask. Rank text alone and color alone cannot approve a rank. Reference
artwork must match; a different season's emblem may require new references.

The score is a matching heuristic, not a statistical probability. Ambiguous or
insufficient matches return no rank. A worker thread processes images, with a
bounded queue and timeout, so recognition does not block the API's event loop.
See the [OpenCV feature-matching documentation](https://docs.opencv.org/4.x/d7/dff/tutorial_feature_homography.html).

PNG, JPEG and WebP are accepted up to 2 MB and 20 million decoded pixels.
Animated images, SVG, remote URLs and unreadable files are rejected. Images are
normalized to JPEG with a maximum side of 1600 pixels; excessively detailed
images must be cropped. Screenshots stay private in the database, accessible
only to their submitting player and admin or higher, through authenticated API
requests. Status/list responses never include image bytes.

## Failure and review flow

- A recognized rank updates `User.metadata.screenshot_rank` and resets the
  consecutive failed-check counter.
- A valid but unrecognized image increments that counter. On failure five,
  further uploads stop and the request enters `manual_review`.
- The five latest attempts are retained. Re-uploading the same file is
  idempotent and does not add another failure. Uploads have a five-second cooldown.
- Invalid files, checker outages, queue pressure and transport failures do not
  count as failed recognition.
- Admin → **Verify Rank** shows the review queue and private screenshots. Click
  a screenshot to enlarge it. Choose a player to manually adjust an existing
  rank, even when that player has no pending request.
- **Approve / set rank** applies the chosen rank or removes it, and locks
  automatic uploads. This protects a manual demotion from immediate overwrite.
- **Reject submission** locks the request and leaves an existing rank unchanged.
- **Reopen uploads** resets failed checks and clears the retained screenshots,
  allowing new uploads while keeping the current profile rank.
- Reviews require a reason and write an `AdminAction` audit record. Concurrent
  submissions and reviews share a per-user PostgreSQL transaction lock. Stale
  admin decisions require refreshing the request.

No screenshots or rank decisions can be created through the generic entity API.
Players cannot edit `screenshot_rank` directly, including through `/auth/me`.

## Deployment

No new API key or environment variable is needed. The feature uses local image
matching and the existing database and authentication. Run from the application
directory on the server:

```sh
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart all
```

Migration: `20261007120000_add_screenshot_rank_verification`. It adds one private
`RankVerification` table; public rank labels use the existing user metadata.
Keep the four reference PNGs with the backend files when deploying. The OpenCV
package runs only in the server worker, never in the browser bundle. Existing
Prisma migration failures must be resolved before applying this migration.

## Manual checks

1. Open your own profile and upload each supplied rank image. Confirm the
   corresponding pill appears immediately and after refresh; another player
   should see the pill but no private screenshots.
2. Try a slightly changed hue/brightness, compressed JPEG, altered division
   numeral, and an emblem within a larger screenshot. Clear matches should be
   accepted; unclear or different artwork can request a clearer screenshot.
3. Upload five different readable images without a supported emblem, allowing
   five seconds between uploads. Confirm the counter reaches five and admin
   review replaces the upload action. The same file should not add attempts.
4. In admin, open Verify Rank, enlarge screenshots, approve a rank, reject a
   request and reopen uploads. Confirm each action appears in audit logs.
5. Manually lower or remove a player's rank. Confirm the profile updates after
   refresh and the player cannot override it by uploading another image until
   admin reopens uploads.
6. Attempt to read another player's screenshot or submit an admin review as an
   ordinary user. Both should be denied. A forged frontend rank or user ID must
   never control the assigned rank or target account.

Automated checks: `node --test server/rank-verification.test.js`.
