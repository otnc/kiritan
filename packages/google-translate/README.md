<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/google-translate

**English** | [日本語](README.ja.md)

</div>

> A [Google Cloud Translation](https://cloud.google.com/translate) middleware for [Kiritan](https://www.npmjs.com/package/kiritan). Plug it into `translate.middlewares` to have `kiritan translate` fill in missing and stale translations.

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fgoogle-translate)](https://www.npmjs.com/package/@kiritan/google-translate)

## Install

```sh
npm install --save-dev @kiritan/google-translate
```

## Usage

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

Use `googleTranslateBatch` instead of `googleTranslate` to send many segments per request (up to 128 strings or 30k code points), which is much faster for a `catalog` source with lots of ids:

```js
import { googleTranslateBatch } from "@kiritan/google-translate";

export default {
  // ...
  translate: {
    middlewares: [googleTranslateBatch({ apiKey: process.env.GOOGLE_API_KEY })],
  },
};
```

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

## Requirements

- Node.js >= 22.7 (uses the global `fetch`)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
