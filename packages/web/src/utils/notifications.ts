export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return Promise.resolve("denied" as NotificationPermission);
  return Notification.requestPermission();
}

export function sendNotification(title: string, options?: NotificationOptions): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, {
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    ...options,
  });
}
