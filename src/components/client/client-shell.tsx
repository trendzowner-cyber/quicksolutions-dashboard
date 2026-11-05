"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ActivityBell } from "@/components/activity/activity-bell";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { brusselsNow, formatISOLong } from "@/lib/recurring";
import { ClientBottomNav } from "./client-bottom-nav";

// The client's whole frame: a narrow column, a header that tells him what day
// it is, and two buttons at the bottom.
//
// Deliberately absent, and each for a reason: the sidebar (a menu of eleven
// admin sections is the thing he called too difficult), the chat bubble (it
// speaks in admin commands), and the phone/desktop split the operator shell
// does — his layout is the same on every screen, just wider.
//
// `client-ui` on the root switches the theme tokens off to the side of the
// operator palette (see globals.css). Anything that renders in a portal —
// sheets, dialogs — escapes this element and has to carry the class itself.

function greetingFor(hour: number): string {
  if (hour < 12) return "Goeiemorgen";
  if (hour < 18) return "Goeiemiddag";
  return "Goeieavond";
}

export function ClientShell({ children }: { children: React.ReactNode }) {
  // Filled after mount, never during render: the server would compute these in
  // its own timezone and the client in Brussels, and around midnight those
  // disagree — which React reports as a hydration mismatch.
  const [greeting, setGreeting] = useState("");
  const [firstName, setFirstName] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const now = brusselsNow();
    // Acknowledged, not worked around: "what time is it in Brussels" has no
    // render-time equivalent that would survive hydration — the server would
    // answer in its own timezone and midnight is where the two disagree. That
    // is a different case from the derived state this rule is aimed at. The two
    // lines below are the same check; the linter reports the first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingFor(Math.floor(now.minutes / 60)));
    setDateLabel(formatISOLong(now.date));

    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const name = data?.user?.name as string | undefined;
        // "Kerim" reads better than "Kerim Bellalux" in a greeting.
        if (name) setFirstName(name.split(" ")[0]);
      })
      .catch(() => {
        // Greeting without a name is still a greeting.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="client-ui flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto w-full max-w-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-icon.png"
              alt="QuickSolutions"
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
            />
            <span className="text-sm font-semibold">QuickSolutions</span>
            <div className="ml-auto">
              <ActivityBell mode="mobile" />
            </div>
          </div>

          <div className="mt-2">
            <p className="text-xl font-semibold leading-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">{dateLabel || " "}</p>
          </div>
        </div>
      </header>

      {/* pb-36 clears the bottom bar and the floating "+ Nieuwe taak" button
          above it, so the last card on a page is never half under a button. */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-4 pb-36 pt-4">{children}</div>
      </main>

      <PresenceHeartbeat />
      <ClientBottomNav />
    </div>
  );
}
