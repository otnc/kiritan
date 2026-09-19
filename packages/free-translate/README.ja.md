<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

[English](README.md) | **日本語**

</div>

> **APIキー不要**のKiritan翻訳ミドルウェア集: MyMemory、Googleのキーレスエンドポイント、そして自分で動かすサーバーと通信する2つ、LibreTranslateと自前のGoogle Apps Script。[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、コード・URL・`%{name}` の保護や長い文書の分割は自動で行われる。

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
  translate: { auto: true, middlewares: [myMemory({ email: "you@example.com" })] },
};
```

## 対応状況

| プロバイダー | 種別 | 公式か | キー | 対応言語 | まとめ送信 | 上限(自動で処理される) | 検証 | 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `myMemory()` | ホスト型 | はい(公開されている無料API) | 不要(`email` は任意) | 大半 | 1リクエストに1テキスト | 1リクエスト500バイトのため、長いテキストはバイト単位で分割される。1日あたり、匿名で約5,000文字、`email` 指定で約50,000文字 | 実サービス | 人手の翻訳メモリとMTの混合なので品質にばらつきがある。エラーをHTTP 200で返すが、それも検査している。 |
| `googleFree()` | ホスト型 | **いいえ。** Google自身のChrome辞書拡張機能が使うエンドポイント | 不要 | 約130言語 | 20件・4,000文字まで | 上限の記載なし | 実サービス | Google翻訳の品質。非公式のため、制限されたりブロックされたり(CAPTCHAページがHTTP 429で返る)、予告なく変わったりする可能性があり、Googleの規約に反する場合もある。たまに行うドキュメント生成向けで、頼りにするものには向かない。サポートされたサービスが必要なら、キーを使う `@kiritan/google-translate` を使うこと。未知の言語コードは、黙って通さずエラーになる。 |
| `libreTranslate({ baseUrl })` | セルフホスト | はい(オープンソースのエンジン) | `--api-keys` を有効にしなければ不要 | 多数 | 50件まで | 自分のサーバーの設定次第 | ユニットテストのみ(サーバーが用意できなかった) | 公開のlibretranslate.comは今は有料キーが必要なため、自分で動かすサーバー向け。 |
| `appsScript({ url })` | セルフホスト | 自分のApps Script | 自分で決める共有シークレット | 約130言語(Googleのもの) | 20件・20,000文字まで | 自分のアカウントの `LanguageApp` の日次クォータ。リクエストごとの実行時間の上限 | Apps Scriptのように応答する(302リダイレクト)ローカルのサーバーに対して。実際のデプロイに対しては未検証 | 自分のクォータでのGoogle翻訳の品質。貼り付けるスクリプトは下記。 |

試したが対応**しない**もの:

| サービス | 理由 |
| --- | --- |
| Googleの素の `client=gtx` エンドポイント | 試した環境ではCAPTCHAページが返った。 |
| Lingva(公開インスタンス) | Cloudflareのbotチャレンジの向こう側にある。 |
| Microsoft Edgeの翻訳エンドポイント | 認証エンドポイントが何も返さなかった。 |
| libretranslate.com | 有料のAPIキーが必要。自分でサーバーを動かして `libreTranslate()` を使うこと。 |
| Apertiumの公開サーバー | 作った上で取り除いた: ヨーロッパ系の言語のみで、日本語・中国語・韓国語は非対応。 |

「実サービス」とは、実際のサービスに対してMarkdownのサンプル(front matter、見出し、太字、リスト、引用、表、コードフェンス、エンティティ、`%{name}`)で最初から最後まで実行し、すべてが損なわれずに戻ってきたことを指す。

どのプロバイダーも、[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) と同じ調整オプション(`concurrency`・`minInterval`・`retry`・`cache`・`protect`・`onError`)に加え、`timeout`、`fetch`(独自のトランスポート)、`languageCodes`(サービスへ送る言語コードのロケール別上書き)を受け付ける。各プロバイダーには妥当な上限が組み込まれているため、通常は指定する必要はない。

### セルフホスト: LibreTranslate と自前の Google Apps Script

この2つは自分で動かすサーバーと通信するため、共有クォータが尽きることも、第三者の規約を気にすることもない。

**LibreTranslate。** オープンソースのエンジンを自分のサーバーで動かす(例: `docker run -p 5000:5000 libretranslate/libretranslate`)。`--api-keys` を付けて起動しなければキーは不要。

```js
import { libreTranslate } from "@kiritan/free-translate";

