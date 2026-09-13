# Kiritan (VS Code extension)

**English** | [日本語](README.ja.md)

Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks inside Markdown — the `inline`/`catalog` document strategies, and the language-switcher marker (docs/DESIGN.md chapters 4.2/4.3/6.1).

## What it does

Colors the directive fences and their attributes distinctly from surrounding Markdown:

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives, and their closing `:::`.
- `:::kiritan{#usage-intro}` catalog-strategy segment ids.
- `::kiritan{switcher}` leaf directive.

This is a purely declarative TextMate grammar injection — no compiled extension code, no activation cost beyond what Markdown already has.

## What it doesn't do yet

Folding, jumping between a `:::kiritan{#<id>}` block and its catalog file, and inline `missing`/`stale` indicators are all planned but not implemented (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — those need real extension code (a folding range provider, a definition provider), not just a grammar.

## Building locally

```sh
npm install
npm run package   # packages/vscode/*.vsix
```

Install the resulting `.vsix` via VS Code's "Install from VSIX..." command, or press F5 in this directory to launch an Extension Development Host for live testing.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
