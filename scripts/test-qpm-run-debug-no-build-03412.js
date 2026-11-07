const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const buildService = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
const debugService = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtDebugService.ts'), 'utf8');

assert(/^0\.34\.(1[2-9]|[2-9][0-9])$/.test(pkg.version), `Unexpected QPM version: ${pkg.version}`);
const command = pkg.contributes.commands.find((entry) => entry.command === 'qpm.startQtDebugProfileWithoutBuild');
assert(command, 'Run Debug without build command must exist');
assert.deepStrictEqual(command.icon, { light: 'media/run-debug-light.svg', dark: 'media/run-debug-dark.svg' });
assert(/Run Debug Without Build/i.test(command.title));

const toolbar = pkg.contributes.menus['view/title'].filter((entry) => entry.when === 'view == qpm.workspaceExplorer');
const runIndex = toolbar.findIndex((entry) => entry.command === 'qpm.run');
const debugIndex = toolbar.findIndex((entry) => entry.command === 'qpm.startQtDebugProfileWithoutBuild');
const advancedIndex = toolbar.findIndex((entry) => entry.command === 'qpm.chooseRunAction');
assert(runIndex >= 0 && debugIndex > runIndex, 'Run Debug button must be after Run');
assert(advancedIndex > debugIndex, 'Advanced run options must remain after Run Debug');

assert(extension.includes("'qpm.startQtDebugProfileWithoutBuild'"));
assert(extension.includes("Run the active Qt debug profile without rebuilding"));
assert(buildService.includes("Run debug without build"));
assert(buildService.includes("value: 'debugOnly'"));
assert(buildService.includes("executeCommand('qpm.startQtDebugProfileWithoutBuild')"));
assert(debugService.includes("options.build === false && profile.request === 'launch' && !fs.existsSync(context.targetPath)"));
assert(debugService.includes('Build the project first or use Build and Debug.'));

console.log('QPM Run Debug without build regression: OK');
