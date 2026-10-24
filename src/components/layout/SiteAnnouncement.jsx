import { Link } from "react-router-dom";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import "./site-announcement.css";

export default function SiteAnnouncement() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(null);
  const { data } = useQuery({
    queryKey: ["site-announcement", user?.id], enabled: Boolean(user?.id),
    queryFn: async () => { const response = await base44.functions.invoke("getSiteAnnouncement", {}); return response.data.announcement; },
    staleTime: 15000, refetchInterval: 20000, refetchIntervalInBackground: false, refetchOnWindowFocus: "always", retry: 1,
  });
  const key = user?.id ? `topfragg:announcement:${user.id}` : null;
  let saved;
  try { saved = key ? localStorage.getItem(key) : null; } catch { /* Dismissal still works for this session. */ }
  if (!user?.id || !data?.enabled || data.revision === saved || `${key}:${data.revision}` === dismissed) return null;
  const dismiss = () => { setDismissed(`${key}:${data.revision}`); try { localStorage.setItem(key, data.revision); } catch { /* Session dismissal is already recorded. */ } };
  return createPortal(<aside className="site-update-notice" role="status" aria-live="polite">
    <span className="site-update-icon"><Megaphone size={22} /></span>
    <div><span className="site-update-label">TOPFRAGG · {data.kind === "topfragg_variant_rules" ? "RULES UPDATE" : "WEBSITE UPDATE"}</span><h2>{data.title}</h2><p>{data.message}</p>{data.action_url === "/rules#topfragg-variant" && <Link className="site-update-rules-link" to={data.action_url} onClick={dismiss}>Read Topfragg Variant rules →</Link>}</div>
    <button aria-label="Dismiss website update" title="Dismiss" onClick={dismiss}><X size={19} /></button>
  </aside>, document.body);
}