translate: {
  auto: true,
  middlewares: [libreTranslate({ baseUrl: "http://localhost:5000" })],
},
```

**Google Apps Script。** 自分のGoogleアカウントに数行を置くだけで、Google翻訳(Apps Script組み込みの `LanguageApp`)を専用の翻訳APIにできる。APIキーも課金も不要で、クォータはそのアカウントのもの。

1. [script.google.com](https://script.google.com/) でプロジェクトを作り、下のコードを `Code.gs` として貼り付ける。`SECRET` を変更する。
2. **デプロイ → 新しいデプロイ → ウェブアプリ**。**次のユーザーとして実行: 自分**、**アクセスできるユーザー: 全員** に設定し、ウェブアプリのURL(`https://script.google.com/macros/s/.../exec`)をコピーする。
3. 以降にコードを編集したら**新しいバージョン**をデプロイし直す。そうしないとURLは古いコードを返し続ける。

```js
// Code.gs
const SECRET = "change-me"; // Kiritan側の `secret` と一致させる

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return reply({ error: "unauthorized" });
    // `req.q` はテキストの配列、`req.source` / `req.target` はGoogleの言語コード。
    const translations = req.q.map((text) =>
      LanguageApp.translate(text, req.source, req.target)
    );
    return reply({ translations });
  } catch (error) {
    return reply({ error: String(error) });
  }
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}
```

```js
import { appsScript } from "@kiritan/free-translate";

translate: {
  auto: true,
  middlewares: [
    appsScript({
      url: process.env.APPS_SCRIPT_URL,
      secret: process.env.APPS_SCRIPT_SECRET,
    }),
  ],
},
```

- 「アクセスできるユーザー: 全員」は、URLを知った人なら誰でも呼べるという意味で、そのためにスクリプトが `SECRET` を確認している。URLと `SECRET` はリポジトリに含めない(直書きではなく環境変数にする)。
- Googleは `LanguageApp` に日次のクォータを、各リクエストに実行時間の上限を設けているため、このプロバイダーは控えめなバッチ(最大20件)で送る。無料アカウントでは、初回の大量実行が1日で終わらないこともある。Apps Scriptの[クォータ](https://developers.google.com/apps-script/guides/services/quotas)を参照。
- URLがJSONを返さないと報告された場合は、ほぼ確実にデプロイが**全員**に設定されていないか、新しいバージョンを出さずに編集している。
- 他のセルフホストのAPIも、[`createTranslator`](https://www.npmjs.com/package/@kiritan/middleware) で同じように組み込める: リクエストの部分だけを書けば、保護・分割・再試行・キャッシュはついてくる。

### 無料サービスを使いこなす

- キャッシュを永続化すると、再実行してもクォータを消費しない: `myMemory({ cache: createFileCache("node_modules/.cache/kiritan.json") })`(`createFileCache` は `@kiritan/middleware` が公開している)。
- フォールバックを連鎖する: `myMemory({ onError: "skip" })` は失敗したテキストを次のミドルウェアに任せる。例: `[googleFree({ onError: "skip" }), myMemory()]`。
- 公開前にレビューすること。これは機械翻訳であり、この方法で書き込まれた `catalog` のエントリは `kiritan check` が `machine` として報告する。

### 補足

- 非対応の言語は、黙って通さずエラーにする: Googleのエンドポイントは未知のコードに原文をそのまま返すため、`googleFree` は先にコードを検証する。MyMemoryのエラーは、サービス自身のメッセージとともに報告される。
- 保護対象のコードやURLをエンジンが落とした場合は、それを失った翻訳を書き込むのではなく、実行が失敗する。
- `%{name}` とコードはそのまま保たれるが、その*周りの文言*はエンジン任せなので、結果をレビューすること。

## 動作環境

- Node.js >= 22.7

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) を参照してください。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
