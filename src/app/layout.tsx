import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from "@/lib/site";
import { ThemeProvider } from "@/components/theme-provider";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Icons come from the app-dir file conventions: favicon.ico (multi-size,
// built from the logo) + icon.png (512) + apple-icon.png (180).
export const metadata: Metadata = {
  // The name is read from lib/site.ts rather than typed here: it has to match
  // the OAuth consent screen and the home page, and the only way three places
  // agree is if two of them are the same constant.
  title: {
    default: APP_NAME,
    template: `%s — ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  // Home-screen behaviour on iOS. Without `capable`, "Zet op beginscherm" makes
  // a bookmark that reopens in Safari with the address bar — which is the one
  // thing that stops it feeling like an app.
  appleWebApp: {
    capable: true,
    // Shorter than the page title, which iOS would otherwise use and truncate.
    title: APP_SHORT_NAME,
    // An opaque black status bar rather than black-translucent: the translucent
    // one slides the content under the clock, and on a phone that eats the
    // header. This matches the dark UI without any safe-area gymnastics.
    statusBarStyle: "black",
  },
  // iOS turns anything that looks like a phone number into a blue call link,
  // which mangles order numbers and prices on the board.
  formatDetection: { telephone: false },
  other: {
    // Next emits the standard `mobile-web-app-capable` from the flag above but
    // not this older spelling, which is the one iOS reads before 16.4 — and on
    // those phones it is the difference between an app and a Safari bookmark.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available — pinching into a dense table is a legitimate thing to
  // want, and blocking it is an accessibility problem.
  maximumScale: 5,
  // Tints the status/address bar to match, mostly for Android.
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider delay={300}>
            {children}
          </TooltipProvider>
          {/* Asks once, on an iPhone in Safari, to put the app on the home
              screen. Renders nothing anywhere else. */}
          <InstallPrompt />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--card)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
