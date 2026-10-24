import React, { useEffect, useRef, useState } from "react";
import { Minimize2, Move, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import AdminTickets from "@/components/admin/AdminTickets";
import "./staff-support-center.css";

export default function StaffSupportCenter({ user, open, onOpenChange, selectedCase, onRoomOpen }) {
  const panel = useRef(null), drag = useRef(null);
  const [position, setPosition] = useState(null);
  const constrain = (x, y) => {
    const rect = panel.current?.getBoundingClientRect();
    return { x: Math.max(8, Math.min(x, window.innerWidth - (rect?.width || 0) - 8)), y: Math.max(8, Math.min(y, window.innerHeight - (rect?.height || 0) - 8)) };
  };
  useEffect(() => {
    const resize = () => setPosition(current => current ? constrain(current.x, current.y) : null);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const startDrag = event => {
    if (event.button !== 0 || event.target.closest("button")) return;
    const rect = panel.current.getBoundingClientRect();
    drag.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  return <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Content ref={panel} className="staff-support-center staff-center-floating" style={position ? { left: position.x, top: position.y, transform: "none" } : undefined} onInteractOutside={event => event.preventDefault()} onOpenAutoFocus={event => event.preventDefault()}>
    <Dialog.Title className="sr-only">Topfragg support inbox center</Dialog.Title>
    <Dialog.Description className="sr-only">Manage support while browsing. Drag the top bar to move this window.</Dialog.Description>
    <div className="staff-center-return" onPointerDown={startDrag} onPointerMove={event => { if (drag.current) setPosition(constrain(event.clientX - drag.current.x, event.clientY - drag.current.y)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
      <button onClick={() => onOpenChange(false)}><Minimize2 size={14} /> Back to quick support</button>
      <span><Move size={14} /> Drag to move</span>
      <button aria-label="Center support window" onClick={() => setPosition(null)}>Center</button>
      <Dialog.Close aria-label="Close support center"><X size={17} /></Dialog.Close>
    </div>
    <AdminTickets key={selectedCase || "inbox"} user={user} embedded initialSelectedId={selectedCase} onRoomOpen={onRoomOpen} />
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
