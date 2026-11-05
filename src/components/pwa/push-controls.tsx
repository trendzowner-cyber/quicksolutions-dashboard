"use client";

// The push-notification switch: one component, two homes (the activity bell's
// dropdown and the Instellingen "Notificaties" card).
//
// iOS rules this whole state machine: push only reaches an iPhone when the app
// runs from the home screen (standalone), and the permission prompt + subscribe
// must happen inside a user gesture. A Safari tab shows install guidance
// instead of a dead subscribe button.

import { useEffect, useState } from "react";
import { Bell, BellRing, Info, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isIOS, isSafari, isStandalone } from "@/components/pwa/install-prompt";
import { registerSW, urlBase64ToUint8Array } from "@/lib/push-client";

type PushStatus =
  | "loading"
  | "unsupported"
  | "ios-not-installed"
  | "denied"
  | "prompt"
  | "subscribed";

async function detectStatus(): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unsupported";
  // iOS delivers push ONLY to the home-screen app — a subscription made in a
  // Safari tab never pings. Checked BEFORE Notification, which is undefined
  // in iOS tabs (reading .permission there would crash the init).
  if (isIOS() && isSafari() && !isStandalone()) return "ios-not-installed";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registerSW();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Re-POST so the row stays upserted for the current user (device shared
    // between accounts, or a row that predates a re-login).
    void resyncSubscription(sub);
    return "subscribed";
  }
  return "prompt";
}

async function resyncSubscription(sub: PushSubscription) {
  try {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }),
    });
  } catch {
    // Non-fatal — the next enable() or a push send surfaces any real problem.
  }
}

export function PushControls({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const s = await detectStatus();
      if (!cancelled) setStatus(s);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy("on");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "prompt");
        return;
      }
      const reg = await registerSW();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string
        ),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setStatus("subscribed");
      toast.success("Push-meldingen ingeschakeld");
    } catch {
      toast.error("Kon push-meldingen niet inschakelen");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (res.ok) toast.success("Testmelding verzonden — kijk op je telefoon");
      else toast.error("Kon geen testmelding sturen");
    } catch {
      toast.error("Verbindingsfout");
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("off");
    try {
      const reg = await registerSW();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setStatus("prompt");
      toast.success("Push-meldingen uitgeschakeld");
    } catch {
      toast.error("Kon push-meldingen niet uitschakelen");
    } finally {
      setBusy(null);
    }
  }

  const openInstallHelp = () => window.dispatchEvent(new Event("qs:install-help"));

  if (status === "loading") return null;

  const text = compact ? "text-xs" : "text-sm";

  if (status === "unsupported") {
    return (
      <p className={`${text} text-muted-foreground`}>
        Pushmeldingen worden op dit toestel niet ondersteund.
      </p>
    );
  }

  if (status === "ios-not-installed") {
    return (
      <div className="space-y-2">
        <p className={`${text} flex items-start gap-1.5 text-muted-foreground`}>
          <Info className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} mt-0.5 shrink-0 text-sky-400`} />
          Pushmeldingen werken alleen als de app op je beginscherm staat.
        </p>
        <Button
          size={compact ? "sm" : "default"}
          variant="outline"
          className="gap-1.5"
          onClick={openInstallHelp}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Zet de app op je beginscherm
        </Button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className={`${text} space-y-1 text-muted-foreground`}>
        <p className="flex items-start gap-1.5">
          <Info className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} mt-0.5 shrink-0 text-rose-400`} />
          Meldingen zijn geblokkeerd voor deze app.
        </p>
        {isIOS() && (
          <p>
            Zet ze weer aan via{" "}
            <span className="font-medium text-foreground">
              Instellingen → Meldingen → QuickSolutions
            </span>
            .
          </p>
        )}
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="space-y-2">
        <p className={`${text} flex items-center gap-1.5 font-medium text-emerald-400`}>
          <Bell className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0`} />
          Push-meldingen staan aan
        </p>
        <div className="flex gap-2">
          <Button
            size={compact ? "sm" : "default"}
            variant="outline"
            className="gap-1.5"
            onClick={sendTest}
            disabled={busy !== null}
          >
            <Send className="h-3.5 w-3.5" />
            {busy === "test" ? "Bezig…" : "Test"}
          </Button>
          <Button
            size={compact ? "sm" : "default"}
            variant="ghost"
            onClick={disable}
            disabled={busy !== null}
          >
            {busy === "off" ? "Bezig…" : "Uit"}
          </Button>
        </div>
      </div>
    );
  }

  // status === "prompt" — the one button that starts it all.
  return (
    <div className="space-y-2">
      <p className={`${text} text-muted-foreground`}>
        Krijg een melding op je telefoon zodra er een nieuwe review binnenkomt.
      </p>
      <Button size={compact ? "sm" : "default"} className="gap-1.5" onClick={enable} disabled={busy !== null}>
        <BellRing className="h-3.5 w-3.5" />
        {busy === "on" ? "Bezig…" : "Push-meldingen aan"}
      </Button>
    </div>
  );
}
