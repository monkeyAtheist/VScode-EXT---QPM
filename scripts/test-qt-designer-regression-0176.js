'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const cpp = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtProjectService.ts'), 'utf8');
const start = cpp.indexOf('async function spawnDesigner(');
const end = cpp.indexOf('function findActiveManifestPath', start);
assert(start >= 0 && end > start, 'C++ spawnDesigner implementation must exist');
const block = cpp.slice(start, end);
assert(block.includes('spawn(executable, [target]'), 'Designer must be launched directly with the .ui path');
assert(block.includes('cwd: path.dirname(target)'), 'Designer cwd must be the existing .ui directory, never a stale workspace path');
assert(block.includes('detached: true'), 'Validated direct launcher remains detached');
assert(block.includes('windowsHide: false'), 'C++ Designer must restore the exact QPM 0.10.0 windowsHide behavior');
assert(block.includes("stdio: 'ignore'"), 'Designer must not inherit terminal stdio');
assert(block.includes('shell: false'), 'Designer must not go through a shell or VS Code terminal');
assert(!block.includes("['--server']"), 'Designer server mode must remain disabled');
assert(!block.includes('qtcreator'), 'Direct C++ launcher must not fall back to Qt Creator');

const py = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtPythonService.ts'), 'utf8');
const pyStart = py.indexOf('async openDesigner(');
const pyEnd = py.indexOf('async compileUiFiles(', pyStart);
assert(pyStart >= 0 && pyEnd > pyStart, 'PySide6 Designer implementation must exist');
const pyBlock = py.slice(pyStart, pyEnd);
assert(pyBlock.includes("windowsHide: process.platform === 'win32'"), 'PySide6 Designer must keep Windows console suppression');
assert(pyBlock.includes("detached: process.platform !== 'win32'"), 'PySide6 Windows launcher must stay non-detached');

const emitted = fs.readFileSync(path.join(root, 'out', 'services', 'qpmQtProjectService.js'), 'utf8');
assert(emitted.includes('windowsHide: false'), 'Emitted C++ runtime must contain restored Designer launch semantics');

console.log('QPM 0.17.7 validated pre-Python C++ Designer launch regression tests: PASS');
