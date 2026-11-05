import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { buildWorkersBoard, canViewWorkers } from "@/lib/workers";
import { WorkersBoard } from "@/components/workers/workers-board";

export const metadata = { title: "Workers" };
export const dynamic = "force-dynamic";

// Client-facing tracking screen. Rendered on the server so the first paint is
// already correct on a phone, then the client component keeps it fresh.
export default async function WorkersPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  // The client's own Vandaag screen now does this job in his language, and this
  // board speaks the operator's. Two doors to the same room, only one of them
  // his — so he is sent back to the one he was given.
  if (isClientUserId(session.userId)) redirect("/dashboard");
  if (!(await canViewWorkers(session.userId, session.role))) redirect("/dashboard");

  const board = await buildWorkersBoard();
  const canManage = session.role === "owner" || session.role === "admin";

  return <WorkersBoard initial={board} canManage={canManage} />;
}
