import React, { useState } from "react";
import { Loader2, LogOut, RefreshCw, ShieldAlert, Wifi } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export default function ConnectionRestricted() {
  const { networkRestriction, resumeNetworkAccess, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retry = async () => {
    setBusy(true); setError("");
    try {
      const result = await base44.auth.getNetworkStatus();
      if (!result.allowed) throw new Error("Please turn off your VPN or proxy and try again.");
      await resumeNetworkAccess();
    } catch (failure) { setError(failure.message || "Could not check your connection. Please try again."); }
    finally { setBusy(false); }
  };
  return <main className="app-style-arena flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
    <section className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-card shadow-xl">
      <header className="flex items-center gap-3 border-b border-white/10 bg-background/30 p-5"><img src="/topfragg-mark.svg" alt="" className="h-9 w-9" /><span className="text-base font-black">TOP<span className="text-cyan">FRAGG</span></span></header>
      <div className="p-6 sm:p-8"><span className="flex h-12 w-12 items-center justify-center rounded-xl border border-orange/25 bg-orange/10 text-orange"><ShieldAlert className="h-6 w-6" /></span><p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-orange">Connection restricted</p><h1 className="mt-2 text-2xl font-black">Turn off your VPN or proxy</h1><p className="mt-4 text-sm leading-6 text-vapor">{networkRestriction?.message}</p>
        <div className="mt-5 rounded-xl border border-white/10 bg-background/30 p-4"><h2 className="flex items-center gap-2 text-xs font-black"><Wifi className="h-4 w-4 text-cyan" />Reconnect to continue</h2><p className="mt-2 text-xs leading-6 text-vapor">Disconnect your VPN, proxy, Tor or privacy relay. Then use your regular internet connection and select Check connection below. This message does not place a ban on your account.</p></div>
        {error && <p role="alert" className="mt-4 text-xs leading-6 text-red-300">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={retry} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-3 text-xs font-black text-cyan hover:bg-cyan/20 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{busy ? "Checking…" : "Check connection"}</button><button type="button" onClick={() => logout()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 text-xs font-bold text-vapor hover:text-white"><LogOut className="h-4 w-4" />Sign out</button></div>
      </div>
    </section>
  </main>;
}
