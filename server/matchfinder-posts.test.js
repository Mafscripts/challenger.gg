import test from "node:test";
import assert from "node:assert/strict";
import { isMatchfinderPostVisible, matchfinderPostExpiresAt, roundedMatchfinderPostedAt, formatMatchfinderPostedAt } from "../src/lib/matchfinderPosts.js";
import { listEntities, getEntity } from "./entity.js";
import { prisma } from "./prisma.js";

test("a post is visible until exactly 30 minutes after its actual creation time", () => {
  const post = { status: "open", created_date: "2026-10-09T14:43:17.123Z" };
  const expiry = Date.parse("2026-10-09T15:13:17.123Z");
  assert.equal(matchfinderPostExpiresAt(post), expiry);
  assert.equal(isMatchfinderPostVisible(post, expiry - 1), true);
  assert.equal(isMatchfinderPostVisible(post, expiry), false);
  assert.equal(isMatchfinderPostVisible(post, expiry + 1), false);
  assert.equal(roundedMatchfinderPostedAt(post.created_date).toISOString(), "2026-10-09T14:45:00.000Z");
});

test("posting times round to the nearest five minutes across hour and day boundaries", () => {
  for (const [input, expected] of [
    ["14:31:00", "14:30:00"], ["14:34:00", "14:35:00"], ["14:41:00", "14:40:00"],
    ["14:43:00", "14:45:00"], ["14:49:00", "14:50:00"], ["14:54:00", "14:55:00"],
    ["14:58:00", "15:00:00"],
  ]) assert.equal(roundedMatchfinderPostedAt(`2026-10-09T${input}Z`).toISOString(), `2026-10-09T${expected}.000Z`);
  assert.equal(roundedMatchfinderPostedAt("2026-10-09T23:59:59Z").toISOString(), "2026-10-10T00:00:00.000Z");
});

test("hidden, closed and malformed posts are never listed", () => {
  const now = Date.now();
  const post = { status: "open", created_date: new Date(now).toISOString() };
  assert.equal(isMatchfinderPostVisible(post, now), true);
  for (const status of ["accepted", "in_progress", "completed", "cancelled"]) {
    assert.equal(isMatchfinderPostVisible({ ...post, status }, now), false);
  }
  assert.equal(isMatchfinderPostVisible({ ...post, posted_to_matchfinder: false }, now), false);
  for (const created_date of [undefined, null, "", "invalid"]) {
    assert.equal(isMatchfinderPostVisible({ ...post, created_date }, now), false);
    assert.equal(formatMatchfinderPostedAt(created_date), "—");
  }
});

for (const [entity, delegate] of [["XPMatch", "xPMatch"], ["RankedMatch", "rankedMatch"], ["Wager", "wager"]]) {
  test(`${entity}: server listings expire posts without deleting rooms or changing history`, async (t) => {
    const now = Date.now();
    const records = [
      { id: "recent", created_date: new Date(now - 1000), metadata: { status: "open" } },
      { id: "expired", created_date: new Date(now - 30 * 60 * 1000 - 1000), metadata: { status: "open" } },
      { id: "unlisted", created_date: new Date(now - 1000), metadata: { status: "open", posted_to_matchfinder: false } },
      { id: "running", created_date: new Date(now - 1000), metadata: { status: "in_progress" } },
    ];
    const queries = [];
    const originalMany = prisma[delegate].findMany;
    const originalUnique = prisma[delegate].findUnique;
    prisma[delegate].findMany = async (query) => { queries.push(query); return records; };
    prisma[delegate].findUnique = async ({ where }) => records.find((row) => row.id === where.id);
    t.after(() => { prisma[delegate].findMany = originalMany; prisma[delegate].findUnique = originalUnique; });
    assert.deepEqual((await listEntities(entity, { status: "open", matchfinder_visible: true })).map((row) => row.id), ["recent"]);
    const cutoff = queries[0].where.AND.find((entry) => entry.created_date)?.created_date.gt.getTime();
    assert.ok(cutoff >= now - 30 * 60 * 1000 && cutoff <= Date.now() - 30 * 60 * 1000);
    assert.deepEqual((await listEntities(entity, { status: "open" })).map((row) => row.id), ["recent", "expired", "unlisted"]);
    assert.equal((await getEntity(entity, "expired")).status, "open");
  });
}
