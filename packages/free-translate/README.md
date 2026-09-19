<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/free-translate

**English** | [日本語](README.ja.md)

</div>

> Kiritan translate middlewares that need **no API key**: MyMemory, Google's keyless endpoint, Apertium, and self-hosted LibreTranslate. Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so code, URLs and `%{name}` are protected and long documents are split for you.

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
  translate: { middlewares: [myMemory({ email: "you@example.com" })] },
};
```

## Which one?

| Provider | Official? | Languages | Notes |
| --- | --- | --- | --- |
| `myMemory()` | Yes, documented free API | Most | About 5,000 characters a day anonymously, about 50,000 with `email`. Mixes human translation memory with MT, so quality varies. Limited to 500 bytes per request, handled for you. |
| `googleFree()` | **No.** The endpoint Google's own Chrome dictionary extension uses | About 130 | Best quality of the four, no stated quota. Unofficial: it can be throttled, blocked (a CAPTCHA page comes back as HTTP 429) or change without notice, and may be against Google's terms. For occasional documentation runs, not for anything you depend on. Use `@kiritan/google-translate` with a key for a supported service. |
| `apertium()` | Yes, open-source public server | European and related languages only | **No Japanese, Chinese or Korean.** Rule-based, so output is literal; suits related languages such as Spanish/Catalan/Portuguese best. |
| `libreTranslate({ baseUrl })` | Yes, open-source engine | Many | The public libretranslate.com now needs a paid key, so this is for a server you host (no key unless you enable `--api-keys`). |

Every provider takes the same tuning options as [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware) — `concurrency`, `minInterval`, `retry`, `cache`, `protect`, `onError` — plus `timeout`, `fetch` (a custom transport) and `languageCodes` (per-locale overrides of the code sent to the service). Each provider ships sensible limits, so you rarely need them.

### Getting the most from a free service

- Persist a cache so a re-run costs no quota: `myMemory({ cache: createFileCache("node_modules/.cache/kiritan.json") })` (`createFileCache` is exported by `@kiritan/middleware`).
- Chain a fallback: `myMemory({ onError: "skip" })` leaves a failing text to the next middleware, e.g. `[googleFree({ onError: "skip" }), myMemory()]`.
- Review before publishing. This is machine translation, and `kiritan check` flags `catalog` entries written this way as `machine`.

### Notes

- An unsupported language is an error, not silence: Google's endpoint answers an unknown code with the original text, so `googleFree` validates the code first; MyMemory and Apertium errors are reported with the service's own message.
- An engine that drops a protected code span or URL makes the run fail instead of writing a translation that lost it.
- `%{name}` and code stay verbatim, but the *wording around them* is up to the engine, so review the result.

## Requirements

- Node.js >= 22.7

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
