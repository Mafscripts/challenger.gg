import React, { useRef } from "react";
import { Link } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Award, Settings, X } from "lucide-react";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { freeEightsRankUploadUrl, hasFreeEightsRank } from "@/lib/freeEightsRankRequirement";

export function UploadFreeEightsRank() {
  return <Link to={freeEightsRankUploadUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-xs font-black text-blue-200"><Settings className="h-4 w-4" />Choose game rank</Link>;
}

export function FreeEightsRankNotice({ user }) {
  if (!user?.id || hasFreeEightsRank(user)) return null;
  return <div className="my-4 rounded-xl border border-blue-400/20 bg-blue-500/5 p-4">
    <p className="text-sm font-bold text-white">Add your ranked rank to join Free 8s</p>
    <p className="mt-1 text-xs leading-5 text-vapor">Choose Diamond, Crimson or Iridescent in Settings to create or join Free 8s. Top 250 is available through an admin request.</p>
    <div className="mt-3"><UploadFreeEightsRank /></div>
  </div>;
}

export function FreeEightsRankDialog({ open, onOpenChange, returnFocusTo }) {
  const uploadLink = useRef(null);
  const opener = useRef(null);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay className="z-[110] bg-black/70 backdrop-blur-sm" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-blue-400/25 bg-card p-6 shadow-[0_24px_80px_rgba(0,0,0,.6)] sm:p-7"
        onOpenAutoFocus={(event) => { opener.current = document.activeElement; event.preventDefault(); uploadLink.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); const target = returnFocusTo?.current || opener.current; if (target?.isConnected) target.focus(); }}>
        <DialogClose asChild><button type="button" aria-label="Close rank requirement popup" className="absolute right-4 top-4 rounded-lg p-1.5 text-vapor hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></DialogClose>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-500/15 text-blue-300"><Award className="h-6 w-6" /></div>
        <DialogTitle className="pr-5 text-2xl font-black text-white">Choose your rank to join Free 8s</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-vapor">Set your game rank in Settings before creating or joining a Free 8s lobby.</DialogDescription>
        <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-vapor">Diamond, Crimson and Iridescent are saved immediately. Top 250 requires an admin request. Your current rank stays active while that request is reviewed.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Link ref={uploadLink} to={freeEightsRankUploadUrl} onClick={() => onOpenChange(false)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-xs font-black text-white hover:bg-blue-600"><Settings className="h-4 w-4" />Choose game rank</Link>
          <DialogClose asChild><button type="button" className="rounded-xl border border-white/10 px-5 py-3 text-xs font-bold text-vapor hover:bg-white/5 hover:text-white">Not now</button></DialogClose>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}
