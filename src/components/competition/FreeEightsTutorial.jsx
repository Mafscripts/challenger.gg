import React, { useState } from "react";
import { Download, ExternalLink, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const tutorialPath = "/tutorials/free-8s";

export default function FreeEightsTutorial() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="competition-action-pill"><PlayCircle className="h-4 w-4" /> How to join</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[96vw] max-w-[1400px] max-h-[94dvh] overflow-y-auto p-3 sm:p-5">
        <DialogHeader className="pr-8"><DialogTitle className="text-base font-black">How to join Free 8s</DialogTitle><DialogDescription className="text-xs">Discord, Activision ID, game rank and your first lobby. Follow the actual desktop interface at your own pace.</DialogDescription></DialogHeader>
        {open && <iframe title="How to join Topfragg Free 8s — desktop tutorial" src={`${tutorialPath}/index.html?embed=1`} className="aspect-video w-full rounded-lg border border-white/10 bg-background" allowFullScreen />}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <a href={`${tutorialPath}/index.html`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-cyan"><ExternalLink className="h-3.5 w-3.5" /> Open full guide</a>
          <a href={`${tutorialPath}/how-to-join-free-8s-desktop-1440p.mp4`} download className="inline-flex items-center gap-1.5 font-bold text-cyan"><Download className="h-3.5 w-3.5" /> Download video</a>
        </div>
        <details className="rounded-lg border border-white/10 bg-background/40 px-4 py-3 text-xs">
          <summary className="cursor-pointer font-bold text-cyan">Read the setup steps</summary>
          <ol className="mt-3 list-decimal space-y-3 pl-4 leading-6 text-vapor">
            <li><a href="/settings#settings-discord" className="font-bold text-foreground underline underline-offset-4">Account Settings &rarr; Connections &rarr; Discord</a>: connect Discord, join the Topfragg server and use Sync role if verification is pending.</li>
            <li><a href="/settings#settings-gaming" className="font-bold text-foreground underline underline-offset-4">Connections &rarr; Gaming IDs</a>: click Edit, enter your full Activision ID and Save Changes.</li>
            <li><a href="/settings#settings-rank" className="font-bold text-foreground underline underline-offset-4">Account &rarr; Game rank</a>: save Titan (Diamond), Master (Crimson) or Apex (Iridescent). Legend (Top 250) requires admin approval.</li>
            <li>In Free 8s, choose your game, check the lobby format and game mode, then click <strong className="text-foreground">Accept This Match</strong>.</li>
            <li>In the matchroom, click <strong className="text-foreground">Join 8s Waiting Room</strong>. Use your linked Discord account. When all players are ready in this match's room, the system assigns teams and the bot moves you into team voice.</li>
          </ol>
        </details>
      </DialogContent>
    </Dialog>
  </>;
}
