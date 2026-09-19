import { createHash } from "node:crypto";

/**
 * A short, non-cryptographic-strength hex digest used only to detect whether a source segment has drifted since a translation was last verified against it (docs/DESIGN.md chapter 8).
 */
export function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

// Matches the marker inside whatever comment syntax the file's renderer wraps it in (`<!-- ... -->` for Markdown).
const HASH_COMMENT = /kiritan:hash\s+([0-9a-f]+)/;

/** Extracts the `kiritan:hash` marker from a `sidecar` output file, if present. */
export function extractHashComment(text: string): string | undefined {
  return HASH_COMMENT.exec(text)?.[1];
}

/**
 * Appends a `kiritan:hash` marker, wrapped in `comment` (a `Renderer.comment`), recording the base content's hash at translation time.
 * Defaults to Markdown's `<!-- ... -->`.
 */
export function withHashComment(
  text: string,
  hash: string,
  comment: (text: string) => string = (t) => `<!-- ${t} -->`
): string {
  return `${text.replace(/\n+$/, "")}\n\n${comment(`kiritan:hash ${hash}`)}\n`;
}
