import { APP_NAME, CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import { Bullets, Section } from "@/components/public/public-shell";

// The English privacy policy, rendered below the Dutch one on /privacy.
//
// It is not decoration and it is not a summary: it is the same policy, in full,
// in the language the reviewer reads. Google rejected this page once with "does
// not have sufficient content" while it was Dutch-only, and while <html lang="nl">
// is the honest answer for a Belgian product, it is also the thing an
// English-language content check has to work around. A complete translation on
// the same URL — rather than a summary, and rather than a separate /privacy/en
// that the check might never fetch — removes that question entirely.
//
// The two versions are kept in step by hand. If a section changes in
// `app/privacy/page.tsx`, it changes here too.

export function PrivacyEnglish() {
  return (
    <div lang="en" className="mt-16 border-t border-border pt-12">
      <h2 className="text-2xl font-semibold">Privacy Policy</h2>
      <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
        The same policy as above, in English, for reviewers and for anyone who
        does not read Dutch.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated 15 September 2026.
      </p>

      <div className="mt-8">
        <Section level={3} title="1. Who publishes this policy">
          <p>
            This dashboard is provided by <strong>QuickSolutions</strong> (
            {SITE_URL}), which is the data controller for the information
            described below. Questions, requests or complaints:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section level={3} title="2. Summary">
          <Bullets
            items={[
              "The dashboard is not public. Everyone who can reach it was given an account by QuickSolutions.",
              "No data is sold, and no advertising profiles are built from it.",
              "Data obtained through the Google integrations is used only to display it in the dashboard and to publish replies to reviews.",
              "You can have your account and its linked data deleted simply by asking — see section 11.",
            ]}
          />
        </Section>

        <Section level={3} title="3. What data is processed">
          <p>
            <strong>Account data.</strong> Name, email address and a password.
            The password is stored hashed (bcrypt) and is not readable by anyone,
            including us. A session cookie is set at sign-in so that you do not
            have to log in again on every screen.
          </p>
          <p>
            <strong>Google data, if a Google account is linked.</strong> This
            only happens if the account owner clicks to link it. Two kinds of
            data are read:
          </p>
          <Bullets
            items={[
              <>
                <strong>Business Profile reviews</strong> (scope{" "}
                <code className="font-mono text-sm">business.manage</code>): the
                reviews themselves, the rating and the text, and the reply
                written in the dashboard.
              </>,
              <>
                <strong>Advertising campaign performance</strong> (scope{" "}
                <code className="font-mono text-sm">adwords</code>): cost,
                clicks, impressions and conversions for the account&rsquo;s own
                advertising account.
              </>,
            ]}
          />
          <p>
            To keep those two integrations working, the dashboard stores the
            access token and the refresh token that Google issues when the
            account is linked. The refresh token is what lets the integration
            continue without signing in again; it does not grant access to your
            Google account in general, only to the two scopes above. You can
            revoke it at any time — see section 11.
          </p>
          <p>
            <strong>Shop data.</strong> Order number, date, amount, currency and
            status for orders placed on quicksolutionspro.be, retrieved through
            the shop&rsquo;s own administration interface.
          </p>
          <p>
            <strong>Website visit data.</strong> A first-party counter on
            quicksolutionspro.be records which pages are viewed, when, and under
            which visitor and session number. That number is a random value in
            your browser — not a name and not an email address. Only the country
            is derived from the IP address; the address itself is not stored.
          </p>
          <p>
            <strong>Work and messages.</strong> The tasks created in the
            dashboard — what has to be done, for whom, by when — and the
            notifications sent about them.
          </p>
          <p>
            <strong>Voice, if you use dictation.</strong> That feature is
            optional. The recording is not stored by this dashboard: the browser
            converts speech to text and only the text is sent on. Note that the
            browser often outsources that conversion itself — Chrome uses Google
            for it — and that processing falls under the browser&rsquo;s policy,
            not this one. If you do not use the feature, nothing is recorded.
          </p>
        </Section>

        <Section level={3} title="4. What it is used for">
          <Bullets
            items={[
              "To display the dashboard: the figures, the lists and the status of each section.",
              "To publish replies to reviews on behalf of the business profile.",
              "To assign tasks and to remind people about them at the agreed time.",
              "To raise an alert when the website or an integration stops responding.",
              "To be able to establish who did something, where that is recorded in the dashboard.",
            ]}
          />
          <p>
            The data is <strong>not</strong> used for advertising, not used to
            build profiles, not used for automated decision-making with legal
            effects, and not sold or rented.
          </p>
        </Section>

        <Section level={3} title="5. Google API Services — Limited Use">
          <p>
            {APP_NAME}&rsquo;s use of information received from Google APIs
            adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p>
            In particular: Google user data is used only to provide the features
            described in sections 3 and 4 above — displaying reviews and ad
            performance inside this dashboard, and publishing the review replies
            the account owner writes. It is not transferred to third parties
            except as needed to provide those features or as required by law, it
            is not used for advertising, and it is not read by humans except with
            the account owner&rsquo;s explicit permission or where required for
            security or legal reasons.
          </p>
        </Section>

        <Section level={3} title="6. Legal bases">
          <p>
            Processing rests on performance of the agreement with the account
            owner (providing the dashboard they asked for), on their consent for
            the Google integrations — which they grant themselves and can revoke
            themselves — and on the legitimate interest in keeping the service
            secure.
          </p>
        </Section>

        <Section level={3} title="7. How long it is kept">
          <Bullets
            items={[
              "Account data: for as long as the account exists.",
              "Reviews and replies: for as long as they appear on the business profile.",
              "Advertising figures: the period shown in the dashboard, plus limited history to allow comparison.",
              "Google access and refresh tokens: until the integration is disconnected.",
              "Visit data: time-limited; it is not kept indefinitely.",
            ]}
          />
          <p>
            If the account is deleted, the data attached to it goes with it,
            except what has to be retained by law.
          </p>
        </Section>

        <Section level={3} title="8. Who it is shared with">
          <p>Nothing is sold. The data reaches the parties that run the infrastructure:</p>
          <Bullets
            items={[
              <>
                <strong>Vercel</strong> — hosting of the dashboard.
              </>,
              <>
                <strong>Supabase</strong> — the database, inside the European
                Union (Paris region).
              </>,
              <>
                <strong>Google</strong> — the Ads API and the Business Profile
                API, only for the two integrations in section 3.
              </>,
              <>
                <strong>Telegram</strong> — for notifications, where that channel
                is enabled. What is sent is the content of the notification, not
                the underlying data.
              </>,
            ]}
          />
          <p>Beyond that, data is shared only where legally required.</p>
        </Section>

        <Section level={3} title="9. Security">
          <Bullets
            items={[
              "The connection to the dashboard is encrypted (HTTPS).",
              "Passwords are stored hashed and are not readable.",
              "The session cookie is not readable by scripts in the page and is not sent to other sites.",
              "Access is limited per account, and the environment cannot be reached without signing in.",
            ]}
          />
        </Section>

        <Section level={3} title="10. Cookies and local storage">
          <p>
            The dashboard sets one functional cookie: the session cookie, which
            is needed to stay signed in. A preference is also kept in the browser
            — the theme, and the language used for dictation — which is not sent
            to the server. There are no advertising cookies and no third-party
            trackers in the dashboard itself.
          </p>
          <p>
            The counter on quicksolutionspro.be uses a random visitor number in
            the browser to count visits without identifying people.
          </p>
        </Section>

        <Section level={3} title="11. Your rights">
          <p>
            You have the right to know what data is held about you, to have it
            corrected or deleted, to restrict processing, to object to it, and to
            receive it in a portable format. A consent you have given — such as a
            Google integration — can be withdrawn at any time.
          </p>
          <p>
            <strong>Disconnecting the Google integration</strong> can be done in
            two ways: inside the dashboard, or at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
            >
              myaccount.google.com/permissions
            </a>
            . The second revokes access at Google, which takes effect immediately
            even if the dashboard can no longer reach it.
          </p>
          <p>
            Send a request to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. It is
            answered within the period the GDPR requires. If you disagree with
            the answer, you can complain to the Belgian Data Protection
            Authority (
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

        <Section level={3} title="12. Changes">
          <p>
            This policy may be amended when the dashboard changes. The date at
            the top shows the last change. Users of the dashboard are informed of
            any substantial change.
          </p>
        </Section>

        <Section level={3} title="13. Contact">
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — see also the{" "}
            <a href="/voorwaarden">terms</a>.
          </p>
        </Section>
      </div>
    </div>
  );
}
