<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (Vim/Neovim plugin)

**English** | [日本語](README.ja.md)

</div>

Syntax highlighting, folding, and catalog jump for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks in Vim and Neovim alike, plus filetype detection for `*.kiritanconfig` files — and, on Neovim specifically, the same undefined-`%{name}`/`missing`/`stale`/`machine` diagnostics as the VS Code extension (docs/DESIGN.md chapters 3.1/4.2/4.3/5/13).

## Install

This plugin lives in a subdirectory of the main [`kiritan`](https://github.com/otnc/kiritan) repository, not its own — most plugin managers support that via an `rtp` option:

```lua
-- lazy.nvim
{ "otnc/kiritan", rtp = "extensions/vim", ft = { "markdown", "javascript" } }
```

```vim
" vim-plug
Plug 'otnc/kiritan', { 'rtp': 'extensions/vim' }
```

To pin to a specific release instead of tracking `main`, use the `kiritan-vim@<version>` tags (e.g. `tag = "kiritan-vim@0.1.0"` for lazy.nvim, `{ 'tag': 'kiritan-vim@0.1.0' }` for vim-plug) — there's no packaged artifact to install, just this repository's own git history.

## What it does

- Highlights `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives (and their closing `:::`), `:::kiritan{#usage-intro}` catalog-strategy segment ids, `::kiritan{switcher}` leaf directives, and `%{name}` interpolation (and its `\%{name}` escaped form) inside Markdown — layered onto the built-in `markdown` syntax via `after/syntax/markdown.vim`, the Vimscript equivalent of the VS Code extension's TextMate grammar injection.
- Sets the `javascript` filetype for `*.kiritanconfig` files (`.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`, ...) via `ftdetect/`, so they get real syntax highlighting, indentation, and (if configured) LSP-based completion out of the box — these files have no real file extension of their own (docs/DESIGN.md chapter 3.1), so Vim/Neovim would otherwise treat them as plain text.

  This differs from the VS Code extension's approach on purpose: VS Code registers a distinct `kiritanconfig` language specifically to keep vscode-icons' language-keyed icon rule from overriding a custom file icon (see that extension's own README). Vim/Neovim's ecosystem doesn't force the same tradeoff — a devicons plugin's own per-filename overrides can add a custom icon without sacrificing the real `javascript` filetype, so this plugin just uses it directly.
- **Folding** for `:::kiritan{...}` blocks (`after/ftplugin/markdown.vim` sets `'foldexpr'`), matched by colon count the same way as the VS Code extension's folding provider — a kiritan block nested inside (or around) another directive still folds against the right fence.
- **Jump to a catalog entry**: put the cursor on a `:::kiritan{#<id>}` line and run `:KiritanJumpToCatalog` to open the sibling `<base>.<locale>.catalog.json` file(s) at that id's entry (via the quickfix list, if more than one locale matches). Nothing is mapped to a key by default — bind `<Plug>(kiritan-jump-to-catalog)` to whatever you'd like, e.g.:

  ```vim
  autocmd FileType markdown nmap <buffer> gd <Plug>(kiritan-jump-to-catalog)
  ```
- **Undefined-`%{name}` warnings and inline `missing`/`stale`/`machine` indicators — Neovim only** (`nvim-0.10+`, `lua/kiritan/diagnostics.lua`, auto-loaded by `plugin/kiritan.lua`). Same approach as the VS Code extension: shells out to the workspace's own locally-installed `kiritan check --json` via `npx --no-install` and maps the results onto the open buffer as real `vim.diagnostic` entries, refreshed on save and (from the in-memory buffer text, without re-running the check) on edit. Plain Vim has no `vim.diagnostic`/`vim.system` equivalent to port this to, so it simply isn't loaded there at all — Vim's own runtime loader only globs `plugin/*.vim`, never `.lua`, so there's nothing to explicitly disable for Vim users.

## Testing locally

`extensions/vim/src/syntax.test.ts` and `autoload.test.ts` drive a real headless `vim -u NONE` process (queried via `synID()`/`synIDattr()`, and by calling the `autoload/kiritan.vim` functions directly) rather than just asserting against the `.vim` source — the same rigor the VS Code extension's grammar tests use with the real oniguruma/vscode-textmate engine. `diagnostics.test.ts` does the same for `lua/kiritan/diagnostics.lua` against a real headless `nvim --clean`. They're picked up automatically by the root `npm test`, and each skips itself (not a failure) if `vim`/`nvim` respectively isn't on `PATH`.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
