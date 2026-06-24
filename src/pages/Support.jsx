import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Crown, HelpCircle, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const categories = [
  { value: "support", label: "General Support" },
  { value: "account", label: "Account" },
  { value: "payment", label: "Payment" },
  { value: "ranked", label: "Ranked" },
  { value: "tournament", label: "Tournament" },
  { value: "marketplace", label: "Marketplace" },
  { value: "bug", label: "Bug Report" },
  { value: "other", label: "Other" },
];

export default function Support() {
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [messages, setMessages] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({
    subject: "",
    category: "support",
    description: "",
  });

  useEffect(() => {
    loadSupportData();
  }, []);

  const loadSupportData = async () => {
    const currentUser = await base44.auth.me().catch(() => null);
    setUser(currentUser);
    if (!currentUser) return;

    const [ticketRows, messageRows] = await Promise.all([
      base44.entities.Ticket.filter({}, "-created_date", 500).catch(() => []),
      base44.entities.Message.filter({}, "-created_date", 500).catch(() => []),
    ]);
    setTickets(ticketRows.filter((ticket) => (
      ticket.user_id === currentUser.id || (ticket.participant_user_ids || []).includes(currentUser.id)
    )));
    setMessages(messageRows);
  };

  const ticketMessages = (ticket) => {
    const rows = [
      ...(ticket.messages || []),
      ...messages.filter((message) => message.ticket_id === ticket.id || message.conversation_id === ticket.id),
    ];
    const seen = new Set();
    return rows
      .filter((message) => {
        const key = message.id || `${message.created_date}:${message.sender_id}:${message.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return !message.internal;
      })
      .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  };

  const statusText = (status) => String(status || "open").replace(/_/g, " ");

  const handleReply = async (ticket) => {
    const message = (replyDrafts[ticket.id] || "").trim();
    if (!message) {
      toast({ title: "Reply required", description: "Add a message before sending.", variant: "destructive" });
      return;
    }

    setBusyId(`reply:${ticket.id}`);
    try {
      const response = await base44.functions.invoke("replyTicket", {
        ticket_id: ticket.id,
        message,
      });
      if (response.data?.success) {
        setReplyDrafts((current) => ({ ...current, [ticket.id]: "" }));
        toast({ title: "Reply sent" });
        await loadSupportData();
      } else {
        toast({ title: "Reply failed", description: response.data?.error || "Could not send reply.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Reply failed", description: error.message || "Could not send reply.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEscalate = async (ticket) => {
    const proofText = typeof window !== "undefined" ? window.prompt("Extra proof URLs (comma or line separated):", "") : "";
    if (proofText === null) return;
    const proofUrls = proofText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);

    setBusyId(`escalate:${ticket.id}`);
    try {
      const response = await base44.functions.invoke("escalateTicket", {
        ticket_id: ticket.id,
        reason: "Premium escalation requested from support page",
        proof_urls: proofUrls,
      });
      if (response.data?.success) {
        toast({ title: "Ticket escalated" });
        await loadSupportData();
      } else {
        toast({ title: "Escalation failed", description: response.data?.error || "Could not escalate ticket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Escalation failed", description: error.message || "Could not escalate ticket.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const description = form.description.trim();
    if (!subject || !description) {
      toast({ title: "Missing details", description: "Please add a subject and description.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("createTicket", {
        subject,
        description,
        category: form.category,
        priority: "medium",
      });

      if (response.data?.success) {
        toast({ title: "Support ticket opened", description: "Staff will review your request." });
        setForm({ subject: "", category: "support", description: "" });
        await loadSupportData();
      } else {
        toast({ title: "Ticket failed", description: response.data?.error || "Could not open ticket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Ticket failed", description: error.message || "Could not open ticket.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 mb-6">
            <HelpCircle className="w-4 h-4 text-cyan" />
            <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Contact Support</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-4">Support Center</h1>
          <p className="text-vapor max-w-xl mx-auto">
            Open a ticket for account, payment, match, tournament, marketplace, or technical issues.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <motion.form
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="lg:col-span-2 glass rounded-xl border border-white/5 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="font-bold text-sm">New Support Ticket</h2>
              <p className="text-xs text-vapor mt-1">{user?.email || "Authenticated account"}</p>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Subject</span>
                <input
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  maxLength={120}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  placeholder="Briefly describe the issue"
                />
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Category</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={8}
                  maxLength={3000}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none resize-none"
                  placeholder="Include match IDs, usernames, payment details, screenshots links, or anything staff should know."
                />
              </label>
            </div>
            <div className="px-6 py-4 border-t border-white/5 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-3 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>
          </motion.form>

          <div className="glass rounded-xl border border-cyan/10 p-6 h-fit">
            <ShieldCheck className="w-8 h-8 text-cyan mb-4" />
            <h2 className="font-bold text-lg mb-2">What Helps Staff</h2>
            <p className="text-sm text-vapor leading-relaxed">
              Add the match, wager, tournament, transaction, or player details connected to the problem. Support tickets appear in the admin ticket queue.
            </p>
          </div>

          <div className="lg:col-span-3 glass rounded-xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between gap-3">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan" /> My Tickets
              </h2>
              <button onClick={loadSupportData} className="text-xs text-cyan hover:underline">Refresh</button>
            </div>
            {tickets.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-vapor">No tickets yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {tickets.map((ticket) => {
                  const rows = ticketMessages(ticket);
                  const closed = ["resolved", "closed"].includes(ticket.status);
                  return (
                    <div key={ticket.id} className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-sm">{ticket.subject}</p>
                          <p className="text-xs text-vapor capitalize">
                            {statusText(ticket.status)} - {ticket.assigned_admin_name || "Unassigned"}
                          </p>
                        </div>
                        {user?.is_premium && !ticket.premium_escalated && !closed && (
                          <button
                            onClick={() => handleEscalate(ticket)}
                            disabled={busyId === `escalate:${ticket.id}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-400/10 text-yellow-400 text-xs font-bold rounded hover:bg-yellow-400/20 disabled:opacity-50"
                          >
                            <Crown className="w-3.5 h-3.5" /> {busyId === `escalate:${ticket.id}` ? "Escalating..." : "Escalate"}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2 mb-3">
                        {rows.length === 0 ? (
                          <p className="text-xs text-vapor">No replies yet.</p>
                        ) : rows.map((message) => (
                          <div key={message.id || `${message.created_date}:${message.content}`} className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                            <p className="text-[10px] text-vapor">{message.sender_name || "Unknown"}</p>
                            <p className="text-sm whitespace-pre-line">{message.content}</p>
                          </div>
                        ))}
                      </div>
                      {!closed && (
                        <div className="flex flex-col md:flex-row gap-2">
                          <input
                            value={replyDrafts[ticket.id] || ""}
                            onChange={(event) => setReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                            placeholder="Reply to staff"
                            className="flex-1 px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                          />
                          <button
                            onClick={() => handleReply(ticket)}
                            disabled={busyId === `reply:${ticket.id}`}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan text-background text-xs font-bold rounded-lg disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" /> {busyId === `reply:${ticket.id}` ? "Sending..." : "Reply"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
