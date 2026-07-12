'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));

assert.strictEqual(pkg.version, '0.15.0');
const properties = pkg.contributes.configuration.properties;
assert.strictEqual(properties['qpm.autoConfigureCppTools'].default, true, 'automatic IntelliSense synchronization must be enabled by default');
assert.strictEqual(properties['qpm.autoAddQpmFolderToWorkspace'].default, true, 'precise project-root workspace registration must be enabled by default');

const extension = read('src/extension.ts');
assert(extension.includes("reason: 'native Qt workspace created'"), 'workspace + project creation must force IntelliSense synchronization');
assert(extension.includes("reason: 'native Qt project created'"), 'standalone project creation must force IntelliSense synchronization');
assert(extension.includes('await builds.prepareNativeQtGeneratedFiles();'), 'new projects must generate uic/moc/rcc outputs before IntelliSense indexing');
assert(extension.includes("'Qt/C++ file opened'"), 'opening a Qt/C++ file must schedule automatic repair/synchronization');
assert(extension.includes("'extension activation'"), 'project reload on activation must synchronize automatically');
assert(extension.includes("reason: 'Qt modules updated'"), 'module changes must refresh include paths automatically');
assert(extension.includes("reason: 'Qt profiles updated'"), 'profile changes must refresh compiler and include configuration automatically');

const cppTools = read('src/services/qpmCppToolsService.ts');
assert(cppTools.includes('async synchronizeNativeProject('), 'a dedicated native-project synchronization lifecycle must exist');
assert(cppTools.includes('await this.activateCppToolsExtension();'), 'Microsoft C/C++ must be activated before requesting a rescan');
assert(cppTools.includes('await this.waitForConfigurationRoot(workspace);'), 'QPM must wait for the exact project root to become a workspace folder');
assert(cppTools.includes('const compileCommandsPath = this.synchronizeNativeQtCompileCommands(workspace, root);'), 'compile_commands.json must be regenerated automatically');
assert(cppTools.includes("await vscode.commands.executeCommand('C_Cpp.RescanWorkspace')"), 'a C/C++ workspace rescan must be requested after synchronization');

const build = read('src/services/qpmBuildService.ts');
assert(build.includes('async prepareNativeQtGeneratedFiles('), 'lightweight Qt code generation for IntelliSense must exist');
for (const token of ['generationStepIsOutdated(step)', 'step.toolPath', 'step.outputPath']) {
  assert(build.includes(token), `generated-file preparation must use ${token}`);
}
assert(build.includes("await vscode.commands.executeCommand('C_Cpp.RescanWorkspace')"), 'successful builds must refresh IntelliSense for newly generated files');

console.log('QPM 0.2.9 automatic IntelliSense lifecycle tests: PASS');
