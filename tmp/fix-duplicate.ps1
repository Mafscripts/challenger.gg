$p = "C:\Users\livao\Documents\peak-rival-arena\src\components\match\CreateLobbyModal.jsx"
$c = Get-Content $p -Raw
$old = "            match_type: mode === `"xp`" ? `"xp`" : `"ranked`",`r`n            best_of: bestOf,"
$new = "            best_of: bestOf,"
$c = $c.Replace($old, $new)
Set-Content $p $c