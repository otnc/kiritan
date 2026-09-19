<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

</div>

:::kiritan{locale=en}
> Kiritan translate middlewares that need **no API key**: MyMemory and Google's keyless endpoint. Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so code, URLs and `%{name}` are protected and long documents are split for you.
:::
:::kiritan{locale=ja}
> **APIキー不要**のKiritan翻訳ミドルウェア集: MyMemoryとGoogleのキーレスエンドポイント。[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、コード・URL・`%{name}` の保護や長い文書の分割は自動で行われる。
:::

[![npm](https://img.shields.io/npm/v/%40kiritan%2Ffree-translate)](https://www.npmjs.com/package/@kiritan/free-translate)

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

```sh
npm install --save-dev @kiritan/free-translate
```

:::kiritan{locale=en}
## Usage
:::
:::kiritan{locale=ja}
## 使い方
:::

```js
// .kiritanconfig
import { myMemory } from "@kiritan/free-translate";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: { middlewares: [myMemory({ email: "you@example.com" })] },
};
```

:::kiritan{locale=en}
## Which one?

| Provider | Official? | Languages | Notes |
| --- | --- | --- | --- |
| `myMemory()` | Yes, documented free API | Most | About 5,000 characters a day anonymously, about 50,000 with `email`. Mixes human translation memory with MT, so quality varies. Limited to 500 bytes per request, handled for you. |
| `googleFree()` | **No.** The endpoint Google's own Chrome dictionary extension uses | About 130 | Best quality of the four, no stated quota. Unofficial: it can be throttled, blocked (a CAPTCHA page comes back as HTTP 429) or change without notice, and may be against Google's terms. For occasional documentation runs, not for anything you depend on. Use `@kiritan/google-translate` with a key for a supported service. |

Every provider takes the same tuning options as [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) — `concurrency`, `minInterval`, `retry`, `cache`, `protect`, `onError` — plus `timeout`, `fetch` (a custom transport) and `languageCodes` (per-locale overrides of the code sent to the service). Each provider ships sensible limits, so you rarely need them.

### Getting the most from a free service

- Persist a cache so a re-run costs no quota: `myMemory({ cache: createFileCache("node_modules/.cache/kiritan.json") })` (`createFileCache` is exported by `@kiritan/middleware`).
- Chain a fallback: `myMemory({ onError: "skip" })` leaves a failing text to the next middleware, e.g. `[googleFree({ onError: "skip" }), myMemory()]`.
- Review before publishing. This is machine translation, and `kiritan check` flags `catalog` entries written this way as `machine`.

### Notes

- An unsupported language is an error, not silence: Google's endpoint answers an unknown code with the original text, so `googleFree` validates the code first; MyMemory reports errors with the service's own message.
- An engine that drops a protected code span or URL makes the run fail instead of writing a translation that lost it.
- `%{name}` and code stay verbatim, but the *wording around them* is up to the engine, so review the result.
:::
:::kiritan{locale=ja}
## どれを使うか

| プロバイダー | 公式か | 対応言語 | 備考 |
| --- | --- | --- | --- |
| `myMemory()` | はい(公開されている無料API) | 大半 | 匿名で1日約5,000文字、`email` を指定すると約50,000文字。人手の翻訳メモリとMTの混合なので品質にばらつきがある。1リクエスト500バイトまでの制限は自動で処理される。 |
| `googleFree()` | **いいえ。** Google自身のChrome辞書拡張機能が使うエンドポイント | 約130言語 | 4つの中で最も品質が高く、上限の記載もない。非公式のため、制限されたりブロックされたり(CAPTCHAページがHTTP 429で返る)、予告なく変わったりする可能性があり、Googleの規約に反する場合もある。たまに行うドキュメント生成向けで、頼りにするものには向かない。サポートされたサービスが必要なら、キーを使う `@kiritan/google-translate` を使うこと。 |

どのプロバイダーも、[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) と同じ調整オプション(`concurrency`・`minInterval`・`retry`・`cache`・`protect`・`onError`)に加え、`timeout`、`fetch`(独自のトランスポート)、`languageCodes`(サービスへ送る言語コードのロケール別上書き)を受け付ける。各プロバイダーには妥当な上限が組み込まれているため、通常は指定する必要はない。

### 無料サービスを使いこなす

- キャッシュを永続化すると、再実行してもクォータを消費しない: `myMemory({ cache: createFileCache("node_modules/.cache/kiritan.json") })`(`createFileCache` は `@kiritan/middleware` が公開している)。
- フォールバックを連鎖する: `myMemory({ onError: "skip" })` は失敗したテキストを次のミドルウェアに任せる。例: `[googleFree({ onError: "skip" }), myMemory()]`。
- 公開前にレビューすること。これは機械翻訳であり、この方法で書き込まれた `catalog` のエントリは `kiritan check` が `machine` として報告する。

### 補足

- 非対応の言語は、黙って通さずエラーにする: Googleのエンドポイントは未知のコードに原文をそのまま返すため、`googleFree` は先にコードを検証する。MyMemoryのエラーは、サービス自身のメッセージとともに報告される。
- 保護対象のコードやURLをエンジンが落とした場合は、それを失った翻訳を書き込むのではなく、実行が失敗する。
- `%{name}` とコードはそのまま保たれるが、その*周りの文言*はエンジン任せなので、結果をレビューすること。
:::

:::kiritan{locale=en}
## Requirements

- Node.js >= 22.7

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## 動作環境

- Node.js >= 22.7

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
