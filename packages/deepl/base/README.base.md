<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/deepl

</div>

:::kiritan{locale=en}
> A [DeepL](https://www.deepl.com/) translate middleware for [Kiritan](https://www.npmjs.com/package/kiritan). Plug it into `translate.middlewares` to have `kiritan translate` fill in missing and stale translations.
:::
:::kiritan{locale=ja}
> [Kiritan](https://www.npmjs.com/package/kiritan) 用の [DeepL](https://www.deepl.com/) 翻訳ミドルウェア。`translate.middlewares` に差し込むと、`kiritan translate` が未翻訳・staleな翻訳を埋める。
:::

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fdeepl)](https://www.npmjs.com/package/@kiritan/deepl)

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

```sh
npm install --save-dev @kiritan/deepl
```

:::kiritan{locale=en}
## Usage
:::
:::kiritan{locale=ja}
## 使い方
:::

```js
// .kiritanconfig
import { deepl } from "@kiritan/deepl";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: {
    middlewares: [deepl({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

:::kiritan{locale=en}
With `sidecar`, the whole document goes to DeepL as one text and comes back as the translated sidecar file. With `catalog`, each `:::kiritan{#id}` block in the base file is translated separately — the base file needs those blocks, or there is nothing to translate.
:::
:::kiritan{locale=ja}
`sidecar` では、ドキュメント全体が1つのテキストとしてDeepLに送られ、翻訳結果がsidecarファイルになる。`catalog` では、ベースファイル内の `:::kiritan{#id}` ブロックごとに個別に翻訳される — ベースファイルにこのブロックが無ければ、翻訳するものが何も無い。
:::

:::kiritan{locale=en}
Use `deeplBatch` instead of `deepl` to send many segments per request (up to DeepL's limits of 50 texts / 128 KiB), which is much faster for a `catalog` source with lots of ids:
:::
:::kiritan{locale=ja}
`catalog` のidが多い場合は、`deepl` の代わりに `deeplBatch` を使うと、1リクエストに多数のセグメント(DeepLの上限である50件・128 KiBまで)をまとめて送れるため、ずっと速い:
:::

```js
import { deeplBatch } from "@kiritan/deepl";

export default {
  // ...
  translate: {
    middlewares: [deeplBatch({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

:::kiritan{locale=en}
### Options

| Option            | Description                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apiKey`          | Your DeepL API key (required). A key ending in `:fx` uses the free API, any other the Pro API.                    |
| `baseUrl`         | Overrides the endpoint.                                                                                           |
| `targetLanguages` | Per-locale overrides of the DeepL `target_lang`, e.g. `{ en: "EN-GB" }`. `en` defaults to `EN-US`, `pt` to `PT-BR`. |
| `extraParams`     | Extra fields merged into the request body, e.g. `{ formality: "prefer_less" }`.                                   |
| `retry` | How many times to retry a failed request (network errors, 408/409/425/429/5xx). Default: 2. |
| `retryDelay` | Delay between retries, in ms. Default: 500. |
| `timeout` | Per-request timeout, in ms. Default: 30000. |
| `fetch`           | A custom `fetch`, for testing or a proxy.                                                                         |

### Behavior

- Everything that must stay verbatim comes back untouched: code blocks, inline code, URLs, link destinations, HTML, front matter, `:::kiritan{...}` lines and `%{name}`. They are swapped for tokens before the text leaves your machine, wrapped in a tag DeepL is told to ignore (`tag_handling: xml`) so DeepL leaves them alone, and put back afterwards — and if DeepL drops one, the run fails instead of writing a translation that lost a link or a code span. (Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so it also accepts its `concurrency`, `minInterval`, `cache`, `protect`, `onError` and `onSkip` options.)
- A text over DeepL's 128 KiB (say a whole README for a `sidecar` translation) is split at paragraph boundaries and joined back with the original spacing. The wording around protected spans is up to DeepL, so review machine translations before publishing them — `kiritan check` flags `catalog` entries written this way as `machine` until you do.
- A failed request is retried (see `retry`) and then throws, and `kiritan translate` stops with DeepL's own message (an invalid key, an exhausted quota, ...).
:::
:::kiritan{locale=ja}
### オプション

| オプション        | 説明                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apiKey`          | DeepLのAPIキー(必須)。`:fx` で終わるキーは無料API、それ以外はPro APIを使う。                                        |
| `baseUrl`         | エンドポイントを上書きする。                                                                                        |
| `targetLanguages` | DeepLの `target_lang` をロケールごとに上書きする。例: `{ en: "EN-GB" }`。既定では `en` は `EN-US`、`pt` は `PT-BR`。 |
| `extraParams`     | リクエストボディにマージする追加フィールド。例: `{ formality: "prefer_less" }`。                                    |
| `retry` | 失敗したリクエスト(ネットワークエラー、408/409/425/429/5xx)を再試行する回数。既定: 2。 |
| `retryDelay` | 再試行までの待ち時間(ms)。既定: 500。 |
| `timeout` | リクエストごとのタイムアウト(ms)。既定: 30000。 |
| `fetch`           | テストやプロキシ用の独自の `fetch`。                                                                                |

### 挙動

- そのまま保つべきものはすべて変更されずに戻る: コードブロック、インラインコード、URL、リンク先、HTML、front matter、`:::kiritan{...}` の行、`%{name}`。これらはテキストが手元を離れる前にトークンに置き換えられ、DeepLが触らないよう無視するよう指示したタグ(`tag_handling: xml`)で包まれ、後で元に戻される。DeepLがそのどれかを落とした場合は、リンクやコードが欠けた翻訳を書き込むのではなく実行が失敗する。([`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、`concurrency`・`minInterval`・`cache`・`protect`・`onError`・`onSkip` の各オプションも受け付ける。)
- DeepLの128 KiBを超えるテキスト(たとえば `sidecar` 翻訳で送るREADME全体)は、段落の境界で分割し、元の間隔のまま結合し直す。保護した部分の周りの文言はDeepL任せなので、公開前に機械翻訳をレビューすること — この方法で書き込まれた `catalog` のエントリは、レビューするまで `kiritan check` が `machine` として報告する。
- 失敗したリクエストは再試行(`retry` 参照)され、それでも失敗すれば例外を投げ、`kiritan translate` はDeepL自身のメッセージ(無効なキー、使い切ったクォータ等)とともに停止する。
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
