import React from "react";
import { Check, Clock3 } from "lucide-react";
import { matchRoomFlow } from "@/lib/matchRoomFlow";

export function openMatchRoomSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  if (section.tagName === "DETAILS") section.open = true;
  section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  section.querySelector("summary")?.focus({ preventScroll: true });
}

// Reuses the room's existing state, timers and permitted action callbacks.
export default function MatchRoomProgress({ actions = {}, secondaryActions = {}, deadline, notice, ...context }) {
  const flow = matchRoomFlow(context);
  if (!flow) return null;
  const current = flow.steps.findIndex((step) => step.id === flow.phase);
  const primary = actions[flow.action];
  const secondary = Object.entries(secondaryActions).filter(([key, control]) => control && (key !== flow.action || !primary));
  return <section className="room-progress" aria-label="Match progress" data-review={flow.review || undefined}>
    <ol className="room-progress-steps" aria-label="Match stages">
      {flow.steps.map((step, index) => <li key={step.id} data-state={index < current ? "done" : index === current ? "current" : "upcoming"} aria-current={index === current ? "step" : undefined}>
        <span className="room-progress-marker" aria-hidden="true">{index < current ? <Check /> : index + 1}</span>
        <span>{step.label}</span>
      </li>)}
    </ol>
    <div className="room-progress-next">
      <div className="room-progress-copy">
        <p className="room-progress-label">{primary ? "Your next step" : "Current step"}</p>
        <h2 aria-live="polite">{flow.title}</h2>
        <p className="room-progress-description">{flow.description}</p>
        <p className="room-progress-waiting"><span>Waiting on</span> {flow.waitingOn}</p>
        {notice && flow.timerLabel && <p className="room-progress-description">{notice}</p>}
      </div>
      {(primary || secondary.length > 0 || flow.timerLabel && deadline) && <div className="room-progress-controls">
        {flow.timerLabel && deadline && <p className="room-progress-timer"><Clock3 aria-hidden="true" /><span>{flow.timerLabel}</span><strong>{deadline === "EXPIRED" ? "Expired" : deadline}</strong></p>}
        {primary && <div className="room-progress-action">{primary}</div>}
        {secondary.map(([key, control]) => <div key={key} className="room-progress-secondary">{control}</div>)}
      </div>}
    </div>
  </section>;
}
