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
    auto: true,
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
    auto: true,
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

- Everything that must stay verbatim comes back untouched: code blocks, inline code, URLs, link destinations, HTML, front matter, `:::kiritan{...}` lines and `%{name}`. They are swapped for tokens before the text leaves your machine, wrapped in a tag DeepL is told to ignore (`tag_handling: xml`) so DeepL leaves them alone, and put back afterwards — and if DeepL drops one, the run fails instead of writing a translation that lost a link or a code span. (Built on [`@kiritan/middleware`](https://www.npmjs.com/package/@kiritan/middleware), so it also accepts its `concurrency`, `minInterval`, `cache`, `protect`, `onError` and `onSkip` options.)
- A text over DeepL's 128 KiB (say a whole README for a `sidecar` translation) is split at paragraph boundaries and joined back with the original spacing. The wording around protected spans is up to DeepL, so review machine translations before publishing them — `kiritan check` flags `catalog` entries written this way as `machine` until you do.
- A failed request is retried (see `retry`) and then throws, and `kiritan translate` stops with DeepL's own message (an invalid key, an exhausted quota, ...).

## Requirements

- Node.js >= 22.7 (HTTP goes through [ofetch](https://github.com/unjs/ofetch), its only dependency of note)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
