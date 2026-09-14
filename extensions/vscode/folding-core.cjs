// Pure line-based computation for markdown-folding.cjs, kept dependency-free
// (no `require("vscode")`) so it can be unit-tested with plain vitest — the
// real `vscode` module only exists inside a running extension host.
const KIRITAN_OPEN_RE = /^(:{3,})kiritan\{[^}]*\}\s*$/;
const GENERIC_OPEN_RE = /^(:{3,})\S+.*$/;
const CLOSE_RE = /^(:{2,})\s*$/;

/**
 * Walks `lines` with a colon-count stack (see markdown-folding.cjs for why)
 * and returns the line spans opened by a `:::kiritan{...}` fence.
 * @param {string[]} lines
 * @returns {{ startLine: number, endLine: number }[]}
 */
function computeFoldingRanges(lines) {
  const ranges = [];
  /** @type {{ line: number, colons: number, isKiritan: boolean }[]} */
  const stack = [];

  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];

    const kiritanOpen = KIRITAN_OPEN_RE.exec(text);
    if (kiritanOpen) {
      stack.push({ line, colons: kiritanOpen[1].length, isKiritan: true });
      continue;
    }

    const close = CLOSE_RE.exec(text);
    if (close) {
      const colons = close[1].length;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].colons !== colons) continue;
        const [opened] = stack.splice(i, 1);
        if (opened.isKiritan && line > opened.line) {
          ranges.push({ startLine: opened.line, endLine: line });
        }
        break;
      }
      continue;
    }

    const genericOpen = GENERIC_OPEN_RE.exec(text);
    if (genericOpen) {
      stack.push({ line, colons: genericOpen[1].length, isKiritan: false });
    }
  }

  return ranges;
}

module.exports = { computeFoldingRanges };
