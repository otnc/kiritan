// Pure logic for diagnostics.cjs, kept dependency-free (no `require("vscode")`) so it can be unit-tested with plain vitest — the real `vscode` module only exists inside a running extension host.
const { findIdLine } = require("./catalog-jump-core.cjs");

const DEFAULT_DELIMITERS = ["%{", "}"];

/** Blanks out `` `inline code` `` spans (same length, so byte offsets stay correct) so %{name} inside them never matches — kiritan's own interpolation pipeline skips `code`/`inlineCode` mdast nodes by default (`interpolation.skipCodeBlocks`), so a documentation line like `` `%{name}` `` showing the syntax itself is never actually interpolated. */
function maskInlineCode(text) {
  return text.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
}

/**
 * Finds `%{name}` uses in `lines` whose `name` isn't in `knownNames`. Skips fenced (``` ```) code blocks and inline code spans entirely, matching kiritan's own `interpolation.skipCodeBlocks` default — otherwise a line like `` `%{name}` `` in documentation *about* the syntax would misreport as a real, undefined interpolation. Returns [] outright if `delimiters` isn't the default `%{`/`}` — the scan pattern below is hardcoded to it, same as the TextMate grammar, so a project that reconfigures `interpolation.delimiters` would otherwise get false positives rather than no detection at all.
 * @param {string[]} lines
 * @param {string[]} knownNames
 * @param {[string, string] | undefined} delimiters
 */
function findUndefinedVariables(lines, knownNames, delimiters) {
  const [open, close] = delimiters ?? DEFAULT_DELIMITERS;
  if (open !== DEFAULT_DELIMITERS[0] || close !== DEFAULT_DELIMITERS[1]) {
    return [];
  }

  const known = new Set(knownNames);
  const pattern = /(\\?)%\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const results = [];
  let inFence = false;

  lines.forEach((text, line) => {
    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const scanned = maskInlineCode(text);
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(scanned))) {
      const [full, escape, name] = match;
      if (escape) continue; // \%{name} is the documented escape for a literal, not an interpolation.
      if (known.has(name)) continue;
      results.push({
        line,
        startChar: match.index + escape.length,
        endChar: match.index + full.length,
        name,
      });
    }
  });

  return results;
}

/**
 * Maps `kiritan check --json`'s issues onto positions in `lines` (the currently-open document whose repo-relative path is `sourcePath`). Catalog-strategy issues (which carry an `id`) are placed on their `:::kiritan{#<id>}` line; other issues for this file are placed on line 0, since there's no more specific spot without a real per-locale-block position.
 * @param {string[]} lines
 * @param {{ kind: string, source: string, locale: string, detail: string, id?: string }[]} issues
 * @param {string} sourcePath
 */
function mapCheckIssuesToPositions(lines, issues, sourcePath) {
  const results = [];
  for (const issue of issues) {
    if (issue.source !== sourcePath) continue;

    if (issue.id) {
      const at = findIdLine(lines, issue.id);
      if (!at) continue;
      results.push({ ...at, issue });
      continue;
    }

    results.push({
      line: 0,
      startChar: 0,
      endChar: lines[0]?.length ?? 0,
      issue,
    });
  }
  return results;
}

module.exports = { findUndefinedVariables, mapCheckIssuesToPositions };
