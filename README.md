<div align=center>

![kiritan-logo](./assets/kiritan-logo.png)

# Kiritan

**English** | [日本語](README.ja.md)

</div>

> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

This is an npm workspaces monorepo. The full design lives in [docs/DESIGN.md](./docs/DESIGN.md) — read it before making a structural change.

## Packages

| Package | Path | What it is |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | The CLI + build pipeline: config, translation stores, renderers, translate middlewares |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | The minimal `t(key, params)` runtime, with no build-time dependencies |

> [!Warning]
>
> kiritan is early and under active development (pre-1.0). `kiritan build` currently supports the `sidecar`, `inline`, and `catalog` strategies; `extract`, `translate`, `check`, and `typegen` aren't implemented yet — see each package's README for what actually works today.

## Requirements

- Node.js >= 22

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](./LICENSE).

> [!Note]
>
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS\_LICENSE.md](./ASSETS_LICENSE.md) for details.
