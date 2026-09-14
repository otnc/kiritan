<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (Vim/Neovim plugin)

[English](README.md) | **日本語**

</div>

[Kiritan](https://www.npmjs.com/package/kiritan) の `:::kiritan{...}` / `::kiritan{...}` ディレクティブブロックと `%{name}` 補間のMarkdown内シンタックスハイライト、および `*.kiritanconfig` ファイルのfiletype判定(docs/DESIGN.md 3.1/4.2/4.3/5章)。

## インストール

この拡張機能は独立したリポジトリではなく、本体の [`kiritan`](https://github.com/otnc/kiritan) リポジトリのサブディレクトリとして存在します。多くのプラグインマネージャーは `rtp` オプションでこれに対応できます:

```lua
-- lazy.nvim
{ "otnc/kiritan", rtp = "extensions/vim", ft = { "markdown", "javascript" } }
```

```vim
" vim-plug
Plug 'otnc/kiritan', { 'rtp': 'extensions/vim' }
```

## できること

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブ(と閉じの `:::`)、`:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid、`::kiritan{switcher}` leafディレクティブ、`%{name}` 補間(とそのエスケープ形式 `\%{name}`)をMarkdown内でハイライトします — `after/syntax/markdown.vim` を通じて組み込みの `markdown` 文法に重ねる形で、VS Code拡張機能のTextMate文法注入に相当する仕組みです。
- `*.kiritanconfig` ファイル(`.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig` 等)に `javascript` filetypeを設定します(`ftdetect/` 経由)。これにより本物のシンタックスハイライト・インデント・(設定されていれば)LSPによる補完がそのまま使えます — これらのファイルは実在する拡張子を持たないため(docs/DESIGN.md 3.1章)、何もしなければVim/Neovimはプレーンテキストとして扱ってしまいます。

  これはVS Code拡張機能とは意図的に異なるアプローチです: VS Codeはvscode-iconsの言語ベースのアイコンルールがカスタムアイコンを上書きしないよう、あえて独自言語`kiritanconfig`を登録しています(詳細はその拡張機能自身のREADMEを参照)。Vim/Neovimのエコシステムには同じトレードオフはありません — devicons系プラグイン自身のファイル名単位の上書き設定で、本物の`javascript` filetypeを維持したままカスタムアイコンを追加できるため、このプラグインではそのまま`javascript`を使っています。

## まだできないこと

折りたたみ、catalogエントリへのジャンプ、未定義の`%{name}`検出、`missing`/`stale`/`machine`のインライン表示 — VS Code拡張機能がハイライトとfiletype判定以外に提供している機能([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)は、まだ実装されていません。折りたたみは素のVimscript(`foldexpr`/`foldmethod=expr`)で実現できる範囲です。それ以外は、VS Code拡張機能と同じ「ワークスペース自身の`kiritan check --json`を呼び出す」方式を、Neovim自身の診断/virtual text APIに配線する小さなLuaプラグインとして実装するのが最も自然でしょう。

## ローカルでのテスト

`extensions/vim/src/syntax.test.ts` は、`.vim` ソースへの単純な文字列アサーションではなく、実際にヘッドレスの `vim -u NONE` プロセスを起動して(`synID()`/`synIDattr()` で問い合わせて)検証します — VS Code拡張機能のグラマーテストが実際のoniguruma/vscode-textmateエンジンを使っているのと同じ厳密さです。ルートの `npm test` から自動的に拾われ、`vim` が `PATH` に無い場合は失敗ではなくスキップされます。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
