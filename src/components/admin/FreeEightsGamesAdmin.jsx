import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2, RefreshCw, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { eightsSlug } from "@/lib/freeEightsGames";
import { useQueryClient } from "@tanstack/react-query";
import FreeEightsGameName from "@/components/competition/FreeEightsGameName";

const fieldClass = "w-full min-w-0 rounded-lg border border-white/10 bg-[#0d131a] px-3 py-2 text-xs text-white outline-none focus:border-cyan/50";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white hover:bg-white/[0.08] disabled:opacity-50";
const newId = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
function Field({ label, children }) { return <label className="block min-w-0 space-y-1.5"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">{label}</span>{children}</label>; }

export default function FreeEightsGamesAdmin() {
  const queryClient = useQueryClient();
  const [games, setGames] = useState([]);
  const [version, setVersion] = useState(null);
  const [selected, setSelected] = useState("bo7");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const game = games.find((row) => row.id === selected);
  const load = async () => {
    setLoading(true); setError("");
    try { const { data } = await base44.functions.invoke("getFreeEightsGames"); setGames(data.games); setVersion(data.version); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const patch = (changes) => setGames((rows) => rows.map((row) => row.id === selected ? { ...row, ...changes } : row));
  const patchMode = (modeId, changes) => patch({ modes: game.modes.map((row) => row.id === modeId ? { ...row, ...changes } : row) });
  const patchMap = (modeId, index, changes) => setGames((rows) => rows.map((row) => row.id !== selected ? row : { ...row, modes: row.modes.map((mode) => mode.id !== modeId ? mode : { ...mode, maps: mode.maps.map((map, i) => i === index ? { ...map, ...changes } : map) }) }));
  const save = async () => {
    setSaving(true); setError("");
    try { const { data } = await base44.functions.invoke("updateFreeEightsGames", { games, version }); setGames(data.games); setVersion(data.version); void queryClient.invalidateQueries({ queryKey: ["free-eights-games"] }); toast({ title: "Free 8s games saved", description: "New lobbies will use these modes, formats and maps." }); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const upload = async (modeId, index, file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000) { setError("Choose a PNG, JPG or WebP under 2 MB."); return; }
    setUploading(`${modeId}:${index}`); setError("");
    try {
      const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const { data } = await base44.functions.invoke("uploadFreeEightsMapImage", { image });
      patchMap(modeId, index, { image: data.image });
    } catch (err) { setError(err.message || "Upload failed"); }
    finally { setUploading(""); }
  };
  const addGame = () => {
    const id = newId("game");
    setGames((rows) => [...rows, { id, name: "New game", number: "", color: "orange", enabled: true, modes: [{ id: "mode_1", name: "Game mode", maps: [{ name: "", image: "" }] }], formats: [{ id: "mode_bo1", name: "Game mode BO1", modes: ["mode_1"] }, { id: "mode_bo3", name: "Game mode BO3", modes: ["mode_1", "mode_1", "mode_1"] }] }]);
    setSelected(id);
  };
  return <section className="space-y-5 rounded-2xl border border-white/10 bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Free 8s games & map pools</h2><p className="mt-1 text-xs text-vapor">Manage each game separately. Saved changes apply to new lobbies.</p></div><div className="flex gap-2"><button type="button" className={buttonClass} disabled={loading || saving || Boolean(uploading)} onClick={load}><RefreshCw className="h-4 w-4" /> Reload</button><button type="button" className={buttonClass} disabled={loading || saving || Boolean(uploading) || !version} onClick={save}><Save className="h-4 w-4 text-green" /> {saving ? "Saving..." : "Save games"}</button></div></div>
    {error && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
    {loading ? <p className="text-sm text-vapor">Loading games...</p> : <>
      <div className="flex flex-wrap gap-2">{games.map((row) => <button type="button" disabled={saving || Boolean(uploading)} key={row.id} onClick={() => setSelected(row.id)} className={`${buttonClass} ${selected === row.id ? "!border-cyan/40 !bg-cyan/10" : ""}`}><FreeEightsGameName game={row} />{!row.enabled && <span className="text-vapor">(disabled)</span>}</button>)}<button type="button" className={buttonClass} disabled={saving || Boolean(uploading) || games.length >= 20} onClick={addGame}><Plus className="h-4 w-4" /> Add game</button></div>
      {game && <fieldset disabled={saving || Boolean(uploading)} className="min-w-0 space-y-6 disabled:opacity-60">
        <div className="grid gap-3 sm:grid-cols-4"><Field label="Game name"><input className={fieldClass} value={game.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></Field><Field label="Game number (optional)"><input className={fieldClass} value={game.number} maxLength={8} onChange={(event) => patch({ number: event.target.value })} /></Field><Field label="Number color"><select className={fieldClass} value={game.color} onChange={(event) => patch({ color: event.target.value })}><option value="orange">Orange</option><option value="green">Green</option></select></Field><Field label="Availability"><select className={fieldClass} value={String(game.enabled)} onChange={(event) => patch({ enabled: event.target.value === "true" })}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field></div>
        <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-black">Game modes & maps</h3><button type="button" className={buttonClass} disabled={game.modes.length >= 12} onClick={() => patch({ modes: [...game.modes, { id: newId("mode"), name: "New mode", maps: [{ name: "", image: "" }] }] })}><Plus className="h-4 w-4" /> Add mode</button></div>
          {game.modes.map((mode) => <article key={mode.id} className="space-y-3 rounded-xl border border-white/10 bg-background/40 p-3 sm:p-4"><div className="flex items-end gap-3"><div className="flex-1"><Field label="Mode name"><input className={fieldClass} value={mode.name} maxLength={80} onChange={(event) => patchMode(mode.id, { name: event.target.value })} /></Field></div><button type="button" className={buttonClass} aria-label={`Remove ${mode.name} mode`} disabled={game.modes.length === 1} onClick={() => patch({ modes: game.modes.filter((row) => row.id !== mode.id), formats: game.formats.filter((format) => !format.modes.includes(mode.id)) })}><Trash2 className="h-4 w-4 text-red-300" /></button></div>
            <div className="space-y-2">{mode.maps.map((map, index) => <div key={`${mode.id}-${index}`} className="grid min-w-0 items-center gap-2 rounded-lg border border-white/[0.06] p-2 sm:grid-cols-[64px_minmax(0,1fr)_auto]">{map.image ? <img src={map.image} alt={map.name || "Map preview"} className="h-10 w-16 rounded-md object-cover" /> : <span className="flex h-10 w-16 items-center justify-center rounded-md bg-white/5 text-[8px] text-vapor">No image</span>}<div className="grid min-w-0 gap-2 md:grid-cols-2"><input aria-label={`${mode.name} map ${index + 1} name`} placeholder="Map name" className={fieldClass} value={map.name} maxLength={80} onChange={(event) => patchMap(mode.id, index, { name: event.target.value })} /><input aria-label={`${mode.name} map ${index + 1} image URL`} placeholder="Image URL or upload" className={fieldClass} value={map.image} onChange={(event) => patchMap(mode.id, index, { image: event.target.value })} /></div><div className="flex gap-2"><label className={`${buttonClass} cursor-pointer`}><Upload className="h-4 w-4" /><span>{uploading === `${mode.id}:${index}` ? "Uploading..." : "Image"}</span><input aria-label={`Upload ${mode.name} map ${index + 1} image`} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { upload(mode.id, index, event.target.files?.[0]); event.target.value = ""; }} /></label><button type="button" className={buttonClass} aria-label={`Remove ${mode.name} map ${index + 1}`} disabled={mode.maps.length === 1} onClick={() => patchMode(mode.id, { maps: mode.maps.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4 text-red-300" /></button></div></div>)}</div>
            <button type="button" className={buttonClass} disabled={mode.maps.length >= 40} onClick={() => patchMode(mode.id, { maps: [...mode.maps, { name: "", image: "" }] })}><Plus className="h-4 w-4" /> Add map</button>
          </article>)}
        </div>
        <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black">Series formats</h3><button type="button" className={buttonClass} disabled={game.formats.length >= 30} onClick={() => patch({ formats: [...game.formats, { id: newId(eightsSlug("series")), name: "New series", modes: [game.modes[0].id] }] })}><Plus className="h-4 w-4" /> Add series</button></div><p className="text-xs text-vapor">Choose BO1 or BO3, then select the mode for each map. Any configured mode can be used.</p>
          {game.formats.map((format) => <div key={format.id} className="grid gap-3 rounded-xl border border-white/10 bg-background/40 p-3 sm:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_auto]"><Field label="Series name"><input className={fieldClass} value={format.name} maxLength={80} onChange={(event) => patch({ formats: game.formats.map((row) => row.id === format.id ? { ...row, name: event.target.value } : row) })} /></Field><Field label="Best of"><select className={fieldClass} value={format.modes.length} onChange={(event) => patch({ formats: game.formats.map((row) => row.id === format.id ? { ...row, modes: Array.from({ length: Number(event.target.value) }, (_, index) => row.modes[index] || game.modes[0].id) } : row) })}><option value="1">BO1</option><option value="3">BO3</option></select></Field><div className="flex min-w-0 gap-2">{format.modes.map((modeId, index) => <div key={index} className="min-w-0 flex-1"><Field label={`Map ${index + 1}`}><select className={fieldClass} value={modeId} onChange={(event) => patch({ formats: game.formats.map((row) => row.id === format.id ? { ...row, modes: row.modes.map((value, i) => i === index ? event.target.value : value) } : row) })}>{game.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></Field></div>)}</div><button type="button" className={`${buttonClass} self-end`} aria-label={`Remove ${format.name} series`} disabled={game.formats.length === 1} onClick={() => patch({ formats: game.formats.filter((row) => row.id !== format.id) })}><Trash2 className="h-4 w-4 text-red-300" /></button></div>)}
        </div>
      </fieldset>}
    </>}
  </section>;
}
