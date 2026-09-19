import type { SyntaxNodeRef } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";

// CommonMark plus GFM (tables, task lists, strikethrough, autolinks). `@lezer/markdown` ships both ESM and CJS and reports the exact source range of every node, which is what protecting *around* the prose needs.
const markdown = parser.configure(GFM);

/**
 * Syntax that lives *inside* prose and that the parser can't tell from words: Kiritan's `%{name}` placeholders. Everything else — code, URLs, HTML, escapes, entities, front matter, directives, headings/list/quote markers, table pipes, emphasis markers, link and reference syntax — is found by the parser, not by patterns.
 */
export const defaultProtectPatterns: RegExp[] = [/%\{[^}\n]*\}/];

const TOKEN_OPEN = "[[";
const TOKEN_CLOSE = "]]";

export interface Masked {
  /** The text with every protected span replaced by a token. */
  text: string;
  /** The spans, indexed by token number. */
  spans: string[];
}

interface Range {
  start: number;
  end: number;
}

// Nodes whose whole range is not prose, children and all (the text *between* an inline-code span's backticks is inside the node but isn't a child of it).
const OPAQUE = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "Autolink",
  "LinkReference",
  "HTMLBlock",
  "Comment",
  "CommentBlock",
  "ProcessingInstruction",
  "ProcessingInstructionBlock",
]);

// The parser gives prose no node of its own: it's whatever a container's children don't cover. The exceptions are the containers that have no child at all when they hold nothing but plain words, which look like leaves.
const PROSE_LEAVES = new Set(["Document", "Paragraph", "TableCell"]);

// Block markers are followed by a space that engines drop, and `#Title` is no longer a heading; that space is kept inside the marker's token.
const BLOCK_MARKERS = new Set(["ListMark", "QuoteMark", "TaskMarker"]);

// Kiritan's own syntax, which is not Markdown: leading YAML front matter, and `:::kiritan{...}` / `::kiritan{...}` / bare `:::` directive lines.
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const DIRECTIVE_LINE = /^:{2,}(?:kiritan\{[^}\n]*\})?[ \t]*(?=\r?$)/gm;
const LITERAL_TOKEN = /\[\[\s*\d+\s*\]\]/g;

/** Every source range that is not prose. */
function protectedRanges(text: string): Range[] {
  const ranges: Range[] = [];

  // Front matter would parse as a thematic break and a heading, so it is cut out and the rest parsed on its own.
  const frontMatter = FRONT_MATTER.exec(text)?.[0].length ?? 0;
  if (frontMatter > 0) ranges.push({ start: 0, end: frontMatter });

  const body = text.slice(frontMatter);
  const tree = markdown.parse(body);
  tree.iterate({
    enter: (node: SyntaxNodeRef) => {
      if (OPAQUE.has(node.name)) {
        ranges.push({
          start: node.from + frontMatter,
          end: node.to + frontMatter,
        });
        return false;
      }
      if (node.node.firstChild || PROSE_LEAVES.has(node.name)) return undefined;

      let end = node.to;
      const isAtxMark =
        node.name === "HeaderMark" &&
        node.node.parent?.name.startsWith("ATXHeading");
      if (BLOCK_MARKERS.has(node.name) || isAtxMark) {
        end += /^[ \t]*/.exec(body.slice(end))![0].length;
      }
      ranges.push({ start: node.from + frontMatter, end: end + frontMatter });
      return undefined;
    },
  });

  // A literal `[[3]]` in the source would be indistinguishable from a token on the way back. The parser reads it as a link (so its brackets would be split into separate tokens), which is why it's shielded here, whole, before that can happen.
  for (const match of body.matchAll(LITERAL_TOKEN)) {
    ranges.push({
      start: match.index + frontMatter,
      end: match.index + match[0].length + frontMatter,
    });
  }

  for (const match of body.matchAll(DIRECTIVE_LINE)) {
    ranges.push({
      start: match.index + frontMatter,
      end: match.index + match[0].length + frontMatter,
    });
  }

  // Sort and merge, so overlapping or touching ranges become one token.
  ranges.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Applies `patterns` in order to the not-yet-claimed parts of `prose`, replacing each match with a token. */
function protectInProse(
  prose: string,
  patterns: RegExp[],
  token: (raw: string) => string
): string {
  let pieces: Array<{ text: string; claimed: boolean }> = [
    { text: prose, claimed: false },
  ];
  for (const pattern of patterns) {
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
  return pieces
    .map((piece) => (piece.claimed ? token(piece.text) : piece.text))
    .join("");
}

/**
 * The stretch between two runs of prose is markup. It becomes one token — except the blank lines around it, which stay literal so paragraph breaks are still visible to the engine and to `splitText`, and a gap that is only whitespace, which needs no protection.
 * Whitespace on the same line as the markup (the space after `#`, `-`, `>`) stays inside the token: engines drop it, and `#Title` is no longer a heading.
 */
function protectGap(raw: string, token: (raw: string) => string): string {
  const lead = /^(?:[ \t]*\r?\n)+/.exec(raw)?.[0] ?? "";
  const rest = raw.slice(lead.length);
  const trail = /(?:\r?\n[ \t]*)+$/.exec(rest)?.[0] ?? "";
  const core = rest.slice(0, rest.length - trail.length);
  if (core.trim() === "") return raw;
  return lead + token(core) + trail;
}

/**
 * Replaces everything that must not be translated with `[[N]]` tokens: the document is parsed as Markdown, every non-prose range the parser reports is shielded, and `patterns` are applied inside the prose that is left.
 * The `[[N]]` shape survived Google's and MyMemory's engines in testing where `⟦N⟧`, `XPH0X`-style words and `<span translate="no">` markup did not.
 */
export function mask(
  text: string,
  patterns: RegExp[] = defaultProtectPatterns
): Masked {
  const spans: string[] = [];
  const token = (raw: string) => {
    spans.push(raw);
    return `${TOKEN_OPEN}${spans.length - 1}${TOKEN_CLOSE}`;
  };

  let out = "";
  let cursor = 0;
  for (const range of protectedRanges(text)) {
    out += protectInProse(text.slice(cursor, range.start), patterns, token);
    out += protectGap(text.slice(range.start, range.end), token);
    cursor = range.end;
  }
  out += protectInProse(text.slice(cursor), patterns, token);
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

/** Full-width digits (０-９) to ASCII, since a Japanese or Chinese engine may re-typeset the token's number. */
function asciiDigits(digits: string): string {
  return digits.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

// The token as an engine may hand it back: its own ASCII brackets, full-width ones (［［0］］), or a single pair of corner brackets (【0】), with optional spaces inside and full-width digits.
const TOKEN_BACK = /(?:[[［]{2}|【)\s*([0-9０-９]+)\s*(?:[\]］]{2}|】)/g;

/**
 * Puts the protected spans back. Engines sometimes add spaces inside the brackets (`[[ 0 ]]`) or re-typeset them full-width, so those are tolerated. A token that's missing entirely means the engine ate something it shouldn't have, and that's an error rather than a silently corrupted document.
 */
export function unmask(text: string, spans: string[]): string {
  const seen = new Set<number>();
  const restored = text.replace(TOKEN_BACK, (whole, digits: string) => {
    const index = Number(asciiDigits(digits));
    if (index >= spans.length) return whole;
    seen.add(index);
    return spans[index];
  });
  const missing = spans.map((_span, i) => i).filter((i) => !seen.has(i));
  if (missing.length > 0) throw new PlaceholderLostError(missing);
  return restored;
}
