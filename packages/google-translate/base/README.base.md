<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/google-translate

</div>

:::kiritan{locale=en}
> A [Google Cloud Translation](https://cloud.google.com/translate) middleware for [Kiritan](https://www.npmjs.com/package/kiritan). Plug it into `translate.middlewares` to have `kiritan translate` fill in missing and stale translations.
:::
:::kiritan{locale=ja}
> [Kiritan](https://www.npmjs.com/package/kiritan) 用の [Google Cloud Translation](https://cloud.google.com/translate) ミドルウェア。`translate.middlewares` に差し込むと、`kiritan translate` が未翻訳・staleな翻訳を埋める。
:::

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fgoogle-translate)](https://www.npmjs.com/package/@kiritan/google-translate)

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

```sh
npm install --save-dev @kiritan/google-translate
```

:::kiritan{locale=en}
## Usage
:::
:::kiritan{locale=ja}
## 使い方
:::

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

:::kiritan{locale=en}
With `sidecar`, the whole document goes to Google as one text and comes back as the translated sidecar file. With `catalog`, each `:::kiritan{#id}` block in the base file is translated separately — the base file needs those blocks, or there is nothing to translate.
:::
:::kiritan{locale=ja}
`sidecar` では、ドキュメント全体が1つのテキストとしてGoogleに送られ、翻訳結果がsidecarファイルになる。`catalog` では、ベースファイル内の `:::kiritan{#id}` ブロックごとに個別に翻訳される — ベースファイルにこのブロックが無ければ、翻訳するものが何も無い。
:::

:::kiritan{locale=en}
Use `googleTranslateBatch` instead of `googleTranslate` to send many segments per request (up to 128 strings or 30k code points), which is much faster for a `catalog` source with lots of ids:
:::
:::kiritan{locale=ja}
`catalog` のidが多い場合は、`googleTranslate` の代わりに `googleTranslateBatch` を使うと、1リクエストに多数のセグメント(128件または3万コードポイントまで)をまとめて送れるため、ずっと速い:
:::

```js
import { googleTranslateBatch } from "@kiritan/google-translate";

export default {
  // ...
  translate: {
    middlewares: [googleTranslateBatch({ apiKey: process.env.GOOGLE_API_KEY })],
  },
};
```

:::kiritan{locale=en}
### Options

| Option          | Description                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apiKey`        | A Google Cloud API key with the Cloud Translation API enabled (required).                                        |
| `baseUrl`       | Overrides the endpoint.                                                                                          |
| `languageCodes` | Per-locale overrides of the language code sent as `source`/`target`, e.g. `{ zh: "zh-CN" }`. Others go as-is.    |
| `extraParams`   | Extra fields merged into the request body, e.g. `{ model: "nmt" }`.                                              |
| `retry` | How many times to retry a failed request (network errors, 408/409/425/429/5xx). Default: 2. |
| `retryDelay` | Delay between retries, in ms. Default: 500. |
| `timeout` | Per-request timeout, in ms. Default: 30000. |
| `fetch`         | A custom `fetch`, for testing or a proxy.                                                                        |

### Behavior

- This uses the Basic (v2) API. Everything that must stay verbatim comes back untouched: code blocks, inline code, URLs, link destinations, HTML, front matter, `:::kiritan{...}` lines and `%{name}`. They are swapped for tokens before the text leaves your machine, wrapped in a `<span translate="no">` (the text is sent as `format: "html"`) so Google leaves them alone, and put back afterwards — and if Google drops one, the run fails instead of writing a translation that lost a link or a code span. (Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so it also accepts its `concurrency`, `minInterval`, `cache`, `protect`, `onError` and `onSkip` options.)
- A text over Google's 30k code points (say a whole README for a `sidecar` translation) is split at paragraph boundaries and joined back with the original spacing. The wording around protected spans is up to Google, so review machine translations before publishing them — `kiritan check` flags `catalog` entries written this way as `machine` until you do.
- A failed request is retried (see `retry`) and then throws, and `kiritan translate` stops with Google's own message (an invalid key, an exhausted quota, ...).
:::
:::kiritan{locale=ja}
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
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22.7 (HTTP goes through [ofetch](https://github.com/unjs/ofetch), its only dependency of note)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22.7(HTTP通信は [ofetch](https://github.com/unjs/ofetch) 経由)

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
