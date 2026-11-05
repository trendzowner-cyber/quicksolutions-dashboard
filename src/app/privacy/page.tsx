import type { Metadata } from "next";
import Link from "next/link";
import {
  Bullets,
  PublicShell,
  Section,
} from "@/components/public/public-shell";
import { PrivacyEnglish } from "@/components/public/privacy-en";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

// The privacy policy.
//
// Google rejected the branding with "your privacy policy page does not have
// sufficient content", which is the review saying it could not tell from the
// page what is collected, why, or how long it is kept. So this is written to
// answer those in that order, and to be specific about *this* application
// rather than a template with the product name filled in — the specificity is
// the thing being assessed.
//
// It is also the page where the Google API Services User Data Policy has to be
// acknowledged. That disclosure is a condition of using the Ads and Business
// Profile scopes, it has to name the policy and link it, and it is reproduced
// in English below as well as in Dutch: the policy it cites is written in
// English, and a reviewer checking the wording should not have to read a
// translation of it to do that.

const UPDATED = "15 september 2026";

export const metadata: Metadata = {
  title: "Privacybeleid",
  description: `Welke gegevens ${APP_NAME} verwerkt, waarvoor, hoelang, en met wie ze gedeeld worden.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicShell
      title="Privacybeleid"
      intro={`${APP_NAME} is een beheerpaneel voor quicksolutionspro.be. Dit beleid beschrijft welke persoonsgegevens het verwerkt, waarom dat gebeurt, hoe lang ze bewaard worden en wat je ertegen kunt doen.`}
    >
      <p className="text-sm text-muted-foreground">
        Laatst bijgewerkt op {UPDATED}.
      </p>

      <Section title="1. Wie dit beleid uitgeeft">
        <p>
          Dit paneel wordt aangeboden door <strong>QuickSolutions</strong>{" "}
          (quicksolutionspro.be). QuickSolutions is de verwerkingsverantwoordelijke
          voor de gegevens die hieronder beschreven worden.
        </p>
        <p>
          Vragen, verzoeken of klachten:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section title="2. Kort samengevat">
        <Bullets
          items={[
            "Het paneel is niet openbaar. Iedereen die erin kan, heeft een account gekregen van QuickSolutions.",
            "Er worden geen gegevens verkocht, en er worden geen advertentieprofielen mee opgebouwd.",
            "De gegevens uit de koppelingen met Google worden alleen gebruikt om ze in het paneel te tonen en om er antwoorden op beoordelingen mee te plaatsen.",
            "Je kunt je account en de gekoppelde gegevens laten verwijderen door het te vragen — zie punt 11.",
          ]}
        />
      </Section>

      <Section title="3. Welke gegevens verwerkt worden">
        <p>
          <strong>Accountgegevens.</strong> Naam, e-mailadres en een wachtwoord.
          Het wachtwoord wordt gehasht bewaard (bcrypt) en is voor niemand
          leesbaar, ook niet voor ons. Bij het aanmelden wordt een
          sessiecookie geplaatst zodat je niet bij elk scherm opnieuw moet
          inloggen.
        </p>
        <p>
          <strong>Gegevens uit Google, als je een Google-account koppelt.</strong>{" "}
          Dat gebeurt alleen als de eigenaar van het account daar zelf op klikt.
          Er worden twee soorten gegevens opgehaald:
        </p>
        <Bullets
          items={[
            <>
              <strong>Beoordelingen van het bedrijfsprofiel</strong> (bereik{" "}
              <code className="font-mono text-sm">business.manage</code>): de
              beoordelingen zelf, de score en de tekst, en het antwoord dat in
              het paneel geschreven wordt.
            </>,
            <>
              <strong>Prestaties van advertentiecampagnes</strong> (bereik{" "}
              <code className="font-mono text-sm">adwords</code>): kosten,
              klikken, vertoningen en conversies van het eigen
              advertentieaccount.
            </>,
          ]}
        />
        <p>
          Om die twee koppelingen te laten werken bewaart het paneel de
          toegangssleutel en de vernieuwingssleutel (<em>refresh token</em>) die
          Google bij de koppeling uitgeeft. De vernieuwingssleutel is wat de
          koppeling laat voortbestaan zonder dat er opnieuw ingelogd moet worden;
          hij geeft geen toegang tot je Google-account in het algemeen, alleen
          tot de twee bereiken hierboven. Je kunt hem op elk moment intrekken —
          zie punt 11.
        </p>
        <p>
          <strong>Gegevens uit de webshop.</strong> Bestelnummer, datum, bedrag,
          valuta en status van de bestellingen op quicksolutionspro.be, opgehaald
          via de beheerinterface van de webshop zelf.
        </p>
        <p>
          <strong>Bezoekgegevens van de website.</strong> Met een eigen teller op
          quicksolutionspro.be wordt bijgehouden welke pagina&apos;s bekeken worden,
          wanneer, en met welk bezoekersnummer en sessienummer. Dat nummer is een
          willekeurige waarde in je browser, geen naam en geen e-mailadres. Uit
          het IP-adres wordt alleen het land afgeleid; het adres zelf wordt niet
          bewaard.
        </p>
        <p>
          <strong>Werk en berichten.</strong> De taken die in het paneel
          aangemaakt worden — wat er moet gebeuren, voor wie, tegen wanneer — en
          de meldingen die daarover verstuurd worden.
        </p>
        <p>
          <strong>Spraak, als je de inspreekfunctie gebruikt.</strong> Die
          functie is optioneel. De opname wordt niet door dit paneel bewaard: de
          browser zet spraak om in tekst en stuurt alleen die tekst door. Let op
          dat de browser die omzetting vaak zelf uitbesteedt — Chrome doet dat
          bij Google — en dat die verwerking onder het beleid van de browser valt,
          niet onder dit beleid. Gebruik je de functie niet, dan wordt er ook
          niets opgenomen.
        </p>
      </Section>

      <Section title="4. Waarvoor ze gebruikt worden">
        <Bullets
          items={[
            "Om het paneel te tonen: de cijfers, de lijsten en de status per onderdeel.",
            "Om antwoorden op beoordelingen te kunnen plaatsen namens het bedrijfsprofiel.",
            "Om taken toe te wijzen en om er op het afgesproken moment aan te herinneren.",
            "Om een seintje te geven wanneer de website of een koppeling niet meer antwoordt.",
            "Om te kunnen vaststellen wie iets gedaan heeft, wanneer dat in het paneel vastgelegd wordt.",
          ]}
        />
        <p>
          De gegevens worden <strong>niet</strong> gebruikt voor advertentiedoeleinden,
          niet om profielen op te bouwen, niet voor automatische besluitvorming met
          rechtsgevolgen, en niet om ze te verkopen of te verhuren.
        </p>
      </Section>

      <Section title="5. Google API Services — Limited Use">
        <p>
          Het gebruik door {APP_NAME} van informatie die ontvangen wordt van
          Google API&apos;s is onderworpen aan het{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , met inbegrip van de vereisten inzake beperkt gebruik (<em>Limited Use</em>).
        </p>
        <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
          <p lang="en">
            {APP_NAME}&rsquo;s use and transfer to any other app of information
            received from Google APIs will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p lang="en" className="mt-3">
            In particular: Google user data is used only to provide the features
            described in section 3 and 4 above — displaying reviews and ad
            performance inside this dashboard, and publishing review replies the
            account owner writes. It is not transferred to third parties except
            as needed to provide those features or as required by law, is not
            used for advertising, and is not read by humans except with the
            account owner&rsquo;s explicit permission or where required for
            security or legal reasons.
          </p>
        </div>
      </Section>

      <Section title="6. Grondslag">
        <p>
          De verwerking steunt op de uitvoering van de overeenkomst met de
          eigenaar van het account (het paneel leveren dat hij gevraagd heeft),
          op diens toestemming voor de koppelingen met Google — die hij zelf
          aanbrengt en zelf kan intrekken — en op het gerechtvaardigd belang bij
          het beveiligen van de dienst.
        </p>
      </Section>

      <Section title="7. Hoe lang ze bewaard worden">
        <Bullets
          items={[
            "Accountgegevens: zolang het account bestaat.",
            "Beoordelingen en antwoorden: zolang ze op het bedrijfsprofiel staan.",
            "Advertentiecijfers: de periode die in het paneel getoond wordt, plus een beperkte geschiedenis om vergelijkingen mogelijk te maken.",
            "Toegangs- en vernieuwingssleutels van Google: tot de koppeling verbroken wordt.",
            "Bezoekgegevens: beperkt in de tijd; ze worden niet onbeperkt bewaard.",
          ]}
        />
        <p>
          Wordt het account verwijderd, dan verdwijnen de gegevens die eraan
          hangen mee, behalve wat wettelijk bewaard moet blijven.
        </p>
      </Section>

      <Section title="8. Met wie ze gedeeld worden">
        <p>
          Er wordt niets verkocht. De gegevens komen terecht bij de partijen die
          de infrastructuur dragen:
        </p>
        <Bullets
          items={[
            <>
              <strong>Vercel</strong> — hosting van het paneel.
            </>,
            <>
              <strong>Supabase</strong> — de databank, in de Europese Unie
              (regio Parijs).
            </>,
            <>
              <strong>Google</strong> — de Ads API en de Business Profile API,
              alleen voor de twee koppelingen onder punt 3.
            </>,
            <>
              <strong>Telegram</strong> — voor meldingen, als dat kanaal
              ingeschakeld is. Daarbij gaat het om de inhoud van de melding,
              niet om de onderliggende gegevens.
            </>,
          ]}
        />
        <p>
          Verder worden gegevens alleen gedeeld wanneer dat wettelijk verplicht
          is.
        </p>
      </Section>

      <Section title="9. Beveiliging">
        <Bullets
          items={[
            "De verbinding met het paneel is versleuteld (HTTPS).",
            "Wachtwoorden worden gehasht bewaard en zijn niet leesbaar.",
            "De sessiecookie is niet leesbaar voor scripts in de pagina en wordt niet meegestuurd naar andere sites.",
            "Toegang tot het paneel is per account beperkt, en de omgeving is niet publiek bereikbaar zonder aanmelding.",
          ]}
        />
      </Section>

      <Section title="10. Cookies en lokale opslag">
        <p>
          Het paneel plaatst één functionele cookie: de sessiecookie, die nodig
          is om ingelogd te blijven. Daarnaast wordt in de browser een
          voorkeur bewaard — het thema en de taal waarin ingesproken wordt — die
          niet naar de server gestuurd wordt. Er zijn geen advertentiecookies en
          geen trackers van derden in het paneel zelf.
        </p>
        <p>
          De teller op quicksolutionspro.be gebruikt een willekeurig
          bezoekersnummer in de browser om bezoeken te kunnen tellen zonder
          mensen te identificeren.
        </p>
      </Section>

      <Section title="11. Je rechten">
        <p>
          Je hebt het recht om te weten welke gegevens er over je bewaard worden,
          ze te laten verbeteren of verwijderen, de verwerking te beperken, je
          ertegen te verzetten, en ze in een overdraagbaar formaat te krijgen.
          Een toestemming die je gegeven hebt — zoals een Google-koppeling — kun
          je op elk moment intrekken.
        </p>
        <p>
          <strong>De koppeling met Google verbreken</strong> kan op twee
          manieren: in het paneel zelf, of via{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          . Met de tweede manier trek je de toegang in bij Google, wat onmiddellijk
          werkt ook als het paneel er niet meer bij kan.
        </p>
        <p>
          Stuur een verzoek naar{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Er wordt op
          geantwoord binnen de termijn die de AVG voorschrijft. Ben je het niet
          eens met het antwoord, dan kun je klacht indienen bij de Belgische
          Gegevensbeschermingsautoriteit (
          <a
            href="https://www.gegevensbeschermingsautoriteit.be"
            target="_blank"
            rel="noreferrer"
          >
            gegevensbeschermingsautoriteit.be
          </a>
          ).
        </p>
      </Section>

      <Section title="12. Wijzigingen">
        <p>
          Dit beleid kan aangepast worden wanneer het paneel verandert. De datum
          bovenaan geeft de laatste wijziging aan. Bij een ingrijpende wijziging
          worden de gebruikers van het paneel daarvan op de hoogte gebracht.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — zie ook de{" "}
          <Link href="/voorwaarden">voorwaarden</Link>.
        </p>
      </Section>

      <PrivacyEnglish />
    </PublicShell>
  );
}
