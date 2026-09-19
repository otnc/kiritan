<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

[English](README.md) | **日本語**

</div>

> **APIキー不要**のKiritan翻訳ミドルウェア集: MyMemory、Googleのキーレスエンドポイント、Apertium、自前ホストのLibreTranslate。[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、コード・URL・`%{name}` の保護や長い文書の分割は自動で行われる。

[![npm](https://img.shields.io/npm/v/%40kiritan%2Ffree-translate)](https://www.npmjs.com/package/@kiritan/free-translate)

## インストール

```sh
npm install --save-dev @kiritan/free-translate
```

## 使い方

```js
// .kiritanconfig
import { myMemory } from "@kiritan/free-translate";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: { middlewares: [myMemory({ email: "you@example.com" })] },
};
```

## どれを使うか

| プロバイダー | 公式か | 対応言語 | 備考 |
| --- | --- | --- | --- |
| `myMemory()` | はい(公開されている無料API) | 大半 | 匿名で1日約5,000文字、`email` を指定すると約50,000文字。人手の翻訳メモリとMTの混合なので品質にばらつきがある。1リクエスト500バイトまでの制限は自動で処理される。 |
| `googleFree()` | **いいえ。** Google自身のChrome辞書拡張機能が使うエンドポイント | 約130言語 | 4つの中で最も品質が高く、上限の記載もない。非公式のため、制限されたりブロックされたり(CAPTCHAページがHTTP 429で返る)、予告なく変わったりする可能性があり、Googleの規約に反する場合もある。たまに行うドキュメント生成向けで、頼りにするものには向かない。サポートされたサービスが必要なら、キーを使う `@kiritan/google-translate` を使うこと。 |
| `apertium()` | はい(オープンソースの公開サーバー) | ヨーロッパ系とその関連言語のみ | **日本語・中国語・韓国語は非対応。** ルールベースのため出力は直訳的で、スペイン語・カタルーニャ語・ポルトガル語のような近縁の言語に向く。 |
| `libreTranslate({ baseUrl })` | はい(オープンソースのエンジン) | 多数 | 公開のlibretranslate.comは有料キーが必要になったため、自分でホストするサーバー向け(`--api-keys` を有効にしなければキー不要)。 |

どのプロバイダーも、[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) と同じ調整オプション(`concurrency`・`minInterval`・`retry`・`cache`・`protect`・`onError`)に加え、`timeout`、`fetch`(独自のトランスポート)、`languageCodes`(サービスへ送る言語コードのロケール別上書き)を受け付ける。各プロバイダーには妥当な上限が組み込まれているため、通常は指定する必要はない。

### 無料サービスを使いこなす

- キャッシュを永続化すると、再実行してもクォータを消費しない: `myMemory({ cache: createFileCache("node_modules/.cache/kiritan.json") })`(`createFileCache` は `@kiritan/middleware` が公開している)。
- フォールバックを連鎖する: `myMemory({ onError: "skip" })` は失敗したテキストを次のミドルウェアに任せる。例: `[googleFree({ onError: "skip" }), myMemory()]`。
- 公開前にレビューすること。これは機械翻訳であり、この方法で書き込まれた `catalog` のエントリは `kiritan check` が `machine` として報告する。

### 補足

- 非対応の言語は、黙って通さずエラーにする: Googleのエンドポイントは未知のコードに原文をそのまま返すため、`googleFree` は先にコードを検証する。MyMemoryとApertiumのエラーは、サービス自身のメッセージとともに報告される。
- 保護対象のコードやURLをエンジンが落とした場合は、それを失った翻訳を書き込むのではなく、実行が失敗する。
- `%{name}` とコードはそのまま保たれるが、その*周りの文言*はエンジン任せなので、結果をレビューすること。

## 動作環境

- Node.js >= 22.7

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
