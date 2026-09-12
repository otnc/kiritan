<div align=center>

![kiritan-logo](./assets/kiritan-logo.png)

# Kiritan

[English](README.md) | **日本語**

</div>

> 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

これは npm workspaces によるモノレポです。設計の全体像は [docs/DESIGN.md](./docs/DESIGN.md) にまとまっています。構造を変更する前に読んでください。

## パッケージ

| パッケージ | パス | 内容 |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | CLI とビルドパイプライン(設定・翻訳ストア・レンダラー・翻訳ミドルウェア) |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | ビルド時依存を持たない、最小限の `t(key, params)` ランタイム |

> [!Warning]
>
> kiritan はまだ開発初期段階です(pre-1.0)。`kiritan build` は `sidecar` / `inline` / `catalog` 戦略に対応していますが、`extract` / `translate` / `check` / `typegen` はまだ未実装です。実際に使える機能は各パッケージの README を参照してください。

## 動作環境

- Node.js >= 22

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](./LICENSE) の下で配布されています。

> [!Note]
>
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS\_LICENSE.md](./ASSETS_LICENSE.md) を参照してください。
