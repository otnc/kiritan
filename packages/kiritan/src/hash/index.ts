import { createHash } from "node:crypto";

/**
 * A short, non-cryptographic-strength hex digest used only to detect whether a source segment has drifted since a translation was last verified against it (docs/DESIGN.md 8章).
 */
export function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

const HASH_COMMENT = /<!--\s*kiritan:hash\s+([0-9a-f]+)\s*-->/;

/** Extracts the `<!-- kiritan:hash ... -->` marker from a `sidecar` output file, if present. */
export function extractHashComment(text: string): string | undefined {
  return HASH_COMMENT.exec(text)?.[1];
}

/** Appends a `<!-- kiritan:hash ... -->` marker recording the base content's hash at translation time. */
export function withHashComment(text: string, hash: string): string {
  return `${text.replace(/\n+$/, "")}\n\n<!-- kiritan:hash ${hash} -->\n`;
}
