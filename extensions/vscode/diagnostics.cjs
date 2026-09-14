// Undefined-%{name}-variable detection and inline missing/stale/machine display (docs/DESIGN.md chapter 13's remaining two items). Both need the project's *resolved* config, not just the open document's own text — this runs the workspace's own locally-installed `kiritan check --json` as a child process (the same approach ESLint/Prettier's editor integrations use for their own local installs) rather than requiring kiritan's internals in-process, so a broken or version-mismatched project install can't crash the extension host. `npx --no-install` is used specifically so a project that doesn't depend on kiritan at all gets silently skipped instead of a surprise network install.
const vscode = require("vscode");
const path = require("node:path");
const { exec } = require("node:child_process");
const { promisify } = require("node:util");
const {
  findUndefinedVariables,
  mapCheckIssuesToPositions,
} = require("./diagnostics-core.cjs");

const execAsync = promisify(exec);

/** @type {Map<string, { issues: object[], interpolationVariableNames: string[], delimiters: [string, string] }>} workspace folder path -> its last successful `kiritan check --json` */
const checkResultByWorkspace = new Map();

/** @param {vscode.WorkspaceFolder} folder */
async function runCheck(folder) {
  try {
    const { stdout } = await execAsync(
      "npx --no-install kiritan check --json",
      {
        cwd: folder.uri.fsPath,
        timeout: 15000,
      }
    );
    const parsed = JSON.parse(stdout);
    checkResultByWorkspace.set(folder.uri.fsPath, parsed);
  } catch {
    // No local kiritan install, no *.kiritanconfig, a real check failure, or invalid JSON — any of these just means "nothing to report" here rather than a hard error; `kiritan check` itself (CLI/CI) is the source of truth for real failures.
  }
}

function severityFor(kind) {
  if (kind === "missing" || kind === "stale") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

/** @param {vscode.TextDocument} document */
function refreshDiagnostics(document, diagnosticCollection) {
  if (document.languageId !== "markdown") return;

  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const cached = checkResultByWorkspace.get(folder.uri.fsPath);
  const lines = [];
  for (let i = 0; i < document.lineCount; i++) {
    lines.push(document.lineAt(i).text);
  }

  const diagnostics = [];

  if (cached) {
    const sourcePath = path
      .relative(folder.uri.fsPath, document.uri.fsPath)
      .split(path.sep)
      .join("/");
    for (const { line, startChar, endChar, issue } of mapCheckIssuesToPositions(
      lines,
      cached.issues,
      sourcePath
    )) {
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(line, startChar, line, endChar),
          `[${issue.locale}] ${issue.detail}`,
          severityFor(issue.kind)
        )
      );
    }

    for (const { line, startChar, endChar, name } of findUndefinedVariables(
      lines,
      cached.interpolationVariableNames,
      cached.delimiters
    )) {
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(line, startChar, line, endChar),
          `%{${name}} is not declared in interpolation.variables`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

function registerDiagnostics(context) {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("kiritan");
  context.subscriptions.push(diagnosticCollection);

  /** @type {NodeJS.Timeout | undefined} */
  let debounceTimer;

  async function refreshFromDisk(document) {
    if (document.languageId !== "markdown") return;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return;
    await runCheck(folder);
    refreshDiagnostics(document, diagnosticCollection);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refreshFromDisk),
    vscode.workspace.onDidSaveTextDocument(refreshFromDisk),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "markdown") return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshDiagnostics(event.document, diagnosticCollection);
      }, 300);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
    })
  );

  for (const document of vscode.workspace.textDocuments) {
    void refreshFromDisk(document);
  }
}

module.exports = { registerDiagnostics };
