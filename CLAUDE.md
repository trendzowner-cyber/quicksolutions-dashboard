# QuickSolutionsPro Control Center — CLAUDE.md

## Project Identity
- **Name:** QuickSolutionsPro Control Center (quicksolutions-dashboard)
- **Purpose:** Business OS for quicksolutionspro.be — WooCommerce sales, analytics, marketing, content, tasks, AI insights
- **Stack:** Next.js 16 + React 19 + Prisma + PostgreSQL + shadcn/Radix UI + Tailwind CSS 4 + DeepSeek AI
- **Deployed:** Vercel (zachlere-cyber, project: quicksolutions-dashboard)
- **GitHub:** trendzowner-cyber/quicksolutions-dashboard

## Philosophy
> SIMPLE ON THE SURFACE. EXTREMELY POWERFUL UNDERNEATH.

Every screen must answer: WHAT? WHY? WHAT NOW? WHAT TO DO? DO IT FROM HERE?

## Permanent Rules

### Preserve & Extend
- Do not remove working features. Extend, don't replace.
- Reuse components. Simple solutions. Small team must maintain this.

### Data Integrity
- Never fake analytics. Never mock data in production.
- WooCommerce = financial source of truth.
- If data unavailable → show unavailable state.

### Security
- Never expose API secrets to client.
- Permissions enforced server-side. Hiding a button is NOT security.
- No plaintext passwords. No raw stack traces to users.
- Rate limit login. CSRF protection.

### UX
- Responsive must not break. Dashboard must feel fast.
- Important numbers = visually dominant. Secondary info = quiet.
- Business utility > decorative complexity.

### Privacy
- No raw IP storage. Respect consent. No PII to AI.
- GDPR-compliant by design. Europe-targeted business.

### Code Protection
- Deployed for client use. Code ownership stays with developer.
- Server code protected by Next.js architecture.
- No source maps or debug tools in production.

## Architecture
See `/docs/architecture.md` for full details.
