<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/middleware

[English](README.md) | **日本語**

</div>

> 任意の「このテキストを翻訳する」関数を、完全な [Kiritan](https://www.npmjs.com/package/kiritan) 翻訳ミドルウェアにする。プロバイダーを呼ぶ部分だけを書けば、実際の運用に必要な残りはこの層が引き受ける。

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fmiddleware)](https://www.npmjs.com/package/@kiritan/middleware) [![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/otnc/kiritan/ci.yml?branch=main)](https://github.com/otnc/kiritan/actions) [![GitHub](https://img.shields.io/github/license/otnc/kiritan)](https://github.com/otnc/kiritan/blob/main/LICENSE) [![Node](https://img.shields.io/node/v/%40kiritan%2Fmiddleware)](https://www.npmjs.com/package/@kiritan/middleware)

## インストール

```sh
npm install --save-dev @kiritan/middleware
```

## 使い方

```js
// .kiritanconfig
import { createTranslator } from "@kiritan/middleware";

const myProvider = createTranslator({
  name: "my-provider",
  // Only this part is yours: call the provider and return the translated text.
  translate: async (text, { from, to }) => {
    const res = await fetch("https://translate.example/api", {
      method: "POST",
      body: JSON.stringify({ text, from, to }),
    });
    return (await res.json()).translation;
  },
});

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: { auto: true, middlewares: [myProvider] },
};
```

プロバイダーが複数のテキストを1リクエストで翻訳できる場合は、代わりに `translateBatch(texts, { from, to })` を渡す。入力と同じ順序で、入力と同じ件数の結果を返すこと。リクエスト数が大きく減る。

### この層が引き受けること

- **翻訳してはいけないものを守る。** ミドルウェアにはドキュメントが生のMarkdownのまま届くため、この層はそれを([`@lezer/markdown`](https://github.com/lezer-parser/markdown) でGFMも含めて)パースし、本文だけを翻訳する: コードブロックとコードスパン・URLとリンク先・HTML・front matter・`:::kiritan{...}` の行・見出し/リスト/引用の記号・表のパイプ・強調記号・エスケープ・エンティティ・`%{name}` は、プロバイダーに渡す前に `[[0]]` 形式のトークンに置き換え、翻訳後に元へ戻す。Markdownの変化に合わせて保守し続けなければならないパターンの一覧ではなく、何がマークアップかはパーサーが決める。プロバイダーがトークンを落とした場合は、コードやリンクが欠けた翻訳を書き込むのではなく例外を投げる。(トークンの形は実際のエンジンで試して選んだ: `<span translate="no">` を書き換えたり `XPH0X` のような文字列を分断するものがあった。全角の `［［0］］` のようにエンジンが組み直したトークンも認識する。)
- **長いテキストは分割し、短いものはまとめる。** `maxChars` はプロバイダーが1テキストで受け付ける上限で、これを超えるテキスト(たとえば `sidecar` 翻訳で送る README 全体)は段落の境界で分割し、元の間隔のまま結合し直す。`maxBatchSize`/`maxBatchChars` は1回の `translateBatch` に入れる件数の上限。利用者はプロバイダーの上限を宣言するだけでよい。
- **並列数・間隔・再試行。** `concurrency`(既定4)、`minInterval`(リクエスト開始の最小間隔、ms)、`retry`(既定2回、指数バックオフ。対象はネットワークエラーと408/409/425/429/5xxのみ)。
- **キャッシュ。** 同じテキストを二度翻訳しない: 既定ではその実行中だけメモリに保持し、`cache: createFileCache("node_modules/.cache/kiritan-translate.json")` を指定するとファイルに永続化されるため、CIで再実行してもクォータを消費しない。
- **失敗時の扱い。** 既定では失敗すると `kiritan translate` が停止する。`onError: "skip"` にすると、失敗したテキストだけを `translate.middlewares` の次のミドルウェアに任せる(`onSkip` でログを出せる)ため、無料のプロバイダーにフォールバックを連鎖できる。

### オプション

| オプション | 説明 |
| --- | --- |
| `name` | キャッシュキーでプロバイダーを識別する名前(必須)。 |
| `translate` / `translateBatch` | プロバイダーの呼び出し。どちらか一方が必須。 |
| `maxChars` | プロバイダーが1テキストで受け付ける最大文字数。これを超えると分割する。 |
| `maxBatchSize` / `maxBatchChars` | `translateBatch` 1回あたりの上限。既定は50件。 |
| `concurrency` / `minInterval` | 同時リクエスト数(既定4)と、開始間隔の最小値(ms、既定0)。 |
| `retry` | `{ retries, delay, shouldRetry }` または `false`。既定は500msから始めて2回。 |
| `protect` | `false` でそのまま送る。または、パーサーが認識できない*本文中の*記法のための `RegExp` の配列(既定は `[defaultProtectPatterns]`、つまり `%{name}`)。マークアップはどちらでも保護される。 |
| `cache` | `false`、または `{ get, set }` のストア。既定はメモリ。`createFileCache(path)` でJSONに永続化する。 |
| `onError` / `onSkip` | `"throw"`(既定)または `"skip"`、およびスキップしたテキストのコールバック。 |

出力は機械翻訳である。この方法で書き込まれた `catalog` のエントリは、レビューするまで `kiritan check` が `machine` として報告する。

## 動作環境

- Node.js >= 22.7

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
