'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-last-workspace-'));
const workspaceFolders = [];

class EventEmitterMock {
  constructor() {
    this.event = () => ({ dispose() {} });
  }
  fire() {}
  dispose() {}
}

const vscodeMock = {
  workspace: {
    workspaceFolders,
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    onDidSaveTextDocument: () => ({ dispose() {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} })
  },
  window: {
    showWarningMessage: async () => undefined,
    showErrorMessage: () => undefined
  },
  Uri: { file: (fsPath) => ({ fsPath }) },
  EventEmitter: EventEmitterMock
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

function createMemento(initial = {}) {
  const values = new Map(Object.entries(initial));
  const updates = [];
  return {
    values,
    updates,
    api: {
      get: (key) => values.get(key),
      update: async (key, value) => {
        if (value === undefined) values.delete(key);
        else values.set(key, value);
        updates.push([key, value]);
      }
    }
  };
}

function workspaceObject(filePath) {
  return {
    path: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    projects: [],
    activeProjectIndex: 0
  };
}

(async () => {
  try {
    const association = require(path.join(root, 'out', 'utils', 'qpmWorkspaceAssociation.js'));
    const { QpmWorkspaceService } = require(path.join(root, 'out', 'services', 'qpmWorkspaceService.js'));

    const quickWorkspace = path.join(temp, 'QtQuick', 'QtQuickWorkspace.cws');
    const testWorkspace = path.join(temp, 'Test', 'TestWorkspace.cws');
    const testProjectRoot = path.join(temp, 'Test', 'TestProject');
    const testManifest = path.join(testProjectRoot, 'TestProject.qtproject.json');
    fs.mkdirSync(path.dirname(quickWorkspace), { recursive: true });
    fs.mkdirSync(testProjectRoot, { recursive: true });
    fs.writeFileSync(quickWorkspace, '[Workspace Header]\n', 'utf8');
    fs.writeFileSync(testWorkspace, '[Workspace Header]\n', 'utf8');
    fs.writeFileSync(testManifest, '{}\n', 'utf8');
    association.writeQpmWorkspaceAssociation(testProjectRoot, testWorkspace, testManifest);
    workspaceFolders.push({ uri: { fsPath: testProjectRoot } });

    const parser = {
      parseWorkspace: (filePath) => workspaceObject(path.resolve(filePath)),
      inspectWorkspaceCompatibility: () => []
    };
    const outputLines = [];
    const output = { appendLine: (line) => outputLines.push(line) };

    const local = createMemento({ 'qpm.lastWorkspace': quickWorkspace });
    const global = createMemento({ 'qpm.lastWorkspace.global': testWorkspace });
    const context = { workspaceState: local.api, globalState: global.api };

    const firstLaunch = new QpmWorkspaceService(context, parser, {}, {}, {}, {}, output);
    await firstLaunch.restoreOrAutoLoad();
    assert.strictEqual(firstLaunch.currentWorkspace.path, path.resolve(quickWorkspace), 'the window-local last workspace must win over an older project-folder association');
    assert.strictEqual(global.values.get('qpm.lastWorkspace.global'), path.resolve(quickWorkspace), 'restoring a workspace must refresh the global fallback');

    const secondLaunch = new QpmWorkspaceService(context, parser, {}, {}, {}, {}, output);
    await secondLaunch.restoreOrAutoLoad();
    assert.strictEqual(secondLaunch.currentWorkspace.path, path.resolve(quickWorkspace), 'the same last active workspace must be restored after a simulated VS Code relaunch');

    workspaceFolders.splice(0, workspaceFolders.length);
    const emptyWindowLocal = createMemento();
    const emptyWindowGlobal = createMemento({ 'qpm.lastWorkspace.global': quickWorkspace });
    const emptyWindowContext = { workspaceState: emptyWindowLocal.api, globalState: emptyWindowGlobal.api };
    const emptyWindowLaunch = new QpmWorkspaceService(emptyWindowContext, parser, {}, {}, {}, {}, output);
    await emptyWindowLaunch.restoreOrAutoLoad();
    assert.strictEqual(emptyWindowLaunch.currentWorkspace.path, path.resolve(quickWorkspace), 'an empty VS Code window must fall back to the globally last active QPM workspace');
    assert.strictEqual(emptyWindowLocal.values.get('qpm.lastWorkspace'), path.resolve(quickWorkspace), 'the global fallback must repopulate the window-local persistence key');

    const source = fs.readFileSync(path.join(root, 'src', 'services', 'qpmWorkspaceService.ts'), 'utf8');
    const localIndex = source.indexOf('const windowWorkspace = this.context.workspaceState.get');
    const associationIndex = source.indexOf('const associatedWorkspace = this.findAssociatedWorkspaceFromOpenFolders()');
    assert(localIndex >= 0 && associationIndex > localIndex, 'window-local persistence must be evaluated before folder associations');
    assert(source.includes("const GLOBAL_LAST_WORKSPACE_KEY = 'qpm.lastWorkspace.global';"), 'a global fallback key must cover empty and untitled VS Code windows');
    assert(source.includes('await this.context.globalState?.update(GLOBAL_LAST_WORKSPACE_KEY, resolved);'), 'loading a workspace must persist the globally last active path');
    assert(source.includes('await this.autoLoad(true);'), 'startup fallback discovery must not retry an already evaluated folder association');

    console.log('QPM 0.13.2 last active workspace persistence tests: PASS');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
