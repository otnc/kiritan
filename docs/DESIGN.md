# kiritan 詳細設計書

## 1. 概要

kiritan は、通常の「キー→文字列」i18n ライブラリの範囲に加えて、Markdown / MDX / プレーンテキストのようなドキュメントファイルそのものを対象にした国際化ユーティリティである。

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
  config/          # 探索・カスケード・merge(.kiritan.*)
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
  interpolate.ts    # %{name} の共通実装(kiritan 本体もこれに依存する)
  i18next-compat.ts  # i18next リソース(locales/{locale}/{namespace}.json)の読み込み
```

- `kiritan` から `kiritan/runtime` を re-export する形は取らず、`@kiritan/runtime` を独立パッケージにする(`kiritan` は `@kiritan/runtime` に依存しても、逆はない)。ランタイムだけを使いたいプロジェクトが `kiritan` 本体(remark 等のビルド時依存)を一切引き込まずに済む。
- CLI(`src/cli.ts`)以外はすべて CJS/ESM 両対応を維持する。remark/unified/micromark 系の依存は ESM 専用パッケージしか無い(CJS版へ戻すことは「古いバージョンを使う」ことになるため避ける)ため、`tsdown.config.ts` の `deps.alwaysBundle` でこれらを `dist/index.{cjs,mjs}` に直接バンドルし、CJS 利用者が ESM 専用パッケージを `require` する場面自体を無くす。CLI 専用の `citty` はバンドルせず外部依存のままでよい。
- 将来追加する翻訳ミドルウェアの参考実装(`@kiritan/google-translate` など、13章)も同じワークスペースの `packages/*` に追加していく想定。
- 既存の `tsdown` / `vitest` / `eslint` / CI(`ci.yml` / `release.yml`)はワークスペース対応に更新が必要(各パッケージごとのビルド・テスト・公開)。これは設計確定後の実装タスクとして扱う。
- バージョニングは **パッケージごとに独立**させる(lockstep にしない)。変更のあったパッケージだけをリリースできるよう [Changesets](https://github.com/changesets/changesets) を導入するが、標準の「Bot が Version Packages PR を自動作成し、それをマージすると publish される」という2段階PRフローは採用しない。**changeset ファイルの作成(各PRの一部)と、実際のリリース実行(手動 workflow_dispatch)を分離する**:

  1. 通常のPR: パッケージに影響する変更をしたら `npx changeset` を実行し、対象パッケージ・bump種別(patch/minor/major)・変更概要を1行で書いた changeset ファイル(`.changeset/*.md`)をPRに含めてコミットする(CONTRIBUTING.md に手順を追記)。
  2. `release.yml`(`workflow_dispatch`、引数は無し or `dist_tag` のみ): 手動実行すると、そこまでに溜まっている `.changeset/*.md` を集計して
     - `changeset version` でパッケージごとにバージョンを確定し、`package.json` と `CHANGELOG.md` を更新(消費した changeset ファイルは削除される)
     - 変更をコミット
     - `changeset publish` で、バージョンが上がったパッケージだけを `npm publish`(OIDC trusted publishing はパッケージごとに npmjs.com 側で設定)
     - パッケージごとに `<name>@<version>` の git tag を打ち、変更のあった各パッケージ分の内容を1つの GitHub Release にまとめる(リリースノートは `changeset` が生成した CHANGELOG の当該エントリを流用し、`--generate-notes` は使わない)
     - 溜まっている changeset が無ければ「リリース対象なし」として何もせず正常終了する

  これにより、日々の操作感(ボタンを押せばその場でリリースされる)は今のままに、パッケージごとの独立バージョニングと CHANGELOG 自動生成を両立させる。

## 3. 設定ファイル

### 3.1 探索とカスケード

ファイル名は `.kiritan.(base|<mode>|local).(c|m)(js|ts)`(例: `.kiritan.mjs`, `.kiritan.base.cts`, `.kiritan.dev.mts`)を認識する。`.ts`/`.cts`/`.mts` は [jiti](https://github.com/unjs/jiti) のような軽量ローダーで直接読み込む(Node の型ストリッピングはフラグなしで使えるバージョンが限られるため、利用者の Node バージョンを問わず動くことを優先し、kiritan 側の依存として引き受ける)。マージ順(下ほど優先度が高く、深いマージ):

1. `.kiritan.base.(c|m)(js|ts)`(無ければ `.kiritan.(c|m)(js|ts)` を基本レイヤーとして扱う)
2. `.kiritan.<mode>.(c|m)(js|ts)` — `mode` は `--mode` フラグ、なければ `KIRITAN_MODE` 環境変数。指定が無ければこのレイヤーはスキップ。
3. `.kiritan.local.(c|m)(js|ts)` — 常に最後に適用。`.gitignore` 対象を想定(APIキー等のローカル上書き用)。
4. `--config <path>` / `--overlay <path>`(複数指定可)— CLI から任意の設定ファイルを追加で重ねられる。

オブジェクトは深いマージ、配列(`sources` など)はデフォルトで置換。連結したい場合は `mergeArray(...)` ヘルパーで包む。

### 3.2 設定スキーマ(`.kiritan.*` のスコープ)

`.kiritan.(base|<mode>|local).(c|m)(js|ts)` で設定できる範囲は次の通り。これが `KiritanConfig` の全体像であり、これ以外の設定項目は無い。

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

(`ResourceSourceConfig` の `strategy`、`translate.middlewares` に渡すカスタムミドルウェア、`plugins` に渡すカスタム実装は、いずれも `.kiritan.*` ファイル内で `import` して直接渡す — 設定は「配線」に徹し、実装本体は普通の TS/JS モジュールとして書く)

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

![badge](...) <!-- 全ロケール共通、翻訳対象外 -->

:::kiritan{locale=en}
## Usage
This is the usage section.
:::

:::kiritan{locale=ja}
## 使い方
これは使い方セクションです。
:::

## License
Distributed under the WTFPL License. <!-- 共通セクションは directive の外に置くだけでよい -->
```

directive の外側は「共通コンテンツ」として全ロケール出力にそのままコピーされる。ドキュメントの一部だけ翻訳し、残りは共有する運用に対応する。

**ネスト(ブロック内でさらに `:::` を使いたい場合):** remark-directive 標準の挙動どおり、外側のコロンを増やせばよい(`::::kiritan{locale=en}` の中で `:::note` を使う、など)。kiritan 側で特別な処理は不要。

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
    siteName: { en: 'Kiritan', ja: 'きりたん' }, // ロケール別上書き
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

- `markdown`: remark + `remark-directive` による AST 解析。コードブロック・インラインコード・リンク URL・front matter(既定では非対象、`translateFrontmatter` で個別キーのみ対象化可)を保護し、`:::kiritan{...}` ディレクティブの分解もここで行う。
- `text`: 空行区切りの段落単位。`.txt` には Markdown 構文が無いため `:::kiritan{...}` は使えず、`inline`/`catalog` 戦略は非対応(`sidecar` のみ)とする。
- `mdx`: markdown 拡張。JSX 部分は非翻訳。`:::kiritan{...}` は markdown 同様に扱える。
- `plugins.renderers` でカスタムレンダラーを追加可能。
- レンダラーは自分が対応できる `strategy` の一覧を宣言する(例: `text` は `['sidecar']` のみ)。設定読み込み時に `SourceConfig.strategy` と実際のファイル種別(レンダラー)の組み合わせを検証し、非対応の組み合わせ(例: `.txt` に `inline`)は build 前に分かりやすいエラーで弾く。

### 6.1 言語切り替えリンクの自動挿入(`switcher`)

`[English](README.md) | [日本語](README.ja.md)` のような、バイリンガル README でよく見る言語切り替えリンクを build 時に自動生成する。翻訳とは性質が異なる機械的なリンク生成なので、`translate.auto`(既定 off)とは異なり**既定で有効**にする。

**挿入位置の指定**: remark-directive の leaf directive(内容を持たない `::name` 形式)として `::kiritan{switcher}` を base ファイルの好きな位置に書けば、そこに挿入される(4.2/4.3章のコンテナ directive と同じ `remark-directive` の仕組み)。

```md
# Kiritan

::kiritan{switcher}

kiritan の説明...
```

明示的なマーカーが無い場合、`switcher.enabled`(既定 `true`)なら `switcher.position`(既定 `'after-heading'`: 最初の見出しの直後、無ければ先頭)に自動挿入する。**マーカーが存在する場合は `enabled`/`position` の値に関わらず必ずそこが使われる**(明示指定が既定動作より優先)。

**生成される内容**: `locales.list` の各ロケールについて、そのロケール向け出力ファイルパス(3.3章の命名解決を再利用、`naming.outputs` のソース単位上書きも考慮)へのリンクを、現在ビルド中のロケールの出力ファイルからの相対パスで**自動計算**し、区切り文字(既定 `" | "`)で連結する。href を手動指定する手段は無い(手動でリンクを書きたい場合は、この機能を使わず自分で書けばよい)。現在のロケール自身はリンクにせず太字表示にする(`currentLocaleLink: true` でリンク化も可能)。

**言語名の表示ラベル**: kiritan は言語名一覧を自前で持たない(手作りのリストは抜け漏れが怖いため)。既定のラベルは標準の [`Intl.DisplayNames`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)(ECMA-402、Node.js に標準搭載、CLDR のデータに基づく)を使い、各ロケールの自称(autonym: そのロケール自身の言語でその言語を呼ぶ名前。例: `ja` なら "日本語"、`en` なら "English")を自動的に表示する。追加の依存もメンテすべき一覧も不要になる。

```ts
// 既定のラベル解決(labels で明示指定が無いロケールに対して行う)
new Intl.DisplayNames([locale], { type: "language" }).of(locale);
```

`switcher.labels` は、この既定を上書きしたい場合(呼び方を変えたい、`Intl.DisplayNames` が知らない独自のロケールコード、対応外のロケールを一覧から外したい、など)のためのオプトインの上書き手段として残す。

```ts
interface SwitcherConfig {
  enabled?: boolean; // 既定: true(マーカーが無い場合の自動挿入のみを制御。マーカーがあれば常に処理する)
  position?: 'top' | 'after-heading' | 'none'; // 既定: 'after-heading'
  separator?: string; // 既定: " | "
  /**
   * ロケール→表示ラベルの上書き。未指定のロケールは Intl.DisplayNames による
   * 自称(それでも解決できなければロケールコード自身)をラベルにする。
   * 値に `false` を指定すると、そのロケールを switcher から除外する
   * (例: まだ下書き段階のロケール、Intl.DisplayNames が対応していない
   * 独自のロケールコードを名指ししたい場合など)。
   */
  labels?: Record<string, string | false>;
  currentLocaleLink?: boolean; // 既定: false
  render?: (ctx: SwitcherRenderContext) => string; // 行全体のレンダリングを丸ごと差し替え
}

