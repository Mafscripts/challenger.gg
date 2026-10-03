$p = "C:\Users\livao\Documents\peak-rival-arena\src\components\match\CreateLobbyModal.jsx"
$c = Get-Content $p -Raw
$c = $c.Replace('const isRanked = mode === "ranked";', 'const isRanked = mode === "ranked" || mode === "xp";')
$c = $c.Replace("const matchType = isEights ? '8s' : mode === 'ranked' ? 'ranked' : 'wagers';", "const matchType = isEights ? '8s' : mode === 'xp' ? 'xp' : mode === 'ranked' ? 'ranked' : 'wagers';")
$c = $c.Replace('} else if (mode === "ranked") {', '} else if (mode === "ranked" || mode === "xp") {')
$c = $c.Replace('max_players: teamSizeObj.players,', "max_players: teamSizeObj.players,`r`n            match_type: mode === `"xp`" ? `"xp`" : `"ranked`",")
Set-Content $p $c

$p = "C:\Users\livao\Documents\peak-rival-arena\base44\functions\createRankedMatch\entry.ts"
$c = Get-Content $p -Raw
$c = $c.Replace("status: 'open',", "match_type: body.match_type === 'xp' ? 'xp' : 'ranked',`r`n      status: 'open',")
Set-Content $p $c

$p = "C:\Users\livao\Documents\peak-rival-arena\src\App.jsx"
$c = Get-Content $p -Raw
$c = $c.Replace("const RankedMatchRoom = lazy(() => import('@/pages/RankedMatchRoom'));", "const RankedMatchRoom = lazy(() => import('@/pages/RankedMatchRoom'));`r`nconst XP = lazy(() => import('@/pages/XP'));`r`nconst XPMatchRoom = lazy(() => import('@/pages/XPMatchRoom'));")
$c = $c.Replace('<Route path="/ranked" element={<Ranked />} />', "<Route path=`"/ranked`" element={<Ranked />} />`r`n          <Route path=`"/xp`" element={<XP />} />")
$c = $c.Replace('<Route path="/ranked-match/:id" element={<RankedMatchRoom />} />', "<Route path=`"/ranked-match/:id`" element={<RankedMatchRoom />} />`r`n          <Route path=`"/xp-match/:id`" element={<XPMatchRoom />} />")
Set-Content $p $c

$p = "C:\Users\livao\Documents\peak-rival-arena\src\components\competition\CompetitionLadder.jsx"
$c = Get-Content $p -Raw
$c = $c.Replace('{ key: "xp", label: "XP Matches", to: "/ranked", icon: Zap }', '{ key: "xp", label: "XP Matches", to: "/xp", icon: Zap }')
Set-Content $p $c

$p = "C:\Users\livao\Documents\peak-rival-arena\src\components\layout\Navbar.jsx"
$c = Get-Content $p -Raw
$c = $c.Replace('path: "/ranked", icon: Swords, tone: "cyan"', 'path: "/xp", icon: Swords, tone: "cyan"')
$c = $c.Replace('path: "/ranked#standings", icon: Trophy, tone: "cyan"', 'path: "/xp#standings", icon: Trophy, tone: "cyan"')
Set-Content $p $c

$p = "C:\Users\livao\Documents\peak-rival-arena\src\pages\XPMatchRoom.jsx"
$c = Get-Content $p -Raw
$c = $c.Replace('export default function RankedMatchRoom()', 'export default function XPMatchRoom()')
$c = $c.Replace('completeRankedMatch', 'completeXPMatch')
$c = $c.Replace('match?.elo_changes?.[user?.id]', 'match?.xp_changes?.[user?.id]')
$c = $c.Replace('Your ELO change', 'Your XP change')
$c = $c.Replace(' ELO', ' XP')
$c = $c.Replace('navigate("/ranked", { replace: true })', 'navigate("/xp", { replace: true })')
$c = $c.Replace('to="/ranked"', 'to="/xp"')
$c = $c.Replace('Back to Ranked', 'Back to XP')
$c = $c.Replace('>Ranked<', '>XP<')
$c = $c.Replace('Continue to Ranked', 'Continue to XP')
Set-Content $p $c