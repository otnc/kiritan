<div align=center>

![kiritan-logo](https://raw.githubusercontent.com/otnc/kiritan/main/assets/kiritan-logo.png)

# Kiritan (VS Code extension)

**English** | [日本語](README.ja.md)

</div>

Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks inside Markdown — the `inline`/`catalog` document strategies, and the language-switcher marker (docs/DESIGN.md chapters 4.2/4.3/6.1).

## What it does

Colors the directive fences and their attributes distinctly from surrounding Markdown:

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives, and their closing `:::`.
- `:::kiritan{#usage-intro}` catalog-strategy segment ids.
- `::kiritan{switcher}` leaf directive.
- `%{name}` interpolation placeholders, and their `\%{name}` escaped form.

This directive highlighting is a purely declarative TextMate grammar injection — no compiled extension code, no activation cost beyond what Markdown already has.

Beyond highlighting, it also provides, via real (if small) extension code:

- **Folding** for `:::kiritan{...}` blocks, correctly matched by colon count even when other directives are nested inside or around them.
- **Jump to definition** from a `:::kiritan{#<id>}` block to its entry in the sibling `<base>.<locale>.catalog.json` file(s), for the `catalog` document strategy.

It also registers `*.kiritanconfig` (e.g. `.kiritanconfig`, `dev.kiritanconfig`, `local.kiritanconfig`) as its own language, so these files get JavaScript-equivalent syntax highlighting, bracket matching, and comment toggling despite having no real file extension — and, as a side effect, a Kiritan-branded file icon in any icon theme, since no theme has a specific rule for a filename it's never heard of (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13 for why this file naming was chosen). Real code completion for these files works by mirroring the file's content into an in-memory `javascript` document and forwarding completion requests to VS Code's own built-in JavaScript/TypeScript language service — this is what makes the icon and full IntelliSense compatible, since giving the file the real `javascript` language id directly would let vscode-icons' own language-based rule override the custom icon.

## What it doesn't do yet

Undefined-`%{name}`-variable detection and inline `missing`/`stale` indicators are both still planned but not implemented (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — both need to know the project's resolved config (`interpolation.variables`, and the same hash-comparison `kiritan check` uses), not just the open document's own text.

## Building locally

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

Install the resulting `.vsix` via VS Code's "Install from VSIX..." command, or press F5 in this directory to launch an Extension Development Host for live testing.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
