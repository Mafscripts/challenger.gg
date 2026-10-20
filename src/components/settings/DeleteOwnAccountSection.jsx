import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";

export default function DeleteOwnAccountSection({ user }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const name = user.username || user.email;
  const close = next => { if (busy) return; setOpen(next); setPassword(""); setConfirmation(""); setError(""); };
  const remove = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await base44.auth.deleteAccount({ password, confirmation }); logout(); }
    catch (failure) { setError(failure.message || "Account deletion failed. Please try again."); }
    finally { setBusy(false); }
  };
  return <section className="glass rounded-xl border border-red-400/20 p-5" id="settings-delete-account"><h2 className="flex items-center gap-2 font-bold"><Trash2 size={18} />Delete account</h2><p className="mt-2 text-sm leading-6 text-vapor">Permanently delete your account, profile, messages and personal progression. Shared match records are anonymized. This cannot be undone. Active competitions and outstanding funds must be settled first.</p><button type="button" onClick={() => close(true)} className="mt-4 min-h-11 rounded-xl border border-red-400/30 px-4 font-bold text-red-300">Delete my account</button><AlertDialog open={open} onOpenChange={close}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete your account?</AlertDialogTitle><AlertDialogDescription>Your account is deleted immediately after confirmation when there are no active competitions or unsettled funds. Progress, items and credits are removed. Shared match and transaction records are anonymized. For an account with outstanding obligations, use Support to request help with deletion.</AlertDialogDescription></AlertDialogHeader><form onSubmit={remove} className="space-y-4"><label className="block text-sm">Current password<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-secondary px-3" /></label><label className="block text-sm">Type <strong>{name}</strong> to confirm<input autoComplete="off" required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-secondary px-3" /></label>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Link to="/support" className="inline-block text-sm text-cyan" onClick={() => close(false)}>Account deletion support</Link><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep account</AlertDialogCancel><button type="submit" disabled={busy || confirmation !== name || !password} className="min-h-11 rounded-lg bg-red-500 px-4 font-bold text-white disabled:opacity-40">{busy ? "Deleting…" : "Permanently delete"}</button></AlertDialogFooter></form></AlertDialogContent></AlertDialog></section>;
}
