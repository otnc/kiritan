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
- 将来追加する翻訳ミドルウェアの参考実装(`@kiritan/google-translate` など、13章)も同じワークスペースの `packages/*` に追加していく想定。
- `extensions/vscode`(VS Code拡張機能、13章)は `packages/` の外に置くため、ルートの `"workspaces": ["packages/*"]` には拾われない — `package.json` の `"name"` が `"kiritan"` で、CLIパッケージ自身の名前と衝突してしまう(npm workspaceは同名パッケージを2つ持てない)ため。ビルド・テストに必要なツールはパッケージ側ではなく、ルートの `devDependency` として持たせる。
- 既存の `tsdown` / `vitest` / `eslint` / CI(`ci.yml` およびリリース用ワークフロー)はワークスペース対応に更新が必要(各パッケージごとのビルド・テスト・公開)。これは設計確定後の実装タスクとして扱う。
- バージョニングは **パッケージごとに独立**させる(lockstep にしない。共有のchangelog生成ツールも使わない)。パッケージごとに専用の `workflow_dispatch` ワークフロー(`release.yml` / `release-runtime.yml`)を持ち、どちらも実際の処理を行う共通の再利用可能ワークフロー(`_release-package.yml`)への薄いラッパーにすることで、片方のリリースがもう片方に誤って影響することを防ぐ:

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
  parse(sourceText: string): ParsedDocument;
  reassemble(doc: ParsedDocument, translated: Record<string, string> | string): string;
}
```

- `markdown`: remark + `remark-directive` による AST 解析。コードブロック・インラインコード・リンク URL を保護し、`:::kiritan{...}` ディレクティブの分解もここで行う。v1で実際に実装されているレンダラーはこれのみで、拡張子に関わらず全ソースをMarkdownとして処理する。
- `text`・`mdx`・front matter保護(`translateFrontmatter`)・カスタムレンダラー用の `plugins.renderers`、および後述のstrategy/レンダラー組み合わせ検証は、いずれもまだ設計段階でv1では未実装(13章で追跡)。

実装された場合の設計意図:

- `text`: 空行区切りの段落単位。`.txt` には Markdown 構文が無いため `:::kiritan{...}` は使えず、`inline`/`catalog` 戦略は非対応(`sidecar` のみ)になる想定。
- `mdx`: markdown 拡張。JSX 部分は非翻訳。`:::kiritan{...}` は markdown 同様に扱えるようにする想定。
- レンダラーは自分が対応できる `strategy` の一覧を宣言する(例: `text` は `['sidecar']` のみ)。設定読み込み時に `SourceConfig.strategy` と実際のファイル種別(レンダラー)の組み合わせを検証し、非対応の組み合わせ(例: `.txt` に `inline`)は build 前に分かりやすいエラーで弾く想定。

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
  - Kiritan 自体は `google`/`deepl` 等の具体的な公式ミドルウェアを内蔵しない(依存を増やさない)。ドキュメント(`docs/`)にリファレンス実装例を載せる。
- 自動翻訳で埋まった箇所は必ず `machine: true` としてマーキングし(`catalog` はフィールド、`sidecar`/`inline` はコメントマーカー)、`kiritan check` でレビュー待ちとして検出できるようにする。
- ソース単位(`sources[i].translate`)でチェーン自体を丸ごと上書きできる。

> 将来的に、公式のリファレンス実装を `@kiritan/google-translate` `@kiritan/deepl` のような別パッケージとして切り出すことも検討する(13章参照)。

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

CLI の骨組みは [citty](https://github.com/unjs/citty) を使う(サブコマンド定義・ヘルプ表示・型付き引数を自前実装しない)。

```
kiritan build [--mode] [--config]     # Runs the full pipeline (every strategy)
kiritan extract [--mode] [--config]   # catalog-strategy sources only. Creates/updates catalogs
kiritan translate [--mode] [--config] # Fills missing/stale via translate.middlewares (every strategy)
kiritan typegen [--mode] [--config]   # Generates a .d.ts from the runtime.sources aggregation (chapter 9.6)
kiritan check [--mode] [--config] [--json] # For CI (or editor tooling with --json). Exits non-zero on missing/stale/unreviewed/i18n-key-mismatch
```

`kiritan init`(`.kiritanconfig` / `README.base.md` の雛形生成、`local.kiritanconfig` の `.gitignore` への追記)と、各コマンド共通の `--locale` フラグ(実行対象を1ロケールに絞る)は、いずれもまだ設計段階でv1では未実装(13章で追跡)。

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
| 翻訳格納戦略 | `sidecar` / `inline` / `catalog` は組み込みだが、宣言されている `TranslationStore` インターフェース経由ではなく、パイプラインに直接ハードコードされている。`plugins.stores` はまだ配線されておらず、設定しても現状は何も効果が無い。 |
| ランタイムリソース配置戦略 | `colocated` / `split` / `centralized` / `embedded`(9.1章)は `ResourceSourceConfig.strategy` 経由で実際にディスパッチされている。カスタムの文字列戦略は型としては受け付けるが、処理する実装はまだ無い。 |
| 翻訳ミドルウェア | 現状で実際に拡張可能: 組み込みプロバイダは無く、`translate.middlewares` 配列だけで完結する(利用者が自由に実装。`docs/` に実装例を掲載)。 |
| ファイルレンダラー | 実装されているのは `markdown` のみで、拡張子に関わらず全ソースをMarkdownとして処理する。`.txt`/`.mdx`、宣言されている `Renderer` インターフェース、`plugins.renderers` はまだ配線されておらず、`plugins.renderers` を設定しても現状は何も効果が無い。 |
| 言語切り替えリンクの描画 | `SwitcherConfig.render`(6.1章)経由で現状も実際に拡張可能。 |

`TranslationStore`・`Renderer`・`plugins.{stores,renderers}` は、将来のプラグイン可能なバージョンが使う形として現時点でも宣言されているが、v1ではまだ何もこれらを読み書きしていない(13章で追跡)。

## 12. 未決事項(実装しながら詰める)

現時点で無し。実装を進める中で出てきたものをここに追記する。

## 13. ロードマップ / 将来検討

- **翻訳ミドルウェアの公式パッケージ化**: Google 翻訳 / DeepL などの参考実装を `@kiritan/google-translate` `@kiritan/deepl` のような別パッケージとして `packages/*` に追加する。v1 では追加せず、ドキュメントに実装例を載せるだけに留める。
- **AI Agent Skill**: [`skills/kiritan`](../skills/kiritan) —対応済み。npmパッケージでもビルドも不要な、単一の自己完結した `SKILL.md` として、ディレクティブ記法・どのCLIコマンドを使うべきか・よくある間違いをコーディングエージェントに教える。導入方法は [skills/README.md](../skills/README.md) を参照。
- **VS Code 拡張機能**: [`extensions/vscode`](../extensions/vscode) —対応中。`:::kiritan{...}`/`::kiritan{...}` ブロックのシンタックスハイライト(Markdownに注入する宣言的なTextMate文法のみ、コンパイル済み拡張機能コードは無し)は完了。`otoneko1102.kiritan` として公開する(VS Code の拡張機能識別子に `/` を含められないため、当初構想していた `@kiritan/vscode` は使えず、`package.json` の `"name"` はそのまま `"kiritan"` にしている)。これはCLIパッケージのnpm名と衝突するため、`packages/` ではなく `extensions/` 配下に置いており、ルートの `"workspaces": ["packages/*"]` には拾われない — ビルド・テストに必要なツールはルートの `package.json` の `devDependencies` に置いている(2.1章)。`%{name}`(とそのエスケープ形式 `\%{name}`)のハイライト、`:::kiritan` ブロックの折りたたみ(小さなスタックでコロンの個数を対応させているため、他のディレクティブがネストしていても混乱しない)、`:::kiritan{#<id>}` から隣接する `<base>.<locale>.catalog.json` 内の該当エントリへのジャンプ、未定義の`%{name}`変数の警告、`missing`/`stale`/`machine`のインライン表示は、いずれも完了 — 最後の2つが、それ以外の機能が待っていた「より大きな設計判断」を決着させた。`kiritan`の内部実装をプロセス内で直接読み込む(壊れた・バージョンの合わないプロジェクトのインストールがそのままクラッシュ/不整合につながる実際のリスクがある)代わりに、`diagnostics.cjs`はワークスペース自身にローカルインストールされた`kiritan check --json`を子プロセスとして起動する — ESLint/Prettierのエディタ統合が自身のローカルインストールに対して行っているのと同じアプローチ。`npx --no-install`により、`kiritan`に依存しないプロジェクトでは意図せぬネットワーク経由のインストールが走らず、単に何もしない。`kiritan check`はこのために`--json`フラグと`CheckIssue.id`(catalogセグメントidがある場合)を新たに備えた。コードフェンス内やインラインコードスパン内の`%{name}`は、`interpolation.skipCodeBlocks`の既定動作に合わせて検出対象外にしている — これは拡張機能自身のREADME(この記法をリテラルな例として示している)に対して実際にテストして見つかった問題だった。未定義変数の検出は既定の`%{`/`}`区切り文字にのみ対応しており、`interpolation.delimiters`をカスタマイズしているプロジェクトでも他の機能はそのまま使える。あわせて `*.kiritanconfig` を独自言語として登録し、ハイライトはTextMateの `include` で `source.js` に委譲、括弧・コメント・インデントのルールも独自の `language-configuration.json` でJavaScript相当にしている — これが設定ファイルを `.kiritan.mjs` ではなく `*.kiritanconfig` と命名した理由でもある(3.1章)。ファイルアイコンテーマ自身のルールは常に言語のフォールバックアイコンより優先されるため、実在する `.mjs` 拡張子のままではvscode-iconsのようなテーマで永久に汎用的なJavaScriptアイコンのままになってしまう。見たことの無いファイル名に対して具体的なルールを持つアイコンテーマは存在しないため、この言語登録だけで、テーマ側の個別設定なしにあらゆるアイコンテーマでKiritan固有のアイコンが表示される。ただし本物のコード補完には文法だけでは足りない — 組み込みのTypeScript/JavaScript言語サービスは実際の `javascript`/`typescript` 言語IDにしか反応せず、かといって `*.kiritanconfig` に本物の `javascript` IDを与えるとvscode-icons自身の言語ベースのアイコンルールがカスタムアイコンを上書きしてしまう。`extension.cjs` はこれを橋渡しする — `*.kiritanconfig` ドキュメントの内容を、メモリ上の `javascript` ドキュメント(`TextDocumentContentProvider` による仮想ドキュメント。untitledドキュメントではない — untitledは実体のある編集可能バッファでVS Codeが未保存として数えてしまうため、この橋渡しの初期版では誤ってuntitledを使っていた)に複製し、補完リクエストをVS Code組み込みのプロバイダーへ転送することで、アイコンとフルIntelliSenseを両立させている。
- **Vim/Neovim プラグイン**: [`extensions/vim`](../extensions/vim) — ハイライトは完了、それ以外はまだ未着手。ここで当初想定していた共有tree-sitter文法/LSPではなく、素のVimscriptで実装した — それは実際に投資が必要な選択肢であり、当面の目標(VS Code拡張機能自身のv1に合わせる)にはまだ必要なかったため。`after/syntax/markdown.vim` は組み込みの `markdown` 文法に重ねる形で `:::kiritan{...}`/`::kiritan{...}` ディレクティブと `%{name}` 補間をハイライトする、VS Code拡張機能のTextMate文法注入に相当する仕組み。`ftdetect/kiritanconfig.vim` は `*.kiritanconfig` ファイルに本物の `javascript` filetypeを直接設定する — Vim/Neovimのアイコンエコシステムにはvscode-iconsの言語ルールと同じトレードオフが無いため、VS Code拡張機能の `kiritanconfig` 独自言語という回避策は不要(3.1章)。実際のヘッドレス `vim -u NONE` プロセス(`synID()`/`synIDattr()` で特定位置を問い合わせる)に対して検証しており、単に `.vim` ソースへのアサーションではない — VS Code拡張機能のグラマーテストと同じ厳密さ。この過程で実際に見つかった落とし穴: Vimの `:syntax on` のautocommandは、`'runtimepath'` の各エントリ自身の `syntax/` サブディレクトリに対してのみ `runtime! syntax/<ft>.vim` を実行し、ネストした `after/syntax/` は決して見ない — そのため、プラグインの `after/` サブディレクトリを `'runtimepath'` に**別エントリとして**追加しない限り(プラグインマネージャーは自動的に行う)、`after/syntax/markdown.vim` は一切読み込まれない。折りたたみ(`after/ftplugin/markdown.vim` が `'foldexpr'` を `autoload/kiritan.vim` の `kiritan#FoldExpr` に設定し、`folding-core.cjs` と同じコロン個数スタックのアルゴリズムで各行の折りたたみレベルを事前計算、バッファごとに `b:changedtick` を鍵にキャッシュする)とcatalogエントリへのジャンプ(`:KiritanJumpToCatalog`。既定では何のキーにも割り当てず — 詳細はプラグインのREADMEの `<Plug>(kiritan-jump-to-catalog)` の配線方法を参照。複数ロケールのcatalogが一致する場合はquickfixリストに反映)も完了しており、同じく実際のvimプロセスで検証している。未定義の`%{name}`検出と`missing`/`stale`/`machine`のインライン表示も完了しているが、Neovim限定(`nvim-0.10+`)——`lua/kiritan/diagnostics.lua`(`plugin/kiritan.lua`が自動読み込み)は、VS Code拡張機能の`diagnostics.cjs`のアプローチをそのまま移植している。ワークスペース自身にローカルインストールされた`kiritan check --json`を`npx --no-install`経由で実行し、その結果を実際の`vim.diagnostic`として設定する。素のVimには`vim.diagnostic`/`vim.system`に相当するものが無く、そもそも明示的な読み込み防止すら不要 — Vim自身のランタイムローダーは`plugin/*.vim`しか見ず`.lua`は一切見ないため、`plugin/kiritan.lua`はVim上では最初から読み込まれない(実際に確認済み: 追加してもVimの`:scriptnames`には一切現れず、エラーも副作用も無かった)。Vimscript側と同様、実際のヘッドレス`nvim --clean`プロセスで検証しており、公開前に実際のバグを発見した: `kiritan check`は`check.failOn`に一致する問題がある場合(まさに診断したいケース)に終了コード1を返すが、checkのコールバックが終了コードが非ゼロの場合に結果を破棄していたため、最も重要なシナリオで何も報告されなくなってしまっていた。同じ理由(Node's `exec`は非ゼロ終了で常にrejectするが、reject後のエラーオブジェクトにも`.stdout`は残っている)による同じバグがVS Code拡張機能自身の`diagnostics.cjs`にも潜んでおり、あわせて修正した。リリースも他のコンポーネントより軽量 — ビルドすべきものが無いため、`release-vim.yml` はテストスイートを実行してコミットに `kiritan-vim@<version>` タグを打ち、`--generate-notes` でGitHub Releaseを作成するだけ(添付ファイルなし)。バンプ元となる現在のバージョンを保持する `package.json` が無いため、既存の `kiritan-vim@*` タグのうち最新のものを起点にし、使い捨ての `package.json` で `npm version` 自身のsemverロジックを借用する — `release.yml` と同じ `patch`/`minor`/`major`/`prerelease` キーワードまたは明示的なバージョンの `version` 入力。
- **`kiritan init`**: 新規プロジェクトで `.kiritanconfig` / `README.base.md` の雛形を生成し、`local.kiritanconfig` を `.gitignore` に追記する。10章でいずれのCLI構成の一部として記載しているが、v1では未実装。
- **コマンド共通の `--locale` フラグ**: `build`/`translate` 等の実行対象を `locales.list` 全体ではなく1ロケールに絞る。v1では未実装。
- **`plugins.stores`/`plugins.renderers` の配線**: 宣言されている `TranslationStore`/`Renderer` インターフェース(11章)を実際にプラガブルにする。v1では `sidecar`/`inline`/`catalog` とMarkdownレンダラーがパイプラインに直接ハードコードされている。
- **`text`/`mdx` レンダラーとfront matter保護**: v1で実装されているレンダラーは `markdown` のみで、`.txt`/`.mdx` 対応や `translateFrontmatter`(6章)はまだ設計段階。
