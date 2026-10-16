import React from "react";
import { Check, PanelLeft, PanelTop } from "lucide-react";
import { useNavigationLayout } from "@/components/layout/NavigationLayoutProvider";

const options = [
  { id: "topbar", label: "Topbar", description: "Your navigation across the top. More room for your page.", icon: PanelTop },
  { id: "sidebar", label: "Sidebar", description: "Your destinations in a side panel. Always within reach.", icon: PanelLeft },
];

export default function NavigationLayoutSection() {
  const { layout, saving, error, chooseLayout } = useNavigationLayout();
  return <section className="navigation-layout-section">
    <header><span className="navigation-layout-section-icon"><PanelLeft size={21} aria-hidden="true" /></span><div><h3>Make it your arena</h3><p>Choose where you like your navigation. Switch anytime.</p></div></header>
    <fieldset disabled={saving}>
      <legend className="sr-only">Navigation layout</legend>
      <div className="navigation-layout-choices">{options.map(({ id, label, description, icon: Icon }) => <label key={id} className="navigation-layout-choice" data-selected={layout === id}>
        <input type="radio" name="navigation-layout" value={id} checked={layout === id} onChange={() => chooseLayout(id)} className="sr-only" />
        <span className="navigation-layout-preview" data-layout={id} aria-hidden="true"><span className="navigation-preview-header"><i /><i /><i /></span><span className="navigation-preview-nav"><i /><i /><i /><i /></span><span className="navigation-preview-content"><i /><i /><i /></span></span>
        <span className="navigation-layout-choice-title"><Icon size={17} aria-hidden="true" /><strong>{label}</strong>{layout === id && <Check size={16} aria-hidden="true" />}</span>
        <span className="navigation-layout-choice-copy">{description}</span>
      </label>)}</div>
    </fieldset>
    <p className="navigation-layout-note">Your choice is saved to your account. On smaller screens, use the compact menu.</p>
    <p role={error ? "alert" : "status"} className={error ? "navigation-layout-error" : "navigation-layout-status"}>{error || (saving ? "Saving your preference…" : `${layout === "sidebar" ? "Sidebar" : "Topbar"} selected`)}</p>
  </section>;
}
