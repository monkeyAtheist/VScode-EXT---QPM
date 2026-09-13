'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');

const cppSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtProjectService.ts'), 'utf8');
assert(cppSource.includes('await spawnDesigner(installation, target, this.output, pluginRoots);'), 'C++ .ui files must keep the validated direct Designer launcher while allowing project-local widget plugin roots');
assert(cppSource.includes('spawn(executable, [target]'), 'C++ Designer must receive the .ui path directly on its command line');
assert(cppSource.includes('windowsHide: false'), 'C++ Designer must use the exact validated 0.10.0 Windows launch flag');
assert(!cppSource.includes("spawn(executable, ['--server']"), 'C++ Designer server mode must stay disabled after rollback');
assert(!cppSource.includes('Recovery-safe fallback'), 'C++ .ui opening must not redirect to Qt Creator');
assert(!cppSource.includes('standaloneDesignerRecoveryPending'), 'C++ launcher must not intercept Designer recovery state');
assert(!cppSource.includes("import * as net from 'net';"), 'C++ Designer launcher must not require the server TCP channel');

const cppRuntime = fs.readFileSync(path.join(root, 'out', 'services', 'qpmQtProjectService.js'), 'utf8');
assert(cppRuntime.includes('spawn)(executable, [target]') || cppRuntime.includes('spawn(executable, [target]'), 'Emitted C++ runtime must launch Designer directly');
assert(!cppRuntime.includes("['--server']"), 'Emitted C++ runtime must not use Designer server mode');
assert(!cppRuntime.includes('Recovery-safe fallback'), 'Emitted C++ runtime must not use Qt Creator fallback');

const pythonSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtPythonService.ts'), 'utf8');
assert(pythonSource.includes('pyside6-designer'), 'PySide6 Designer support must remain present');
assert(pythonSource.includes("windowsHide: process.platform === 'win32'"), 'PySide6 Designer must remain console-less on Windows');

console.log('QPM 0.17.7 direct C++ Designer rollback and PySide6 isolation tests: PASS');
