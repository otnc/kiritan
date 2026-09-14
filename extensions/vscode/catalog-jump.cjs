// Jump from a :::kiritan{#<id>} block to its catalog entry (docs/DESIGN.md chapter 4.3): translations for the "catalog" document strategy live in a sibling <base>.<locale>.catalog.json, keyed by id.
const vscode = require("vscode");
const path = require("node:path");
const { idAt, baseNameFor, findKeyOffset } = require("./catalog-jump-core.cjs");

/**
 * @param {vscode.TextDocument} document
 * @param {string} id
 */
async function findCatalogLocations(document, id) {
  const dir = path.dirname(document.uri.fsPath);
  const base = baseNameFor(path.basename(document.uri.fsPath));
  const pattern = new vscode.RelativePattern(dir, `${base}.*.catalog.json`);
  const files = await vscode.workspace.findFiles(pattern, null, 50);

  const locations = [];
  for (const file of files) {
    const catalogDoc = await vscode.workspace.openTextDocument(file);
    const offset = findKeyOffset(catalogDoc.getText(), id);
    if (offset === undefined) continue;
    locations.push(new vscode.Location(file, catalogDoc.positionAt(offset)));
  }
  return locations;
}

function createDefinitionProvider() {
  return {
    async provideDefinition(document, position) {
      const id = idAt(document.lineAt(position.line).text, position.character);
      if (!id) return undefined;
      return findCatalogLocations(document, id);
    },
  };
}

module.exports = { createDefinitionProvider };
