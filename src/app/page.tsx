import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  HeartPulse,
  ListChecks,
  Megaphone,
  Eye,
  ShoppingCart,
  Star,
} from "lucide-react";
import { verifySession } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_DESCRIPTION, APP_NAME, CONTACT_EMAIL } from "@/lib/site";
import { PublicShell } from "@/components/public/public-shell";

// The home page.
//
// It used to be a bare redirect — `/dashboard` if you had a session, `/login` if
// you did not — which is a correct thing for an internal tool to do and an
// impossible thing to show a reviewer. Google rejected the OAuth branding with
// "your home page is behind a login page" and "your home page does not explain
// the purpose of your app", and both of those are the same complaint: there was
// no home page, only a door.
//
// So this page is now readable by anyone, signed in or not, and it says what the
// product is, what it does, and — the part that matters most to the review — why
// it asks Google for access at all. A signed-in visitor gets a link straight to
// the dashboard instead of the sign-in button, but nobody is redirected away
// from here, because the reviewer is anonymous and has to land on this.

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    icon: Star,
    title: "Reviews op Google",
    body: "Nieuwe beoordelingen komen binnen zodra ze geplaatst zijn, met de score en het aantal erbij. Antwoorden gebeurt vanuit hetzelfde scherm, zonder naar Google te gaan.",
  },
  {
    icon: ListChecks,
    title: "Taken",
    body: "Werk dat opgevolgd moet worden, toegewezen aan een persoon en met een datum eraan. Een taak kan eenmalig zijn of terugkeren — elke werkdag, elke maand — en de herhaling wordt automatisch opnieuw ingepland.",
  },
  {
    icon: ShoppingCart,
    title: "Bestellingen",
    body: "De bestellingen uit de webshop met hun omzet, zodat zichtbaar is wat er verkocht is zonder in te loggen op de shop.",
  },
  {
    icon: Eye,
    title: "Website",
    body: "Bezoekers, paginaweergaven en de meest bekeken pagina's, gemeten met een eigen teller op quicksolutionspro.be.",
  },
  {
    icon: Megaphone,
    title: "Google Ads",
    body: "Wat er aan advertenties besteed is en wat het opgeleverd heeft: klikken, conversies, kosten per conversie en opbrengst per besteedde euro.",
  },
  {
    icon: HeartPulse,
    title: "Status",
    body: "Een seintje wanneer de website of een van de koppelingen niet meer antwoordt, voordat een bezoeker er iets van merkt.",
  },
];

export default async function Home() {
  // Best-effort. This page has to render for someone with no session, and it
  // has to keep rendering if the database is unreachable — a 500 here is a
  // failed verification, so an unreadable session simply means "signed out".
  let signedIn = false;
  try {
    const token = (await cookies()).get("session")?.value;
    signedIn = token ? await verifySession(token) : false;
  } catch {
    signedIn = false;
  }

  return (
    <PublicShell
      title="Beheerpaneel voor quicksolutionspro.be"
      intro={`${APP_NAME} brengt de online kant van de zaak samen in één scherm: de reviews op Google, het werk dat opgevolgd moet worden, de bestellingen uit de webshop, het bezoek op de site en de resultaten van de advertenties. Het is gebouwd voor de ploeg achter quicksolutionspro.be en voor de medewerkers van het account — niet voor het publiek.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* The button variant's own classes rather than <Button>, because this
            is a link and base-ui's Button has no `asChild` to lend them to one.
            A <button> that navigates on click would lose the middle-click and
            the "open in new tab" that a reviewer may well reach for. */}
        <Link
          href={signedIn ? "/dashboard" : "/login"}
          className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base")}
        >
          {signedIn ? "Naar het dashboard" : "Inloggen"}
        </Link>
        <p className="text-sm text-muted-foreground">
          {signedIn
            ? "Je bent aangemeld."
            : "Een account wordt aangevraagd via QuickSolutions."}
        </p>
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">Wat het doet</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-brand" aria-hidden />
                <h3 className="font-medium">{title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The section the OAuth review is actually looking for. Google asks two
          questions of an app that requests sensitive scopes — which data, and
          why — and answering them in the place a reviewer will be reading is
          cheaper than answering them in a review thread. Written in plain
          language on purpose: it is a description of the integration, not a
          legal notice. */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold">
          Waarom het toegang tot Google vraagt
        </h2>
        <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
          <p>
            Twee onderdelen van dit paneel lezen gegevens uit een Google-account
            dat de eigenaar van de zaak zelf koppelt. Die koppeling is optioneel:
            zonder haar werkt de rest van het paneel, en de twee onderdelen
            hieronder tonen dan een uitnodiging om te koppelen in plaats van
            cijfers.
          </p>
          <dl className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <dt className="font-medium text-foreground">
                Reviews op Google —{" "}
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  business.manage
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed">
                Leest de beoordelingen van het bedrijfsprofiel van
                quicksolutionspro.be en plaatst het antwoord dat de eigenaar
                schrijft. Alleen dat: dit onderdeel leest geen andere
                bedrijfsgegevens en wijzigt niets anders dan het antwoord op een
                beoordeling.
              </dd>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <dt className="font-medium text-foreground">
                Google Ads —{" "}
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  adwords
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed">
                Leest de prestaties van de advertentiecampagnes van het eigen
                account — kosten, klikken, conversies — om ze naast de omzet uit
                de webshop te tonen. Alleen lezen: dit onderdeel maakt geen
                campagnes aan, past er geen aan en zet er geen budget op.
              </dd>
            </div>
          </dl>
          <p>
            De gegevens uit deze twee koppelingen blijven in het paneel. Ze
            worden niet doorverkocht, niet gebruikt om advertenties op te
            richten en niet gedeeld met derden, behalve met de partijen die de
            infrastructuur dragen. Wat er precies bewaard wordt, hoelang, en
            welke rechten je hebt, staat in het{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              privacybeleid
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold">Toegang</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Deze omgeving is niet openbaar. Een account wordt aangemaakt door
          QuickSolutions, voor de eigenaar van de zaak en de medewerkers die er
          werk in opvolgen. Heb je een account nodig of is er iets mis met het
          jouwe, mail dan{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </PublicShell>
  );
}
