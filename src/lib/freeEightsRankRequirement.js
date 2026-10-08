import { screenshotRankFor } from "./screenshotRanks.js";

export const freeEightsRankUploadUrl = "/profile#rank-screenshot";
export const hasFreeEightsRank = (user) => Boolean(screenshotRankFor(user?.screenshot_rank));
export const isFreeEightsRankRequired = (result) => (result?.code || result?.data?.code) === "FREE_EIGHTS_RANK_REQUIRED";

export function freeEightsRankJoinError(matchType, storedRank) {
  if (matchType !== "8s" || screenshotRankFor(storedRank)) return null;
  return {
    success: false,
    code: "FREE_EIGHTS_RANK_REQUIRED",
    error: "Upload a ranked screenshot to join Free 8s. Your Diamond, Crimson, Iridescent or Top 250 rank must be approved first.",
    action_url: freeEightsRankUploadUrl,
  };
}
