"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Dictation for the client's composer — the phone version, deliberately not the
// operator's.
//
// The operator's VoiceInputButton is a 36px icon with an 11px NL/EN toggle: it
// is built to sit in a row of controls that a mouse is aiming at. On a phone
// held one-handed that is unusable — the client could not tell whether it was
// listening, and could not find the way to stop. This is the same Web Speech
// API underneath, but the whole interaction is rebuilt around the fact that a
// thumb is doing it:
//
//   · One full-width control to start, one full-width control to stop. Neither
//     is smaller than 56px tall.
//   · While listening, the state owns the screen: a pulsing microphone, the
//     words appearing as they are recognised, and a red "Klaar" button that is
//     the largest thing on the panel.
//   · Nothing is 11px. Nothing is an icon with no label.
//
// The recognition itself is unchanged from the operator version and shares its
// limits — Chrome/Edge/Safari only, and Chrome sends the audio to Google to
// transcribe. Dutch is transcribed here and translated server-side.

// The Web Speech API is not in TypeScript's DOM lib, so the slice actually used
// is declared rather than reaching for `any`.
interface SpeechResult {
  0: { transcript: string } | undefined;
  isFinal: boolean;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechResultEvent extends Event {
  results: SpeechResultList;
  resultIndex: number;
}
interface SpeechErrorEvent extends Event {
  error?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// The recogniser takes one locale — there is no "listen for both". Dutch is the
// default because the client is the one dictating; the choice is remembered per
// device.
const LANGS = [
  { code: "nl-BE", label: "Nederlands" },
  { code: "en-US", label: "English" },
] as const;
type LangCode = (typeof LANGS)[number]["code"];

const LANG_STORAGE_KEY = "qs-voice-lang";

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Geen toegang tot de microfoon. Sta het toe in je browser.",
  "service-not-allowed": "Spraakherkenning is geblokkeerd in deze browser.",
  "no-speech": "Niets gehoord. Probeer opnieuw.",
  "audio-capture": "Geen microfoon gevonden.",
  network: "Spraakherkenning heeft internet nodig.",
};

// The example follows the chosen language. A Dutch sentence sitting under an
// "English" button tells him the toggle did not take — and the example is the
// only thing on this panel that shows him what a usable sentence looks like.
const EXAMPLES: Record<LangCode, string> = {
  "nl-BE":
    "Bijvoorbeeld: “Laat Kerim elke werkdag om vijf uur de reviews checken.”",
  "en-US": "For example: “Ask Kerim to check the reviews every weekday at five.”",
};

export function ClientVoicePanel({
  onTranscript,
  busy = false,
  disabled = false,
}: {
  /** Called once with the finished transcript and the language it was heard in. */
  onTranscript: (transcript: string, lang: LangCode) => void;
  /** True while the transcript is being translated — the panel locks. */
  busy?: boolean;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [lang, setLang] = useState<LangCode>("nl-BE");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");

  // Feature detection has to happen after mount: the server has no window, and
  // deciding during render would desync hydration. The rule below is aimed at
  // state derived from props, where a render-time computation would do instead;
  // there is no render-time equivalent of "does this browser have a
  // SpeechRecognition constructor", so the effect stays and the warning is
  // acknowledged rather than worked around.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(speechCtor() !== null);
    try {
      // Same reason as above: localStorage is not readable during render, and
      // the saved language has to land before he can press anything.
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && LANGS.some((l) => l.code === saved)) setLang(saved as LangCode);
    } catch {
      // Private mode or blocked storage — the default is fine.
    }
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        // Already stopped — nothing to clean up.
      }
    };
  }, []);

  if (!supported) return null;

  const pickLang = (code: LangCode) => {
    setLang(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // Not worth telling anyone about.
    }
  };

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      // Not running.
    }
  };

  const start = () => {
    const Ctor = speechCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    // One utterance at a time: continuous mode on a phone runs on and picks up
    // the room, and a task is a sentence, not a meeting.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setHeard("");

    rec.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += text;
        else live += text;
      }
      interimRef.current = live;
      setInterim(live);
      // Keep the panel showing what was understood even after the words stop
      // arriving, so the end of the utterance is visible rather than a blank box.
      if (finalRef.current) setHeard(finalRef.current.trim());
    };

    rec.onerror = (event) => {
      const code = event.error ?? "";
      // A manual stop is not a failure worth reporting.
      if (code !== "aborted") {
        toast.error(ERROR_TEXT[code] ?? `Spraakherkenning mislukt (${code})`);
      }
      setListening(false);
      setInterim("");
      interimRef.current = "";
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
      // Stopping halfway through a sentence — which is exactly what the big
      // stop button invites — can end the session before anything has been
      // marked final. The interim words are still what he said, so they are
      // what gets sent; dropping them would make stopping feel like losing.
      const transcript = (finalRef.current || interimRef.current).trim();
      interimRef.current = "";
      if (transcript) {
        setHeard(transcript);
        onTranscript(transcript, lang);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      toast.error("Microfoon kon niet starten");
      setListening(false);
    }
  };

  // ── Listening, or converting what was heard ──
  if (listening || busy) {
    const shown = interim || heard;
    return (
      <div
        className={cn(
          "rounded-2xl border p-4 transition-colors",
          busy ? "border-border bg-muted/40" : "border-rose-500/40 bg-rose-500/5"
        )}
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            {listening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" />
            )}
            <span
              className={cn(
                "relative flex h-14 w-14 items-center justify-center rounded-full text-white",
                busy ? "bg-muted-foreground" : "bg-rose-500"
              )}
            >
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              {busy ? "Bezig met omzetten…" : "Ik luister…"}
            </p>
            <p className="text-sm text-muted-foreground">
              {busy ? "Even geduld." : "Praat gerust, ik schrijf het op."}
            </p>
          </div>
        </div>

        <div className="mt-3 min-h-20 rounded-xl bg-card px-3 py-3">
          {shown ? (
            <p className="text-base leading-snug">{shown}</p>
          ) : (
            <p className="text-base leading-snug text-muted-foreground">
              Nog niets gehoord…
            </p>
          )}
        </div>

        {/* The way out. It was a 36px icon before, which is why stopping felt
            impossible — this is the biggest control in the panel on purpose. */}
        {!busy && (
          <Button
            type="button"
            onClick={stop}
            className="mt-3 h-14 w-full bg-rose-500 text-base font-semibold text-white hover:bg-rose-600"
          >
            <Square className="h-5 w-5" />
            Klaar met inspreken
          </Button>
        )}
      </div>
    );
  }

  // ── Idle ──
  return (
    <div className="space-y-3">
      {/* Which language to listen for, asked BEFORE the microphone is opened.
          It sat under the button before, which put the setting that decides
          whether a single word is understood after the action that needs it —
          he would tap Inspreken, watch it fail, and only then find the toggle
          underneath. Two full-width halves rather than the operator's 11px
          pills, because this is a thumb target. */}
      <div className="space-y-2">
        <p className="px-1 text-sm font-medium text-muted-foreground">
          In welke taal spreek je?
        </p>
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Taal van de spraakherkenning"
        >
          {LANGS.map((l) => {
            const on = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => pickLang(l.code)}
                className={cn(
                  "h-12 rounded-xl text-base font-medium transition-colors",
                  on
                    ? "bg-brand/15 text-brand ring-1 ring-brand/30"
                    : "bg-muted text-muted-foreground",
                  disabled && "opacity-50"
                )}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={start}
        disabled={disabled}
        className="h-14 w-full justify-start gap-3 rounded-2xl border-brand/40 bg-brand/5 px-4 text-base font-semibold text-brand"
      >
        <Mic className="h-5 w-5" />
        Inspreken
      </Button>

      {/* Below the button, because it is a hint about what to say rather than
          something to read first. */}
      <p className="px-1 text-sm leading-snug text-muted-foreground">
        {EXAMPLES[lang]}
      </p>
    </div>
  );
}
