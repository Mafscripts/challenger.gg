import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "@/styles/admin-workspace.css";

export default function useAdminConfirm() {
  const [request, setRequest] = useState(null), [value, setValue] = useState("");
  const [repeat, setRepeat] = useState("");
  const resolve = useRef(null);
  useEffect(() => () => resolve.current?.(false), []);
  const finish = accepted => {
    const pending = resolve.current;
    resolve.current = null;
    setRequest(null);
    pending?.(accepted ? (request?.input ? value : true) : false);
    setValue(""); setRepeat("");
  };
  const confirm = options => new Promise(done => {
    resolve.current?.(false);
    resolve.current = done;
    setValue(String(options.input?.value ?? ""));
    setRepeat("");
    setRequest(options);
  });
  const Icon = request?.tone === "danger" ? Trash2 : request?.tone === "warning" ? AlertTriangle : Check;
  const password = request?.input?.type === "password";
  const valid = !request?.input || (password ? value.length >= 8 && value === repeat
    : value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= (request.input.min ?? 1) && Number(value) <= (request.input.max ?? 256));
  return { confirm, dialog: request && <Dialog open onOpenChange={open => { if (!open) finish(false); }}><DialogContent className="admin-action-dialog admin-confirm-dialog" overlayClassName="admin-confirm-overlay" data-tone={request.tone || "success"}>
    <span className="admin-confirm-icon"><Icon size={24} /></span><DialogTitle>{request.title}</DialogTitle><DialogDescription>{request.description}</DialogDescription>
    {request.input && <label>{request.input.label}<input type={password ? "password" : "number"} autoComplete={password ? "new-password" : undefined} min={password ? undefined : request.input.min ?? 1} max={password ? undefined : request.input.max ?? 256} value={value} onChange={event => setValue(event.target.value)} autoFocus /></label>}
    {password && <label>Repeat temporary password<input type="password" autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} /></label>}
    {password && ((value && value.length < 8) || (repeat && repeat !== value)) && <p className="text-xs text-red-300" role="status">{value.length < 8 ? "Use at least 8 characters." : "The two passwords must match."}</p>}
    <div className="admin-confirm-actions"><button type="button" autoFocus={!request.input} onClick={() => finish(false)}>Cancel</button><button type="button" disabled={!valid} onClick={() => finish(true)}><Icon size={14} />{request.confirmLabel || "Confirm"}</button></div>
  </DialogContent></Dialog> };
}
