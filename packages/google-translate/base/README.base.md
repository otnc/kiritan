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
  sources: [{ glob: "base/README.base.md", strategy: "catalog" }],
  translate: {
    middlewares: [googleTranslate({ apiKey: process.env.GOOGLE_API_KEY })],
  },
};
```

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
| `fetch`         | A custom `fetch`, for testing or a proxy.                                                                        |

### Behavior

- This uses the Basic (v2) API. `%{name}` placeholders come back unchanged: they're wrapped in `<span translate="no">` and the text is sent as `format: "html"`, so the rest of the text is HTML-escaped on the way in and un-escaped on the way out (Google also escapes characters like `'` on its own, which is decoded too).
- Otherwise the text is sent as-is, so Markdown syntax in a segment (links, emphasis, code) is left to Google's own handling. Review machine translations before publishing them — `kiritan check` flags `catalog` entries written this way as `machine` until you do.
- A non-OK response throws, and `kiritan translate` stops with Google's own message (an invalid key, an exhausted quota, ...).
:::
:::kiritan{locale=ja}
### オプション

| オプション      | 説明                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `apiKey`        | Cloud Translation APIを有効にしたGoogle CloudのAPIキー(必須)。                                              |
| `baseUrl`       | エンドポイントを上書きする。                                                                                |
| `languageCodes` | `source`/`target` として送る言語コードをロケールごとに上書きする。例: `{ zh: "zh-CN" }`。他はそのまま送る。 |
| `extraParams`   | リクエストボディにマージする追加フィールド。例: `{ model: "nmt" }`。                                        |
| `fetch`         | テストやプロキシ用の独自の `fetch`。                                                                        |

### 挙動

- Basic(v2)APIを使う。`%{name}` のプレースホルダーは変更されずに戻る: `<span translate="no">` で包み、テキストを `format: "html"` で送るため、残りのテキストは送信時にHTMLエスケープ、受信時にアンエスケープする(Google自身が `'` のような文字も勝手にエスケープして返すが、それもデコードする)。
- それ以外のテキストはそのまま送られるため、セグメント内のMarkdown構文(リンク・強調・コード)の扱いはGoogle自身に任される。公開前に機械翻訳をレビューすること — この方法で書き込まれた `catalog` のエントリは、レビューするまで `kiritan check` が `machine` として報告する。
- 応答がOKでない場合は例外を投げ、`kiritan translate` はGoogle自身のメッセージ(無効なキー、使い切ったクォータ等)とともに停止する。
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22.7 (uses the global `fetch`)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22.7(グローバルの `fetch` を使用)

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
