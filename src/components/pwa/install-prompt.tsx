"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SquareArrowUp, X } from "lucide-react";

// "Zet op je beginscherm" — asked once, on iPhone, and never again.
//
// iOS has no install event. Chrome fires `beforeinstallprompt` and can show a
// real install dialog; Safari fires nothing at all, so the only honest way to
// get the app onto a home screen is to tell the person which two buttons to
// tap. That is all this is.
//
// Three things have to be true before it shows, and each one matters:
//
//   · It is an iPhone/iPad. On desktop this is noise.
//   · It is Safari. Chrome, Firefox and the in-app browsers on iOS cannot add
//     to the home screen at all — instructions there would send someone
//     hunting for a menu item that does not exist.
//   · It is not already installed. `standalone` is true only when the page was
//     opened FROM the home-screen icon, which is exactly the question being
//     asked. Somebody who already did this should never see it.
//
// And once dismissed it stays dismissed — "only once" is the whole point, so
// the flag is written before the sheet closes. The instructions are still
// reachable afterwards from Meer → "App op je beginscherm".

const DISMISS_KEY = "qs-ios-install-prompt";

/** iPadOS 13+ reports itself as a Mac, so touch points are the tell. */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Safari, and not one of the browsers wearing a Safari user-agent. */
export function isSafari(): boolean {
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo/.test(ua)) return false;
  return /Safari/.test(ua);
}

/** Already on the home screen? */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as unknown as { standalone?: boolean })
    .standalone;
  return (
    iosStandalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function InstallPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Storage blocked. Showing it again next time is the lesser evil
      // compared to never showing it at all — but only if it qualifies.
    }
    if (isIOS() && isSafari() && !isStandalone()) setOpen(true);
  }, []);

  // Meer → "App op je beginscherm" reopens it on demand, even after the
  // one-time prompt has been retired.
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("qs:install-help", reopen);
    return () => window.removeEventListener("qs:install-help", reopen);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "done");
    } catch {
      // Nothing to do — the sheet still closes.
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    // Sat above the bottom navigation on purpose: covering the tab bar with a
    // card that has to be dismissed first reads as the app being stuck.
    <div
      className="fixed inset-x-0 z-50 px-4"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 1rem)" }}
    >
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted">
            <SquareArrowUp className="h-5 w-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Zet de app op je beginscherm</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Tik onderaan op het deel-icoon en kies{" "}
              <span className="font-medium text-foreground">
                &ldquo;Zet op beginscherm&rdquo;
              </span>
              . Daarna opent alles als een echte app, zonder adresbalk.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Sluiten"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Button onClick={dismiss} className="mt-4 h-11 w-full">
          Begrepen
        </Button>
      </div>
    </div>
  );
}
