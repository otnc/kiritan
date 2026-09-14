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

`main` を追従する代わりに特定バージョンにピン留めしたい場合は、`kiritan-vim@<version>` タグを使ってください(lazy.nvimなら `tag = "kiritan-vim@0.1.0"`、vim-plugなら `{ 'tag': 'kiritan-vim@0.1.0' }`)。パッケージ化された成果物は無く、このリポジトリ自身のgit履歴だけです。

## できること

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブ(と閉じの `:::`)、`:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid、`::kiritan{switcher}` leafディレクティブ、`%{name}` 補間(とそのエスケープ形式 `\%{name}`)をMarkdown内でハイライトします — `after/syntax/markdown.vim` を通じて組み込みの `markdown` 文法に重ねる形で、VS Code拡張機能のTextMate文法注入に相当する仕組みです。
- `*.kiritanconfig` ファイル(`.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig` 等)に `javascript` filetypeを設定します(`ftdetect/` 経由)。これにより本物のシンタックスハイライト・インデント・(設定されていれば)LSPによる補完がそのまま使えます — これらのファイルは実在する拡張子を持たないため(docs/DESIGN.md 3.1章)、何もしなければVim/Neovimはプレーンテキストとして扱ってしまいます。

  これはVS Code拡張機能とは意図的に異なるアプローチです: VS Codeはvscode-iconsの言語ベースのアイコンルールがカスタムアイコンを上書きしないよう、あえて独自言語`kiritanconfig`を登録しています(詳細はその拡張機能自身のREADMEを参照)。Vim/Neovimのエコシステムには同じトレードオフはありません — devicons系プラグイン自身のファイル名単位の上書き設定で、本物の`javascript` filetypeを維持したままカスタムアイコンを追加できるため、このプラグインではそのまま`javascript`を使っています。
- **折りたたみ**: `:::kiritan{...}` ブロックを折りたたみます(`after/ftplugin/markdown.vim` が `'foldexpr'` を設定)。VS Code拡張機能の折りたたみプロバイダーと同じくコロンの個数で対応させるため、他のディレクティブが内側・外側にネストしていても正しいフェンスで折りたたまれます。
- **catalogエントリへのジャンプ**: `:::kiritan{#<id>}` 行にカーソルを置いて `:KiritanJumpToCatalog` を実行すると、隣接する `<base>.<locale>.catalog.json` ファイルの該当エントリを開きます(複数ロケールが一致する場合はquickfixリスト経由)。既定では何のキーにも割り当てていません — `<Plug>(kiritan-jump-to-catalog)` を好きなキーにバインドしてください。例:

  ```vim
  autocmd FileType markdown nmap <buffer> gd <Plug>(kiritan-jump-to-catalog)
  ```

## まだできないこと

未定義の`%{name}`検出と、`missing`/`stale`/`machine`のインライン表示 — [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照 — は、まだ実装されていません。どちらも開いているドキュメント自身のテキストだけでなくプロジェクトの*解決済み*設定が必要で、VS Code拡張機能の`diagnostics.cjs`と同様です。最も自然な移植方法は、ワークスペース自身の`kiritan check --json`を同じように呼び出し、Neovim自身の診断/virtual text APIに配線する小さなLuaプラグインでしょう。

## ローカルでのテスト

`extensions/vim/src/syntax.test.ts` と `autoload.test.ts` は、`.vim` ソースへの単純な文字列アサーションではなく、実際にヘッドレスの `vim -u NONE` プロセスを起動して(`synID()`/`synIDattr()` で問い合わせる、あるいは `autoload/kiritan.vim` の関数を直接呼び出す)検証します — VS Code拡張機能のグラマーテストが実際のoniguruma/vscode-textmateエンジンを使っているのと同じ厳密さです。ルートの `npm test` から自動的に拾われ、`vim` が `PATH` に無い場合は失敗ではなくスキップされます。

## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
