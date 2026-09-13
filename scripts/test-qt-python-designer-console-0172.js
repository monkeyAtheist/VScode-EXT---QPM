'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const source = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtPythonService.ts'), 'utf8');
const start = source.indexOf('async openDesigner(');
const end = source.indexOf('async compileUiFiles(', start);
assert(start >= 0 && end > start, 'Qt for Python openDesigner implementation must exist');
const block = source.slice(start, end);
assert(block.includes("windowsHide: process.platform === 'win32'"), 'PySide6 Designer must hide the Windows console launcher');
assert(block.includes("detached: process.platform !== 'win32'"), 'PySide6 Designer must not request a detached Windows console');
assert(block.includes("shell: false"), 'PySide6 Designer must be spawned directly without a command shell');
assert(block.includes("stdio: 'ignore'"), 'PySide6 Designer must not inherit the extension-host console streams');
assert(block.includes("child.once('error'"), 'PySide6 Designer launcher must report spawn errors');

const emitted = fs.readFileSync(path.join(root, 'out', 'services', 'qpmQtPythonService.js'), 'utf8');
assert(emitted.includes("windowsHide: process.platform === 'win32'"), 'Emitted runtime must contain Windows console suppression');
assert(emitted.includes("detached: process.platform !== 'win32'"), 'Emitted runtime must avoid detached Windows console creation');
assert(emitted.includes('shell: false'), 'Emitted runtime must disable shell spawning');

console.log('QPM 0.17.4 PySide6 Designer Windows console suppression tests: PASS');
