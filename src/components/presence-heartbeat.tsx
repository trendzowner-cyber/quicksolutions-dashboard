"use client";

import { useEffect } from "react";

// Tells the server this user has the dashboard open.
//
// Mounted once in the dashboard layout, so it covers every page. It pings on
// mount and then every 60 s — but only while the tab is actually visible, so a
// forgotten background tab does not keep a green "online" dot alive all night.
// Nothing renders.
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const ping = () => {
      if (cancelled || document.hidden) return;
      void fetch("/api/presence", { method: "POST", cache: "no-store" }).catch(() => {
        // Offline or a cold start — the next tick retries.
      });
    };

    ping();
    const timer = setInterval(ping, 60_000);
    const onVisible = () => ping();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
