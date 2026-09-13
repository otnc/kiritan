<div align=center>

![kiritan-logo](./assets/kiritan-logo.png)

# Kiritan

</div>

:::kiritan{locale=en}
> In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents
:::

:::kiritan{locale=ja}
> 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ
:::

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![CI](https://github.com/otnc/kiritan/actions/workflows/ci.yml/badge.svg)](https://github.com/otnc/kiritan/actions/workflows/ci.yml) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

:::kiritan{locale=en}
This is an npm workspaces monorepo. The full design lives in [docs/DESIGN.md](./docs/DESIGN.md) — read it before making a structural change.

## Packages

| Package | Path | What it is |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | The CLI + build pipeline: config, translation stores, renderers, translate middlewares |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | The minimal `t(key, params)` runtime, with no build-time dependencies |
:::

:::kiritan{locale=ja}
これは npm workspaces によるモノレポです。設計の全体像は [docs/DESIGN.md](./docs/DESIGN.md) にまとまっています。構造を変更する前に読んでください。

## パッケージ

| パッケージ | パス | 内容 |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | CLI とビルドパイプライン(設定・翻訳ストア・レンダラー・翻訳ミドルウェア) |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | ビルド時依存を持たない、最小限の `t(key, params)` ランタイム |
:::

:::kiritan{locale=en}
> [!Warning]
>   
> kiritan is early and under active development (pre-1.0). `kiritan build` currently supports the `sidecar`, `inline`, and `catalog` strategies; `extract`, `translate`, `check`, and `typegen` aren't implemented yet — see each package's README for what actually works today.
:::
:::kiritan{locale=ja}
> [!Warning]
>   
> kiritan はまだ開発初期段階です(pre-1.0)。`kiritan build` は `sidecar` / `inline` / `catalog` 戦略に対応していますが、`extract` / `translate` / `check` / `typegen` はまだ未実装です。実際に使える機能は各パッケージの README を参照してください。
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22
:::

:::kiritan{locale=en}
## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.
:::

:::kiritan{locale=ja}
## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
:::

:::kiritan{locale=en}
## License
:::
:::kiritan{locale=ja}
## ライセンス
:::

:::kiritan{locale=en}
Distributed under the [WTFPL License](./LICENSE).
:::
:::kiritan{locale=ja}
[WTFPL License](./LICENSE) の下で配布されています。
:::

:::kiritan{locale=en}
> [!Note]
>   
> The image files (`.png` / `.gal`) under `assets/` are **not** covered by WTFPL. They may be used for purposes such as introducing this library (e.g. blog posts), but may not be used as an application logo/icon or embedded into any product. See [ASSETS_LICENSE.md](./ASSETS_LICENSE.md) for details.
:::
:::kiritan{locale=ja}
> [!Note]
>   
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS_LICENSE.md](./ASSETS_LICENSE.md) を参照してください。
:::
