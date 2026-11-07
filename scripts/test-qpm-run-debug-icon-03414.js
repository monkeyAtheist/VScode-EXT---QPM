const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.34.14');
const command = pkg.contributes.commands.find(c => c.command === 'qpm.startQtDebugProfileWithoutBuild');
assert(command, 'Run Debug command must exist');
assert.strictEqual(command.icon, '$(debug-alt)', 'Qt Workspace toolbar must use the native debug-alt Codicon');
assert(!fs.existsSync(path.join(root, 'media/run-debug-light.svg')), 'old light custom SVG must be removed');
assert(!fs.existsSync(path.join(root, 'media/run-debug-dark.svg')), 'old dark custom SVG must be removed');
const src = fs.readFileSync(path.join(root, 'src/services/qpmBuildService.ts'), 'utf8');
assert(src.includes("new vscode.ThemeIcon('debug-alt', new vscode.ThemeColor('debugIcon.startForeground'))"),
  'Run debug without build must use native debug-alt with debug-start foreground color');
assert(src.includes("{ label: 'Build and debug', iconPath: new vscode.ThemeIcon('debug-alt')"),
  'Build and debug must use the same native debug-alt glyph');
const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
assert(ext.includes("createStatusBarAction('$(debug-alt)', 'Run the active Qt debug profile without rebuilding'"),
  'status bar Run Debug action must use debug-alt');
console.log('QPM 0.34.14 native Run Debug icon regression: OK');
