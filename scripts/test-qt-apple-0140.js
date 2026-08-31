'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.30.0');
const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of [
  'qpm.configureAppleEnvironment','qpm.refreshAppleDevices','qpm.selectAppleSimulator','qpm.bootAppleSimulator',
  'qpm.buildAppleTarget','qpm.deployMacApplication','qpm.createMacDmg','qpm.signAppleArtifacts',
  'qpm.verifyAppleSignatures','qpm.notarizeAppleArtifact','qpm.stapleAppleArtifact',
  'qpm.installRunIosSimulator','qpm.openAppleReport','qpm.revealAppleOutput','qpm.cleanAppleOutput'
]) assert(commands.has(command), `${command} must be contributed`);
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.apple'));
assert(pkg.activationEvents.includes('onView:qpm.apple'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorApple'));

const originalLoad = Module._load;
class EventEmitter {
  constructor(){ this.event = () => ({ dispose(){} }); }
  fire(){}
  dispose(){}
}
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    EventEmitter,
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), openTextDocument: async () => ({}) },
    window: {
      showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){},
      showQuickPick: async () => undefined, showInputBox: async () => undefined,
      showOpenDialog: async () => undefined, showTextDocument: async () => undefined
    },
    commands: { executeCommand: async () => undefined },
    env: { openExternal: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-apple-0140-'));
try {
  const model = require('../out/model/qtProjectManifest');
  const apple = require('../out/services/qpmQtAppleService');
  const manifest = model.createDefaultQtProjectManifest('AppleApp', 'quick-application');
  assert.strictEqual(manifest.schemaVersion, 17);
  const profile = manifest.profiles.platforms[0];
  Object.assign(profile, {
    type: 'macos', name: 'macOS Release', appleBundleIdentifier: 'com.example.appleapp',
    appleDeploymentTarget: '14.0', appleArchitectures: ['arm64', 'x86_64'],
    appleDevelopmentTeam: 'ABCDE12345', appleCodeSignIdentity: 'Developer ID Application: Example',
    appleAutomaticSigning: false, appleConfiguration: 'Release', appleCreateDmg: true,
    appleDmgFileSystem: 'APFS', appleNotaryProfile: 'qpm-notary',
    appleStapleAfterNotarization: true, appleHardenedRuntime: true, appleTimestamp: true,
    appleAdditionalCMakeArguments: ['-DAPPLE_FEATURE=ON'],
    appleAdditionalXcodebuildArguments: ['-quiet'], appleAdditionalMacDeployQtArguments: ['-verbose=3']
  });
  manifest.files.sources = ['main.cpp'];
  manifest.files.qml = ['qml/Main.qml'];
  fs.mkdirSync(path.join(temp, 'qml'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'main.cpp'), 'int main(){return 0;}\n');
  fs.writeFileSync(path.join(temp, 'qml', 'Main.qml'), 'import QtQuick\nItem {}\n');
  const manifestPath = path.join(temp, 'custom-name.qtproject.json');
  model.writeQtProjectManifest(manifestPath, manifest);
  const reloaded = model.readQtProjectManifest(manifestPath);
  const active = model.getActiveQtPlatformProfile(reloaded);
  assert.strictEqual(active.type, 'macos');
  assert.strictEqual(active.appleBundleIdentifier, 'com.example.appleapp');
  assert.deepStrictEqual(active.appleArchitectures, ['arm64', 'x86_64']);
  assert.strictEqual(active.appleConfiguration, 'Release');
  assert.strictEqual(active.appleDmgFileSystem, 'APFS');
  assert.strictEqual(active.appleNotaryProfile, 'qpm-notary');
  assert(!JSON.stringify(reloaded).toLowerCase().includes('notarypassword'));

  const legacyPath = path.join(temp, 'Legacy.qtproject.json');
  const legacy = JSON.parse(JSON.stringify(reloaded));
  legacy.schemaVersion = 13;
  for (const platform of legacy.profiles.platforms) {
    for (const key of Object.keys(platform)) if (key.startsWith('apple')) delete platform[key];
  }
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(model.migrateQtProjectManifestFile(legacyPath), true);
  const migrated = model.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 17);
  assert(fs.existsSync(`${legacyPath}.schema-v13.backup`));
  assert.deepStrictEqual(migrated.profiles.platforms[0].appleArchitectures, ['arm64']);
  assert.strictEqual(migrated.profiles.platforms[0].appleAutomaticSigning, true);

  const simulators = apple.parseSimctlDevices(JSON.stringify({ devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
      { udid: 'BOOTED-1', name: 'iPhone 16 Pro', state: 'Booted', isAvailable: true },
      { udid: 'SHUTDOWN-1', name: 'iPhone SE', state: 'Shutdown', isAvailable: true },
      { udid: 'UNAVAILABLE', name: 'Old iPhone', state: 'Shutdown', isAvailable: false }
    ]
  }}));
  assert.strictEqual(simulators.length, 2);
  assert.strictEqual(simulators[0].udid, 'BOOTED-1');
  assert.strictEqual(simulators[0].runtime, 'iOS 18 2');
  assert.strictEqual(apple.isApplePlatform('macos'), true);
  assert.strictEqual(apple.isApplePlatform('ios-simulator'), true);
  assert.strictEqual(apple.isApplePlatform('android'), false);

  const cmake = apple.generateAppleCMakeProject({ root: temp, manifestPath, manifest: reloaded, platform: active });
  for (const marker of [
    'project(AppleApp LANGUAGES CXX OBJCXX)', 'qt_add_executable(AppleApp MACOSX_BUNDLE',
    'qt_add_qml_module(AppleApp', 'MACOSX_BUNDLE_GUI_IDENTIFIER "com.example.appleapp"',
    'XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "ABCDE12345"'
  ]) assert(cmake.includes(marker), `generated Apple CMake marker missing: ${marker}`);

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 17);
  for (const type of ['macos','ios-simulator','ios-device']) assert(schema.$defs.platformProfile.properties.type.enum.includes(type));
  for (const key of ['appleDeveloperDirectory','appleBundleIdentifier','appleArchitectures','appleCodeSignIdentity','appleNotaryProfile','appleDmgFileSystem']) {
    assert(schema.$defs.platformProfile.properties[key], `schema property ${key} missing`);
  }

  const source = fs.readFileSync(path.join(root, 'src/services/qpmQtAppleService.ts'), 'utf8');
  for (const marker of ['macdeployqt', "'notarytool', 'submit'", "'stapler', 'staple'", "'simctl', 'install'", "'-destination'", 'xcodebuild']) {
    assert(source.includes(marker), `Apple service marker missing: ${marker}`);
  }
  const settings = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of ['platformAppleDeveloperDirectory','platformAppleBundleIdentifier','platformAppleCodeSignIdentity','platformAppleNotaryProfile','qpm.createMacDmg','qpm.installRunIosSimulator']) {
    assert(settings.includes(marker), `Apple settings marker missing: ${marker}`);
  }
  const extension = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  assert(extension.includes("createTreeView('qpm.apple'"));
  assert(extension.includes("register('qpm.configureAppleEnvironment'"));
  assert(extension.includes("register('qpm.notarizeAppleArtifact'"));

  console.log('QPM 0.14.0 macOS, iOS, signing, notarization and simulator tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
