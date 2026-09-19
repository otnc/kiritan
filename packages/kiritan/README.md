<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# kiritan

**English** | [日本語](README.ja.md)

</div>

> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

> [!Warning]
>
> Kiritan is early and under active development (pre-1.0); the config shape and APIs may still change. The full design is written up in [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md).

## Install

```sh
npm install kiritan
```

## Usage

```md
<!-- README.base.md -->
# Kiritan

:::kiritan{locale=en}
## Usage
English content.
:::

:::kiritan{locale=ja}
## 使い方
日本語のコンテンツ。
:::
```

```ts
// .kiritanconfig
import { defineConfig } from "kiritan";

export default defineConfig({
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "README.base.md", strategy: "inline" }],
  naming: { preset: "dot" }, // README.md (default locale) / README.ja.md
});
```

```sh
npx kiritan build
# wrote README.md
# wrote README.ja.md
```

A language switcher (`**English** | [日本語](README.ja.md)`) is inserted automatically — see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 6.1.

Programmatic API:

```ts
import { build, resolveConfig } from "kiritan";

const config = await resolveConfig({ mode: "production" });
await build(config);
```

`resolveConfig` discovers and merges the `*.kiritanconfig` cascade for the current directory and fills in the documented defaults. See [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 3 for the full config shape and cascade rules.

## Commands

| Command | What it does |
| --- | --- |
| `kiritan init` | Scaffolds `.kiritanconfig`, `base/README.base.md`, and a `.gitignore` entry for `local.kiritanconfig` in a fresh project. Leaves existing files alone unless `--force` is passed |
| `kiritan build` | Builds localized documents from every configured source |
| `kiritan check` | Reports missing/stale/machine-translated content; exits non-zero in CI when `check.failOn` matches |
| `kiritan verify` | Checks that every generated document matches what `build` would write today (by hash), without writing anything; exits non-zero in CI on a mismatch or a missing file. Catches an out-of-date or hand-edited generated doc |
| `kiritan translate` | Fills in missing/stale translations via `translate.middlewares` (`sidecar`/`catalog`; `inline` isn't supported yet) |
| `kiritan extract` | Scaffolds new `catalog`-strategy ids and reports orphaned ones |
| `kiritan typegen` | Merges `runtime.sources` into one namespaced `ResourceModule` and writes its type declaration ([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 9.6) |

Every command except `kiritan init` accepts `--mode <mode>` and `--config <path>` to adjust which config layers are applied — there's no config to layer yet before `init` has run. `build`/`check`/`translate`/`extract` also accept `--locale <locale>` to restrict a run to one locale instead of every locale in `locales.list`; `kiritan typegen` doesn't, since it always aggregates every locale into one runtime module.

Every command also accepts `--lang <en|ja>`, picking the CLI's own display language — command/option descriptions, `--help` output, and the CLI's own plain-text output lines (not `--json`, which stays machine-readable regardless). This is unrelated to `--locale`, which picks which *document* locale a run acts on. Without `--lang`, it falls back to the `KIRITAN_LANG`/`LC_ALL`/`LC_MESSAGES`/`LANG` environment variables, then `en`.

## Requirements

- Node.js >= 22.7

## Related packages

- [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) — the minimal `t(key, params)` runtime, usable on its own with no build-time dependencies.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).

> [!Note]
>
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS\_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) for details.
