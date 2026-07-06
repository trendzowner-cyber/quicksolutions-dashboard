import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const authenticated = token ? await verifySession(token) : false;

  if (authenticated) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
