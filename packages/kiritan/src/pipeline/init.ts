import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface InitOptions {
  cwd?: string;
  /** Overwrite files that already exist instead of leaving them alone. Default: false. */
  force?: boolean;
}

export interface InitResult {
  created: string[];
  skipped: string[];
}

const KIRITANCONFIG_TEMPLATE = `import { defineConfig } from "kiritan";

export default defineConfig({
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "inline" }],
  naming: { template: "{base}.{locale}.{ext}" }, // README.md (default locale) / README.ja.md, written at the project root rather than alongside base/README.base.md
  runtime: {
    sources: [{ glob: "src/**/*.i18n.{js,ts,json}", strategy: "colocated" }],
  },
});
`;

const README_BASE_TEMPLATE = `# My Project

:::kiritan{locale=en}
Describe your project here.
:::
:::kiritan{locale=ja}
ここにプロジェクトの説明を書いてください。
:::
`;

const GITIGNORE_ENTRY = "local.kiritanconfig";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function scaffoldFile(
  path: string,
  content: string,
  force: boolean,
  relativePath: string,
  result: InitResult
): Promise<void> {
  if (!force && (await exists(path))) {
    result.skipped.push(relativePath);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  result.created.push(relativePath);
}

async function ensureGitignoreEntry(
  path: string,
  result: InitResult
): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => undefined);
  if (existing === undefined) {
    await writeFile(path, `${GITIGNORE_ENTRY}\n`, "utf8");
    result.created.push(".gitignore");
    return;
  }
  if (existing.split(/\r?\n/).includes(GITIGNORE_ENTRY)) {
    result.skipped.push(".gitignore");
    return;
  }
  const separator = existing.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${existing}${separator}${GITIGNORE_ENTRY}\n`, "utf8");
  result.created.push(".gitignore");
}

/**
 * `kiritan init` (docs/DESIGN.md chapter 10): scaffolds a fresh project's `.kiritanconfig`, `base/README.base.md`, and a `.gitignore` entry for `local.kiritanconfig`.
 * Every file is left untouched if it already exists, unless `force` is set — this is meant to be safe to run again (e.g. to pick up a newly added scaffold) without clobbering real content.
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const force = options.force ?? false;
  const result: InitResult = { created: [], skipped: [] };

  await scaffoldFile(
    join(cwd, ".kiritanconfig"),
    KIRITANCONFIG_TEMPLATE,
    force,
    ".kiritanconfig",
    result
  );
  await scaffoldFile(
    join(cwd, "base", "README.base.md"),
    README_BASE_TEMPLATE,
    force,
    "base/README.base.md",
    result
  );
  await ensureGitignoreEntry(join(cwd, ".gitignore"), result);

  return result;
}
