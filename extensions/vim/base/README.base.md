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
## What it does
:::
:::kiritan{locale=ja}
## できること
:::

:::kiritan{locale=en}
- Highlights `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives (and their closing `:::`), `:::kiritan{#usage-intro}` catalog-strategy segment ids, `::kiritan{switcher}` leaf directives, and `%{name}` interpolation (and its `\%{name}` escaped form) inside Markdown — layered onto the built-in `markdown` syntax via `after/syntax/markdown.vim`, the Vimscript equivalent of the VS Code extension's TextMate grammar injection.
- Sets the `javascript` filetype for `*.kiritanconfig` files (`.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`, ...) via `ftdetect/`, so they get real syntax highlighting, indentation, and (if configured) LSP-based completion out of the box — these files have no real file extension of their own (docs/DESIGN.md chapter 3.1), so Vim/Neovim would otherwise treat them as plain text.

  This differs from the VS Code extension's approach on purpose: VS Code registers a distinct `kiritanconfig` language specifically to keep vscode-icons' language-keyed icon rule from overriding a custom file icon (see that extension's own README). Vim/Neovim's ecosystem doesn't force the same tradeoff — a devicons plugin's own per-filename overrides can add a custom icon without sacrificing the real `javascript` filetype, so this plugin just uses it directly.
:::
:::kiritan{locale=ja}
- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` コンテナディレクティブ(と閉じの `:::`)、`:::kiritan{#usage-intro}` のようなcatalog戦略のセグメントid、`::kiritan{switcher}` leafディレクティブ、`%{name}` 補間(とそのエスケープ形式 `\%{name}`)をMarkdown内でハイライトします — `after/syntax/markdown.vim` を通じて組み込みの `markdown` 文法に重ねる形で、VS Code拡張機能のTextMate文法注入に相当する仕組みです。
- `*.kiritanconfig` ファイル(`.kiritanconfig`、`dev.kiritanconfig`、`local.kiritanconfig` 等)に `javascript` filetypeを設定します(`ftdetect/` 経由)。これにより本物のシンタックスハイライト・インデント・(設定されていれば)LSPによる補完がそのまま使えます — これらのファイルは実在する拡張子を持たないため(docs/DESIGN.md 3.1章)、何もしなければVim/Neovimはプレーンテキストとして扱ってしまいます。

  これはVS Code拡張機能とは意図的に異なるアプローチです: VS Codeはvscode-iconsの言語ベースのアイコンルールがカスタムアイコンを上書きしないよう、あえて独自言語`kiritanconfig`を登録しています(詳細はその拡張機能自身のREADMEを参照)。Vim/Neovimのエコシステムには同じトレードオフはありません — devicons系プラグイン自身のファイル名単位の上書き設定で、本物の`javascript` filetypeを維持したままカスタムアイコンを追加できるため、このプラグインではそのまま`javascript`を使っています。
:::

:::kiritan{locale=en}
## What it doesn't do yet
:::
:::kiritan{locale=ja}
## まだできないこと
:::

:::kiritan{locale=en}
Folding, jump-to-catalog-entry, undefined-`%{name}` detection, and inline `missing`/`stale`/`machine` indicators — everything the VS Code extension provides beyond highlighting and filetype detection (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — aren't implemented here yet. Folding is plain Vimscript away (Vim's own `foldexpr`/`foldmethod=expr`); the rest would most naturally be a small Lua plugin wired through Neovim's own diagnostic/virtual-text APIs, following the same "shell out to the workspace's own `kiritan check --json`" approach the VS Code extension uses.
:::
:::kiritan{locale=ja}
折りたたみ、catalogエントリへのジャンプ、未定義の`%{name}`検出、`missing`/`stale`/`machine`のインライン表示 — VS Code拡張機能がハイライトとfiletype判定以外に提供している機能([docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) 13章を参照)は、まだ実装されていません。折りたたみは素のVimscript(`foldexpr`/`foldmethod=expr`)で実現できる範囲です。それ以外は、VS Code拡張機能と同じ「ワークスペース自身の`kiritan check --json`を呼び出す」方式を、Neovim自身の診断/virtual text APIに配線する小さなLuaプラグインとして実装するのが最も自然でしょう。
:::

:::kiritan{locale=en}
## Testing locally
:::
:::kiritan{locale=ja}
## ローカルでのテスト
:::

:::kiritan{locale=en}
`extensions/vim/src/syntax.test.ts` drives a real headless `vim -u NONE` process (queried via `synID()`/`synIDattr()`) rather than just asserting against the `.vim` source — the same rigor the VS Code extension's grammar tests use with the real oniguruma/vscode-textmate engine. It's picked up automatically by the root `npm test`, and skips itself (not a failure) if `vim` isn't on `PATH`.
:::
:::kiritan{locale=ja}
`extensions/vim/src/syntax.test.ts` は、`.vim` ソースへの単純な文字列アサーションではなく、実際にヘッドレスの `vim -u NONE` プロセスを起動して(`synID()`/`synIDattr()` で問い合わせて)検証します — VS Code拡張機能のグラマーテストが実際のoniguruma/vscode-textmateエンジンを使っているのと同じ厳密さです。ルートの `npm test` から自動的に拾われ、`vim` が `PATH` に無い場合は失敗ではなくスキップされます。
:::

:::kiritan{locale=en}
## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
:::
:::kiritan{locale=ja}
## ライセンス

[WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE) の下で配布されています。
:::
