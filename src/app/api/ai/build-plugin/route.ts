import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { callDeepSeek } from "@/lib/deepseek";

const PLUGIN_SYSTEM = `Je bent een WordPress plugin developer. Je schrijft veilige, werkende PHP code voor WordPress plugins.
REGELS:
- Output ALLEEN de volledige PHP plugin code
- Begin met <?php en de plugin header comment (Plugin Name, Description, Version, Author)
- Gebruik WordPress hooks en filters correct (add_action, add_filter, add_shortcode)
- Veilige code: esc_html(), esc_url(), wp_kses(), sanitize_text_field() voor alle output/input
- Geen database wijzigingen tenzij expliciet gevraagd
- Gebruik wp_enqueue_scripts voor CSS/JS
- Nederlands of Engels comments — jij kiest wat het beste past
- Moderne PHP: type hints, strict types waar nuttig
- Houd de code compact maar leesbaar (max 200 regels)
- Voeg altijd een uninstall.php check toe als er database wijzigingen zijn
- Geef ALLEEN de PHP code terug, geen uitleg, geen markdown om de code heen`;

export async function POST(request: Request) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { prompt } = await request.json();
    const result = await callDeepSeek({
      systemPrompt: PLUGIN_SYSTEM,
      userPrompt: `Schrijf een WordPress plugin die: ${prompt}\n\nGeef ALLEEN de PHP code, geen uitleg.`,
      temperature: 0.3,
      maxTokens: 3000,
    });
    // Clean up code
    let code = result.trim();
    if (code.startsWith("```php")) code = code.slice(6);
    else if (code.startsWith("```")) code = code.slice(3);
    if (code.endsWith("```")) code = code.slice(0, -3);
    if (!code.startsWith("<?php")) code = "<?php\n" + code;

    return NextResponse.json({ code: code.trim() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
