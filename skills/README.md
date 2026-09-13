# Kiritan Agent Skill

Instructions for AI coding agents — not an npm package, not something Kiritan itself loads. `skills/kiritan/SKILL.md` teaches an agent how to work correctly inside a project that already uses Kiritan: editing `*.base.md` sources instead of generated output, the `:::kiritan{...}` directive syntax, which CLI command to reach for, and common mistakes to avoid.

It's plain Markdown with YAML frontmatter (a `name` and `description`) and no agent-specific instructions in the body, so it isn't tied to any one product — any agent that can be pointed at extra context or instructions can use it.

## Installing

The one approach that always works, regardless of agent: **paste or include `skills/kiritan/SKILL.md`'s content into whatever your agent reads as project context** — a system prompt, a "custom instructions" field, or a repo-level instructions file.

A few ecosystems have their own convention for this kind of file, so a specific project may prefer one of these instead:

- **Claude Code**: copy the whole `skills/kiritan/` directory into `.claude/skills/kiritan/` (project-level) or `~/.claude/skills/kiritan/` (user-level):

  ```sh
  cp -r skills/kiritan /path/to/your-project/.claude/skills/kiritan
  ```

  Claude Code loads a skill's `SKILL.md` automatically based on its `description` frontmatter — no further configuration needed.

- **`AGENTS.md`-based agents** (an increasingly common open convention several tools read automatically): append `skills/kiritan/SKILL.md`'s body to your project's `AGENTS.md`, or add a line pointing at it (e.g. `See skills/kiritan/SKILL.md for Kiritan usage.`).

- **Anything with a project-level rules/instructions file** (Cursor, Windsurf, and similar each have their own — check that tool's docs for the exact filename/location): copy or reference `skills/kiritan/SKILL.md`'s content the same way you would any other project rule.

If your agent doesn't fit any of the above, it very likely still has *some* mechanism for extra context — that's the one to use.
