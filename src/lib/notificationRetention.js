export const NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const notificationCutoff = (now = Date.now()) => new Date(now - NOTIFICATION_RETENTION_MS);
export const isCurrentNotification = (notification, now = Date.now()) => Date.parse(notification.created_date) > now - NOTIFICATION_RETENTION_MS;
