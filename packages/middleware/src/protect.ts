/**
 * What must never reach a translation engine as translatable prose, in the order they're claimed (an earlier match hides anything inside it from the later ones).
 * Documents reach a middleware as raw Markdown — a whole file for `sidecar`, one directive body for `catalog` — so code, URLs and Kiritan's own syntax have to be shielded, not just `%{name}`.
 */
export const defaultProtectPatterns: RegExp[] = [
  // Leading YAML front matter (sidecar sends the whole file).
  /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
  // Fenced code blocks, ``` or ~~~.
  /^(?<fence>`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\k<fence>[ \t]*$/m,
  // Kiritan directive lines: `:::kiritan{...}`, `::kiritan{...}` and the bare closing `:::`.
  /^:{2,}(?:kiritan\{[^}\n]*\})?[ \t]*$/m,
  // Inline code.
  /`[^`\n]+`/,
  // `%{name}` interpolation placeholders.
  /%\{[^}\n]*\}/,
  // Link/image destinations: the `(url)` in `[text](url)`.
  /(?<=\]\()[^)\s]*(?:\s+"[^"]*")?(?=\))/,
  // Line-start Markdown markers — heading #, quote >, bullet, ordered number — with the space after them. Engines tend to drop that space, and `#Title` is no longer a heading.
  /^[ \t]*(?:#{1,6}|>+|[-*+]|\d{1,9}[.)])[ \t]+/m,
  // Bare URLs.
  /https?:\/\/[^\s<>)\]]+/,
  // HTML tags and comments (engines mangle attributes and drop comments).
  /<!--[\s\S]*?-->/,
  /<\/?[A-Za-z][^<>]*>/,
];

const TOKEN_OPEN = "[[";
const TOKEN_CLOSE = "]]";

export interface Masked {
  /** The text with every protected span replaced by a token. */
  text: string;
  /** The spans, indexed by token number. */
  spans: string[];
}

/**
 * Replaces every protected span with a `[[N]]` token. That shape survived Google's and MyMemory's engines in testing where `⟦N⟧`, `XPH0X`-style words and `<span translate="no">` markup did not (Google turned the attribute into `translation="no"`; MyMemory split the letters apart).
 * Patterns are applied in order, each only to text no earlier pattern already claimed.
 */
export function mask(
  text: string,
  patterns: RegExp[] = defaultProtectPatterns
): Masked {
  const spans: string[] = [];
  // Work on a list of segments so a later pattern only ever sees unclaimed text.
  let pieces: Array<{ text: string; claimed: boolean }> = [
    { text, claimed: false },
  ];

  // A literal `[[3]]` in the source would be indistinguishable from a token on the way back, so it is shielded like everything else.
  for (const pattern of [/\[\[\s*\d+\s*\]\]/, ...patterns]) {
    const flags = pattern.flags.includes("g")
      ? pattern.flags
      : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    const next: typeof pieces = [];
    for (const piece of pieces) {
      if (piece.claimed) {
        next.push(piece);
        continue;
      }
      let last = 0;
      for (const match of piece.text.matchAll(regex)) {
        if (match[0].length === 0) continue;
        if (match.index > last) {
          next.push({
            text: piece.text.slice(last, match.index),
            claimed: false,
          });
        }
        next.push({ text: match[0], claimed: true });
        last = match.index + match[0].length;
      }
      if (last < piece.text.length) {
        next.push({ text: piece.text.slice(last), claimed: false });
      }
    }
    pieces = next;
  }

  let out = "";
  for (const piece of pieces) {
    if (piece.claimed) {
      out += `${TOKEN_OPEN}${spans.length}${TOKEN_CLOSE}`;
      spans.push(piece.text);
    } else {
      out += piece.text;
    }
  }
  return { text: out, spans };
}

/** Whether `text` is nothing but tokens and whitespace — there's nothing left worth sending to an engine. */
export function isOnlyTokens(text: string): boolean {
  return text.replace(/\[\[\d+\]\]/g, "").trim() === "";
}

export class PlaceholderLostError extends Error {
  constructor(readonly missing: number[]) {
    super(
      `@kiritan/middleware: the translation engine dropped ${missing.length} protected span(s) (token ${missing.join(", ")}); refusing to write a translation that would lose code or links`
    );
    this.name = "PlaceholderLostError";
  }
}

/**
 * Puts the protected spans back. Engines sometimes add spaces inside the brackets (`[[ 0 ]]`), so that's tolerated. A token that's missing entirely means the engine ate something it shouldn't have, and that's an error rather than a silently corrupted document.
 */
export function unmask(text: string, spans: string[]): string {
  const seen = new Set<number>();
  const restored = text.replace(
    /\[\[\s*(\d+)\s*\]\]/g,
    (whole, digits: string) => {
      const index = Number(digits);
      if (index >= spans.length) return whole;
      seen.add(index);
      return spans[index];
    }
  );
  const missing = spans.map((_span, i) => i).filter((i) => !seen.has(i));
  if (missing.length > 0) throw new PlaceholderLostError(missing);
  return restored;
}
