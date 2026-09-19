import { createHash } from "node:crypto";

/**
 * A short, non-cryptographic-strength hex digest used only to detect whether a source segment has drifted since a translation was last verified against it (docs/DESIGN.md chapter 8).
 */
export function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

const defaultComment = (text: string) => `<!-- ${text} -->`;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Extracts the `kiritan:hash` marker from a `sidecar` output file, if present.
 * The pattern is derived from `comment` (a `Renderer.comment`), so only a marker written the way that renderer writes it matches — the same words in prose or a code sample don't. Whitespace inside the comment is matched loosely.
 */
export function extractHashComment(
  text: string,
  comment: (text: string) => string = defaultComment
): string | undefined {
  const [before, after = ""] = comment("kiritan:hash \u0000").split("\u0000");
  const pattern = new RegExp(
    escapeRegExp(before).replace(/ /g, "\\s*") +
      "([0-9a-f]+)" +
      escapeRegExp(after).replace(/ /g, "\\s*")
  );
  return pattern.exec(text)?.[1];
}

/**
 * Appends a `kiritan:hash` marker, wrapped in `comment` (a `Renderer.comment`), recording the base content's hash at translation time.
 * Defaults to Markdown's `<!-- ... -->`.
 */
export function withHashComment(
  text: string,
  hash: string,
  comment: (text: string) => string = defaultComment
): string {
  return `${text.replace(/\n+$/, "")}\n\n${comment(`kiritan:hash ${hash}`)}\n`;
}
