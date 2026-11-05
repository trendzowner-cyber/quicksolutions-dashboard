import { redirect } from "next/navigation";
import { getSessionUser, getUserById } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { ActivityBell } from "@/components/activity/activity-bell";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { ClientShell } from "@/components/client/client-shell";
import { MemberShell } from "@/components/member/member-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  // Sessions now last months for everyone (see createSession), so every
  // account is re-checked on each load — otherwise disabling a user would not
  // take effect until their cookie happened to expire.
  const account = await getUserById(session.userId);
  if (!account || account.status !== "active") redirect("/login");

  // The client gets his own shell: no sidebar, no chat bubble, a bottom bar
  // with two things in it. Everyone else keeps the dashboard they already know,
  // byte for byte. See lib/client-mode.ts for why this is a user id and not
  // `role === "viewer"`.
  if (isClientUserId(session.userId)) {
    return <ClientShell>{children}</ClientShell>;
  }

  // The review team (Steven, Rob, Nacer, …) are casual phone users too — same
  // app-style frame as the client, but built around the review deck. The
  // client id branch above runs first; owner/admin/etc. keep the operator
  // shell below.
  if (session.role === "viewer") {
    return <MemberShell>{children}</MemberShell>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Marks this user as online for the Workers view. */}
      <PresenceHeartbeat />

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col">
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        {/* Desktop top bar — notification bell */}
        <header className="hidden lg:flex h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-4 md:px-6">
          <ActivityBell mode="desktop" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
        <ChatBubble />
      </div>
    </div>
  );
}
