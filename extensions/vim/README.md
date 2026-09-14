<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (Vim/Neovim plugin)

**English** | [日本語](README.ja.md)

</div>

Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks and `%{name}` interpolation inside Markdown, plus filetype detection for `*.kiritanconfig` files (docs/DESIGN.md chapters 3.1/4.2/4.3/5).

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

## What it does

- Highlights `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives (and their closing `:::`), `:::kiritan{#usage-intro}` catalog-strategy segment ids, `::kiritan{switcher}` leaf directives, and `%{name}` interpolation (and its `\%{name}` escaped form) inside Markdown — layered onto the built-in `markdown` syntax via `after/syntax/markdown.vim`, the Vimscript equivalent of the VS Code extension's TextMate grammar injection.
- Sets the `javascript` filetype for `*.kiritanconfig` files (`.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`, ...) via `ftdetect/`, so they get real syntax highlighting, indentation, and (if configured) LSP-based completion out of the box — these files have no real file extension of their own (docs/DESIGN.md chapter 3.1), so Vim/Neovim would otherwise treat them as plain text.

  This differs from the VS Code extension's approach on purpose: VS Code registers a distinct `kiritanconfig` language specifically to keep vscode-icons' language-keyed icon rule from overriding a custom file icon (see that extension's own README). Vim/Neovim's ecosystem doesn't force the same tradeoff — a devicons plugin's own per-filename overrides can add a custom icon without sacrificing the real `javascript` filetype, so this plugin just uses it directly.

## What it doesn't do yet

Folding, jump-to-catalog-entry, undefined-`%{name}` detection, and inline `missing`/`stale`/`machine` indicators — everything the VS Code extension provides beyond highlighting and filetype detection (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — aren't implemented here yet. Folding is plain Vimscript away (Vim's own `foldexpr`/`foldmethod=expr`); the rest would most naturally be a small Lua plugin wired through Neovim's own diagnostic/virtual-text APIs, following the same "shell out to the workspace's own `kiritan check --json`" approach the VS Code extension uses.

## Testing locally

`extensions/vim/src/syntax.test.ts` drives a real headless `vim -u NONE` process (queried via `synID()`/`synIDattr()`) rather than just asserting against the `.vim` source — the same rigor the VS Code extension's grammar tests use with the real oniguruma/vscode-textmate engine. It's picked up automatically by the root `npm test`, and skips itself (not a failure) if `vim` isn't on `PATH`.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
