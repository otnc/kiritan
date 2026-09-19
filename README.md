<div align=center>

![kiritan-logo](./assets/kiritan-logo.png)

# Kiritan

**English** | [日本語](README.ja.md)

</div>

> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![CI](https://github.com/otnc/kiritan/actions/workflows/ci.yml/badge.svg)](https://github.com/otnc/kiritan/actions/workflows/ci.yml) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

This is an npm workspaces monorepo. The full design lives in [docs/DESIGN.md](./docs/DESIGN.md) — read it before making a structural change.

## Packages

| Package | Path | What it is |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | The CLI + build pipeline: config, translation stores, renderers, translate middlewares |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | The minimal `t(key, params)` runtime, with no build-time dependencies |
| [`@kiritan/deepl`](./packages/deepl) | `packages/deepl` | A [DeepL](https://www.deepl.com/) translate middleware for `translate.middlewares` |
| [`@kiritan/google-translate`](./packages/google-translate) | `packages/google-translate` | A [Google Cloud Translation](https://cloud.google.com/translate) middleware for `translate.middlewares` |
| [`@kiritan/middleware`](./packages/middleware) | `packages/middleware` | Turns any translate function into a middleware: protects code/URLs/`%{name}`, splits, batches, retries, caches |
| [`@kiritan/free-translate`](./packages/free-translate) | `packages/free-translate` | Translate middlewares that need no API key: MyMemory and Google's keyless endpoint |

## Related tooling

- [`otoneko1102.kiritan`](./extensions/vscode) — a VS Code extension: syntax highlighting for `:::kiritan{...}` directive blocks. Lives under `extensions/`, not `packages/`, since it isn't an npm package.
- [`extensions/vim`](./extensions/vim) — a Vim/Neovim plugin covering the same directive highlighting, plus `*.kiritanconfig` filetype detection.
- [`skills/kiritan`](./skills/kiritan) — an [Agent Skill](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) that teaches an AI coding agent how to work inside a Kiritan project (editing `*.base.md` sources, the directive syntax, which CLI command to reach for). Not an npm package — see [skills/README.md](./skills/README.md) for how to install it.

> [!Warning]
>
> Kiritan is early and under active development (pre-1.0); the config shape and APIs may still change. `build`, `check`, `translate`, `extract`, and `typegen` are all implemented — see each package's README for usage, and [docs/DESIGN.md](./docs/DESIGN.md) chapter 13 for what's still on the roadmap.

## Requirements

- Node.js >= 22

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](./LICENSE).

> [!Note]
>
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS\_LICENSE.md](./ASSETS_LICENSE.md) for details.
