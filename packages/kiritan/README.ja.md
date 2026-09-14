<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# kiritan

[English](README.md) | **日本語**

</div>

> 通常の範囲に加え、マークダウンやその他平文ドキュメントのための国際化(i18n)ユーティリティ

[![npm](https://img.shields.io/npm/v/kiritan)](https://www.npmjs.com/package/kiritan) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/kiritan)](https://www.npmjs.com/package/kiritan)

> [!Warning]
>
> Kiritan はまだ開発初期段階です(pre-1.0)。設定の形や API は今後も変わる可能性があります。詳細な設計は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) にまとまっています。

## インストール

```sh
npm install kiritan
```

## 使い方

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

言語切り替えリンク(`**English** | [日本語](README.ja.md)`)は自動的に挿入される。詳細は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 6.1章を参照。

プログラムからの利用:

```ts
import { build, resolveConfig } from "kiritan";

const config = await resolveConfig({ mode: "production" });
await build(config);
```

`resolveConfig` はカレントディレクトリの `*.kiritanconfig` カスケードを探索・マージし、ドキュメント化された既定値を補完する。設定の全体像とカスケードのルールは [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 3章を参照。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `kiritan build` | 設定済みの全ソースからローカライズされたドキュメントをビルドする |
| `kiritan check` | missing/stale/機械翻訳のコンテンツを報告する。`check.failOn` に一致すればCIで非ゼロ終了する |
| `kiritan translate` | `translate.middlewares` でmissing/staleな訳文を埋める(`sidecar`/`catalog`対応。`inline`は未対応) |
| `kiritan extract` | `catalog`戦略の新規idをスキャフォールドし、オーファンを報告する |
| `kiritan typegen` | `runtime.sources` を1つの名前空間付き `ResourceModule` に集約し、型定義を書き出す([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9.6章) |

いずれのコマンドも `--mode <mode>` と `--config <path>` を受け付け、適用する設定レイヤーを調整できる。

## 動作環境

- Node.js >= 22.7

## 関連パッケージ

- [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) — ビルド時依存を持たず単体でも使える、最小限の `t(key, params)` ランタイム。

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。

> [!Note]
>
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS\_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) を参照してください。
