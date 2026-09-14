<div align=center>

![kiritan-logo](../../assets/kiritan-logo.png)

# Kiritan (VS Code extension)

**English** | [日本語](README.ja.md)

</div>

Syntax highlighting for [Kiritan](https://www.npmjs.com/package/kiritan)'s `:::kiritan{...}` / `::kiritan{...}` directive blocks inside Markdown — the `inline`/`catalog` document strategies, and the language-switcher marker (docs/DESIGN.md chapters 4.2/4.3/6.1).

## What it does

Colors the directive fences and their attributes distinctly from surrounding Markdown:

- `:::kiritan{locale=en}` / `:::kiritan{locale=ja}` container directives, and their closing `:::`.
- `:::kiritan{#usage-intro}` catalog-strategy segment ids.
- `::kiritan{switcher}` leaf directive.

This is a purely declarative TextMate grammar injection — no compiled extension code, no activation cost beyond what Markdown already has.

## What it doesn't do yet

Folding, jumping between a `:::kiritan{#<id>}` block and its catalog file, and inline `missing`/`stale` indicators are all planned but not implemented (see [docs/DESIGN.md](https://github.com/otnc/kiritan/blob/main/docs/DESIGN.md) chapter 13) — those need real extension code (a folding range provider, a definition provider), not just a grammar.

## Getting a Kiritan file icon in vscode-icons

VS Code only has one active file icon theme at a time, and that theme's own extension rules always win over anything an extension can contribute passively — so this extension can't make `.kiritan.mjs` files show a Kiritan icon while [vscode-icons](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons) is active; vscode-icons already has a specific rule for `*.mjs`, and specific rules always beat a language-contributed fallback icon. The fix has to be a custom association on the vscode-icons side:

1. Create a folder named exactly `vsicons-custom-icons` somewhere, and copy this extension's icon into it as `file_type_kiritan.png` (the icon lives at [`images/icon.png`](./images/icon.png) in this extension's installed folder, or at [`assets/kiritan.png`](https://github.com/otnc/kiritan/blob/main/assets/kiritan.png) in the repo).
2. In your settings (user or workspace):

```jsonc
"vsicons.customIconFolderPath": "/path/to/the/folder/containing/vsicons-custom-icons",
"vsicons.associations.files": [
  { "icon": "kiritan", "extensions": ["kiritan.mjs", "kiritan.base.mjs", "kiritan.local.mjs"], "format": "png" }
]
```

3. Run `Apply Icons Customization` from the command palette (`F1`).

This covers the base/local config files; a `.kiritan.<mode>.mjs` mode file needs its own entry in the `extensions` array (e.g. `"kiritan.dev.mjs"`) since the mode name isn't fixed.

## Building locally

```sh
npm install
npm run package   # extensions/vscode/*.vsix
```

Install the resulting `.vsix` via VS Code's "Install from VSIX..." command, or press F5 in this directory to launch an Extension Development Host for live testing.

## License

Distributed under the [WTFPL License](https://github.com/otnc/kiritan/blob/main/LICENSE).
