// Validates skills/kiritan against the Agent Skills specification
// (https://agentskills.io/specification): frontmatter constraints, body size,
// and that every relative link from SKILL.md resolves inside the skill.
// Run from anywhere: `node skills/validate.mjs` (CI runs it in ci.yml).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), "kiritan");
const raw = readFileSync(resolve(skillDir, "SKILL.md"), "utf8");

const errors = [];
const fail = (message) => errors.push(message);

const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
if (!match) {
  fail(
    "SKILL.md must start with a YAML frontmatter block delimited by --- lines"
  );
} else {
  const [, frontmatter, body] = match;
  const field = (name) => {
    const found = frontmatter.match(new RegExp(`^${name}: (.*)$`, "m"));
    return found ? found[1].trim() : undefined;
  };

  const name = field("name");
  if (name === undefined) {
    fail("frontmatter: required field `name` is missing");
  } else {
    if (name !== "kiritan") {
      fail(
        `frontmatter: name "${name}" must match the skill directory name "kiritan"`
      );
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      fail(
        `frontmatter: name "${name}" must be 1-64 chars of lowercase alphanumerics and single hyphens`
      );
    }
  }

  const description = field("description");
  if (description === undefined) {
    fail("frontmatter: required field `description` is missing");
  } else if (description.length < 1 || description.length > 1024) {
    fail(
      `frontmatter: description must be 1-1024 characters, got ${description.length}`
    );
  }

  const compatibility = field("compatibility");
  if (compatibility !== undefined && compatibility.length > 500) {
    fail(
      `frontmatter: compatibility must be at most 500 characters, got ${compatibility.length}`
    );
  }

  const bodyLines = body.split("\n").length;
  if (bodyLines > 500) {
    fail(`SKILL.md body must be under 500 lines, got ${bodyLines}`);
  }

  for (const link of body.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const [, label, target] = link;
    // Skip real URLs, and placeholder targets like the `...` in the
    // language-switcher example (`**English** | [日本語](...)`).
    if (/^[a-z]+:/i.test(target) || target === "..." || target.startsWith("#"))
      continue;
    if (!existsSync(resolve(skillDir, target))) {
      fail(`broken link "${label}" -> ${target}`);
    }
  }
}

if (errors.length > 0) {
  console.error(`skills/kiritan: ${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  "skills/kiritan: valid (frontmatter, body size, and reference links all check out)"
);
