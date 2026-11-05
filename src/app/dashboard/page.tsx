import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isClientUserId } from "@/lib/client-mode";
import { ClientToday } from "@/components/client/client-today";
import { DashboardHome } from "@/components/dashboard/dashboard-home";

// Two dashboards behind one URL, decided on the server before anything is sent
// to the browser.
//
// The client (Azedine) gets the phone-first Vandaag screen; the review team
// (viewers) land straight on their review deck — that IS their homepage;
// everyone else gets the operator dashboard exactly as it was. Branching here
// rather than inside a component means neither interface is shipped to the
// account that will never use it, and the operator's dashboard is not one `if`
// away from changing by accident.
export default async function Dashboard() {
  const session = await getSessionUser();
  if (isClientUserId(session?.userId)) return <ClientToday />;
  if (session?.role === "viewer") redirect("/dashboard/reviews");

  return <DashboardHome />;
}
