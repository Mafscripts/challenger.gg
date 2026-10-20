export const publicCommerceEnabled = (
  String(import.meta.env.VITE_PUBLIC_COMMERCE_ENABLED || "").toLowerCase() === "true"
);

export const commerceUnavailableMessage = (
  "Balances, entry amounts and prizes are virtual test credits with no monetary value. They cannot be purchased, redeemed or paid out. Any $ symbol represents simulated units, not money."
);

export const monthlyEightsPrizeLabel = publicCommerceEnabled ? "$100" : "100 test credits";

export const blockedPublicCommerceFunctions = new Set([
  "buyWithCredits",
  "create-checkout",
  "depositToWallet",
  "forgeMoneyToCredits",
  "subscribePremium",
  "withdrawFromWallet",
]);
