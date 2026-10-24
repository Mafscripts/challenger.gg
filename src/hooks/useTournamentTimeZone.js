import { useCallback, useEffect, useState } from "react";
import { isValidTournamentTimeZone, resolveTournamentTimeZone, resolvedBrowserTimeZone } from "@/lib/tournamentTime";

const storageKey = "topfragg:tournament-timezone";
const changedEvent = "topfragg:tournament-timezone-changed";
let sessionSelection = "local";
const validSelection = value => value === "local" || isValidTournamentTimeZone(value) ? value : "local";
const savedSelection = () => {
  try { return validSelection(window.localStorage.getItem(storageKey) || sessionSelection); }
  catch { return sessionSelection; }
};

// This is a display preference. Changing it never moves an event or its deadline.
export function useTournamentTimeZone() {
  const [selection, setSelectionState] = useState(savedSelection);
  const [automaticZone, setAutomaticZone] = useState(resolvedBrowserTimeZone);
  useEffect(() => {
    const sync = () => setSelectionState(savedSelection());
    const fromEvent = event => setSelectionState(validSelection(event.detail));
    const fromStorage = event => {
      if (event.key !== storageKey && event.key !== null) return;
      sessionSelection = validSelection(event.newValue);
      sync();
    };
    const refreshAutomaticZone = () => setAutomaticZone(resolvedBrowserTimeZone());
    window.addEventListener(changedEvent, fromEvent);
    window.addEventListener("storage", fromStorage);
    window.addEventListener("focus", refreshAutomaticZone);
    return () => { window.removeEventListener(changedEvent, fromEvent); window.removeEventListener("storage", fromStorage); window.removeEventListener("focus", refreshAutomaticZone); };
  }, []);
  const setSelection = useCallback(value => {
    const next = validSelection(value);
    sessionSelection = next;
    setSelectionState(next);
    try { window.localStorage.setItem(storageKey, next); } catch { /* Still works for this page when storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(changedEvent, { detail: next }));
  }, []);
  return { selection, setSelection, automaticZone, timeZone: selection === "local" ? automaticZone : resolveTournamentTimeZone(selection) };
}

export default useTournamentTimeZone;
