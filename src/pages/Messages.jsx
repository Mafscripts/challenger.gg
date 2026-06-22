import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Send, Trash2, Reply, User } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadMessages();
  }, []);

  const loadMessages = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;

      const data = await base44.entities.Message.filter(
        { recipient_id: user.id },
        '-created_date',
        50
      );
      setMessages(data || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await base44.entities.Message.update(id, { is_read: true });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = messages.filter(m => !m.is_read);
      await Promise.all(unread.map(m => base44.entities.Message.update(m.id, { is_read: true })));
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      toast({ title: "All marked as read", description: `${unread.length} messages marked as read` });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteMessage = async (id) => {
    try {
      await base44.entities.Message.delete(id);
      setMessages(prev => prev.filter(m => m.id !== id));
      toast({ title: "Deleted", description: "Message deleted" });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const filteredMessages = filter === "all" 
    ? messages 
    : filter === "unread" 
      ? messages.filter(m => !m.is_read)
      : messages.filter(m => m.is_read);

  const unreadCount = messages.filter(m => !m.is_read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Mail className="w-8 h-8 text-cyan" />
              Messages
            </h1>
            <p className="text-vapor text-sm mt-1">
              {unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Inbox zero!'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Mail className="w-4 h-4" /> Mark All Read
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { value: "all", label: "All", count: messages.length },
            { value: "unread", label: "Unread", count: unreadCount },
            { value: "read", label: "Read", count: messages.length - unreadCount }
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                filter === tab.value 
                  ? "bg-cyan/10 text-cyan border border-cyan/20" 
                  : "text-vapor hover:text-foreground border border-transparent"
              }`}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </div>

        {/* Messages List */}
        <div className="space-y-3">
          {filteredMessages.length === 0 ? (
            <div className="glass rounded-xl border border-white/5 p-12 text-center">
              <Mail className="w-16 h-16 text-vapor/30 mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">No messages</h3>
              <p className="text-vapor text-sm">
                {filter === "unread" ? "You have no unread messages" : "Your inbox is empty"}
              </p>
            </div>
          ) : (
            filteredMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-xl border p-5 transition-all cursor-pointer ${
                  !message.is_read 
                    ? "border-cyan/20 bg-cyan/5" 
                    : "border-white/5 hover:border-white/10"
                }`}
                onClick={() => markAsRead(message.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan/30 to-orange/30 border border-white/10 flex items-center justify-center text-sm font-bold shrink-0">
                    {(message.sender_name || "Unknown sender").charAt(0)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold text-sm ${!message.is_read ? 'text-cyan' : 'text-foreground'}`}>
                            {message.sender_name || "Unknown sender"}
                          </h3>
                          {!message.is_read && (
                            <span className="w-2 h-2 bg-cyan rounded-full" />
                          )}
                        </div>
                        <p className="text-xs text-vapor mb-1">
                          {message.subject || 'No subject'}
                        </p>
                        <p className={`text-sm truncate ${!message.is_read ? 'text-foreground/80' : 'text-vapor'}`}>
                          {message.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMessage(message.id); }}
                          className="p-1.5 hover:bg-red-500/10 text-vapor hover:text-red-400 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-vapor/50 mt-2 font-mono">
                      {new Date(message.created_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
