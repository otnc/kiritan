export interface Chunk {
  /** What to translate: never has leading/trailing whitespace. */
  text: string;
  /** The whitespace before it, kept verbatim so a joined result has the original layout. */
  before: string;
}

/** The longest prefix length whose measure is within `limit` (at least 1, so progress is always made). */
function fitLength(
  text: string,
  limit: number,
  measure: (text: string) => number
): number {
  let low = 1;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, mid)) <= limit) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** How far past the limit to look, so a segment that ends just before it isn't mistaken for one cut off by it. */
const LOOKAHEAD = 64;

/**
 * The largest segment end that is at or before `limit`, or -1. `Intl.Segmenter` knows the rules for every language (a Japanese `。`, a surrogate pair, a combining mark), so none of that is hand-written here.
 */
function lastBoundary(
  text: string,
  limit: number,
  granularity: "sentence" | "word" | "grapheme"
): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity });
  let best = -1;
  for (const { index, segment } of segmenter.segment(
    text.slice(0, limit + LOOKAHEAD)
  )) {
    const end = index + segment.length;
    if (end > limit) break;
    best = end;
  }
  return best;
}

/** Splits `text` at the last boundary within `limit`: blank line, then newline, then sentence, then word, then grapheme, then (only if a single grapheme won't fit) a hard cut. */
function cutPoint(text: string, limit: number): number {
  const window = text.slice(0, limit);
  for (const newlines of [/\n{2,}/g, /\n/g]) {
    let best = -1;
    for (const match of window.matchAll(newlines)) {
      if (match.index > 0 && match.index + match[0].length <= limit) {
        best = match.index + match[0].length;
      }
    }
    if (best > 0) return best;
  }
  for (const granularity of ["sentence", "word", "grapheme"] as const) {
    const boundary = lastBoundary(text, limit, granularity);
    if (boundary > 0) return boundary;
  }
  return limit;
}

/**
 * Splits a text longer than `maxChars` into chunks that each fit, breaking at paragraph boundaries where it can and only at sentence/word/grapheme cuts where it can't. Whitespace between chunks is preserved in `before`, so `join(chunks translated)` reassembles the original layout exactly.
 * Length is counted with `measure` (UTF-16 code units by default) on the already-masked text, so a provider that limits bytes can pass a byte counter. Text at or under the limit comes back as one chunk.
 */
export function splitText(
  text: string,
  maxChars: number,
  measure: (text: string) => number = (t) => t.length
): Chunk[] {
  const chunks: Chunk[] = [];
  let rest = text;
  let before = "";

  while (rest.length > 0) {
    const lead = /^\s*/.exec(rest)?.[0] ?? "";
    before += lead;
    rest = rest.slice(lead.length);
    if (rest.length === 0) break;

    let piece = rest;
    if (measure(rest) > maxChars) {
      piece = rest.slice(0, cutPoint(rest, fitLength(rest, maxChars, measure)));
    }
    rest = rest.slice(piece.length);
    const trimmed = piece.replace(/\s+$/, "");
    // Trailing whitespace of a piece is the next chunk's leading whitespace.
    rest = piece.slice(trimmed.length) + rest;
    chunks.push({ text: trimmed, before });
    before = "";
  }

  return chunks;
}

/** The whitespace after the last chunk, which `splitText` doesn't attach to any chunk. */
export function trailingWhitespace(text: string): string {
  return /\s*$/.exec(text)?.[0] ?? "";
}

/** Puts translated chunks back together with the original whitespace. */
export function joinChunks(
  chunks: Chunk[],
  translated: string[],
  original: string
): string {
  if (chunks.length === 0) return original;
  let out = "";
  chunks.forEach((chunk, i) => {
    out += chunk.before + translated[i];
  });
  return out + trailingWhitespace(original);
}
