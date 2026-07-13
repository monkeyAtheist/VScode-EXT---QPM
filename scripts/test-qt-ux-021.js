'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const packageJson = JSON.parse(read('package.json'));

assert.strictEqual(packageJson.version, '0.15.2', 'package version must be 0.15.2');

const commandIds = packageJson.contributes.commands.map((entry) => entry.command);
assert.strictEqual(new Set(commandIds).size, commandIds.length, 'VS Code commands must not be duplicated');

const activityIcon = read('media/qpm.svg');
assert(activityIcon.includes('<circle'), 'activity icon must contain the Qt Q symbol');
assert(activityIcon.includes('17.2'), 'activity icon must contain the Qt t symbol');
assert(!activityIcon.includes('C++'), 'activity icon must not contain the legacy C++ label');

const workspaceSource = read('src/services/qpmWorkspaceService.ts');
assert(workspaceSource.includes("value: 'Qt_Workspace'"), 'native workspace default must be Qt_Workspace');
assert(workspaceSource.includes('createProjectWizard(folder[0].fsPath)'), 'workspace creation must launch the native Qt project wizard');
assert(!workspaceSource.includes("value: 'Cpp_Workspace'"), 'legacy Cpp_Workspace default must be removed');

const projectSource = read('src/services/qpmQtProjectService.ts');
assert(projectSource.includes("'QtWidgetsApp'"), 'Qt Widgets project default must be QtWidgetsApp');
assert(projectSource.includes('.qtproject.json'), 'native project wizard must produce a Qt manifest');

const templates = read('src/services/qpmTemplateService.ts');
for (const token of ['qt-main', 'qt-class', 'qt-form', 'qt-resource', 'qt-qml']) {
  assert(templates.includes(token), `Qt creation template ${token} must be registered`);
}
assert(templates.includes('Q_OBJECT'), 'Qt class templates must support the meta-object system');
assert(templates.includes('<ui version="4.0">'), 'Qt Designer form template must be present');

const extension = read('src/extension.ts');
assert(extension.includes('new QtProjectSettingsPanel'), 'native Qt settings panel must be instantiated');
assert(extension.includes('isQtProjectManifestPath(ref.absolutePath) ? qtProjectSettings.show(ref) : buildSettings.show(ref)'), 'settings command must route native manifests to the Qt settings panel');

const settingsPanel = read('src/views/qtProjectSettingsPanel.ts');
for (const section of ['Qt kit and generators', 'Qt modules', 'Common compiler and linker inputs', 'Run', 'Advanced debugging', 'Build steps']) {
  assert(settingsPanel.includes(section), `Qt settings section missing: ${section}`);
}
assert(!settingsPanel.includes('SDL integration'), 'native Qt settings must not expose the generic SDL section');

const legacyPanel = read('src/views/buildSettingsPanel.ts');
assert(legacyPanel.includes('Compatibility C/C++ Build Settings'), 'legacy .prj editor must be explicitly labelled as compatibility mode');
assert(legacyPanel.includes('does not invoke Qt'), 'legacy .prj editor must explain that it does not invoke Qt generators');

const treeProvider = read('src/providers/qpmTreeProvider.ts');
assert(treeProvider.includes("'qpmProjectNative'"), 'native project context value must be distinct');
assert(treeProvider.includes("'qpmProjectCompatibility'"), 'compatibility project context value must be distinct');

const contextMenu = packageJson.contributes.menus['view/item/context'];
const nativeOnly = new Map(contextMenu.filter((entry) => ['qpm.editQtModules', 'qpm.showQtBuildPlan', 'qpm.deployQtRuntime'].includes(entry.command)).map((entry) => [entry.command, entry.when]));
for (const command of ['qpm.editQtModules', 'qpm.showQtBuildPlan', 'qpm.deployQtRuntime']) {
  assert((nativeOnly.get(command) || '').includes('qpmProjectNative'), `${command} must only be shown for native Qt projects`);
}
const targetTypeEntry = contextMenu.find((entry) => entry.command === 'qpm.selectTargetType');
assert(targetTypeEntry && targetTypeEntry.when.includes('qpmProjectCompatibility'), 'legacy target-type editor must be hidden from native Qt projects');

assert(!packageJson.contributes.menus['view/title'].some((entry) => entry.command === 'qpm.configureSdl'), 'SDL compatibility configuration must not occupy the primary Qt view toolbar');

const qtInstallSource = read('src/services/qpmQtInstallationService.ts');
assert(qtInstallSource.includes("source === 'qt-tools'"), 'Qt Tools compiler must be prioritized');
assert(qtInstallSource.includes('Compiler architecture mismatch'), 'Qt compiler architecture mismatch must be diagnosed');
assert(packageJson.contributes.commands.some((entry) => entry.command === 'qpm.repairQtToolchain'), 'Qt toolchain repair command must be contributed');
assert(packageJson.contributes.configuration.properties['qpm.qtCompilerPath'], 'dedicated Qt compiler override setting must exist');
const buildSource = read('src/services/qpmBuildService.ts');
const nativeBuildBlock = buildSource.slice(buildSource.indexOf('private async buildNativeQtProject'), buildSource.indexOf('private async linkArtifacts'));
assert(!nativeBuildBlock.includes('this.modeFlags(config)'), 'native Qt builds must not inherit generic -m32/-m64 flags');
assert(!nativeBuildBlock.includes('config.cppCompilerPath'), 'native Qt builds must not use the generic compiler path');
const cppToolsSource = read('src/services/qpmCppToolsService.ts');
assert(cppToolsSource.includes('findExactWorkspaceFolder(root)'), 'IntelliSense must require the project root as an exact VS Code workspace folder');
assert(cppToolsSource.includes("C_Cpp.RescanWorkspace"), 'IntelliSense must request a rescan after synchronization');

console.log('QPM 0.2.2 Qt UX and native project workflow tests: PASS');
