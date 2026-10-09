export const matchDisputeReasons = [
  { value: "cheating", label: "Cheating / hacking", detail: "Suspicious gameplay or prohibited software" },
  { value: "wrong_rules", label: "Wrong rules", detail: "Incorrect settings, maps or match rules" },
  { value: "wrong_activision", label: "Wrong Activision ID", detail: "A player is using a different account" },
  { value: "smurfing", label: "Smurfing", detail: "An alternate account or misleading rank" },
  { value: "score_dispute", label: "Score dispute", detail: "An incorrect result or score report" },
  { value: "other", label: "Other issue", detail: "Explain what staff need to review" },
];

export const playerDisputeReasons = new Set(["cheating", "wrong_activision", "smurfing"]);
export const disputeReasonLabel = (value) => matchDisputeReasons.find((reason) => reason.value === value)?.label || String(value || "Match dispute").replaceAll("_", " ");

export function disputeEvidenceUrls(value) {
  const urls = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  if (urls.length > 10) throw new Error("Add up to 10 evidence links.");
  return [...new Set(urls.map((item) => {
    if (typeof item !== "string") throw new Error("Evidence must contain web links.");
    const url = item.trim();
    if (!url) return "";
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Use complete evidence links starting with https:// or http://."); }
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 2000) {
      throw new Error("Evidence links must use https:// or http:// without login credentials.");
    }
    return url;
  }).filter(Boolean))];
}

export function validateMatchDispute(input) {
  const reason = String(input.reason || "");
  if (!matchDisputeReasons.some((entry) => entry.value === reason)) throw new Error("Choose a dispute category.");
  const description = String(input.description || "").trim();
  if (description.length < 10 || description.length > 4000) throw new Error("Explain the issue in 10–4,000 characters.");
  const reported_against = String(input.reported_against || "").trim();
  if (playerDisputeReasons.has(reason) && !reported_against) throw new Error("Choose the player you are reporting.");
  return { reason, description, reported_against, evidence_urls: disputeEvidenceUrls(input.evidence_urls) };
}
