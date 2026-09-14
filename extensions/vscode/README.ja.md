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

あわせて `*.kiritanconfig`(例: `.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig`)を独自言語として登録しており、実在する拡張子を持たないにもかかわらずJavaScript相当のシンタックスハイライトが効きます。副次効果として、どのアイコンテーマでもKiritan固有のファイルアイコンが表示されます — 見たことの無いファイル名に対する具体的なルールを持つテーマは存在しないためです(この命名を選んだ理由は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。

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
