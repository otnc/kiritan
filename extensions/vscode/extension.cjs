// *.kiritanconfig is registered as its own VS Code language (see package.json)
// so that no icon theme mistakes it for a generic JavaScript file — but that
// means the built-in TypeScript/JavaScript language service, which powers
// real completion, never looks at it (it only activates for the "javascript"
// language id). This bridges the gap: for every *.kiritanconfig document we
// keep an in-memory, read-only "javascript" mirror behind a custom URI scheme
// and forward completion requests to VS Code's own built-in provider for it.
//
// The mirror is a TextDocumentContentProvider document, not an untitled one —
// an untitled document is a real editable buffer that VS Code counts as
// "unsaved" (cluttering the UI and save-all/exit prompts) even though nothing
// ever edits it directly; a content-provider document is virtual/read-only
// and never shows up that way.
const vscode = require("vscode");

const MIRROR_SCHEME = "kiritanconfig-mirror";

/** @type {Map<string, string>} mirror URI string -> its current content */
const mirrorContent = new Map();
const mirrorChanged = new vscode.EventEmitter();

const mirrorContentProvider = {
  onDidChange: mirrorChanged.event,
  provideTextDocumentContent(uri) {
    return mirrorContent.get(uri.toString()) ?? "";
  },
};

/** @param {vscode.TextDocument} document */
function mirrorUriFor(document) {
  // The .js suffix is what makes VS Code assign the "javascript" language to
  // this virtual document — language detection works the same way regardless
  // of URI scheme.
  return vscode.Uri.parse(`${MIRROR_SCHEME}:${document.uri.path}.js`);
}

/** @param {vscode.TextDocument} document */
async function getMirrorDocument(document) {
  const mirrorUri = mirrorUriFor(document);
  const key = mirrorUri.toString();
  const text = document.getText();

  if (mirrorContent.get(key) !== text) {
    const isFirstOpen = !mirrorContent.has(key);
    mirrorContent.set(key, text);
    if (!isFirstOpen) mirrorChanged.fire(mirrorUri);
  }

  return vscode.workspace.openTextDocument(mirrorUri);
}

function activate(context) {
  const provider = {
    async provideCompletionItems(document, position, _token, ctx) {
      const mirror = await getMirrorDocument(document);
      return vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        mirror.uri,
        position,
        ctx.triggerCharacter
      );
    },
  };

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      MIRROR_SCHEME,
      mirrorContentProvider
    ),
    vscode.languages.registerCompletionItemProvider(
      "kiritanconfig",
      provider,
      ".",
      '"',
      "'",
      "`",
      "/",
      "@"
    ),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      mirrorContent.delete(mirrorUriFor(doc).toString());
    })
  );
}

function deactivate() {
  mirrorContent.clear();
}

module.exports = { activate, deactivate };
