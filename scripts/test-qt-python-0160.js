'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.34.2');

const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
const pythonCommands = [
  'qpm.python.bootstrap',
  'qpm.python.selectInterpreter',
  'qpm.python.createVirtualEnvironment',
  'qpm.python.installPySide6',
  'qpm.python.build',
  'qpm.python.run',
  'qpm.python.debug',
  'qpm.python.clean',
  'qpm.python.compileUi',
  'qpm.python.compileResources',
  'qpm.python.openDesigner',
  'qpm.python.deploy',
  'qpm.python.deployAndroid',
  'qpm.python.openReport',
  'qpm.python.revealEnvironment'
];
for (const command of pythonCommands) assert(commands.has(command), `${command} must be contributed`);
assert(pkg.activationEvents.includes('onView:qpm.python'));
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.python'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorPython'));
assert(pkg.contributes.menus['qpm.editorPython'].length >= 10);

const model = require('../out/model/qtProjectManifest');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-python-0160-'));
try {
  const widgetsPath = path.join(temp, 'PySideWidgetsApp.qtproject.json');
  const widgets = model.createDefaultQtProjectManifest('PySideWidgetsApp', 'python-widgets-application');
  assert.strictEqual(widgets.schemaVersion, 19);
  assert.strictEqual(widgets.kind, 'python-widgets-application');
  assert.strictEqual(model.isQtPythonProject(widgets), true);
  assert.strictEqual(model.qtProjectLanguage(widgets), 'python');
  assert.strictEqual(widgets.python.enabled, true);
  assert.strictEqual(widgets.python.binding, 'pyside6');
  assert.strictEqual(widgets.python.virtualEnvironment, '.venv');
  assert.strictEqual(widgets.python.autoCreateVirtualEnvironment, true);
  assert.strictEqual(widgets.python.autoInstallPySide6, false);
  assert.strictEqual(widgets.python.projectFile, 'pyproject.toml');
  assert.strictEqual(widgets.python.entryPoint, 'main.py');
  assert.strictEqual(widgets.python.uiMode, 'compiled');
  assert.strictEqual(widgets.python.deploySpecFile, 'pysidedeploy.spec');
  assert(Array.isArray(widgets.files.python));
  widgets.files.python = ['main.py'];
  model.writeQtProjectManifest(widgetsPath, widgets);
  assert.strictEqual(model.readQtProjectManifest(widgetsPath).python.binding, 'pyside6');

  const quick = model.createDefaultQtProjectManifest('PySideQuickApp', 'python-quick-application');
  assert.strictEqual(quick.schemaVersion, 19);
  assert.strictEqual(quick.kind, 'python-quick-application');
  assert.strictEqual(quick.python.enabled, true);
  assert.strictEqual(quick.qml.languageServer.enabled, true);
  assert.strictEqual(model.fileCategoryForPath('src/main.py'), 'python');
  assert.strictEqual(model.fileCategoryForPath('types/api.pyi'), 'python');

  const legacyPath = path.join(temp, 'LegacyCpp.qtproject.json');
  const legacy = model.createDefaultQtProjectManifest('LegacyCpp', 'widgets-application');
  legacy.schemaVersion = 15;
  delete legacy.python;
  delete legacy.files.python;
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(model.migrateQtProjectManifestFile(legacyPath), true);
  const migrated = model.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 19);
  assert.strictEqual(migrated.python.enabled, false);
  assert.strictEqual(migrated.python.binding, 'pyside6');
  assert(Array.isArray(migrated.files.python));
  assert(fs.existsSync(`${legacyPath}.schema-v15.backup`));

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 19);
  assert(schema.required.includes('python'));
  assert(schema.properties.kind.enum.includes('python-widgets-application'));
  assert(schema.properties.kind.enum.includes('python-quick-application'));
  assert.deepStrictEqual(schema.properties.python.properties.binding.enum, ['pyside6']);
  assert(schema.properties.files.properties.python);

  const pythonService = fs.readFileSync(path.join(root, 'src/services/qpmQtPythonService.ts'), 'utf8');
  for (const marker of [
    'pyside6-project', 'pyside6-designer', 'pyside6-uic', 'pyside6-rcc',
    'pyside6-deploy', 'pyside6-android-deploy', "'-m', 'venv'", "'-m', 'pip', 'install'", "type: 'debugpy'"
  ]) assert(pythonService.includes(marker), `Qt for Python service marker missing: ${marker}`);

  const projectService = fs.readFileSync(path.join(root, 'src/services/qpmQtProjectService.ts'), 'utf8');
  for (const marker of [
    'Qt for Python — Widgets (PySide6)', 'Qt for Python — Quick (PySide6)',
    'python-widgets-application', 'python-quick-application', '[tool.pyside6-project]', 'PySide6'
  ]) assert(projectService.includes(marker), `Qt for Python project template marker missing: ${marker}`);

  const settings = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of [
    'section-python', 'pythonInterpreter', 'pythonVirtualEnvironment', 'pythonProjectFile',
    'pythonEntryPoint', 'pythonDeploySpecFile', 'pythonUiMode', 'qpm.python.installPySide6'
  ]) assert(settings.includes(marker), `Qt for Python settings marker missing: ${marker}`);

  const extension = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  assert(extension.includes("createTreeView('qpm.python'"));
  assert(extension.includes("register('qpm.python.build'"));
  assert(extension.includes("register('qpm.python.deployAndroid'"));
  assert(extension.includes('qpm.qtPythonProjectActive'));

  const buildService = fs.readFileSync(path.join(root, 'src/services/qpmBuildService.ts'), 'utf8');
  assert(buildService.includes('isQtPythonProject'));
  assert(buildService.includes('this.qtPython.build'));
  assert(buildService.includes('this.qtPython.clean'));
  assert(buildService.includes('this.qtPython.run'));

  console.log('QPM 0.16.0 Qt for Python / PySide6 project, tooling and deployment tests: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
