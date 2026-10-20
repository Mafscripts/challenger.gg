import React from "react";
import CompetitionHero from "@/components/competition/CompetitionHero";
import "@/styles/account-pages.css";

export default function AccountPageHero({ action, ...props }) {
  return <CompetitionHero {...props} className="account-page-hero" action={action && <div className="competition-actions">{action}</div>} />;
}
