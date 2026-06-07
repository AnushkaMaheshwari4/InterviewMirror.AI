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
  if (!text) return 0;
  const lower = " " + text.toLowerCase().replace(/[.,!?;:]/g, " ") + " ";
  let count = 0;
  for (const f of FILLER_WORDS) {
    const re = new RegExp(`\\s${f.replace(/ /g, "\\s")}\\s`, "g");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function wpm(words: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (words / seconds) * 60;
}
