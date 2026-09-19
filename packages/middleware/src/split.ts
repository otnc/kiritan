export interface Chunk {
  /** What to translate: never has leading/trailing whitespace. */
  text: string;
  /** The whitespace before it, kept verbatim so a joined result has the original layout. */
  before: string;
}

/** Splits `text` at the last boundary within `limit`: blank line, then newline, then sentence end, then space, then a hard cut. */
function cutPoint(text: string, limit: number): number {
  const window = text.slice(0, limit);
  for (const boundary of [/\n{2,}/g, /\n/g, /(?<=[.!?。！？])\s*/g, / /g]) {
    let best = -1;
    for (const match of window.matchAll(boundary)) {
      if (match.index > 0 && match.index + match[0].length <= limit) {
        best = match.index + match[0].length;
      }
    }
    if (best > 0) return best;
  }
  return limit;
}

/**
 * Splits a text longer than `maxChars` into chunks that each fit, breaking at paragraph boundaries where it can and only at sentence/space/hard cuts where it can't. Whitespace between chunks is preserved in `before`, so `join(chunks translated)` reassembles the original layout exactly.
 * Length is counted in UTF-16 code units of the (already masked) text. Text at or under the limit comes back as one chunk.
 */
export function splitText(text: string, maxChars: number): Chunk[] {
  const chunks: Chunk[] = [];
  let rest = text;
  let before = "";

  while (rest.length > 0) {
    const lead = /^\s*/.exec(rest)?.[0] ?? "";
    before += lead;
    rest = rest.slice(lead.length);
    if (rest.length === 0) break;

    let piece = rest;
    if (rest.length > maxChars) {
      piece = rest.slice(0, cutPoint(rest, maxChars));
    }
    rest = rest.slice(piece.length);
    const trimmed = piece.replace(/\s+$/, "");
    // Trailing whitespace of a piece is the next chunk's leading whitespace.
    rest = piece.slice(trimmed.length) + rest;
    chunks.push({ text: trimmed, before });
    before = "";
  }

  // Only whitespace, or nothing at all: keep it so the join is still exact.
  if (chunks.length === 0) return [];
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
