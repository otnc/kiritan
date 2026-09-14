// Pure logic for catalog-jump.cjs, kept dependency-free (no `require("vscode")`) so it can be unit-tested with plain vitest — the real `vscode` module only exists inside a running extension host.
const ID_LINE_RE = /^:{3,}kiritan\{[^}]*#([A-Za-z0-9_-]+)[^}]*\}\s*$/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the catalog id under `character` on `line`, or undefined if the line isn't a `:::kiritan{#<id>}` block or the position isn't over the id.
 * @param {string} line
 * @param {number} character
 */
function idAt(line, character) {
  const match = ID_LINE_RE.exec(line);
  if (!match) return undefined;

  const id = match[1];
  const idStart = line.indexOf(`#${id}`) + 1;
  const idEnd = idStart + id.length;
  if (character < idStart || character > idEnd) return undefined;
  return id;
}

/** A `.base.md`/`.md` source's "base" name is what catalog files key off. */
function baseNameFor(filename) {
  return filename.replace(/\.md$/, "").replace(/\.base$/, "");
}

/** The character offset of `id`'s key in a catalog file's raw text, or undefined. */
function findKeyOffset(catalogText, id) {
  const match = new RegExp(`"${escapeRegExp(id)}"\\s*:`).exec(catalogText);
  return match?.index;
}

module.exports = { idAt, baseNameFor, findKeyOffset, escapeRegExp };
