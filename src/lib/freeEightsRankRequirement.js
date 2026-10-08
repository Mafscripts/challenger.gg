import { screenshotRankFor } from "./screenshotRanks.js";

export const freeEightsRankUploadUrl = "/settings#settings-rank";
export const hasFreeEightsRank = (user) => Boolean(screenshotRankFor(user?.screenshot_rank));
export const isFreeEightsRankRequired = (result) => (result?.code || result?.data?.code) === "FREE_EIGHTS_RANK_REQUIRED";

export function freeEightsRankJoinError(matchType, storedRank) {
  if (matchType !== "8s" || screenshotRankFor(storedRank)) return null;
  return {
    success: false,
    code: "FREE_EIGHTS_RANK_REQUIRED",
    error: "Choose Diamond, Crimson or Iridescent in Settings to join Free 8s. Top 250 requires admin approval.",
    action_url: freeEightsRankUploadUrl,
  };
}
