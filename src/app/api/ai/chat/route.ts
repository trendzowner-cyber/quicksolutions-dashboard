import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";

const CHAT_SYSTEM = `Je bent een AI-assistent voor quicksolutionspro.be, een Belgische refurbished electronics webshop. Je helpt gebruikers met vragen over de website, producten, en het beheerpaneel.

Je kan de volgende admin commando's uitvoeren als de gebruiker het admin wachtwoord geeft:
- "VERANDER THEMA [licht/donker]" — wijzig het thema
- "MAAK BLOGPOST [onderwerp]" — start blog post generatie
- "SCAN SEO" — start SEO audit
- "TOON PRODUCTEN" — navigeer naar producten
- "TOON ORDERS" — navigeer naar bestellingen
- "TOON ANALYTICS" — navigeer naar dashboard

Als een gebruiker een admin commando probeert zonder wachtwoord, vraag dan beleefd om het admin wachtwoord.

Als het admin wachtwoord correct is (${process.env.DASHBOARD_PASSWORD}), voer het commando uit en geef een bevestiging.

Voor gewone vragen: geef behulpzame antwoorden over refurbished producten, de webshop, bestellingen, garantie, etc.

Regels:
- Nederlands (Belgisch — nl_BE)
- Vriendelijk en professioneel
- Houd antwoorden kort (max 3-4 zinnen tenzij het technisch is)
- Gebruik "u" in plaats van "je"
- Voor commando's: antwoord met JSON: {"command": "COMMANDO_NAAM", "args": {}, "message": "bevestiging"}`;

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, history } = await request.json();

    const messages = [
      { role: "system", content: CHAT_SYSTEM },
      ...(history || []).map(
        (m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })
      ),
      { role: "user", content: message },
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
