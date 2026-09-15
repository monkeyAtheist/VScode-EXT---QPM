'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const specs = [
  ['c_language_pack.json', 'c_language_pack', 'C'],
  ['cpp_language_pack.json', 'jclib.cpp.language', 'C++'],
  ['qpm_base_preprocessor_pack.json', 'qpm.base.preprocessor', 'C / C++ Preprocessor'],
  ['opencv_pack.json', 'opencv_cpp_structured_pack', 'OpenCV'],
  ['build_pack.json', 'build-toolchains-structured-pack', 'Build & Toolchains'],
  ['windows_api_device_pack.json', 'windows-api-device-pack', 'Windows API / Devices'],
  ['system_scripting_pack.json', 'scripting-system-pack', 'Scripting / System'],
  ['python_pack.json', 'python_structured_complete_pack', 'Python'],
  ['web_language_pack.json', 'javascript-html-css-audit-pack', 'Web'],
  ['typescript_language_pack.json', 'typescript-language-pack-audit-v1', 'TypeScript'],
  ['database_pack.json', 'database_pack', 'Databases'],
  ['php_language_pack.json', 'php_structured_complete_pack', 'PHP'],
  ['embedded_language_pack.json', 'embedded_systems_pack', 'Embedded'],
  ['qt_pack.json', 'qt-cpp-complete-pack', 'QT'],
  ['qt_python_pack.json', 'qt-python-pyside6-complete', 'QT']
];

function walkFunctions(category) {
  const result = [...(category.functions || [])];
  const visit = (groups) => {
    for (const group of groups || []) {
      result.push(...(group.functions || []));
      visit(group.groups || []);
    }
  };
  visit(category.groups || []);
  return result;
}

for (const [fileName, id, environmentName] of specs) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', fileName), 'utf8'));
  assert.strictEqual(data.id, id, `${fileName} id`);
  assert.strictEqual(typeof data.readOnly, 'boolean', `${fileName} must declare its readOnly policy`);
  assert.strictEqual(data.environments.length, 1, `${fileName} must have one root`);
  const environment = data.environments[0];
  assert.strictEqual(environment.name, environmentName, `${fileName} root`);
  const names = environment.libraries.map((library) => library.name);
  assert.strictEqual(new Set(names).size, names.length, `${fileName} duplicate libraries`);
  assert(names.length > 0, `${fileName} must expose at least one library`);
  for (const library of environment.libraries) {
    for (const category of library.categories || []) {
      for (const entry of walkFunctions(category)) {
        assert.strictEqual(entry.environment, environment.name, `${fileName}/${entry.name} environment metadata`);
        assert.strictEqual(entry.library, library.name, `${fileName}/${entry.name} library metadata`);
        assert.strictEqual(entry.category, category.name, `${fileName}/${entry.name} category metadata`);
      }
    }
  }
}

// Exercise the real compiled migration service against temporary extension/global folders.
const servicePath = path.join(root, 'out', 'services', 'qpmLibraryPackService.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-jclib-025-'));
const extensionPath = path.join(temp, 'extension');
const storagePath = path.join(temp, 'storage');
fs.mkdirSync(path.join(extensionPath, 'data'), { recursive: true });
for (const [fileName] of specs) fs.copyFileSync(path.join(root, 'data', fileName), path.join(extensionPath, 'data', fileName));
fs.mkdirSync(path.join(storagePath, 'packs'), { recursive: true });
fs.writeFileSync(path.join(storagePath, 'packs', 'qpm_core_pack.json'), JSON.stringify({ id: 'qpm-c-cpp-core-pack', name: 'Qt Project Manager Core Library Pack', version: '0.1.5', environments: [] }));
for (const legacy of ['qpm_base_qt_pack.json', 'qpm_base_c_pack.json', 'qpm_base_cpp_pack.json', 'qpm_base_windows_pack.json', 'qpm_base_python_pack.json']) {
  fs.writeFileSync(path.join(storagePath, 'packs', legacy), JSON.stringify({ id: `legacy.${legacy}`, version: '0.2.5', environments: [] }));
}

const vscodeMock = {
  Uri: {
    joinPath(base, ...parts) { return { fsPath: path.join(base.fsPath, ...parts) }; }
  }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};
try {
  const service = require(servicePath);
  const lines = [];
  service.ensureBundledCppLibraryPack(
    { extensionUri: { fsPath: extensionPath }, globalStorageUri: { fsPath: storagePath } },
    { appendLine(line) { lines.push(line); } }
  );
  assert.strictEqual(service.QPM_BUNDLED_LIBRARY_PACKS.length, 15);
  assert(!fs.existsSync(path.join(storagePath, 'packs', 'qpm_core_pack.json')), 'legacy combined pack must be removed');
  for (const [fileName] of specs) assert(fs.existsSync(path.join(storagePath, 'packs', fileName)), `${fileName} must be installed`);
  for (const legacy of ['qpm_base_qt_pack.json', 'qpm_base_c_pack.json', 'qpm_base_cpp_pack.json', 'qpm_base_windows_pack.json', 'qpm_base_python_pack.json']) {
    assert(!fs.existsSync(path.join(storagePath, 'packs', legacy)), `${legacy} must be migrated away`);
  }
  const backups = fs.readdirSync(path.join(storagePath, 'packs', 'backups'));
  assert(backups.some((name) => name.startsWith('qpm_core_pack.backup-')), 'legacy combined pack must be backed up');
  assert(backups.length >= 6, 'legacy combined and deprecated integrated packs must be backed up');
  assert(lines.some((line) => line.includes('Curated integrated packs:')), 'migration summary must describe the curated pack set');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('QPM 0.34.3 curated integrated pack and migration tests: PASS');
