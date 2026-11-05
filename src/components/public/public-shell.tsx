import Image from "next/image";
import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL, SITE_URL } from "@/lib/site";

// Shared chrome for the pages that are readable without a session.
//
// They exist for one reason: Google will not approve the OAuth consent screen
// until the home page and the privacy policy can be read by someone who is not
// logged in, at URLs on a domain we can prove we own. So these are plain server
// components — no session read, no fetch, no `client-ui` — and they name the
// product in the same words the consent screen does, which is the other thing
// the review checks.
//
// They deliberately do not look like the dashboard. Nothing here is a control,
// so nothing here should look like one.

export function PublicShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-5 py-4">
          <Image
            src="/logo-icon.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <Link href="/" className="text-base font-semibold">
            {APP_NAME}
          </Link>
          <Link
            href="/login"
            className="ml-auto text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Inloggen
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-5 py-12">
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            {title}
          </h1>
          {intro && (
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {intro}
            </p>
          )}
          <div className="mt-10">{children}</div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>
            {APP_NAME} — een dienst van{" "}
            <a
              href={SITE_URL}
              className="underline underline-offset-4 hover:text-foreground"
            >
              quicksolutionspro.be
            </a>
          </p>
          <nav className="flex gap-5 sm:ml-auto">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/voorwaarden" className="hover:text-foreground">
              Voorwaarden
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-foreground"
            >
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A titled block of prose. Used by the policy pages, which are all prose. */
export function Section({
  title,
  id,
  level = 2,
  children,
}: {
  title: string;
  id?: string;
  /**
   * The English policy sits below the Dutch one on the same page, so its
   * sections have to be one level down from the Dutch ones rather than beside
   * them — two h2 runs on one page is a structure that reads as two documents
   * with no relation to each other.
   */
  level?: 2 | 3;
  children: React.ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id={id} className="mt-10 first:mt-0 scroll-mt-8">
      <Heading className="text-xl font-semibold">{title}</Heading>
      <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground [&_li]:leading-relaxed [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
