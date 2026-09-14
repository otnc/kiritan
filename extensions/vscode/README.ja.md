<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (VS Code extension)

[English](README.md) | **日本語**

</div>

[Kiritan](https://www.npmjs.com/package/kiritan) の `:::kiritan{...}` / `::kiritan{...}` ディレクティブブロック — `inline`/`catalog` ドキュメント戦略、および言語切り替えマーカー(docs/DESIGN.md 4.2/4.3/6.1章)— のMarkdown内シンタックスハイライト。

## できること

ディレクティブのフェンスと属性を、周囲のMarkdownとは区別して色付けします:

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブと、閉じの `:::`。
- `:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid。
- `::kiritan{switcher}` leafディレクティブ。

このディレクティブハイライトはコンパイル済みの拡張機能コード無しの、宣言的なTextMate文法の注入のみです。Markdownが元々持っている以上のアクティベーションコストはありません。

あわせて `*.kiritanconfig`(例: `.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig`)を独自言語として登録しており、実在する拡張子を持たないにもかかわらずJavaScript相当のシンタックスハイライト・括弧の対応・コメントのトグルが効きます。副次効果として、どのアイコンテーマでもKiritan固有のファイルアイコンが表示されます — 見たことの無いファイル名に対する具体的なルールを持つテーマは存在しないためです(この命名を選んだ理由は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらのファイルの本物のコード補完(この拡張機能で唯一のコンパイル済みコードである `extension.cjs`)は、ファイルの内容をメモリ上の `javascript` ドキュメントに複製し、補完リクエストをVS Code組み込みのJavaScript/TypeScript言語サービスへ転送することで実現しています — ファイルに実際に `javascript` 言語IDを与えてしまうと、vscode-icons自身の言語ベースのルールがカスタムアイコンを上書きしてしまうため、アイコンとフルIntelliSenseを両立させるにはこの方式が必要でした。

## まだできないこと

折りたたみ、`:::kiritan{#<id>}` ブロックとcatalogファイル間のジャンプ、`missing`/`stale` のインライン表示は、いずれも計画中ですがまだ実装されていません([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらには文法だけでなく、実際の拡張機能コード(folding range provider、definition provider)が必要です。

## ローカルでのビルド

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

生成された `.vsix` は、VS Codeの「VSIXからのインストール...」コマンドでインストールできます。あるいはこのディレクトリでF5を押すと、Extension Development Hostが起動し動作確認ができます。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
