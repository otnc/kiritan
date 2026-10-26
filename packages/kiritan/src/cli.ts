#!/usr/bin/env node
import { createCli, resolveCliLanguage } from "./cli/index.js";

// Not a top-level `await` — the unused `dist/cli.cjs` stub (see tsdown.config.ts) still has to build, and top-level await isn't valid CJS.
void (async () => {
  const rawArgs = process.argv.slice(2);
  const lang = resolveCliLanguage(rawArgs, process.env);
  try {
    await createCli(lang).run(rawArgs);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
