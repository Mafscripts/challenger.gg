import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, LockKeyhole, MessageSquare, RefreshCw, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

export const appealStatus = (status) => ({ awaiting_ceo: "Waiting for CEO review", awaiting_user: "CEO replied", closed: "Conversation closed" }[status] || "No appeal sent yet");
export const appealDate = (value) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

export default function BanAppealConversation({ appealId, ceo = false, onRestriction, onUpdated, scope = "self" }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const pending = useRef(null);
  const scrollArea = useRef(null);
  const followLatest = useRef(true);
  const query = useInfiniteQuery({
    queryKey: ["ban-appeal-conversation", scope, ceo ? appealId : "self"],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const result = ceo ? await base44.banAppeals.detail(appealId, pageParam) : await base44.banAppeals.me(pageParam);
      if (!ceo) onRestriction?.(result.restriction);
      return result;
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
    refetchInterval: 15000,
    retry: false,
  });
  const messages = useMemo(() => {
    const rows = (query.data?.pages || []).flatMap((page) => page.messages);
    return [...new Map(rows.map((row) => [row.id, row])).values()]
      .sort((a, b) => a.created_date.localeCompare(b.created_date) || a.id.localeCompare(b.id));
  }, [query.data]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (followLatest.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [lastMessageId]);
  const first = query.data?.pages[0];
  const canSend = Boolean(first && (ceo || first.restriction));
  const sessionExpired = query.error?.status === 401;

  const submit = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !canSend) return;
    if (pending.current?.content !== content) pending.current = { content, request_id: crypto.randomUUID() };
    setSending(true);
    setSendError("");
    try {
      if (ceo) await base44.banAppeals.reply(appealId, pending.current);
      else await base44.banAppeals.send(pending.current);
      pending.current = null;
      setDraft("");
      await query.refetch();
      onUpdated?.();
    } catch (error) { setSendError(error.message || "Could not send your message. Please try again."); }
    finally { setSending(false); }
  };

  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div><h2 className="flex items-center gap-2 text-sm font-black"><MessageSquare className="h-4 w-4 text-cyan" />{ceo ? "Private appeal conversation" : "Contact the CEO team"}</h2>
        <p className="mt-1 text-xs text-vapor">{appealStatus(first?.appeal?.status)}</p></div>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-green/20 bg-green/5 px-2 py-1 text-[10px] font-bold text-green"><LockKeyhole className="h-3 w-3" />Only you and CEOs</span>
    </header>
    <div ref={scrollArea} onScroll={(event) => { const area = event.currentTarget; followLatest.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80; }} className="max-h-[44vh] min-h-[180px] overflow-y-auto p-5" aria-label="Appeal messages" aria-busy={query.isPending}>
      {query.hasNextPage && <button type="button" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} className="mb-4 w-full rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-cyan disabled:opacity-40">{query.isFetchingNextPage ? "Loading…" : "Load 25 earlier messages"}</button>}
      {query.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-vapor"><Loader2 className="h-4 w-4 animate-spin" />Loading conversation…</p>
        : messages.length === 0 && !query.error ? <div className="py-6 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-vapor/50" /><p className="text-sm font-bold">Your message goes directly to the CEO team.</p><p className="mt-2 text-xs leading-5 text-vapor">Explain what happened and why you would like your ban reviewed.</p></div> : null}
      <div className="space-y-4">{messages.map((message) => <article key={message.id} className={`rounded-xl border p-4 ${message.sender_role === "ceo" ? "border-green/25 bg-green/[0.04]" : "border-white/10 bg-background/40"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><strong className={message.sender_role === "ceo" ? "text-green" : "text-white"}>{message.sender_role === "ceo" ? "CEO team" : message.sender_name}</strong><time className="text-vapor" dateTime={message.created_date}>{appealDate(message.created_date)}</time></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{message.content}</p>
      </article>)}</div>
      {query.error && <div role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{sessionExpired ? "Your session has expired. Sign in again to read or send appeal messages." : query.error.message}<button type="button" onClick={() => query.refetch()} className="ml-2 inline-flex items-center gap-1 font-bold underline"><RefreshCw className="h-3 w-3" />Retry</button></div>}
    </div>
    <form onSubmit={submit} className="border-t border-white/10 bg-background/20 p-4">
      <label htmlFor={`appeal-message-${scope}`} className="mb-2 block text-[10px] font-black uppercase tracking-wider text-vapor">{ceo ? "Reply as CEO team" : "Your message"}</label>
      <textarea id={`appeal-message-${scope}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} disabled={!canSend || sessionExpired || sending} required placeholder={ceo ? "Write a response to this player…" : "Explain your appeal to the CEO team…"} className="w-full resize-y rounded-xl border border-white/10 bg-background/70 px-4 py-3 text-sm outline-none focus:border-cyan/50 focus:ring-2 focus:ring-cyan/10 disabled:opacity-40" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-vapor">{draft.length}/2,000 · {ceo ? "Replies are visible to this player." : "Only CEOs can review and reply."}</p>
        <button type="submit" disabled={!canSend || sessionExpired || !draft.trim() || sending} className="inline-flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-5 py-2.5 text-xs font-black text-cyan transition-colors hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Sending…" : ceo ? "Send reply" : "Send to CEO team"}</button></div>
      {sendError && <p role="alert" className="mt-3 text-xs text-red-300">{sendError}</p>}
    </form>
  </section>;
}
