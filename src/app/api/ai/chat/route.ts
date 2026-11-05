import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";

const ADMIN_PASSWORD = process.env.DASHBOARD_PASSWORD || "";

// The admin password used to be interpolated into the system prompt, so the
// master credential was shipped to DeepSeek on every single chat call. The model
// never needed it — it only had to decide whether the user was authorized. So we
// now compare server-side, scrub the password out of everything we forward, and
// tell the model only the resulting yes/no.
function stripAdminPassword(text: string): { text: string; authorized: boolean } {
  if (!ADMIN_PASSWORD || !text.includes(ADMIN_PASSWORD)) {
    return { text, authorized: false };
  }
  return { text: text.split(ADMIN_PASSWORD).join("[wachtwoord]"), authorized: true };
}

function buildSystemPrompt(authorized: boolean): string {
  const authLine = authorized
    ? "De gebruiker IS geautoriseerd voor admin-commando's. Voer het commando uit en bevestig."
    : "De gebruiker is NIET geautoriseerd. Vraag beleefd om het admin wachtwoord voordat u een admin-commando uitvoert.";

  return `Je bent een AI-assistent voor quicksolutionspro.be, een Belgische refurbished electronics webshop. Je helpt gebruikers met vragen over de website, producten, en het beheerpaneel.

${authLine}

De admin commando's zijn:
- "VERANDER THEMA [licht/donker]" — wijzig het thema
- "MAAK BLOGPOST [onderwerp]" — start blog post generatie
- "SCAN SEO" — start SEO audit
- "TOON PRODUCTEN" — navigeer naar producten
- "TOON ORDERS" — navigeer naar bestellingen
- "TOON ANALYTICS" — navigeer naar dashboard
- "BOUW PLUGIN [beschrijving]" — genereer een WordPress plugin
- "EXPORT ORDERS" — download orders als CSV

Als een gebruiker vraagt om een plugin te maken (bijv: "maak een plugin die een WhatsApp knop toevoegt"), gebruik dan het BOUW PLUGIN commando met een duidelijke beschrijving van wat de plugin moet doen.

Voor gewone vragen: geef behulpzame antwoorden over refurbished producten, de webshop, bestellingen, garantie, etc.

Regels:
- Nederlands (Belgisch — nl_BE)
- Vriendelijk en professioneel
- Houd antwoorden kort (max 3-4 zinnen tenzij het technisch is)
- Gebruik "u" in plaats van "je"
- Voor commando's: antwoord met JSON: {"command": "COMMANDO_NAAM", "args": {}, "message": "bevestiging"}`;
}

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, history } = await request.json();

    // Scrub the admin password out of everything forwarded to DeepSeek and
    // resolve authorization server-side. History is checked too: a password
    // typed in an earlier turn would otherwise still be replayed to the model.
    const scrub = stripAdminPassword(String(message ?? ""));
    const authorized =
      scrub.authorized ||
      (history || []).some(
        (m: { content?: string }) =>
          stripAdminPassword(String(m?.content ?? "")).authorized
      );

    const messages = [
      { role: "system", content: buildSystemPrompt(authorized) },
      ...(history || []).map(
        (m: { role: string; content: string }) => ({
          role: m.role,
          content: stripAdminPassword(String(m.content ?? "")).text,
        })
      ),
      { role: "user", content: scrub.text },
    ];

    // Use raw fetch to pass full message array
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: messages as Array<{
            role: string;
            content: string;
          }>,
          temperature: 0.7,
          max_tokens: 800,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`DeepSeek error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    // Parse potential command from reply
    let command = null;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*"command"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.command) {
          command = parsed;
        }
      }
    } catch {
      // No command, just a normal reply
    }

    return NextResponse.json({
      reply: command ? command.message || reply : reply,
      command: command || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Chat failed", details: String(error) },
      { status: 500 }
    );
  }
}
