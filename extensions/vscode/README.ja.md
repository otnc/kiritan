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
- `%{name}` 補間プレースホルダーと、そのエスケープ形式 `\%{name}`。

このディレクティブハイライトはコンパイル済みの拡張機能コード無しの、宣言的なTextMate文法の注入のみです。Markdownが元々持っている以上のアクティベーションコストはありません。

ハイライトに加えて、小規模ながら実際の拡張機能コードで以下も提供しています:

- **折りたたみ**: `:::kiritan{...}` ブロックを、他のディレクティブが内側・外側にネストしていても、コロンの個数で正しく対応させて折りたたみます。
- **定義へのジャンプ**: `catalog` ドキュメント戦略において、`:::kiritan{#<id>}` ブロックから、隣接する `<base>.<locale>.catalog.json` ファイル内の該当エントリへジャンプします。
- **未定義の`%{name}`警告**と\*\*`missing`/`stale`/`machine`のインライン表示\*\*: ワークスペース自身にローカルインストールされた`kiritan check --json`を(`npx --no-install`経由で)実行し、その結果を開いているドキュメントに対応付けます。`kiritan`に依存しないプロジェクトでは意図せぬインストールが走らないよう、単に何もしません。コードフェンス内やインラインコードスパン内の`%{name}`は`interpolation.skipCodeBlocks`の既定動作に合わせて検出対象外です。この機能は既定の`%{`/`}`区切り文字にのみ対応しており、`interpolation.delimiters`をカスタマイズしているプロジェクトでは未定義変数の警告は出ません(他の機能はそのまま使えます)。

あわせて `*.kiritanconfig`(例: `.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig`)を独自言語として登録しており、実在する拡張子を持たないにもかかわらずJavaScript相当のシンタックスハイライト・括弧の対応・コメントのトグルが効きます。副次効果として、どのアイコンテーマでもKiritan固有のファイルアイコンが表示されます — 見たことの無いファイル名に対する具体的なルールを持つテーマは存在しないためです(この命名を選んだ理由は [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)。これらのファイルの本物のコード補完は、ファイルの内容をメモリ上の `javascript` ドキュメントに複製し、補完リクエストをVS Code組み込みのJavaScript/TypeScript言語サービスへ転送することで実現しています — ファイルに実際に `javascript` 言語IDを与えてしまうと、vscode-icons自身の言語ベースのルールがカスタムアイコンを上書きしてしまうため、アイコンとフルIntelliSenseを両立させるにはこの方式が必要でした。

## ローカルでのビルド

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

生成された `.vsix` は、VS Codeの「VSIXからのインストール...」コマンドでインストールできます。あるいはこのディレクトリでF5を押すと、Extension Development Hostが起動し動作確認ができます。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