interface SwitcherLink {
  locale: string;
  label: string;
  href: string; // 相対パス。常に自動計算される
  isCurrent: boolean;
}

interface SwitcherRenderContext {
  locale: string; // ビルド中のロケール
  links: SwitcherLink[]; // locales.list の順(labels で false にされたロケールは含まれない)
}
```

```ts
switcher: {
  labels: { en: 'English', ja: '日本語', es: false }, // es は switcher に出さない
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
  text: string;         // 翻訳対象(base 側の原文)
  from: string;          // 例: "en"
  to: string;             // 例: "ja"
  source: SourceConfig;   // どのソースに対する翻訳か
  segmentId?: string;      // catalog戦略の場合のみ: :::kiritan{#<id>} の <id>
                            // (キャッシュのキーや用語集(glossary)引きに使う。sidecar/inlineでは省略)
}

// 単発形(最も単純。1件ずつ呼ばれる)
type TranslateMiddleware = (
  ctx: TranslateContext,
  next: () => Promise<string | null>
) => Promise<string | null>; // null を返す/next() を呼ばない = 次のミドルウェアに委譲

// バッチ形(複数件をまとめてAPI呼び出ししたい場合用。`batch: true` を付けて区別する)
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
    cacheMiddleware({ dir: '.kiritan/cache' }), // 既訳キャッシュがあればそれを返す
    googleTranslate({ apiKey: process.env.GOOGLE_API_KEY }), // 無ければ API を叩く
    postProcess((text) => text.trim()),                        // 結果を整形してから確定
  ],
}
```

- 既定は `middlewares: []`(＝ `manual` 相当)で、`translate.auto` が `true` でない限り自動翻訳は一切走らない。**この既定値(off)は今後の設計でも維持し、on/off の判断が必要な箇所が出るたびに都度確認する。**
- 呼び出し方(段落ごとに1回 or まとめてバッチ)はコアが決め打ちにせず、**ミドルウェア作成者が自由に実装できる**ようにする。そのため2つの形を許容する:
  - 単発形: `(ctx: TranslateContext, next) => Promise<string | null>` — 1件ずつ呼ばれる、最も単純な形。
  - バッチ形: `(ctxs: TranslateContext[]) => Promise<(string | null)[]>` — 1回の呼び出しで複数件まとめて処理したい場合用。コアはミドルウェアの形(関数のシグネチャ/フラグ)を見て、単発なら1件ずつ、バッチなら missing 分をまとめて渡す。
  - kiritan 自体は `google`/`deepl` 等の具体的な公式ミドルウェアを内蔵しない(依存を増やさない)。ドキュメント(`docs/`)にリファレンス実装例を載せる。
- 自動翻訳で埋まった箇所は必ず `machine: true` としてマーキングし(`catalog` はフィールド、`sidecar`/`inline` はコメントマーカー)、`kiritan check` でレビュー待ちとして検出できるようにする。
- ソース単位(`sources[i].translate`)でチェーン自体を丸ごと上書きできる。

> 将来的に、公式のリファレンス実装を `@kiritan/google-translate` `@kiritan/deepl` のような別パッケージとして切り出すことも検討する(13章参照)。

### 7.1 単発形とバッチ形の混在

`translate.middlewares` 配列には単発形とバッチ形を混在させてよい。パイプラインは配列を先頭から見て、連続する単発形を1つの「単発グループ」として自動的にまとめ、バッチ形はそれ単体で1つの「バッチグループ」として扱う。

```ts
middlewares: [
  cacheMiddleware(),      // 単発形 ┐
  localGlossary(),        // 単発形 ┘→ グループA(アイテムごとに ctx/next で連鎖)
  googleTranslateBatch(), // バッチ形   → グループB(その時点で missing な全アイテムをまとめて渡す)
  postProcess(),          // 単発形     → グループC(グループBで解決しなかった分だけに適用)
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
- ハッシュ関数は改ざん検知目的のみで暗号学的な強度は不要なため、xxhash 系の軽量非暗号ハッシュ(例: [`xxhash-wasm`](https://github.com/jungomi/xxhash-wasm))を依存として採用する。出力は16進文字列でハッシュコメント/カタログファイルに埋め込む。

## 9. ランタイム i18n(`@kiritan/runtime`)

i18next の定番である「`locales/{lang}.json` に全キーを集約する」形式は、ファイルが肥大化する・使われなくなったキーに気づけない・PRの差分が読みにくい・キーごとの全言語比較がしづらい、といった不満が根強い。kiritan はこれを唯一の前提にせず、ドキュメント側の `TranslationStore`(4章)と同じ考え方で**リソースの置き場所を戦略として選べる**ようにする。

### 9.1 リソース配置戦略(`ResourceSourceConfig`)

```ts
interface ResourceSourceConfig {
  glob: string;
  strategy: 'colocated' | 'split' | 'centralized' | 'embedded' | string; // string はカスタム戦略ID
  exportName?: string; // 'embedded' 戦略で読む named export 名。既定: "i18n"
  namespace?: (filePath: string) => string; // 既定はファイルパスから自動導出
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
    { glob: 'src/**/*.i18n.{js,ts}', strategy: 'colocated' }, // 既定の推奨形式
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
t('submit'); // 現在の locale に応じて解決
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

- アプリ内で直接 `createT(i18n)` するだけなら kiritan 側の関与は不要(9.2 と同じくただの TS オブジェクト)。
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
kiritan init                                     # .kiritan.base.mjs / README.base.md / .gitignore への追記(.kiritan.local.*)
kiritan build [--mode] [--config] [--locale]     # フルパイプライン実行(全 strategy 対象)
kiritan extract                                  # catalog 戦略のソースのみ対象。カタログを新規/差分更新
kiritan translate [--locale]                     # missing/stale を translate.middlewares で埋める(全 strategy 対象)
kiritan typegen                                  # runtime.sources の集約結果から .d.ts を生成(9.6章)
kiritan check                                    # CI 向け。missing/stale/未レビュー/i18n-key-mismatch で非ゼロ終了
```

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

| 種別 | インターフェース | 組み込み実装 |
| --- | --- | --- |
| 翻訳格納戦略 | `TranslationStore` | `sidecar` / `inline` / `catalog` |
| ランタイムリソース配置戦略 | `ResourceSourceConfig.strategy`(9.1章) | `colocated` / `split` / `centralized` / `embedded` |
| 翻訳ミドルウェア | `TranslateMiddleware` / `BatchTranslateMiddleware` | 組み込みなし(利用者が自由に実装。`docs/` に実装例を掲載) |
| ファイルレンダラー | `Renderer` | `markdown` / `mdx` / `text` |
| 言語切り替えリンクの描画 | `SwitcherConfig.render`(6.1章) | ラベル/区切り文字ベースの組み込みレンダリング |

翻訳格納戦略・レンダラーは `plugins.{stores,renderers}` に登録することで、翻訳ミドルウェアは `translate.middlewares` 配列にそのまま並べることで、任意の実装に差し替え・追加ができる。

## 12. 未決事項(実装しながら詰める)

現時点で無し。実装を進める中で出てきたものをここに追記する。

## 13. ロードマップ / 将来検討

- **翻訳ミドルウェアの公式パッケージ化**: Google 翻訳 / DeepL などの参考実装を `@kiritan/google-translate` `@kiritan/deepl` のような別パッケージとして `packages/*` に追加する。v1 では追加せず、ドキュメントに実装例を載せるだけに留める。
- **VS Code 拡張機能**: `@kiritan/vscode` として `packages/*` に追加する構想。`:::kiritan` ブロックのシンタックスハイライト・折りたたみ、`%{name}` 変数のハイライトや未定義検出、`:::kiritan{#<id>}` と catalog ファイル間のジャンプ、`missing`/`stale` セグメントのインライン表示などを想定。v1 のコア設計(特に4章のブロック記法・8章のステイル検知情報の持ち方)が、拡張機能から見て解析しやすい形になっているかを意識して詰める。
