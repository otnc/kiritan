import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pluginDir = toVimPath(fileURLToPath(new URL("..", import.meta.url)));

/** Vim (the MSYS/Cygwin build on Windows included) expects forward slashes in paths given on its command line or inside a sourced script. */
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

/**
 * Runs a Vimscript file headlessly. A real `vim -u NONE` process, the same rigor the VS Code extension's grammar tests use (a real oniguruma/vscode-textmate engine) — not just a regex assertion against the .vim source.
 */
function runVimScript(scriptPath: string): void {
  execFileSync("vim", ["-u", "NONE", "-N", "-es", "-S", toVimPath(scriptPath)]);
}

/** Real Vim/Neovim plugin managers add both a plugin's root and its own after/ subdirectory to 'runtimepath' — after/syntax/<ft>.vim only loads via the second one, since :syntax on's autocommand only ever runs `runtime! syntax/<ft>.vim` (checking every rtp entry's own syntax/ subdir, not a nested after/syntax/), confirmed against vim's own synload.vim source after an initial single-rtp-entry attempt silently loaded nothing. */
function rtpLines(): string[] {
  return [`set rtp+=${pluginDir}`, `set rtp+=${pluginDir}/after`];
}

/** @param positions 1-indexed (line, column) pairs to query */
function highlightGroupsAt(
  sampleContent: string,
  filetype: string,
  positions: [number, number][]
): string[] {
  const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-test-"));
  const samplePath = toVimPath(join(dir, "sample.md"));
  const outPath = toVimPath(join(dir, "out.txt"));
  const scriptPath = join(dir, "check.vim");
  writeFileSync(samplePath, sampleContent, "utf8");

  const echoLines = positions.map(
    ([line, col]) => `echo synIDattr(synID(${line},${col},1),'name') . ";"`
  );

  const script = [
    ...rtpLines(),
    "syntax on",
    `e! ${samplePath}`,
    `set filetype=${filetype}`,
    "redraw",
    `redir! > ${outPath}`,
    ...echoLines,
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

describe.skipIf(!hasVim())("after/syntax/markdown.vim", () => {
  const sample = [
    ":::kiritan{locale=en}",
    "Hello, %{name}!",
    ":::",
    ":::kiritan{#usage-intro}",
    "Text",
    ":::",
    "::kiritan{switcher}",
    "Use \\%{literal} escaped.",
  ].join("\n");

  it("tags every directive/interpolation form with the right highlight group", () => {
    const groups = highlightGroupsAt(sample, "markdown", [
      [1, 1], // ':::' opening fence
      [1, 5], // 'kiritan' name
      [1, 13], // 'locale=en' attribute
      [2, 8], // %{name}
      [3, 1], // closing ':::'
      [4, 13], // #usage-intro id
      [7, 3], // leaf 'kiritan' name
      [8, 9], // \%{literal} escaped
    ]);
    expect(groups).toEqual([
      "kiritanDirectiveOpen",
      "kiritanDirectiveName",
      "kiritanAttrLocale",
      "kiritanInterpolation",
      "kiritanDirectiveClose",
      "kiritanAttrId",
      "kiritanDirectiveName",
      "kiritanInterpolationEscaped",
    ]);
  });

  it("does not tag an unrelated directive by another name", () => {
    const groups = highlightGroupsAt(":::note\ntext\n:::", "markdown", [
      [1, 1],
    ]);
    expect(groups[0]).not.toBe("kiritanDirectiveOpen");
  });
});

describe.skipIf(!hasVim())("ftdetect/kiritanconfig.vim", () => {
  it("assigns the javascript filetype to *.kiritanconfig", () => {
    const dir = mkdtempSync(join(tmpdir(), "kiritan-vim-ftdetect-"));
    const configPath = toVimPath(join(dir, ".kiritanconfig"));
    const outPath = toVimPath(join(dir, "out.txt"));
    const scriptPath = join(dir, "check.vim");
    writeFileSync(configPath, "export default { a: 1 };\n", "utf8");

    const script = [
      ...rtpLines(),
      "filetype on",
      `e! ${configPath}`,
      `redir! > ${outPath}`,
      "echo &filetype",
      "redir END",
      "qa!",
    ].join("\n");
    writeFileSync(scriptPath, script, "utf8");

    runVimScript(scriptPath);
    expect(readFileSync(outPath, "utf8").trim()).toBe("javascript");
  });
});
