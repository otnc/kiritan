# Kiritan Design Document

**English** | [日本語](DESIGN.ja.md)

## 1. Overview

Kiritan is an internationalization utility that, in addition to the usual "key → string" i18n library scope, also targets document files themselves — Markdown, MDX, and plain text.

You prepare a single "base file" such as `README.base.md`, and a build operation generates each language's file from it: `README.md` (default locale) and `README.ja.md` (other locales), for example.

### Goals

- Let the translation storage location (split files / inline / catalog) be chosen per use case.
- Allow a machine translation provider (Google Translate, etc.) to be plugged in as an arbitrary translation provider.
- Automatically protect ranges that must never be translated, such as code blocks and links inside Markdown.
- Make output filenames, storage strategy, translation providers, and config file layering all broadly configurable.
- Bundle a minimal runtime i18n (`t(key, params)`) as well.

### Non-goals

- Advanced grammar such as plurals or ICU MessageFormat (a path is left open as an extension point, but this isn't handled in v1).
- Translation quality management or review workflows themselves (state marking is handled, but a review UI etc. is out of scope).

## 2. Overall pipeline

```
discover            Discover base files by glob
  -> parse           A Renderer parses the file content
     - Plain Markdown/Text: split into the whole document or per paragraph
     - If :::kiritan{...} directives (remark-directive) exist, split into blocks per locale/id
  -> resolve          A TranslationStore fetches each locale's translation
  -> interpolate      %{name} variable expansion
  -> translate(optional) Missing translations are auto-translated via the Translator middleware chain
  -> reassemble        A Renderer reassembles the final document
  -> write             Write the output file per the naming template
```

`kiritan build` runs this whole sequence. `extract` / `translate` / `check` are separate commands (described later) built on the same foundation.

**Build behavior when a translation is missing**: with `translate.auto: false` (the default), if a translation is missing for some locale/segment, `build` does not error — it **falls back to the default locale's (base) original text** and writes it, with a marker comment showing it's untranslated (e.g. `<!-- kiritan:untranslated (source: en) -->`). This means build always succeeds and never produces a broken document. Detecting untranslated content and blocking on it in CI is handled separately by `kiritan check` (chapter 8).

## 2.1 Package layout (workspaces from v1)

With future mono-repo-ing in mind (chapter 13), npm workspaces are adopted from v1. The root is a private workspace root, and the actual packages live under `packages/*`.

```
packages/
  kiritan/       # Core + CLI + built-in stores/renderers. Published to npm as "kiritan"
  runtime/        # Minimal runtime i18n (no build-time dependencies). Published to npm as "@kiritan/runtime"
```

Breakdown of `packages/kiritan/src/` (one folder per feature area):

```
packages/kiritan/src/
  index.ts        # Public API (defineConfig, build, extract, translate, check)
  config/          # Discovery, cascading, and merging (.kiritan.*)
  discover/         # Discover base files via glob, resolve naming templates
  directive/         # Extract :::kiritan{...} via remark-directive
  stores/             # sidecar / inline / catalog
  renderers/           # markdown / mdx / text
  interpolate/          # %{name} expansion (uses @kiritan/runtime's implementation)
  translate/             # The middleware chain execution engine (grouping from 7.1)
  hash/                   # Hashing for stale detection
  i18n/                    # runtime.sources aggregation, typegen, i18n-key-mismatch detection (chapter 9)
  pipeline/                 # Orchestration of build/extract/check/typegen
  cli/                       # citty command definitions
```

`packages/runtime/src/`:

```
packages/runtime/src/
  index.ts         # createT
  interpolate.ts    # Shared %{name} implementation (Kiritan core also depends on this)
```

(i18next-compatible resource loading — `centralized` in chapter 9.4 — lives in `kiritan` core's `i18n/load.ts`, not in `@kiritan/runtime`, since it's a build-time concern rather than something the runtime itself needs.)

- Rather than re-exporting `kiritan/runtime` from `kiritan`, `@kiritan/runtime` is its own independent package (`kiritan` may depend on `@kiritan/runtime`, but never the reverse). This lets a project that only wants the runtime avoid pulling in `kiritan` core (remark and other build-time dependencies) at all.
- Everything except the CLI (`src/cli.ts`) keeps full CJS/ESM dual-format support. The remark/unified/micromark ecosystem only ships ESM-only packages (going back to a CJS release would mean "using an older version," which is avoided), so `tsdown.config.ts`'s `deps.alwaysBundle` bundles them directly into `dist/index.{cjs,mjs}`, eliminating any scenario where a CJS consumer would need to `require` an ESM-only package. `citty`, which is CLI-only, stays an external dependency and isn't bundled.
- Reference implementations of translate middlewares to be added later (e.g. `@kiritan/google-translate`, chapter 13) are also expected to be added to the same workspace under `packages/*`.
- The existing `tsdown` / `vitest` / `eslint` / CI (`ci.yml` and the release workflows) setups need updating for workspace support (per-package build/test/publish). This is treated as an implementation task once the design is finalized.
- Versioning is **independent per package** (no lockstep, no shared changelog-generation tool). Each package has its own `workflow_dispatch` GitHub Actions workflow (`release.yml`, `release-runtime.yml`) — thin wrappers around a shared reusable workflow (`_release-package.yml`) that does the actual work — so releasing one package can never touch the other by accident:

  1. Trigger `release-<package>` from the Actions tab with two inputs: `version` (a semver bump — `patch`/`minor`/`major`/`prerelease` — or an explicit version, passed straight to `npm version`) and `dist_tag` (npm dist-tag; empty auto-detects).
  2. The workflow bumps that package's `package.json` (no changeset file, no per-package CHANGELOG.md — GitHub's auto-generated release notes from merged PRs are used instead), regenerates every `base/*.base.md`-derived doc, and runs `npm publish` with **trusted publishing** (OIDC — no `NPM_TOKEN` needed, configured per-package on npmjs.com pointing at that package's own workflow file).
  3. It commits the version bump + regenerated docs, tags the release as `<name>@<version>`, pushes, and creates a GitHub Release.

  Since `kiritan` depends on `@kiritan/runtime`, bumping runtime's minor/major version doesn't automatically update kiritan's dependency range — that's a deliberate manual follow-up, so that releasing runtime alone never touches kiritan's `package.json`.

  (An earlier iteration of this design used [Changesets](https://github.com/changesets/changesets), with a changeset file committed per PR driving both the version bump and CHANGELOG generation at release time. It was replaced with the simpler `npm version`-based flow above — modeled after [oto-lab/npm-biome-ts](https://github.com/oto-lab/npm-biome-ts)'s single-package release workflow — to remove the per-PR changeset-writing step entirely.)

## 3. Config files

### 3.1 Discovery and cascading

Filenames matching `.kiritan.(base|<mode>|local).(c|m)(js|ts)` are recognized (e.g. `.kiritan.mjs`, `.kiritan.base.cts`, `.kiritan.dev.mts`). `.ts`/`.cts`/`.mts` are loaded directly with a lightweight loader like [jiti](https://github.com/unjs/jiti) (since Node's native type stripping is only flag-free on a limited set of versions, Kiritan takes this on as its own dependency to prioritize working regardless of the user's Node version). Merge order (lower entries take priority, deep-merged):

1. `.kiritan.base.(c|m)(js|ts)` (if absent, `.kiritan.(c|m)(js|ts)` is treated as the base layer)
2. `.kiritan.<mode>.(c|m)(js|ts)` — `mode` comes from the `--mode` flag, or the `KIRITAN_MODE` environment variable otherwise. This layer is skipped if neither is set.
3. `.kiritan.local.(c|m)(js|ts)` — always applied last. Intended to be `.gitignore`d (for local overrides such as API keys).
4. `--config <path>` / `--overlay <path>` (repeatable) — additional config files can be layered on from the CLI.

Objects are deep-merged; arrays (such as `sources`) are replaced by default. Wrap with the `mergeArray(...)` helper to concatenate instead.

### 3.2 Config schema (the scope of `.kiritan.*`)

The following is everything configurable via `.kiritan.(base|<mode>|local).(c|m)(js|ts)`. This is the entirety of `KiritanConfig` — there are no configuration items beyond it.

| Top-level key | What it configures |
| --- | --- |
| `locales` | The list of supported locales and the default locale |
| `sources` | What documents to build (the `TranslationStore` strategies in chapter 4, translation in chapter 7) |
| `naming` | The template/preset for document output filenames (chapter 3.3) |
| `interpolation` | `%{name}` variable expansion (chapter 5) |
| `translate` | Defaults for the translate middleware chain (chapter 7) |
| `runtime` | Placement strategy for runtime i18n resources (chapter 9) |
| `check` | What `kiritan check` treats as a failure condition (chapter 8) |
| `switcher` | Automatic insertion of language-switcher links (chapter 6.1) |
| `plugins` | Registration of custom `TranslationStore` / `Renderer` implementations |

(`ResourceSourceConfig`'s `strategy`, custom middlewares passed to `translate.middlewares`, and custom implementations passed to `plugins` are all `import`ed directly and passed in from within a `.kiritan.*` file — configuration stays pure "wiring," and the actual implementation is written as an ordinary TS/JS module.)

```ts
interface KiritanConfig {
  locales: { default: string; list: string[] };
  sources: SourceConfig[];
  naming?: {
    preset?: 'dot' | 'dash' | 'prefix' | 'folder'; // A preset from chapter 3.3. Setting it only swaps out template's default value
    template?: string; // Default: "{dir}/{base}.{locale}.{ext}" (takes priority over preset)
    defaultTemplate?: string; // A template used only for the default locale (falls back to omitDefaultLocaleSuffix if omitted)
    omitDefaultLocaleSuffix?: boolean; // Default: true. Only effective when defaultTemplate is unset
    baseSuffix?: string; // Default: ".base" (used to recognize README.base.md)
    outputs?: Record<string, string>; // Explicit per-locale output path overrides, e.g. { ja: "i18n/ja/README.md" }
  };
  interpolation?: {
    delimiters?: [string, string]; // Default: ["%{", "}"]
    variables?: Record<string, string | Record<string, string>> | ((ctx: BuildContext) => Record<string, string>);
    onMissing?: 'error' | 'keep' | 'empty'; // Default: 'error'
    skipCodeBlocks?: boolean; // Default: true
  };
  translate?: {
    middlewares?: TranslateMiddleware[]; // Default: [] (equivalent to doing nothing = "manual")
    auto?: boolean; // Default: false. Auto-translation of missing translations never runs unless this is true
  };
  runtime?: {
    sources?: ResourceSourceConfig[]; // colocated/split/centralized/embedded may be mixed (chapter 9.1)
    fallbackLocale?: string;
  };
  check?: {
    failOn?: Array<'missing' | 'stale' | 'machine' | 'i18n-key-mismatch'>; // Default: ['missing', 'stale', 'i18n-key-mismatch']
  };
  switcher?: SwitcherConfig; // Enabled by default (chapter 6.1)
  plugins?: {
    stores?: Record<string, TranslationStore>;
    renderers?: Record<string, Renderer>;
  };
}

interface SourceConfig {
  glob: string;
  strategy: 'sidecar' | 'inline' | 'catalog' | string; // A string means a custom store ID
  naming?: KiritanConfig['naming']; // Wholesale-overrides naming for this source only (template/outputs, etc.)
  translate?: KiritanConfig['translate']; // Per-source override
  switcher?: SwitcherConfig; // Wholesale-overrides switcher for this source only (chapter 6.1)
}
```

Since `naming.outputs` (per-locale explicit path overrides) tends to need different values per source in practice, it's written on `SourceConfig.naming` as the primary form (the global `naming` is kept as just "the template's default").

### 3.3 Naming template presets

Since there are several conventions for naming output files (`README.ja.md` style, `README-ja.md` style, `ja.README.md` style, folder-based, etc.), `naming.template` can be written as any completely free-form string template, while the common forms are available via just a `naming.preset` value.

| preset | Actual template | Output example (base="README", ext="md", locale="ja") |
| --- | --- | --- |
| `dot` (default) | `{dir}/{base}.{locale}.{ext}` | `README.ja.md` |
| `dash` | `{dir}/{base}-{locale}.{ext}` | `README-ja.md` |
| `prefix` | `{dir}/{locale}.{base}.{ext}` | `ja.README.md` |
| `folder` | `{dir}/{locale}/{base}.{ext}` | `ja/README.md` |

`preset` is just a shorthand that swaps `template`'s default value; specifying `template` directly allows any arrangement or separator not covered by a preset (e.g. `{base}_{locale}.{ext}`). `naming.defaultTemplate`, `omitDefaultLocaleSuffix`, and `outputs` all work the same way regardless of whether a preset is used.

## 4. Translation storage strategies (`TranslationStore`)

```ts
interface TranslationStore {
  id: string;
  read(ctx: StoreContext, locale: string): Promise<TranslatedContent | null>;
  write?(ctx: StoreContext, locale: string, content: TranslatedContent): Promise<void>;
  status(ctx: StoreContext, locale: string): Promise<'missing' | 'partial' | 'complete' | 'stale'>;
}

type TranslatedContent =
  | { kind: 'full-text'; text: string; machine?: boolean }
  | { kind: 'segments'; segments: Record<string, { text: string; machine?: boolean }> };
```

Strategies can be mixed within the same config (one document using `inline`, another using `catalog`, and so on).

### 4.1 `sidecar` — split-file approach

For `README.base.md`, an independent file per language, such as `README.ja.md`, is prepared, whether by hand or via machine translation. This is closest to how README translations are conventionally handled today. Stale detection is done via a hash comment embedded at the top of the output file (e.g. `<!-- kiritan:source-hash: xxxx -->`).

### 4.2 `inline` — laying out every language in one file

This follows [remark-directive](https://github.com/remarkjs/remark-directive)'s standard container-directive syntax (`:::name{attrs}` ... `:::`) as-is. No custom line parser is written, so it rides directly on the remark ecosystem (syntax highlighting, existing VS Code extensions, etc.).

Each locale is written as its **own, self-contained directive** (never a single block with a "switch"-like structure packing multiple cases together).

**When targeting the whole document:**

```md
:::kiritan{locale=en}
# Kiritan

Internationalization utility for docs.
:::

:::kiritan{locale=ja}
# きりたん

ドキュメント向けの国際化ユーティリティ。
:::
```

**When targeting individual sections (wrapping only the parts that differ):**

```md
# Kiritan

![badge](...) <!-- Shared across every locale, not translated -->

:::kiritan{locale=en}
## Usage
This is the usage section.
:::

:::kiritan{locale=ja}
## 使い方
これは使い方セクションです。
:::

## License
Distributed under the WTFPL License. <!-- A shared section just needs to sit outside a directive -->
```

Anything outside a directive is copied as-is into every locale's output as "shared content." This supports translating only part of a document while sharing the rest.

**Nesting (using `:::` again inside a block):** just add more colons on the outer fence, per remark-directive's standard behavior (e.g. using `:::note` inside `::::kiritan{locale=en}`). No special handling is needed on Kiritan's side.

Specifying a `locale=xx` value not present in `locales.list` is treated as a typo and errors at build time (it is never silently ignored).

### 4.3 `catalog` — segment-level catalog approach

Segment ids are never auto-inferred (position-based or content-hash-based) — the **author assigns them explicitly on the base file side**. remark-directive's `#id` attribute shorthand is used as-is.

```md
:::kiritan{#usage-intro}
## Usage
This is the usage section.
:::
```

- The content inside a `:::kiritan{#<id>}` block is the base locale's (`locales.default`) original text itself.
- Translations are kept in a separate file, such as `locales/README.ja.yaml`, as `id → { text, machine, hash }` (`hash` refers to "what the original text for this id looked like when it was last translated" — it's only used for `stale` detection when it no longer matches the current original, never for id matching itself).
- Since the author fully controls the id, translations never go "missing" just because the surrounding prose was reworded (the correspondence is pinned by id) — in exchange, assigning and naming ids becomes the author's responsibility (the same mindset as key design in an i18n library).
- The area outside `:::kiritan{#<id>}` is treated as "shared content," same as `inline`.
- `kiritan extract` scans the base file's `:::kiritan{#<id>}` blocks and adds any id not yet registered in the catalog (existing translations are never overwritten). If an id disappears from the base file, it's left in the catalog as an orphan, and `kiritan check` warns about it.

## 5. Variable expansion (`%{name}`)

A mechanism for embedding values shared across locales — a version number, a repository URL, a site name, and the like. `{{...}}` collides too easily with Handlebars/Mustache/i18next and similar, so `%{name}`, closer to Ruby/Rails' i18n, is the default (the delimiters themselves can be changed via `interpolation.delimiters`).

```md
Current version: %{version}
```

```ts
interpolation: {
  variables: {
    version: '1.2.0',
    siteName: { en: 'Kiritan', ja: 'きりたん' }, // Per-locale override
  },
}
```

- A variable's value comes from `interpolation.variables` (or a `variables` function's return value) alone — a catalog translation record, for instance, never supplies a variable's value. If both a per-locale value (`{ en: ..., ja: ... }`) and a shared value are defined for the same variable name, **the per-locale value takes priority**, falling back to the shared value if absent.
- Can be escaped with a backslash, as in `\%{literal}`.
- With `interpolation.skipCodeBlocks: true` (the default), expansion is skipped inside code blocks / inline code.
- How an undefined variable is handled is controlled by `onMissing` (default `'error'`), so a typo can be caught at build time.
- Making the variable resolution itself a function also allows dynamic values, such as reading a value out of `package.json`.

## 6. Renderers (`Renderer`)

```ts
interface Renderer {
  id: string;
  parse(sourceText: string): ParsedDocument;
  reassemble(doc: ParsedDocument, translated: Record<string, string> | string): string;
}
```

- `markdown`: AST parsing via remark + `remark-directive`. Code blocks, inline code, and link URLs are protected, and `:::kiritan{...}` directives are also split apart here. This is the only renderer v1 actually implements — every source is processed as Markdown regardless of its extension.
- `text`, `mdx`, front-matter protection (`translateFrontmatter`), `plugins.renderers` for custom renderers, and the strategy/renderer compatibility validation described below are all still design-stage, not implemented in v1 (tracked in chapter 13).

The design intent for once these are implemented:

- `text`: split per blank-line-delimited paragraph. Since `.txt` has no Markdown syntax, `:::kiritan{...}` can't be used, so `inline`/`catalog` strategies wouldn't be supported (only `sidecar` would be).
- `mdx`: a Markdown extension. JSX parts would never be translated. `:::kiritan{...}` could be used the same way as in markdown.
- A renderer would declare which `strategy` values it supports (e.g. `text` only declaring `['sidecar']`). When config is loaded, the combination of `SourceConfig.strategy` and the actual file type (renderer) would be validated, and an unsupported combination (e.g. `inline` on a `.txt` file) rejected with a clear error before build.

### 6.1 Automatic insertion of language-switcher links (`switcher`)

Builds a language-switcher link automatically at build time, of the kind commonly seen in bilingual READMEs: `[English](README.md) | [日本語](README.ja.md)`. Since this is mechanical link generation, a different kind of thing from translation, it's **enabled by default**, unlike `translate.auto` (off by default).

**Specifying where it's inserted**: writing `::kiritan{switcher}` — a remark-directive leaf directive (a content-less `::name` form) — anywhere in the base file inserts it at that spot (the same `remark-directive` mechanism as the container directives in chapters 4.2/4.3).

```md
# Kiritan

::kiritan{switcher}

Kiritan の説明...
```

If no explicit marker exists, it's auto-inserted at `switcher.position` (default `'after-heading'`: right after the first heading, or at the top if there's none) when `switcher.enabled` (default `true`). **If a marker exists, it's always used regardless of the `enabled`/`position` values** (an explicit placement wins over the default behavior).

**Generated content**: for each locale in `locales.list`, a link to that locale's output file path (reusing the naming resolution from chapter 3.3, also honoring a per-source `naming.outputs` override) is **automatically computed** as a path relative to the output file currently being built, then joined with a separator (default `" | "`). There's no way to specify an `href` manually (if you want to write a link by hand, just write it yourself instead of using this feature). The current locale itself isn't linked — it's shown in bold (it can also be turned into a link via `currentLocaleLink: true`).

**Displayed language labels**: Kiritan doesn't maintain its own list of language names (a hand-maintained list risks gaps). The default label uses the standard [`Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames) (ECMA-402, built into Node.js, based on CLDR data) to automatically display each locale's autonym — the name a locale uses for itself in its own language (e.g. "日本語" for `ja`, "English" for `en`). This needs no extra dependency and no list to maintain.

```ts
// Default label resolution (used for any locale with no explicit override in labels)
new Intl.DisplayNames([locale], { type: "language" }).of(locale);
```

`switcher.labels` remains as an opt-in override for cases where this default needs to be replaced (wanting a different name, a custom locale code `Intl.DisplayNames` doesn't know, excluding an unsupported locale from the list, etc.).

```ts
interface SwitcherConfig {
  enabled?: boolean; // Default: true (only controls automatic insertion when no marker exists; a marker is always honored)
  position?: 'top' | 'after-heading' | 'none'; // Default: 'after-heading'
  separator?: string; // Default: " | "
  /**
   * Per-locale display label overrides. Any unspecified locale uses its
   * Intl.DisplayNames autonym as its label (falling back to the locale
   * code itself if that fails). A value of `false` excludes that locale
   * from the switcher entirely (e.g. a locale still in draft, or one
   * whose custom locale code Intl.DisplayNames doesn't recognize).
   */
  labels?: Record<string, string | false>;
  currentLocaleLink?: boolean; // Default: false
  render?: (ctx: SwitcherRenderContext) => string; // Fully overrides how the whole line is rendered
}

interface SwitcherLink {
  locale: string;
  label: string;
  href: string; // A relative path, always computed automatically
  isCurrent: boolean;
}

interface SwitcherRenderContext {
  locale: string; // The locale currently being built
  links: SwitcherLink[]; // In locales.list order (a locale set to false in labels is excluded)
}
```

```ts
switcher: {
  labels: { en: 'English', ja: '日本語', es: false }, // es is excluded from the switcher
}
```

It can be wholesale-overridden per source via `SourceConfig.switcher` (disabling it for a specific document, changing its labels, etc.).

Generated example (`locales.list: ['en', 'ja', 'es']`, the `labels` above, building `en`):

```md
**English** | [日本語](README.ja.md)
```

Since `::kiritan{switcher}` inserts the same content into every locale's output, it should be placed **outside** an `inline`/`catalog` strategy's `:::kiritan{locale=...}`/`:::kiritan{#<id>}` block (in the shared-content area). Placing it inside a block leads to the confusing behavior of the switcher appearing only in that one locale's output, so a warning is issued at build time in that case.

## 7. Translate middleware chain (`TranslateMiddleware`)

Rather than picking a single provider, this is designed so small pieces of processing can be chained together, Vite/Koa-plugin style. For one `missing` translation, middlewares are applied in order from the front, and processing stops as soon as one of them resolves a value.

```ts
interface TranslateContext {
  text: string;         // The text to translate (the base side's original)
  from: string;          // e.g. "en"
  to: string;             // e.g. "ja"
  source: SourceConfig;   // Which source this translation is for
  segmentId?: string;      // catalog strategy only: the <id> of :::kiritan{#<id>}
                            // (used for cache keys or glossary lookups; omitted for sidecar/inline)
}

// Single form (the simplest — called once per item)
type TranslateMiddleware = (
  ctx: TranslateContext,
  next: () => Promise<string | null>
) => Promise<string | null>; // Returning null / not calling next() = delegate to the next middleware

// Batch form (for batching multiple items into one API call — marked with `batch: true` to distinguish it)
type BatchTranslateMiddleware = {
  batch: true;
  handle: (
    ctxs: TranslateContext[],
    next: () => Promise<(string | null)[]>
  ) => Promise<(string | null)[]>;
};
```

```ts
translate: {
  auto: true,
  middlewares: [
    cacheMiddleware({ dir: '.kiritan/cache' }), // Return an existing cached translation if there is one
    googleTranslate({ apiKey: process.env.GOOGLE_API_KEY }), // Otherwise, hit the API
    postProcess((text) => text.trim()),                        // Clean up the result before finalizing it
  ],
}
```

- The default is `middlewares: []` (equivalent to `manual`), and auto-translation never runs at all unless `translate.auto` is `true`. **This default (off) is kept as the design evolves, and is re-confirmed whenever a new place that needs an on/off decision comes up.**
- The calling convention (once per paragraph, or all at once as a batch) isn't decided by the core — **middleware authors are free to implement it either way**. Two forms are allowed for this reason:
  - Single form: `(ctx: TranslateContext, next) => Promise<string | null>` — the simplest form, called once per item.
  - Batch form: `(ctxs: TranslateContext[]) => Promise<(string | null)[]>` — for when multiple items should be processed together in one call. The core looks at a middleware's shape (its function signature/flag) and passes items one at a time for a single-form middleware, or all missing items together for a batch-form one.
  - Kiritan itself doesn't bundle concrete official middlewares like `google`/`deepl` (to avoid adding dependencies). Reference implementation examples are provided in the docs (`docs/`).
- Anywhere auto-translation fills a gap, it's always marked `machine: true` (a field for `catalog`, a comment marker for `sidecar`/`inline`), so `kiritan check` can detect it as awaiting review.
- The whole chain can be wholesale-overridden per source (`sources[i].translate`).

> Splitting out official reference implementations as separate packages, such as `@kiritan/google-translate` `@kiritan/deepl`, is also under future consideration (see chapter 13).

### 7.1 Mixing single-form and batch-form middlewares

Single-form and batch-form middlewares may be mixed within the `translate.middlewares` array. The pipeline scans the array from the front, automatically grouping consecutive single-form middlewares into one "single group," while each batch-form middleware forms its own standalone "batch group."

```ts
middlewares: [
  cacheMiddleware(),      // Single form ┐
  localGlossary(),        // Single form ┘→ Group A (chained item-by-item via ctx/next)
  googleTranslateBatch(), // Batch form    → Group B (all items still missing at that point, passed together)
  postProcess(),          // Single form    → Group C (applied only to what Group B didn't resolve)
]
```

Groups run in array order, and only the items a group didn't resolve are passed on to the next group. This lets a combination like "check the cache one item at a time first → throw the rest at an API together → format each remaining item one at a time at the end" be expressed naturally.

## 8. Stale detection

- `sidecar` / `inline`: embed a hash comment of the source into the output (or each block), and compare it against the base side's current hash.
- `catalog`: each segment's translation record keeps the corresponding base hash.
- `kiritan check` detects the presence of `missing` / `stale` / unreviewed `machine` translations and runtime resource `i18n-key-mismatch` (chapter 9.4), and can exit non-zero in CI. What's checked is configurable:

  ```ts
  check?: {
    failOn?: Array<'missing' | 'stale' | 'machine' | 'i18n-key-mismatch'>; // Default: ['missing', 'stale', 'i18n-key-mismatch'] (machine is a warning-only default)
  };
  ```
- Since the hash function only needs to be good enough for tamper detection and doesn't need cryptographic strength, a lightweight non-cryptographic xxhash-family hash (e.g. [`xxhash-wasm`](https://github.com/jungomi/xxhash-wasm)) is adopted as a dependency. The output is embedded as a hex string in the hash comment/catalog file.

  > **Implementation note**: this was ultimately implemented via Node's built-in `node:crypto` instead, to avoid a WASM dependency's bundling complexity in a package that ships both CJS and ESM — see `packages/kiritan/src/hash/index.ts`.

## 9. Runtime i18n (`@kiritan/runtime`)

The classic i18next approach of "aggregate every key into `locales/{lang}.json`" has persistent complaints: the file bloats, unused keys go unnoticed, PR diffs become hard to read, and comparing all languages for a given key is awkward. Kiritan doesn't take this as its only assumption — following the same thinking as the document-side `TranslationStore` (chapter 4), it lets the **resource's location be chosen as a strategy**.

### 9.1 Resource placement strategies (`ResourceSourceConfig`)

```ts
interface ResourceSourceConfig {
  glob: string;
  strategy: 'colocated' | 'split' | 'centralized' | 'embedded' | string; // A string means a custom strategy ID
  exportName?: string; // The named export read for the 'embedded' strategy. Default: "i18n"
  namespace?: (filePath: string) => string; // Default: auto-derived from the file path
}
```

| strategy | Placement | Example |
| --- | --- | --- |
| `colocated` | One file next to the component, holding every locale | `Button.i18n.ts` |
| `split` | Also next to the component, but one file per locale | `Button.en.i18n.ts` / `Button.ja.i18n.ts` |
| `centralized` | Gathered into a dedicated directory, per locale (or as one file). Also an i18next-compatible input format | `locales/en.json` / `locales/{locale}/common.json` |
| `embedded` | No dedicated file — written directly inside the component's own file | `export const i18n = {...}` inside `Button.tsx` |

Every strategy is ultimately converted into the same internal shape, `ResourceModule` (`key → { locale: value }`), so `createT`, `kiritan typegen`, and the key-mismatch check in chapter 9.6 all work identically regardless of strategy. Multiple strategies may be mixed within the same project (by listing multiple entries in `runtime.sources`).

```ts
runtime: {
  sources: [
    { glob: 'src/**/*.i18n.{js,ts}', strategy: 'colocated' }, // The default recommended form
    { glob: 'src/**/legacy/**/*.i18n.{en,ja}.ts', strategy: 'split' },
    { glob: 'locales/{locale}/*.json', strategy: 'centralized' },
    { glob: 'src/**/*.tsx', strategy: 'embedded', exportName: 'i18n' },
  ],
  fallbackLocale: 'en',
}
```

The default config `kiritan init` generates recommends the `colocated` strategy with `src/**/*.i18n.{js,ts}` (`.json` may also be included) as the default. It doesn't assume `.ts` — it's usable as-is in a JS-only project too.

### 9.2 `colocated` — colocated, one file for every language (the native form)

```ts
// src/components/Button/Button.i18n.ts
export default {
  submit: { en: 'Submit', ja: '送信' },
  cancel: { en: 'Cancel', ja: 'キャンセル' },
};
```

```ts
import messages from './Button.i18n';
const { t } = createT(messages);
t('submit'); // Resolved based on the current locale
```

```ts
type LocaleMap = Record<string, string>; // { en: 'Submit', ja: '送信' }
type ResourceModule = Record<string, LocaleMap>; // { submit: {...}, cancel: {...} }

function createT<R extends ResourceModule>(
  resources: R,
  opts?: { locale?: string; fallbackLocale?: string }
): {
  t<K extends keyof R & string>(key: K, params?: Record<string, string | number>): string;
  locale: string;
  setLocale(locale: string): void;
};
```

- The recommended default is `*.i18n.ts` (getting the most benefit from type safety), but `*.i18n.js` (for JS projects) and `*.i18n.json` are supported equally.
- **Type safety comes for free**: since the `messages` passed to `createT(messages)` is just a plain TS object (`.i18n.ts`) or JSON via `resolveJsonModule` (`.i18n.json`), TypeScript's generic inference alone narrows `t()`'s first argument down to a real key. A typo becomes a compile error with no extra code generation needed (chapter 9.6 covers aggregating multiple files). For `.js`, the benefit of inference is limited unless JSDoc type annotations are present (partially effective in a `checkJs` environment).
- **A gap between locales is visible at a glance, within the same file**: forgetting to write `ja` as in `submit: { en: 'Submit' }` doesn't require searching across files, i18next-style — it's noticed right there (mechanical detection is covered in chapter 9.7).
- Simple `%{param}` interpolation (sharing the same notation and implementation as the document-side variable expansion).
- The fallback order is `locale → fallbackLocale → the key itself`.
- Plurals and ICU are out of scope for v1. Left extensible later via a `formatters` option.
- Since a component's `.i18n.ts` disappears along with the component itself when it's deleted, the "unused translation keys linger forever" problem common with i18next's centralized management is much less likely to happen here. From a bundler's perspective too, an unused component's translations aren't dragged in (this matches the unit of code splitting).

### 9.3 `split` — colocated, but one file per locale

```
src/components/Button/
  Button.en.i18n.ts   // export default { submit: 'Submit', cancel: 'Cancel' }
  Button.ja.i18n.ts   // export default { submit: '送信', cancel: 'キャンセル' }
```

Files matching a `glob` that includes a locale token (e.g. extracting the `{locale}` part from an actual filename matching `*.{locale}.i18n.ts`) are bundled together as one set and internally merged into the same `ResourceModule` as 9.2. This is an option for when you want to stay colocated but avoid one file growing long with every language in it. Unlike 9.2, the benefit of "noticing a gap within the same file" is lost, so gap detection relies on the mechanical check in chapter 9.7.

### 9.4 `centralized` — gathered into a dedicated directory (i18next-compatible)

To ease migration to and from i18next, its convention (per-locale centralized files like `locales/{locale}/{namespace}.json`) is supported as-is as an input format. Once loaded, the content is internally converted into a `ResourceModule` before being passed to `createT`/`typegen`.

- i18next's plural suffixes (`key_one` / `key_other`, etc.) are **kept and passed through as values, but not interpreted** (since `t()` has no plural-selection logic in v1, the caller has to explicitly pick the right key).
- The namespace follows i18next's own file layout (`{namespace}.json`) as-is.

### 9.5 `embedded` — written directly inside a component file

For when you don't even want a dedicated translation file — you want to write it directly into the component's implementation file.

```tsx
// src/components/Button/Button.tsx
export const i18n = {
  submit: { en: 'Submit', ja: '送信' },
  cancel: { en: 'Cancel', ja: 'キャンセル' },
};

export function Button() {
  const { t } = createT(i18n);
  return <button>{t('submit')}</button>;
}
```

- If you're just calling `createT(i18n)` directly within the app, no involvement from Kiritan is needed (same as 9.2, it's just a plain TS object).
- Registering `strategy: 'embedded'` in `runtime.sources` makes `kiritan typegen`/`kiritan check` read that file at build time (the same jiti-based dynamic import as reading a config file's `.ts`), pull out just the named export specified by `exportName` (default `"i18n"`), and include it for aggregation/checking.
- Since the component's logic and its translations live in the same file, the file count doesn't grow, but there's a trade-off: files tend to get larger, and importing a large number of `embedded` files raises import cost.

### 9.6 Aggregating multiple files and generating types (`kiritan typegen`)

Importing a single file directly (9.2/9.5) gets type safety from TS inference alone, but when `runtime.sources` **aggregates multiple files into one shared `t()`** (e.g. wanting one common `t()` across the whole app), there's no longer a way to statically know the shape of the aggregated result. `kiritan typegen` exists for exactly this case.

- The namespace is auto-derived from the file path (e.g. `src/components/Button/Button.i18n.ts` → `components/Button`). No manual namespace management is needed (it can be overridden via a `namespace` function).
- `kiritan typegen` generates a `.d.ts` from the aggregated resource's shape (namespace × key × locale), bringing calls like `t('components/Button.submit')` after aggregation under type checking too.
- The generated type information also feeds into the cross-locale key-mismatch check in chapter 9.7.

### 9.7 Cross-locale key-mismatch check

Adds an item to `kiritan check` (chapter 8) that detects **cross-locale key mismatches** in runtime resources (a key missing from, or extra in, only one locale).

- `colocated`/`embedded` (every locale in one file) can spot a gap just by statically looking at a single file (no cross-file matching needed).
- `split`/`centralized` (one file per locale) requires matching up the key sets of the corresponding files to detect a mismatch.
- Via `check.failOn`'s `'i18n-key-mismatch'`, it can be wired into CI the same way as the document-side `missing`/`stale`.

## 10. CLI / programmatic API

The CLI's skeleton uses [citty](https://github.com/unjs/citty) (subcommand definitions, help output, and typed args aren't hand-rolled).

```
kiritan build [--mode] [--config]     # Runs the full pipeline (every strategy)
kiritan extract [--mode] [--config]   # catalog-strategy sources only. Creates/updates catalogs
kiritan translate [--mode] [--config] # Fills missing/stale via translate.middlewares (every strategy)
kiritan typegen [--mode] [--config]   # Generates a .d.ts from the runtime.sources aggregation (chapter 9.6)
kiritan check [--mode] [--config]     # For CI. Exits non-zero on missing/stale/unreviewed/i18n-key-mismatch
```

`kiritan init` (scaffolding `.kiritan.base.mjs` / `README.base.md` / a `.gitignore` entry for `.kiritan.local.*`) and a per-command `--locale` flag (restricting a run to one locale) are both still design-stage, not implemented in v1 (tracked in chapter 13).

```ts
export { defineConfig, build } from 'kiritan';
export type { KiritanConfig, TranslationStore, Renderer, TranslateMiddleware, BatchTranslateMiddleware } from 'kiritan';
```

The runtime portion is provided as the independent package `@kiritan/runtime` (chapter 2.1) rather than a subpath of `kiritan`, so that document-build-related code (remark, etc.) never has to be bundled in at all.

```ts
export { createT } from '@kiritan/runtime';
export type { CreateTOptions } from '@kiritan/runtime';
```

## 11. Extension points

| Kind | Status in v1 |
| --- | --- |
| Translation storage strategy | `sidecar` / `inline` / `catalog` are built in, but hardcoded directly into the pipeline rather than dispatched through the declared `TranslationStore` interface. `plugins.stores` isn't wired yet — setting it currently has no effect. |
| Runtime resource placement strategy | `colocated` / `split` / `centralized` / `embedded` (chapter 9.1) are genuinely dispatched via `ResourceSourceConfig.strategy`. A custom string strategy is accepted by the type but not handled by anything yet. |
| Translate middleware | Genuinely extensible today: no built-in providers, wired entirely through the `translate.middlewares` array (users implement freely; examples are provided in `docs/`). |
| File renderer | Only `markdown` is implemented; every source is processed as Markdown regardless of extension. `.txt`/`.mdx`, the declared `Renderer` interface, and `plugins.renderers` aren't wired yet — setting `plugins.renderers` currently has no effect. |
| Language-switcher rendering | Genuinely extensible today via `SwitcherConfig.render` (chapter 6.1). |

`TranslationStore`, `Renderer`, and `plugins.{stores,renderers}` are declared today as the shape a future pluggable version will use, but nothing in v1 reads or calls them yet (tracked in chapter 13).

## 12. Open questions (to be settled as implementation proceeds)

None at this time. Anything that comes up during implementation will be appended here.

## 13. Roadmap / future considerations

- **Official translate-middleware packages**: adding reference implementations like Google Translate / DeepL as separate packages (`@kiritan/google-translate`, `@kiritan/deepl`) under `packages/*`. Not added in v1 — only implementation examples are provided in the docs.
- **AI Agent Skill**: [`skills/kiritan`](../skills/kiritan) — done. A single self-contained `SKILL.md` (no npm package, no build step) teaching a coding agent the directive syntax, which CLI command to reach for, and common mistakes to avoid. See [skills/README.md](../skills/README.md) for installation.
- **VS Code extension**: [`packages/vscode`](../packages/vscode) — in progress. Syntax highlighting for `:::kiritan{...}`/`::kiritan{...}` blocks (a declarative TextMate grammar injected into Markdown, no compiled extension code) is done; the extension's `package.json` "name" is the unscoped `kiritan-vscode` rather than `@kiritan/vscode`, since a VS Code extension identifier can't contain a `/`. Still planned: folding for `:::kiritan` blocks, highlighting and undefined-variable detection for `%{name}`, jumping between `:::kiritan{#<id>}` and its catalog file, and inline display of `missing`/`stale` segments — these need real extension code (a folding range provider, a definition provider), not just a grammar.
- **Vim/Neovim plugin**: a `kiritan.vim` (or Lua-based Neovim) plugin covering the same ground as the VS Code extension — at minimum syntax highlighting for `:::kiritan{...}` blocks, ideally the same catalog-file jump and stale/missing indicators. Likely built on a shared tree-sitter grammar or LSP so both editors' extensions can reuse the same parsing logic rather than duplicating it.
- **`kiritan init`**: scaffolds `.kiritan.base.mjs` / `README.base.md` / a `.gitignore` entry for `.kiritan.local.*` in a fresh project. Documented in chapter 10 as part of the eventual CLI shape, but not implemented in v1.
- **A per-command `--locale` flag**: restricts `build`/`translate`/etc. to a single locale instead of every locale in `locales.list`. Not implemented in v1.
- **Wiring `plugins.stores`/`plugins.renderers`**: making the declared `TranslationStore`/`Renderer` interfaces (chapter 11) actually pluggable, instead of `sidecar`/`inline`/`catalog` and the Markdown renderer being hardcoded into the pipeline as they are in v1.
- **`text`/`mdx` renderers and front-matter protection**: v1 only implements the `markdown` renderer; `.txt`/`.mdx` support and `translateFrontmatter` (chapter 6) are design-stage only.
