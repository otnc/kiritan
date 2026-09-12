<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# kiritan

</div>

> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents / 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

> [!Warning]
>   
> kiritan is early and under active development (pre-1.0). The full design — including translate middlewares and the runtime resource strategies — is written up in [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md). `kiritan build` currently supports the `sidecar`, `inline`, and `catalog` strategies; `extract`, `translate`, `check`, and `typegen` aren't implemented yet.

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
// .kiritan.mjs
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

A language switcher (`**English** | [日本語](README.ja.md)`) is inserted automatically — see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 6.1章.

Programmatic API:

```ts
import { build, resolveConfig } from "kiritan";

const config = await resolveConfig({ mode: "production" });
await build(config);
```

`resolveConfig` discovers and merges the `.kiritan.(base|<mode>|local).(c|m)(js|ts)` cascade for the current directory and fills in the documented defaults. See [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 3章 for the full config shape and cascade rules.

## Requirements

- Node.js >= 22

## Related packages

- [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) — the minimal `t(key, params)` runtime, usable on its own with no build-time dependencies.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).

> [!Note]
>   
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) for details.
