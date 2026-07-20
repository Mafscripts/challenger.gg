export const publicCommerceEnabled = (
  String(import.meta.env.VITE_PUBLIC_COMMERCE_ENABLED || "").toLowerCase() === "true"
);

export const commerceUnavailableMessage = (
  "Purchases are temporarily unavailable during public testing. Credits and funds can only be granted by Topfragg staff."
);

export const blockedPublicCommerceFunctions = new Set([
  "buyWithCredits",
  "create-checkout",
  "depositToWallet",
  "forgeMoneyToCredits",
  "subscribePremium",
  "withdrawFromWallet",
]);
