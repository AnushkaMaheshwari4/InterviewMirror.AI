import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in lib.dom by default in all envs).
type SRConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSR(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition() {
  const [supported, setSupported] = useState<boolean>(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<InstanceType<SRConstructor> | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    setSupported(!!getSR());
  }, []);

  const start = useCallback(() => {
    const SR = getSR();
    if (!SR) return;
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: unknown) => {
      // Start at resultIndex so we never re-append a final result we've
      // already consumed (event.results is cumulative across events when
      // continuous=true, which would otherwise duplicate the transcript).
      const evt = e as {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      };
      let interimStr = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i];
        const t = res[0].transcript;
        if (res.isFinal) {
          finalRef.current += t.trim() + " ";
        } else {
          interimStr += t;
        }
      }
      setTranscript(finalRef.current.trim());
      setInterim(interimStr);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      // Auto-restart while user still wants to listen
      if (recRef.current === rec) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  return { supported, transcript, interim, listening, start, stop, reset };
}
