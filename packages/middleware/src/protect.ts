import type { Link, Nodes, Parent, Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

// The same syntax kiritan itself reads (Markdown + front matter + `:::kiritan{...}` directives), plus GFM so tables, strikethrough and autolinks are recognised too.
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkGfm)
  .use(remarkDirective);

/**
 * Syntax that lives *inside* prose, which a Markdown parser sees as ordinary text: Kiritan's `%{name}` placeholders, backslash escapes (dropping the backslash changes what the Markdown means) and HTML entities. Everything structural — code, URLs, HTML, front matter, directives, headings/list/quote markers, table pipes, emphasis markers, link and reference syntax — is found by the parser, not by patterns.
 */
export const defaultProtectPatterns: RegExp[] = [
  /%\{[^}\n]*\}/,
  /\\[\\`*_{}[\]()#+\-.!|<>~%]/,
  /&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/i,
];

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

/** GFM's autolink literal (`https://x.dev`) and `<https://x.dev>` come out as a link whose only child is the URL itself as text. That text is the address, not prose. */
function isAddressText(value: string, parent: Parent | undefined): boolean {
  if (parent?.type !== "link") return false;
  const url = (parent as Link).url;
  return value === url || `mailto:${value}` === url;
}

/** The source ranges of every text node — the only places ordinary prose lives. */
function proseRanges(tree: Root): Range[] {
  const ranges: Range[] = [];
  const visit = (node: Nodes, parent: Parent | undefined) => {
    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        start !== undefined &&
        end !== undefined &&
        !isAddressText(node.value, parent)
      ) {
        ranges.push({ start, end });
      }
      return;
    }
    if ("children" in node) {
      for (const child of node.children as Nodes[])
        visit(child, node as Parent);
    }
  };
  visit(tree, undefined);

  // Adjacent text nodes (split around an escape or entity) are one run of prose.
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
 * Replaces everything that must not be translated with `[[N]]` tokens: the document is parsed as Markdown, only text nodes are treated as prose, and all the markup around them is shielded (then `patterns` are applied inside the prose itself).
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

  const tree = processor.parse(text) as Root;
  let out = "";
  let cursor = 0;
  for (const run of proseRanges(tree)) {
    out += protectGap(text.slice(cursor, run.start), token);
    out += protectInProse(text.slice(run.start, run.end), patterns, token);
    cursor = run.end;
  }
  out += protectGap(text.slice(cursor), token);
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
