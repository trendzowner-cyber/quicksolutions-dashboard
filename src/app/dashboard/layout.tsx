import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ChatBubble } from "@/components/chat/chat-bubble";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const authenticated = token ? await verifySession(token) : false;

  if (!authenticated) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col">
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
        <ChatBubble />
      </div>
    </div>
  );
}
