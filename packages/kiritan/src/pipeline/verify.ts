import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { KiritanConfig } from "../config/types.js";
import { hashText } from "../hash/index.js";
import { renderOutputs } from "./build.js";

export type VerifyStatus = "ok" | "missing" | "mismatch";

export interface VerifyEntry {
  /** The base file the document is generated from, relative to `cwd`. */
  source: string;
  locale: string;
  /** The generated document's path, relative to `cwd`. */
  path: string;
  status: VerifyStatus;
  /** Hash of what `kiritan build` would write today. */
  expectedHash: string;
  /** Hash of what is on disk. Absent when the file is missing. */
  actualHash?: string;
}

export interface VerifyOptions {
  cwd?: string;
  /** Restricts the check to this locale instead of every locale in `config.locales.list`. */
  locale?: string;
}

export interface VerifyResult {
  entries: VerifyEntry[];
  /** Whether any generated document is missing or differs from what `build` would write. */
  failed: boolean;
}

// A checkout with `core.autocrlf` rewrites line endings, which says nothing about whether the content drifted.
const normalize = (text: string) => text.replace(/\r\n/g, "\n");

/**
 * `kiritan verify`: checks that every generated document is exactly what `kiritan build` would write from the current base files and config — i.e. that it's up to date and hasn't been edited by hand. Nothing is written.
 * Each document is compared by hash (`hashText`, over content with line endings normalized), and both hashes are reported so a mismatch can be told apart at a glance in CI output.
 * This is a different question from `kiritan check`, which asks whether *translations* are missing or stale: `verify` is about the build output being in sync, whatever produced it.
 */
export async function verify(
  config: KiritanConfig,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  const cwd = options.cwd ?? process.cwd();
  const outputs = await renderOutputs(config, options);
  const entries: VerifyEntry[] = [];

  for (const output of outputs) {
    const expectedHash = hashText(normalize(output.content));
    let actual: string | undefined;
    try {
      actual = await readFile(join(cwd, output.path), "utf8");
    } catch {
      actual = undefined;
    }

    const entry: VerifyEntry = {
      source: output.source,
      locale: output.locale,
      path: output.path,
      status: "ok",
      expectedHash,
    };
    if (actual === undefined) {
      entry.status = "missing";
    } else {
      entry.actualHash = hashText(normalize(actual));
      if (entry.actualHash !== expectedHash) entry.status = "mismatch";
    }
    entries.push(entry);
  }

  return { entries, failed: entries.some((entry) => entry.status !== "ok") };
}
