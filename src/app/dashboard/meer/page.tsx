import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { MeerPage } from "@/components/client/meer-page";

// "Meer" only exists for the client's own shell. Nobody else has a tab that
// leads here, but the URL is guessable, so it is gated server-side rather than
// relying on the menu being hidden.
export default async function Meer() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!isClientUserId(session.userId)) redirect("/dashboard");

  return <MeerPage />;
}
