import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, CheckCheck, Trash2, AlertCircle, Info, Trophy, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [removingAll, setRemovingAll] = useState(false);

  const syncNotificationBell = (detail) => {
    window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail }));
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;

      const data = await base44.entities.Notification.filterFresh(
        { user_id: user.id },
        '-created_date',
        50
      );
      setNotifications(data || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      toast({ title: "Error", description: "Failed to load notifications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await base44.entities.Notification.update(id, { is_read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      const wasUnread = notifications.some(n => n.id === id && !n.is_read);
      syncNotificationBell({ unreadCount: Math.max(0, unreadCount - (wasUnread ? 1 : 0)), readId: id });
      toast({ title: "Marked as read", description: "Notification marked as read" });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true })));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      syncNotificationBell({ unreadCount: 0, markAllRead: true });
      toast({ title: "All marked as read", description: `${unread.length} notifications marked as read` });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await base44.entities.Notification.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      const removedWasUnread = notifications.some(n => n.id === id && !n.is_read);
      syncNotificationBell({
        unreadCount: Math.max(0, unreadCount - (removedWasUnread ? 1 : 0)),
        removedId: id,
      });
      toast({ title: "Deleted", description: "Notification deleted" });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const deleteAllNotifications = async () => {
    if (notifications.length === 0 || removingAll) return;
    if (!window.confirm(`Remove all ${notifications.length} notifications? This cannot be undone.`)) return;

    setRemovingAll(true);
    try {
      await Promise.all(notifications.map(notification => base44.entities.Notification.delete(notification.id)));
      setNotifications([]);
      setFilter("all");
      syncNotificationBell({ unreadCount: 0, clearAll: true });
      toast({ title: "Notifications removed", description: "All notifications have been deleted" });
    } catch (error) {
      console.error('Failed to remove all notifications:', error);
      toast({ title: "Error", description: "Not all notifications could be removed", variant: "destructive" });
      await loadNotifications();
    } finally {
      setRemovingAll(false);
    }
  };

  const filteredNotifications = filter === "all" 
    ? notifications 
    : filter === "unread" 
      ? notifications.filter(n => !n.is_read)
      : notifications.filter(n => n.is_read);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading notifications...</p>
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
              <Bell className="w-8 h-8 text-cyan" />
              Notifications
            </h1>
            <p className="text-vapor text-sm mt-1">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <CheckCheck className="w-4 h-4" /> Mark All Read
            </button>
            <button
              onClick={deleteAllNotifications}
              disabled={notifications.length === 0 || removingAll}
              className="px-4 py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> {removingAll ? "Removing..." : "Remove All"}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { value: "all", label: "All", count: notifications.length },
            { value: "unread", label: "Unread", count: unreadCount },
            { value: "read", label: "Read", count: notifications.length - unreadCount }
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

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="glass rounded-xl border border-white/5 p-12 text-center">
              <Bell className="w-16 h-16 text-vapor/30 mx-auto mb-4" />
              <h3 className="text-lg font-bold mb-2">No notifications</h3>
              <p className="text-vapor text-sm">
                {filter === "unread" ? "You have no unread notifications" : "You don't have any notifications yet"}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-xl border p-5 transition-all cursor-pointer ${
                  !notification.is_read 
                    ? "border-cyan/20 bg-cyan/5" 
                    : "border-white/5 hover:border-white/10"
                }`}
                onClick={() => markAsRead(notification.id)}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                    notification.type === 'system' ? 'bg-cyan/10' :
                    notification.type === 'match' ? 'bg-orange/10' :
                    notification.type === 'tournament' ? 'bg-purple/10' :
                    notification.type === 'challenge' ? 'bg-red-500/10' :
                    notification.type === 'trade' ? 'bg-green/10' :
                    'bg-secondary'
                  }`}>
                    {notification.type === 'system' ? <Info className="w-6 h-6 text-cyan" /> :
                     notification.type === 'match' ? <Trophy className="w-6 h-6 text-orange" /> :
                     notification.type === 'tournament' ? <Star className="w-6 h-6 text-purple-400" /> :
                     notification.type === 'challenge' ? <AlertCircle className="w-6 h-6 text-red-400" /> :
                     <Bell className="w-6 h-6 text-vapor" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className={`font-bold text-sm mb-1 ${!notification.is_read ? 'text-foreground' : 'text-vapor'}`}>
                          {notification.title}
                        </h3>
                        <p className={`text-sm ${!notification.is_read ? 'text-foreground/80' : 'text-vapor'}`}>
                          {notification.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-cyan rounded-full" />
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                          className="p-1.5 hover:bg-red-500/10 text-vapor hover:text-red-400 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-vapor/50 mt-2 font-mono">
                      {new Date(notification.created_date).toLocaleString()}
                    </p>
                    {notification.action_url && (
                      <Link
                        to={notification.title === "Wager refunded" ? "/wallet" : notification.action_url}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex mt-3 text-xs text-cyan hover:underline font-semibold"
                      >
                        Open
                      </Link>
                    )}
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
