# Kiritan Design Document

:::kiritan{locale=en}
## 1. Overview
:::
:::kiritan{locale=ja}
## 1. 概要
:::

:::kiritan{locale=en}
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
:::
:::kiritan{locale=ja}
Kiritan は、通常の「キー→文字列」i18n ライブラリの範囲に加えて、Markdown / MDX / プレーンテキストのようなドキュメントファイルそのものを対象にした国際化ユーティリティである。

`README.base.md` のような「ベースファイル」を1つ用意しておき、ビルド操作によって `README.md`(デフォルトロケール)や `README.ja.md`(他ロケール)のような各言語版ファイルを生成する。

### ゴール

- 翻訳の置き場所(ファイル分割 / インライン / カタログ)を用途に応じて選べること。
- 機械翻訳(Google 翻訳など)を任意の翻訳プロバイダとして差し込めること。
- Markdown 内のコードブロックやリンクなど、翻訳してはいけない範囲を自動で保護できること。
- 出力ファイル名・格納方式・翻訳プロバイダ・設定ファイルの重ね合わせなど、広い範囲を設定可能にすること。
- 最小限のランタイム i18n(`t(key, params)`)も同梱すること。

### 非ゴール

- 複数形・ICU MessageFormat などの高度な文法(拡張ポイントとして後方に道は残すが v1 では扱わない)。
- 翻訳の品質管理・レビューワークフロー自体(状態のマーキングまでは行うが、レビューUIなどは範囲外)。
:::

:::kiritan{locale=en}
## 2. Overall pipeline
:::
:::kiritan{locale=ja}
## 2. 全体パイプライン
:::

:::kiritan{locale=en}
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
:::
:::kiritan{locale=ja}
```
discover            base ファイルを glob で発見
  -> parse           Renderer がファイル内容を解析
     - 通常の Markdown/Text: 文書全体 or 段落単位に分解
     - :::kiritan{...} ディレクティブ(remark-directive)があればロケール/idごとのブロックに分解
  -> resolve          TranslationStore が各ロケールの訳文を取得
  -> interpolate      %{name} 変数展開
  -> translate(任意)   訳文が missing な箇所を Translator ミドルウェアチェーンで自動翻訳
  -> reassemble        Renderer が最終的な文書を再構成
  -> write             命名テンプレートに従い出力ファイルを書き出し
```

`kiritan build` はこの一連を実行する。`extract` / `translate` / `check` は同じ基盤の上に立つ個別コマンド(後述)。

**missing 時の build 挙動**: `translate.auto: false`(既定)で、あるロケール・セグメントの訳文が無い場合、`build` はエラーにせず**デフォルトロケール(base)の原文にフォールバック**して出力する(未翻訳箇所と分かるようマーカーコメントを付ける。例: `<!-- kiritan:untranslated (source: en) -->`)。これにより build は常に成功し、壊れたドキュメントが生成されることはない。未翻訳の検出・CIでのブロックは `kiritan check`(8章)が別途担う。
:::

:::kiritan{locale=en}
## 2.1 Package layout (workspaces from v1)
:::
:::kiritan{locale=ja}
## 2.1 パッケージ構成(v1 から workspaces 化)
:::

