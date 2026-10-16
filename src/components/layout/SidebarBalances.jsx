import React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

export default function SidebarBalances({ walletBalance = 0, creditBalance = 0 }) {
  const balances = [
    { label: "Balance", value: `$${walletBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, path: "/wallet", addLabel: "Add funds", tone: "wallet" },
    { label: "Credits", value: creditBalance.toLocaleString("en-US"), path: "/marketplace", addLabel: "Get credits", tone: "credits" },
  ];
  return <div className="sidebar-balances">{balances.map((balance) => <div key={balance.label} className="sidebar-balance-card" data-tone={balance.tone}>
    <Link to={balance.path} className="sidebar-balance-main" title={`${balance.label}: ${balance.value}`}><span>{balance.label}</span><strong>{balance.value}</strong></Link>
    <Link to={balance.path} className="sidebar-balance-add" aria-label={balance.addLabel} title={balance.addLabel}><Plus size={13} aria-hidden="true" /></Link>
  </div>)}</div>;
}
