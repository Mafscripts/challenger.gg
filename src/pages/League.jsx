import React, { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Crown, Gamepad2, Info, Layers, LockKeyhole, Search, ShieldCheck, Swords, Trophy, UserCog, UserRound, Users } from "lucide-react";
import { TOPFRAGG_LEAGUE, LEAGUE_DIVISIONS, leagueDivisionUrl } from "@/lib/topfraggLeague";
import { leagueDemoMatchUrl } from "@/lib/leagueDemo";
import { LeagueDemoLabel, LeagueDemoNotice, LeagueDemoStandings, LeagueDemoTeams, LeagueDemoMatches, LeagueDemoUpcoming } from "@/components/league/LeagueDemo";
import LeagueTeamLogo from "@/components/league/LeagueTeamLogo";
import "@/styles/league.css";

const divisionViews = [
  { id: "standings", name: "Standings", icon: Trophy },
  { id: "teams", name: "Teams", icon: Users },
  { id: "matches", name: "Matches", icon: Swords },
];

function ComingSoon({ children = "Coming soon" }) {
  return <span className="league-status"><span aria-hidden="true" />{children}</span>;
}

function LeagueNews({ compact = false }) {
  return (
    <aside className={`league-news ${compact ? "league-news-compact" : ""}`} aria-label="League news">
      <div className="league-section-title"><span className="league-eyebrow">League news</span><span className="league-small-label">Updates</span></div>
      <article className="league-panel league-payout-news">
        <div className="league-news-heading"><Trophy className="h-4 w-4" /><p className="league-eyebrow">Topfragg prize boost</p></div>
        <h2>More teams.<br />Bigger payouts.</h2>
        <p>If enough teams sign up, <strong>Topfragg itself will add between $50–$500 extra per division</strong> to boost the payouts.</p>
        <div className="league-news-amount"><span>$50–$500</span><small>Potential extra funding / division</small></div>
        <p className="league-fine-print">Extra funding depends on team participation. Final prize pools, payout splits and eligibility will be announced before paid registration opens.</p>
      </article>
      <article className="league-panel league-news-note">
        <div className="flex items-center gap-2 text-cyan"><Clock3 className="h-4 w-4" /><h2>Launch status</h2></div>
        <dl className="league-launch-list"><div><dt>Division pages</dt><dd className="text-green">Open to browse</dd></div><div><dt>Team registration</dt><dd>Coming soon</dd></div><div><dt>League matches</dt><dd>Coming soon</dd></div></dl>
        <p className="league-fine-print">Season dates and rules will be announced before registration opens.</p>
      </article>
    </aside>
  );
}

function LeagueIntroduction() {
  return (
    <header className="league-hero league-panel">
      <div className="league-hero-copy">
        <div className="flex flex-wrap items-center gap-3"><span className="league-eyebrow">Modern Warfare 4 · Team competition</span><ComingSoon /></div>
        <h1>TOP<span>FRAGG</span> <span className="league-hero-title">LEAGUE</span></h1>
        <p className="league-hero-detail">12 divisions. One Challengers ladder. A dedicated competition for your team, with matches inside your own division.</p>
        <div className="league-hero-actions"><a href="#league-divisions" className="league-button league-button-primary">Find your division<ArrowRight className="h-4 w-4" /></a><Link to={leagueDemoMatchUrl(LEAGUE_DIVISIONS[0])} className="league-button">Preview a match room<ArrowRight className="h-3.5 w-3.5" /></Link><a href="#league-how-it-works" className="league-hero-text-link">How it works<ChevronRight className="h-3.5 w-3.5" /></a></div>
      </div>
      <div className="league-game-identity">
        <img src="/assets/mw4/logo.webp" alt="Modern Warfare 4" width="220" height="85" className="league-game-logo" />
        <span className="league-small-label">The next chapter</span>
        <p>Built for MW<span className="text-yellow-300">4</span></p>
      </div>
      <dl className="league-hero-facts"><div><Layers className="h-4 w-4" /><dt>Competition</dt><dd>12 divisions + Challengers</dd></div><div><Users className="h-4 w-4" /><dt>Team roster</dt><dd>4 players + 2 reserves</dd></div><div><LockKeyhole className="h-4 w-4" /><dt>Team registration</dt><dd>Coming soon</dd></div></dl>
    </header>
  );
}

