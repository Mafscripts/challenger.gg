import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export default function SiteAnnouncementAdmin({ user }) {
  const client = useQueryClient();
  const publication = useRef(null);
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const query = useQuery({ queryKey: ["site-announcement", user.id], queryFn: async () => {
    const response = await base44.functions.invoke("getSiteAnnouncement", {});
    if (response.data.success === false) throw new Error(response.data.error);
    return response.data.announcement;
  } });
  const value = draft || query.data;
  const save = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const signature = JSON.stringify([value.enabled, value.title, value.message, value.kind, value.rules_text]);
      if (publication.current?.signature !== signature) publication.current = { signature, id: crypto.randomUUID() };
      const { data } = await base44.functions.invoke("updateSiteAnnouncement", { enabled: value.enabled, title: value.title, message: value.message, publication_id: publication.current.id, kind: value.kind || "website", ...(value.kind === "topfragg_variant_rules" ? { rules_text: value.rules_text || "" } : {}) });
      if (data.success === false) throw new Error(data.error);
      client.setQueryData(["site-announcement", user.id], { ...data.announcement, rules_text: data.announcement.rules_text ?? value.rules_text ?? "" }); setDraft(null); publication.current = null; void client.invalidateQueries({ queryKey: ["topfragg-variant-rules"] });
      toast({ title: data.announcement.enabled ? data.announcement.kind === "topfragg_variant_rules" ? "Topfragg Variant rules published" : "Website update published" : "Website update switched off", description: "The notice is updated for connected users. Published notices also appear in every user's notifications." });
    } catch (failure) { setError(failure.message || "Could not save the announcement."); } finally { setBusy(false); }
  };
  const field = (key, content) => setDraft({ ...value, [key]: content });
  return <section className="p-6 max-w-4xl">
    <div className="mb-6 flex items-start gap-3"><Megaphone className="h-6 w-6 text-cyan" /><div><h2 className="text-lg font-black">Website updates</h2><p className="mt-1 text-sm text-vapor">A dismissible notice for signed-in players, including users already on the website.</p></div></div>
    {query.isPending && <p role="status">Loading website notice...</p>}
    {query.isError && <div role="alert"><p>{query.error.message}</p><button className="at-button" onClick={() => query.refetch()}>Retry</button></div>}
    {value && <form onSubmit={save} className="space-y-5 rounded-xl border border-cyan/20 bg-cyan/[0.03] p-5">
      <label className="flex items-center justify-between gap-4 font-bold"><span>Show website notice <small className={`ml-2 ${value.enabled ? "text-green" : "text-vapor"}`}>{value.enabled ? "ON" : "OFF"}</small></span><input type="checkbox" className="h-5 w-5 accent-cyan" checked={value.enabled} disabled={busy} onChange={event => field("enabled", event.target.checked)} /></label>
      <label className="block text-sm font-bold">Update type<select className="mt-2 w-full rounded-lg border border-white/15 bg-background px-3 py-3" value={value.kind || "website"} disabled={busy} onChange={event => field("kind", event.target.value)}><option value="website">Website update</option><option value="topfragg_variant_rules">Topfragg Variant rules update</option></select></label>
      {value.kind === "topfragg_variant_rules" && <label className="block text-sm font-bold">Complete Topfragg Variant rule set<textarea className="mt-2 w-full rounded-lg border border-cyan/30 bg-background px-3 py-3 text-sm leading-6" required={value.enabled} maxLength={20000} rows={12} value={value.rules_text || ""} disabled={busy} onChange={event => field("rules_text", event.target.value)} placeholder="Enter the full rule set. One rule per line." /><span className="mt-2 block text-xs font-normal text-vapor">Publishing replaces only the Topfragg Variant section on the Rules page. Enter the complete set, one rule per line. Turning the popup off keeps the published rules.</span></label>}
      <label className="block text-sm font-bold">Title<input className="mt-2 w-full rounded-lg border border-white/15 bg-background px-3 py-3" required maxLength={100} value={value.title} disabled={busy} onChange={event => field("title", event.target.value)} /></label>
      <label className="block text-sm font-bold">Message<textarea className="mt-2 w-full rounded-lg border border-white/15 bg-background px-3 py-3 text-sm leading-6" required maxLength={1000} rows={5} value={value.message} disabled={busy} onChange={event => field("message", event.target.value)} /></label>
      <div className="rounded-xl border border-cyan/20 bg-background p-4"><span className="text-xs font-bold text-cyan">PREVIEW</span><h3 className="mt-2 font-black">{value.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-vapor">{value.message}</p></div>
      <p className="text-xs text-vapor">Players can dismiss the notice. Publishing sends the message to every user's notification inbox, including offline players. Switching it off hides the popup; notifications stay in their inbox.</p>
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-3 text-sm font-black text-background disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{value.enabled ? value.kind === "topfragg_variant_rules" ? "Publish rules & notify everyone" : "Publish notice" : "Save & switch off"}</button>
    </form>}
  </section>;
}
