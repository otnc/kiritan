<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (Vim/Neovim plugin)

</div>

:::kiritan{locale=en}
Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks and `%{name}` interpolation inside Markdown, plus filetype detection for `*.kiritanconfig` files (docs/DESIGN.md chapters 3.1/4.2/4.3/5).
:::
:::kiritan{locale=ja}
[Kiritan](https://www.npmjs.com/package/kiritan) の `:::kiritan{...}` / `::kiritan{...}` ディレクティブブロックと `%{name}` 補間のMarkdown内シンタックスハイライト、および `*.kiritanconfig` ファイルのfiletype判定(docs/DESIGN.md 3.1/4.2/4.3/5章)。
:::

:::kiritan{locale=en}
## Install
:::
:::kiritan{locale=ja}
## インストール
:::

:::kiritan{locale=en}
This plugin lives in a subdirectory of the main [`kiritan`](https://github.com/otnc/kiritan) repository, not its own — most plugin managers support that via an `rtp` option:
:::
:::kiritan{locale=ja}
この拡張機能は独立したリポジトリではなく、本体の [`kiritan`](https://github.com/otnc/kiritan) リポジトリのサブディレクトリとして存在します。多くのプラグインマネージャーは `rtp` オプションでこれに対応できます:
:::

```lua
-- lazy.nvim
{ "otnc/kiritan", rtp = "extensions/vim", ft = { "markdown", "javascript" } }
```

```vim
" vim-plug
Plug 'otnc/kiritan', { 'rtp': 'extensions/vim' }
```

:::kiritan{locale=en}
To pin to a specific release instead of tracking `main`, use the `kiritan-vim@<version>` tags (e.g. `tag = "kiritan-vim@0.1.0"` for lazy.nvim, `{ 'tag': 'kiritan-vim@0.1.0' }` for vim-plug) — there's no packaged artifact to install, just this repository's own git history.
:::
:::kiritan{locale=ja}
`main` を追従する代わりに特定バージョンにピン留めしたい場合は、`kiritan-vim@<version>` タグを使ってください(lazy.nvimなら `tag = "kiritan-vim@0.1.0"`、vim-plugなら `{ 'tag': 'kiritan-vim@0.1.0' }`)。パッケージ化された成果物は無く、このリポジトリ自身のgit履歴だけです。
:::

:::kiritan{locale=en}
## What it does
:::
:::kiritan{locale=ja}
## できること
:::

:::kiritan{locale=en}
- Highlights `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives (and their closing `:::`), `:::kiritan{#usage-intro}` catalog-strategy segment ids, `::kiritan{switcher}` leaf directives, and `%{name}` interpolation (and its `\%{name}` escaped form) inside Markdown — layered onto the built-in `markdown` syntax via `after/syntax/markdown.vim`, the Vimscript equivalent of the VS Code extension's TextMate grammar injection.
- Sets the `javascript` filetype for `*.kiritanconfig` files (`.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`, ...) via `ftdetect/`, so they get real syntax highlighting, indentation, and (if configured) LSP-based completion out of the box — these files have no real file extension of their own (docs/DESIGN.md chapter 3.1), so Vim/Neovim would otherwise treat them as plain text.

  This differs from the VS Code extension's approach on purpose: VS Code registers a distinct `kiritanconfig` language specifically to keep vscode-icons' language-keyed icon rule from overriding a custom file icon (see that extension's own README). Vim/Neovim's ecosystem doesn't force the same tradeoff — a devicons plugin's own per-filename overrides can add a custom icon without sacrificing the real `javascript` filetype, so this plugin just uses it directly.
- **Folding** for `:::kiritan{...}` blocks (`after/ftplugin/markdown.vim` sets `'foldexpr'`), matched by colon count the same way as the VS Code extension's folding provider — a kiritan block nested inside (or around) another directive still folds against the right fence.
- **Jump to a catalog entry**: put the cursor on a `:::kiritan{#<id>}` line and run `:KiritanJumpToCatalog` to open the sibling `<base>.<locale>.catalog.json` file(s) at that id's entry (via the quickfix list, if more than one locale matches). Nothing is mapped to a key by default — bind `<Plug>(kiritan-jump-to-catalog)` to whatever you'd like, e.g.:

  ```vim
  autocmd FileType markdown nmap <buffer> gd <Plug>(kiritan-jump-to-catalog)
  ```
:::
:::kiritan{locale=ja}
- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブ(と閉じの `:::`)、`:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid、`::kiritan{switcher}` leafディレクティブ、`%{name}` 補間(とそのエスケープ形式 `\%{name}`)をMarkdown内でハイライトします — `after/syntax/markdown.vim` を通じて組み込みの `markdown` 文法に重ねる形で、VS Code拡張機能のTextMate文法注入に相当する仕組みです。
- `*.kiritanconfig` ファイル(`.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig` 等)に `javascript` filetypeを設定します(`ftdetect/` 経由)。これにより本物のシンタックスハイライト・インデント・(設定されていれば)LSPによる補完がそのまま使えます — これらのファイルは実在する拡張子を持たないため(docs/DESIGN.md 3.1章)、何もしなければVim/Neovimはプレーンテキストとして扱ってしまいます。

  これはVS Code拡張機能とは意図的に異なるアプローチです: VS Codeはvscode-iconsの言語ベースのアイコンルールがカスタムアイコンを上書きしないよう、あえて独自言語`kiritanconfig`を登録しています(詳細はその拡張機能自身のREADMEを参照)。Vim/Neovimのエコシステムには同じトレードオフはありません — devicons系プラグイン自身のファイル名単位の上書き設定で、本物の`javascript` filetypeを維持したままカスタムアイコンを追加できるため、このプラグインではそのまま`javascript`を使っています。
- **折りたたみ**: `:::kiritan{...}` ブロックを折りたたみます(`after/ftplugin/markdown.vim` が `'foldexpr'` を設定)。VS Code拡張機能の折りたたみプロバイダーと同じくコロンの個数で対応させるため、他のディレクティブが内側・外側にネストしていても正しいフェンスで折りたたまれます。
- **catalogエントリへのジャンプ**: `:::kiritan{#<id>}` 行にカーソルを置いて `:KiritanJumpToCatalog` を実行すると、隣接する `<base>.<locale>.catalog.json` ファイルの該当エントリを開きます(複数ロケールが一致する場合はquickfixリスト経由)。既定では何のキーにも割り当てていません — `<Plug>(kiritan-jump-to-catalog)` を好きなキーにバインドしてください。例:

  ```vim
  autocmd FileType markdown nmap <buffer> gd <Plug>(kiritan-jump-to-catalog)
  ```
:::

:::kiritan{locale=en}
## What it doesn't do yet
:::
:::kiritan{locale=ja}
## まだできないこと
:::

:::kiritan{locale=en}
Undefined-`%{name}` detection and inline `missing`/`stale`/`machine` indicators — see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13 — aren't implemented here yet. Both need the project's *resolved* config, not just the open document's own text, the same as the VS Code extension's `diagnostics.cjs`; the most natural port would be a small Lua plugin wired through Neovim's own diagnostic/virtual-text APIs, shelling out to the workspace's own `kiritan check --json` the same way.
:::
:::kiritan{locale=ja}
未定義の`%{name}`検出と、`missing`/`stale`/`machine`のインライン表示 — [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照 — は、まだ実装されていません。どちらも開いているドキュメント自身のテキストだけでなくプロジェクトの*解決済み*設定が必要で、VS Code拡張機能の`diagnostics.cjs`と同様です。最も自然な移植方法は、ワークスペース自身の`kiritan check --json`を同じように呼び出し、Neovim自身の診断/virtual text APIに配線する小さなLuaプラグインでしょう。
:::

:::kiritan{locale=en}
## Testing locally
:::
:::kiritan{locale=ja}
## ローカルでのテスト
:::

:::kiritan{locale=en}
`extensions/vim/src/syntax.test.ts` and `autoload.test.ts` drive a real headless `vim -u NONE` process (queried via `synID()`/`synIDattr()`, and by calling the `autoload/kiritan.vim` functions directly) rather than just asserting against the `.vim` source — the same rigor the VS Code extension's grammar tests use with the real oniguruma/vscode-textmate engine. They're picked up automatically by the root `npm test`, and skip themselves (not a failure) if `vim` isn't on `PATH`.
:::
:::kiritan{locale=ja}
`extensions/vim/src/syntax.test.ts` と `autoload.test.ts` は、`.vim` ソースへの単純な文字列アサーションではなく、実際にヘッドレスの `vim -u NONE` プロセスを起動して(`synID()`/`synIDattr()` で問い合わせる、あるいは `autoload/kiritan.vim` の関数を直接呼び出す)検証します — VS Code拡張機能のグラマーテストが実際のoniguruma/vscode-textmateエンジンを使っているのと同じ厳密さです。ルートの `npm test` から自動的に拾われ、`vim` が `PATH` に無い場合は失敗ではなくスキップされます。
:::

:::kiritan{locale=en}
## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
