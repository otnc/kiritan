<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/deepl

**English** | [日本語](README.ja.md)

</div>

> A [DeepL](https://www.deepl.com/) translate middleware for [Kiritan](https://www.npmjs.com/package/kiritan). Plug it into `translate.middlewares` to have `kiritan translate` fill in missing and stale translations.

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fdeepl)](https://www.npmjs.com/package/@kiritan/deepl)

## Install

```sh
npm install --save-dev @kiritan/deepl
```

## Usage

```js
// .kiritanconfig
import { deepl } from "@kiritan/deepl";

export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "base/README.base.md", strategy: "sidecar" }],
  translate: {
    middlewares: [deepl({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

With `sidecar`, the whole document goes to DeepL as one text and comes back as the translated sidecar file. With `catalog`, each `:::kiritan{#id}` block in the base file is translated separately — the base file needs those blocks, or there is nothing to translate.

Use `deeplBatch` instead of `deepl` to send many segments per request (up to DeepL's limits of 50 texts / 128 KiB), which is much faster for a `catalog` source with lots of ids:

```js
import { deeplBatch } from "@kiritan/deepl";

export default {
  // ...
  translate: {
    middlewares: [deeplBatch({ apiKey: process.env.DEEPL_API_KEY })],
  },
};
```

### Options

| Option            | Description                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apiKey`          | Your DeepL API key (required). A key ending in `:fx` uses the free API, any other the Pro API.                    |
| `baseUrl`         | Overrides the endpoint.                                                                                           |
| `targetLanguages` | Per-locale overrides of the DeepL `target_lang`, e.g. `{ en: "EN-GB" }`. `en` defaults to `EN-US`, `pt` to `PT-BR`. |
| `extraParams`     | Extra fields merged into the request body, e.g. `{ formality: "prefer_less" }`.                                   |
| `retry` | How many times to retry a failed request (network errors, 408/409/425/429/5xx). Default: 2. |
| `retryDelay` | Delay between retries, in ms. Default: 500. |
| `timeout` | Per-request timeout, in ms. Default: 30000. |
| `fetch`           | A custom `fetch`, for testing or a proxy.                                                                         |

### Behavior

- `%{name}` placeholders come back unchanged: they're wrapped in a tag DeepL is told to ignore (`tag_handling: xml`), and the rest of the text is XML-escaped on the way in and un-escaped on the way out.
- Text is sent as-is otherwise, so Markdown syntax in a segment (links, emphasis, code) is left to DeepL's own handling. Review machine translations before publishing them — `kiritan check` flags `catalog` entries written this way as `machine` until you do.
- A failed request is retried (see `retry`) and then throws, and `kiritan translate` stops with DeepL's own message (an invalid key, an exhausted quota, ...).

## Requirements

- Node.js >= 22.7 (HTTP goes through [ofetch](https://github.com/unjs/ofetch), its only dependency of note)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
