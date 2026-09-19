# Kiritan Design Document

[English](DESIGN.md) | **日本語**

## 1. 概要

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

## 2. 全体パイプライン

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

## 2.1 パッケージ構成(v1 から workspaces 化)

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

## 3. 設定ファイル

### 3.1 探索とカスケード

ファイル名は `(<mode>|local)?\.?kiritanconfig`(例: `.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`)を認識する。あえて `.js`/`.mjs` 等の実在する拡張子を使わない単一の名前にしている — vscode-iconsのようなファイルアイコンテーマに、単なるJavaScriptファイルと誤認されないようにするため(13章)。中身はどのファイルも普通のESM JavaScriptであり、[jiti](https://github.com/unjs/jiti) のような軽量ローダーで読み込む(`kiritanconfig` を既知の拡張子として扱うよう設定している — Nodeの標準ローダーは、知らない拡張子のファイルを`import()`しようとすると拒否するため)。マージ順(下ほど優先度が高く、深いマージ):

1. `.kiritanconfig` — 基本レイヤー。「明示的なbase」という別名は無く、mode/localの上書きが無いプロジェクトはこの1ファイルだけで完結する。
2. `<mode>.kiritanconfig` — `mode` は `--mode` フラグ、なければ `KIRITAN_MODE` 環境変数。指定が無ければこのレイヤーはスキップ。
3. `local.kiritanconfig` — 常に最後に適用。`.gitignore` 対象を想定(APIキー等のローカル上書き用)。
4. `--config <path>` / `--overlay <path>`(複数指定可)— CLI から任意の設定ファイルを追加で重ねられる。

オブジェクトは深いマージ、配列(`sources` など)はデフォルトで置換。連結したい場合は `mergeArray(...)` ヘルパーで包む。

### 3.2 設定スキーマ(`*.kiritanconfig` のスコープ)

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

### 3.3 命名テンプレートのプリセット

出力ファイル名の付け方には流派があるため(`README.ja.md` 派、`README-ja.md` 派、`ja.README.md` 派、フォルダ分け派など)、`naming.template` は任意の文字列テンプレートとして完全に自由に書けるようにしつつ、よく使う形は `naming.preset` の指定だけで済むようにする。

| preset | 実際のテンプレート | 出力例(base="README", ext="md", locale="ja") |
| --- | --- | --- |
| `dot`(既定) | `{dir}/{base}.{locale}.{ext}` | `README.ja.md` |
| `dash` | `{dir}/{base}-{locale}.{ext}` | `README-ja.md` |
| `prefix` | `{dir}/{locale}.{base}.{ext}` | `ja.README.md` |
| `folder` | `{dir}/{locale}/{base}.{ext}` | `ja/README.md` |

`preset` はあくまで `template` の既定値を差し替えるショートハンドであり、`template` を直接指定すればどのプリセットにも無い任意の並び・区切り文字(`{base}_{locale}.{ext}` など)も自由に書ける。`naming.defaultTemplate`・`omitDefaultLocaleSuffix`・`outputs` は preset の有無に関わらず同様に効く。

## 4. 翻訳格納戦略(`TranslationStore`)

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

同じ設定内で戦略を混在させられる(あるドキュメントは `inline`、別のドキュメントは `catalog`、など)。

### 4.1 `sidecar` — ファイル分割方式

`README.base.md` に対し、`README.ja.md` のように言語ごとに独立したファイルを人力・機械翻訳問わず用意する。既存の README 翻訳運用にもっとも近い。ステイル検知は、出力ファイル先頭に埋め込むハッシュコメント(例: `<!-- kiritan:source-hash: xxxx -->`)で行う。

### 4.2 `inline` — 1ファイル内に各言語を並べる方式

[remark-directive](https://github.com/remarkjs/remark-directive) の標準的なコンテナディレクティブ構文(`:::name{attrs}` ... `:::`)にそのまま準拠する。独自の行パーサは作らず、remark のエコシステム(構文ハイライト、既存の VS Code 拡張など)にそのまま乗る。

ロケールごとに**独立した1つの directive**として書く(1つのブロックに複数ケースを詰め込む「switch」のような構造にはしない)。

**文書全体を対象にする場合:**

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

**セクション単位で対象にする場合(差分がある部分だけを囲む):**

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

directive の外側は「共通コンテンツ」として全ロケール出力にそのままコピーされる。ドキュメントの一部だけ翻訳し、残りは共有する運用に対応する。

**ネスト(ブロック内でさらに `:::` を使いたい場合):** remark-directive 標準の挙動どおり、外側のコロンを増やせばよい(`::::kiritan{locale=en}` の中で `:::note` を使う、など)。Kiritan 側で特別な処理は不要。

`locale=xx` に `locales.list` に無い値を指定した場合は typo とみなし、build 時にエラーにする(サイレントに無視しない)。

### 4.3 `catalog` — セグメント単位のカタログ方式

セグメントIDは自動推定(位置ベース／内容ハッシュベース)にせず、**著者が base ファイル側で明示的に付ける**。remark-directive の `#id` 属性ショートハンドをそのまま使う。

```md
:::kiritan{#usage-intro}
## Usage
This is the usage section.
:::
```

- `:::kiritan{#<id>}` ブロックの中身は base ロケール(`locales.default`)の原文そのもの。
- 訳文は `locales/README.ja.yaml` のような別ファイルに `id → { text, machine, hash }` で保持する(`hash` は「この id の原文が最後に翻訳された時点の内容」を指し、現在の原文と食い違えば `stale` 判定に使うだけで、id のマッチング自体には使わない)。
- id は著者が完全にコントロールするため、文章を多少書き直しても訳文が「迷子」になることはなく(対応関係は id で固定)、その代わり id の採番・命名は著者の責任になる(i18n ライブラリのキー設計と同じ考え方)。
- `:::kiritan{#<id>}` の外側は `inline` と同様「共通コンテンツ」として扱う。
- `kiritan extract` は base 内の `:::kiritan{#<id>}` を走査し、カタログに未登録の id を追加する(既存の訳文は上書きしない)。id が base から消えた場合はカタログ側にオーファンとして残し、`kiritan check` で警告する。

## 5. 変数展開(`%{name}`)

ロケールをまたいで共通の値(バージョン番号、リポジトリURL、サイト名など)を埋め込むための仕組み。`{{...}}` は Handlebars/Mustache/i18next 等と被りやすいため、Ruby/Rails の i18n に近い `%{name}` を既定にする(区切り文字自体は `interpolation.delimiters` で変更可能)。

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

- 変数の値は `interpolation.variables`(または `variables` 関数の戻り値)のみが唯一の情報源であり、catalog 等の訳文レコードから変数値が供給されることはない。同じ変数名に対しロケール別の値(`{ en: ..., ja: ... }`)と共通値が両方定義されている場合は、**ロケール別の値がある方を優先**し、無ければ共通値にフォールバックする。
- `\%{literal}` のようにバックスラッシュでエスケープ可能。
- `interpolation.skipCodeBlocks: true`(既定)でコードブロック / インラインコード内は展開しない。
- 未定義変数の扱いは `onMissing`(既定 `'error'`)で制御し、typo をビルド時に検出できるようにする。
- 変数解決自体を関数にすれば、`package.json` の値を読むなど動的な値も扱える。

## 6. レンダラー(`Renderer`)

```ts
interface Renderer {
  id: string;
  extensions?: string[];              // Claimed by extension when a source has no explicit `renderer` (lowercase, with the dot)
  strategies: StoreStrategy[];        // Which of sidecar/inline/catalog this format supports
  supportsDirectives?: boolean;       // Default true. false = no `:::kiritan{...}` and no switcher
  parse(sourceText: string): Root;    // mdast tree, the same shape every pipeline stage operates on
  stringify(tree: Root): string;
  comment?(text: string): string;     // How to write an invisible comment; absent = no hash/untranslated markers
}
```

- `markdown`: remark + `remark-directive` による AST 解析。コードブロック・インラインコード・リンク URL を保護し、`:::kiritan{...}` ディレクティブの分解もここで行う。先頭の `---` で囲まれたYAML front matterは(`remark-frontmatter` により)1つの不透明なノードとして保持されるため、翻訳・補間・整形のいずれも行われず、どのビルドでもそのまま出力される。つまり `sidecar` の翻訳ファイルは自分自身のfront matterを持ち(手作業またはミドルウェアで翻訳する)、`inline`/`catalog` のビルドでは元ファイルのfront matterが全ロケールにそのまま繰り返される。
- レンダラーはソースファイルごとに解決される: `SourceConfig.renderer` の明示指定が最優先、次に拡張子の一致(同じ拡張子を組み込みと `plugins.renderers` の両方が担当する場合は `plugins.renderers` が優先)、最後に `markdown`。したがって見慣れない拡張子のファイルも従来通りMarkdownとして処理される。レンダラーの `strategies` は、ソースの組み込み `strategy` に対して事前に検証され、非対応の組み合わせ(例: `sidecar` しか宣言しない形式への `inline`)は何もビルドされる前に分かりやすいエラーで弾かれる。カスタムの `plugins.stores` の戦略名はこのリストに照らして検証しない — ストア自身の登録が検証の役割を担うため。`text` と `mdx` は組み込み済み。
- `text`(`.txt`/`.text`): ファイル全体が1つのtextノードなので、`%{name}` の補間を除き、バイト単位でそのまま書き戻される — 折り返し・エスケープ・正規化は一切行わない。Markdown構文が無く、`:::kiritan{...}` ディレクティブもswitcherリンクも置き場所が無いため、対応するのは `sidecar` のみ(`supportsDirectives: false`)。またコメント構文も無いため `kiritan:hash` マーカーは書かれず、stale検知も無い: `kiritan check` は翻訳の欠落は報告するがstaleは決して報告せず、`kiritan translate` も欠けているものだけを埋める。段落単位には意図的に分割していない — その分割はセグメント単位の戦略でしか意味を持たず、平文にはそれが提供できないため。
- `mdx`(`.mdx`): Markdown に JSX・`import`/`export`・`{式}` を加えた形式。`markdown` と同じディレクティブ・front matterの扱いの下に `remark-mdx` を重ねて実現している。JSX・ESM・式はそれぞれ、パイプラインが地の文として扱わない独自のmdastノードにパースされるため手を加えられずそのまま出力され、`:::kiritan{...}` も3つの戦略すべてでMarkdownと全く同じように動く。MDX自身の構文に由来するMarkdownとの違いが2つある。`%{name}` の補間は適用されない: `{` がJSの式を開始するため、`name` は地の文としてパイプラインに届かない(変更されずそのまま出力される。値を差し込みたい場合はMDX自身の `{式}` を使う)。そして `kiritan:hash`/`kiritan:untranslated` マーカーは、式の中のJSブロックコメントとして書かれる — MDXではHTMLコメントは構文エラーになるため。

### 6.1 言語切り替えリンクの自動挿入(`switcher`)

`[English](README.md) | [日本語](README.ja.md)` のような、バイリンガル README でよく見る言語切り替えリンクを build 時に自動生成する。翻訳とは性質が異なる機械的なリンク生成なので、`translate.auto`(既定 off)とは異なり**既定で有効**にする。

**挿入位置の指定**: remark-directive の leaf directive(内容を持たない `::name` 形式)として `::kiritan{switcher}` を base ファイルの好きな位置に書けば、そこに挿入される(4.2/4.3章のコンテナ directive と同じ `remark-directive` の仕組み)。

```md
# Kiritan

::kiritan{switcher}

Kiritan の説明...
```

明示的なマーカーが無い場合、`switcher.enabled`(既定 `true`)なら `switcher.position`(既定 `'after-heading'`: 最初の見出しの直後、無ければ先頭)に自動挿入する。**マーカーが存在する場合は `enabled`/`position` の値に関わらず必ずそこが使われる**(明示指定が既定動作より優先)。

**生成される内容**: `locales.list` の各ロケールについて、そのロケール向け出力ファイルパス(3.3章の命名解決を再利用、`naming.outputs` のソース単位上書きも考慮)へのリンクを、現在ビルド中のロケールの出力ファイルからの相対パスで**自動計算**し、区切り文字(既定 `" | "`)で連結する。href を手動指定する手段は無い(手動でリンクを書きたい場合は、この機能を使わず自分で書けばよい)。現在のロケール自身はリンクにせず太字表示にする(`currentLocaleLink: true` でリンク化も可能)。

**言語名の表示ラベル**: Kiritan は言語名一覧を自前で持たない(手作りのリストは抜け漏れが怖いため)。既定のラベルは標準の [`Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)(ECMA-402、Node.js に標準搭載、CLDR のデータに基づく)を使い、各ロケールの自称(autonym: そのロケール自身の言語でその言語を呼ぶ名前。例: `ja` なら "日本語"、`en` なら "English")を自動的に表示する。追加の依存もメンテすべき一覧も不要になる。

```ts
// 既定のラベル解決(labels で明示指定が無いロケールに対して行う)
new Intl.DisplayNames([locale], { type: "language" }).of(locale);
```

`switcher.labels` は、この既定を上書きしたい場合(呼び方を変えたい、`Intl.DisplayNames` が知らない独自のロケールコード、対応外のロケールを一覧から外したい、など)のためのオプトインの上書き手段として残す。

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

`SourceConfig.switcher` でソース単位に丸ごと上書きできる(特定のドキュメントだけ無効化する、ラベルを変える、など)。

生成例(`locales.list: ['en', 'ja', 'es']`、上記 `labels`、en ビルド時):

```md
**English** | [日本語](README.ja.md)
```

`::kiritan{switcher}` はすべてのロケール向け出力に共通で挿入される内容なので、`inline`/`catalog` 戦略の `:::kiritan{locale=...}`/`:::kiritan{#<id>}` ブロックの**外側**(共通コンテンツの領域)に置く。ブロック内側に置いた場合はそのロケールの出力にしか switcher が出ないという分かりにくい挙動になるため、build 時に警告する。

## 7. 翻訳ミドルウェアチェーン(`TranslateMiddleware`)

単一プロバイダを選ぶのではなく、Vite/Koa のプラグインのように「小さな処理を連鎖(chain)」できる設計にする。1つの `missing` 訳文に対して、ミドルウェアを先頭から順に適用し、いずれかが値を確定させた時点で終了する。

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

- 既定は `middlewares: []`(＝ `manual` 相当)で、`translate.auto` が `true` でない限り自動翻訳は一切走らない。**この既定値(off)は今後の設計でも維持し、on/off の判断が必要な箇所が出るたびに都度確認する。**
- 呼び出し方(段落ごとに1回 or まとめてバッチ)はコアが決め打ちにせず、**ミドルウェア作成者が自由に実装できる**ようにする。そのため2つの形を許容する:
  - 単発形: `(ctx: TranslateContext, next) => Promise<string | null>` — 1件ずつ呼ばれる、最も単純な形。
  - バッチ形: `(ctxs: TranslateContext[]) => Promise<(string | null)[]>` — 1回の呼び出しで複数件まとめて処理したい場合用。コアはミドルウェアの形(関数のシグネチャ/フラグ)を見て、単発なら1件ずつ、バッチなら missing 分をまとめて渡す。
  - Kiritan 自体は具体的なプロバイダのミドルウェアを内蔵しない(依存を増やさない)。代わりに別パッケージとして提供し、まず `@kiritan/deepl` と `@kiritan/google-translate` から始める(13章)。
- 自動翻訳で埋まった箇所は必ず `machine: true` としてマーキングし(`catalog` はフィールド、`sidecar`/`inline` はコメントマーカー)、`kiritan check` でレビュー待ちとして検出できるようにする。
- ソース単位(`sources[i].translate`)でチェーン自体を丸ごと上書きできる。

> 公式のリファレンス実装は、`@kiritan/deepl` や `@kiritan/google-translate` のように別パッケージとして切り出している(13章参照)。

### 7.1 単発形とバッチ形の混在

`translate.middlewares` 配列には単発形とバッチ形を混在させてよい。パイプラインは配列を先頭から見て、連続する単発形を1つの「単発グループ」として自動的にまとめ、バッチ形はそれ単体で1つの「バッチグループ」として扱う。

```ts
middlewares: [
  cacheMiddleware(),      // Single form ┐
  localGlossary(),        // Single form ┘→ Group A (chained item-by-item via ctx/next)
  googleTranslateBatch(), // Batch form    → Group B (all items still missing at that point, passed together)
  postProcess(),          // Single form    → Group C (applied only to what Group B didn't resolve)
]
```

グループは配列順に実行され、あるグループで解決しなかったアイテムだけが次のグループに渡される。これにより「まず1件ずつキャッシュを見る→残りをまとめてAPIに投げる→最後に1件ずつ整形する」のような組み合わせが自然に書ける。

## 8. ステイル検知

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

## 9. ランタイム i18n(`@kiritan/runtime`)

i18next の定番である「`locales/{lang}.json` に全キーを集約する」形式は、ファイルが肥大化する・使われなくなったキーに気づけない・PRの差分が読みにくい・キーごとの全言語比較がしづらい、といった不満が根強い。Kiritan はこれを唯一の前提にせず、ドキュメント側の `TranslationStore`(4章)と同じ考え方で**リソースの置き場所を戦略として選べる**ようにする。

### 9.1 リソース配置戦略(`ResourceSourceConfig`)

```ts
interface ResourceSourceConfig {
  glob: string;
  strategy: 'colocated' | 'split' | 'centralized' | 'embedded' | string; // A string means a custom strategy ID
  exportName?: string; // The named export read for the 'embedded' strategy. Default: "i18n"
  namespace?: (filePath: string) => string; // Default: auto-derived from the file path
}
```

| strategy | 置き方 | 例 |
| --- | --- | --- |
| `colocated` | コンポーネントの隣に1ファイル、全ロケールをまとめる | `Button.i18n.ts` |
| `split` | コンポーネントの隣だが、ロケールごとに別ファイル | `Button.en.i18n.ts` / `Button.ja.i18n.ts` |
| `centralized` | 専用ディレクトリにロケールごと(または1つ)にまとめる。i18next 互換の入力形式でもある | `locales/en.json` / `locales/{locale}/common.json` |
| `embedded` | 専用ファイルを作らず、コンポーネント自身のファイル内に直接書く | `Button.tsx` 内の `export const i18n = {...}` |

いずれの戦略も最終的には同じ内部形 `ResourceModule`(`key → { locale: value }`)に変換されるため、`createT`・`kiritan typegen`・9.6章のキー不一致チェックはすべての戦略に対して同じように動く。複数の戦略を同じプロジェクト内で混在させてもよい(`runtime.sources` に複数エントリを並べる)。

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

`kiritan init` が生成する既定設定では `colocated` 戦略・`src/**/*.i18n.{js,ts}`(`.json` も対象に含めてよい)を推奨のデフォルトとする。`.ts` 前提にはせず、JS のみのプロジェクトでもそのまま使える形にする。

### 9.2 `colocated` — コロケート×全言語1ファイル(ネイティブ形式)

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

- 推奨のデフォルトは `*.i18n.ts`(型安全の恩恵が最大)だが、`*.i18n.js`(JSプロジェクト向け)や `*.i18n.json` も同格でサポートする。
- **型安全は無料で手に入る**: `createT(messages)` に渡す `messages` はただの TS オブジェクト(`.i18n.ts`)または `resolveJsonModule` 経由の JSON(`.i18n.json`)なので、TypeScript のジェネリクス推論だけで `t()` の第一引数が実在するキーに絞り込まれる。typo は別途コード生成をしなくてもコンパイルエラーになる(複数ファイルを集約する場合は9.6章)。`.js` の場合は JSDoc 型注釈が無い限り推論の恩恵は限定的(`checkJs` 環境なら一部効く)。
- **同一ファイル内でロケール間の抜けがひと目で分かる**: `submit: { en: 'Submit' }` のように `ja` を書き忘れても、i18next のようにファイルを跨いで探す必要がなく、その場で気づける(機械的な検出は9.7章)。
- `%{param}` の単純補間(ドキュメント側の変数展開と同じ記法・実装を共有する)。
- フォールバック順は `locale → fallbackLocale → key自身`。
- 複数形・ICU は v1 の範囲外。`formatters` オプションで後から拡張できる形にしておく。
- 未使用になったコンポーネントの `.i18n.ts` はコンポーネント自体の削除と一緒に消えるため、i18next の集中管理でありがちな「使われていない翻訳キーが残り続ける」問題も起きにくい。バンドラーからも、使われていないコンポーネントの翻訳が巻き込まれない(コード分割の単位と一致する)。

### 9.3 `split` — コロケートだがロケールごとに別ファイル

```
src/components/Button/
  Button.en.i18n.ts   // export default { submit: 'Submit', cancel: 'Cancel' }
  Button.ja.i18n.ts   // export default { submit: '送信', cancel: 'キャンセル' }
```

`glob` にロケールトークンを含む形(例: `*.{locale}.i18n.ts` に対応する実ファイル名から `{locale}` 部分を抽出)で対応するファイル群を1セットとして束ね、内部的に 9.2 と同じ `ResourceModule` へマージする。コロケートはしたいが、1ファイルが多言語で長くなるのを避けたい場合の選択肢。9.2 と違い「同一ファイル内で抜けに気づける」利点は無くなるため、抜けの検出は 9.7 章の機械チェックに頼ることになる。

### 9.4 `centralized` — 専用ディレクトリに集約(i18next 互換)

i18next からの移行・i18next への移行を容易にするため、i18next の慣習(`locales/{locale}/{namespace}.json` のようなロケール別集中ファイル)もそのまま入力形式としてサポートする。読み込んだ内容は内部的に `ResourceModule` へ変換してから `createT`/`typegen` に渡す。

- i18next の複数形サフィックス(`key_one` / `key_other` 等)は **解釈はしないが値としては保持・パススルー**する(v1 では `t()` は複数形選択ロジックを持たないため、呼び出し側が明示的にキーを選ぶ運用になる)。
- namespace は i18next 側のファイル配置(`{namespace}.json`)をそのまま踏襲する。

### 9.5 `embedded` — コンポーネントファイル内に直書き

専用の翻訳ファイルすら作らず、コンポーネントの実装ファイルに直接書きたい場合向け。

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

- アプリ内で直接 `createT(i18n)` するだけなら Kiritan 側の関与は不要(9.2 と同じくただの TS オブジェクト)。
- `runtime.sources` に `strategy: 'embedded'` を登録すると、`kiritan typegen`/`kiritan check` がビルド時にそのファイルを読み込み(設定ファイルの `.ts` 読み込みと同じ jiti ベースの動的 import)、`exportName`(既定 `"i18n"`)で指定した named export だけを取り出して集約・チェック対象にする。
- コンポーネントのロジックと翻訳が同じファイルに同居するため、ファイル数は増えないが、ファイルが大きくなりやすい・`embedded` を大量に集めると import コストが上がる、という trade-off がある。

### 9.6 複数ファイルの集約と型生成(`kiritan typegen`)

1ファイル直import(9.2/9.5)は TS の推論だけで型安全になるが、`runtime.sources` で**複数ファイルをまとめて1つの `t()` にする**場合(アプリ全体で共通の `t()` を使いたい場合など)は、集約結果の型を静的に知る手段が無くなる。ここでのみ `kiritan typegen` を使う。

- ファイルパスから名前空間を自動導出する(例: `src/components/Button/Button.i18n.ts` → `components/Button`)。手動でのnamespace管理は不要(`namespace` 関数で上書き可)。
- `kiritan typegen` は集約済みリソースの形(namespace × key × locale)から `.d.ts` を生成し、集約後の `t('components/Button.submit')` のような呼び出しも型チェック対象にする。
- 生成した型情報は 9.7 章のロケール間キー不一致チェックの入力にもなる。

### 9.7 ロケール間キー不一致チェック

`kiritan check`(8章)に、ランタイムリソースの**ロケール間キー不一致**(あるロケールにだけキーが無い/余分にある)を検出する項目を追加する。

- `colocated`/`embedded`(1ファイル内に全ロケール)は、ファイル単体を静的に見るだけで抜けが分かる(クロスファイルの突き合わせが不要)。
- `split`/`centralized`(ロケールごとに別ファイル)は、対応するファイル同士のキー集合を突き合わせて不一致を検出する。
- `check.failOn` の `'i18n-key-mismatch'` で、ドキュメント側の `missing`/`stale` と同じ扱いで CI に組み込める。

## 10. CLI / プログラム API

CLI の骨組みは [yargs](https://github.com/yargs/yargs) を使う(サブコマンド定義・ヘルプ表示・型付き引数を自前実装しない)。`kiritan` は以前 [citty](https://github.com/unjs/citty) を使っていたが、citty には自身の`--help`出力や引数解析エラー(`Missing required argument`、`Unknown argument` 等)を翻訳するフックが無く、ライブラリ自身にハードコードされた英語の文字列だった。yargsはこうした定型文言すべてに対する翻訳をバンドルで持っており(`.locale("ja")`で`Commands:`/`Options:`/`Missing required argument: %s`等が日本語に切り替わる)、これによってCLI自身の`console.log`だけでなく`--help`とエラー出力まで実際に多言語化できるようになった。

```
kiritan init [--lang] [--force]                            # Scaffolds .kiritanconfig / base/README.base.md / a .gitignore entry for local.kiritanconfig
kiritan build [--lang] [--mode] [--config] [--locale]     # Runs the full pipeline (every strategy)
kiritan extract [--lang] [--mode] [--config] [--locale]   # catalog-strategy sources only. Creates/updates catalogs
kiritan translate [--lang] [--mode] [--config] [--locale] # Fills missing/stale via translate.middlewares (every strategy)
kiritan typegen [--lang] [--mode] [--config]              # Generates a .d.ts from the runtime.sources aggregation (chapter 9.6)
kiritan check [--lang] [--mode] [--config] [--locale] [--json] # For CI (or editor tooling with --json). Exits non-zero on missing/stale/unreviewed/i18n-key-mismatch
kiritan verify [--lang] [--mode] [--config] [--locale] [--json] # Checks generated docs are byte-for-byte what build would write (by hash); writes nothing. Exits non-zero on a mismatch/missing file
```

`kiritan init` は書き込み先のファイルが既に存在する場合はそのまま残す(`--force` で上書き) — 3つのうち一部だけ既に用意されているプロジェクトでも再実行して安全。`build`/`check`/`translate`/`extract` はいずれも `--locale <locale>` を受け付け、実行対象を `locales.list` 全体ではなく1ロケールに絞れる。`kiritan typegen` だけは対応しない — 常に全ロケールを1つのランタイムモジュールに集約するコマンドのため。

`--lang <en|ja>` はCLI自身の表示言語を選ぶ — 各コマンド/オプションの説明文、`--help`出力、CLI自身が出す成功/何もしなかった旨のプレーンテキスト行(`--json`出力は機械可読のまま変わらない)が対象で、どの*ドキュメント*ロケールに対して実行するかを選ぶ`--locale`とは別物。`--lang`を指定しない場合は`KIRITAN_LANG`、次に通常のPOSIXロケール環境変数(`LC_ALL`、`LC_MESSAGES`、`LANG`)、最後に`en`にフォールバックする。明示的だが未対応の`--lang`(例: `--lang fr`)は黙ってフォールバックするのではなく、通常の不正な選択肢エラーとして報告される。CLI自身の文字列は`packages/kiritan/src/cli/messages.i18n.ts`に置かれており、このリポジトリ自身の`.kiritanconfig`における`colocated`戦略の`runtime.sources`リソースになっている — そのため`kiritan check`/`kiritan typegen`は、他のプロジェクト自身のリソースと同じようにここでのen/ja対の欠落も検出する。パイプライン関数(`packages/kiritan/src/pipeline/*.ts`)由来の`CheckIssue.detail`やスローされる`Error.message`は翻訳されない — これらはCLIとプログラムAPIの両方が使うライブラリレベルの文字列であり、`--lang`に関わらずNodeのライブラリ自身の例外と同じく英語のままとなる。

```ts
export { defineConfig, build } from 'kiritan';
export type { KiritanConfig, TranslationStore, Renderer, TranslateMiddleware, BatchTranslateMiddleware } from 'kiritan';
```

ランタイム部分は `kiritan` のサブパスではなく独立パッケージ `@kiritan/runtime`(2.1章)として提供し、ドキュメントビルド関連のコード(remark 等)を一切バンドルに含めずに済むようにする。

```ts
export { createT } from '@kiritan/runtime';
export type { CreateTOptions } from '@kiritan/runtime';
```

## 11. 拡張ポイント一覧

| 種別 | v1での状況 |
| --- | --- |
| 翻訳格納戦略 | `sidecar` / `inline` / `catalog` は組み込みでハードコードされているが、それ以外の `strategy` 文字列を使うソースは、`plugins.stores[strategy]` に登録されていれば実際にそこへディスパッチされるようになった(4章、`TranslationStore`) — `build`/`check`/`translate`/`extract` のすべてがこれを呼び出す。組み込みにも登録済みストアにも一致しない `strategy` は、4コマンドすべてで分かりやすいエラーを投げる。 |
| ランタイムリソース配置戦略 | `colocated` / `split` / `centralized` / `embedded`(9.1章)は `ResourceSourceConfig.strategy` 経由で実際にディスパッチされている。カスタムの文字列戦略は型としては受け付けるが、処理する実装はまだ無い。 |
| 翻訳ミドルウェア | 現状で実際に拡張可能: 組み込みプロバイダは無く、`translate.middlewares` 配列だけで完結する(利用者が自由に実装。`docs/` に実装例を掲載)。 |
| ファイルレンダラー | `plugins.renderers`(6章)経由で現状も実際に拡張可能: レンダラーは、パイプラインの各段階が使うのと同じmdastツリーに対する `parse`/`stringify` の組。組み込みは `markdown`・`text`・`mdx`。 |
| 言語切り替えリンクの描画 | `SwitcherConfig.render`(6.1章)経由で現状も実際に拡張可能。 |

`plugins.stores` と `plugins.renderers` はどちらも13章の通り配線済み。

## 12. 未決事項(実装しながら詰める)

現時点で無し。実装を進める中で出てきたものをここに追記する。

## 13. ロードマップ / 将来検討

- **`translate.auto` の強制**: 対応済み。7章は一貫して「`translate.auto` が `true` でない限り自動翻訳は一切走らない」と述べていたが、実装はこのフラグを無視し、設定されたミドルウェアをそのまま実行していた。`kiritan translate` は、有効な `translate` 設定が `auto: true` でない限り何も実行せず、ソースにミドルウェアがあるのに `auto` がoffの場合は、黙って何もしないのではなくそう伝える(`TranslateResult.autoDisabled`。CLIが表示する)。ソース自身の `translate` は(`SourceConfig.translate` が元々記載していた通り)トップレベルの設定を丸ごと置き換えるため `auto` を継承せず、自身の `auto: true` が必要になる。すべてのREADMEの例に設定済み。
- **翻訳ミドルウェアの公式パッケージ化**: [`@kiritan/deepl`](../packages/deepl) は対応済み — `deepl()`(1件ごとに1リクエスト)と `deeplBatch()`(言語ペアごとに1リクエスト、DeepLの上限である50件まで)。`%{name}` のプレースホルダーはDeepLに無視させるタグ(`tag_handling: xml` と `ignore_tags`)で包んでおり、残りのテキストを送信時にXMLエスケープ、受信時にアンエスケープするのもそのため。リクエストの形はDeepL公式のAPI仕様に照らして偽の `fetch` でユニットテストしているが、実際のサービスに対しては実行していない。[`@kiritan/google-translate`](../packages/google-translate) も同じ前提で対応済み: `googleTranslate()`/`googleTranslateBatch()` がCloud Translation Basic(v2)APIを使い、1リクエストあたり128件/3万コードポイントで分割する。`%{name}` は `<span translate="no">` と `format: "html"` で守るため、残りのテキストを送信時にHTMLエスケープし、Google自身が加えるエンティティ(アポストロフィが `&#39;` で返ってくる等)を受信時にデコードする。こちらも実際のAPIに対してではなく、公式の仕様の形に対するユニットテストのみ。
- **`@kiritan/middleware`**([`packages/middleware`](../packages/middleware)): 対応済み。`createTranslator({ name, translate | translateBatch, ... })` は、素の「このテキストを翻訳する」関数を完全なバッチ形ミドルウェアにするため、プロバイダー(や利用者自身のコード)は呼び出しの部分だけを書けばよい。この層が必要なのは、ミドルウェアに届くのが生のMarkdown(`sidecar` ではファイル全体、`catalog` ではディレクティブ1つ分の本文)であり、素のプロバイダー呼び出しではこれを正しく扱えないため: コード・URL・front matter・`:::kiritan` の行まで翻訳してしまい、長いREADMEはプロバイダーの長さ上限を超える。この層は (1) 保護対象を `[[N]]` トークンに置き換え、1つでも失われた結果は拒否する(トークンの形はGoogleとMyMemoryの実際のエンドポイントで試して選んだ。`<span translate="no">` を書き換えたり `XPH0X` のような単語を分断するものがあった)、(2) `maxChars` を超えるテキストを段落の境界で分割して元の間隔のまま結合し直し、短いものは `maxBatchSize`/`maxBatchChars` の範囲で `translateBatch` にまとめる、(3) 並列数・リクエスト間隔・再試行(ネットワークエラーと408/409/425/429/5xxのみ)を適用する、(4) 翻訳結果をメモリまたはJSONファイルにキャッシュする、(5) `onError: "skip"` なら失敗したテキストだけを次のミドルウェアに任せる。Markdownはパターンで照合する代わりに `@lezer/markdown`(GFM込み)でパースする: パーサーが報告する本文以外の範囲をすべて保護するため、表・入れ子のフェンス・setext見出し・参照リンク・HTMLブロックのような構造は、Markdownに追従し続けなければならない正規表現の一覧ではなくパーサーが扱う。再試行と並列数には `es-toolkit`、リクエスト間隔には `limiter`、文・単語・書記素単位の切り分けには `Intl.Segmenter`、ロケールの解析には `Intl.Locale` を使う。`kiritan` には依存しない(構造的な型)。`@kiritan/deepl` と `@kiritan/google-translate` もこの上に作られている: この層の `wire` オプションにより、保護・分割・再試行はこの層が行いつつ、それぞれが `[[N]]` トークンをプロバイダー自身の「触らないで」マークアップ(DeepLの無視するXMLタグ、Googleの `translate="no"` のspan)で包める。サイズ上限は実際に送られる形(エスケープ・ラップ済みで、DeepLはさらにJSONエンコード済み)で測るため、`sidecar` 翻訳で送るREADME全体は拒否されずに分割される。
- **`@kiritan/free-translate`**([`packages/free-translate`](../packages/free-translate)): 対応済み。APIキー不要のミドルウェアで、すべて `@kiritan/middleware` の上に作られている。ホスト型: `myMemory()`(公開されている無料API。1リクエスト500バイトのため、この層の `measure` オプションでバイト単位に分割する)と `googleFree()`(非公式の `clients5.google.com` の `dict-chrome-ex` エンドポイント。まとめ送信に対応し、未知の言語コードには原文がそのまま返るため、コードを事前に検証する)。セルフホスト型: `libreTranslate({ baseUrl })`(自分で動かすサーバー上のオープンソースのエンジン。`q` が配列なのでまとめ送信に対応)と `appsScript({ url, secret })`(自分のアカウントからデプロイする小さなGoogle Apps Scriptのウェブアプリで、組み込みの `LanguageApp.translate` を使う。READMEに貼り付けるスクリプト、デプロイ手順、よくある2つの失敗 — 「全員」にデプロイしていない、新しいバージョンを出さずに編集した — を載せている)。Apps ScriptはPOSTに対し、一度きりの結果URLへの302で応答するため、このプロバイダーは偽の `fetch` だけでなく、そのように応答する本物のローカルHTTPサーバーに対してもテストしている。ホスト型のどれを作るかは実機から試して決めた: MyMemoryとChrome拡張機能のエンドポイントは使えた一方、素の `client=gtx` エンドポイントはCAPTCHAに当たり、LingvaはCloudflareの向こう側にあり、Microsoft Edgeの翻訳認証は何も返さず、libretranslate.comはキーが必須だった。Apertiumのプロバイダー(公開サーバー。ヨーロッパ系の言語のみで日本語は無い)は作った上で、Kiritanを使うプロジェクトの多くが必要とする言語には役に立たないため取り除いた。`googleFree`・`myMemory`・この層は、実際のサービスに対してMarkdownのサンプル(front matter、見出し、太字、リスト、引用、表、コードフェンス、エンティティ、`%{name}`)で最初から最後まで実行している。`libreTranslate` と `appsScript` は、公式に記載されたリクエスト/レスポンスの形に対してのみ検証しており、実行対象のLibreTranslateサーバーもApps Scriptのデプロイも用意できなかった。`googleFree` は非公式で、制限やブロック、変更の可能性があり、READMEにもそう明記している。
- **AI Agent Skill**: [`skills/kiritan`](../skills/kiritan) —対応済み。npmパッケージでもビルドも不要な、単一の自己完結した `SKILL.md` として、ディレクティブ記法・どのCLIコマンドを使うべきか・よくある間違いをコーディングエージェントに教える。導入方法は [skills/README.md](../skills/README.md) を参照。
- **`kiritan init`**: 対応済み。新規プロジェクトで `.kiritanconfig`・`base/README.base.md`・`local.kiritanconfig` の `.gitignore` への追記を生成する — 生成される設定は `sources` を `base/README.base.md` に向け、`naming.template` を `{dir}` を除いた形に上書きする(このリポジトリ自身の `.kiritanconfig` と同じ規約で、`README.md`/`README.ja.md` が `base/` 内ではなくプロジェクトルートに出力されるようにするため)。あわせて `colocated` 戦略(9.1章)を推奨する `runtime.sources` エントリも含める。書き込み先のファイルが既に存在する場合は `--force` を付けない限りそのまま残すため、一部だけ既に用意されているプロジェクトで再実行しても安全。
- **コマンド共通の `--locale` フラグ**: 対応済み。`build`/`check`/`translate`/`extract` がそれぞれ `--locale <locale>` を受け付け、実行対象を `locales.list` 全体ではなく1ロケールに絞れる。共通のヘルパー `resolveTargetLocales` を介しており、`locales.list` に無いロケールを指定した場合は分かりやすいエラーで弾く。`build` のswitcherリンクは `--locale` の指定に関わらず設定済みの全ロケールを表示し続ける — 他のロケールのファイルは既にディスク上に存在しており、switcherは今回の実行だけを説明するものではないため。`kiritan typegen` だけは対応しない — 常に全ロケールを1つのランタイムモジュールに集約するコマンドのため、1ロケールに絞る意味のある方法が無い。
- **VS Code 拡張機能**: [`extensions/vscode`](../extensions/vscode) —対応中。`:::kiritan{...}`/`::kiritan{...}` ブロックのシンタックスハイライト(Markdownに注入する宣言的なTextMate文法のみ、コンパイル済み拡張機能コードは無し)は完了。`otoneko1102.kiritan` として公開する(VS Code の拡張機能識別子に `/` を含められないため、当初構想していた `@kiritan/vscode` は使えず、`package.json` の `"name"` はそのまま `"kiritan"` にしている)。これはCLIパッケージのnpm名と衝突するため、`packages/` ではなく `extensions/` 配下に置いており、ルートの `"workspaces": ["packages/*"]` には拾われない — ビルド・テストに必要なツールはルートの `package.json` の `devDependencies` に置いている(2.1章)。`%{name}`(とそのエスケープ形式 `\%{name}`)のハイライト、`:::kiritan` ブロックの折りたたみ(小さなスタックでコロンの個数を対応させているため、他のディレクティブがネストしていても混乱しない)、`:::kiritan{#<id>}` から隣接する `<base>.<locale>.catalog.json` 内の該当エントリへのジャンプ、未定義の`%{name}`変数の警告、`missing`/`stale`/`machine`のインライン表示は、いずれも完了 — 最後の2つが、それ以外の機能が待っていた「より大きな設計判断」を決着させた。`kiritan`の内部実装をプロセス内で直接読み込む(壊れた・バージョンの合わないプロジェクトのインストールがそのままクラッシュ/不整合につながる実際のリスクがある)代わりに、`diagnostics.cjs`はワークスペース自身にローカルインストールされた`kiritan check --json`を子プロセスとして起動する — ESLint/Prettierのエディタ統合が自身のローカルインストールに対して行っているのと同じアプローチ。`npx --no-install`により、`kiritan`に依存しないプロジェクトでは意図せぬネットワーク経由のインストールが走らず、単に何もしない。`kiritan check`はこのために`--json`フラグと`CheckIssue.id`(catalogセグメントidがある場合)を新たに備えた。コードフェンス内やインラインコードスパン内の`%{name}`は、`interpolation.skipCodeBlocks`の既定動作に合わせて検出対象外にしている — これは拡張機能自身のREADME(この記法をリテラルな例として示している)に対して実際にテストして見つかった問題だった。未定義変数の検出は既定の`%{`/`}`区切り文字にのみ対応しており、`interpolation.delimiters`をカスタマイズしているプロジェクトでも他の機能はそのまま使える。あわせて `*.kiritanconfig` を独自言語として登録し、ハイライトはTextMateの `include` で `source.js` に委譲、括弧・コメント・インデントのルールも独自の `language-configuration.json` でJavaScript相当にしている — これが設定ファイルを `.kiritan.mjs` ではなく `*.kiritanconfig` と命名した理由でもある(3.1章)。ファイルアイコンテーマ自身のルールは常に言語のフォールバックアイコンより優先されるため、実在する `.mjs` 拡張子のままではvscode-iconsのようなテーマで永久に汎用的なJavaScriptアイコンのままになってしまう。見たことの無いファイル名に対して具体的なルールを持つアイコンテーマは存在しないため、この言語登録だけで、テーマ側の個別設定なしにあらゆるアイコンテーマでKiritan固有のアイコンが表示される。ただし本物のコード補完には文法だけでは足りない — 組み込みのTypeScript/JavaScript言語サービスは実際の `javascript`/`typescript` 言語IDにしか反応せず、かといって `*.kiritanconfig` に本物の `javascript` IDを与えるとvscode-icons自身の言語ベースのアイコンルールがカスタムアイコンを上書きしてしまう。`extension.cjs` はこれを橋渡しする — `*.kiritanconfig` ドキュメントの内容を、メモリ上の `javascript` ドキュメント(`TextDocumentContentProvider` による仮想ドキュメント。untitledドキュメントではない — untitledは実体のある編集可能バッファでVS Codeが未保存として数えてしまうため、この橋渡しの初期版では誤ってuntitledを使っていた)に複製し、補完リクエストをVS Code組み込みのプロバイダーへ転送することで、アイコンとフルIntelliSenseを両立させている。
- **Vim/Neovim プラグイン**: [`extensions/vim`](../extensions/vim) — ハイライトは完了、それ以外はまだ未着手。ここで当初想定していた共有tree-sitter文法/LSPではなく、素のVimscriptで実装した — それは実際に投資が必要な選択肢であり、当面の目標(VS Code拡張機能自身のv1に合わせる)にはまだ必要なかったため。`after/syntax/markdown.vim` は組み込みの `markdown` 文法に重ねる形で `:::kiritan{...}`/`::kiritan{...}` ディレクティブと `%{name}` 補間をハイライトする、VS Code拡張機能のTextMate文法注入に相当する仕組み。`ftdetect/kiritanconfig.vim` は `*.kiritanconfig` ファイルに本物の `javascript` filetypeを直接設定する — Vim/Neovimのアイコンエコシステムにはvscode-iconsの言語ルールと同じトレードオフが無いため、VS Code拡張機能の `kiritanconfig` 独自言語という回避策は不要(3.1章)。実際のヘッドレス `vim -u NONE` プロセス(`synID()`/`synIDattr()` で特定位置を問い合わせる)に対して検証しており、単に `.vim` ソースへのアサーションではない — VS Code拡張機能のグラマーテストと同じ厳密さ。この過程で実際に見つかった落とし穴: Vimの `:syntax on` のautocommandは、`'runtimepath'` の各エントリ自身の `syntax/` サブディレクトリに対してのみ `runtime! syntax/<ft>.vim` を実行し、ネストした `after/syntax/` は決して見ない — そのため、プラグインの `after/` サブディレクトリを `'runtimepath'` に**別エントリとして**追加しない限り(プラグインマネージャーは自動的に行う)、`after/syntax/markdown.vim` は一切読み込まれない。折りたたみ(`after/ftplugin/markdown.vim` が `'foldexpr'` を `autoload/kiritan.vim` の `kiritan#FoldExpr` に設定し、`folding-core.cjs` と同じコロン個数スタックのアルゴリズムで各行の折りたたみレベルを事前計算、バッファごとに `b:changedtick` を鍵にキャッシュする)とcatalogエントリへのジャンプ(`:KiritanJumpToCatalog`。既定では何のキーにも割り当てず — 詳細はプラグインのREADMEの `<Plug>(kiritan-jump-to-catalog)` の配線方法を参照。複数ロケールのcatalogが一致する場合はquickfixリストに反映)も完了しており、同じく実際のvimプロセスで検証している。未定義の`%{name}`検出と`missing`/`stale`/`machine`のインライン表示も完了しているが、Neovim限定(`nvim-0.10+`)——`lua/kiritan/diagnostics.lua`(`plugin/kiritan.lua`が自動読み込み)は、VS Code拡張機能の`diagnostics.cjs`のアプローチをそのまま移植している。ワークスペース自身にローカルインストールされた`kiritan check --json`を`npx --no-install`経由で実行し、その結果を実際の`vim.diagnostic`として設定する。素のVimには`vim.diagnostic`/`vim.system`に相当するものが無く、そもそも明示的な読み込み防止すら不要 — Vim自身のランタイムローダーは`plugin/*.vim`しか見ず`.lua`は一切見ないため、`plugin/kiritan.lua`はVim上では最初から読み込まれない(実際に確認済み: 追加してもVimの`:scriptnames`には一切現れず、エラーも副作用も無かった)。Vimscript側と同様、実際のヘッドレス`nvim --clean`プロセスで検証しており、公開前に実際のバグを発見した: `kiritan check`は`check.failOn`に一致する問題がある場合(まさに診断したいケース)に終了コード1を返すが、checkのコールバックが終了コードが非ゼロの場合に結果を破棄していたため、最も重要なシナリオで何も報告されなくなってしまっていた。同じ理由(Node's `exec`は非ゼロ終了で常にrejectするが、reject後のエラーオブジェクトにも`.stdout`は残っている)による同じバグがVS Code拡張機能自身の`diagnostics.cjs`にも潜んでおり、あわせて修正した。リリースも他のコンポーネントより軽量 — ビルドすべきものが無いため、`release-vim.yml` はテストスイートを実行してコミットに `kiritan-vim@<version>` タグを打ち、`--generate-notes` でGitHub Releaseを作成するだけ(添付ファイルなし)。バンプ元となる現在のバージョンを保持する `package.json` が無いため、既存の `kiritan-vim@*` タグのうち最新のものを起点にし、使い捨ての `package.json` で `npm version` 自身のsemverロジックを借用する — `release.yml` と同じ `patch`/`minor`/`major`/`prerelease` キーワードまたは明示的なバージョンの `version` 入力。
- **`plugins.stores` の配線**: 対応済み。`build`/`check`/`translate`/`extract` はすべて、`strategy` が `plugins.stores` のキーに一致するソースを、例外を投げる代わりにその `TranslationStore` の `read`/`write`/`status`(4章・11章)へディスパッチするようになった — 宣言されている2つの `TranslatedContent` 形状は、組み込みの2戦略をきれいに一般化できることが分かった: `"full-text"` の結果はsidecar方式で扱う(独立したドキュメントとして新規にparseする)。`"segments"` の結果(または何も保存されていない場合)はcatalog方式で扱う(`renderForLocale` 既存のper-idフォールバックにそのまま流し込むため、新しいフォールバック処理は不要だった)。stalenessの判定は完全にストア自身の `status()` に委ねる — `check`/`translate` はその返り値をそのまま信用し、組み込みの `sidecar`/`catalog` が自分自身のために行っているような再計算はしない。プラグインストアはkiritanが中身を把握できないブラックボックスだからである。`check` は `status()` のみを呼び `read()` は呼ばないため、`catalog` の `machine` フラグが生む「machine翻訳につき要レビュー」に相当する汎用issueはプラグインストアには存在しない — これは当面 `catalog` 固有の概念のままとする。`translate`/`extract` はどちらも `write` の無いストア(kiritanから読み取ることしかできない、外部TMSに裏付けられたストア等)に対しては何もしない。組み込みにも登録済みストアにも一致しない `strategy` は、以前は `build` だけが投げていた例外を、今や4コマンドすべてが投げるようになった — これは意図的な厳格化で、カスタム `strategy` のタイプミス(例: `"catalogg"`)は元々常に単なる設定ミスであり、今や実際にそれを判定するための登録機構が存在するようになったため。
- **`plugins.renderers` の配線**: 対応済み。ボトルネックは、元々宣言されていた `Renderer`(`parse(sourceText): { raw: string }`、`reassemble(doc, translated: string)`)が、`renderForLocale`/`collectCatalogSegments` が最初から最後まで操作しているmdastツリーを表現できなかったこと。そこで `parse(source): Root` / `stringify(tree): string` の組として定義し直した — 新しい形式は並行するパイプラインを持つのではなく、既存のツリーに**パースされる**ため、ディレクティブ解決・補間・switcher挿入はそのまま動く。`build`/`check`/`translate`/`extract` はソースファイルごとにレンダラーを解決し(6章)、あらゆるparse/stringifyをそれ経由で行う。Markdownと性質の違う形式のために、オプションの2つの機能を用意した: `supportsDirectives: false` はディレクティブ解決とswitcher挿入を飛ばし、`comment` が無ければ(Markdownでは `<!-- ... -->` コメントである)`kiritan:hash`/`kiritan:untranslated` のマーカーは単に書き込まれず、その形式にはstale検知が無い。`kiritan:hash` はHTMLコメント内に限らずどこにあっても検出するようになったため、独自の `comment` で好きな形に包める。
- **front matter保護**: 対応済み。先頭のYAMLブロックはmdastツリー上で1つの不透明な `yaml` ノードになり、parse/stringifyを経てもそのまま保たれ、補間もここには及ばない。`translateFrontmatter` オプション(ロケールごとのfront matter値)も検討したが当面見送った — `inline`/`catalog` にはロケール固有の値を置く場所が無く、意味を持つのは翻訳ファイルが自分自身のfront matterを持つ `sidecar` だけだったため。
- **`kiritan verify`**(とAPIの `verify()`): 対応済み。各生成ドキュメントが、現在のbaseファイルと設定から`build`が書き出す内容と一致するかを、ハッシュ(`hashText`。改行コードは正規化するので`autocrlf`のチェックアウトが誤検知にならない)で比較し、両方のハッシュを報告する。何も書き込まない。`build`を`renderOutputs()`(書き込み直前まで)と書き込みに分割して両者が同じコードパスを共有するため、`build`の実際の動作とずれうる別個の「期待される出力」ロジックは存在しない。`mismatch`は、前回のビルド以降にbaseファイルが変わった場合と、生成ファイルが手で編集された場合の両方を含み、`missing`は一度も生成されていないドキュメントを指す。欠落・staleな*翻訳*を扱う`check`とは別の問いに答えるため、`check`のissue種別の1つではなく独立したコマンドにした。なお`sidecar`の翻訳については、期待される出力はそのファイルを`build`に通して再生成したものなので、`build`が整形を正規化してしまう手書きの翻訳も不一致として表示される — `build`が書き換えるファイルと同じもの。
- **`text` レンダラー**: 対応済み(6章) — 上の `plugins.renderers` の項目が、インターフェースの実際の形を検証するために待っていた2つ目のレンダラーでもある。2つのオプション機能(`supportsDirectives: false` とコメント構文なし)の両方を実際に使い、それ以上のものは必要なかった。
- **`mdx` レンダラー**: 対応済み(6章)。引き継げなかった唯一のものが `%{name}` の補間で、MDX自身のパースを変えない限りそれは不可能。
