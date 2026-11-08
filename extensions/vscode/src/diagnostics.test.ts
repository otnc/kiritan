import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const diagnosticsUrl = new URL("../diagnostics.cjs", import.meta.url);
const require = createRequire(diagnosticsUrl);
type Uri = { fsPath: string };
type Document = {
  uri: Uri;
  languageId: string;
  lineCount: number;
  lineAt: (line: number) => { text: string };
};

const createHarness = () => {
  const root = path.resolve("diagnostics-workspace");
  const otherRoot = path.resolve("other-workspace");
  const folders = [root, otherRoot].map((fsPath) => ({ uri: { fsPath } }));
  const documents: Document[] = [];
  const handlers: Record<string, (value: unknown) => unknown> = {};
  const pending: ((result: { stdout: string }) => void)[] = [];
  const execute = vi.fn(
    () => new Promise<{ stdout: string }>((resolve) => pending.push(resolve))
  );
  const subscribe =
    (name: string) => (handler: (value: unknown) => unknown) => {
      handlers[name] = handler;
      return { dispose: () => delete handlers[name] };
    };
  const watcher = {
    onDidChange: subscribe("configChanged"),
    onDidCreate: subscribe("configCreated"),
    onDidDelete: subscribe("configDeleted"),
    dispose: vi.fn(),
  };
  const diagnostics = new Map<string, { message: string }[]>();
  const collection = {
    set: (uri: Uri, entries: { message: string }[]) =>
      diagnostics.set(uri.fsPath, entries),
    delete: (uri: Uri) => diagnostics.delete(uri.fsPath),
    dispose: vi.fn(),
  };
  const createFileSystemWatcher = vi.fn(() => watcher);
  const vscode = {
    workspace: {
      textDocuments: documents,
      createFileSystemWatcher,
      getWorkspaceFolder: (uri: Uri) =>
        folders.find(
          (folder) =>
            uri.fsPath === folder.uri.fsPath ||
            uri.fsPath.startsWith(folder.uri.fsPath + path.sep)
        ),
      onDidOpenTextDocument: subscribe("opened"),
      onDidSaveTextDocument: subscribe("saved"),
      onDidChangeTextDocument: subscribe("edited"),
      onDidCloseTextDocument: subscribe("closed"),
    },
    languages: { createDiagnosticCollection: () => collection },
    Range: class {},
    Diagnostic: class {
      constructor(
        public range: unknown,
        public message: string,
        public severity: number
      ) {}
    },
    DiagnosticSeverity: { Warning: 1, Information: 2 },
  };
  const module = {
    exports: {} as {
      registerDiagnostics: (context: {
        subscriptions: { dispose: () => void }[];
      }) => void;
    },
  };
  runInNewContext(readFileSync(diagnosticsUrl, "utf8"), {
    module,
    require: (id: string) => {
      if (id === "vscode") return vscode;
      if (id === "node:child_process") return { exec: vi.fn() };
      if (id === "node:util") return { promisify: () => execute };
      return require(id);
    },
    setTimeout,
    clearTimeout,
  });
  const context = { subscriptions: [] as { dispose: () => void }[] };
  module.exports.registerDiagnostics(context);

  const addDocument = (name: string, content: string, directory = root) => {
    const lines = content.split("\n");
    const document = {
      uri: { fsPath: path.join(directory, name) },
      languageId: "markdown",
      lineCount: lines.length,
      lineAt: (line: number) => ({ text: lines[line] }),
    };
    documents.push(document);
    return document;
  };
  const finishCheck = (names: string[], index = 0) => {
    const [resolve] = pending.splice(index, 1);
    resolve({
      stdout: JSON.stringify({
        issues: [],
        interpolationVariableNames: names,
        delimiters: ["%{", "}"],
      }),
    });
  };
  return {
    root,
    otherRoot,
    addDocument,
    finishCheck,
    emit: (event: string, value: unknown) => handlers[event](value),
    messages: (document: Document) =>
      diagnostics.get(document.uri.fsPath)?.map(({ message }) => message),
    execute,
    watcher,
    createFileSystemWatcher,
    context,
  };
};

describe("config-driven diagnostics refresh", () => {
  it.each(["configChanged", "configCreated", "configDeleted"])(
    "rechecks all open Markdown documents after %s",
    async (event) => {
      const host = createHarness();
      const first = host.addDocument("README.base.md", "## %{heading}");
      const second = host.addDocument("CONTRIBUTING.base.md", "# %{heading}");
      const initial = host.emit("opened", first);
      host.finishCheck([]);
      await initial;
      expect(host.messages(first)).toHaveLength(1);
      expect(host.messages(second)).toHaveLength(1);

      const refresh = host.emit(event, {
        fsPath: path.join(host.root, ".kiritanconfig"),
      });
      host.finishCheck(["heading"]);
      await refresh;

      expect(host.messages(first)).toEqual([]);
      expect(host.messages(second)).toEqual([]);
      expect(host.createFileSystemWatcher).toHaveBeenCalledWith(
        "**/*kiritanconfig"
      );
      expect(host.context.subscriptions).toContain(host.watcher);
    }
  );

  it("refreshes only the workspace whose config changed", async () => {
    const host = createHarness();
    const first = host.addDocument("README.base.md", "%{heading}");
    const other = host.addDocument(
      "README.base.md",
      "%{heading}",
      host.otherRoot
    );
    for (const document of [first, other]) {
      const initial = host.emit("opened", document);
      host.finishCheck([]);
      await initial;
    }
    const refresh = host.emit("configChanged", {
      fsPath: path.join(host.root, "local.kiritanconfig"),
    });
    host.finishCheck(["heading"]);
    await refresh;
    expect(host.messages(first)).toEqual([]);
    expect(host.messages(other)).toHaveLength(1);
    expect(host.execute.mock.calls).toHaveLength(3);
  });

  it("ignores nested configs that are not in the workspace-root cascade", async () => {
    const host = createHarness();
    await host.emit("configChanged", {
      fsPath: path.join(host.root, "nested", ".kiritanconfig"),
    });
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("does not restore stale results when an older check finishes last", async () => {
    const host = createHarness();
    const document = host.addDocument("README.base.md", "%{heading}");
    const initial = host.emit("opened", document);
    const refresh = host.emit("configChanged", {
      fsPath: path.join(host.root, ".kiritanconfig"),
    });
    host.finishCheck(["heading"], 1);
    await refresh;
    host.finishCheck([]);
    await initial;
    expect(host.messages(document)).toEqual([]);
  });
});
