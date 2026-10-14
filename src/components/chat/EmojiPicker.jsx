import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Smile, X } from "lucide-react";
import "@/styles/emoji-picker.css";

const EMOJI_GROUPS = [
  { id: "faces", label: "Faces", emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 🥹 😊 😎 🤓 🤪 😜 😝 😛 🥳 🫠 🥴 🥸 🫡 😱 🤯 😵‍💫 🤨 🙄 😴 🥱 😭 😤 😈 👿 🤡 👻 💀 ☠️ 🤖 👽 🫣 🥲 😬 🗿".split(" ") },
  { id: "gaming", label: "Gaming", emojis: "🎮 🕹️ 🎧 🎤 🖱️ ⌨️ 🏆 🥇 🥈 🥉 🎯 🎲 🧩 🛡️ ⚔️ 🔫 💣 🚀 👾 👑 🐉 🏹 🥊 🏁 🏎️ 🧠 💻 📡 🔋 🪖 🎖️ 🪄 🧙 🦾".split(" ") },
  { id: "hype", label: "Hype", emojis: "🔥 ⚡ 💥 💯 🚨 👀 👏 🙌 💪 🫶 🤝 🤙 ✨ 🌟 ⭐ 💫 🎉 🎊 🥂 📣 📢 🚀 🧨 🏅 🏆 🐐 👑 🤑 😤 😮‍💨 🥵 🥶 🤩".split(" ") },
  { id: "chaos", label: "Chaos", emojis: "🐸 🐒 🦆 🐔 🐓 🐀 🐁 🦝 🦨 🦖 🦕 🐙 🦑 🪼 🦀 🐢 🐍 🐛 🐝 🪲 🐌 🦟 🦇 🐈‍⬛ 🐕‍🦺 🦄 🧌 👹 👺 🤠 🫨 🤌 🫵 🤫 🤭 🫢 🫡 🧃".split(" ") },
  { id: "hearts", label: "Hearts", emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💘 💝 💖 💗 💓 💞 💕 💌 💟 ❣️ 💋 🫂".split(" ") },
  { id: "snacks", label: "Snacks", emojis: "🍕 🍔 🍟 🌮 🌯 🍗 🍿 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍉 🍓 🍌 🥑 🥨 🧀 🍜 🍣 🍱 🥤 🧋 ☕ 🍺 🍻 🥤".split(" ") },
];

export default function EmojiPicker({ onSelect, disabled = false, closeSignal }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("faces");
  const [position, setPosition] = useState(null);
  const anchorRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (closeSignal !== undefined) setOpen(false);
  }, [closeSignal]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const popover = popoverRef.current?.getBoundingClientRect();
      if (!anchor || !popover) return;

      const width = popover.width || Math.min(356, window.innerWidth - 32);
      const height = popover.height;
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, anchor.right - width));
      const spaceAbove = anchor.top - 12;
      const preferredTop = spaceAbove >= height ? anchor.top - height - 12 : anchor.bottom + 12;
      const top = Math.max(12, Math.min(preferredTop, window.innerHeight - height - 12));
      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, category]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!anchorRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const activeGroup = EMOJI_GROUPS.find(group => group.id === category) || EMOJI_GROUPS[0];

  return (
    <>
      <div ref={anchorRef} className="chat-emoji-anchor">
        <button
          type="button"
          className="chat-emoji-trigger"
          aria-label="Open emoji picker"
          aria-expanded={open}
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={() => setOpen(current => !current)}
        >
          <Smile size={19} />
        </button>
      </div>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="chat-emoji-popover"
          role="dialog"
          aria-label="Choose an emoji"
          style={{ left: position?.left ?? -9999, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
        >
          <div className="chat-emoji-heading">
            <div><strong>Emoji chaos</strong><span>Pick your mood 😈</span></div>
            <button type="button" aria-label="Close emoji picker" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="chat-emoji-categories" role="tablist" aria-label="Emoji categories">
            {EMOJI_GROUPS.map(group => (
              <button key={group.id} type="button" role="tab" aria-selected={category === group.id} onClick={() => setCategory(group.id)}>{group.label}</button>
            ))}
          </div>
          <div className="chat-emoji-grid" role="group" aria-label={`${activeGroup.label} emojis`}>
            {activeGroup.emojis.map((emoji, index) => (
              <button key={`${emoji}-${index}`} type="button" aria-label={`Insert ${emoji}`} onMouseDown={event => event.preventDefault()} onClick={() => onSelect?.(emoji)}>{emoji}</button>
            ))}
          </div>
          <div className="chat-emoji-footer">Click a few. We won't judge. ✨</div>
        </div>,
        document.body,
      )}
    </>
  );
}
