export const FILLER_WORDS = [
  "um",
  "uh",
  "like",
  "you know",
  "basically",
  "actually",
  "literally",
  "sort of",
  "kind of",
  "i mean",
  "so",
  "right",
];

export function countFillers(text: string): number {
  return detectFillers(text).length;
}

export function detectFillers(text: string): string[] {
  if (!text) return [];
  const normalized = text.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const found: string[] = [];
  for (const f of FILLER_WORDS) {
    const re = new RegExp(`(^|\\s)${f.replace(/ /g, "\\s+")}(?=\\s|$)`, "g");
    const matches = normalized.match(re);
    if (matches) {
      for (let i = 0; i < matches.length; i++) found.push(f);
    }
  }
  return found;
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wpm(words: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (words / seconds) * 60;
}

// Collapse immediate phrase repetitions like
// "I built a system I built a system I built a system" → "I built a system".
// Some Web Speech engines emit overlapping finals; this is defense in depth
// on top of using event.resultIndex in the recognizer.
export function dedupeTranscript(text: string): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  // Try window sizes from large to small; collapse runs of identical N-grams.
  for (let w = Math.floor(words.length / 2); w >= 1; w--) {
    let i = 0;
    while (i + w * 2 <= words.length) {
      const a = words.slice(i, i + w).join(" ").toLowerCase();
      const b = words.slice(i + w, i + w * 2).join(" ").toLowerCase();
      if (a === b) {
        words.splice(i + w, w);
      } else {
        i++;
      }
    }
  }
  return words.join(" ");
}

