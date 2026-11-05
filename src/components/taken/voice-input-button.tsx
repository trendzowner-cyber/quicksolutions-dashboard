"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Dictation for the task dialog.
//
// The transcription is done by the browser's own Web Speech API: no API key, no
// per-minute cost, no audio ever touches this app. That also sets its limits,
// which are worth knowing before debugging it:
//
//   · Chrome, Edge and Safari only. Firefox has no implementation at all, so
//     the button hides itself rather than sitting there doing nothing.
//   · Chrome sends the audio to Google to transcribe. Free, but it needs a
//     connection and it is not private.
//
// The Dutch it produces is handed straight to /api/tasks/voice to be turned
// into English — see the note there.

// The Web Speech API is not in TypeScript's DOM lib, so the slice actually used
// is declared here rather than reaching for `any`.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  0: SpeechAlternative;
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

/** The recogniser takes one locale — there is no "listen for both" — so this is
 *  a switch rather than auto-detection. Dutch is the default because the client
 *  is the one dictating, but the choice is remembered per device so anyone who
 *  works in English only sets it once. */
const LANGS = [
  { code: "nl-BE", label: "NL", name: "Nederlands" },
  { code: "en-US", label: "EN", name: "English" },
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

export function VoiceInputButton({
  onTranscript,
  busy = false,
  disabled = false,
}: {
  /** Called once with the finished transcript and the language it was heard in. */
  onTranscript: (transcript: string, lang: LangCode) => void;
  /** True while the transcript is being translated — the button locks. */
  busy?: boolean;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [lang, setLang] = useState<LangCode>("nl-BE");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  // Feature detection has to happen after mount: the server has no window, and
  // deciding during render would desync hydration.
  useEffect(() => {
    setSupported(speechCtor() !== null);
    try {
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

  const pickLang = (code: LangCode) => {
    setLang(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // Not worth telling anyone about.
    }
  };

  if (!supported) return null;

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
    // One utterance at a time: continuous mode on a phone tends to run on and
    // pick up the room, and a task is a sentence, not a meeting.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    finalRef.current = "";
    setInterim("");

    rec.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalRef.current += text;
        else live += text;
      }
      setInterim(live);
    };

    rec.onerror = (event) => {
      const code = event.error ?? "";
      // A manual stop is not a failure worth reporting.
      if (code !== "aborted") {
        toast.error(ERROR_TEXT[code] ?? `Spraakherkenning mislukt (${code})`);
      }
      setListening(false);
      setInterim("");
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
      const transcript = finalRef.current.trim();
      if (transcript) onTranscript(transcript, lang);
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

  const active = listening || busy;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={listening ? "default" : "outline"}
        size="icon"
        className={cn("shrink-0", listening && "animate-pulse")}
        title={
          listening
            ? "Stop met luisteren"
            : `Inspreken in het ${lang === "nl-BE" ? "Nederlands" : "Engels"}`
        }
        aria-label={listening ? "Stop met luisteren" : "Taak inspreken"}
        disabled={disabled || busy}
        onClick={listening ? stop : start}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : listening ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>

      {/* Which language to listen for. Locked while recording: changing it
          mid-utterance would only apply to the next attempt anyway, and a dead
          control is less confusing than one that looks live. */}
      <div
        className="flex shrink-0 items-center rounded-md border border-border p-0.5"
        role="group"
        aria-label="Taal van de spraakherkenning"
      >
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            title={`Luister in het ${l.name}`}
            aria-pressed={lang === l.code}
            disabled={disabled || busy || listening}
            onClick={() => pickLang(l.code)}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
              lang === l.code
                ? "bg-brand/15 text-brand"
                : "text-muted-foreground hover:text-foreground",
              (disabled || busy || listening) && "cursor-not-allowed opacity-60"
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {active && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {busy ? "Wordt omgezet naar Engels…" : interim || "Aan het luisteren…"}
        </span>
      )}
    </div>
  );
}
