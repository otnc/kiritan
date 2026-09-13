# kiritan Agent Skill

An [Agent Skill](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) for AI coding agents — not an npm package, not something kiritan itself loads. It teaches an agent how to work correctly inside a project that already uses kiritan: editing `*.base.md` sources instead of generated output, the `:::kiritan{...}` directive syntax, which CLI command to reach for, and common mistakes to avoid.

## Installing (Claude Code)

Copy `skills/kiritan/` into your own project's `.claude/skills/` (or your user-level `~/.claude/skills/`):

```sh
cp -r skills/kiritan /path/to/your-project/.claude/skills/kiritan
```

Claude Code picks it up automatically for any repo that looks like it uses kiritan (see the skill's own "Recognizing a kiritan project" section) — no further configuration needed.

## Other agents

The skill is a single self-contained Markdown file (`skills/kiritan/SKILL.md`) with no kiritan-specific tooling dependency, so any agent framework that can load a Markdown instruction file into context can use it as-is.
