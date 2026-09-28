import React from "react";
import { Headphones, Mic, MicOff, Radio, Volume2, VolumeX } from "lucide-react";
import useRankedVoice from "@/hooks/useRankedVoice";

const initials = (name) => String(name || "TF").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

function VoiceAvatar({ participant }) {
  return (
    <div className={`relative h-8 w-8 shrink-0 rounded-full border p-0.5 transition ${participant.speaking ? "border-green shadow-[0_0_0_3px_rgba(74,222,128,.12)]" : "border-white/10"}`}>
      {participant.avatar_url ? (
        <img src={participant.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white/[0.07] text-[9px] font-black text-vapor">{initials(participant.username)}</span>
      )}
      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#151d26] ${participant.speaking && !participant.muted ? "animate-pulse bg-green" : "bg-vapor/40"}`} />
    </div>
  );
}

export default function RankedVoicePanel({ match, user, isParticipant }) {
  const voice = useRankedVoice({
    matchId: match?.id,
    matchStatus: match?.status,
    userId: user?.id,
    enabled: Boolean(isParticipant),
  });

  if (!isParticipant) return null;
  const connected = voice.connectionState === "connected";
  const channelTone = voice.stage === "team" ? "text-orange" : voice.stage === "global" ? "text-green" : "text-vapor";

  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/15 p-3" aria-label="Ranked voice chat">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.17em] text-vapor"><Radio className={`h-3 w-3 ${connected ? "text-green" : "text-vapor/50"}`} /> Ranked voice</p>
          <p className={`mt-1 truncate text-[10px] font-black ${channelTone}`}>{voice.channel}</p>
        </div>
        <span className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-green" : voice.connectionState === "connecting" ? "animate-pulse bg-yellow-300" : "bg-red-400"}`} title={voice.connectionState} />
      </div>

      {voice.participants.length > 0 ? (
        <div className="mt-2 max-h-[104px] space-y-1 overflow-y-auto pr-1">
          {voice.participants.map((participant) => (
            <div key={participant.user_id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${participant.speaking && !participant.muted ? "border-green/25 bg-green/[0.07]" : "border-white/[0.05] bg-white/[0.02]"}`}>
              <VoiceAvatar participant={participant} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[10px] font-bold ${participant.speaking && !participant.muted ? "text-green" : "text-white"}`}>{participant.username}{participant.user_id === user?.id ? " (you)" : ""}</p>
                <p className="mt-0.5 text-[7px] font-black uppercase tracking-wider text-vapor/60">{participant.side === "alpha" ? "Team Alpha" : "Team Bravo"}</p>
              </div>
              {participant.muted ? <MicOff className="h-3 w-3 text-red-300" /> : participant.speaking ? <Mic className="h-3 w-3 text-green" /> : null}
              {participant.deafened ? <VolumeX className="h-3 w-3 text-vapor" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 truncate text-center text-[8px] text-vapor/65">{voice.stage === "waiting" ? "Voice opens after everyone readies up." : "Connecting players..."}</p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={voice.toggleMute} disabled={!connected} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[8px] font-black uppercase tracking-wider disabled:opacity-45 ${voice.muted ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.04] text-vapor hover:text-white"}`}>
          {voice.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {voice.muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={voice.toggleDeafen} disabled={!connected} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[8px] font-black uppercase tracking-wider disabled:opacity-45 ${voice.deafened ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.04] text-vapor hover:text-white"}`}>
          {voice.deafened ? <VolumeX className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />} {voice.deafened ? "Undeafen" : "Deafen"}
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="min-w-0">
          <span className="sr-only">Microphone</span>
          <select value={voice.selectedDeviceId} onChange={(event) => voice.selectDevice(event.target.value)} disabled={voice.devices.length === 0} className="w-full rounded-lg border border-white/[0.08] bg-[#111821] px-2 py-1.5 text-[8px] text-vapor outline-none focus:border-cyan/30 disabled:opacity-55">
            {voice.devices.length === 0 ? <option value="">No microphones detected</option> : null}
            {voice.devices.map((device, index) => <option key={device.deviceId || `microphone-${index}`} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
          </select>
        </label>
        <button type="button" onClick={voice.prepareMicrophone} disabled={!connected} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan/20 bg-cyan/[0.07] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-40" title="Allow microphone access and refresh devices">
          <Mic className="h-3 w-3" /> Detect
        </button>
      </div>

      {voice.autoplayBlocked ? <button type="button" onClick={voice.resumeAudio} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan/20 bg-cyan/[0.07] px-2 py-2 text-[8px] font-black uppercase text-cyan"><Volume2 className="h-3 w-3" /> Enable voice audio</button> : null}
      {voice.error ? <p className="mt-2 text-[8px] leading-4 text-red-300">{voice.error}</p> : null}
    </section>
  );
}
