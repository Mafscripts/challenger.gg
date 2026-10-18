export const NETWORK_RESTRICTION_EVENT = "topfragg:network-restricted";
let current = null;
export const readNetworkRestriction = () => current;
export const clearNetworkRestriction = () => { current = null; };
export function rememberNetworkRestriction(data) {
  if (data?.code !== "VPN_BLOCKED" || typeof window === "undefined") return;
  current = { message: data.error };
  window.dispatchEvent(new CustomEvent(NETWORK_RESTRICTION_EVENT, { detail: current }));
}
