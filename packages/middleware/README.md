<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# @kiritan/middleware

**English** | [日本語](README.ja.md)

</div>

> Turn any "translate this text" function into a complete [Kiritan](https://www.npmjs.com/package/kiritan) translate middleware. You supply the call to your provider; this layer handles everything else a real run needs.

[![npm](https://img.shields.io/npm/v/%40kiritan%2Fmiddleware)](https://www.npmjs.com/package/@kiritan/middleware)

## Install

```sh
npm install --save-dev @kiritan/middleware
```

## Usage

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

If the provider can translate several texts in one request, give `translateBatch(texts, { from, to })` instead — it must return one result per input, in order. That means far fewer requests.

### What the layer does for you

- **Protects what mustn't be translated.** Documents reach a middleware as raw Markdown, so the layer parses it (with [`@lezer/markdown`](https://github.com/lezer-parser/markdown), GFM included) and translates only the prose: code blocks and spans, URLs and link destinations, HTML, front matter, `:::kiritan{...}` lines, headings/list/quote markers, table pipes, emphasis markers, escapes, entities and `%{name}` are swapped for `[[0]]`-style tokens before the provider sees the text, and swapped back afterwards. Rather than a list of patterns that would have to be kept in step with Markdown, the parser decides what is markup. If the provider drops a token, the layer throws instead of writing a translation that lost code or a link. (The token shape was chosen by testing it against real engines: some rewrote `<span translate="no">` or split `XPH0X` apart. Tokens an engine re-typesets, such as full-width `［［0］］`, are still recognised.)
- **Splits long texts, groups short ones.** `maxChars` is the most the provider takes in one text; a longer text (say a whole README sent for a `sidecar` translation) is cut at paragraph boundaries and joined back with the original spacing. `maxBatchSize`/`maxBatchChars` cap how many go into one `translateBatch` call. You only declare the provider's limits.
- **Concurrency, spacing and retries.** `concurrency` (default 4), `minInterval` (ms between request starts), and `retry` (default 2, exponential backoff, only for network errors and 408/409/425/429/5xx).
- **Caching.** The same text is never translated twice: in memory for the run by default, or persisted with `cache: createFileCache("node_modules/.cache/kiritan-translate.json")` so a re-run in CI costs no quota.
- **Failure handling.** By default a failure stops `kiritan translate`. With `onError: "skip"`, only the failing texts are left for the next middleware in `translate.middlewares` (with `onSkip` to log them), so you can chain a free provider with a fallback.

### Options

| Option | Description |
| --- | --- |
| `name` | Identifies the provider in cache keys (required). |
| `translate` / `translateBatch` | Your provider call. One of them is required. |
| `maxChars` | The most characters per text the provider accepts. Longer texts are split. |
| `maxBatchSize` / `maxBatchChars` | Limits per `translateBatch` call. Default 50 texts. |
| `concurrency` / `minInterval` | Requests in flight (default 4) and the least ms between starts (default 0). |
| `retry` | `{ retries, delay, shouldRetry }`, or `false`. Default: 2 retries from 500 ms. |
| `protect` | `false` to send text as-is, or an array of `RegExp` for extra syntax *inside prose* the parser can't recognise (default: `[defaultProtectPatterns]`, i.e. `%{name}`). Markup is protected either way. |
| `cache` | `false`, or a `{ get, set }` store. Default: in memory. `createFileCache(path)` persists to JSON. |
| `onError` / `onSkip` | `"throw"` (default) or `"skip"`, and a callback for skipped texts. |

The output is machine translation. `kiritan check` flags `catalog` entries written this way as `machine` until you review them.

## Requirements

- Node.js >= 22.7

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](https://github.com/otnc/kiritan/blob/main/CONTRIBUTING.md) for details.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