function LeagueHowItWorks() {
  const steps = [
    { icon: Layers, title: "Choose a division", description: "The manager selects Division 1–12 or Challengers. Each team is assigned to its own league division." },
    { icon: UserCog, title: "Manager pays for the team", description: "Once registration opens, the manager pays the team's entry fee. Confirmed payment activates the league team." },
    { icon: Users, title: "Build your roster", description: "The manager fills 4 starting spots and up to 2 reserve spots with players registered on Topfragg." },
    { icon: Swords, title: "Play in your division", description: "Accepted players get their league team, division and role on their profile, with a route to their assigned league matches." },
  ];
  return (
    <section id="league-how-it-works" className="league-panel league-how">
      <div className="league-section-title"><div><p className="league-eyebrow">From manager to match day</p><h2>How the league will work</h2></div><span className="league-small-label">At launch</span></div>
      <ol className="league-steps">{steps.map(({ icon: Icon, title, description }, index) => <li key={title}><div className="flex items-center justify-between"><span className="league-icon"><Icon className="h-4 w-4" /></span><span className="league-step-number">0{index + 1}</span></div><h3>{title}</h3><p>{description}</p></li>)}</ol>
      <div className="league-access-note"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan" /><p><strong>Division access stays separate.</strong> A Division 1 roster can only enter its assigned Division 1 matches. Division 2, Division 3 and Challengers matches belong to their own rosters.</p></div>
    </section>
  );
}

function LeagueTeamPreview({ division = LEAGUE_DIVISIONS.find((item) => item.number === 1) }) {
  return (
    <section className="league-panel league-team-preview">
      <div><p className="league-eyebrow">Your league identity · At launch</p><h2>A team players can call their own.</h2><p>After the manager's payment is confirmed and players accept their roster places, their profile will show their team, division and league role. League roles stay separate from website staff roles.</p><div className="league-role-list"><span><UserCog className="h-3.5 w-3.5" />Manager</span><span><UserRound className="h-3.5 w-3.5" />Player</span><span><Users className="h-3.5 w-3.5" />Reserve</span></div></div>
      <div className="league-profile-example" aria-label="Example of a future league profile badge">
        <span className="league-small-label">Profile example · Not a registered team</span>
        <div className="league-example-identity"><LeagueTeamLogo team={{ id: "topfragg" }} size={40} /><div><strong>Topfragg</strong><span>Topfragg League · {division.name}</span></div></div>
        <div className="league-example-badges"><span>{division.name}</span><span>League player</span></div>
        <div className="league-example-match"><Swords className="h-4 w-4 text-cyan" /><span>Assigned {division.name} matches</span><LockKeyhole className="h-3.5 w-3.5 text-vapor" /></div>
      </div>
    </section>
  );
}

function LeagueDivisionList() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const divisions = LEAGUE_DIVISIONS.filter((division) => (
    (filter === "all" || (filter === "premier" ? division.number && division.number <= 2 : filter === "league" ? division.number >= 3 : division.id === "challengers"))
    && division.name.toLowerCase().includes(search.trim().toLowerCase())
  ));
  const groups = [
    { id: "challengers", name: "Challengers", description: "Highest tier", entries: divisions.filter((division) => division.id === "challengers") },
    { id: "premier", name: "Division 1–2", description: "Premier divisions", entries: divisions.filter((division) => division.number && division.number <= 2) },
    { id: "league", name: "Division 3–12", description: "League divisions", entries: divisions.filter((division) => division.number >= 3) },
  ].filter((group) => group.entries.length > 0);
  return (
    <section id="league-divisions" className="league-division-section">
      <div className="league-section-title"><div><p className="league-eyebrow">Competition directory</p><h2>Choose your division</h2><p className="league-section-description">Highest to lowest: Challengers, then Division 1 through 12.</p></div><span className="league-directory-count">{divisions.length} / 13 divisions</span></div>
      <div className="league-division-toolbar">
        <div className="league-filters" aria-label="Filter league divisions">{[{ id: "all", name: "All divisions" }, { id: "challengers", name: "Challengers" }, { id: "premier", name: "Div 1–2" }, { id: "league", name: "Div 3–12" }].map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.name}</button>)}</div>
        <label className="league-search"><Search className="h-4 w-4" /><input aria-label="Search divisions" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a division" /></label>
      </div>
      <div className="league-directory">
        <div className="league-directory-columns" aria-hidden="true"><span>Division</span><span className="league-row-roster">Team roster</span><span>Entry / team</span><span className="text-right">View</span></div>
        {groups.map((group) => <section key={group.id} className={`league-directory-group league-directory-group-${group.id}`} aria-labelledby={`league-group-${group.id}`}>
          <div className="league-directory-group-title"><h3 id={`league-group-${group.id}`}>{group.name}</h3><span>{group.description}</span></div>
          <ul>{group.entries.map((division) => <li key={division.id}><Link to={leagueDivisionUrl(division)} className="league-division-row" aria-label={`View ${division.name}, entry ${division.fee} US dollars per team`}>
            <div className="league-row-identity"><span className="league-row-number" aria-hidden="true">{division.number ? String(division.number).padStart(2, "0") : <Crown className="h-5 w-5" />}</span><div><h4>{division.name}</h4><span>{division.id === "challengers" ? "Highest level" : division.number === 1 ? "Highest numbered division" : "MW4 league"}</span></div></div>
            <div className="league-row-roster"><Users className="h-3.5 w-3.5" /><span>4 players <span className="league-row-reserves">+ 2 reserves</span></span></div>
            <div className="league-row-entry"><strong>${division.fee}</strong><span>USD / team</span></div>
            <span className="league-row-action"><span>View division</span><ChevronRight className="h-4 w-4" /></span>
          </Link></li>)}</ul>
        </section>)}
      </div>
      <p className="league-directory-footnote"><Info className="h-3.5 w-3.5 shrink-0" />Entry fees are shown for launch. Browsing a division does not register or charge your team.</p>
      {divisions.length === 0 && <div className="league-panel league-empty"><Search className="h-6 w-6 text-cyan" /><h3>No matching divisions</h3><p>Try another search or view all divisions.</p><button type="button" onClick={() => { setFilter("all"); setSearch(""); }} className="league-button">Reset filters</button></div>}
    </section>
  );
}

