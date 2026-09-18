# Kiritan Agent Skill

Instructions for AI coding agents — not an npm package, not something Kiritan itself loads. `skills/kiritan/SKILL.md` teaches an agent how to work correctly inside a project that already uses Kiritan: editing `*.base.md` sources instead of generated output, the `:::kiritan{...}` directive syntax, which CLI command to reach for, and common mistakes to avoid.

It's plain Markdown with YAML frontmatter (a `name` and `description`) and no agent-specific instructions in the body, so it isn't tied to any one product — any agent built around the [Agent Skills](https://github.com/vercel-labs/skills) convention, or that can simply be pointed at extra context, can use it.

## Installing

The recommended way is the [Skills CLI](https://github.com/vercel-labs/skills) (`npx skills`), which fetches the skill straight from this repository and installs it for whichever agent(s) you use, with no cloning or manual copying:

```sh
npx skills add otnc/kiritan --skill kiritan
```

Add `-a <agent>` (e.g. `-a claude-code`, `-a cursor`) to target a specific agent instead of being prompted, or `-y` for a non-interactive install in CI. See the [Skills CLI documentation](https://github.com/vercel-labs/skills) for the full list of supported agents and flags.

If your agent isn't one the CLI supports, or you'd rather not add the dependency, either of these works just as well:

- **Paste it in directly**: copy `skills/kiritan/SKILL.md`'s content into whatever your agent reads as project context — a system prompt, a "custom instructions" field, or a repo-level instructions file.
- **A project-level rules/instructions file** (`AGENTS.md`, or a tool-specific one like Cursor's or Windsurf's): append the file's body, or add a line pointing at it, e.g. `See skills/kiritan/SKILL.md for Kiritan usage.`
