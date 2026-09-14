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

function hasNvim(): boolean {
  try {
    execFileSync("nvim", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `luaExpr` (a Lua expression, evaluated after `require("kiritan.diagnostics")` is bound to `M`) inside a real headless `nvim --clean` process and returns `vim.inspect(...)`'s output, parsed with the given `parse` function. The same rigor the Vimscript tests use — not just asserted against the .lua source.
 */
function evalLua<T>(luaExpr: string, parse: (raw: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "kiritan-nvim-test-"));
  const outPath = toVimPath(join(dir, "out.txt"));
  const scriptPath = join(dir, "check.lua");

  const script = `
vim.opt.runtimepath:append("${pluginDir}")
local M = require("kiritan.diagnostics")
local result = ${luaExpr}
local file = io.open("${outPath}", "w")
file:write(vim.json.encode(result))
file:close()
vim.cmd("qa!")
`;
  writeFileSync(scriptPath, script, "utf8");

  execFileSync("nvim", [
    "--headless",
    "--clean",
    "-u",
    "NONE",
    "-l",
    scriptPath,
  ]);
  return parse(readFileSync(outPath, "utf8"));
}

describe.skipIf(!hasNvim())(
  "kiritan.diagnostics._find_undefined_variables",
  () => {
    it("flags a %{name} not in known_names", () => {
      const result = evalLua<unknown>(
        `M._find_undefined_variables({"Hello, %{name}!"}, {}, nil)`,
        JSON.parse
      );
      expect(result).toEqual([
        { line: 0, start_col: 7, end_col: 14, name: "name" },
      ]);
    });

    it("does not flag a known %{name}", () => {
      const result = evalLua<unknown[]>(
        `M._find_undefined_variables({"Hello, %{name}!"}, {"name"}, nil)`,
        JSON.parse
      );
      expect(result).toEqual([]);
    });

    it("does not flag %{name} inside a fenced code block or inline code span", () => {
      const result = evalLua<unknown[]>(
        `M._find_undefined_variables({"\`\`\`md", "Current version: %{version}", "\`\`\`", "Use \`%{example}\` here, but %{real} is live."}, {}, nil)`,
        JSON.parse
      );
      expect((result as { name: string }[]).map((r) => r.name)).toEqual([
        "real",
      ]);
    });

    it("does not flag an escaped \\%{name}", () => {
      const result = evalLua<unknown[]>(
        `M._find_undefined_variables({"Use \\\\%{name} literally."}, {}, nil)`,
        JSON.parse
      );
      expect(result).toEqual([]);
    });
  }
);

describe.skipIf(!hasNvim())(
  "kiritan.diagnostics._map_check_issues_to_positions",
  () => {
    it("maps a catalog issue to its :::kiritan{#<id>} line", () => {
      const result = evalLua<unknown[]>(
        `M._map_check_issues_to_positions(
        {":::kiritan{#intro}", "Original.", ":::"},
        {{ kind = "missing", source = "README.base.md", locale = "ja", detail = "x", id = "intro" }},
        "README.base.md"
      )`,
        JSON.parse
      );
      expect(result).toEqual([
        {
          line: 0,
          start_col: 12,
          end_col: 17,
          issue: {
            kind: "missing",
            source: "README.base.md",
            locale: "ja",
            detail: "x",
            id: "intro",
          },
        },
      ]);
    });

    it("places a file-level (no id) issue on line 0", () => {
      const result = evalLua<unknown[]>(
        `M._map_check_issues_to_positions(
        {"English content."},
        {{ kind = "missing", source = "README.base.md", locale = "ja", detail = "x" }},
        "README.base.md"
      )`,
        JSON.parse
      );
      expect(result).toEqual([
        {
          line: 0,
          start_col: 0,
          end_col: 16,
          issue: {
            kind: "missing",
            source: "README.base.md",
            locale: "ja",
            detail: "x",
          },
        },
      ]);
    });
  }
);
