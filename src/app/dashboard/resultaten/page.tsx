import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { ResultatenPage } from "@/components/client/resultaten-page";

// Resultaten is the client's own view of the same numbers the operator already
// sees, in more detail, on /dashboard/analytics and /dashboard/marketing. It is
// gated server-side rather than hidden from the menu, the same as Meer: the URL
// is guessable and the page is meaningless to anyone but him.
export default async function Resultaten() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!isClientUserId(session.userId)) redirect("/dashboard");

  return <ResultatenPage />;
}
