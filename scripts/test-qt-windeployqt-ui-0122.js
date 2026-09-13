'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-deploy-0122-'));
const originalLoad = Module._load;
class EventEmitter { constructor(){ this.event = () => ({ dispose(){} }); } fire(){} dispose(){} }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    EventEmitter,
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), openTextDocument: async () => ({}) },
    window: {
      createOutputChannel: () => ({ appendLine(){}, append(){}, show(){}, clear(){}, dispose(){} }),
      showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){}, showTextDocument: async () => undefined
    },
    commands: { executeCommand: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const api = require('../out/services/qpmBuildService.js');
  const releaseBinary = path.join(root, 'release.exe');
  const debugBinary = path.join(root, 'debug.exe');
  const unknownBinary = path.join(root, 'unknown.exe');
  fs.writeFileSync(releaseBinary, Buffer.from('MZ\0Qt6Core.dll\0Qt6Gui.dll\0', 'latin1'));
  fs.writeFileSync(debugBinary, Buffer.from('MZ\0Qt6Cored.dll\0Qt6Guid.dll\0', 'latin1'));
  fs.writeFileSync(unknownBinary, Buffer.from('MZ\0kernel32.dll\0', 'latin1'));
  assert.strictEqual(api.detectQtRuntimeVariantFromBinary(releaseBinary, 6), 'release');
  assert.strictEqual(api.detectQtRuntimeVariantFromBinary(debugBinary, 6), 'debug');
  assert.strictEqual(api.detectQtRuntimeVariantFromBinary(unknownBinary, 6), undefined);

  const qtRoot = path.join(root, 'Qt', '6.11.0', 'mingw_64');
  const binDir = path.join(qtRoot, 'bin');
  const toolchainBin = path.join(root, 'Qt', 'Tools', 'mingw1310_64', 'bin');
  const pluginsDir = path.join(qtRoot, 'plugins');
  const qmlDir = path.join(qtRoot, 'qml');
  const platformsDir = path.join(pluginsDir, 'platforms');
  fs.mkdirSync(platformsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(toolchainBin, { recursive: true });
  fs.mkdirSync(qmlDir, { recursive: true });
  const releasePlugin = path.join(platformsDir, 'qwindows.dll');
  const debugPlugin = path.join(platformsDir, 'qwindowsd.dll');
  fs.writeFileSync(releasePlugin, 'release');
  fs.writeFileSync(debugPlugin, 'debug');

  const installation = {
    root: qtRoot,
    binDir,
    pluginsDir,
    qmlDir,
    toolchain: { binDir: toolchainBin }
  };
  const env = api.createQtDeploymentEnvironment(installation, { PATH: path.join(root, 'system-bin') });
  const entries = env.PATH.split(path.delimiter);
  assert.strictEqual(entries[0], binDir, 'Qt bin directory must be first in deployment PATH');
  assert.strictEqual(entries[1], toolchainBin, 'Qt compiler runtime directory must follow Qt bin');
  assert.strictEqual(env.QTDIR, qtRoot);
  assert.strictEqual(env.QT_PLUGIN_PATH, pluginsDir);
  assert.strictEqual(env.QT_QPA_PLATFORM_PLUGIN_PATH, platformsDir);
  assert.strictEqual(env.QML_IMPORT_PATH, qmlDir);
  assert.strictEqual(api.resolveQtWindowsPlatformPlugin(installation, 'release'), releasePlugin);
  assert.strictEqual(api.resolveQtWindowsPlatformPlugin(installation, 'debug'), debugPlugin);

  const buildSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmBuildService.ts'), 'utf8');
  assert(buildSource.includes("args.push('--qtpaths', installation.qtPathsPath)"), 'windeployqt must receive the selected kit qtpaths executable');
  assert(buildSource.includes("args.push('--dir', deployDirectory)"), 'windeployqt must deploy into the clean standalone directory');
  assert(buildSource.includes('detectQtRuntimeVariantFromBinary(buildTargetPath'), 'deployment variant must be detected from the linked Qt runtime');
  assert(buildSource.includes('createQtDeploymentEnvironment(installation)'), 'windeployqt must run in the selected Qt kit environment');
  assert(buildSource.includes('qtDeploymentDirectory'), 'deployment must use the dedicated standalone directory');
  assert(buildSource.includes("args.push('--compiler-runtime')"), 'compiler runtime deployment must be configurable');

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  for (const token of ['--qpm-sticky-offset', 'settingsStickyHeader', 'ResizeObserver', 'updateStickyOffsets']) {
    assert(settingsSource.includes(token), `missing dynamic sticky-header token: ${token}`);
  }

  console.log('QPM 0.12.2 windeployqt runtime selection and sticky settings header: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
