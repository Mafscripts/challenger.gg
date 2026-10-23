import { fileURLToPath } from "node:url";
import { EmbedBuilder } from "discord.js";
import { TOPFRAGG_COLORS } from "./config.js";

export const BRAND_BANNER_NAME = "topfragg-signal.gif";
export const BRAND_BANNER_PATH = fileURLToPath(new URL(`../public/assets/discord/${BRAND_BANNER_NAME}`, import.meta.url));

// A separate image embed keeps an announcement's poster, fields and buttons intact.
// This only constructs a payload; it never posts a message or changes mention permissions.
export function withAnimatedBrand(payload) {
  const embeds = payload.embeds || [], files = payload.files || [];
  const url = `attachment://${BRAND_BANNER_NAME}`;
  if (embeds.length >= 10 || files.length >= 10 || embeds.some(embed => (embed.toJSON?.() || embed).image?.url === url)
    || files.some(file => file.name === BRAND_BANNER_NAME)) return payload;
  return {
    ...payload,
    embeds: [...embeds, new EmbedBuilder().setColor(TOPFRAGG_COLORS.cyan).setImage(url)],
    files: [...files, { attachment: BRAND_BANNER_PATH, name: BRAND_BANNER_NAME }],
  };
}
