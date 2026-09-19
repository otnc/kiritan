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
| `kiritan init` | 新規プロジェクトで `.kiritanconfig`・`base/README.base.md`・`local.kiritanconfig` の `.gitignore` への追記を生成する。`--force` を付けない限り既存ファイルはそのまま残す |
| `kiritan build` | 設定済みの全ソースからローカライズされたドキュメントをビルドする |
| `kiritan check` | missing/stale/機械翻訳のコンテンツを報告する。`check.failOn` に一致すればCIで非ゼロ終了する |
| `kiritan verify` | 生成済みの全ドキュメントが、今`build`を実行した場合の出力と(ハッシュで)一致するかを、何も書き込まずに確認する。不一致やファイルの欠落があればCIで非ゼロ終了する。古くなった、または手で編集された生成ドキュメントを検出できる |
| `kiritan translate` | `translate.middlewares` でmissing/staleな訳文を埋める。`translate.auto` が `true` のときだけ動き、そうでなければ何も実行されなかったと報告する(`sidecar`/`catalog`対応。`inline`は未対応) |
| `kiritan extract` | `catalog`戦略の新規idをスキャフォールドし、オーファンを報告する |
| `kiritan typegen` | `runtime.sources` を1つの名前空間付き `ResourceModule` に集約し、型定義を書き出す([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 9.6章) |

`kiritan init` 以外のコマンドはすべて `--mode <mode>` と `--config <path>` を受け付け、適用する設定レイヤーを調整できる — `init` 実行前はまだ重ねる設定自体が無い。`build`/`check`/`translate`/`extract` は `--locale <locale>` にも対応し、実行対象を `locales.list` 全体ではなく1ロケールに絞れる。`kiritan typegen` だけは対応しない — 常に全ロケールを1つのランタイムモジュールに集約するコマンドのため。

すべてのコマンドは `--lang <en|ja>` にも対応しており、CLI自身の表示言語(コマンド/オプションの説明文、`--help`出力、CLI自身が出すプレーンテキストの出力行 — `--json`は機械可読のまま変わらない)を選べる。どの*ドキュメント*ロケールに対して実行するかを選ぶ`--locale`とは無関係。`--lang`を指定しない場合は`KIRITAN_LANG`/`LC_ALL`/`LC_MESSAGES`/`LANG`環境変数、最後に`en`にフォールバックする。

## 動作環境

- Node.js >= 22.7

## 関連パッケージ

| パッケージ(npm) | GitHub | 内容 |
| --- | --- | --- |
| [`@kiritan/runtime`](https://www.npmjs.com/package/@kiritan/runtime) | [packages/runtime](https://github.com/otnc/kiritan/tree/main/packages/runtime) | ビルド時依存を持たない、最小限の `t(key, params)` ランタイム |
| [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) | [packages/middleware](https://github.com/otnc/kiritan/tree/main/packages/middleware) | 任意の翻訳関数を `translate.middlewares` の要素にする: コード/URL/`%{name}` の保護、分割、まとめ送信、再試行、キャッシュ |
| [`@kiritan/free-translate`](https://www.npmjs.com/package/@kiritan/free-translate) | [packages/free-translate](https://github.com/otnc/kiritan/tree/main/packages/free-translate) | APIキー不要のミドルウェア(MyMemory、Googleのキーレスエンドポイント、自前ホストのLibreTranslateとGoogle Apps Script) |
| [`@kiritan/deepl`](https://www.npmjs.com/package/@kiritan/deepl) | [packages/deepl](https://github.com/otnc/kiritan/tree/main/packages/deepl) | DeepLのミドルウェア |
| [`@kiritan/google-translate`](https://www.npmjs.com/package/@kiritan/google-translate) | [packages/google-translate](https://github.com/otnc/kiritan/tree/main/packages/google-translate) | Google Cloud Translationのミドルウェア |

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。

> [!Note]
>
> `assets/` 配下の画像ファイル(`.png` / `.gal`)は WTFPL の対象外です。本ライブラリの紹介(ブログ記事など)といった用途には使用できますが、アプリケーションのロゴ/アイコンとして使ったり、他の製品に組み込んだりすることはできません。詳細は [ASSETS\_LICENSE.md](https://github.com/otnc/kiritan/blob/main/ASSETS_LICENSE.md) を参照してください。
