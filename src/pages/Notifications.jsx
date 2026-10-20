import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, CheckCheck, Trash2, AlertCircle, Info, Trophy, Star, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import AccountPageHero from "@/components/ui/AccountPageHero";
import PageLoader from "@/components/ui/PageLoader";
import { isCurrentNotification } from "@/lib/notificationRetention";
import { applyNotificationChange } from "@/lib/notificationInbox";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [removingAll, setRemovingAll] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestId = useRef(0);
  const pendingReads = useRef(new Set());

  const syncNotificationBell = (detail) => {
    window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail }));
  };

  const acknowledgeDisputeNotification = async (notification) => {
    if (notification?.type !== "dispute" || !notification.related_entity_id) return;
    await base44.functions.invoke("acknowledgeDispute", {
      dispute_id: notification.related_entity_id,
    }).catch((error) => {
      console.error("Failed to acknowledge dispute popup:", error);
    });
  };

  useEffect(() => {
    loadNotifications();
    const refresh = () => { if (document.visibilityState !== "hidden") loadNotifications(); };
    const onChange = (event) => {
      requestId.current += 1;
      setLoading(false);
      setNotifications((rows) => applyNotificationChange(rows, event.detail));
      if (event.detail?.refresh) refresh();
    };
    const timer = window.setInterval(() => {
      setNotifications((current) => current.filter((notification) => isCurrentNotification(notification)));
      refresh();
    }, 30000);
    window.addEventListener("topfragg:notifications-updated", onChange);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requestId.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("topfragg:notifications-updated", onChange);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const loadNotifications = async () => {
    const currentRequest = ++requestId.current;
    try {
      const user = await base44.auth.me();
      if (!user) return;

      const data = await base44.entities.Notification.filterFresh(
        { user_id: user.id },
        '-created_date',
        50
      );
      if (currentRequest !== requestId.current) return;
      setNotifications((data || []).filter((notification) => isCurrentNotification(notification)));
      setLoadError(false);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      console.error('Failed to load notifications:', error);
      setLoadError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    const notification = notifications.find(n => n.id === id);
    if (!notification || pendingReads.current.has(id) || (notification.is_read && notification.type !== "dispute")) return;
    pendingReads.current.add(id);
    try {
      if (!notification.is_read) await base44.entities.Notification.update(id, { is_read: true });
      await acknowledgeDisputeNotification(notification);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      const wasUnread = notifications.some(n => n.id === id && !n.is_read);
      syncNotificationBell({
        unreadCount: Math.max(0, unreadCount - (wasUnread ? 1 : 0)),
        readId: id,
        disputeId: notification?.type === "dispute" ? notification.related_entity_id : undefined,
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
      toast({ title: "Error", description: "Could not mark notification as read. Please try again.", variant: "destructive" });
    } finally {
      pendingReads.current.delete(id);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true })));
      await Promise.all(unread.map(acknowledgeDisputeNotification));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      syncNotificationBell({ unreadCount: 0, markAllRead: true });
      toast({ title: "All marked as read", description: `${unread.length} notifications marked as read` });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (id) => {
    try {
      const notification = notifications.find(n => n.id === id);
      await base44.entities.Notification.delete(id);
      await acknowledgeDisputeNotification(notification);
      setNotifications(prev => prev.filter(n => n.id !== id));
      const removedWasUnread = notifications.some(n => n.id === id && !n.is_read);
      syncNotificationBell({
        unreadCount: Math.max(0, unreadCount - (removedWasUnread ? 1 : 0)),
        removedId: id,
        disputeId: notification?.type === "dispute" ? notification.related_entity_id : undefined,
      });
      toast({ title: "Deleted", description: "Notification deleted" });
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const deleteAllNotifications = async () => {
    if (notifications.length === 0 || removingAll) return;
    if (!window.confirm("Remove all notifications? This cannot be undone.")) return;

    setRemovingAll(true);
    try {
      const user = await base44.auth.me();
      let batchesRemoved = 0;

      while (batchesRemoved < 20) {
        const rows = await base44.entities.Notification.filterFresh(
          { user_id: user.id },
          "-created_date",
          500
        );
        if (!rows?.length) break;

        const disputeNotifications = rows.filter((notification) => notification.type === "dispute");
        await Promise.all(disputeNotifications.map(acknowledgeDisputeNotification));

        for (let index = 0; index < rows.length; index += 25) {
          const batch = rows.slice(index, index + 25);
          await Promise.all(batch.map(notification => base44.entities.Notification.delete(notification.id)));
        }
        batchesRemoved += 1;
      }

      const remaining = await base44.entities.Notification.filterFresh(
        { user_id: user.id },
        "-created_date",
        1
      );
      if (remaining?.length) throw new Error("Notification cleanup did not finish");

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
    return <PageLoader label="Loading notifications" />;
  }

  return (
    <div className="account-page notifications-page competition-surface page-shell" data-competition="notifications">
      <div className="page-container">
        <AccountPageHero
          mode="notifications"
          count={notifications.length} countLabel="notifications" metadata={`${unreadCount} unread`}
          description={`${unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.` : "All caught up."} Notifications are automatically deleted after 24 hours.`}
          action={<div className="flex flex-wrap items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="competition-action-pill account-primary-action"
            >
              <CheckCheck className="w-4 h-4" /> Mark All Read
            </button>
            <button
              onClick={deleteAllNotifications}
              disabled={notifications.length === 0 || removingAll}
              className="competition-action-pill account-danger-action"
            >
              <Trash2 className="w-4 h-4" /> {removingAll ? "Removing..." : "Remove All"}
            </button>
          </div>}
        />

        {/* Filter Tabs */}
        <div className="account-section-tabs arena-tabs mb-6 flex items-center" role="group" aria-label="Notification status">
          {[
            { value: "all", label: "All", count: notifications.length },
            { value: "unread", label: "Unread", count: unreadCount },
            { value: "read", label: "Read", count: notifications.length - unreadCount }
          ].map(tab => (
            <button
              key={tab.value}
              aria-pressed={filter === tab.value} onClick={() => setFilter(tab.value)}
              className={`arena-tab px-4 py-2 text-xs font-semibold transition-colors ${
                filter === tab.value 
                  ? "text-cyan" 
                  : "text-vapor"
              }`}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        {loadError && <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm"><span>Could not load notifications.</span><button type="button" onClick={loadNotifications} className="font-bold text-cyan">Try again</button></div>}
        <div className="notifications-list space-y-3">
          {filteredNotifications.length === 0 && !loadError ? (
            <div className="account-panel notifications-empty p-8 sm:p-12 text-center">
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
                data-unread={!notification.is_read}
                className={`account-panel notification-card p-5 transition-all cursor-pointer ${
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
                    notification.type === 'admin_request' ? 'bg-red-500/10' :
                    notification.type === 'dispute' ? 'bg-orange/10' :
                    notification.type === 'match' ? 'bg-orange/10' :
                    notification.type === 'tournament' ? 'bg-purple/10' :
                    notification.type === 'challenge' ? 'bg-red-500/10' :
                    notification.type === 'trade' ? 'bg-green/10' :
                    'bg-secondary'
                  }`}>
                    {notification.type === 'system' ? <Info className="w-6 h-6 text-cyan" /> :
                     notification.type === 'admin_request' ? <ShieldCheck className="w-6 h-6 text-red-400" /> :
                     notification.type === 'dispute' ? <AlertCircle className="w-6 h-6 text-orange" /> :
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
                          type="button" aria-label={`Delete notification: ${notification.title}`}
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
                        onClick={(event) => { event.stopPropagation(); markAsRead(notification.id); }}
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
