import React from "react";
import { Minimize2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import AdminTickets from "@/components/admin/AdminTickets";
import "./staff-support-center.css";

export default function StaffSupportCenter({ user, open, onOpenChange, selectedCase, onRoomOpen }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="staff-support-center">
    <DialogTitle className="sr-only">Topfragg support inbox center</DialogTitle>
    <DialogDescription className="sr-only">Manage live support, tickets, disputes and admin requests. Open the linked match room to help players.</DialogDescription>
    <div className="staff-center-return"><button onClick={() => onOpenChange(false)}><Minimize2 size={14} /> Back to quick support</button></div>
    <AdminTickets key={selectedCase || "inbox"} user={user} embedded initialSelectedId={selectedCase} onRoomOpen={() => { onOpenChange(false); onRoomOpen?.(); }} />
  </DialogContent></Dialog>;
}
