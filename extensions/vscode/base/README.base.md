<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (VS Code extension)

</div>

:::kiritan{locale=en}
Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks inside Markdown — the `inline`/`catalog` document strategies, and the language-switcher marker (docs/DESIGN.md chapters 4.2/4.3/6.1).
:::
:::kiritan{locale=ja}
[Kiritan](https://www.npmjs.com/package/kiritan) の `:::kiritan{...}` / `::kiritan{...}` ディレクティブブロック — `inline`/`catalog` ドキュメント戦略、および言語切り替えマーカー(docs/DESIGN.md 4.2/4.3/6.1章)— のMarkdown内シンタックスハイライト。
:::

:::kiritan{locale=en}
## What it does
:::
:::kiritan{locale=ja}
## できること
:::

:::kiritan{locale=en}
Colors the directive fences and their attributes distinctly from surrounding Markdown:
:::
:::kiritan{locale=ja}
ディレクティブのフェンスと属性を、周囲のMarkdownとは区別して色付けします:
:::

:::kiritan{locale=en}
- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives, and their closing `:::`.
- `:::kiritan{#usage-intro}` catalog-strategy segment ids.
- `::kiritan{switcher}` leaf directive.

This directive highlighting is a purely declarative TextMate grammar injection — no compiled extension code, no activation cost beyond what Markdown already has.

It also registers `*.kiritanconfig` (e.g. `.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`) as its own language, so these files get JavaScript-equivalent syntax highlighting, bracket matching, and comment toggling despite having no real file extension — and, as a side effect, a Kiritan-branded file icon in any icon theme, since no theme has a specific rule for a filename it's never heard of (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13 for why this file naming was chosen). Real code completion for these files (`extension.cjs`, this extension's only compiled code) works by mirroring the file's content into an in-memory `javascript` document and forwarding completion requests to VS Code's own built-in JavaScript/TypeScript language service — this is what makes the icon and full IntelliSense compatible, since giving the file the real `javascript` language id directly would let vscode-icons' own language-based rule override the custom icon.
:::
:::kiritan{locale=ja}
- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブと、閉じの `:::`。
- `:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid。
- `::kiritan{switcher}` leafディレクティブ。

このディレクティブハイライトはコンパイル済みの拡張機能コード無しの、宣言的なTextMate文法の注入のみです。Markdownが元々持っている以上のアクティベーションコストはありません。

あわせて `*.kiritanconfig`(例: `.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig`)を独自言語として登録しており、実在する拡張子を持たないにもかかわらずJavaScript相当のシンタックスハイライト・括弧の対応・コメントのトグルが効きます。副次効果として、どのアイコンテーマでもKiritan固有のファイルアイコンが表示されます — 見たことの無いファイル名に対する具体的なルールを持つテーマは存在しないためです(この命名を選んだ理由は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらのファイルの本物のコード補完(この拡張機能で唯一のコンパイル済みコードである `extension.cjs`)は、ファイルの内容をメモリ上の `javascript` ドキュメントに複製し、補完リクエストをVS Code組み込みのJavaScript/TypeScript言語サービスへ転送することで実現しています — ファイルに実際に `javascript` 言語IDを与えてしまうと、vscode-icons自身の言語ベースのルールがカスタムアイコンを上書きしてしまうため、アイコンとフルIntelliSenseを両立させるにはこの方式が必要でした。
:::

:::kiritan{locale=en}
## What it doesn't do yet
:::
:::kiritan{locale=ja}
## まだできないこと
:::

:::kiritan{locale=en}
Folding, jumping between a `:::kiritan{#<id>}` block and its catalog file, and inline `missing`/`stale` indicators are all planned but not implemented (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — those need real extension code (a folding range provider, a definition provider), not just a grammar.
:::
:::kiritan{locale=ja}
折りたたみ、`:::kiritan{#<id>}` ブロックとcatalogファイル間のジャンプ、`missing`/`stale` のインライン表示は、いずれも計画中ですがまだ実装されていません([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらには文法だけでなく、実際の拡張機能コード(folding range provider、definition provider)が必要です。
:::

:::kiritan{locale=en}
## Building locally
:::
:::kiritan{locale=ja}
## ローカルでのビルド
:::

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

:::kiritan{locale=en}
Install the resulting `.vsix` via VS Code's "Install from VSIX..." command, or press F5 in this directory to launch an Extension Development Host for live testing.
:::
:::kiritan{locale=ja}
生成された `.vsix` は、VS Codeの「VSIXからのインストール...」コマンドでインストールできます。あるいはこのディレクトリでF5を押すと、Extension Development Hostが起動し動作確認ができます。
:::

:::kiritan{locale=en}
## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
