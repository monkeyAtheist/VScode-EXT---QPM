'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        workspaceFile: undefined,
        workspaceFolders: []
      },
      window: {
        showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){},
        createOutputChannel: () => ({ appendLine(){}, append(){}, show(){}, clear(){}, dispose(){} })
      },
      commands: { executeCommand: async () => undefined },
      languages: { createDiagnosticCollection: () => ({ clear(){}, set(){}, delete(){}, dispose(){} }) },
      EventEmitter: class { constructor(){ this.event = () => ({ dispose(){} }); } fire(){} dispose(){} },
      DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
      ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const model = require('../out/model/qtProjectManifest');
const { QpmBuildService } = require('../out/services/qpmBuildService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-0342-auto-deploy-'));
(async () => {
try {
  const manifestPath = path.join(root, 'Demo.qtproject.json');
  const manifest = model.createDefaultQtProjectManifest('Demo', 'widgets-application', ['Widgets']);
  model.setPersistedQtBuildMode(manifest, 'release64');
  model.writeQtProjectManifest(manifestPath, manifest);

  const ref = { name: 'Demo', absolutePath: manifestPath, exists: true };
  const outputLines = [];
  const workspaces = { activeProjectRef: ref };
  const projectSettings = {
    getBuildOrder: () => [ref],
    getSettings: () => ({ preBuildActions: [], customBuildActions: [], postBuildActions: [] }),
    runActions: async () => true
  };
  const output = { appendLine: (line='') => outputLines.push(line), append(){}, show(){}, clear(){}, dispose(){} };
  const build = new QpmBuildService({}, workspaces, {}, projectSettings, {}, output);
  build.beginOutput = () => {};
  build.finishBuild = () => {};
  build.buildOneProject = async () => true;
  let deployCalls = 0;
  build.deployNativeQtAfterSuccessfulBuild = async () => { deployCalls += 1; return true; };

  assert.strictEqual(await build.build(false, ref), true);
  assert.strictEqual(deployCalls, 1, 'successful native Qt build must enter the centralized automatic-deployment stage');

  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmBuildService.ts'), 'utf8');
  assert(source.includes('recreates dist/ when it'));
  assert(source.includes('has been deleted between builds'));
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  assert(settingsSource.includes('Automatic deployment build profile'));
  assert(settingsSource.includes('deployBuildProfileId'));

  console.log('QPM 0.34.2 centralized automatic deployment tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
})().catch((error) => { console.error(error); process.exitCode = 1; });