:::kiritan{locale=en}
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
  config/          # Discovery, cascading, and merging (*.kiritanconfig)
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
- Reference implementations of translate middlewares (`@kiritan/deepl` and `@kiritan/google-translate`, chapter 13) live in the same workspace under `packages/*`. Each is standalone — it doesn't depend on `kiritan`, since a middleware is just a function whose shape is structurally compatible with `translate.middlewares`.
- `extensions/vscode` (the VS Code extension, chapter 13) lives outside `packages/` and so is never picked up by the root `"workspaces": ["packages/*"]` glob — its `package.json` `"name"` is `"kiritan"`, which would otherwise collide with the CLI package's own name (an npm workspace can't have two packages sharing a name). Its build/test tooling is a root-level `devDependency` instead of a package-local one.
- The existing `tsdown` / `vitest` / `eslint` / CI (`ci.yml` and the release workflows) setups need updating for workspace support (per-package build/test/publish). This is treated as an implementation task once the design is finalized.
- Versioning is **independent per package** (no lockstep, no shared changelog-generation tool). Each package has its own `workflow_dispatch` GitHub Actions workflow (`release.yml`, `release-runtime.yml`, `release-deepl.yml`, `release-google-translate.yml`) — thin wrappers around a shared reusable workflow (`_release-package.yml`) that does the actual work — so releasing one package can never touch the other by accident:

  1. Trigger `release-<package>` from the Actions tab with two inputs: `version` (a semver bump — `patch`/`minor`/`major`/`prerelease` — or an explicit version, passed straight to `npm version`) and `dist_tag` (npm dist-tag; empty auto-detects).
  2. The workflow bumps that package's `package.json` (no changeset file, no per-package CHANGELOG.md — GitHub's auto-generated release notes from merged PRs are used instead), regenerates every `base/*.base.md`-derived doc, and runs `npm publish` with **trusted publishing** (OIDC — no `NPM_TOKEN` needed, configured per-package on npmjs.com pointing at that package's own workflow file).
  3. It commits the version bump + regenerated docs, tags the release as `<name>@<version>`, pushes, and creates a GitHub Release.

  Since `kiritan` depends on `@kiritan/runtime`, bumping runtime's minor/major version doesn't automatically update kiritan's dependency range — that's a deliberate manual follow-up, so that releasing runtime alone never touches kiritan's `package.json`.

  (An earlier iteration of this design used [Changesets](https://github.com/changesets/changesets), with a changeset file committed per PR driving both the version bump and CHANGELOG generation at release time. It was replaced with the simpler `npm version`-based flow above — modeled after [oto-lab/npm-biome-ts](https://github.com/oto-lab/npm-biome-ts)'s single-package release workflow — to remove the per-PR changeset-writing step entirely.)
:::
:::kiritan{locale=ja}
将来のモノレポ化(13章)を見据え、v1 から npm workspaces を採用する。ルートは private なワークスペースルートとし、実体は `packages/*` に置く。

```
packages/
  kiritan/       # 本体(core + CLI + 組み込み stores/renderers)。npm 公開名 "kiritan"
  runtime/        # 最小ランタイム i18n(ビルド時依存を持たない)。npm 公開名 "@kiritan/runtime"
```

`packages/kiritan/src/` の内訳(機能ごとにフォルダを分ける粒度):

```
packages/kiritan/src/
  index.ts        # 公開 API(defineConfig, build, extract, translate, check)
  config/          # 探索・カスケード・merge(*.kiritanconfig)
  discover/         # glob で base ファイルを発見、命名テンプレート解決
  directive/         # remark-directive で :::kiritan{...} を抽出
  stores/             # sidecar / inline / catalog
  renderers/           # markdown / mdx / text
  interpolate/          # %{name} 展開(@kiritan/runtime の実装を利用)
  translate/             # ミドルウェアchainの実行エンジン(7.1のグルーピング)
  hash/                   # stale判定用ハッシュ
  i18n/                    # runtime.sources の集約、typegen、i18n-key-mismatch検出(9章)
  pipeline/                 # build/extract/check/typegen のオーケストレーション
  cli/                       # citty コマンド定義
```

`packages/runtime/src/`:

```
packages/runtime/src/
  index.ts         # createT
  interpolate.ts    # %{name} の共通実装(Kiritan 本体もこれに依存する)
```

(i18next互換のリソース読み込み — 9.4章の `centralized` — は `@kiritan/runtime` ではなく `kiritan` 本体の `i18n/load.ts` にある。ランタイム自身が必要とするものではなく、ビルド時の関心事のため。)

- `kiritan` から `kiritan/runtime` を re-export する形は取らず、`@kiritan/runtime` を独立パッケージにする(`kiritan` は `@kiritan/runtime` に依存しても、逆はない)。ランタイムだけを使いたいプロジェクトが `kiritan` 本体(remark 等のビルド時依存)を一切引き込まずに済む。
- CLI(`src/cli.ts`)以外はすべて CJS/ESM 両対応を維持する。remark/unified/micromark 系の依存は ESM 専用パッケージしか無い(CJS版へ戻すことは「古いバージョンを使う」ことになるため避ける)ため、`tsdown.config.ts` の `deps.alwaysBundle` でこれらを `dist/index.{cjs,mjs}` に直接バンドルし、CJS 利用者が ESM 専用パッケージを `require` する場面自体を無くす。CLI 専用の `citty` はバンドルせず外部依存のままでよい。
- 翻訳ミドルウェアの参考実装(`@kiritan/deepl` と `@kiritan/google-translate`、13章)は同じワークスペースの `packages/*` に置く。それぞれ単体で完結し、`kiritan` には依存しない — ミドルウェアは `translate.middlewares` と構造的に互換な形の単なる関数であるため。
- `extensions/vscode`(VS Code拡張機能、13章)は `packages/` の外に置くため、ルートの `"workspaces": ["packages/*"]` には拾われない — `package.json` の `"name"` が `"kiritan"` で、CLIパッケージ自身の名前と衝突してしまう(npm workspaceは同名パッケージを2つ持てない)ため。ビルド・テストに必要なツールはパッケージ側ではなく、ルートの `devDependency` として持たせる。
- 既存の `tsdown` / `vitest` / `eslint` / CI(`ci.yml` およびリリース用ワークフロー)はワークスペース対応に更新が必要(各パッケージごとのビルド・テスト・公開)。これは設計確定後の実装タスクとして扱う。
- バージョニングは **パッケージごとに独立**させる(lockstep にしない。共有のchangelog生成ツールも使わない)。パッケージごとに専用の `workflow_dispatch` ワークフロー(`release.yml` / `release-runtime.yml` / `release-deepl.yml` / `release-google-translate.yml`)を持ち、どちらも実際の処理を行う共通の再利用可能ワークフロー(`_release-package.yml`)への薄いラッパーにすることで、片方のリリースがもう片方に誤って影響することを防ぐ:

  1. Actions タブから `release-<package>` を、`version`(semverのbump種別 `patch`/`minor`/`major`/`prerelease`、または明示的なバージョン。そのまま `npm version` に渡す)と `dist_tag`(npm dist-tag。空なら自動判定)の2つの入力で実行する。
  2. ワークフローは対象パッケージの `package.json` を更新し(changesetファイルもパッケージごとのCHANGELOG.mdも無く、代わりにマージ済みPRから生成されるGitHubの自動リリースノートを使用)、`base/*.base.md` から生成される全ドキュメントを再生成し、**trusted publishing**(OIDC。`NPM_TOKEN` 不要。パッケージごとに npmjs.com 側でそのパッケージ自身のワークフローファイルを指定して設定)で `npm publish` する。
  3. バージョンアップ+再生成ドキュメントをコミットし、`<name>@<version>` タグを打ってpushし、GitHub Release を作成する。

  `kiritan` は `@kiritan/runtime` に依存しているため、runtimeのminor/majorバージョンを上げても kiritan 側の依存範囲は自動更新されない — これは意図的な仕様で、runtime単体のリリースが kiritan の `package.json` に触れることが無いようにするための、意図的な手動フォローアップである。

  (この設計の以前のバージョンでは [Changesets](https://github.com/changesets/changesets) を使用しており、PRごとにコミットするchangesetファイルがリリース時のバージョンアップとCHANGELOG生成の両方を駆動していた。[oto-lab/npm-biome-ts](https://github.com/oto-lab/npm-biome-ts) の単一パッケージ向けリリースワークフローを参考に、PRごとのchangeset作成という手順自体を無くすため、上記のよりシンプルな `npm version` ベースの方式に置き換えた。)
:::

:::kiritan{locale=en}
## 3. Config files
:::
:::kiritan{locale=ja}
## 3. 設定ファイル
:::

:::kiritan{locale=en}
### 3.1 Discovery and cascading
:::
:::kiritan{locale=ja}
### 3.1 探索とカスケード
:::

:::kiritan{locale=en}
Filenames matching `(<mode>|local)?\.?kiritanconfig` are recognized (e.g. `.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`) — deliberately a single, non-extension name rather than `.js`/`.mjs`/etc, so file-icon themes (vscode-icons and similar) never mistake it for a generic JavaScript file (chapter 13). Every file is still plain ESM JavaScript under the hood, and is loaded with a lightweight loader, [jiti](https://github.com/unjs/jiti), configured to treat `kiritanconfig` as a recognized extension (Node's own loader refuses to `import()` a file whose extension it doesn't know, and `kiritanconfig` isn't one). Merge order (lower entries take priority, deep-merged):

1. `.kiritanconfig` — the base layer. There's no separate "explicit base" alias; a project with no mode/local overrides just has this one file.
2. `<mode>.kiritanconfig` — `mode` comes from the `--mode` flag, or the `KIRITAN_MODE` environment variable otherwise. This layer is skipped if neither is set.
3. `local.kiritanconfig` — always applied last. Intended to be `.gitignore`d (for local overrides such as API keys).
4. `--config <path>` / `--overlay <path>` (repeatable) — additional config files can be layered on from the CLI.

Objects are deep-merged; arrays (such as `sources`) are replaced by default. Wrap with the `mergeArray(...)` helper to concatenate instead.
:::
:::kiritan{locale=ja}
ファイル名は `(<mode>|local)?\.?kiritanconfig`(例: `.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`)を認識する。あえて `.js`/`.mjs` 等の実在する拡張子を使わない単一の名前にしている — vscode-iconsのようなファイルアイコンテーマに、単なるJavaScriptファイルと誤認されないようにするため(13章)。中身はどのファイルも普通のESM JavaScriptであり、[jiti](https://github.com/unjs/jiti) のような軽量ローダーで読み込む(`kiritanconfig` を既知の拡張子として扱うよう設定している — Nodeの標準ローダーは、知らない拡張子のファイルを`import()`しようとすると拒否するため)。マージ順(下ほど優先度が高く、深いマージ):

1. `.kiritanconfig` — 基本レイヤー。「明示的なbase」という別名は無く、mode/localの上書きが無いプロジェクトはこの1ファイルだけで完結する。
2. `<mode>.kiritanconfig` — `mode` は `--mode` フラグ、なければ `KIRITAN_MODE` 環境変数。指定が無ければこのレイヤーはスキップ。
3. `local.kiritanconfig` — 常に最後に適用。`.gitignore` 対象を想定(APIキー等のローカル上書き用)。
4. `--config <path>` / `--overlay <path>`(複数指定可)— CLI から任意の設定ファイルを追加で重ねられる。

オブジェクトは深いマージ、配列(`sources` など)はデフォルトで置換。連結したい場合は `mergeArray(...)` ヘルパーで包む。
:::

:::kiritan{locale=en}
### 3.2 Config schema (the scope of `*.kiritanconfig`)
:::
:::kiritan{locale=ja}
### 3.2 設定スキーマ(`*.kiritanconfig` のスコープ)
:::

:::kiritan{locale=en}
The following is everything configurable via `*.kiritanconfig`. This is the entirety of `KiritanConfig` — there are no configuration items beyond it.

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

(`ResourceSourceConfig`'s `strategy`, custom middlewares passed to `translate.middlewares`, and custom implementations passed to `plugins` are all `import`ed directly and passed in from within a `*.kiritanconfig` file — configuration stays pure "wiring," and the actual implementation is written as an ordinary TS/JS module.)

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
:::
:::kiritan{locale=ja}
`*.kiritanconfig` で設定できる範囲は次の通り。これが `KiritanConfig` の全体像であり、これ以外の設定項目は無い。

| トップレベルキー | 何を設定するか |
| --- | --- |
| `locales` | 対応ロケール一覧とデフォルトロケール |
| `sources` | ドキュメントビルド対象(4章 `TranslationStore` 戦略・7章翻訳) |
| `naming` | ドキュメント出力ファイル名のテンプレート/プリセット(3.3章) |
| `interpolation` | `%{name}` 変数展開(5章) |
| `translate` | 翻訳ミドルウェアchainの既定値(7章) |
| `runtime` | ランタイム i18n リソースの配置戦略(9章) |
| `check` | `kiritan check` が何を失敗条件にするか(8章) |
| `switcher` | 言語切り替えリンクの自動挿入(6.1章) |
| `plugins` | カスタム `TranslationStore` / `Renderer` の登録 |

(`ResourceSourceConfig` の `strategy`、`translate.middlewares` に渡すカスタムミドルウェア、`plugins` に渡すカスタム実装は、いずれも `*.kiritanconfig` ファイル内で `import` して直接渡す — 設定は「配線」に徹し、実装本体は普通の TS/JS モジュールとして書く)

```ts
interface KiritanConfig {
  locales: { default: string; list: string[] };
  sources: SourceConfig[];
  naming?: {
    preset?: 'dot' | 'dash' | 'prefix' | 'folder'; // 3.3章のプリセット。指定すると template の既定値だけを差し替える
    template?: string; // 既定: "{dir}/{base}.{locale}.{ext}"(preset より優先)
    defaultTemplate?: string; // デフォルトロケール専用のテンプレート(省略時は omitDefaultLocaleSuffix に従う)
    omitDefaultLocaleSuffix?: boolean; // 既定: true。defaultTemplate が無い場合のみ有効
    baseSuffix?: string; // 既定: ".base"(README.base.md の判定に使う)
    outputs?: Record<string, string>; // ロケール別の明示的な出力パス上書き。例: { ja: "i18n/ja/README.md" }
  };
  interpolation?: {
    delimiters?: [string, string]; // 既定: ["%{", "}"]
    variables?: Record<string, string | Record<string, string>> | ((ctx: BuildContext) => Record<string, string>);
    onMissing?: 'error' | 'keep' | 'empty'; // 既定: 'error'
    skipCodeBlocks?: boolean; // 既定: true
  };
  translate?: {
    middlewares?: TranslateMiddleware[]; // 既定: [](何もしない = manual 相当)
    auto?: boolean; // 既定: false。true でないと missing 訳文の自動翻訳は走らない
  };
  runtime?: {
    sources?: ResourceSourceConfig[]; // colocated/split/centralized/embedded を混在可(9.1章)
    fallbackLocale?: string;
  };
  check?: {
    failOn?: Array<'missing' | 'stale' | 'machine' | 'i18n-key-mismatch'>; // 既定: ['missing', 'stale', 'i18n-key-mismatch']
  };
  switcher?: SwitcherConfig; // 既定で有効(6.1章)
  plugins?: {
    stores?: Record<string, TranslationStore>;
    renderers?: Record<string, Renderer>;
  };
}

interface SourceConfig {
  glob: string;
  strategy: 'sidecar' | 'inline' | 'catalog' | string; // string はカスタムストアID
  naming?: KiritanConfig['naming']; // このソースについてのみ naming を丸ごと上書き(template/outputs 等)
  translate?: KiritanConfig['translate']; // ソース単位の上書き
  switcher?: SwitcherConfig; // このソースについてのみ switcher を丸ごと上書き(6.1章)
}
```

`naming.outputs`(ロケール別の明示パス上書き)は用途上ソースごとに違う値を持ちたいことが多いため、基本形としては `SourceConfig.naming` に書く(グローバルな `naming` は「テンプレートの既定値」の位置づけにとどめる)。
:::

:::kiritan{locale=en}
### 3.3 Naming template presets
:::
:::kiritan{locale=ja}
### 3.3 命名テンプレートのプリセット
:::

:::kiritan{locale=en}
Since there are several conventions for naming output files (`README.ja.md` style, `README-ja.md` style, `ja.README.md` style, folder-based, etc.), `naming.template` can be written as any completely free-form string template, while the common forms are available via just a `naming.preset` value.

| preset | Actual template | Output example (base="README", ext="md", locale="ja") |
| --- | --- | --- |
| `dot` (default) | `{dir}/{base}.{locale}.{ext}` | `README.ja.md` |
| `dash` | `{dir}/{base}-{locale}.{ext}` | `README-ja.md` |
| `prefix` | `{dir}/{locale}.{base}.{ext}` | `ja.README.md` |
| `folder` | `{dir}/{locale}/{base}.{ext}` | `ja/README.md` |

`preset` is just a shorthand that swaps `template`'s default value; specifying `template` directly allows any arrangement or separator not covered by a preset (e.g. `{base}_{locale}.{ext}`). `naming.defaultTemplate`, `omitDefaultLocaleSuffix`, and `outputs` all work the same way regardless of whether a preset is used.
:::
:::kiritan{locale=ja}
出力ファイル名の付け方には流派があるため(`README.ja.md` 派、`README-ja.md` 派、`ja.README.md` 派、フォルダ分け派など)、`naming.template` は任意の文字列テンプレートとして完全に自由に書けるようにしつつ、よく使う形は `naming.preset` の指定だけで済むようにする。

| preset | 実際のテンプレート | 出力例(base="README", ext="md", locale="ja") |
| --- | --- | --- |
| `dot`(既定) | `{dir}/{base}.{locale}.{ext}` | `README.ja.md` |
| `dash` | `{dir}/{base}-{locale}.{ext}` | `README-ja.md` |
| `prefix` | `{dir}/{locale}.{base}.{ext}` | `ja.README.md` |
| `folder` | `{dir}/{locale}/{base}.{ext}` | `ja/README.md` |

`preset` はあくまで `template` の既定値を差し替えるショートハンドであり、`template` を直接指定すればどのプリセットにも無い任意の並び・区切り文字(`{base}_{locale}.{ext}` など)も自由に書ける。`naming.defaultTemplate`・`omitDefaultLocaleSuffix`・`outputs` は preset の有無に関わらず同様に効く。
:::

:::kiritan{locale=en}
## 4. Translation storage strategies (`TranslationStore`)
:::
:::kiritan{locale=ja}
## 4. 翻訳格納戦略(`TranslationStore`)
:::

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

:::kiritan{locale=en}
Strategies can be mixed within the same config (one document using `inline`, another using `catalog`, and so on).
:::
:::kiritan{locale=ja}
同じ設定内で戦略を混在させられる(あるドキュメントは `inline`、別のドキュメントは `catalog`、など)。
:::

:::kiritan{locale=en}
### 4.1 `sidecar` — split-file approach
:::
:::kiritan{locale=ja}
### 4.1 `sidecar` — ファイル分割方式
:::

:::kiritan{locale=en}
For `README.base.md`, an independent file per language, such as `README.ja.md`, is prepared, whether by hand or via machine translation. This is closest to how README translations are conventionally handled today. Stale detection is done via a hash comment embedded at the top of the output file (e.g. `<!-- kiritan:source-hash: xxxx -->`).
:::
:::kiritan{locale=ja}
`README.base.md` に対し、`README.ja.md` のように言語ごとに独立したファイルを人力・機械翻訳問わず用意する。既存の README 翻訳運用にもっとも近い。ステイル検知は、出力ファイル先頭に埋め込むハッシュコメント(例: `<!-- kiritan:source-hash: xxxx -->`)で行う。
:::

:::kiritan{locale=en}
### 4.2 `inline` — laying out every language in one file
:::
:::kiritan{locale=ja}
### 4.2 `inline` — 1ファイル内に各言語を並べる方式
:::

:::kiritan{locale=en}
This follows [remark-directive](https://github.com/remarkjs/remark-directive)'s standard container-directive syntax (`:::name{attrs}` ... `:::`) as-is. No custom line parser is written, so it rides directly on the remark ecosystem (syntax highlighting, existing VS Code extensions, etc.).

Each locale is written as its **own, self-contained directive** (never a single block with a "switch"-like structure packing multiple cases together).

**When targeting the whole document:**
:::
:::kiritan{locale=ja}
[remark-directive](https://github.com/remarkjs/remark-directive) の標準的なコンテナディレクティブ構文(`:::name{attrs}` ... `:::`)にそのまま準拠する。独自の行パーサは作らず、remark のエコシステム(構文ハイライト、既存の VS Code 拡張など)にそのまま乗る。

ロケールごとに**独立した1つの directive**として書く(1つのブロックに複数ケースを詰め込む「switch」のような構造にはしない)。

**文書全体を対象にする場合:**
:::

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

:::kiritan{locale=en}
**When targeting individual sections (wrapping only the parts that differ):**
:::
:::kiritan{locale=ja}
**セクション単位で対象にする場合(差分がある部分だけを囲む):**
:::

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

:::kiritan{locale=en}
Anything outside a directive is copied as-is into every locale's output as "shared content." This supports translating only part of a document while sharing the rest.

**Nesting (using `:::` again inside a block):** just add more colons on the outer fence, per remark-directive's standard behavior (e.g. using `:::note` inside `::::kiritan{locale=en}`). No special handling is needed on Kiritan's side.

Specifying a `locale=xx` value not present in `locales.list` is treated as a typo and errors at build time (it is never silently ignored).
:::
:::kiritan{locale=ja}
directive の外側は「共通コンテンツ」として全ロケール出力にそのままコピーされる。ドキュメントの一部だけ翻訳し、残りは共有する運用に対応する。

**ネスト(ブロック内でさらに `:::` を使いたい場合):** remark-directive 標準の挙動どおり、外側のコロンを増やせばよい(`::::kiritan{locale=en}` の中で `:::note` を使う、など)。Kiritan 側で特別な処理は不要。

`locale=xx` に `locales.list` に無い値を指定した場合は typo とみなし、build 時にエラーにする(サイレントに無視しない)。
:::

:::kiritan{locale=en}
### 4.3 `catalog` — segment-level catalog approach
:::
:::kiritan{locale=ja}
### 4.3 `catalog` — セグメント単位のカタログ方式
:::

:::kiritan{locale=en}
Segment ids are never auto-inferred (position-based or content-hash-based) — the **author assigns them explicitly on the base file side**. remark-directive's `#id` attribute shorthand is used as-is.
:::
:::kiritan{locale=ja}
セグメントIDは自動推定(位置ベース／内容ハッシュベース)にせず、**著者が base ファイル側で明示的に付ける**。remark-directive の `#id` 属性ショートハンドをそのまま使う。
:::

```md
:::kiritan{#usage-intro}
## Usage
This is the usage section.
:::
```

:::kiritan{locale=en}
- The content inside a `:::kiritan{#<id>}` block is the base locale's (`locales.default`) original text itself.
- Translations are kept in a separate file, such as `locales/README.ja.yaml`, as `id → { text, machine, hash }` (`hash` refers to "what the original text for this id looked like when it was last translated" — it's only used for `stale` detection when it no longer matches the current original, never for id matching itself).
- Since the author fully controls the id, translations never go "missing" just because the surrounding prose was reworded (the correspondence is pinned by id) — in exchange, assigning and naming ids becomes the author's responsibility (the same mindset as key design in an i18n library).
- The area outside `:::kiritan{#<id>}` is treated as "shared content," same as `inline`.
- `kiritan extract` scans the base file's `:::kiritan{#<id>}` blocks and adds any id not yet registered in the catalog (existing translations are never overwritten). If an id disappears from the base file, it's left in the catalog as an orphan, and `kiritan check` warns about it.
:::
:::kiritan{locale=ja}
- `:::kiritan{#<id>}` ブロックの中身は base ロケール(`locales.default`)の原文そのもの。
- 訳文は `locales/README.ja.yaml` のような別ファイルに `id → { text, machine, hash }` で保持する(`hash` は「この id の原文が最後に翻訳された時点の内容」を指し、現在の原文と食い違えば `stale` 判定に使うだけで、id のマッチング自体には使わない)。
- id は著者が完全にコントロールするため、文章を多少書き直しても訳文が「迷子」になることはなく(対応関係は id で固定)、その代わり id の採番・命名は著者の責任になる(i18n ライブラリのキー設計と同じ考え方)。
- `:::kiritan{#<id>}` の外側は `inline` と同様「共通コンテンツ」として扱う。
- `kiritan extract` は base 内の `:::kiritan{#<id>}` を走査し、カタログに未登録の id を追加する(既存の訳文は上書きしない)。id が base から消えた場合はカタログ側にオーファンとして残し、`kiritan check` で警告する。
:::

:::kiritan{locale=en}
## 5. Variable expansion (`%{name}`)
:::
:::kiritan{locale=ja}
## 5. 変数展開(`%{name}`)
:::

:::kiritan{locale=en}
A mechanism for embedding values shared across locales — a version number, a repository URL, a site name, and the like. `{{...}}` collides too easily with Handlebars/Mustache/i18next and similar, so `%{name}`, closer to Ruby/Rails' i18n, is the default (the delimiters themselves can be changed via `interpolation.delimiters`).
:::
:::kiritan{locale=ja}
ロケールをまたいで共通の値(バージョン番号、リポジトリURL、サイト名など)を埋め込むための仕組み。`{{...}}` は Handlebars/Mustache/i18next 等と被りやすいため、Ruby/Rails の i18n に近い `%{name}` を既定にする(区切り文字自体は `interpolation.delimiters` で変更可能)。
:::

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

:::kiritan{locale=en}
- A variable's value comes from `interpolation.variables` (or a `variables` function's return value) alone — a catalog translation record, for instance, never supplies a variable's value. If both a per-locale value (`{ en: ..., ja: ... }`) and a shared value are defined for the same variable name, **the per-locale value takes priority**, falling back to the shared value if absent.
- Can be escaped with a backslash, as in `\%{literal}`.
- With `interpolation.skipCodeBlocks: true` (the default), expansion is skipped inside code blocks / inline code.
- How an undefined variable is handled is controlled by `onMissing` (default `'error'`), so a typo can be caught at build time.
- Making the variable resolution itself a function also allows dynamic values, such as reading a value out of `package.json`.
:::
:::kiritan{locale=ja}
- 変数の値は `interpolation.variables`(または `variables` 関数の戻り値)のみが唯一の情報源であり、catalog 等の訳文レコードから変数値が供給されることはない。同じ変数名に対しロケール別の値(`{ en: ..., ja: ... }`)と共通値が両方定義されている場合は、**ロケール別の値がある方を優先**し、無ければ共通値にフォールバックする。
- `\%{literal}` のようにバックスラッシュでエスケープ可能。
- `interpolation.skipCodeBlocks: true`(既定)でコードブロック / インラインコード内は展開しない。
- 未定義変数の扱いは `onMissing`(既定 `'error'`)で制御し、typo をビルド時に検出できるようにする。
- 変数解決自体を関数にすれば、`package.json` の値を読むなど動的な値も扱える。
:::

:::kiritan{locale=en}
## 6. Renderers (`Renderer`)
:::
:::kiritan{locale=ja}
## 6. レンダラー(`Renderer`)
:::

```ts
interface Renderer {
  id: string;
  parse(sourceText: string): ParsedDocument;
  reassemble(doc: ParsedDocument, translated: Record<string, string> | string): string;
}
```

:::kiritan{locale=en}
- `markdown`: AST parsing via remark + `remark-directive`. Code blocks, inline code, and link URLs are protected, and `:::kiritan{...}` directives are also split apart here. This is the only renderer v1 actually implements — every source is processed as Markdown regardless of its extension.
- `text`, `mdx`, front-matter protection (`translateFrontmatter`), `plugins.renderers` for custom renderers, and the strategy/renderer compatibility validation described below are all still design-stage, not implemented in v1 (tracked in chapter 13).
:::
:::kiritan{locale=ja}
- `markdown`: remark + `remark-directive` による AST 解析。コードブロック・インラインコード・リンク URL を保護し、`:::kiritan{...}` ディレクティブの分解もここで行う。v1で実際に実装されているレンダラーはこれのみで、拡張子に関わらず全ソースをMarkdownとして処理する。
- `text`・`mdx`・front matter保護(`translateFrontmatter`)・カスタムレンダラー用の `plugins.renderers`、および後述のstrategy/レンダラー組み合わせ検証は、いずれもまだ設計段階でv1では未実装(13章で追跡)。
:::

:::kiritan{locale=en}
The design intent for once these are implemented:
- `text`: split per blank-line-delimited paragraph. Since `.txt` has no Markdown syntax, `:::kiritan{...}` can't be used, so `inline`/`catalog` strategies wouldn't be supported (only `sidecar` would be).
- `mdx`: a Markdown extension. JSX parts would never be translated. `:::kiritan{...}` could be used the same way as in markdown.
- A renderer would declare which `strategy` values it supports (e.g. `text` only declaring `['sidecar']`). When config is loaded, the combination of `SourceConfig.strategy` and the actual file type (renderer) would be validated, and an unsupported combination (e.g. `inline` on a `.txt` file) rejected with a clear error before build.
:::
:::kiritan{locale=ja}
実装された場合の設計意図:
- `text`: 空行区切りの段落単位。`.txt` には Markdown 構文が無いため `:::kiritan{...}` は使えず、`inline`/`catalog` 戦略は非対応(`sidecar` のみ)になる想定。
- `mdx`: markdown 拡張。JSX 部分は非翻訳。`:::kiritan{...}` は markdown 同様に扱えるようにする想定。
- レンダラーは自分が対応できる `strategy` の一覧を宣言する(例: `text` は `['sidecar']` のみ)。設定読み込み時に `SourceConfig.strategy` と実際のファイル種別(レンダラー)の組み合わせを検証し、非対応の組み合わせ(例: `.txt` に `inline`)は build 前に分かりやすいエラーで弾く想定。
:::

:::kiritan{locale=en}
### 6.1 Automatic insertion of language-switcher links (`switcher`)
:::
:::kiritan{locale=ja}
### 6.1 言語切り替えリンクの自動挿入(`switcher`)
:::

:::kiritan{locale=en}
Builds a language-switcher link automatically at build time, of the kind commonly seen in bilingual READMEs: `[English](README.md) | [日本語](README.ja.md)`. Since this is mechanical link generation, a different kind of thing from translation, it's **enabled by default**, unlike `translate.auto` (off by default).

**Specifying where it's inserted**: writing `::kiritan{switcher}` — a remark-directive leaf directive (a content-less `::name` form) — anywhere in the base file inserts it at that spot (the same `remark-directive` mechanism as the container directives in chapters 4.2/4.3).
:::
:::kiritan{locale=ja}
`[English](README.md) | [日本語](README.ja.md)` のような、バイリンガル README でよく見る言語切り替えリンクを build 時に自動生成する。翻訳とは性質が異なる機械的なリンク生成なので、`translate.auto`(既定 off)とは異なり**既定で有効**にする。

**挿入位置の指定**: remark-directive の leaf directive(内容を持たない `::name` 形式)として `::kiritan{switcher}` を base ファイルの好きな位置に書けば、そこに挿入される(4.2/4.3章のコンテナ directive と同じ `remark-directive` の仕組み)。
:::

```md
# Kiritan

::kiritan{switcher}

Kiritan の説明...
```

:::kiritan{locale=en}
If no explicit marker exists, it's auto-inserted at `switcher.position` (default `'after-heading'`: right after the first heading, or at the top if there's none) when `switcher.enabled` (default `true`). **If a marker exists, it's always used regardless of the `enabled`/`position` values** (an explicit placement wins over the default behavior).

**Generated content**: for each locale in `locales.list`, a link to that locale's output file path (reusing the naming resolution from chapter 3.3, also honoring a per-source `naming.outputs` override) is **automatically computed** as a path relative to the output file currently being built, then joined with a separator (default `" | "`). There's no way to specify an `href` manually (if you want to write a link by hand, just write it yourself instead of using this feature). The current locale itself isn't linked — it's shown in bold (it can also be turned into a link via `currentLocaleLink: true`).

**Displayed language labels**: Kiritan doesn't maintain its own list of language names (a hand-maintained list risks gaps). The default label uses the standard [`Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames) (ECMA-402, built into Node.js, based on CLDR data) to automatically display each locale's autonym — the name a locale uses for itself in its own language (e.g. "日本語" for `ja`, "English" for `en`). This needs no extra dependency and no list to maintain.

```ts
// Default label resolution (used for any locale with no explicit override in labels)
new Intl.DisplayNames([locale], { type: "language" }).of(locale);
```

`switcher.labels` remains as an opt-in override for cases where this default needs to be replaced (wanting a different name, a custom locale code `Intl.DisplayNames` doesn't know, excluding an unsupported locale from the list, etc.).
:::
:::kiritan{locale=ja}
明示的なマーカーが無い場合、`switcher.enabled`(既定 `true`)なら `switcher.position`(既定 `'after-heading'`: 最初の見出しの直後、無ければ先頭)に自動挿入する。**マーカーが存在する場合は `enabled`/`position` の値に関わらず必ずそこが使われる**(明示指定が既定動作より優先)。

**生成される内容**: `locales.list` の各ロケールについて、そのロケール向け出力ファイルパス(3.3章の命名解決を再利用、`naming.outputs` のソース単位上書きも考慮)へのリンクを、現在ビルド中のロケールの出力ファイルからの相対パスで**自動計算**し、区切り文字(既定 `" | "`)で連結する。href を手動指定する手段は無い(手動でリンクを書きたい場合は、この機能を使わず自分で書けばよい)。現在のロケール自身はリンクにせず太字表示にする(`currentLocaleLink: true` でリンク化も可能)。

**言語名の表示ラベル**: Kiritan は言語名一覧を自前で持たない(手作りのリストは抜け漏れが怖いため)。既定のラベルは標準の [`Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)(ECMA-402、Node.js に標準搭載、CLDR のデータに基づく)を使い、各ロケールの自称(autonym: そのロケール自身の言語でその言語を呼ぶ名前。例: `ja` なら "日本語"、`en` なら "English")を自動的に表示する。追加の依存もメンテすべき一覧も不要になる。

```ts
// 既定のラベル解決(labels で明示指定が無いロケールに対して行う)
new Intl.DisplayNames([locale], { type: "language" }).of(locale);
```

`switcher.labels` は、この既定を上書きしたい場合(呼び方を変えたい、`Intl.DisplayNames` が知らない独自のロケールコード、対応外のロケールを一覧から外したい、など)のためのオプトインの上書き手段として残す。
:::

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

:::kiritan{locale=en}
It can be wholesale-overridden per source via `SourceConfig.switcher` (disabling it for a specific document, changing its labels, etc.).

Generated example (`locales.list: ['en', 'ja', 'es']`, the `labels` above, building `en`):
:::
:::kiritan{locale=ja}
`SourceConfig.switcher` でソース単位に丸ごと上書きできる(特定のドキュメントだけ無効化する、ラベルを変える、など)。

生成例(`locales.list: ['en', 'ja', 'es']`、上記 `labels`、en ビルド時):
:::

```md
**English** | [日本語](README.ja.md)
```

:::kiritan{locale=en}
Since `::kiritan{switcher}` inserts the same content into every locale's output, it should be placed **outside** an `inline`/`catalog` strategy's `:::kiritan{locale=...}`/`:::kiritan{#<id>}` block (in the shared-content area). Placing it inside a block leads to the confusing behavior of the switcher appearing only in that one locale's output, so a warning is issued at build time in that case.
:::
:::kiritan{locale=ja}
`::kiritan{switcher}` はすべてのロケール向け出力に共通で挿入される内容なので、`inline`/`catalog` 戦略の `:::kiritan{locale=...}`/`:::kiritan{#<id>}` ブロックの**外側**(共通コンテンツの領域)に置く。ブロック内側に置いた場合はそのロケールの出力にしか switcher が出ないという分かりにくい挙動になるため、build 時に警告する。
:::

:::kiritan{locale=en}
## 7. Translate middleware chain (`TranslateMiddleware`)
:::
:::kiritan{locale=ja}
## 7. 翻訳ミドルウェアチェーン(`TranslateMiddleware`)
:::

:::kiritan{locale=en}
Rather than picking a single provider, this is designed so small pieces of processing can be chained together, Vite/Koa-plugin style. For one `missing` translation, middlewares are applied in order from the front, and processing stops as soon as one of them resolves a value.
:::
:::kiritan{locale=ja}
単一プロバイダを選ぶのではなく、Vite/Koa のプラグインのように「小さな処理を連鎖(chain)」できる設計にする。1つの `missing` 訳文に対して、ミドルウェアを先頭から順に適用し、いずれかが値を確定させた時点で終了する。
:::

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

:::kiritan{locale=en}
- The default is `middlewares: []` (equivalent to `manual`), and auto-translation never runs at all unless `translate.auto` is `true`. **This default (off) is kept as the design evolves, and is re-confirmed whenever a new place that needs an on/off decision comes up.**
- The calling convention (once per paragraph, or all at once as a batch) isn't decided by the core — **middleware authors are free to implement it either way**. Two forms are allowed for this reason:
  - Single form: `(ctx: TranslateContext, next) => Promise<string | null>` — the simplest form, called once per item.
  - Batch form: `(ctxs: TranslateContext[]) => Promise<(string | null)[]>` — for when multiple items should be processed together in one call. The core looks at a middleware's shape (its function signature/flag) and passes items one at a time for a single-form middleware, or all missing items together for a batch-form one.
  - Kiritan itself doesn't bundle concrete provider middlewares (to avoid adding dependencies). They ship as separate packages instead, starting with `@kiritan/deepl` and `@kiritan/google-translate` (chapter 13).
- Anywhere auto-translation fills a gap, it's always marked `machine: true` (a field for `catalog`, a comment marker for `sidecar`/`inline`), so `kiritan check` can detect it as awaiting review.
- The whole chain can be wholesale-overridden per source (`sources[i].translate`).
:::
:::kiritan{locale=ja}
- 既定は `middlewares: []`(＝ `manual` 相当)で、`translate.auto` が `true` でない限り自動翻訳は一切走らない。**この既定値(off)は今後の設計でも維持し、on/off の判断が必要な箇所が出るたびに都度確認する。**
- 呼び出し方(段落ごとに1回 or まとめてバッチ)はコアが決め打ちにせず、**ミドルウェア作成者が自由に実装できる**ようにする。そのため2つの形を許容する:
  - 単発形: `(ctx: TranslateContext, next) => Promise<string | null>` — 1件ずつ呼ばれる、最も単純な形。
  - バッチ形: `(ctxs: TranslateContext[]) => Promise<(string | null)[]>` — 1回の呼び出しで複数件まとめて処理したい場合用。コアはミドルウェアの形(関数のシグネチャ/フラグ)を見て、単発なら1件ずつ、バッチなら missing 分をまとめて渡す。
  - Kiritan 自体は具体的なプロバイダのミドルウェアを内蔵しない(依存を増やさない)。代わりに別パッケージとして提供し、まず `@kiritan/deepl` と `@kiritan/google-translate` から始める(13章)。
- 自動翻訳で埋まった箇所は必ず `machine: true` としてマーキングし(`catalog` はフィールド、`sidecar`/`inline` はコメントマーカー)、`kiritan check` でレビュー待ちとして検出できるようにする。
- ソース単位(`sources[i].translate`)でチェーン自体を丸ごと上書きできる。
:::

:::kiritan{locale=en}
> Official reference implementations are split out as separate packages, such as `@kiritan/deepl` and `@kiritan/google-translate` (see chapter 13).
:::
:::kiritan{locale=ja}
> 公式のリファレンス実装は、`@kiritan/deepl` や `@kiritan/google-translate` のように別パッケージとして切り出している(13章参照)。
:::

:::kiritan{locale=en}
### 7.1 Mixing single-form and batch-form middlewares
:::
:::kiritan{locale=ja}
### 7.1 単発形とバッチ形の混在
:::

:::kiritan{locale=en}
Single-form and batch-form middlewares may be mixed within the `translate.middlewares` array. The pipeline scans the array from the front, automatically grouping consecutive single-form middlewares into one "single group," while each batch-form middleware forms its own standalone "batch group."
:::
:::kiritan{locale=ja}
`translate.middlewares` 配列には単発形とバッチ形を混在させてよい。パイプラインは配列を先頭から見て、連続する単発形を1つの「単発グループ」として自動的にまとめ、バッチ形はそれ単体で1つの「バッチグループ」として扱う。
:::

```ts
middlewares: [
  cacheMiddleware(),      // Single form ┐
  localGlossary(),        // Single form ┘→ Group A (chained item-by-item via ctx/next)
  googleTranslateBatch(), // Batch form    → Group B (all items still missing at that point, passed together)
  postProcess(),          // Single form    → Group C (applied only to what Group B didn't resolve)
]
```

:::kiritan{locale=en}
Groups run in array order, and only the items a group didn't resolve are passed on to the next group. This lets a combination like "check the cache one item at a time first → throw the rest at an API together → format each remaining item one at a time at the end" be expressed naturally.
:::
:::kiritan{locale=ja}
グループは配列順に実行され、あるグループで解決しなかったアイテムだけが次のグループに渡される。これにより「まず1件ずつキャッシュを見る→残りをまとめてAPIに投げる→最後に1件ずつ整形する」のような組み合わせが自然に書ける。
:::

:::kiritan{locale=en}
## 8. Stale detection
:::
:::kiritan{locale=ja}
## 8. ステイル検知
:::

:::kiritan{locale=en}
- `sidecar` / `inline`: embed a hash comment of the source into the output (or each block), and compare it against the base side's current hash.
- `catalog`: each segment's translation record keeps the corresponding base hash.
- `kiritan check` detects the presence of `missing` / `stale` / unreviewed `machine` translations and runtime resource `i18n-key-mismatch` (chapter 9.4), and can exit non-zero in CI. What's checked is configurable:

  ```ts
  check?: {
    failOn?: Array<'missing' | 'stale' | 'machine' | 'i18n-key-mismatch'>; // Default: ['missing', 'stale', 'i18n-key-mismatch'] (machine is a warning-only default)
  };
  ```
- `kiritan check --json` prints the same `CheckResult` as structured JSON instead (plus `interpolationVariableNames` and `delimiters`, resolved from `interpolation`) — meant for editor tooling rather than humans; the VS Code extension's inline `missing`/`stale`/`machine` indicators and undefined-`%{name}` warnings (chapter 13) are its only consumer so far.
- Since the hash function only needs to be good enough for tamper detection and doesn't need cryptographic strength, a lightweight non-cryptographic xxhash-family hash (e.g. [`xxhash-wasm`](https://github.com/jungomi/xxhash-wasm)) is adopted as a dependency. The output is embedded as a hex string in the hash comment/catalog file.

  > **Implementation note**: this was ultimately implemented via Node's built-in `node:crypto` instead, to avoid a WASM dependency's bundling complexity in a package that ships both CJS and ESM — see `packages/kiritan/src/hash/index.ts`.
:::
:::kiritan{locale=ja}
- `sidecar` / `inline`: 出力(または各ブロック)にソースのハッシュコメントを埋め込み、base 側の現在のハッシュと比較。
- `catalog`: 各セグメントの訳文レコードに対応する base ハッシュを保持。
- `kiritan check` は `missing` / `stale` / 未レビューの `machine` 訳文 / ランタイムリソースの `i18n-key-mismatch`(9.4章)の存在を検出し、CI で非ゼロ終了できるようにする。判定対象は設定可能にする:

  ```ts
  check?: {
    failOn?: Array<'missing' | 'stale' | 'machine' | 'i18n-key-mismatch'>; // 既定: ['missing', 'stale', 'i18n-key-mismatch'](machineは既定では警告のみ)
  };
  ```
- `kiritan check --json` は同じ `CheckResult` を(`interpolation` から解決した `interpolationVariableNames` と `delimiters` も添えて)構造化JSONとして出力する — 人間向けではなくエディタツール向け。今のところ利用しているのはVS Code拡張機能のmissing/stale/machineインライン表示と、未定義の`%{name}`警告(13章)のみ。
- ハッシュ関数は改ざん検知目的のみで暗号学的な強度は不要なため、xxhash 系の軽量非暗号ハッシュ(例: [`xxhash-wasm`](https://github.com/jungomi/xxhash-wasm))を依存として採用する。出力は16進文字列でハッシュコメント/カタログファイルに埋め込む。

  > **実装メモ**: 最終的には CJS/ESM 両対応パッケージでの WASM バンドルの複雑さを避けるため、`node:crypto` で実装した(`packages/kiritan/src/hash/index.ts`)。
:::

:::kiritan{locale=en}
## 9. Runtime i18n (`@kiritan/runtime`)
:::
:::kiritan{locale=ja}
## 9. ランタイム i18n(`@kiritan/runtime`)
:::

:::kiritan{locale=en}
The classic i18next approach of "aggregate every key into `locales/{lang}.json`" has persistent complaints: the file bloats, unused keys go unnoticed, PR diffs become hard to read, and comparing all languages for a given key is awkward. Kiritan doesn't take this as its only assumption — following the same thinking as the document-side `TranslationStore` (chapter 4), it lets the **resource's location be chosen as a strategy**.
:::
:::kiritan{locale=ja}
i18next の定番である「`locales/{lang}.json` に全キーを集約する」形式は、ファイルが肥大化する・使われなくなったキーに気づけない・PRの差分が読みにくい・キーごとの全言語比較がしづらい、といった不満が根強い。Kiritan はこれを唯一の前提にせず、ドキュメント側の `TranslationStore`(4章)と同じ考え方で**リソースの置き場所を戦略として選べる**ようにする。
:::

:::kiritan{locale=en}
### 9.1 Resource placement strategies (`ResourceSourceConfig`)
:::
:::kiritan{locale=ja}
### 9.1 リソース配置戦略(`ResourceSourceConfig`)
:::

```ts
interface ResourceSourceConfig {
  glob: string;
  strategy: 'colocated' | 'split' | 'centralized' | 'embedded' | string; // A string means a custom strategy ID
  exportName?: string; // The named export read for the 'embedded' strategy. Default: "i18n"
  namespace?: (filePath: string) => string; // Default: auto-derived from the file path
}
```

:::kiritan{locale=en}
| strategy | Placement | Example |
| --- | --- | --- |
| `colocated` | One file next to the component, holding every locale | `Button.i18n.ts` |
| `split` | Also next to the component, but one file per locale | `Button.en.i18n.ts` / `Button.ja.i18n.ts` |
| `centralized` | Gathered into a dedicated directory, per locale (or as one file). Also an i18next-compatible input format | `locales/en.json` / `locales/{locale}/common.json` |
| `embedded` | No dedicated file — written directly inside the component's own file | `export const i18n = {...}` inside `Button.tsx` |

Every strategy is ultimately converted into the same internal shape, `ResourceModule` (`key → { locale: value }`), so `createT`, `kiritan typegen`, and the key-mismatch check in chapter 9.6 all work identically regardless of strategy. Multiple strategies may be mixed within the same project (by listing multiple entries in `runtime.sources`).
:::
:::kiritan{locale=ja}
| strategy | 置き方 | 例 |
| --- | --- | --- |
| `colocated` | コンポーネントの隣に1ファイル、全ロケールをまとめる | `Button.i18n.ts` |
| `split` | コンポーネントの隣だが、ロケールごとに別ファイル | `Button.en.i18n.ts` / `Button.ja.i18n.ts` |
| `centralized` | 専用ディレクトリにロケールごと(または1つ)にまとめる。i18next 互換の入力形式でもある | `locales/en.json` / `locales/{locale}/common.json` |
| `embedded` | 専用ファイルを作らず、コンポーネント自身のファイル内に直接書く | `Button.tsx` 内の `export const i18n = {...}` |

いずれの戦略も最終的には同じ内部形 `ResourceModule`(`key → { locale: value }`)に変換されるため、`createT`・`kiritan typegen`・9.6章のキー不一致チェックはすべての戦略に対して同じように動く。複数の戦略を同じプロジェクト内で混在させてもよい(`runtime.sources` に複数エントリを並べる)。
:::

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

:::kiritan{locale=en}
The default config `kiritan init` generates recommends the `colocated` strategy with `src/**/*.i18n.{js,ts}` (`.json` may also be included) as the default. It doesn't assume `.ts` — it's usable as-is in a JS-only project too.
:::
:::kiritan{locale=ja}
`kiritan init` が生成する既定設定では `colocated` 戦略・`src/**/*.i18n.{js,ts}`(`.json` も対象に含めてよい)を推奨のデフォルトとする。`.ts` 前提にはせず、JS のみのプロジェクトでもそのまま使える形にする。
:::

:::kiritan{locale=en}
### 9.2 `colocated` — colocated, one file for every language (the native form)
:::
:::kiritan{locale=ja}
### 9.2 `colocated` — コロケート×全言語1ファイル(ネイティブ形式)
:::

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

:::kiritan{locale=en}
- The recommended default is `*.i18n.ts` (getting the most benefit from type safety), but `*.i18n.js` (for JS projects) and `*.i18n.json` are supported equally.
- **Type safety comes for free**: since the `messages` passed to `createT(messages)` is just a plain TS object (`.i18n.ts`) or JSON via `resolveJsonModule` (`.i18n.json`), TypeScript's generic inference alone narrows `t()`'s first argument down to a real key. A typo becomes a compile error with no extra code generation needed (chapter 9.6 covers aggregating multiple files). For `.js`, the benefit of inference is limited unless JSDoc type annotations are present (partially effective in a `checkJs` environment).
- **A gap between locales is visible at a glance, within the same file**: forgetting to write `ja` as in `submit: { en: 'Submit' }` doesn't require searching across files, i18next-style — it's noticed right there (mechanical detection is covered in chapter 9.7).
- Simple `%{param}` interpolation (sharing the same notation and implementation as the document-side variable expansion).
- The fallback order is `locale → fallbackLocale → the key itself`.
- Plurals and ICU are out of scope for v1. Left extensible later via a `formatters` option.
- Since a component's `.i18n.ts` disappears along with the component itself when it's deleted, the "unused translation keys linger forever" problem common with i18next's centralized management is much less likely to happen here. From a bundler's perspective too, an unused component's translations aren't dragged in (this matches the unit of code splitting).
:::
:::kiritan{locale=ja}
- 推奨のデフォルトは `*.i18n.ts`(型安全の恩恵が最大)だが、`*.i18n.js`(JSプロジェクト向け)や `*.i18n.json` も同格でサポートする。
- **型安全は無料で手に入る**: `createT(messages)` に渡す `messages` はただの TS オブジェクト(`.i18n.ts`)または `resolveJsonModule` 経由の JSON(`.i18n.json`)なので、TypeScript のジェネリクス推論だけで `t()` の第一引数が実在するキーに絞り込まれる。typo は別途コード生成をしなくてもコンパイルエラーになる(複数ファイルを集約する場合は9.6章)。`.js` の場合は JSDoc 型注釈が無い限り推論の恩恵は限定的(`checkJs` 環境なら一部効く)。
- **同一ファイル内でロケール間の抜けがひと目で分かる**: `submit: { en: 'Submit' }` のように `ja` を書き忘れても、i18next のようにファイルを跨いで探す必要がなく、その場で気づける(機械的な検出は9.7章)。
- `%{param}` の単純補間(ドキュメント側の変数展開と同じ記法・実装を共有する)。
- フォールバック順は `locale → fallbackLocale → key自身`。
- 複数形・ICU は v1 の範囲外。`formatters` オプションで後から拡張できる形にしておく。
- 未使用になったコンポーネントの `.i18n.ts` はコンポーネント自体の削除と一緒に消えるため、i18next の集中管理でありがちな「使われていない翻訳キーが残り続ける」問題も起きにくい。バンドラーからも、使われていないコンポーネントの翻訳が巻き込まれない(コード分割の単位と一致する)。
:::

:::kiritan{locale=en}
### 9.3 `split` — colocated, but one file per locale
:::
:::kiritan{locale=ja}
### 9.3 `split` — コロケートだがロケールごとに別ファイル
:::

```
src/components/Button/
  Button.en.i18n.ts   // export default { submit: 'Submit', cancel: 'Cancel' }
  Button.ja.i18n.ts   // export default { submit: '送信', cancel: 'キャンセル' }
```

:::kiritan{locale=en}
Files matching a `glob` that includes a locale token (e.g. extracting the `{locale}` part from an actual filename matching `*.{locale}.i18n.ts`) are bundled together as one set and internally merged into the same `ResourceModule` as 9.2. This is an option for when you want to stay colocated but avoid one file growing long with every language in it. Unlike 9.2, the benefit of "noticing a gap within the same file" is lost, so gap detection relies on the mechanical check in chapter 9.7.
:::
:::kiritan{locale=ja}
`glob` にロケールトークンを含む形(例: `*.{locale}.i18n.ts` に対応する実ファイル名から `{locale}` 部分を抽出)で対応するファイル群を1セットとして束ね、内部的に 9.2 と同じ `ResourceModule` へマージする。コロケートはしたいが、1ファイルが多言語で長くなるのを避けたい場合の選択肢。9.2 と違い「同一ファイル内で抜けに気づける」利点は無くなるため、抜けの検出は 9.7 章の機械チェックに頼ることになる。
:::

:::kiritan{locale=en}
### 9.4 `centralized` — gathered into a dedicated directory (i18next-compatible)
:::
:::kiritan{locale=ja}
### 9.4 `centralized` — 専用ディレクトリに集約(i18next 互換)
:::

:::kiritan{locale=en}
To ease migration to and from i18next, its convention (per-locale centralized files like `locales/{locale}/{namespace}.json`) is supported as-is as an input format. Once loaded, the content is internally converted into a `ResourceModule` before being passed to `createT`/`typegen`.

- i18next's plural suffixes (`key_one` / `key_other`, etc.) are **kept and passed through as values, but not interpreted** (since `t()` has no plural-selection logic in v1, the caller has to explicitly pick the right key).
- The namespace follows i18next's own file layout (`{namespace}.json`) as-is.
:::
:::kiritan{locale=ja}
i18next からの移行・i18next への移行を容易にするため、i18next の慣習(`locales/{locale}/{namespace}.json` のようなロケール別集中ファイル)もそのまま入力形式としてサポートする。読み込んだ内容は内部的に `ResourceModule` へ変換してから `createT`/`typegen` に渡す。

- i18next の複数形サフィックス(`key_one` / `key_other` 等)は **解釈はしないが値としては保持・パススルー**する(v1 では `t()` は複数形選択ロジックを持たないため、呼び出し側が明示的にキーを選ぶ運用になる)。
- namespace は i18next 側のファイル配置(`{namespace}.json`)をそのまま踏襲する。
:::

:::kiritan{locale=en}
### 9.5 `embedded` — written directly inside a component file
:::
:::kiritan{locale=ja}
### 9.5 `embedded` — コンポーネントファイル内に直書き
:::

:::kiritan{locale=en}
For when you don't even want a dedicated translation file — you want to write it directly into the component's implementation file.
:::
:::kiritan{locale=ja}
専用の翻訳ファイルすら作らず、コンポーネントの実装ファイルに直接書きたい場合向け。
:::

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

:::kiritan{locale=en}
- If you're just calling `createT(i18n)` directly within the app, no involvement from Kiritan is needed (same as 9.2, it's just a plain TS object).
- Registering `strategy: 'embedded'` in `runtime.sources` makes `kiritan typegen`/`kiritan check` read that file at build time (the same jiti-based dynamic import as reading a config file's `.ts`), pull out just the named export specified by `exportName` (default `"i18n"`), and include it for aggregation/checking.
- Since the component's logic and its translations live in the same file, the file count doesn't grow, but there's a trade-off: files tend to get larger, and importing a large number of `embedded` files raises import cost.
:::
:::kiritan{locale=ja}
- アプリ内で直接 `createT(i18n)` するだけなら Kiritan 側の関与は不要(9.2 と同じくただの TS オブジェクト)。
- `runtime.sources` に `strategy: 'embedded'` を登録すると、`kiritan typegen`/`kiritan check` がビルド時にそのファイルを読み込み(設定ファイルの `.ts` 読み込みと同じ jiti ベースの動的 import)、`exportName`(既定 `"i18n"`)で指定した named export だけを取り出して集約・チェック対象にする。
- コンポーネントのロジックと翻訳が同じファイルに同居するため、ファイル数は増えないが、ファイルが大きくなりやすい・`embedded` を大量に集めると import コストが上がる、という trade-off がある。
:::

:::kiritan{locale=en}
### 9.6 Aggregating multiple files and generating types (`kiritan typegen`)
:::
:::kiritan{locale=ja}
### 9.6 複数ファイルの集約と型生成(`kiritan typegen`)
:::

:::kiritan{locale=en}
Importing a single file directly (9.2/9.5) gets type safety from TS inference alone, but when `runtime.sources` **aggregates multiple files into one shared `t()`** (e.g. wanting one common `t()` across the whole app), there's no longer a way to statically know the shape of the aggregated result. `kiritan typegen` exists for exactly this case.

- The namespace is auto-derived from the file path (e.g. `src/components/Button/Button.i18n.ts` → `components/Button`). No manual namespace management is needed (it can be overridden via a `namespace` function).
- `kiritan typegen` generates a `.d.ts` from the aggregated resource's shape (namespace × key × locale), bringing calls like `t('components/Button.submit')` after aggregation under type checking too.
- The generated type information also feeds into the cross-locale key-mismatch check in chapter 9.7.
:::
:::kiritan{locale=ja}
1ファイル直import(9.2/9.5)は TS の推論だけで型安全になるが、`runtime.sources` で**複数ファイルをまとめて1つの `t()` にする**場合(アプリ全体で共通の `t()` を使いたい場合など)は、集約結果の型を静的に知る手段が無くなる。ここでのみ `kiritan typegen` を使う。

- ファイルパスから名前空間を自動導出する(例: `src/components/Button/Button.i18n.ts` → `components/Button`)。手動でのnamespace管理は不要(`namespace` 関数で上書き可)。
- `kiritan typegen` は集約済みリソースの形(namespace × key × locale)から `.d.ts` を生成し、集約後の `t('components/Button.submit')` のような呼び出しも型チェック対象にする。
- 生成した型情報は 9.7 章のロケール間キー不一致チェックの入力にもなる。
:::

:::kiritan{locale=en}
### 9.7 Cross-locale key-mismatch check
:::
:::kiritan{locale=ja}
### 9.7 ロケール間キー不一致チェック
:::

:::kiritan{locale=en}
Adds an item to `kiritan check` (chapter 8) that detects **cross-locale key mismatches** in runtime resources (a key missing from, or extra in, only one locale).

- `colocated`/`embedded` (every locale in one file) can spot a gap just by statically looking at a single file (no cross-file matching needed).
- `split`/`centralized` (one file per locale) requires matching up the key sets of the corresponding files to detect a mismatch.
- Via `check.failOn`'s `'i18n-key-mismatch'`, it can be wired into CI the same way as the document-side `missing`/`stale`.
:::
:::kiritan{locale=ja}
`kiritan check`(8章)に、ランタイムリソースの**ロケール間キー不一致**(あるロケールにだけキーが無い/余分にある)を検出する項目を追加する。

- `colocated`/`embedded`(1ファイル内に全ロケール)は、ファイル単体を静的に見るだけで抜けが分かる(クロスファイルの突き合わせが不要)。
- `split`/`centralized`(ロケールごとに別ファイル)は、対応するファイル同士のキー集合を突き合わせて不一致を検出する。
- `check.failOn` の `'i18n-key-mismatch'` で、ドキュメント側の `missing`/`stale` と同じ扱いで CI に組み込める。
:::

:::kiritan{locale=en}
## 10. CLI / programmatic API
:::
:::kiritan{locale=ja}
## 10. CLI / プログラム API
:::

:::kiritan{locale=en}
The CLI's skeleton uses [yargs](https://github.com/yargs/yargs) (subcommand definitions, help output, and typed args aren't hand-rolled). `kiritan` previously used [citty](https://github.com/unjs/citty) for this, but citty has no hook for translating its own `--help` output or argument-parsing errors ("Missing required argument", "Unknown argument", etc.) — they're hardcoded English strings baked into the library itself. yargs ships full bundled translations for all of that boilerplate (`.locale("ja")` switches "Commands:"/"Options:"/"Missing required argument: %s"/etc. to their Japanese equivalents), which is what actually made localizing the CLI's own `--help` and error output possible, not just its own `console.log` lines.
:::
:::kiritan{locale=ja}
CLI の骨組みは [yargs](https://github.com/yargs/yargs) を使う(サブコマンド定義・ヘルプ表示・型付き引数を自前実装しない)。`kiritan` は以前 [citty](https://github.com/unjs/citty) を使っていたが、citty には自身の`--help`出力や引数解析エラー(`Missing required argument`、`Unknown argument` 等)を翻訳するフックが無く、ライブラリ自身にハードコードされた英語の文字列だった。yargsはこうした定型文言すべてに対する翻訳をバンドルで持っており(`.locale("ja")`で`Commands:`/`Options:`/`Missing required argument: %s`等が日本語に切り替わる)、これによってCLI自身の`console.log`だけでなく`--help`とエラー出力まで実際に多言語化できるようになった。
:::

```
kiritan init [--lang] [--force]                            # Scaffolds .kiritanconfig / base/README.base.md / a .gitignore entry for local.kiritanconfig
kiritan build [--lang] [--mode] [--config] [--locale]     # Runs the full pipeline (every strategy)
kiritan extract [--lang] [--mode] [--config] [--locale]   # catalog-strategy sources only. Creates/updates catalogs
kiritan translate [--lang] [--mode] [--config] [--locale] # Fills missing/stale via translate.middlewares (every strategy)
kiritan typegen [--lang] [--mode] [--config]              # Generates a .d.ts from the runtime.sources aggregation (chapter 9.6)
kiritan check [--lang] [--mode] [--config] [--locale] [--json] # For CI (or editor tooling with --json). Exits non-zero on missing/stale/unreviewed/i18n-key-mismatch
```

:::kiritan{locale=en}
`kiritan init` leaves every file it would write alone if it already exists (`--force` overwrites) — safe to run again in a project that already has some of the three set up. `build`/`check`/`translate`/`extract` all accept `--locale <locale>` to restrict a run to one locale instead of every locale in `locales.list`; `kiritan typegen` doesn't, since it always aggregates every locale into one runtime module.

`--lang <en|ja>` picks the CLI's own display language — every command/option description, `--help` output, and the CLI's own plain-text success/no-op lines (not `--json` output, which stays machine-readable regardless) — as opposed to `--locale`, which picks which *document* locale a run acts on. Without `--lang`, it falls back to `KIRITAN_LANG`, then the usual POSIX locale env vars (`LC_ALL`, `LC_MESSAGES`, `LANG`), then `en`; an explicit but unsupported `--lang` (e.g. `--lang fr`) is reported back as a normal invalid-choice error rather than silently falling back. The CLI's own strings live in `packages/kiritan/src/cli/messages.i18n.ts` — a `colocated`-strategy `runtime.sources` resource in this repo's own `.kiritanconfig`, so `kiritan check`/`kiritan typegen` catch a missing en/ja pair here the same way they would for any other project's own resources. A `CheckIssue.detail` or a thrown `Error.message` from a pipeline function (`packages/kiritan/src/pipeline/*.ts`) is never translated, though — those are library-level strings used by both the CLI and the programmatic API, and stay in English the same way any Node library's own exceptions would, regardless of `--lang`.
:::
:::kiritan{locale=ja}
`kiritan init` は書き込み先のファイルが既に存在する場合はそのまま残す(`--force` で上書き) — 3つのうち一部だけ既に用意されているプロジェクトでも再実行して安全。`build`/`check`/`translate`/`extract` はいずれも `--locale <locale>` を受け付け、実行対象を `locales.list` 全体ではなく1ロケールに絞れる。`kiritan typegen` だけは対応しない — 常に全ロケールを1つのランタイムモジュールに集約するコマンドのため。

`--lang <en|ja>` はCLI自身の表示言語を選ぶ — 各コマンド/オプションの説明文、`--help`出力、CLI自身が出す成功/何もしなかった旨のプレーンテキスト行(`--json`出力は機械可読のまま変わらない)が対象で、どの*ドキュメント*ロケールに対して実行するかを選ぶ`--locale`とは別物。`--lang`を指定しない場合は`KIRITAN_LANG`、次に通常のPOSIXロケール環境変数(`LC_ALL`、`LC_MESSAGES`、`LANG`)、最後に`en`にフォールバックする。明示的だが未対応の`--lang`(例: `--lang fr`)は黙ってフォールバックするのではなく、通常の不正な選択肢エラーとして報告される。CLI自身の文字列は`packages/kiritan/src/cli/messages.i18n.ts`に置かれており、このリポジトリ自身の`.kiritanconfig`における`colocated`戦略の`runtime.sources`リソースになっている — そのため`kiritan check`/`kiritan typegen`は、他のプロジェクト自身のリソースと同じようにここでのen/ja対の欠落も検出する。パイプライン関数(`packages/kiritan/src/pipeline/*.ts`)由来の`CheckIssue.detail`やスローされる`Error.message`は翻訳されない — これらはCLIとプログラムAPIの両方が使うライブラリレベルの文字列であり、`--lang`に関わらずNodeのライブラリ自身の例外と同じく英語のままとなる。
:::

```ts
export { defineConfig, build } from 'kiritan';
export type { KiritanConfig, TranslationStore, Renderer, TranslateMiddleware, BatchTranslateMiddleware } from 'kiritan';
```

:::kiritan{locale=en}
The runtime portion is provided as the independent package `@kiritan/runtime` (chapter 2.1) rather than a subpath of `kiritan`, so that document-build-related code (remark, etc.) never has to be bundled in at all.
:::
:::kiritan{locale=ja}
ランタイム部分は `kiritan` のサブパスではなく独立パッケージ `@kiritan/runtime`(2.1章)として提供し、ドキュメントビルド関連のコード(remark 等)を一切バンドルに含めずに済むようにする。
:::

```ts
export { createT } from '@kiritan/runtime';
export type { CreateTOptions } from '@kiritan/runtime';
```

:::kiritan{locale=en}
## 11. Extension points
:::
:::kiritan{locale=ja}
## 11. 拡張ポイント一覧
:::

:::kiritan{locale=en}
| Kind | Status in v1 |
| --- | --- |
| Translation storage strategy | `sidecar` / `inline` / `catalog` are built in and hardcoded, but a source using any other `strategy` string is now genuinely dispatched through `plugins.stores[strategy]` if one is registered there (chapter 4, `TranslationStore`) — `build`/`check`/`translate`/`extract` all call into it. A `strategy` matching neither a built-in nor a registered store throws a clear error, in all four commands. |
| Runtime resource placement strategy | `colocated` / `split` / `centralized` / `embedded` (chapter 9.1) are genuinely dispatched via `ResourceSourceConfig.strategy`. A custom string strategy is accepted by the type but not handled by anything yet. |
| Translate middleware | Genuinely extensible today: no built-in providers, wired entirely through the `translate.middlewares` array (users implement freely; examples are provided in `docs/`). |
| File renderer | Only `markdown` is implemented; every source is processed as Markdown regardless of extension. `.txt`/`.mdx`, the declared `Renderer` interface, and `plugins.renderers` aren't wired yet — setting `plugins.renderers` currently has no effect (see chapter 13 for why this is a separate, still-unscoped piece of work from `plugins.stores` above). |
| Language-switcher rendering | Genuinely extensible today via `SwitcherConfig.render` (chapter 6.1). |

`plugins.stores` is wired as of chapter 13; `Renderer`/`plugins.renderers` are still declared only as the shape a future pluggable version will use, with nothing in v1 reading or calling them yet.
:::
:::kiritan{locale=ja}
| 種別 | v1での状況 |
| --- | --- |
| 翻訳格納戦略 | `sidecar` / `inline` / `catalog` は組み込みでハードコードされているが、それ以外の `strategy` 文字列を使うソースは、`plugins.stores[strategy]` に登録されていれば実際にそこへディスパッチされるようになった(4章、`TranslationStore`) — `build`/`check`/`translate`/`extract` のすべてがこれを呼び出す。組み込みにも登録済みストアにも一致しない `strategy` は、4コマンドすべてで分かりやすいエラーを投げる。 |
| ランタイムリソース配置戦略 | `colocated` / `split` / `centralized` / `embedded`(9.1章)は `ResourceSourceConfig.strategy` 経由で実際にディスパッチされている。カスタムの文字列戦略は型としては受け付けるが、処理する実装はまだ無い。 |
| 翻訳ミドルウェア | 現状で実際に拡張可能: 組み込みプロバイダは無く、`translate.middlewares` 配列だけで完結する(利用者が自由に実装。`docs/` に実装例を掲載)。 |
| ファイルレンダラー | 実装されているのは `markdown` のみで、拡張子に関わらず全ソースをMarkdownとして処理する。`.txt`/`.mdx`、宣言されている `Renderer` インターフェース、`plugins.renderers` はまだ配線されておらず、`plugins.renderers` を設定しても現状は何も効果が無い(上の `plugins.stores` とは別に、まだスコープの定まっていない作業である理由は13章を参照)。 |
| 言語切り替えリンクの描画 | `SwitcherConfig.render`(6.1章)経由で現状も実際に拡張可能。 |

`plugins.stores` は13章の通り配線済み。`Renderer`/`plugins.renderers` は、将来のプラグイン可能なバージョンが使う形として現時点でも宣言されているだけで、v1ではまだ何もこれらを読み書きしていない。
:::

:::kiritan{locale=en}
## 12. Open questions (to be settled as implementation proceeds)
:::
:::kiritan{locale=ja}
## 12. 未決事項(実装しながら詰める)
:::

:::kiritan{locale=en}
None at this time. Anything that comes up during implementation will be appended here.
:::
:::kiritan{locale=ja}
現時点で無し。実装を進める中で出てきたものをここに追記する。
:::

:::kiritan{locale=en}
## 13. Roadmap / future considerations
:::
:::kiritan{locale=ja}
## 13. ロードマップ / 将来検討
:::

:::kiritan{locale=en}
- **Official translate-middleware packages**: [`@kiritan/deepl`](../packages/deepl) is done — `deepl()` (one request per item) and `deeplBatch()` (one request per language pair, up to DeepL's 50 texts). `%{name}` placeholders are wrapped in a tag DeepL is told to ignore (`tag_handling: xml` with `ignore_tags`), which is also why the rest of the text is XML-escaped on the way in and un-escaped on the way out. The request shape is unit-tested against DeepL's documented API with a fake `fetch`, but has not been run against the live service. [`@kiritan/google-translate`](../packages/google-translate) is done too, on the same footing: `googleTranslate()`/`googleTranslateBatch()` against the Cloud Translation Basic (v2) API, chunked at 128 strings / 30k code points per request. It keeps `%{name}` intact with `<span translate="no">` and `format: "html"`, so it HTML-escapes the rest on the way in and decodes the entities Google adds on its own (an apostrophe comes back as `&#39;`) on the way out. Likewise unit-tested against the documented shape only, not the live API.
- **AI Agent Skill**: [`skills/kiritan`](../skills/kiritan) — done. A single self-contained `SKILL.md` (no npm package, no build step) teaching a coding agent the directive syntax, which CLI command to reach for, and common mistakes to avoid. See [skills/README.md](../skills/README.md) for installation.
- **`kiritan init`**: done. Scaffolds `.kiritanconfig`, `base/README.base.md`, and a `.gitignore` entry for `local.kiritanconfig` in a fresh project — the generated config points `sources` at `base/README.base.md` with `naming.template` overridden to strip `{dir}` (so `README.md`/`README.ja.md` land at the project root rather than inside `base/`, matching the convention this repo's own `.kiritanconfig` uses) and a `runtime.sources` entry recommending the `colocated` strategy (chapter 9.1). Every file is left alone if it already exists unless `--force` is passed, so running it again in a partially-set-up project is safe.
- **A per-command `--locale` flag**: done, for `build`/`check`/`translate`/`extract` — each accepts `--locale <locale>` to restrict a run to one locale instead of every locale in `locales.list`, via a shared `resolveTargetLocales` helper that also rejects a locale not in `locales.list` with a clear error. `build`'s switcher links still cover every configured locale regardless of `--locale`, since the other locales' files already exist on disk and the switcher isn't only describing the current run. `kiritan typegen` doesn't support it — it always aggregates every locale into one runtime module, so there's no meaningful way to restrict it to one.
- **VS Code extension**: [`extensions/vscode`](../extensions/vscode) — in progress. Syntax highlighting for `:::kiritan{...}`/`::kiritan{...}` blocks (a declarative TextMate grammar injected into Markdown, no compiled extension code) is done. Published as `otoneko1102.kiritan` (a VS Code extension identifier can't contain a `/`, ruling out `@kiritan/vscode` as originally envisioned; its `package.json` `"name"` is the plain `"kiritan"`). Since that collides with the CLI package's own npm name, it lives under `extensions/` rather than `packages/` and so is never picked up by the root `"workspaces": ["packages/*"]` glob — its build/test tooling lives in the root `package.json`'s `devDependencies` instead (chapter 2.1). Highlighting for `%{name}` (and its `\%{name}` escape), folding for `:::kiritan` blocks (colon-count matched via a small stack, so nesting other directives around a kiritan block doesn't confuse it), jump-to-definition from `:::kiritan{#<id>}` to its entry in the sibling `<base>.<locale>.catalog.json`, undefined-`%{name}`-variable warnings, and inline `missing`/`stale`/`machine` indicators are all done — the last two settled the "bigger design question" the others were left waiting on: rather than requiring `kiritan`'s internals in-process (real crash/version-skew risk from a broken or mismatched project install), `diagnostics.cjs` spawns the workspace's own locally-installed `kiritan check --json` as a child process, the same approach ESLint/Prettier's editor integrations use for their own local installs. `npx --no-install` means a project that doesn't depend on `kiritan` at all is silently skipped rather than triggering a surprise network install. `kiritan check` gained a `--json` flag and `CheckIssue.id` (the catalog segment id, when there is one) specifically to support this. `%{name}` uses inside a fenced code block or inline code span are never flagged, matching `interpolation.skipCodeBlocks`'s own default — caught by testing this against the extension's own README, which shows the syntax as a literal example. Only the default `%{`/`}` delimiters are supported for the undefined-variable check; a project with custom `interpolation.delimiters` still gets everything else. It also registers `*.kiritanconfig` as its own language, delegating highlighting to `source.js` via a TextMate `include` and reusing JavaScript's bracket/comment/indent rules via its own `language-configuration.json` — this is why config files are named `*.kiritanconfig` rather than `.kiritan.mjs` (chapter 3.1): a file icon theme's own rules always beat a language's fallback icon, so keeping a real `.mjs` extension would have permanently shown a generic JavaScript icon in themes like vscode-icons. No icon theme has a rule for a filename it's never heard of, so registering the language here is enough to get a Kiritan-branded icon everywhere, with no per-theme configuration needed. Real code completion needed more than a grammar, though — the built-in TypeScript/JavaScript language service only activates for the actual `javascript`/`typescript` language ids, and giving `*.kiritanconfig` the real `javascript` id would let vscode-icons' own language-based icon rule override the custom one. `extension.cjs` bridges this: it mirrors a `*.kiritanconfig` document's content into an in-memory `javascript` document (a `TextDocumentContentProvider`-backed virtual document, not an untitled one — an untitled document is a real editable buffer that VS Code counts as unsaved, which an earlier version of this bridge did by mistake) and forwards completion requests to VS Code's own built-in provider for it, so the icon and full IntelliSense both hold at once.
- **Vim/Neovim plugin**: [`extensions/vim`](../extensions/vim) — highlighting done, everything past that still open. Ended up as plain Vimscript rather than the shared tree-sitter grammar or LSP originally envisioned here, since that's a real upfront investment and the immediate need (matching the VS Code extension's own v1) didn't call for it yet: `after/syntax/markdown.vim` highlights `:::kiritan{...}`/`::kiritan{...}` directives and `%{name}` interpolation by layering onto the built-in `markdown` syntax, the Vimscript equivalent of the VS Code extension's TextMate grammar injection, and `ftdetect/kiritanconfig.vim` assigns the real `javascript` filetype to `*.kiritanconfig` files directly — no need for VS Code's `kiritanconfig`-language workaround, since Vim/Neovim's icon ecosystem doesn't force the same vscode-icons-language-rule tradeoff (chapter 3.1). Verified against a real headless `vim -u NONE` process (`synID()`/`synIDattr()` at specific positions), not just asserted against the `.vim` source, the same rigor the VS Code extension's grammar tests use — this actually caught a real gotcha along the way: Vim's `:syntax on` autocommand only ever runs `runtime! syntax/<ft>.vim` against each `'runtimepath'` entry's own `syntax/` subdirectory, never a nested `after/syntax/`, so a plugin's `after/` subdirectory has to be added to `'runtimepath'` as its *own* separate entry (which plugin managers do automatically) for `after/syntax/markdown.vim` to load at all. Folding (`after/ftplugin/markdown.vim` sets `'foldexpr'` to `autoload/kiritan.vim`'s `kiritan#FoldExpr`, precomputing every line's fold level with the same colon-count-stack algorithm as `folding-core.cjs`, cached per buffer against `b:changedtick`) and jump-to-catalog-entry (`:KiritanJumpToCatalog`, bound to nothing by default — see the plugin's README for wiring up `<Plug>(kiritan-jump-to-catalog)`; populates the quickfix list when more than one locale's catalog matches) are done too, verified the same real-`vim`-process way. Undefined-`%{name}` detection and inline `missing`/`stale`/`machine` indicators are done too, but Neovim-only (`nvim-0.10+`) — `lua/kiritan/diagnostics.lua`, auto-loaded by `plugin/kiritan.lua`, ports the VS Code extension's `diagnostics.cjs` approach exactly: shells out to the workspace's own locally-installed `kiritan check --json` via `npx --no-install` and sets real `vim.diagnostic` entries from the result. Plain Vim has nothing resembling `vim.diagnostic`/`vim.system` to port this to — and needs no explicit guard against loading it anyway, since Vim's own runtime loader only globs `plugin/*.vim`, never `.lua`, so `plugin/kiritan.lua` is simply never read under Vim in the first place (confirmed directly: adding it left Vim's own `:scriptnames` completely unaware of its existence, no error, no side effect). Verified with a real headless `nvim --clean` process the same way as the Vimscript side, which caught a real bug before it shipped: `kiritan check` exits 1 whenever any issue matches `check.failOn` — exactly the case with something worth diagnosing — but the check's callback was discarding the result whenever the exit code was non-zero, so it would have silently reported nothing for the one scenario that mattered. The same bug, for the same reason (Node's `exec` rejects on any non-zero exit but the rejection still carries `.stdout`), was hiding in the VS Code extension's own `diagnostics.cjs` and got fixed alongside this. Releases are lighter than the other components too, since there's nothing to build: `release-vim.yml` just runs the test suite and tags the commit as `kiritan-vim@<version>` with a `--generate-notes` GitHub Release (no attached asset). There's no `package.json` here to hold a current version to bump from, so it finds the latest existing `kiritan-vim@*` tag and reuses `npm version`'s own semver logic against a throwaway `package.json` — the same `patch`/`minor`/`major`/`prerelease` keyword or explicit-version `version` input as `release.yml`.
- **Wiring `plugins.stores`**: done. `build`/`check`/`translate`/`extract` all dispatch a source whose `strategy` matches a `plugins.stores` key to that `TranslationStore`'s `read`/`write`/`status` (chapter 4, chapter 11) instead of throwing — the two `TranslatedContent` shapes it declares turned out to generalize the built-ins cleanly: a `"full-text"` result is treated sidecar-style (parsed fresh as the whole document), a `"segments"` result (or nothing stored yet) catalog-style (fed into `renderForLocale`'s existing per-id fallback, so no new fallback logic was needed). Staleness is left entirely to the store's own `status()` — `check`/`translate` trust it outright rather than trying to recompute it the way the built-in `sidecar`/`catalog` formats do for themselves, since a plugin store is a black box kiritan doesn't own the internals of. `check` only calls `status()`, not `read()`, so there's no generic "machine-translated, needs review" issue for a plugin store the way `catalog`'s own `machine` flag produces one — that stays a `catalog`-specific concept for now. `translate`/`extract` both no-op for a store with no `write` (a read-only store, e.g. one backed by an external TMS kiritan can only read from). A `strategy` matching neither a built-in nor a registered store now throws in all four commands, not just `build` as before — a deliberate tightening, since a custom `strategy` typo (e.g. `"catalogg"`) was always a mistake with no legitimate use, and there's now an actual registration mechanism to check it against.
- **Wiring `plugins.renderers`**: still not done, and deliberately scoped separately from `plugins.stores` above — the declared `Renderer` interface (`parse(sourceText): { raw: string }`, `reassemble(doc, translated: string)`) has no way to represent the mdast tree `directive/render.ts`'s `renderForLocale`/`collectCatalogSegments`/etc. actually operate on end-to-end, so it can't be wired against the real pipeline as declared. A working design needs an actual second renderer (see the next item) to validate the interface's real shape against, not just the bare `strategies: StoreStrategy[]` field it already has.
- **`text`/`mdx` renderers and front-matter protection**: v1 only implements the `markdown` renderer; `.txt`/`.mdx` support and `translateFrontmatter` (chapter 6) are design-stage only.
:::
:::kiritan{locale=ja}
- **翻訳ミドルウェアの公式パッケージ化**: [`@kiritan/deepl`](../packages/deepl) は対応済み — `deepl()`(1件ごとに1リクエスト)と `deeplBatch()`(言語ペアごとに1リクエスト、DeepLの上限である50件まで)。`%{name}` のプレースホルダーはDeepLに無視させるタグ(`tag_handling: xml` と `ignore_tags`)で包んでおり、残りのテキストを送信時にXMLエスケープ、受信時にアンエスケープするのもそのため。リクエストの形はDeepL公式のAPI仕様に照らして偽の `fetch` でユニットテストしているが、実際のサービスに対しては実行していない。[`@kiritan/google-translate`](../packages/google-translate) も同じ前提で対応済み: `googleTranslate()`/`googleTranslateBatch()` がCloud Translation Basic(v2)APIを使い、1リクエストあたり128件/3万コードポイントで分割する。`%{name}` は `<span translate="no">` と `format: "html"` で守るため、残りのテキストを送信時にHTMLエスケープし、Google自身が加えるエンティティ(アポストロフィが `&#39;` で返ってくる等)を受信時にデコードする。こちらも実際のAPIに対してではなく、公式の仕様の形に対するユニットテストのみ。
- **AI Agent Skill**: [`skills/kiritan`](../skills/kiritan) —対応済み。npmパッケージでもビルドも不要な、単一の自己完結した `SKILL.md` として、ディレクティブ記法・どのCLIコマンドを使うべきか・よくある間違いをコーディングエージェントに教える。導入方法は [skills/README.md](../skills/README.md) を参照。
- **`kiritan init`**: 対応済み。新規プロジェクトで `.kiritanconfig`・`base/README.base.md`・`local.kiritanconfig` の `.gitignore` への追記を生成する — 生成される設定は `sources` を `base/README.base.md` に向け、`naming.template` を `{dir}` を除いた形に上書きする(このリポジトリ自身の `.kiritanconfig` と同じ規約で、`README.md`/`README.ja.md` が `base/` 内ではなくプロジェクトルートに出力されるようにするため)。あわせて `colocated` 戦略(9.1章)を推奨する `runtime.sources` エントリも含める。書き込み先のファイルが既に存在する場合は `--force` を付けない限りそのまま残すため、一部だけ既に用意されているプロジェクトで再実行しても安全。
- **コマンド共通の `--locale` フラグ**: 対応済み。`build`/`check`/`translate`/`extract` がそれぞれ `--locale <locale>` を受け付け、実行対象を `locales.list` 全体ではなく1ロケールに絞れる。共通のヘルパー `resolveTargetLocales` を介しており、`locales.list` に無いロケールを指定した場合は分かりやすいエラーで弾く。`build` のswitcherリンクは `--locale` の指定に関わらず設定済みの全ロケールを表示し続ける — 他のロケールのファイルは既にディスク上に存在しており、switcherは今回の実行だけを説明するものではないため。`kiritan typegen` だけは対応しない — 常に全ロケールを1つのランタイムモジュールに集約するコマンドのため、1ロケールに絞る意味のある方法が無い。
- **VS Code 拡張機能**: [`extensions/vscode`](../extensions/vscode) —対応中。`:::kiritan{...}`/`::kiritan{...}` ブロックのシンタックスハイライト(Markdownに注入する宣言的なTextMate文法のみ、コンパイル済み拡張機能コードは無し)は完了。`otoneko1102.kiritan` として公開する(VS Code の拡張機能識別子に `/` を含められないため、当初構想していた `@kiritan/vscode` は使えず、`package.json` の `"name"` はそのまま `"kiritan"` にしている)。これはCLIパッケージのnpm名と衝突するため、`packages/` ではなく `extensions/` 配下に置いており、ルートの `"workspaces": ["packages/*"]` には拾われない — ビルド・テストに必要なツールはルートの `package.json` の `devDependencies` に置いている(2.1章)。`%{name}`(とそのエスケープ形式 `\%{name}`)のハイライト、`:::kiritan` ブロックの折りたたみ(小さなスタックでコロンの個数を対応させているため、他のディレクティブがネストしていても混乱しない)、`:::kiritan{#<id>}` から隣接する `<base>.<locale>.catalog.json` 内の該当エントリへのジャンプ、未定義の`%{name}`変数の警告、`missing`/`stale`/`machine`のインライン表示は、いずれも完了 — 最後の2つが、それ以外の機能が待っていた「より大きな設計判断」を決着させた。`kiritan`の内部実装をプロセス内で直接読み込む(壊れた・バージョンの合わないプロジェクトのインストールがそのままクラッシュ/不整合につながる実際のリスクがある)代わりに、`diagnostics.cjs`はワークスペース自身にローカルインストールされた`kiritan check --json`を子プロセスとして起動する — ESLint/Prettierのエディタ統合が自身のローカルインストールに対して行っているのと同じアプローチ。`npx --no-install`により、`kiritan`に依存しないプロジェクトでは意図せぬネットワーク経由のインストールが走らず、単に何もしない。`kiritan check`はこのために`--json`フラグと`CheckIssue.id`(catalogセグメントidがある場合)を新たに備えた。コードフェンス内やインラインコードスパン内の`%{name}`は、`interpolation.skipCodeBlocks`の既定動作に合わせて検出対象外にしている — これは拡張機能自身のREADME(この記法をリテラルな例として示している)に対して実際にテストして見つかった問題だった。未定義変数の検出は既定の`%{`/`}`区切り文字にのみ対応しており、`interpolation.delimiters`をカスタマイズしているプロジェクトでも他の機能はそのまま使える。あわせて `*.kiritanconfig` を独自言語として登録し、ハイライトはTextMateの `include` で `source.js` に委譲、括弧・コメント・インデントのルールも独自の `language-configuration.json` でJavaScript相当にしている — これが設定ファイルを `.kiritan.mjs` ではなく `*.kiritanconfig` と命名した理由でもある(3.1章)。ファイルアイコンテーマ自身のルールは常に言語のフォールバックアイコンより優先されるため、実在する `.mjs` 拡張子のままではvscode-iconsのようなテーマで永久に汎用的なJavaScriptアイコンのままになってしまう。見たことの無いファイル名に対して具体的なルールを持つアイコンテーマは存在しないため、この言語登録だけで、テーマ側の個別設定なしにあらゆるアイコンテーマでKiritan固有のアイコンが表示される。ただし本物のコード補完には文法だけでは足りない — 組み込みのTypeScript/JavaScript言語サービスは実際の `javascript`/`typescript` 言語IDにしか反応せず、かといって `*.kiritanconfig` に本物の `javascript` IDを与えるとvscode-icons自身の言語ベースのアイコンルールがカスタムアイコンを上書きしてしまう。`extension.cjs` はこれを橋渡しする — `*.kiritanconfig` ドキュメントの内容を、メモリ上の `javascript` ドキュメント(`TextDocumentContentProvider` による仮想ドキュメント。untitledドキュメントではない — untitledは実体のある編集可能バッファでVS Codeが未保存として数えてしまうため、この橋渡しの初期版では誤ってuntitledを使っていた)に複製し、補完リクエストをVS Code組み込みのプロバイダーへ転送することで、アイコンとフルIntelliSenseを両立させている。
- **Vim/Neovim プラグイン**: [`extensions/vim`](../extensions/vim) — ハイライトは完了、それ以外はまだ未着手。ここで当初想定していた共有tree-sitter文法/LSPではなく、素のVimscriptで実装した — それは実際に投資が必要な選択肢であり、当面の目標(VS Code拡張機能自身のv1に合わせる)にはまだ必要なかったため。`after/syntax/markdown.vim` は組み込みの `markdown` 文法に重ねる形で `:::kiritan{...}`/`::kiritan{...}` ディレクティブと `%{name}` 補間をハイライトする、VS Code拡張機能のTextMate文法注入に相当する仕組み。`ftdetect/kiritanconfig.vim` は `*.kiritanconfig` ファイルに本物の `javascript` filetypeを直接設定する — Vim/Neovimのアイコンエコシステムにはvscode-iconsの言語ルールと同じトレードオフが無いため、VS Code拡張機能の `kiritanconfig` 独自言語という回避策は不要(3.1章)。実際のヘッドレス `vim -u NONE` プロセス(`synID()`/`synIDattr()` で特定位置を問い合わせる)に対して検証しており、単に `.vim` ソースへのアサーションではない — VS Code拡張機能のグラマーテストと同じ厳密さ。この過程で実際に見つかった落とし穴: Vimの `:syntax on` のautocommandは、`'runtimepath'` の各エントリ自身の `syntax/` サブディレクトリに対してのみ `runtime! syntax/<ft>.vim` を実行し、ネストした `after/syntax/` は決して見ない — そのため、プラグインの `after/` サブディレクトリを `'runtimepath'` に**別エントリとして**追加しない限り(プラグインマネージャーは自動的に行う)、`after/syntax/markdown.vim` は一切読み込まれない。折りたたみ(`after/ftplugin/markdown.vim` が `'foldexpr'` を `autoload/kiritan.vim` の `kiritan#FoldExpr` に設定し、`folding-core.cjs` と同じコロン個数スタックのアルゴリズムで各行の折りたたみレベルを事前計算、バッファごとに `b:changedtick` を鍵にキャッシュする)とcatalogエントリへのジャンプ(`:KiritanJumpToCatalog`。既定では何のキーにも割り当てず — 詳細はプラグインのREADMEの `<Plug>(kiritan-jump-to-catalog)` の配線方法を参照。複数ロケールのcatalogが一致する場合はquickfixリストに反映)も完了しており、同じく実際のvimプロセスで検証している。未定義の`%{name}`検出と`missing`/`stale`/`machine`のインライン表示も完了しているが、Neovim限定(`nvim-0.10+`)——`lua/kiritan/diagnostics.lua`(`plugin/kiritan.lua`が自動読み込み)は、VS Code拡張機能の`diagnostics.cjs`のアプローチをそのまま移植している。ワークスペース自身にローカルインストールされた`kiritan check --json`を`npx --no-install`経由で実行し、その結果を実際の`vim.diagnostic`として設定する。素のVimには`vim.diagnostic`/`vim.system`に相当するものが無く、そもそも明示的な読み込み防止すら不要 — Vim自身のランタイムローダーは`plugin/*.vim`しか見ず`.lua`は一切見ないため、`plugin/kiritan.lua`はVim上では最初から読み込まれない(実際に確認済み: 追加してもVimの`:scriptnames`には一切現れず、エラーも副作用も無かった)。Vimscript側と同様、実際のヘッドレス`nvim --clean`プロセスで検証しており、公開前に実際のバグを発見した: `kiritan check`は`check.failOn`に一致する問題がある場合(まさに診断したいケース)に終了コード1を返すが、checkのコールバックが終了コードが非ゼロの場合に結果を破棄していたため、最も重要なシナリオで何も報告されなくなってしまっていた。同じ理由(Node's `exec`は非ゼロ終了で常にrejectするが、reject後のエラーオブジェクトにも`.stdout`は残っている)による同じバグがVS Code拡張機能自身の`diagnostics.cjs`にも潜んでおり、あわせて修正した。リリースも他のコンポーネントより軽量 — ビルドすべきものが無いため、`release-vim.yml` はテストスイートを実行してコミットに `kiritan-vim@<version>` タグを打ち、`--generate-notes` でGitHub Releaseを作成するだけ(添付ファイルなし)。バンプ元となる現在のバージョンを保持する `package.json` が無いため、既存の `kiritan-vim@*` タグのうち最新のものを起点にし、使い捨ての `package.json` で `npm version` 自身のsemverロジックを借用する — `release.yml` と同じ `patch`/`minor`/`major`/`prerelease` キーワードまたは明示的なバージョンの `version` 入力。
- **`plugins.stores` の配線**: 対応済み。`build`/`check`/`translate`/`extract` はすべて、`strategy` が `plugins.stores` のキーに一致するソースを、例外を投げる代わりにその `TranslationStore` の `read`/`write`/`status`(4章・11章)へディスパッチするようになった — 宣言されている2つの `TranslatedContent` 形状は、組み込みの2戦略をきれいに一般化できることが分かった: `"full-text"` の結果はsidecar方式で扱う(独立したドキュメントとして新規にparseする)。`"segments"` の結果(または何も保存されていない場合)はcatalog方式で扱う(`renderForLocale` 既存のper-idフォールバックにそのまま流し込むため、新しいフォールバック処理は不要だった)。stalenessの判定は完全にストア自身の `status()` に委ねる — `check`/`translate` はその返り値をそのまま信用し、組み込みの `sidecar`/`catalog` が自分自身のために行っているような再計算はしない。プラグインストアはkiritanが中身を把握できないブラックボックスだからである。`check` は `status()` のみを呼び `read()` は呼ばないため、`catalog` の `machine` フラグが生む「machine翻訳につき要レビュー」に相当する汎用issueはプラグインストアには存在しない — これは当面 `catalog` 固有の概念のままとする。`translate`/`extract` はどちらも `write` の無いストア(kiritanから読み取ることしかできない、外部TMSに裏付けられたストア等)に対しては何もしない。組み込みにも登録済みストアにも一致しない `strategy` は、以前は `build` だけが投げていた例外を、今や4コマンドすべてが投げるようになった — これは意図的な厳格化で、カスタム `strategy` のタイプミス(例: `"catalogg"`)は元々常に単なる設定ミスであり、今や実際にそれを判定するための登録機構が存在するようになったため。
- **`plugins.renderers` の配線**: まだ未対応で、上の `plugins.stores` とは意図的に別スコープとしている — 宣言されている `Renderer` インターフェース(`parse(sourceText): { raw: string }`、`reassemble(doc, translated: string)`)には、`directive/render.ts` の `renderForLocale`/`collectCatalogSegments` 等が最初から最後まで実際に操作しているmdastツリーを表現する手段が無く、宣言通りの形では実際のパイプラインに対して配線しようがない。実用的な設計にするには、インターフェースの本当に必要な形を検証するための実際の2つ目のレンダラー(次の項目を参照)が必要であり、既に持っている `strategies: StoreStrategy[]` フィールドだけでは足りない。
- **`text`/`mdx` レンダラーとfront matter保護**: v1で実装されているレンダラーは `markdown` のみで、`.txt`/`.mdx` 対応や `translateFrontmatter`(6章)はまだ設計段階。
:::
