import React, { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";

export default function DeleteUserAccount({ user, actor, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const actorRole = effectiveRoleForUser(actor);
  const confirmationLabel = user.username || user.email;
  if (user.id === actor.id || !hasRolePower(actorRole, "admin") || hasRolePower(effectiveRoleForUser(user), actorRole)) return null;
  const remove = async () => {
    setBusy(true); setError("");
    try {
      const response = await base44.functions.invoke("deleteAdminUser", { user_id: user.id, confirmation, reason: reason.trim() });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not delete account.");
      await onDeleted(user.id);
    } catch (failure) { setError(failure.message || "Could not delete account."); }
    finally { setBusy(false); }
  };
  return <section className="au-delete-account">
    <div><h3><Trash2 size={15} /> Delete account</h3><p>Permanently remove this account, profile, wallet, inventory and personal standings.</p></div>
    {!expanded ? <button className="au-delete-trigger" onClick={() => setExpanded(true)}>Delete account</button> : <div className="au-delete-form">
      <p>Existing match results stay in history as Deleted player. This cannot be undone.</p>
      <label>Reason<textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this account being removed?" /></label>
      <label>Type <strong>{confirmationLabel}</strong> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      {error && <p role="alert" className="au-error">{error}</p>}
      <div><button disabled={busy} onClick={() => setExpanded(false)}>Keep account</button><button className="au-delete-trigger" disabled={busy || confirmation !== confirmationLabel || reason.trim().length < 5} onClick={remove}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Permanently delete</button></div>
    </div>}
  </section>;
}
