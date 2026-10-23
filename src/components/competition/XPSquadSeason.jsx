import React from "react";
import { CalendarDays, Crown, ShieldCheck, Trophy, Users } from "lucide-react";
import "@/styles/xp-squad-season.css";

export default function XPSquadSeason() {
  return <section className="xp-squad-season" aria-labelledby="xp-squad-season-title">
    <div className="xp-squad-season-prize"><span className="xp-squad-season-trophy"><Trophy size={30} strokeWidth={1.5} aria-hidden="true" /></span><div><p>SQUADS SEASON CHAMPIONSHIP</p><h2 id="xp-squad-season-title">$1,000<span>to the #1 squad</span></h2><span className="xp-squad-season-restriction"><ShieldCheck size={13} aria-hidden="true" />Squads only · Team prize</span></div></div>
    <div className="xp-squad-season-format"><p className="xp-squad-season-heading">Build your squad. Earn your place.</p><ol>
      <li><span className="xp-squad-season-step"><CalendarDays size={17} aria-hidden="true" /></span><div><strong>8-week season</strong><span>Approximately 2 months of XP competition</span></div></li>
      <li><span className="xp-squad-season-step"><Users size={17} aria-hidden="true" /></span><div><strong>Top 16 squads</strong><span>Qualify for the end-of-season play-offs</span></div></li>
      <li><span className="xp-squad-season-step"><Crown size={17} aria-hidden="true" /></span><div><strong>One winning squad</strong><span>Take the championship and the $1,000 team prize</span></div></li>
    </ol><p className="xp-squad-season-note">Awarded to the winning squad as a team. Solo, Duos and individual player rankings do not qualify.</p></div>
  </section>;
}
