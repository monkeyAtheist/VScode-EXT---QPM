'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.30.0');

const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of [
  'qpm.createDesktopInstaller', 'qpm.generateInstallerProject', 'qpm.createQtIfwRepository',
  'qpm.signDistributionArtifacts', 'qpm.verifyDistributionSignatures', 'qpm.detectInstallerTools',
  'qpm.openInstallerReport', 'qpm.revealInstallerOutput', 'qpm.cleanInstallerOutput'
]) assert(commandIds.has(id), `${id} must be contributed`);
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.installers'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorInstallers'));
assert(pkg.contributes.menus['qpm.editorInstallers'].length >= 9);

const originalLoad = Module._load;
class EventEmitter {
  constructor() { this.event = () => ({ dispose() {} }); }
  fire() {}
  dispose() {}
}
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    EventEmitter,
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({})
    },
    window: {
      createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, clear() {}, dispose() {} }),
      showErrorMessage() {}, showWarningMessage() {}, showInformationMessage() {},
      showTextDocument: async () => undefined
    },
    commands: { executeCommand: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-installers-0120-'));
try {
  const manifestApi = require('../out/model/qtProjectManifest');
  const installerModel = require('../out/services/qpmQtInstallerModel');
  const installerService = require('../out/services/qpmQtInstallerService');

  const manifestPath = path.join(temp, 'InstallerApp.qtproject.json');
  const manifest = manifestApi.createDefaultQtProjectManifest('InstallerApp', 'widgets-application');
  assert.strictEqual(manifest.schemaVersion, 17);
  assert.strictEqual(manifest.packaging.installer.enabled, true);
  assert.strictEqual(manifest.packaging.installer.backend, 'qt-ifw');
  assert.strictEqual(manifest.packaging.installer.qtIfw.mode, 'offline');
  assert.strictEqual(manifest.packaging.installer.signing.certificatePasswordEnvironment, 'QPM_SIGN_CERT_PASSWORD');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(manifest.packaging.installer.signing, 'password'), false);

  manifest.packaging.productName = 'Installer Application';
  manifest.packaging.productVersion = '2.5.1';
  manifest.packaging.companyName = 'Example Company';
  manifest.packaging.description = 'Qt desktop application';
  manifest.packaging.identifier = 'com.example.installerapp';
  manifest.packaging.installer.fileNamePattern = '${productName}-${version}-${arch}-setup';
  manifest.packaging.installer.qtIfw.componentId = 'com.example.installerapp.core';
  manifestApi.writeQtProjectManifest(manifestPath, manifest);
  const reloaded = manifestApi.readQtProjectManifest(manifestPath);
  const identity = installerModel.resolveQtInstallerIdentity(reloaded, 'release64');
  assert.match(identity.installerBaseName, /^Installer-Application-2\.5\.1-/);

  const generated = installerModel.installerGeneratedPaths(manifestPath, reloaded.packaging.installer.qtIfw.componentId);
  assert(generated.qtIfwConfig.endsWith(path.join('config', 'config.xml')));
  assert(generated.qtIfwPackageXml.includes(path.join('com.example.installerapp.core', 'meta', 'package.xml')));

  const configXml = installerModel.renderQtIfwConfig(reloaded, identity, 'InstallerApp.exe');
  assert.match(configXml, /<Installer>/);
  assert.match(configXml, /<Name>Installer Application<\/Name>/);
  assert.match(configXml, /<MaintenanceToolName>InstallerAppMaintenanceTool<\/MaintenanceToolName>/);
  const packageXml = installerModel.renderQtIfwPackageXml(reloaded, identity, '2026-07-12', true);
  assert.match(packageXml, /<ReleaseDate>2026-07-12<\/ReleaseDate>/);
  assert.match(packageXml, /<Script>installscript.qs<\/Script>/);
  const componentScript = installerModel.renderQtIfwComponentScript(reloaded, 'InstallerApp.exe');
  assert.match(componentScript, /CreateShortcut/);

  const stage = path.join(temp, 'stage');
  const output = path.join(temp, 'dist', 'installers');
  fs.mkdirSync(stage, { recursive: true });
  const inno = installerModel.renderInnoSetupScript(reloaded, identity, temp, stage, output, identity.installerBaseName);
  assert.match(inno, /\[Setup\]/);
  assert.match(inno, /\[Files\]/);
  assert.match(inno, /OutputBaseFilename=/);
  const nsis = installerModel.renderNsisScript(reloaded, identity, stage, path.join(output, `${identity.installerBaseName}.exe`));
  assert.match(nsis, /!include "MUI2\.nsh"/);
  assert.match(nsis, /WriteUninstaller/);
  assert.strictEqual(installerModel.normalizeNsisVersion('2.5.1-beta'), '2.5.1.0');
  assert.strictEqual(installerModel.sanitizeComponentId(' bad component/id '), 'bad.component.id');

  const tools = path.join(temp, 'tools');
  fs.mkdirSync(tools, { recursive: true });
  for (const name of ['binarycreator.exe', 'repogen.exe', 'installerbase.exe', 'ISCC.exe', 'makensis.exe', 'signtool.exe']) {
    fs.writeFileSync(path.join(tools, name), 'fake');
  }
  reloaded.packaging.installer.qtIfw.binaryCreatorPath = path.join(tools, 'binarycreator.exe');
  reloaded.packaging.installer.qtIfw.repogenPath = path.join(tools, 'repogen.exe');
  reloaded.packaging.installer.qtIfw.installerBasePath = path.join(tools, 'installerbase.exe');
  reloaded.packaging.installer.inno.isccPath = path.join(tools, 'ISCC.exe');
  reloaded.packaging.installer.nsis.makensisPath = path.join(tools, 'makensis.exe');
  reloaded.packaging.installer.signing.signToolPath = path.join(tools, 'signtool.exe');
  const detected = installerService.detectQtInstallerTools(reloaded);
  assert.strictEqual(detected.binaryCreator, path.normalize(path.join(tools, 'binarycreator.exe')));
  assert.strictEqual(detected.repogen, path.normalize(path.join(tools, 'repogen.exe')));
  assert.strictEqual(detected.iscc, path.normalize(path.join(tools, 'ISCC.exe')));
  assert.strictEqual(detected.makensis, path.normalize(path.join(tools, 'makensis.exe')));
  assert.strictEqual(detected.signTool, path.normalize(path.join(tools, 'signtool.exe')));

  reloaded.packaging.installer.signing.enabled = true;
  reloaded.packaging.installer.signing.certificateFile = 'certificate.pfx';
  reloaded.packaging.installer.signing.certificatePasswordEnvironment = 'MY_SECRET_ENV';
  const signArgs = installerService.buildSignToolPreviewArguments(reloaded, 'InstallerApp.exe');
  assert(signArgs.includes('<MY_SECRET_ENV>'));
  assert(!signArgs.some((value) => value === process.env.MY_SECRET_ENV && value));
  assert(signArgs.includes('/fd') && signArgs.includes('SHA256'));
  assert(signArgs.includes('/tr') && signArgs.includes('/td'));

  const legacyPath = path.join(temp, 'Legacy.qtproject.json');
  const legacy = JSON.parse(JSON.stringify(reloaded));
  legacy.schemaVersion = 11;
  delete legacy.packaging.installer;
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(manifestApi.migrateQtProjectManifestFile(legacyPath), true);
  const migrated = manifestApi.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 17);
  assert.strictEqual(migrated.packaging.installer.backend, 'qt-ifw');
  assert(fs.existsSync(`${legacyPath}.schema-v11.backup`));

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 17);
  assert(schema.properties.packaging.required.includes('installer'));
  const installerSchema = schema.properties.packaging.properties.installer;
  assert.deepStrictEqual(installerSchema.properties.backend.enum, ['qt-ifw', 'inno-setup', 'nsis']);
  assert(installerSchema.properties.signing.properties.certificatePasswordEnvironment);
  assert(!installerSchema.properties.signing.properties.password);

  const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of ['section-installers', 'installerBackend', 'installerQtIfwBinaryCreatorPath', 'installerInnoIsccPath', 'installerNsisMakensisPath', 'installerCertificatePasswordEnvironment', 'qpm.createDesktopInstaller']) {
    assert(settingsSource.includes(marker), `installer settings marker missing: ${marker}`);
  }
  const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert(extensionSource.includes("createTreeView('qpm.installers'"));
  assert(extensionSource.includes("register('qpm.createDesktopInstaller'"));

  console.log('QPM 0.12.0 desktop installers, update repositories and signing tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
