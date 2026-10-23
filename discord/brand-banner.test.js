import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import sharp from "sharp";
import { EmbedBuilder } from "discord.js";
import { BRAND_BANNER_NAME, BRAND_BANNER_PATH, withAnimatedBrand } from "./brand-banner.js";

test("brand footer preserves posters, buttons, attachments and mention restrictions", () => {
  const original = {
    content: "Tournament announcement",
    embeds: [new EmbedBuilder().setTitle("Tournament").setImage("https://example.com/poster.png")],
    files: [{ attachment: Buffer.from("example"), name: "rules.txt" }],
    components: [{ type: 1, components: [] }],
    allowedMentions: { parse: [] },
  };
  const branded = withAnimatedBrand(original);
  assert.equal(branded.embeds.length, 2);
  assert.equal(branded.embeds[0].toJSON().image.url, "https://example.com/poster.png");
  assert.equal(branded.embeds[1].toJSON().image.url, `attachment://${BRAND_BANNER_NAME}`);
  assert.equal(branded.files[1].attachment, BRAND_BANNER_PATH);
  assert.deepEqual(branded.allowedMentions, { parse: [] });
  assert.equal(branded.components, original.components);
  assert.equal(original.embeds.length, 1);
  assert.equal(original.files.length, 1);
});

test("branding is idempotent and stays within Discord attachment and embed limits", () => {
  const branded = withAnimatedBrand({ content: "Hello", allowedMentions: { parse: [] } });
  assert.equal(withAnimatedBrand(branded), branded);
  const fullEmbeds = { embeds: Array.from({ length: 10 }, () => new EmbedBuilder().setTitle("Existing")) };
  assert.equal(withAnimatedBrand(fullEmbeds), fullEmbeds);
  const fullFiles = { files: Array.from({ length: 10 }, (_, index) => ({ name: `${index}.txt` })) };
  assert.equal(withAnimatedBrand(fullFiles), fullFiles);
});

test("the shipped banner is an animated, looping GIF below the upload limit", async () => {
  const metadata = await sharp(BRAND_BANNER_PATH, { animated: true }).metadata();
  assert.equal(metadata.format, "gif");
  assert.equal(metadata.width, 960);
  assert.equal(metadata.pageHeight, 144);
  assert.equal(metadata.pages, 135);
  assert.equal(metadata.loop, 0);
  assert.equal(metadata.delay.reduce((sum, value) => sum + value, 0), 9000);
  assert.ok((await stat(BRAND_BANNER_PATH)).size < 8 * 1024 * 1024);
});
