<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/google-translate

[English](README.md) | **日本語**

</div>

> [Kiritan](https://www.npmjs.com/package/kiritan) 用の [Google Cloud Translation](https://cloud.google.com/translate) ミドルウェア。`translate.middlewares` に差し込むと、`kiritan translate` が未翻訳・staleな翻訳を埋める。

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fgoogle-translate)](https://www.npmjs.com/package/@kiritan/google-translate)

## インストール

```sh
npm install --save-dev @kiritan/google-translate
```

## 使い方

```js
// .kiritanconfig
import { googleTranslate } from "@kiritan/google-translate";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: {
    middlewares: [googleTranslate({ apiKey: process.env.GOOGLE_API_KEY })],
  },
};
```

`sidecar` では、ドキュメント全体が1つのテキストとしてGoogleに送られ、翻訳結果がsidecarファイルになる。`catalog` では、ベースファイル内の `:::kiritan{#id}` ブロックごとに個別に翻訳される — ベースファイルにこのブロックが無ければ、翻訳するものが何も無い。

`catalog` のidが多い場合は、`googleTranslate` の代わりに `googleTranslateBatch` を使うと、1リクエストに多数のセグメント(128件または3万コードポイントまで)をまとめて送れるため、ずっと速い:

```js
import { googleTranslateBatch } from "@kiritan/google-translate";

export default {
  // ...
  translate: {
    middlewares: [googleTranslateBatch({ apiKey: process.env.GOOGLE_API_KEY })],
  },
};
```

### オプション

| オプション      | 説明                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `apiKey`        | Cloud Translation APIを有効にしたGoogle CloudのAPIキー(必須)。                                              |
| `baseUrl`       | エンドポイントを上書きする。                                                                                |
| `languageCodes` | `source`/`target` として送る言語コードをロケールごとに上書きする。例: `{ zh: "zh-CN" }`。他はそのまま送る。 |
| `extraParams`   | リクエストボディにマージする追加フィールド。例: `{ model: "nmt" }`。                                        |
| `retry` | 失敗したリクエスト(ネットワークエラー、408/409/425/429/5xx)を再試行する回数。既定: 2。 |
| `retryDelay` | 再試行までの待ち時間(ms)。既定: 500。 |
| `timeout` | リクエストごとのタイムアウト(ms)。既定: 30000。 |
| `fetch`         | テストやプロキシ用の独自の `fetch`。                                                                        |

### 挙動

- Basic(v2)APIを使う。そのまま保つべきものはすべて変更されずに戻る: コードブロック、インラインコード、URL、リンク先、HTML、front matter、`:::kiritan{...}` の行、`%{name}`。これらはテキストが手元を離れる前にトークンに置き換えられ、Googleが触らないよう`<span translate="no">`(テキストは `format: "html"` で送る)で包まれ、後で元に戻される。Googleがそのどれかを落とした場合は、リンクやコードが欠けた翻訳を書き込むのではなく実行が失敗する。([`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、`concurrency`・`minInterval`・`cache`・`protect`・`onError`・`onSkip` の各オプションも受け付ける。)
- Googleの3万コードポイントを超えるテキスト(たとえば `sidecar` 翻訳で送るREADME全体)は、段落の境界で分割し、元の間隔のまま結合し直す。保護した部分の周りの文言はGoogle任せなので、公開前に機械翻訳をレビューすること — この方法で書き込まれた `catalog` のエントリは、レビューするまで `kiritan check` が `machine` として報告する。
- 失敗したリクエストは再試行(`retry` 参照)され、それでも失敗すれば例外を投げ、`kiritan translate` はGoogle自身のメッセージ(無効なキー、使い切ったクォータ等)とともに停止する。

## 動作環境

- Node.js >= 22.7(HTTP通信は [ofetch](https://github.com/unjs/ofetch) 経由)

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
