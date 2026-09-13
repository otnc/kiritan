<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# kiritan

</div>

:::kiritan{locale=en}
> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents
:::
:::kiritan{locale=ja}
> 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ
:::

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

:::kiritan{locale=en}
> [!Warning]
>   
> kiritan is early and under active development (pre-1.0); the config shape and APIs may still change. The full design is written up in [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md).
:::
:::kiritan{locale=ja}
> [!Warning]
>   
> kiritan はまだ開発初期段階です(pre-1.0)。設定の形や API は今後も変わる可能性があります。詳細な設計は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) にまとまっています。
:::

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

```sh
npm install kiritan
```

:::kiritan{locale=en}
## Usage
:::
:::kiritan{locale=ja}
## 使い方
:::

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

:::kiritan{locale=en}
A language switcher (`**English** | [日本語](README.ja.md)`) is inserted automatically — see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 6.1章.

Programmatic API:
:::
:::kiritan{locale=ja}
言語切り替えリンク(`**English** | [日本語](README.ja.md)`)は自動的に挿入される。詳細は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 6.1章を参照。

プログラムからの利用:
:::

```ts
import { build, resolveConfig } from "kiritan";

const config = await resolveConfig({ mode: "production" });
await build(config);
```

:::kiritan{locale=en}
`resolveConfig` discovers and merges the `.kiritan.(base|<mode>|local).(c|m)(js|ts)` cascade for the current directory and fills in the documented defaults. See [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 3章 for the full config shape and cascade rules.
:::
:::kiritan{locale=ja}
`resolveConfig` はカレントディレクトリの `.kiritan.(base|<mode>|local).(c|m)(js|ts)` カスケードを探索・マージし、ドキュメント化された既定値を補完する。設定の全体像とカスケードのルールは [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 3章を参照。
:::

:::kiritan{locale=en}
## Commands

| Command | What it does |
| --- | --- |
| `kiritan build` | Builds localized documents from every configured source |
| `kiritan check` | Reports missing/stale/machine-translated content; exits non-zero in CI when `check.failOn` matches |
| `kiritan translate` | Fills in missing/stale translations via `translate.middlewares` (`sidecar`/`catalog`; `inline` isn't supported yet) |
| `kiritan extract` | Scaffolds new `catalog`-strategy ids and reports orphaned ones |
| `kiritan typegen` | Merges `runtime.sources` into one namespaced `ResourceModule` and writes its type declaration ([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9.6章) |

All of them accept `--mode <mode>` and `--config <path>` to adjust which config layers are applied.
:::
:::kiritan{locale=ja}
## コマンド

| コマンド | 内容 |
| --- | --- |
| `kiritan build` | 設定済みの全ソースからローカライズされたドキュメントをビルドする |
| `kiritan check` | missing/stale/機械翻訳のコンテンツを報告する。`check.failOn` に一致すればCIで非ゼロ終了する |
| `kiritan translate` | `translate.middlewares` でmissing/staleな訳文を埋める(`sidecar`/`catalog`対応。`inline`は未対応) |
| `kiritan extract` | `catalog`戦略の新規idをスキャフォールドし、オーファンを報告する |
| `kiritan typegen` | `runtime.sources` を1つの名前空間付き `ResourceModule` に集約し、型定義を書き出す([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9.6章) |

いずれのコマンドも `--mode <mode>` と `--config <path>` を受け付け、適用する設定レイヤーを調整できる。
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22

## Related packages

- [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) — the minimal `t(key, params)` runtime, usable on its own with no build-time dependencies.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22

## 関連パッケージ

- [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) — ビルド時依存を持たず単体でも使える、最小限の `t(key, params)` ランタイム。

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::

:::kiritan{locale=en}
> [!Note]
>   
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) for details.
:::
:::kiritan{locale=ja}
> [!Note]
>   
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) を参照してください。
:::
