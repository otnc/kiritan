<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/deepl

[English](README.md) | **日本語**

</div>

> [Kiritan](https://www.npmjs.com/package/kiritan) 用の [DeepL](https://www.deepl.com/) 翻訳ミドルウェア。`translate.middlewares` に差し込むと、`kiritan translate` が未翻訳・staleな翻訳を埋める。

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fdeepl)](https://www.npmjs.com/package/@kiritan/deepl)

## インストール

```sh
npm install --save-dev @kiritan/deepl
```

## 使い方

```js
// .kiritanconfig
import { deepl } from "@kiritan/deepl";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: {
    auto: true,
    middlewares: [deepl({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

`sidecar` では、ドキュメント全体が1つのテキストとしてDeepLに送られ、翻訳結果がsidecarファイルになる。`catalog` では、ベースファイル内の `:::kiritan{#id}` ブロックごとに個別に翻訳される — ベースファイルにこのブロックが無ければ、翻訳するものが何も無い。

`catalog` のidが多い場合は、`deepl` の代わりに `deeplBatch` を使うと、1リクエストに多数のセグメント(DeepLの上限である50件・128 KiBまで)をまとめて送れるため、ずっと速い:

```js
import { deeplBatch } from "@kiritan/deepl";

export default {
  // ...
  translate: {
    auto: true,
    middlewares: [deeplBatch({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

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

- `%{name}` のプレースホルダーは変更されずに戻る: DeepLが無視するよう指示したタグ(`tag_handling: xml`)で包み、残りのテキストは送信時にXMLエスケープ、受信時にアンエスケープする。
- それ以外のテキストはそのまま送られるため、セグメント内のMarkdown構文(リンク・強調・コード)の扱いはDeepL自身に任される。公開前に機械翻訳をレビューすること — この方法で書き込まれた `catalog` のエントリは、レビューするまで `kiritan check` が `machine` として報告する。
- 失敗したリクエストは再試行(`retry` 参照)され、それでも失敗すれば例外を投げ、`kiritan translate` はDeepL自身のメッセージ(無効なキー、使い切ったクォータ等)とともに停止する。

## 動作環境

- Node.js >= 22.7(HTTP通信は [ofetch](https://github.com/unjs/ofetch) 経由)

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
