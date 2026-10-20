import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Crown, MessageSquare, Trophy, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import "@/styles/navbar-messages.css";

function MessageAvatar({ player, message, invitation }) {
  const avatar = player?.avatar_url || message.sender_avatar_url;
  return <span className="nav-message-avatar" aria-hidden="true">
    {invitation ? <TopfraggLogo showWordmark={false} markClassName="!h-10 !w-10" />
      : <PlayerAvatarImage user={player} src={avatar} />}
  </span>;
}

export default function NavbarMessages({ open, messages, unreadCount, formatTime, onRead, onClose }) {
  const [players, setPlayers] = useState({});

  // Fetch only the handful of visible senders; retain their avatars between openings.
  useEffect(() => {
    if (!open) return undefined;
    const ids = [...new Set(messages.filter(message => message.message_type === "direct_message")
      .map(message => message.sender_id).filter(Boolean))]
      .filter(id => !Object.prototype.hasOwnProperty.call(players, id));
    if (!ids.length) return undefined;
    let active = true;
    Promise.all(ids.map(async id => {
      try {
        const response = await base44.functions.invoke("searchMessageRecipients", { recipient_id: id });
        return [id, response.data?.users?.[0] || null];
      } catch {
        return [id, null];
      }
    })).then(entries => {
      if (active) setPlayers(current => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [open, messages, players]);

  if (!open) return null;

  return <div id="nav-messages-preview" className="nav-popover nav-popover-enter nav-messages-popover absolute right-0 top-12 z-50 w-[min(400px,calc(100vw-1rem))] overflow-hidden rounded-2xl" role="region" aria-label="Messages preview">
    <header className="nav-messages-header">
      <div><p className="nav-messages-eyebrow">Private inbox</p><h3>Messages<span className="nav-messages-title-dot" /></h3></div>
      <button type="button" onClick={onClose} className="nav-notifications-close" aria-label="Close messages"><X size={18} /></button>
      {unreadCount > 0 && <span className="nav-messages-unread-count">{unreadCount} unread</span>}
    </header>
    <div className="nav-messages-list-label"><span>Latest messages</span><span>{messages.length ? `${messages.length} shown` : "Your inbox"}</span></div>
    <div className="nav-messages-list">
      {messages.length === 0 ? <div className="nav-messages-empty"><MessageSquare size={26} /><strong>Your next conversation starts here.</strong><p>Open your inbox to message a Topfragg player.</p></div>
        : messages.map(message => {
          const invitation = message.message_type === "tournament_invitation";
          const player = players[message.sender_id];
          const name = player?.name || message.sender_name || "Topfragg player";
          const nameEffect = player?.display_name_color || "";
          const destination = message.action_url || (message.message_type === "direct_message" && message.sender_id
            ? `/messages?conversation=${encodeURIComponent(message.sender_id)}` : "/messages");
          return <Link key={message.id} to={destination} className="nav-message-row" data-unread={!message.is_read} data-invitation={invitation}
            onClick={() => { onRead(message.id); onClose(); }}>
            <MessageAvatar player={player} message={message} invitation={invitation} />
            <div className="nav-message-copy">
              <div className="nav-message-identity"><strong className={nameEffect ? "player-name-color" : undefined} data-name-effect={nameEffect || undefined} style={nameEffect ? { "--player-name-color": nameEffect } : undefined}>{name}</strong>{player?.is_premium && <Crown size={12} className="nav-message-premium" aria-label="Premium player" />}</div>
              {invitation && <span className="nav-message-kind"><Trophy size={10} />Tournament invitation</span>}
              <p>{message.content || message.subject || "Open message"}</p>
            </div>
            <div className="nav-message-meta"><time dateTime={message.created_date || undefined}>{formatTime(message.created_date)}</time>{!message.is_read ? <span className="nav-message-unread-dot" aria-label="Unread" /> : <ChevronRight size={14} />}</div>
          </Link>;
        })}
    </div>
    <footer className="nav-messages-footer"><Link to="/messages" onClick={onClose} className="nav-messages-inbox-link"><span><strong>Open your inbox</strong><small>All conversations in one place</small></span><span className="nav-messages-inbox-arrow"><ArrowRight size={18} /></span></Link></footer>
  </div>;
}
