# Kiritan Agent Skill

Instructions for AI coding agents — not an npm package, not something Kiritan itself loads. `skills/kiritan/SKILL.md` teaches an agent how to work correctly inside a project that already uses Kiritan: editing `*.base.md` sources instead of generated output, the `:::kiritan{...}` directive syntax, which CLI command to reach for, and common mistakes to avoid. Per-topic detail — the `catalog`/`sidecar` strategies, runtime i18n, config and interpolation — lives in `skills/kiritan/references/` files the agent reads only when a task calls for them, keeping what loads on every activation small.

It's plain Markdown with YAML frontmatter (a `name` and `description`, plus the optional `license`/`compatibility` fields) following the [Agent Skills](https://agentskills.io/specification) specification, and no agent-specific instructions in the body, so it isn't tied to any one product — any agent built around that convention, or that can simply be pointed at extra context, can use it.

## Installing

The recommended way is the [Skills CLI](https://github.com/vercel-labs/skills) (`npx skills`), which fetches the skill straight from this repository and installs it for whichever agent(s) you use, with no cloning or manual copying:

```sh
npx skills add otnc/kiritan --skill kiritan
```

Add `-a <agent>` (e.g. `-a claude-code`, `-a cursor`) to target a specific agent instead of being prompted, `-y` for a non-interactive install in CI, or `-g` to install it for your user as a whole (every project you open) instead of just the current repository. See the [Skills CLI documentation](https://github.com/vercel-labs/skills) for the full list of supported agents and flags.

To see what's available without installing anything:

```sh
npx skills add otnc/kiritan --list
```

Once installed, the same CLI manages it:

```sh
npx skills update kiritan   # pull the latest version
npx skills remove kiritan   # remove it
```

If your agent isn't one the CLI supports, or you'd rather not add the dependency, either of these works just as well:

- **Paste it in directly**: copy `skills/kiritan/SKILL.md`'s content into whatever your agent reads as project context — a system prompt, a "custom instructions" field, or a repo-level instructions file.
- **A project-level rules/instructions file** (`AGENTS.md`, or a tool-specific one like Cursor's or Windsurf's): append the file's body, or add a line pointing at it, e.g. `See skills/kiritan/SKILL.md for Kiritan usage.`