function LeagueDivision({ division }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selectedView = divisionViews.find((view) => view.id === params.get("view"))?.id || "standings";
  const selected = divisionViews.find((view) => view.id === selectedView);
  const isChallengers = division.id === "challengers";
  return (
    <>
      <div className="league-division-navigation">
        <Link to="/league#league-divisions" className="league-back"><ArrowLeft className="h-4 w-4" />All divisions</Link>
        <label className="league-division-switch"><span>Division</span><select aria-label="Choose league division" value={division.id} onChange={(event) => {
          const next = LEAGUE_DIVISIONS.find((item) => item.id === event.target.value);
          if (next) navigate(`${leagueDivisionUrl(next)}?view=${selectedView}`);
        }}>{LEAGUE_DIVISIONS.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === "challengers" ? " · Highest tier" : ""}</option>)}</select><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></label>
      </div>
      <header className={`league-panel league-division-header ${isChallengers ? "league-division-header-challengers" : ""}`}>
        <div className="league-division-title-group">
          <span className="league-division-emblem" aria-hidden="true">{isChallengers ? <Crown className="h-6 w-6" /> : String(division.number).padStart(2, "0")}</span>
          <div>
            <div className="league-division-game-intro">
              <img src="/assets/mw4/logo.webp" alt="Modern Warfare 4" width="600" height="236" className="league-division-game-logo" />
              <span className={`league-division-level ${isChallengers ? "league-division-level-highest" : ""}`}>{isChallengers ? "Highest tier" : division.number === 1 ? "Top numbered division" : "League division"}</span>
            </div>
            <h1>{division.name}</h1>
            <p>{isChallengers ? "The top level of Topfragg League." : `Your dedicated Division ${division.number} competition.`}</p>
          </div>
        </div>
        <div className="league-division-entry"><span className="league-small-label">Team entry</span><strong>${division.fee}<span>USD / team</span></strong><ComingSoon /></div>
        <div className="league-division-header-meta"><span><Users className="h-3.5 w-3.5" />4 players + 2 reserves</span><span><ShieldCheck className="h-3.5 w-3.5" />Division-specific match access</span><span><CalendarDays className="h-3.5 w-3.5" />Season dates to be announced</span></div>
      </header>
      <div className="league-layout league-division-workspace">
        <div className="league-main-column">
          <LeagueDemoNotice />
          <section className="league-panel league-division-content">
            <nav className="league-view-tabs" aria-label={`${division.name} sections`}>{divisionViews.map(({ id, name, icon: TabIcon }) => <Link key={id} to={`${leagueDivisionUrl(division)}?view=${id}`} aria-current={selectedView === id ? "page" : undefined}><TabIcon className="h-4 w-4" />{name}</Link>)}</nav>
            <div className="league-division-section-heading"><div><h2>{division.name} {selected.name.toLowerCase()}</h2><p>{selectedView === "standings" ? "Sample leaderboard · Fictional team records" : selectedView === "teams" ? "Example teams · Click a team to see its roster" : "Sample fixtures · Open a demo match room"}</p></div><LeagueDemoLabel /></div>
            {selectedView === "standings" ? <LeagueDemoStandings /> : selectedView === "teams" ? <LeagueDemoTeams /> : <LeagueDemoMatches division={division} />}
            <div className="league-division-panel-footer"><Clock3 className="h-3.5 w-3.5" /><span>Demo data only. Registration and real fixtures are coming soon.</span></div>
          </section>
          {selectedView !== "matches" && <LeagueDemoUpcoming division={division} />}
          <section className="league-panel league-division-registration">
            <span className="league-icon"><UserCog className="h-5 w-5" /></span>
            <div><h2>Register through your team manager</h2><p>At launch, your manager pays <strong>${division.fee} per team</strong> and invites your roster from registered Topfragg players.</p></div>
            <button type="button" disabled className="league-button league-button-primary"><LockKeyhole className="h-3.5 w-3.5" />Coming soon</button>
          </section>
          <details className="league-panel league-division-guide">
            <summary><span className="league-icon"><ShieldCheck className="h-4 w-4" /></span><span><strong>Roster, league roles &amp; match access</strong><small>How managers, players and reserves will participate</small></span><ChevronDown className="h-4 w-4" /></summary>
            <div className="league-division-guide-content"><LeagueHowItWorks /><LeagueTeamPreview division={division} /></div>
          </details>
          <div className="league-division-access"><LockKeyhole className="h-4 w-4 shrink-0 text-cyan" /><p><strong>{division.name} stays separate.</strong> League match rooms will be accessible only to the assigned teams in this division.</p></div>
        </div>
        <LeagueNews compact />
      </div>
    </>
  );
}

