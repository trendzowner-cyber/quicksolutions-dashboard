"use client";

import Image from "next/image";
import { ActivityBell } from "@/components/activity/activity-bell";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { MemberBottomNav } from "./member-bottom-nav";

// The review team's whole frame — the same phone-first shell the client gets,
// but built around the review deck instead of Vandaag. No sidebar (a menu of
// eleven admin sections is not their job), no chat bubble, no desktop/mobile
// split: the same narrow column on every screen, just wider.
//
// `client-ui` on the root switches the theme tokens to the friendlier palette
// (see globals.css) so the team's app feels like the client's app. Anything
// that renders in a portal — sheets, dialogs — escapes this element and has
// to carry the class itself.

export function MemberShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="client-ui flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3">
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
      </header>

      {/* pb-36 clears the bottom bar so the last card is never half under it. */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 pb-36 pt-4">{children}</div>
      </main>

      <PresenceHeartbeat />
      <MemberBottomNav />
    </div>
  );
}
