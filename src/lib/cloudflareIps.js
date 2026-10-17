// Cloudflare's published proxy networks, checked 2026-10-17.
// https://www.cloudflare.com/ips-v4/ and https://www.cloudflare.com/ips-v6/
export const CLOUDFLARE_NETWORKS = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

function addressBits(value) {
  const ip = String(value || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^::ffff:(?=\d+\.)/, "");
  if (!ip.includes(":")) {
    const parts = ip.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
    return { size: 32, value: parts.reduce((sum, part) => (sum << 8n) | BigInt(part), 0n) };
  }
  if (!/^[\da-f:]+$/.test(ip) || ip.split("::").length > 2) return null;
  const halves = ip.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return null;
  const bits = groups.reduce((sum, group) => (sum << 16n) | BigInt(`0x${group}`), 0n);
  if (bits >> 32n === 65535n) return { size: 32, value: bits & 0xffffffffn };
  return { size: 128, value: bits };
}
const networks = CLOUDFLARE_NETWORKS.map((cidr) => {
  const [ip, prefix] = cidr.split("/");
  const address = addressBits(ip);
  const shift = BigInt(address.size - Number(prefix));
  return { size: address.size, shift, network: address.value >> shift };
});
export const isCloudflareIp = (value) => {
  const address = addressBits(value);
  return Boolean(address && networks.some((network) => network.size === address.size
    && address.value >> network.shift === network.network));
};
