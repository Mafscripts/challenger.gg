import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BellRing, Boxes, Gamepad2, Gift, KeyRound, ScrollText, Settings2, Shield, ShoppingBag, Ticket, Trophy, Users, Wallet } from "lucide-react";

const pages = {
  dashboard: [{ tab: "tickets", view: "new", label: "New player messages", Icon: Ticket }, { tab: "matches", state: "active", label: "Active matches", Icon: Gamepad2 }],
  alerts: [{ tab: "tickets", label: "Support inbox", Icon: Ticket }, { tab: "matches", state: "disputed", label: "Disputed matches", Icon: Shield }],
  websiteUpdates: [{ href: "/rules", label: "View published rules", Icon: ScrollText }, { tab: "audit", label: "Publication history", search: "announcement", Icon: ScrollText }],
  tickets: [{ tab: "matches", label: "Match center", Icon: Gamepad2 }, { tab: "banAppeals", label: "Ban appeals", Icon: Shield }],
  banAppeals: [{ tab: "users", filter: "banned", label: "Banned players", Icon: Users }, { tab: "audit", label: "Moderation history", search: "ban", Icon: ScrollText }],
  users: [{ tab: "wallets", label: "Player wallets", Icon: Wallet }, { tab: "roles", label: "Staff access", Icon: KeyRound }, { tab: "verifyRank", label: "Rank reviews", Icon: Shield }],
  roles: [{ tab: "users", label: "Player directory", Icon: Users }, { tab: "audit", search: "role", label: "Role history", Icon: ScrollText }],
  verifyRank: [{ tab: "users", label: "Player directory", Icon: Users }, { href: "/leaderboards", label: "View leaderboards", Icon: Trophy }],
  matches: [{ tab: "tickets", label: "Support inbox", Icon: Ticket }, { tab: "tournaments", label: "Manage tournaments", Icon: Trophy }],
  live8s: [{ tab: "matches", state: "active", label: "All active matches", Icon: Gamepad2 }, { tab: "eightsGames", label: "8s games & maps", Icon: Settings2 }],
  eightsGames: [{ tab: "live8s", label: "Live 8s rooms", Icon: Gamepad2 }, { href: "/ranked/8s", label: "View player lobby", Icon: ArrowUpRight }],
  ranked: [{ tab: "matches", mode: "ranked", label: "Ranked matches", Icon: Gamepad2 }, { tab: "audit", search: "ranked", label: "Correction history", Icon: ScrollText }],
  challenges: [{ tab: "tickets", category: "calls", label: "Admin requests", Icon: Ticket }, { href: "/challenge-a-team", label: "View challenges", Icon: ArrowUpRight }],
  wagers: [{ tab: "tickets", category: "wagers", label: "Wager support", Icon: Ticket }, { tab: "matches", mode: "wagers", state: "disputed", label: "Disputed wagers", Icon: Shield }],
  tournaments: [{ tab: "tournamentMatches", label: "Tournament matches", Icon: Gamepad2 }, { tab: "rewards", label: "Reward items", Icon: Gift }, { href: "/tournaments", label: "View tournaments", Icon: ArrowUpRight }],
  tournamentMatches: [{ tab: "tournaments", label: "Manage tournaments", Icon: Trophy }, { tab: "tickets", category: "tournament", label: "Tournament support", Icon: Ticket }],
  progression: [{ tab: "rewards", label: "Season rewards", Icon: Gift }, { tab: "audit", search: "reset", label: "Reset history", Icon: ScrollText }],
  wallets: [{ tab: "withdrawals", label: "Withdrawal requests", Icon: Wallet }, { tab: "inventory", label: "Player inventory", Icon: Boxes }],
  withdrawals: [{ tab: "wallets", label: "Player wallets", Icon: Wallet }, { tab: "audit", search: "withdrawal", label: "Withdrawal history", Icon: ScrollText }],
  marketplace: [{ tab: "inventory", label: "Player inventory", Icon: Boxes }, { tab: "rewards", label: "Reward items", Icon: Gift }, { href: "/marketplace", label: "View marketplace", Icon: ShoppingBag }],
  rewards: [{ tab: "inventory", label: "Awarded items", Icon: Boxes }, { tab: "progression", label: "Resets & seasons", Icon: Trophy }, { tab: "tournaments", label: "Tournament rewards", Icon: Gift }],
  inventory: [{ tab: "marketplace", label: "Manage catalog", Icon: ShoppingBag }, { tab: "rewards", label: "Reward items", Icon: Gift }],
  referrals: [{ tab: "users", filter: "new", label: "New players", Icon: Users }, { tab: "wallets", label: "Player credits", Icon: Wallet }],
  freeTrials: [{ tab: "users", filter: "premium", label: "Premium members", Icon: Users }, { href: "/premium", label: "View Premium benefits", Icon: Gift }],
  audit: [{ tab: "users", label: "Player directory", Icon: Users }, { tab: "websiteUpdates", label: "Website updates", Icon: BellRing }],
};

export default function AdminSectionLinks({ section, allowedSections, onSelect }) {
  const links = (pages[section] || []).filter(link => !link.tab || allowedSections.includes(link.tab));
  if (!links.length) return null;
  return <nav className="admin-section-links" aria-label="Related admin pages"><span>Related pages</span><div>{links.map(({ Icon, label, href, ...target }) => href
    ? <Link key={label} to={href} target="_blank" rel="noopener noreferrer"><Icon size={14} aria-hidden="true" />{label}<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></Link>
    : <button type="button" key={label} onClick={() => onSelect(target.tab, target)}><Icon size={14} aria-hidden="true" />{label}<ArrowUpRight size={12} aria-hidden="true" /></button>)}</div></nav>;
}