function LeagueMyTeam() {
  return (
    <div className="league-layout">
      <div className="league-main-column">
        <section className="league-panel league-empty"><span className="league-icon"><Users className="h-6 w-6" /></span><h1>Your league team will live here.</h1><p>Manager registration is coming soon. Once a team's entry is paid and its roster confirmed, this area will give managers their roster controls and players their assigned division matches.</p><Link to="/league" className="league-button league-button-primary">Explore the divisions<ArrowRight className="h-4 w-4" /></Link></section>
        <LeagueTeamPreview />
        <section className="league-panel league-manager-preview"><p className="league-eyebrow">Manager controls · Coming at launch</p><h2>Your team, organised.</h2><ul>{["Register a named team in one division", "Pay the team's division entry fee", "Invite registered Topfragg players", `Fill ${TOPFRAGG_LEAGUE.starters} starting places and up to ${TOPFRAGG_LEAGUE.reserves} reserves`, "Manage accepted roster places", "Open your team's assigned league matches"].map((item) => <li key={item}><Check className="h-4 w-4 text-cyan" />{item}</li>)}</ul></section>
      </div>
      <LeagueNews />
    </div>
  );
}

export default function League() {
  const { divisionId } = useParams();
  const [params] = useSearchParams();
  const division = LEAGUE_DIVISIONS.find((item) => item.id === divisionId);
  const myTeam = !divisionId && params.get("view") === "my-team";
  if (divisionId && !division) return <div className="topfragg-league"><div className="league-container"><section className="league-panel league-empty"><Layers className="h-6 w-6 text-cyan" /><h1>Division not found</h1><p>Topfragg League has Division 1–12 and one Challengers ladder.</p><Link to="/league" className="league-button">Back to the league</Link></section></div></div>;
  return (
    <div className="topfragg-league"><div className="league-container">
      <div className="league-topline"><Link to="/league" className="league-wordmark"><ShieldCheck className="h-4 w-4 text-cyan" /><span>TOP<span className="text-cyan">FRAGG</span> LEAGUE</span></Link><span className="league-small-label flex items-center gap-1.5"><Gamepad2 className="h-3.5 w-3.5" />MW<span className="text-yellow-300">4</span></span></div>
      <nav className="league-main-nav" aria-label="Topfragg League"><Link to="/league" aria-current={!myTeam ? "page" : undefined}><Layers className="h-4 w-4" />League overview</Link><Link to="/league?view=my-team" aria-current={myTeam ? "page" : undefined}><Users className="h-4 w-4" />My league team<Clock3 className="h-3 w-3 text-vapor" /></Link></nav>
      {division ? <LeagueDivision division={division} /> : myTeam ? <LeagueMyTeam /> : <><LeagueIntroduction /><div className="league-opening-notice"><CalendarDays className="h-4 w-4 shrink-0 text-cyan" /><p><strong>Coming soon for MW4.</strong> Explore divisions and entry fees now. Signups, payments, season dates and league matches will follow at launch.</p></div><div className="league-layout"><div className="league-main-column"><LeagueDivisionList /><LeagueHowItWorks /><LeagueTeamPreview /></div><LeagueNews /></div></>}
      <p className="league-footer-note">Topfragg League is a standalone Topfragg competition. Registration is currently closed.</p>
    </div></div>
  );
}
