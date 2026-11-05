import type { Metadata } from "next";
import Link from "next/link";
import {
  Bullets,
  PublicShell,
  Section,
} from "@/components/public/public-shell";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

// The terms.
//
// Not one of the five things Google listed — a privacy policy is required, a
// terms page is not — but a home page whose only other link is "Privacy" reads
// like a page built for a form, and the review is a judgement about whether the
// app is real. It is also where the two things a privacy policy cannot say
// belong: who may use the panel, and what happens to the data when they stop.

const UPDATED = "15 september 2026";

export const metadata: Metadata = {
  title: "Voorwaarden",
  description: `De voorwaarden voor het gebruik van ${APP_NAME}.`,
  alternates: { canonical: "/voorwaarden" },
};

export default function TermsPage() {
  return (
    <PublicShell
      title="Voorwaarden"
      intro={`Deze voorwaarden gelden voor het gebruik van ${APP_NAME}, het beheerpaneel voor quicksolutionspro.be.`}
    >
      <p className="text-sm text-muted-foreground">
        Laatst bijgewerkt op {UPDATED}.
      </p>

      <Section title="1. Waarvoor dit paneel dient">
        <p>
          {APP_NAME} is een intern beheerpaneel. Het brengt de gegevens van
          quicksolutionspro.be samen — beoordelingen, bestellingen,
          websitebezoek, advertentieresultaten — en laat toe er werk in op te
          volgen. Het is geen openbare dienst en er worden geen diensten aan
          derden via aangeboden.
        </p>
      </Section>

      <Section title="2. Toegang">
        <Bullets
          items={[
            "Een account wordt aangemaakt door QuickSolutions, op verzoek van de eigenaar van het account.",
            "Toegang is persoonlijk. Je gegevens deel je niet met anderen en je laat niemand anders met jouw account aanmelden.",
            "QuickSolutions kan een account opschorten of afsluiten wanneer er misbruik is, of wanneer de samenwerking stopt.",
          ]}
        />
      </Section>

      <Section title="3. Koppelingen met Google en andere diensten">
        <p>
          De koppeling met een Google-account wordt aangebracht door de eigenaar
          van dat account, en alleen die kan ze ook weer intrekken. Door te
          koppelen geeft hij {APP_NAME} de toegang die in het{" "}
          <Link href="/privacy">privacybeleid</Link> beschreven staat — niet
          meer dan dat, en alleen voor de twee onderdelen die er genoemd worden.
        </p>
        <p>
          Hetzelfde geldt voor de koppeling met de webshop: de eigenaar van het
          account geeft de beheerinterface toegang, en kan die ook weer
          intrekken.
        </p>
      </Section>

      <Section title="4. Gebruik">
        <p>Je gebruikt het paneel waarvoor het bedoeld is. Dat houdt in dat je:</p>
        <Bullets
          items={[
            "geen gegevens uit het paneel kopieert of verspreidt zonder dat daar een reden voor is;",
            "geen antwoorden op beoordelingen plaatst die onwaar zijn of die iemand beledigen;",
            "de toegang die je gekregen hebt niet gebruikt om andere systemen van QuickSolutions of van derden te bereiken;",
            "niets doet om de werking van het paneel te verstoren.",
          ]}
        />
      </Section>

      <Section title="5. Beschikbaarheid">
        <p>
          Het paneel wordt geleverd zoals het is. QuickSolutions streeft ernaar
          het beschikbaar te houden en onderhoudt het, maar belooft geen
          ononderbroken werking: koppelingen met diensten van derden — Google,
          de webshop, de host — kunnen uitvallen zonder dat dat aan het paneel
          ligt.
        </p>
      </Section>

      <Section title="6. Aansprakelijkheid">
        <p>
          De cijfers in het paneel zijn een weergave van wat de onderliggende
          diensten teruggeven. Ze zijn bedoeld om op te volgen, niet om
          boekhoudkundige of juridische beslissingen op te baseren; de
          officiële cijfers staan bij de dienst waar ze vandaan komen.
          QuickSolutions is niet aansprakelijk voor schade die voortkomt uit
          beslissingen die op de weergave in het paneel genomen worden, of uit
          een onderbreking van een koppeling.
        </p>
      </Section>

      <Section title="7. Intellectuele eigendom">
        <p>
          Het paneel en de onderliggende programmatuur blijven eigendom van
          QuickSolutions. De gegevens van het account — beoordelingen,
          bestellingen, campagnes — blijven eigendom van de eigenaar van het
          account.
        </p>
      </Section>

      <Section title="8. Einde van het gebruik">
        <p>
          Stopt de samenwerking, dan wordt het account afgesloten en worden de
          gegevens verwijderd zoals beschreven in het{" "}
          <Link href="/privacy">privacybeleid</Link>. De koppelingen met Google
          en met de webshop worden daarbij verbroken. Wat wettelijk bewaard moet
          blijven, wordt bewaard.
        </p>
      </Section>

      <Section title="9. Wijzigingen">
        <p>
          Deze voorwaarden kunnen aangepast worden wanneer het paneel verandert.
          De datum bovenaan geeft de laatste wijziging aan.
        </p>
      </Section>

      <Section title="10. Toepasselijk recht">
        <p>
          Op deze voorwaarden is het Belgische recht van toepassing. Geschillen
          horen thuis bij de bevoegde rechter in België, onverminderd wat de
          wet verplicht stelt.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </Section>
    </PublicShell>
  );
}
