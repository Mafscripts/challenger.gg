$p = "C:\Users\livao\Documents\peak-rival-arena\src\pages\XP.jsx"
$c = Get-Content $p -Raw
$start = $c.IndexOf('        <div className="grid lg:grid-cols-3 gap-6">')
$end = $c.IndexOf('        <CreateLobbyModal', $start)
if ($start -lt 0 -or $end -lt 0) { throw "XP content markers not found" }
$new = @'
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
          <section className="glass overflow-hidden rounded-2xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Your XP progression</p>
                <h3 className="mt-1 text-lg font-black">Level {level}</h3>
              </div>
              <span className="rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 font-mono text-sm font-black text-cyan">{xp.toLocaleString()} XP</span>
            </div>
            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-xs text-vapor">Current level progress</p><p className="mt-1 text-2xl font-black">{Number(currentStats?.current_xp ?? (xp % xpToNext)).toLocaleString()} <span className="text-sm text-vapor">/ {xpToNext.toLocaleString()} XP</span></p></div>
                <p className="font-mono text-sm font-black text-cyan">{progress}%</p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/5 bg-secondary"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${progress}%` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Wins", value: currentStats?.wins || 0, icon: Trophy },
                  { label: "Losses", value: currentStats?.losses || 0, icon: Swords },
                  { label: "Win streak", value: currentStats?.win_streak || 0, icon: Flame },
                  { label: "Global place", value: leaderboardPosition ? `#${leaderboardPosition}` : "Unranked", icon: Medal },
                ].map((stat) => <div key={stat.label} className="rounded-xl border border-white/5 bg-background/30 p-4"><stat.icon className="h-4 w-4 text-cyan" /><p className="mt-3 text-[9px] font-black uppercase tracking-wider text-vapor">{stat.label}</p><p className="mt-1 font-mono text-lg font-black">{stat.value}</p></div>)}
              </div>
            </div>
          </section>

          <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Link to="/tournaments" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-orange/30"><Trophy className="h-5 w-5 text-orange" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Tournament card</p><p className="mt-1 text-xs text-vapor">Open tournaments and brackets.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-orange">View tournaments <ArrowRight className="h-3 w-3" /></span></Link>
            <Link to="/teams" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-cyan/30"><Swords className="h-5 w-5 text-cyan" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Team card</p><p className="mt-1 text-xs text-vapor">Manage your XP party and roster.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-cyan">View teams <ArrowRight className="h-3 w-3" /></span></Link>
            <Link to="/profile" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-purple-400/30"><Award className="h-5 w-5 text-purple-400" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Profile card</p><p className="mt-1 text-xs text-vapor">Your public profile, stats and trophies.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-purple-300">View profile <ArrowRight className="h-3 w-3" /></span></Link>
          </aside>
        </div>

'@
$c = $c.Substring(0, $start) + $new + $c.Substring($end)
$c = $c.Replace('mode="ranked"', 'mode="xp"')
$c = $c.Replace('base44.entities.RankedMatch.filterFresh({ status: "open" }', 'base44.entities.RankedMatch.filterFresh({ status: "open", match_type: "xp" }')
Set-Content $p $c
