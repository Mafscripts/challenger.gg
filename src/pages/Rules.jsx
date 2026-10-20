import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowLeftRight, Ban, BookOpen, Camera, Check, ChevronRight, ClipboardCheck, Clock, Copy, DollarSign, Flag, Gamepad2, Handshake, List, Medal, MessageCircle, MessageSquare, Radio, Scale, Search, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Swords, Trophy, Unplug, Users, Video, Wifi, X } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { ruleGroups, ruleQuickLinks, ruleSections, searchRulebook } from "@/lib/rulebook";
import "@/styles/rules.css";

const icons = { ArrowLeftRight, Ban, Camera, ClipboardCheck, Clock, DollarSign, Flag, Gamepad2, Handshake, Medal, MessageCircle, MessageSquare, Radio, Scale, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Swords, Trophy, Unplug, Users, Video, Wifi };
const sectionFromHash = hash => ruleSections.find(section => `#${section.id}` === hash)?.id || ruleSections[0].id;
const groupTones = { essentials: "cyan", "in-match": "purple", integrity: "green", platform: "gold" };
const quickTones = ["gold", "green", "cyan", "purple"];

function Highlight({ text, query }) {
  const words = query.trim().split(/\s+/).filter(Boolean).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join("|")})`, "gi")).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part);
}

export default function Rules() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(() => sectionFromHash(location.hash));
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const readerRef = useRef(null);
  const copyTimerRef = useRef(null);
  const copyAttemptRef = useRef(0);
  const active = ruleSections.find(section => section.id === activeId) || ruleSections[0];
  const group = ruleGroups.find(item => item.id === active.group);
  const activeIndex = ruleSections.indexOf(active);
  const searching = Boolean(query.trim());
  const results = searchRulebook(query);
  const displayed = searching || showAll ? results : results.filter(section => section.id === active.id);
  const resultCount = results.reduce((total, section) => total + section.entries.length, 0);

  useEffect(() => {
    setActiveId(sectionFromHash(location.hash)); setShowAll(false); setQuery("");
  }, [location.hash]);
  useEffect(() => () => { clearTimeout(copyTimerRef.current); copyAttemptRef.current += 1; }, []);

  const selectSection = (id, scroll = true) => {
    setActiveId(id); setQuery(""); setShowAll(false);
    const hashChanged = location.hash !== `#${id}`;
    if (hashChanged) navigate({ pathname: location.pathname, search: location.search, hash: `#${id}` }, { preventScrollReset: true });
    // ScrollToTop handles changed hashes once the selected topic has rendered.
    if (scroll && !hashChanged) requestAnimationFrame(() => readerRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const copySection = async id => {
    const attempt = ++copyAttemptRef.current;
    try {
      const url = new URL(window.location.href); url.hash = id;
      await navigator.clipboard.writeText(url.toString());
      if (attempt !== copyAttemptRef.current) return;
      clearTimeout(copyTimerRef.current); setCopiedId(id);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 2200);
    } catch { selectSection(id, false); }
  };

  return <main className="rules-page">
    <div className="rules-container">
      <header className="rules-hero">
        <div className="rules-hero-copy">
          <p className="rules-hero-kicker"><span /> THE TOPFRAGG RULEBOOK <span className="rules-hero-season">OFFICIAL RULES</span></p>
          <h1>Rules &<br /><span>Regulations.</span></h1>
          <p className="rules-hero-description">Bring your best. Play it fair.<br />Everything you need before, during and after your match.</p>
          <div className="rules-hero-actions"><button type="button" onClick={() => selectSection(active.id)} className="rules-explore"><BookOpen size={17} />Explore the rules<ArrowRight size={16} /></button><Link to="/support" className="rules-support-link"><MessageCircle size={16} /> Contact support</Link></div>
          <div className="rules-hero-tags"><span><Gamepad2 size={14} />PC & console</span><span><Radio size={14} />Twitch · YouTube · Kick</span><span><ShieldCheck size={14} />Fair play first</span></div>
        </div>
        <div className="rules-hero-art" aria-hidden="true">
          <div className="rules-emblem-orbit rules-emblem-orbit-outer" /><div className="rules-emblem-orbit rules-emblem-orbit-inner" />
          <div className="rules-emblem"><TopfraggLogo showWordmark={false} className="rules-brand-symbol" markClassName="rules-brand-mark" /></div>
          <span className="rules-orbit-symbol rules-orbit-swords"><Swords size={26} /></span><span className="rules-orbit-symbol rules-orbit-shield"><ShieldCheck size={26} /></span><span className="rules-orbit-symbol rules-orbit-trophy"><Trophy size={26} /></span>
          <span className="rules-art-caption">PLAY WITH INTEGRITY.<strong>WIN WITH PRIDE.</strong></span>
        </div>
      </header>
      <div className="rules-edition"><span><ShieldCheck size={13} /> Official competition standards</span><span>PC · PlayStation · Xbox</span><time dateTime="2026-10-19">Updated October 19, 2026</time></div>

      <nav className="rules-essentials" aria-label="Important match requirements">
        {ruleQuickLinks.map(({ id, value, label, detail, icon }, index) => {
          const Icon = icons[icon];
          return <button type="button" data-tone={quickTones[index]} key={`${id}-${index}`} onClick={() => selectSection(id)}><span className="rules-quick-icon"><Icon size={23} /></span><span className="rules-quick-copy"><small>{label}</small><strong>{value}</strong><span>{detail}</span></span><ChevronRight className="rules-quick-arrow" size={15} /></button>;
        })}
      </nav>

      <div className="rules-directory-heading"><div><p className="rules-eyebrow">Find what you need</p><h2>One rulebook. Every stage of play.</h2></div><span>{ruleSections.length} topics</span></div>
      <nav className="rules-groups" aria-label="Rulebook groups">
        {ruleGroups.map((item, index) => {
          const Icon = icons[item.icon];
          return <button type="button" data-tone={groupTones[item.id]} key={item.id} aria-pressed={!searching && !showAll && group.id === item.id} onClick={() => selectSection(ruleSections.find(section => section.group === item.id).id)}>
            <Icon className="rules-group-watermark" size={116} aria-hidden="true" />
            <span className="rules-group-top"><span className="rules-group-icon"><Icon size={26} /></span><span>0{index + 1}</span></span><strong>{item.title}</strong><span className="rules-group-description">{item.description}</span><span className="rules-group-bottom"><span>{ruleSections.filter(section => section.group === item.id).length} topics</span><span className="rules-group-arrow"><ArrowRight size={16} /></span></span>
          </button>;
        })}
      </nav>

      <div className="rules-toolbar">
        <div className="rules-search-bar"><label className="rules-search"><Search size={18} /><span className="sr-only">Search the entire rulebook</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a rule: streaming, disconnects, rosters…" /></label>{query && <button type="button" aria-label="Clear search" className="rules-icon-button" onClick={() => setQuery("")}><X size={16} /></button>}<span className="rules-search-count" role="status" aria-live="polite">{searching ? `${resultCount} matching ${resultCount === 1 ? "rule" : "rules"}` : "Search all topics"}</span></div>
        <button type="button" className="rules-view-all" aria-pressed={showAll} onClick={() => { setShowAll(value => !value); setQuery(""); }}><List size={16} />{showAll ? "One topic at a time" : "Read full rulebook"}</button>
      </div>

      <div className="rules-layout">
        <aside className="rules-sidebar" data-tone={groupTones[group.id]}>
          <div className="rules-sidebar-heading"><BookOpen size={17} /><div><p className="rules-eyebrow">Browse topics</p><h2>{searching || showAll ? "Full rulebook" : group.title}</h2></div></div>
          <label className="rules-mobile-select"><span>Jump to a topic</span><select value={active.id} onChange={event => selectSection(event.target.value)}>{ruleGroups.map(item => <optgroup key={item.id} label={item.title}>{ruleSections.filter(section => section.group === item.id).map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</optgroup>)}</select></label>
          <nav aria-label="Rule topics" className="rules-navigation">
            {ruleGroups.filter(item => searching || showAll || item.id === group.id).map(item => <div key={item.id} className="rules-nav-group" data-tone={groupTones[item.id]}>
              {(searching || showAll) && <p>{item.title}</p>}
              {ruleSections.filter(section => section.group === item.id).map(section => {
                const Icon = icons[section.icon];
                return <button type="button" key={section.id} aria-current={!searching && !showAll && active.id === section.id ? "location" : undefined} onClick={() => selectSection(section.id)} className="rules-nav-item"><Icon size={15} /><span>{section.title}</span><ChevronRight size={13} /></button>;
              })}
            </div>)}
          </nav>
          <div className="rules-sidebar-note"><Shield size={16} /><p>Need a ruling?<br /><strong>Keep it in the match chat.</strong><span>Include evidence and request an admin.</span></p></div>
        </aside>

        <div className="rules-content" ref={readerRef} tabIndex={-1}>
          <div className="rules-reader">
            <div className="rules-reader-bar"><span><BookOpen size={13} />{searching ? "Search results" : showAll ? "Complete rulebook" : group.title}</span><span>{searching ? `${displayed.length} topics` : showAll ? `${ruleSections.length} topics` : `Topic ${String(activeIndex + 1).padStart(2, "0")} / ${ruleSections.length}`}</span></div>
            {!displayed.length ? <div className="rules-empty"><Search size={30} /><h2>No rules found</h2><p>Try “stream”, “Hardpoint”, “roster” or a shorter search.</p><button type="button" className="rules-support-link" onClick={() => setQuery("")}>Clear search <X size={14} /></button></div> : displayed.map(section => {
              const Icon = icons[section.icon];
              return <section key={section.id} id={section.id} className="rules-section" data-tone={groupTones[section.group]} aria-labelledby={`heading-${section.id}`}>
                <header className="rules-section-header"><div className="rules-section-icon"><Icon size={23} /></div><div><p className="rules-eyebrow">{ruleGroups.find(item => item.id === section.group).title}</p><h2 id={`heading-${section.id}`}><Highlight text={section.title} query={query} /></h2><p className="rules-section-description">{section.description}</p></div><button type="button" className="rules-icon-button rules-copy" title="Copy link to this topic" aria-label={copiedId === section.id ? `Link copied for ${section.title}` : `Copy link to ${section.title}`} onClick={() => copySection(section.id)}>{copiedId === section.id ? <Check size={16} /> : <Copy size={16} />}</button></header>
                {section.summary && !searching && <div className="rules-takeaway"><ShieldCheck size={17} /><div><span>At a glance</span><p>{section.summary}</p></div></div>}
                <ol className="rules-list">{section.entries.map(({ rule, ruleIndex }) => {
                  const entry = typeof rule === "string" ? { text: rule } : rule;
                  return <li key={ruleIndex} value={ruleIndex + 1} className="rules-list-item"><span className="rules-number" aria-hidden="true">{String(section.sectionIndex + 1).padStart(2, "0")}.{String(ruleIndex + 1).padStart(2, "0")}</span><div>{entry.label && <h3><Highlight text={entry.label} query={query} /></h3>}<p><Highlight text={entry.text} query={query} /></p>{entry.items && <ul>{entry.items.map(text => <li key={text}><Highlight text={text} query={query} /></li>)}</ul>}</div></li>;
                })}</ol>
              </section>;
            })}
            {!searching && !showAll && <footer className="rules-pagination"><button type="button" disabled={activeIndex === 0} onClick={() => selectSection(ruleSections[activeIndex - 1].id)}><ArrowLeft size={15} /><span><small>Previous topic</small>{ruleSections[activeIndex - 1]?.title || "Start of rulebook"}</span></button><button type="button" disabled={activeIndex === ruleSections.length - 1} onClick={() => selectSection(ruleSections[activeIndex + 1].id)}><span><small>Up next</small>{ruleSections[activeIndex + 1]?.title || "End of rulebook"}</span><ArrowRight size={15} /></button></footer>}
          </div>
          <div className="rules-help"><MessageCircle size={20} /><div><h3>Something happened in your match?</h3><p>Report it in the official match chat with your evidence. For appeals or other concerns, open a support ticket.</p></div><Link to="/support">Open a ticket <ArrowRight size={14} /></Link></div>
          <p className="sr-only" role="status">{copiedId ? "Topic link copied to clipboard." : ""}</p>
        </div>
      </div>
    </div>
  </main>;
}
