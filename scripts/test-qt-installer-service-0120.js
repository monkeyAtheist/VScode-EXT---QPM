'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

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

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-installer-service-0120-'));
(async () => {
  try {
    const manifestApi = require('../out/model/qtProjectManifest');
    const { QpmQtInstallerService } = require('../out/services/qpmQtInstallerService');
    const manifestPath = path.join(temp, 'ServiceApp.qtproject.json');
    const stage = path.join(temp, 'dist', 'ServiceApp-stage');
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(stage, 'ServiceApp'), 'application');

    const makeTool = (name, body) => {
      const file = path.join(temp, name);
      fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}\n`, 'utf8');
      fs.chmodSync(file, 0o755);
      return file;
    };
    const binarycreator = makeTool('binarycreator', 'for last; do :; done\nmkdir -p "$(dirname "$last")"\nprintf installer > "$last"');
    const repogen = makeTool('repogen', 'for last; do :; done\nmkdir -p "$last"\nprintf repository > "$last/Updates.xml"');

    const manifest = manifestApi.createDefaultQtProjectManifest('ServiceApp', 'widgets-application');
    manifest.packaging.productName = 'Service App';
    manifest.packaging.installer.buildPortablePackage = true;
    manifest.packaging.installer.qtIfw.binaryCreatorPath = binarycreator;
    manifest.packaging.installer.qtIfw.repogenPath = repogen;
    manifest.packaging.installer.qtIfw.installerBasePath = '';
    manifest.packaging.installer.signing.enabled = false;
    manifestApi.writeQtProjectManifest(manifestPath, manifest);

    const ref = { exists: true, absolutePath: manifestPath };
    const workspaces = { activeProjectRef: ref };
    const packaging = {
      getReport: () => ({ stageDirectory: stage }),
      createPortablePackage: async () => true
    };
    const builds = { buildMode: 'release64' };
    const installations = { getActive: () => undefined };
    const service = new QpmQtInstallerService(workspaces, packaging, builds, installations);

    const report = service.getReport();
    assert(report);
    assert.strictEqual(report.backend, 'qt-ifw');
    assert.strictEqual(report.issues.filter((issue) => issue.severity === 'error').length, 0);
    assert.strictEqual(await service.createInstaller(), true);
    assert(fs.existsSync(service.latestInstallerPath), 'simulated binarycreator output missing');
    assert(fs.existsSync(report.generated.qtIfwConfig));
    assert(fs.existsSync(report.generated.qtIfwPackageXml));
    assert(fs.existsSync(path.join(report.generated.qtIfwPackages, manifest.packaging.installer.qtIfw.componentId, 'data', 'ServiceApp')));

    assert.strictEqual(await service.createUpdateRepository(), true);
    assert(fs.existsSync(path.join(report.repositoryPath, 'Updates.xml')), 'simulated repogen output missing');
    service.dispose();
    console.log('QPM 0.12.0 simulated Qt IFW installer and repository workflow: PASS');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
