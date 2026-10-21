import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// A navigation preference only. The normal create flow still validates every
// player, selected roster, game configuration, entry and payment on the server.
export default function useRematchSettings(mode, setOpen, isOpen) {
  const location = useLocation();
  const navigate = useNavigate();
  const consumed = useRef(null);
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    const incoming = location.state?.rematch;
    if (!incoming || incoming.mode !== mode || consumed.current === location.key) return;
    consumed.current = location.key;
    setSettings(incoming);
    setOpen(true);
    const { rematch, ...rest } = location.state;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: rest });
  }, [mode, location.key, location.state, location.pathname, location.search, location.hash, navigate, setOpen]);
  useEffect(() => {
    if (!isOpen && !location.state?.rematch) setSettings(null);
  }, [isOpen, location.state?.rematch]);
  return settings?.mode === mode ? settings : null;
}
