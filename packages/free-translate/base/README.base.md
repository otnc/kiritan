<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

</div>

:::kiritan{locale=en}
> Kiritan translate middlewares that need **no API key**: MyMemory, Google's keyless endpoint, and two that talk to a server you run yourself, LibreTranslate and your own Google Apps Script. Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so code, URLs and `%{name}` are protected and long documents are split for you.
:::
:::kiritan{locale=ja}
> **APIキー不要**のKiritan翻訳ミドルウェア集: MyMemory、Googleのキーレスエンドポイント、そして自分で動かすサーバーと通信する2つ、LibreTranslateと自前のGoogle Apps Script。[`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) の上に作られているため、コード・URL・`%{name}` の保護や長い文書の分割は自動で行われる。
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
| `googleFree()` | **No.** The endpoint Google's own Chrome dictionary extension uses | About 130 | Google quality, no stated quota. Unofficial: it can be throttled, blocked (a CAPTCHA page comes back as HTTP 429) or change without notice, and may be against Google's terms. For occasional documentation runs, not for anything you depend on. Use `@kiritan/google-translate` with a key for a supported service. |
| `libreTranslate({ baseUrl })` | Yes, open-source engine | Many | Self-hosted: the public libretranslate.com needs a paid key now. No key for your own server unless you enable `--api-keys`. |
| `appsScript({ url })` | Your own Apps Script | About 130 (Google's) | Self-hosted on your Google account: Google Translate quality, your own quota, a script you paste in (see below). |

Every provider takes the same tuning options as [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) — `concurrency`, `minInterval`, `retry`, `cache`, `protect`, `onError` — plus `timeout`, `fetch` (a custom transport) and `languageCodes` (per-locale overrides of the code sent to the service). Each provider ships sensible limits, so you rarely need them.

### Self-hosted: LibreTranslate and your own Google Apps Script

Two providers talk to a server you run, so there is no shared quota to exhaust and no third party's terms to worry about.

**LibreTranslate.** The open-source engine on your own server (`docker run -p 5000:5000 libretranslate/libretranslate`, for instance). No key is needed unless you start it with `--api-keys`.

```js
import { libreTranslate } from "@kiritan/free-translate";

translate: {
  auto: true,
  middlewares: [libreTranslate({ baseUrl: "http://localhost:5000" })],
},
```

**Google Apps Script.** A few lines in your own Google account turn Google Translate (Apps Script's built-in `LanguageApp`) into a private translation API. It needs no API key or billing, and the quota is your account's.

1. Open [script.google.com](https://script.google.com/), create a project, and paste this in as `Code.gs`. Change `SECRET`.
2. **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then copy the web app URL (`https://script.google.com/macros/s/.../exec`).
3. After any later edit, deploy a **new version**; the URL keeps serving the old code until you do.

```js
// Code.gs
const SECRET = "change-me"; // must match `secret` on the Kiritan side

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.secret !== SECRET) return reply({ error: "unauthorized" });
    // `req.q` is an array of texts; `req.source` / `req.target` are Google language codes.
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

- "Who has access: Anyone" means anyone who learns the URL can call it, which is why the script checks `SECRET`. Keep both out of the repository (an environment variable, not a literal).
- Google applies daily quotas to `LanguageApp` and a runtime limit to each request, so the provider sends modest batches (up to 20 texts) and a large first run may take more than one day on a free account. See Apps Script's [quotas](https://developers.google.com/apps-script/guides/services/quotas).
- If Kiritan reports that the URL didn't return JSON, the deployment is almost always not set to **Anyone**, or was edited without a new version.
- Any other self-hosted API can be plugged in the same way with [`createTranslator`](https://www.npmjs.com/package/@kiritan/middleware): write the request, and protection, splitting, retries and caching come with it.


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
| `googleFree()` | **いいえ。** Google自身のChrome辞書拡張機能が使うエンドポイント | 約130言語 | Google翻訳の品質で、上限の記載もない。非公式のため、制限されたりブロックされたり(CAPTCHAページがHTTP 429で返る)、予告なく変わったりする可能性があり、Googleの規約に反する場合もある。たまに行うドキュメント生成向けで、頼りにするものには向かない。サポートされたサービスが必要なら、キーを使う `@kiritan/google-translate` を使うこと。 |
| `libreTranslate({ baseUrl })` | はい(オープンソースのエンジン) | 多数 | セルフホスト: 公開のlibretranslate.comは今は有料キーが必要。自分のサーバーなら、`--api-keys` を有効にしなければキー不要。 |
| `appsScript({ url })` | 自分のApps Script | 約130言語(Googleのもの) | 自分のGoogleアカウントでのセルフホスト: Google翻訳の品質で、クォータは自分のもの。貼り付けるスクリプトが必要(下記)。 |

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
