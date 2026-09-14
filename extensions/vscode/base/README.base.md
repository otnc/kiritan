<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

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

This is a purely declarative TextMate grammar injection — no compiled extension code, no activation cost beyond what Markdown already has.
:::
:::kiritan{locale=ja}
- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブと、閉じの `:::`。
- `:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid。
- `::kiritan{switcher}` leafディレクティブ。

コンパイル済みの拡張機能コードは無い、宣言的なTextMate文法の注入のみです。Markdownが元々持っている以上のアクティベーションコストはありません。
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
## Getting a Kiritan file icon in vscode-icons
:::
:::kiritan{locale=ja}
## vscode-icons でKiritanのファイルアイコンを使う
:::

:::kiritan{locale=en}
VS Code only has one active file icon theme at a time, and that theme's own extension rules always win over anything an extension can contribute passively — so this extension can't make `.kiritan.mjs` files show a Kiritan icon while [vscode-icons](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons) is active; vscode-icons already has a specific rule for `*.mjs`, and specific rules always beat a language-contributed fallback icon. The fix has to be a custom association on the vscode-icons side:

1. Create a folder named exactly `vsicons-custom-icons` somewhere, and copy this extension's icon into it as `file_type_kiritan.png` (the icon lives at [`images/icon.png`](./images/icon.png) in this extension's installed folder, or at [`assets/kiritan.png`](https://github.com/otnc/kiritan/blob/main/assets/kiritan.png) in the repo).
2. In your settings (user or workspace):

```jsonc
"vsicons.customIconFolderPath": "/path/to/the/folder/containing/vsicons-custom-icons",
"vsicons.associations.files": [
  { "icon": "kiritan", "extensions": ["kiritan.mjs", "kiritan.base.mjs", "kiritan.local.mjs"], "format": "png" }
]
```

3. Run `Apply Icons Customization` from the command palette (`F1`).

This covers the base/local config files; a `.kiritan.<mode>.mjs` mode file needs its own entry in the `extensions` array (e.g. `"kiritan.dev.mjs"`) since the mode name isn't fixed.
:::
:::kiritan{locale=ja}
VS Codeは同時に1つのファイルアイコンテーマしか有効にできず、そのテーマ自身が持つ拡張子ルールは、拡張機能側が受動的に提供できるものより常に優先されます。そのため、[vscode-icons](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons) が有効な状態でこの拡張機能が `.kiritan.mjs` にKiritanアイコンを表示させることはできません — vscode-icons は既に `*.mjs` 用の具体的なルールを持っており、具体的なルールは言語コントリビューションによるフォールバックアイコンに常に勝つためです。解決するにはvscode-icons側でカスタム割り当てを行う必要があります:

1. `vsicons-custom-icons` という名前のフォルダをどこかに作成し、この拡張機能のアイコンを `file_type_kiritan.png` としてコピーします(アイコンはインストール済みのこの拡張機能のフォルダ内の [`images/icon.png`](./images/icon.png)、またはリポジトリの [`assets/kiritan.png`](https://github.com/otnc/kiritan/blob/main/assets/kiritan.png) にあります)。
2. 設定(ユーザー設定またはワークスペース設定)に以下を追加します:

```jsonc
"vsicons.customIconFolderPath": "/path/to/the/folder/containing/vsicons-custom-icons",
"vsicons.associations.files": [
  { "icon": "kiritan", "extensions": ["kiritan.mjs", "kiritan.base.mjs", "kiritan.local.mjs"], "format": "png" }
]
```

3. コマンドパレット(`F1`)から `Apply Icons Customization` を実行します。

これでbase/local設定ファイルはカバーされます。`.kiritan.<mode>.mjs` のようなmodeファイルは、mode名が固定ではないため `extensions` 配列に個別に追加してください(例: `"kiritan.dev.mjs"`)。
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
