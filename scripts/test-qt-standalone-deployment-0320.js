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
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
      window: { createOutputChannel: () => ({ appendLine(){}, append(){}, show(){}, clear(){}, dispose(){} }), showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){} },
      EventEmitter: class { constructor(){ this.event = () => ({ dispose(){} }); } fire(){} dispose(){} }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const model = require('../out/model/qtProjectManifest');
const linkage = require('../out/services/qpmQtLinkage');

function touch(filePath, content='') { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-0320-'));
try {
  const manifestPath = path.join(root, 'Demo.qtproject.json');
  const manifest = model.createDefaultQtProjectManifest('Demo', 'widgets-application', ['Widgets']);
  model.writeQtProjectManifest(manifestPath, manifest);
  const loaded = model.readQtProjectManifest(manifestPath);
  const deploy = model.getActiveQtDeployProfile(loaded);
  const release = model.getActiveQtBuildProfile(loaded, 'release64');

  assert.strictEqual(deploy.enabled, true);
  assert.strictEqual(deploy.outputDirectory, 'dist');
  assert.strictEqual(deploy.cleanOutput, true);
  assert.strictEqual(deploy.compilerRuntime, true);
  assert.strictEqual(deploy.verifyStandalone, true);
  assert.strictEqual(release.linkage, 'dynamic');
  assert.strictEqual(model.qtDeploymentDirectory(manifestPath, 'release64', loaded), path.join(root, 'dist', 'release'));
  assert.strictEqual(model.qtDeploymentTargetPath(manifestPath, 'release64', loaded), path.join(root, 'dist', 'release', process.platform === 'win32' ? 'Demo.exe' : 'Demo'));

  const qtRoot = path.join(root, 'Qt', '6.11.0', 'mingw_64');
  const dynamicInstallation = {
    root: qtRoot, version: '6.11.0', majorVersion: 6,
    binDir: path.join(qtRoot, 'bin'), libDir: path.join(qtRoot, 'lib'),
    compilerFamily: 'mingw', toolchain: { family: 'mingw' }, label: 'Qt dynamic'
  };
  touch(path.join(dynamicInstallation.binDir, 'Qt6Core.dll'));
  touch(path.join(dynamicInstallation.libDir, 'libQt6Core.a'));
  assert.strictEqual(linkage.detectQtKitLinkage(dynamicInstallation), 'dynamic');
  assert.deepStrictEqual(linkage.compilerStaticRuntimeLinkerFlags(dynamicInstallation, 'static-runtime'), ['-static-libgcc', '-static-libstdc++']);

  const staticRoot = path.join(root, 'QtStatic');
  const staticInstallation = {
    root: staticRoot, version: '6.11.0', majorVersion: 6,
    binDir: path.join(staticRoot, 'bin'), libDir: path.join(staticRoot, 'lib'),
    compilerFamily: 'mingw', toolchain: { family: 'mingw' }, label: 'Qt static'
  };
  touch(path.join(staticInstallation.libDir, 'libQt6Core.a'));
  touch(path.join(staticRoot, 'mkspecs', 'qconfig.pri'), 'QT_CONFIG += static release\n');
  assert.strictEqual(linkage.detectQtKitLinkage(staticInstallation), 'static');
  assert.match(linkage.validateQtLinkageSelection(staticInstallation, 'static-qt', 'direct'), /direct backend/);
  assert.strictEqual(linkage.validateQtLinkageSelection(staticInstallation, 'static-qt', 'cmake'), undefined);
  assert.match(linkage.validateQtLinkageSelection(dynamicInstallation, 'static-qt', 'cmake'), /requires a Qt kit built with -static/);

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  for (const token of ['Deployment output directory', 'deployCleanOutput', 'deployCompilerRuntime', 'deployVerifyStandalone', 'Static Qt kit (qmake/CMake)']) {
    assert(settingsSource.includes(token), `missing standalone deployment UI token: ${token}`);
  }
  const packagingSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtPackagingService.ts'), 'utf8');
  assert(packagingSource.includes('qtDeploymentDirectory'), 'packaging must consume the clean deployment directory');

  console.log('QPM 0.32.0 standalone deployment and linkage tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
