// Service worker for web push notifications.
//
// Deliberately no fetch handler: nothing is cached, so there are no stale-page
// or session-cookie problems. The only job is turning a push message into a
// notification and opening the dashboard when one is tapped.
//
// iOS (16.4+) shows push notifications only for the home-screen-installed PWA;
// a Safari tab never receives them. event.waitUntil + showNotification is the
// mandatory pattern there.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    // Empty or non-JSON payload (e.g. a probe) — fall through to defaults.
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "QuickSolutions", {
      body: data.body ?? "",
      tag: data.tag ?? "qs-notification",
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // Reuse an open dashboard tab if there is one, otherwise open a new one.
        for (const client of list) {
          if ("focus" in client) {
            try {
              client.navigate(url);
            } catch {
              // Older browsers without navigate() — focus is enough.
            }
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
