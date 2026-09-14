// Folding for :::kiritan{...} containers (docs/DESIGN.md chapter 13). The
// existing TextMate grammar colors every directive fence independently
// without tracking nesting (nesting is left to the author using more colons
// on the outer fence, per remark-directive convention) — folding needs real
// start/end pairing, so folding-core.cjs walks the document with a
// colon-count stack instead. Any directive's fence (kiritan or not) occupies
// the stack, so a kiritan block nested inside another directive still closes
// against the right fence; only spans opened by a `:::kiritan{...}` line
// become folding ranges.
const vscode = require("vscode");
const { computeFoldingRanges } = require("./folding-core.cjs");

/** @param {vscode.TextDocument} document */
function provideFoldingRanges(document) {
  const lines = [];
  for (let i = 0; i < document.lineCount; i++) {
    lines.push(document.lineAt(i).text);
  }

  return computeFoldingRanges(lines).map(
    ({ startLine, endLine }) =>
      new vscode.FoldingRange(
        startLine,
        endLine,
        vscode.FoldingRangeKind.Region
      )
  );
}

module.exports = { provideFoldingRanges };
