<div align=center>

![kiritan-logo](./assets/kiritan-logo.png)

# Kiritan

[English](README.md) | **日本語**

</div>

> 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![CI](https://github.com/otnc/kiritan/actions/workflows/ci.yml/badge.svg)](https://github.com/otnc/kiritan/actions/workflows/ci.yml) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

これは npm workspaces によるモノレポです。設計の全体像は [docs/DESIGN.md](./docs/DESIGN.md) にまとまっています。構造を変更する前に読んでください。

## パッケージ

| パッケージ | パス | 内容 |
| --- | --- | --- |
| [`kiritan`](./packages/kiritan) | `packages/kiritan` | CLI とビルドパイプライン(設定・翻訳ストア・レンダラー・翻訳ミドルウェア) |
| [`@kiritan/runtime`](./packages/runtime) | `packages/runtime` | ビルド時依存を持たない、最小限の `t(key, params)` ランタイム |

## 関連ツール

- [`otoneko1102.kiritan`](./extensions/vscode) — VS Code拡張機能: `:::kiritan{...}` ディレクティブブロックのシンタックスハイライト。npmパッケージではないため `packages/` ではなく `extensions/` 配下にあります。
- [`extensions/vim`](./extensions/vim) — 同じディレクティブハイライトに加え、`*.kiritanconfig` のfiletype判定をカバーするVim/Neovimプラグイン。
- [`skills/kiritan`](./skills/kiritan) — Kiritanプロジェクト内での作業のしかた(`*.base.md` ソースの編集、ディレクティブ記法、どのCLIコマンドを使うべきか)をAIコーディングエージェントに教える [Agent Skill](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)。npmパッケージではありません。導入方法は [skills/README.md](./skills/README.md) を参照。

> [!Warning]
>
> Kiritan はまだ開発初期段階です(pre-1.0)。設定の形や API は今後も変わる可能性があります。`build` / `check` / `translate` / `extract` / `typegen` はすべて実装済みです。使い方は各パッケージの README を、今後の展望は [docs/DESIGN.md](./docs/DESIGN.md) 13章を参照してください。

## 動作環境

- Node.js >= 22

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](./LICENSE) の下で配布されています。

> [!Note]
>
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS\_LICENSE.md](./ASSETS_LICENSE.md) を参照してください。
