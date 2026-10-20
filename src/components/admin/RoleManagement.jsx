import React, { useState } from "react";
import { Check, ChevronDown, KeyRound, Loader2, LockKeyhole, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import RoleBadge from "@/components/ui/RoleBadge";
import { canManageRoles, getRoleConfig, normalizeRole } from "@/lib/roles";
import "@/styles/admin-roles.css";

const roles = ["ceo", "super_admin", "admin", "moderator", "user"];
const nameFor = (user) => user.display_name || user.full_name || user.username || "Player";

export default function RoleManagement({ directory, actorRole, search, onSearch, onUserUpdated, onRefresh }) {
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [failure, setFailure] = useState(null);
  if (!canManageRoles(actorRole)) return <section className="admin-roles"><p className="ar-access-note"><LockKeyhole size={14} /> Role management is restricted to the platform owner.</p></section>;
  const canEdit = (role) => canManageRoles(actorRole) && (actorRole === "ceo" || getRoleConfig(actorRole).power > getRoleConfig(role).power);
  const save = async (user, nextRole) => {
    if (saving || !canEdit(user.role) || !canEdit(nextRole)) return;
    setSaving(user.id); setFailure(null);
    try {
      const response = await base44.functions.invoke("updateUserRole", { user_id: user.id, role: nextRole });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not update this role.");
      onUserUpdated(response.data.user);
      setDrafts((current) => { const next = { ...current }; delete next[user.id]; return next; });
      toast({ title: "Role updated", description: `${nameFor(user)} is now ${getRoleConfig(nextRole).label}.` });
      await onRefresh();
    } catch (error) { setFailure({ id: user.id, message: error.message || "Could not update this role." }); }
    finally { setSaving(null); }
  };
  const loading = directory.isPending || directory.searchPending;
  return <section className="admin-roles">
    <header className="ar-heading"><div><span className="ar-eyebrow">ACCESS &amp; PERMISSIONS</span><h2><KeyRound size={20} /> Role Management</h2><p>Manage access levels for staff and players.</p></div>
      <div className="ar-search"><Search size={16} /><input aria-label="Search users for role management" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, username or email..." />
        {search && <button aria-label="Clear user search" onClick={() => onSearch("")}><X size={14} /></button>}</div>
    </header>
    <div className="ar-list-summary"><strong>{search.trim() ? "Search results" : "Players & staff"}</strong><span>{directory.rows.length} of {directory.total} loaded</span></div>
    <div className="ar-table-wrap"><table className="admin-responsive-table" role="table" aria-label="Staff and player roles">
      <thead><tr><th>Player</th><th>Current role</th><th>New role</th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{directory.rows.map((user) => {
        const currentRole = normalizeRole(user.role);
        const selected = drafts[user.id] || currentRole;
        const editable = canEdit(currentRole);
        const changed = selected !== currentRole;
        return <tr key={user.id}>
          <td data-label="Player"><div className="ar-player"><span className="ar-avatar">{nameFor(user).slice(0, 1).toUpperCase()}</span><div><strong>{nameFor(user)}</strong><span>{user.email || (user.username ? `@${user.username}` : "Player account")}</span></div></div></td>
          <td data-label="Current role"><RoleBadge role={currentRole} internal /></td>
          <td data-label="New role">{editable ? <div className="ar-select"><select aria-label={`New role for ${nameFor(user)}`} value={selected} disabled={Boolean(saving)} onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: event.target.value }))}>
            {roles.filter((role) => role === currentRole || canEdit(role)).map((role) => <option key={role} value={role}>{getRoleConfig(role).label}</option>)}
          </select><ChevronDown size={13} /></div> : <span className="ar-protected"><LockKeyhole size={13} /> {canManageRoles(actorRole) ? "Protected account" : "View only"}</span>}</td>
          <td data-label="Actions"><div className="ar-action">{editable && <button aria-label={`Save role for ${nameFor(user)}`} disabled={!changed || Boolean(saving)} onClick={() => save(user, selected)}>
            {saving === user.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving === user.id ? "Saving..." : "Save role"}</button>}
            {failure?.id === user.id && <p role="alert">{failure.message}</p>}</div></td>
        </tr>;
      })}</tbody>
    </table></div>
    {loading && <p className="ar-feedback" role="status"><Loader2 size={15} className="animate-spin" /> Loading players...</p>}
    {!loading && !directory.isError && !directory.rows.length && <div className="ar-empty"><Search size={25} /><strong>No players found</strong><p>Try a different name, username or email address.</p></div>}
    {directory.isError && <div className="ar-feedback ar-error" role="alert"><span>{directory.error?.message || "Could not load players."}</span><button disabled={directory.isFetching} onClick={() => directory.isFetchNextPageError ? directory.fetchNextPage() : directory.refetch()}>Try again</button></div>}
    {!!directory.rows.length && <footer className="ar-footer"><p>{directory.rows.length} of {directory.total} players loaded</p>{directory.hasNextPage && <button disabled={directory.isFetching || directory.searchPending} onClick={() => directory.fetchNextPage()}>
      {directory.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load next 25</button>}</footer>}
  </section>;
}
