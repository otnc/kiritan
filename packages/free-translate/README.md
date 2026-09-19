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

## Requirements

- Node.js >= 22.7

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
