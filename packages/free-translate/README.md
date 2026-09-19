<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

**English** | [日本語](README.ja.md)

</div>

> Kiritan translate middlewares that need **no API key**: MyMemory, Google's keyless endpoint, and two that talk to a server you run yourself, LibreTranslate and your own Google Apps Script. Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so code, URLs and `%{name}` are protected and long documents are split for you.

[![npm](https://img.shields.io/npm/v/%40kiritan%2Ffree-translate)](https://www.npmjs.com/package/@kiritan/free-translate)

## Install

```sh
npm install --save-dev @kiritan/free-translate
```

## Usage

```js
// .kiritanconfig
import { myMemory } from "@kiritan/free-translate";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: { auto: true, middlewares: [myMemory({ email: "you@example.com" })] },
};
```

## Support status

| Provider | Kind | Official? | Key | Languages | Batching | Limits (handled for you) | Verified | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `myMemory()` | Hosted | Yes, documented free API | None (optional `email`) | Most | One text per request | 500 bytes per request, so longer texts are split by bytes; about 5,000 characters a day anonymously, about 50,000 with `email` | Live | Mixes human translation memory with MT, so quality varies. It reports errors as HTTP 200, which is checked. |
| `googleFree()` | Hosted | **No.** The endpoint Google's own Chrome dictionary extension uses | None | About 130 | Up to 20 texts / 4,000 characters | No stated quota | Live | Google quality. Unofficial: it can be throttled, blocked (a CAPTCHA page comes back as HTTP 429) or change without notice, and may be against Google's terms. For occasional documentation runs, not for anything you depend on; use `@kiritan/google-translate` with a key for a supported service. An unknown language code is an error, not silence. |
| `libreTranslate({ baseUrl })` | Self-hosted | Yes, open-source engine | None unless you enable `--api-keys` | Many | Up to 50 texts | Whatever your server allows | Unit tests only (no server available) | The public libretranslate.com needs a paid key now, so this is for a server you run. |
| `appsScript({ url })` | Self-hosted | Your own Apps Script | Shared secret you choose | About 130 (Google's) | Up to 20 texts / 20,000 characters | Your account's `LanguageApp` daily quota; a runtime limit per request | Against a local server that answers like Apps Script (302 redirect); not against a real deployment | Google Translate quality on your own quota. The script to paste in is below. |

Tried and **not** supported:

| Service | Why not |
| --- | --- |
| Google's plain `client=gtx` endpoint | Answered with a CAPTCHA page from the machine it was tried on. |
| Lingva (public instances) | Behind Cloudflare's bot challenge. |
| Microsoft Edge's translate endpoint | Its auth endpoint returned nothing. |
| libretranslate.com | Requires a paid API key. Run your own server and use `libreTranslate()`. |
| Apertium's public server | Built, then removed: European languages only, no Japanese, Chinese or Korean. |

"Live" means it was run end to end against the real service on a Markdown sample (front matter, heading, bold, list, quote, table, code fence, an entity and `%{name}`), and all of it came back intact.

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

## Requirements

- Node.js >= 22.7

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
