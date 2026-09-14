import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pluginDir = toVimPath(fileURLToPath(new URL("..", import.meta.url)));

function toVimPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

function hasVim(): boolean {
  try {
    execFileSync("vim", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runVimScript(scriptPath: string): void {
  execFileSync("vim", ["-u", "NONE", "-N", "-es", "-S", toVimPath(scriptPath)]);
}

function rtpLines(): string[] {
  return [`set rtp+=${pluginDir}`, `set rtp+=${pluginDir}/after`];
}

/** Runs a real headless vim, opening `filePath` as `markdown` and printing one `echo` result per line of `vimExprLines` (evaluated with the buffer/cursor state each line leaves behind) to a temp file, then returns those lines. */
function runInMarkdownBuffer(
  filePath: string,
  setupLines: string[],
  echoExprs: string[]
): string[] {
  const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-autoload-"));
  const outPath = toVimPath(join(dir, "out.txt"));
  const scriptPath = join(dir, "check.vim");

  const script = [
    ...rtpLines(),
    "filetype plugin on",
    "syntax on",
    `e! ${toVimPath(filePath)}`,
    "set filetype=markdown",
    "redraw",
    ...setupLines,
    `redir! > ${outPath}`,
    ...echoExprs.map((expr) => `echo ${expr} . ";"`),
    "redir END",
    "qa!",
  ].join("\n");
  writeFileSync(scriptPath, script, "utf8");

  runVimScript(scriptPath);
  return readFileSync(outPath, "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe.skipIf(!hasVim())("kiritan#FoldExpr", () => {
  it("folds a simple sibling pair of kiritan blocks", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-fold-"));
    const filePath = join(dir, "sample.md");
    writeFileSync(
      filePath,
      [
        ":::kiritan{locale=en}",
        "Hello",
        ":::",
        ":::kiritan{locale=ja}",
        "Konnichiwa",
        ":::",
      ].join("\n"),
      "utf8"
    );

    const levels = runInMarkdownBuffer(
      filePath,
      [],
      [1, 2, 3, 4, 5, 6].map((i) => `kiritan#FoldExpr(${i})`)
    );
    expect(levels).toEqual([">1", "1", "<1", ">1", "1", "<1"]);
  });

  it("keeps a nested non-kiritan directive at the same fold depth", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-fold-nested-"));
    const filePath = join(dir, "nested.md");
    writeFileSync(
      filePath,
      [
        "::::kiritan{locale=en}",
        ":::note",
        "aside",
        ":::",
        "Hello",
        "::::",
      ].join("\n"),
      "utf8"
    );

    const levels = runInMarkdownBuffer(
      filePath,
      [],
      [1, 2, 3, 4, 5, 6].map((i) => `kiritan#FoldExpr(${i})`)
    );
    expect(levels).toEqual([">1", "1", "1", "1", "1", "<1"]);
  });

  it("returns 0 for lines outside any kiritan block", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-fold-none-"));
    const filePath = join(dir, "plain.md");
    writeFileSync(filePath, "Just text.\n", "utf8");

    const levels = runInMarkdownBuffer(filePath, [], ["kiritan#FoldExpr(1)"]);
    expect(levels).toEqual(["0"]);
  });
});

describe.skipIf(!hasVim())("kiritan#JumpToCatalog", () => {
  it("jumps to the matching id in the sibling catalog file", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-jump-"));
    const basePath = join(dir, "README.base.md");
    writeFileSync(
      basePath,
      [":::kiritan{#usage-intro}", "Original text.", ":::"].join("\n"),
      "utf8"
    );
    writeFileSync(
      join(dir, "README.ja.catalog.json"),
      JSON.stringify({ "usage-intro": { text: "訳文" } }, null, 2),
      "utf8"
    );

    const [path, line] = runInMarkdownBuffer(
      basePath,
      ["call cursor(1,1)", "call kiritan#JumpToCatalog()"],
      ["expand('%:p')", "line('.')"]
    );
    expect(path).toMatch(/README\.ja\.catalog\.json$/);
    expect(line).toBe("2");
  });

  it("does nothing on a non-catalog line", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-jump-none-"));
    const basePath = join(dir, "README.base.md");
    writeFileSync(basePath, ["Just text."].join("\n"), "utf8");

    const [path] = runInMarkdownBuffer(
      basePath,
      ["call cursor(1,1)", "call kiritan#JumpToCatalog()"],
      ["expand('%:p')"]
    );
    expect(path).toMatch(/README\.base\.md$/);
  });
});
