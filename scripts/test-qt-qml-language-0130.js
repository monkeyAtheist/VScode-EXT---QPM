'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');
assert.strictEqual(pkg.dependencies['vscode-languageclient'], '^9.0.1');

const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of [
  'qpm.startQmlLanguageServer', 'qpm.restartQmlLanguageServer', 'qpm.stopQmlLanguageServer',
  'qpm.refreshQmlLanguageServer', 'qpm.generateQmllsConfiguration', 'qpm.openQmllsConfiguration',
  'qpm.generateQmldir', 'qpm.openQmlLanguageReport', 'qpm.showQmlLanguageOutput', 'qpm.showQmlLanguageTrace'
]) assert(commands.has(command), `${command} must be contributed`);
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.qmlLanguage'));
assert(pkg.activationEvents.includes('onView:qpm.qmlLanguage'));
assert(pkg.contributes.languages.some((entry) => entry.id === 'qml' && entry.extensions.includes('.qml')));
assert(pkg.contributes.grammars.some((entry) => entry.language === 'qml' && entry.scopeName === 'source.qml.qpm'));
assert(pkg.contributes.menus['qpm.qmlTools'].some((entry) => entry.command === 'qpm.generateQmldir'));

const manifestApi = require('../out/model/qtProjectManifest');
const quick = manifestApi.createDefaultQtProjectManifest('QuickApp', 'quick-application');
assert.strictEqual(quick.schemaVersion, 18);
assert.strictEqual(quick.qml.languageServer.enabled, true);
assert.strictEqual(quick.qml.languageServer.autoStart, true);
assert.strictEqual(quick.qml.languageServer.conflictPolicy, 'avoid-duplicate');
assert.strictEqual(quick.qml.languageServer.maxFilesToSearch, 20000);
assert.strictEqual(quick.qml.module.uri, 'QuickApp');
assert.strictEqual(quick.qml.module.version, '1.0');
assert.strictEqual(quick.qml.module.importRoot, 'qml');
assert.strictEqual(quick.qml.module.resourcePrefix, '/qt/qml');
const widgets = manifestApi.createDefaultQtProjectManifest('WidgetsApp', 'widgets-application');
assert.strictEqual(widgets.qml.languageServer.enabled, false);
assert.strictEqual(widgets.qml.languageServer.autoStart, false);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qmlls-0130-'));
try {
  const legacyPath = path.join(temp, 'Legacy.qtproject.json');
  const legacy = JSON.parse(JSON.stringify(quick));
  legacy.schemaVersion = 12;
  delete legacy.qml;
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(manifestApi.migrateQtProjectManifestFile(legacyPath), true);
  const migrated = manifestApi.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 18);
  assert.strictEqual(migrated.qml.languageServer.enabled, true);
  assert(fs.existsSync(`${legacyPath}.schema-v12.backup`));

  migrated.qml.languageServer.trace = 'invalid';
  migrated.qml.languageServer.conflictPolicy = 'invalid';
  migrated.qml.module.uri = '1 bad uri';
  migrated.qml.module.version = '2';
  migrated.qml.module.resourcePrefix = 'qml//modules';
  manifestApi.writeQtProjectManifest(legacyPath, migrated);
  const normalized = manifestApi.readQtProjectManifest(legacyPath);
  assert.strictEqual(normalized.qml.languageServer.trace, 'off');
  assert.strictEqual(normalized.qml.languageServer.conflictPolicy, 'avoid-duplicate');
  assert.strictEqual(normalized.qml.module.uri, '_1baduri');
  assert.strictEqual(normalized.qml.module.version, '2.0');
  assert.strictEqual(normalized.qml.module.resourcePrefix, '/qml/modules');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
assert.strictEqual(schema.properties.schemaVersion.const, 18);
assert(schema.required.includes('qml'));
assert.deepStrictEqual(schema.properties.qml.properties.languageServer.properties.trace.enum, ['off', 'messages', 'verbose']);
assert.deepStrictEqual(schema.properties.qml.properties.languageServer.properties.conflictPolicy.enum, ['avoid-duplicate', 'allow-parallel']);

const installSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtInstallationService.ts'), 'utf8');
assert(installSource.includes('qmlLanguageServerPath?: string'));
assert(installSource.includes("qmlLanguageServerPath: existingFile(binDir, ['qmlls'])"));
const serviceSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQmlLanguageService.ts'), 'utf8');
for (const marker of [
  "from 'vscode-languageclient/node'", "OFFICIAL_QML_EXTENSION_ID = 'TheQtCompany.qt-qml'",
  "new LanguageClient('qpm-qmlls'", "sendNotification('$/addBuildDirs'", '.qmlls.ini',
  'generateQmldir()', 'QMLLS_BUILD_DIRS', 'QML_IMPORT_PATH'
]) assert(serviceSource.includes(marker), `QML language service marker missing: ${marker}`);
assert(serviceSource.includes('resolveImportPaths(ref.absolutePath, root, manifest'), 'QML import resolution must use the actual manifest path');

const healthSource = fs.readFileSync(path.join(root, 'src', 'providers', 'qpmQtProjectHealthProvider.ts'), 'utf8');
assert(healthSource.includes('QML tools and language server'));
assert(healthSource.includes('qmlLanguageServerPath'));
const providerSource = fs.readFileSync(path.join(root, 'src', 'providers', 'qpmQmlLanguageProvider.ts'), 'utf8');
assert(providerSource.includes('Start QML Language Server'));
assert(providerSource.includes('Generate qmldir'));
const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
assert(extensionSource.includes("createTreeView('qpm.qmlLanguage'"));
assert(extensionSource.includes("register('qpm.startQmlLanguageServer'"));
assert(extensionSource.includes('qmlLanguage.autoStartIfNeeded()'));

const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
for (const marker of [
  'section-qml-language', 'qmlLanguageServerExecutable', 'qmlLanguageServerBuildDirectories',
  'qmlLanguageServerConflictPolicy', 'qmlModuleUri', 'qmlModuleImportRoot', 'qpm.generateQmllsConfiguration'
]) assert(settingsSource.includes(marker), `QML settings marker missing: ${marker}`);

for (const syntaxFile of ['syntaxes/qml-language-configuration.json', 'syntaxes/qml.tmLanguage.json']) {
  JSON.parse(fs.readFileSync(path.join(root, syntaxFile), 'utf8'));
}
const ignore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
assert(ignore.includes('node_modules/**'));
assert(ignore.includes('out/**'));
assert.strictEqual(pkg.main, './dist/extension.js');
assert(fs.existsSync(path.join(root, 'dist', 'extension.js')));
const bundle = fs.readFileSync(path.join(root, 'dist', 'extension.js'), 'utf8');
assert(bundle.includes('QPM QML Language Server'));
assert(bundle.includes('vscode-languageclient'));

console.log('QPM 0.13.0 QML Language Server, qmlls configuration and QML module metadata: PASS');
