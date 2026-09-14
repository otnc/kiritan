import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as oniguruma from "vscode-oniguruma";
import type { IGrammar, IOnigLib } from "vscode-textmate";
import { INITIAL, Registry } from "vscode-textmate";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const grammarPath = fileURLToPath(
  new URL("../syntaxes/kiritan-injection.tmLanguage.json", import.meta.url)
);

let onigLib: IOnigLib;

async function createOnigLib(): Promise<IOnigLib> {
  const wasmPath = require.resolve("vscode-oniguruma/release/onig.wasm");
  const wasmBinary = await readFile(wasmPath);
  await oniguruma.loadWASM(wasmBinary.buffer as ArrayBuffer);
  return {
    createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
    createOnigString: (text) => new oniguruma.OnigString(text),
  };
}

async function loadGrammar(): Promise<IGrammar> {
  const registry = new Registry({
    onigLib: Promise.resolve(onigLib),
    loadGrammar: async (scopeName) => {
      if (scopeName !== "markdown.kiritan.injection") return null;
      return JSON.parse(await readFile(grammarPath, "utf8"));
    },
  });
  const grammar = await registry.loadGrammar("markdown.kiritan.injection");
  if (!grammar) throw new Error("failed to load the kiritan injection grammar");
  return grammar;
}

function scopesFor(grammar: IGrammar, line: string): string[][] {
  const { tokens } = grammar.tokenizeLine(line, INITIAL);
  return tokens.map((token) => token.scopes);
}

describe("kiritan-injection.tmLanguage.json", () => {
  let grammar: IGrammar;

  beforeAll(async () => {
    onigLib = await createOnigLib();
    grammar = await loadGrammar();
  });

  it("tags a container directive's opening line", () => {
    const scopes = scopesFor(grammar, ":::kiritan{locale=en}");
    const flat = scopes.flat();
    expect(flat).toContain("entity.name.tag.directive.kiritan");
    expect(flat).toContain("punctuation.definition.directive.begin.kiritan");
    expect(flat).toContain("entity.other.attribute-name.kiritan");
    expect(flat).toContain("string.unquoted.attribute-value.kiritan");
  });

  it("tags a catalog id attribute", () => {
    const scopes = scopesFor(grammar, ":::kiritan{#usage-intro}").flat();
    expect(scopes).toContain("entity.other.attribute-name.id.kiritan");
  });

  it("tags the closing fence", () => {
    const scopes = scopesFor(grammar, ":::").flat();
    expect(scopes).toContain("punctuation.definition.directive.end.kiritan");
  });

  it("tags a leaf switcher directive", () => {
    const scopes = scopesFor(grammar, "::kiritan{switcher}").flat();
    expect(scopes).toContain("entity.name.tag.directive.kiritan");
    expect(scopes).toContain("keyword.other.switcher.kiritan");
  });

  it("does not tag an unrelated directive by another name", () => {
    const scopes = scopesFor(grammar, ":::note").flat();
    expect(scopes).not.toContain("entity.name.tag.directive.kiritan");
  });
});
