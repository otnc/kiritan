import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { init } from "./init.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-init-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

describe("init", () => {
  it("scaffolds .kiritanconfig, base/README.base.md, and .gitignore in a fresh project", async () => {
    const result = await init({ cwd });
    expect(result.created.sort()).toEqual(
      [".gitignore", ".kiritanconfig", "base/README.base.md"].sort()
    );
    expect(result.skipped).toEqual([]);

    const config = await readFile(join(cwd, ".kiritanconfig"), "utf8");
    expect(config).toContain('import { defineConfig } from "kiritan";');
    expect(config).toContain('locales: { default: "en", list: ["en", "ja"] }');

    const readme = await readFile(join(cwd, "base/README.base.md"), "utf8");
    expect(readme).toContain(":::kiritan{locale=en}");
    expect(readme).toContain(":::kiritan{locale=ja}");

    const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain("local.kiritanconfig");
  });

  it("leaves existing files alone by default", async () => {
    await writeFile(join(cwd, ".kiritanconfig"), "export default {};", "utf8");
    const result = await init({ cwd });
    expect(result.skipped).toContain(".kiritanconfig");
    expect(result.created).not.toContain(".kiritanconfig");
    const config = await readFile(join(cwd, ".kiritanconfig"), "utf8");
    expect(config).toBe("export default {};");
  });

  it("overwrites existing files when force is set", async () => {
    await writeFile(join(cwd, ".kiritanconfig"), "export default {};", "utf8");
    const result = await init({ cwd, force: true });
    expect(result.created).toContain(".kiritanconfig");
    const config = await readFile(join(cwd, ".kiritanconfig"), "utf8");
    expect(config).toContain('import { defineConfig } from "kiritan";');
  });

  it("appends the gitignore entry to an existing .gitignore without a trailing newline", async () => {
    await writeFile(join(cwd, ".gitignore"), "node_modules/", "utf8");
    const result = await init({ cwd });
    expect(result.created).toContain(".gitignore");
    const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toBe("node_modules/\nlocal.kiritanconfig\n");
  });

  it("doesn't duplicate the gitignore entry if it's already present", async () => {
    await writeFile(
      join(cwd, ".gitignore"),
      "node_modules/\nlocal.kiritanconfig\n",
      "utf8"
    );
    const result = await init({ cwd });
    expect(result.skipped).toContain(".gitignore");
    const gitignore = await readFile(join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toBe("node_modules/\nlocal.kiritanconfig\n");
  });
});
