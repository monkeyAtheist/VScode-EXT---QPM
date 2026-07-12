'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function makeExecutable(filePath, target, version = '13.1.0') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `#!/bin/sh\nif [ "$1" = "-dumpmachine" ]; then echo "${target}"; exit 0; fi\nif [ "$1" = "-dumpfullversion" ]; then echo "${version}"; exit 0; fi\nexit 0\n`, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function touch(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qt-toolchain-'));
const oldCompiler = path.join(root, 'Legacy', 'mingw32', 'bin', 'g++');
makeExecutable(oldCompiler, 'mingw32', '6.3.0');
const settings = {
  cppCompilerPath: oldCompiler,
  cCompilerPath: '',
  archiverPath: '',
  debuggerPath: '',
  qtCompilerPath: '',
  qtSearchPaths: []
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({
          get: (key, fallback) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback,
          update: async (key, value) => { settings[key] = value; }
        })
      },
      ConfigurationTarget: { Global: 1, Workspace: 2 },
      window: {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const qtRoot = path.join(root, 'Qt', 'Qt6.11.0', '6.11.0', 'mingw_64');
  for (const tool of ['qmake', 'moc', 'uic', 'rcc']) touch(path.join(qtRoot, 'bin', tool));
  fs.mkdirSync(path.join(qtRoot, 'include'), { recursive: true });
  fs.mkdirSync(path.join(qtRoot, 'lib'), { recursive: true });

  const qtToolBin = path.join(root, 'Qt', 'Qt6.11.0', 'Tools', 'mingw1310_64', 'bin');
  makeExecutable(path.join(qtToolBin, 'g++'), 'x86_64-w64-mingw32');
  makeExecutable(path.join(qtToolBin, 'gcc'), 'x86_64-w64-mingw32');
  for (const name of ['ar', 'gdb', 'mingw32-make']) touch(path.join(qtToolBin, name));

  const service = require('../out/services/qpmQtInstallationService');
  const installation = service.describeQtRoot(qtRoot);
  assert(installation, 'nested Qt kit must be detected');
  assert.strictEqual(installation.version, '6.11.0');
  assert.strictEqual(installation.architecture, 'x64');
  assert.strictEqual(installation.toolchain.source, 'qt-tools', 'Qt Tools compiler must take priority over stale generic compiler settings');
  assert.strictEqual(installation.toolchain.compatibility, 'compatible');
  assert.strictEqual(installation.toolchain.detectedArchitecture, 'x64');
  assert.strictEqual(installation.toolchain.targetTriple, 'x86_64-w64-mingw32');
  assert(installation.toolchain.cppCompilerPath.endsWith(path.join('mingw1310_64', 'bin', 'g++')));
  assert.notStrictEqual(path.resolve(installation.toolchain.cppCompilerPath), path.resolve(oldCompiler));

  fs.rmSync(qtToolBin, { recursive: true, force: true });
  settings.qtCompilerPath = oldCompiler;
  const incompatible = service.describeQtRoot(qtRoot);
  assert(incompatible, 'Qt kit must still be described when compiler is incompatible');
  assert.strictEqual(incompatible.toolchain.compatibility, 'incompatible');
  assert.strictEqual(incompatible.toolchain.detectedArchitecture, 'x86');
  assert(/architecture mismatch/i.test(incompatible.toolchain.diagnostic));

  console.log('QPM 0.2.2 Qt toolchain resolution tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(root, { recursive: true, force: true });
}
