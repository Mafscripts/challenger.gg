import React, { useRef, useState } from "react";
import { ChevronRight, Menu, Search, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import RoleBadge from "@/components/ui/RoleBadge";
import { adminSectionInfo, searchAdminSections } from "@/lib/adminNavigation";

export function AdminSectionMenu({ sections, activeTab, onSelect, query = "" }) {
  const groups = searchAdminSections(sections, query);
  return <nav className="admin-section-menu" aria-label="Admin sections">
    {groups.map(group => <div className="admin-nav-group" data-admin-tone={group.tone} key={group.id}>
      <p>{group.label}</p>
      {group.sections.map(section => <button type="button" key={section.id} onClick={() => onSelect(section.id)} aria-current={activeTab === section.id ? "page" : undefined}>
        <span className="admin-nav-icon"><section.icon size={17} aria-hidden="true" /></span><span>{section.label}</span><ChevronRight size={13} aria-hidden="true" />
      </button>)}
    </div>)}
    {!groups.length && <p className="admin-nav-empty">No sections found. Try “players”, “matches” or “wallet”.</p>}
  </nav>;
}

function SectionSearch({ query, onChange, id }) {
  return <div className="admin-nav-search"><Search size={16} aria-hidden="true" /><input id={id} aria-label="Find an admin section" placeholder="Find a section…" value={query} onChange={event => onChange(event.target.value)} />{query && <button type="button" aria-label="Clear section search" onClick={() => onChange("")}><X size={15} /></button>}</div>;
}

export default function AdminNavigation({ sections, activeTab, onSelect, role, mobile = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const active = sections.find(section => section.id === activeTab) || sections[0];
  const info = adminSectionInfo(active.id);
  const Icon = active.icon;
  const select = id => { navigating.current = true; setQuery(""); setOpen(false); onSelect(id); };
  if (!mobile) return <aside className="admin-console-sidebar">
    <header><span className="admin-console-shield"><ShieldCheck size={23} aria-hidden="true" /></span><div><p>Staff workspace</p><strong>Admin Console</strong></div><RoleBadge role={role} /></header>
    <SectionSearch query={query} onChange={setQuery} id="admin-desktop-section-search" />
    <AdminSectionMenu sections={sections} activeTab={activeTab} onSelect={select} query={query} />
  </aside>;
  return <div className="admin-mobile-navigation" data-admin-tone={info.tone}>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) navigating.current = false; else setQuery(""); }}>
      <DialogTrigger asChild><button type="button" className="admin-mobile-launcher"><span className="admin-nav-icon"><Icon size={19} aria-hidden="true" /></span><span><small>{info.group}</small><strong>{active.label}</strong></span><span className="admin-mobile-browse"><Menu size={17} aria-hidden="true" />Sections</span></button></DialogTrigger>
      <DialogContent className="admin-navigation-dialog" onCloseAutoFocus={event => { if (navigating.current) { event.preventDefault(); navigating.current = false; } }}>
        <header><span className="admin-console-shield"><ShieldCheck size={24} aria-hidden="true" /></span><div><DialogTitle>Admin sections</DialogTitle><DialogDescription>Find the tools you need.</DialogDescription></div></header>
        <SectionSearch query={query} onChange={setQuery} id="admin-mobile-section-search" />
        <div className="admin-navigation-dialog-scroll"><AdminSectionMenu sections={sections} activeTab={activeTab} onSelect={select} query={query} /></div>
      </DialogContent>
    </Dialog>
    <nav className="admin-mobile-shortcuts" aria-label="Quick admin navigation">{sections.filter(section => ["dashboard", "users", "tickets"].includes(section.id)).map(section => <button type="button" key={section.id} aria-current={activeTab === section.id ? "page" : undefined} onClick={() => select(section.id)}><section.icon size={14} aria-hidden="true" />{section.label}</button>)}</nav>
  </div>;
}
