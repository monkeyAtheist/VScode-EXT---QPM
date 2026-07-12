'use strict';
const assert = require('assert');
const Module = require('module');

const vscodeMock = {
  workspace: { getConfiguration: () => ({ get: (_k, fallback) => fallback }), workspaceFolders: [] },
  window: {},
  Uri: { file: (fsPath) => ({ fsPath }) },
  extensions: { getExtension: () => undefined },
  commands: { executeCommand: async () => undefined },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { commonAncestorDirectory } = require('../out/services/qpmCppToolsService.js');
  assert.strictEqual(
    commonAncestorDirectory([
      'C:\\Users\\jerry\\Downloads\\QTtest\\QtWidgetsApp',
      'C:\\Users\\jerry\\Downloads\\QTtest\\QtWidgetsApp\\src',
      'C:\\Users\\jerry\\Downloads\\QTtest\\QtWidgetsApp\\include'
    ]),
    'C:\\Users\\jerry\\Downloads\\QTtest\\QtWidgetsApp'
  );
  assert.strictEqual(
    commonAncestorDirectory([
      'C:/Users/jerry/Downloads/QTtest/QtWidgetsApp',
      'C:/Users/jerry/Downloads/QTtest/QtWidgetsApp/src'
    ]),
    'C:\\Users\\jerry\\Downloads\\QTtest\\QtWidgetsApp'
  );
  assert.strictEqual(
    commonAncestorDirectory(['/tmp/QtWidgetsApp', '/tmp/QtWidgetsApp/src', '/tmp/QtWidgetsApp/include']),
    '/tmp/QtWidgetsApp'
  );
  console.log('QPM 0.2.4 IntelliSense root resolution tests: PASS');
} finally {
  Module._load = originalLoad;
}
