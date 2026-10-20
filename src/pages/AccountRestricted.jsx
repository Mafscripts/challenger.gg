import React, { useCallback, useState } from "react";
import { Ban, Clock, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import BanAppealConversation, { appealDate } from "@/components/support/BanAppealConversation";

export default function AccountRestricted() {
  const { restriction, logout } = useAuth();
  const [current, setCurrent] = useState(restriction);
  const update = useCallback((value) => setCurrent(value), []);
  const suspended = current?.code === "ACCOUNT_SUSPENDED";
  return <main className="app-style-arena min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto max-w-[1160px]">
      <header className="mb-8 flex items-center justify-between gap-4"><a href="/" aria-label="Topfragg home" className="flex items-center gap-3 text-lg font-black"><img src="/topfragg-mark.svg" alt="" className="h-10 w-10" /><span>TOP<span className="text-cyan">FRAGG</span></span></a><button type="button" onClick={() => logout()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-vapor hover:text-white"><LogOut className="h-4 w-4" />Sign out</button></header>
      <section className={`mb-6 overflow-hidden rounded-2xl border bg-card p-6 sm:p-8 ${current ? "border-red-400/25" : "border-green/25"}`}>
        <div className="flex items-start gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${current ? "border-red-400/20 bg-red-400/10 text-red-400" : "border-green/20 bg-green/10 text-green"}`}><ShieldAlert className="h-6 w-6" /></span>
          <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-vapor">Account access · {restriction?.account_name}</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{!current ? "Your restriction has been lifted" : suspended ? "Your account is suspended" : "Your account is banned"}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-vapor">{current ? "Your access to Topfragg is restricted. You can read the reason below and contact the admin team to request a review." : "You can sign in again to return to Topfragg. Your appeal conversation is saved."}</p></div></div>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-card p-5"><h2 className="flex items-center gap-2 text-sm font-black"><Ban className="h-4 w-4 text-red-400" />Restriction details</h2>
            <p className="mt-5 text-[10px] font-black uppercase tracking-wider text-vapor">Reason</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{current?.reason || restriction?.reason}</p>
            <div className="mt-5 border-t border-white/10 pt-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-vapor"><Clock className="h-3.5 w-3.5" />Duration</p><p className="mt-2 text-sm font-bold">{!current ? "Restriction lifted" : current.expires_at ? `Until ${appealDate(current.expires_at)}` : "Permanent"}</p><p className="mt-3 text-xs text-vapor">Issued: {appealDate(current?.issued_at || restriction?.issued_at)}</p></div>
          </section>
          <section className="rounded-2xl border border-white/10 bg-card p-5"><h2 className="text-sm font-black">Request a review</h2><p className="mt-2 text-xs leading-6 text-vapor">Include relevant match details and explain your situation clearly. This private conversation is accessible to you and the admin team. Sending a message does not automatically remove your ban.</p></section>
          {!current && <button type="button" onClick={() => logout()} className="w-full rounded-xl border border-cyan/25 bg-cyan/10 px-5 py-3 text-sm font-black text-cyan">Return to sign in</button>}
        </aside>
        <BanAppealConversation scope={restriction?.account_id || "restricted-account"} onRestriction={update} />
      </div>
    </div>
  </main>;
}
