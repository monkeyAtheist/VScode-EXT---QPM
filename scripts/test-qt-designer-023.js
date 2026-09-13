'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
  fs.chmodSync(filePath, 0o755);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qt-designer-'));
const settings = { qtDesignerPath: '' };
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (key, fallback) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback,
          update: async (key, value) => { settings[key] = value; }
        })
      },
      ConfigurationTarget: { Global: 1, Workspace: 2 },
      window: {},
      Uri: { file: (fsPath) => ({ fsPath }) }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const service = require('../out/services/qpmQtInstallationService');
  const qtBase = path.join(root, 'Qt');
  const qtRoot = path.join(qtBase, '6.11.0', 'mingw_64');

  const directDesigner = path.join(qtRoot, 'bin', process.platform === 'win32' ? 'designer.exe' : 'designer');
  touch(directDesigner);
  let launcher = service.discoverQtDesignerLauncher(qtRoot, '');
  assert(launcher, 'Designer must be detected in the selected Qt kit');
  assert.strictEqual(path.resolve(launcher.path), path.resolve(directDesigner));
  assert.strictEqual(launcher.kind, 'designer');
  assert.strictEqual(launcher.source, 'qt-kit');

  fs.rmSync(directDesigner, { force: true });
  const creator = path.join(qtBase, 'Tools', 'QtCreator', 'bin', process.platform === 'win32' ? 'qtcreator.exe' : 'qtcreator');
  touch(creator);
  launcher = service.discoverQtDesignerLauncher(qtRoot, '');
  assert(launcher, 'Qt Creator must be used as a fallback when standalone Designer is unavailable');
  assert.strictEqual(path.resolve(launcher.path), path.resolve(creator));
  assert.strictEqual(launcher.kind, 'qtcreator');
  assert.strictEqual(launcher.source, 'qt-tools');

  const configuredDesigner = path.join(root, 'Custom', process.platform === 'win32' ? 'designer.exe' : 'designer');
  touch(configuredDesigner);
  launcher = service.discoverQtDesignerLauncher(qtRoot, configuredDesigner);
  assert(launcher, 'Configured Designer override must be accepted');
  assert.strictEqual(path.resolve(launcher.path), path.resolve(configuredDesigner));
  assert.strictEqual(launcher.source, 'configured');

  const treeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'providers', 'qpmTreeProvider.ts'), 'utf8');
  assert(treeSource.includes("extension === '.ui'"), 'Qt workspace tree must recognize .ui files');
  assert(treeSource.includes("command: 'qpm.openQtDesigner'"), 'Clicking a .ui file in the QPM tree must launch QPM Designer integration');

  const projectSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtProjectService.ts'), 'utf8');
  assert(projectSource.includes('selectDesignerExecutable'), 'Designer launch must provide a manual selection fallback');
  assert(projectSource.includes('activeTabResourcePath'), 'Designer launch must resolve .ui files from custom editor tabs');
  assert(projectSource.includes('QT_QPA_PLATFORM_PLUGIN_PATH'), 'Designer launch must receive the selected Qt plugin path');

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '0.33.0');
  assert(pkg.contributes.commands.some((entry) => entry.command === 'qpm.selectQtDesigner'));
  assert(pkg.contributes.menus['explorer/context'].some((entry) => entry.submenu === 'qpm.explorerRoot' && /\.ui/.test(entry.when)));
  assert(pkg.contributes.menus['qpm.explorerRoot'].some((entry) => entry.command === 'qpm.openQtDesigner' && /\.ui/.test(entry.when)));
  assert(pkg.contributes.menus['editor/title'].some((entry) => entry.command === 'qpm.openQtDesigner' && /\.ui/.test(entry.when)));
  assert(pkg.contributes.configuration.properties['qpm.qtDesignerPath']);

  console.log('QPM 0.2.4 Qt Widgets Designer integration tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
