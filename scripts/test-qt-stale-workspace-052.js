'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.34.2');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-stale-workspace-'));
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
    getWorkspaceFolder: () => undefined,
    updateWorkspaceFolders: () => true,
    onDidSaveTextDocument: () => ({ dispose() {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose() {} })
  },
  window: {
    showWarningMessage: async () => undefined,
    showErrorMessage: () => undefined
  },
  Uri: { file: (fsPath) => ({ fsPath }) },
  extensions: { getExtension: () => undefined },
  commands: { executeCommand: async () => undefined },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  EventEmitter: EventEmitterMock
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
try {
  const association = require(path.join(root, 'out', 'utils', 'qpmWorkspaceAssociation.js'));
  const { QpmCppToolsService } = require(path.join(root, 'out', 'services', 'qpmCppToolsService.js'));
  const { QpmWorkspaceService } = require(path.join(root, 'out', 'services', 'qpmWorkspaceService.js'));

  const projectRoot = path.join(temp, 'DeletedProject');
  const workspacePath = path.join(temp, 'Qt_Workspace.cws');
  const manifestPath = path.join(projectRoot, 'DeletedProject.qtproject.json');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(workspacePath, '[Workspace Header]\n', 'utf8');
  association.writeQpmWorkspaceAssociation(projectRoot, workspacePath, manifestPath);
  const staleManifest = association.inspectQpmWorkspaceAssociation(projectRoot, true);
  assert.strictEqual(staleManifest.valid, false);
  assert.strictEqual(staleManifest.stale, true);
  assert.strictEqual(fs.existsSync(path.join(projectRoot, '.vscode', 'qpm-workspace.json')), false, 'a marker whose project manifest was deleted must be removed');

  fs.writeFileSync(manifestPath, '{}\n', 'utf8');
  association.writeQpmWorkspaceAssociation(projectRoot, workspacePath, manifestPath);
  fs.unlinkSync(workspacePath);
  const staleWorkspace = association.inspectQpmWorkspaceAssociation(projectRoot, true);
  assert.strictEqual(staleWorkspace.valid, false);
  assert.strictEqual(staleWorkspace.stale, true);
  assert.strictEqual(fs.existsSync(path.join(projectRoot, '.vscode', 'qpm-workspace.json')), false, 'a marker whose workspace was deleted must be removed');

  const outputLines = [];
  const output = { appendLine: (line) => outputLines.push(line) };
  const service = new QpmCppToolsService({}, {}, {}, output);

  const broadRoot = path.join(temp, 'ParentFolder');
  const broadConfig = path.join(broadRoot, '.vscode', 'c_cpp_properties.json');
  fs.mkdirSync(path.dirname(broadConfig), { recursive: true });
  fs.writeFileSync(broadConfig, JSON.stringify({
    version: 4,
    enableConfigurationSquiggles: true,
    configurations: [{ name: 'Qt Project Manager (managed)', includePath: [] }]
  }, null, 2), 'utf8');
  workspaceFolders.splice(0, workspaceFolders.length, { uri: { fsPath: broadRoot } });
  assert.strictEqual(service.cleanupOrphanedWorkspaceArtifacts(undefined), 1);
  assert.strictEqual(fs.existsSync(broadConfig), false, 'a QPM-only stale c_cpp_properties.json must be deleted instead of being rewritten with configurations: []');
  assert.strictEqual(fs.existsSync(path.dirname(broadConfig)), false, 'an empty parent .vscode directory must be removed');

  fs.mkdirSync(path.dirname(broadConfig), { recursive: true });
  fs.writeFileSync(broadConfig, JSON.stringify({
    version: 4,
    configurations: [
      { name: 'Qt Project Manager (managed)', includePath: [] },
      { name: 'User configuration', includePath: ['${workspaceFolder}/include'] }
    ]
  }, null, 2), 'utf8');
  assert.strictEqual(service.cleanupOrphanedWorkspaceArtifacts(undefined), 1);
  const preserved = JSON.parse(fs.readFileSync(broadConfig, 'utf8'));
  assert.deepStrictEqual(preserved.configurations.map((entry) => entry.name), ['User configuration']);

  fs.writeFileSync(broadConfig, JSON.stringify({ version: 4, configurations: [] }, null, 2), 'utf8');
  assert.strictEqual(service.cleanupOrphanedWorkspaceArtifacts(undefined), 1);
  assert.strictEqual(fs.existsSync(broadConfig), false, 'an already-empty cpptools file from an older QPM cleanup must be deleted at activation');


  workspaceFolders.splice(0, workspaceFolders.length);
  const missingLastWorkspace = path.join(temp, 'Removed', 'Qt_Workspace.cws');
  let persistedLastWorkspace = missingLastWorkspace;
  const workspaceStateUpdates = [];
  const context = {
    workspaceState: {
      get: () => persistedLastWorkspace,
      update: async (_key, value) => {
        persistedLastWorkspace = value;
        workspaceStateUpdates.push(value);
      }
    }
  };
  const workspaceOutput = { appendLine: (line) => outputLines.push(line) };
  const workspaceService = new QpmWorkspaceService(context, {}, {}, {}, {}, {}, workspaceOutput);
  await workspaceService.restoreOrAutoLoad();
  assert.strictEqual(workspaceService.currentWorkspace, undefined);
  assert.deepStrictEqual(workspaceStateUpdates, [undefined], 'a deleted last-used workspace must be removed from persistent state');
  assert(outputLines.some((line) => line.includes('Starting with the blank Qt Project Manager page.')));

  const workspaceSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmWorkspaceService.ts'), 'utf8');
  assert(workspaceSource.includes("workspaceState.update(LAST_WORKSPACE_KEY, undefined)"), 'a deleted last workspace must be forgotten');
  assert(workspaceSource.includes('Starting with the blank Qt Project Manager page.'), 'missing projects must fall back to the blank QPM page');
  assert(workspaceSource.includes("findFilesAtLimitedDepth(folder.uri.fsPath, '.cws', 0)"), 'automatic discovery must inspect only the exact opened folder');
  assert(!workspaceSource.includes("findFilesAtLimitedDepth(folder.uri.fsPath, '.cws', 3)"), 'QPM must no longer recursively reopen historical projects from a broad parent folder');
  assert(workspaceSource.includes('workspace.projects.some((project) => project.exists)'), 'a saved .cws that only references deleted projects must not be restored');

  const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert(extensionSource.includes('cleanupOrphanedWorkspaceArtifacts(workspaces.currentWorkspace)'), 'startup must clean stale parent IntelliSense artifacts before synchronization');

  console.log('QPM 0.5.2 stale workspace, association and IntelliSense cleanup tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
