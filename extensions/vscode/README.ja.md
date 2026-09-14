<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# Kiritan (VS Code extension)

[English](README.md) | **日本語**

</div>

[Kiritan](https://www.npmjs.com/package/kiritan) の `:::kiritan{...}` / `::kiritan{...}` ディレクティブブロック — `inline`/`catalog` ドキュメント戦略、および言語切り替えマーカー(docs/DESIGN.md 4.2/4.3/6.1章)— のMarkdown内シンタックスハイライト。

## できること

ディレクティブのフェンスと属性を、周囲のMarkdownとは区別して色付けします:

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブと、閉じの `:::`。
- `:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid。
- `::kiritan{switcher}` leafディレクティブ。

コンパイル済みの拡張機能コードは無い、宣言的なTextMate文法の注入のみです。Markdownが元々持っている以上のアクティベーションコストはありません。

## まだできないこと

折りたたみ、`:::kiritan{#<id>}` ブロックとcatalogファイル間のジャンプ、`missing`/`stale` のインライン表示は、いずれも計画中ですがまだ実装されていません([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらには文法だけでなく、実際の拡張機能コード(folding range provider、definition provider)が必要です。

## vscode-icons でKiritanのファイルアイコンを使う

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

## ローカルでのビルド

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

生成された `.vsix` は、VS Codeの「VSIXからのインストール...」コマンドでインストールできます。あるいはこのディレクトリでF5を押すと、Extension Development Hostが起動し動作確認ができます。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
