#!/usr/bin/env node
import { hideBin } from "yargs/helpers";
import { createCli, resolveCliLanguage } from "./cli/index.js";

// Not a top-level `await` — the unused `dist/cli.cjs` stub (see tsdown.config.ts) still has to build, and top-level await isn't valid CJS.
void (async () => {
  const argv = hideBin(process.argv);
  const lang = resolveCliLanguage(argv, process.env);
  await createCli(lang).parseAsync(argv);
})();
