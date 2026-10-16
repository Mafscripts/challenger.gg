import React from "react";
import { Loader2, PanelLeft, PanelTop } from "lucide-react";
import { useNavigationLayout } from "./NavigationLayoutProvider";

export default function NavigationLayoutToggle({ showLabel = false }) {
  const preference = useNavigationLayout();
  if (!preference) return null;
  const { layout, saving, chooseLayout } = preference;
  const nextLayout = layout === "sidebar" ? "topbar" : "sidebar";
  const label = nextLayout === "sidebar" ? "Use sidebar navigation" : "Use topbar navigation";
  const Icon = saving ? Loader2 : nextLayout === "sidebar" ? PanelLeft : PanelTop;
  return <button type="button" onClick={() => chooseLayout(nextLayout)} disabled={saving}
    aria-label={label} title={label} aria-pressed={layout === "sidebar"}
    className={`navigation-layout-toggle ${showLabel ? "navigation-layout-toggle-labeled" : "topbar-icon-button"}`}>
    <Icon size={17} aria-hidden="true" className={saving ? "animate-spin" : undefined} />
    {showLabel && <span>{nextLayout === "sidebar" ? "Switch to sidebar" : "Switch to topbar"}</span>}
  </button>;
}
