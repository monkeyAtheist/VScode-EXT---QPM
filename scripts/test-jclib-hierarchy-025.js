'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const compiledPath = path.join(root, 'out', 'jcLibEmbedded.js');
let code = fs.readFileSync(compiledPath, 'utf8');
code += '\nmodule.exports.__qpmJcTest = { normalizeEnvironments, createPackTemplate, buildStarterPackSelection, EMBEDDED_JCLIB_VERSION };\n';

class TreeItem {}
class EventEmitter { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} }
class ThemeIcon { constructor(id) { this.id = id; } }
class MarkdownString { appendMarkdown() { return this; } appendCodeblock() { return this; } }
class SnippetString { constructor(value = '') { this.value = value; } appendText(value) { this.value += value; return this; } appendPlaceholder(value) { this.value += typeof value === 'string' ? value : ''; return this; } }
const vscodeMock = new Proxy({ TreeItem, EventEmitter, ThemeIcon, MarkdownString, SnippetString }, {
  get(target, property) {
    if (property in target) return target[property];
    if (property === 'Uri') return { file: (value) => ({ fsPath: value }), joinPath: (...parts) => ({ fsPath: path.join(...parts.map((part) => part.fsPath || String(part))) }) };
    return new Proxy(function () {}, { get: () => function () {}, apply: () => undefined, construct: () => ({}) });
  }
});

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

let api;
try {
  const runtimeModule = new Module(compiledPath, module);
  runtimeModule.filename = compiledPath;
  runtimeModule.paths = Module._nodeModulePaths(path.dirname(compiledPath));
  runtimeModule._compile(code, compiledPath);
  api = runtimeModule.exports.__qpmJcTest;
} finally {
  Module._load = originalLoad;
}

assert(api, 'embedded JC Lib internal test API must load');
assert.strictEqual(api.EMBEDDED_JCLIB_VERSION, '0.8.27');
assert.deepStrictEqual(api.createPackTemplate('Empty', 'cpp', false).environments, [], 'new packs must start empty');
assert.deepStrictEqual(api.normalizeEnvironments([], undefined), [], 'explicitly empty environments must stay empty');
assert.deepStrictEqual(api.normalizeEnvironments(undefined, []), [], 'missing environments without legacy libraries must stay empty');
const legacy = api.normalizeEnvironments(undefined, [{ name: 'Legacy', categories: [] }]);
assert.strictEqual(legacy.length, 1);
assert.strictEqual(legacy[0].name, 'General');

const expectations = {
  c_all: ['C', ['C Language', 'C DLL Helpers']],
  cpp_all: ['C++', ['C++ Language', 'C++ DLL Helpers']],
  preprocessor_core: ['C / C++ Preprocessor', ['C/C++ Preprocessor']],
  qt_all: ['QT', ['Qt Language', 'Qt QML', 'Qt Multimedia', 'Qt SQL & Test', 'Qt for Python (PySide6)']],
  windows_all: ['Windows API / Devices', ['User32', 'WinMM', 'Serial Ports']],
  python_core: ['Python', ['Python Language']]
};

for (const [selectionId, [expectedEnvironment, expectedLibraries]] of Object.entries(expectations)) {
  const selection = api.buildStarterPackSelection(selectionId);
  assert(selection.entries.length > 0, `${selectionId} must resolve to content`);
  assert.strictEqual(selection.preserveEnvironments, true, `${selectionId} must preserve its environment`);
  const environments = new Set(selection.entries.map((entry) => entry.environment));
  assert.deepStrictEqual([...environments], [expectedEnvironment], `${selectionId} root environment mismatch`);
  const libraries = new Set(selection.entries.map((entry) => entry.library));
  for (const library of expectedLibraries) assert(libraries.has(library), `${selectionId} missing ${library}`);
}


const sourceText = fs.readFileSync(path.join(root, 'src', 'jcLibEmbedded.ts'), 'utf8');
const familyStart = sourceText.indexOf('async function chooseGroupedStarterPack');
const familyEnd = sourceText.indexOf('async function importLanguageStarterIntoPackFile');
const familySection = sourceText.slice(familyStart, familyEnd);
const removedFamilies = ['CVI', 'SDL', 'Java', 'C#', 'Kotlin', 'VBA', 'Lua', 'Assembly'];
for (const family of removedFamilies) {
  assert(!familySection.includes(`{ label: '${family} pack'`), `${family} must not be exposed as a QPM starter-pack family`);
}

const canonicalDataRoots = {
  'build_pack.json': 'Build & Toolchains',
  'c_language_pack.json': 'C',
  'cpp_language_pack.json': 'C++',
  'database_pack.json': 'Databases',
  'embedded_language_pack.json': 'Embedded',
  'opencv_pack.json': 'OpenCV',
  'php_language_pack.json': 'PHP',
  'python_pack.json': 'Python',
  'qpm_base_preprocessor_pack.json': 'C / C++ Preprocessor',
  'qt_pack.json': 'QT',
  'qt_python_pack.json': 'QT',
  'system_scripting_pack.json': 'Scripting / System',
  'typescript_language_pack.json': 'TypeScript',
  'web_language_pack.json': 'Web',
  'windows_api_device_pack.json': 'Windows API / Devices'
};

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

const actualJsonFiles = fs.readdirSync(path.join(root, 'data'))
  .filter((name) => name.endsWith('.json') && name !== 'qt_instrument_profile_catalog.json')
  .sort();
assert.deepStrictEqual(actualJsonFiles, Object.keys(canonicalDataRoots).sort(), 'QPM data directory must contain only the curated JC Lib pack set plus the Qt instrument catalog');

for (const [fileName, expectedRoot] of Object.entries(canonicalDataRoots)) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', fileName), 'utf8'));
  assert.strictEqual(data.environments.length, 1, `${fileName} must have one root environment`);
  const environment = data.environments[0];
  assert.strictEqual(environment.name, expectedRoot, `${fileName} root mismatch`);
  const names = (environment.libraries || []).map((library) => library.name);
  assert.strictEqual(new Set(names).size, names.length, `${fileName} must not duplicate root libraries`);
  for (const library of environment.libraries || []) {
    for (const category of library.categories || []) {
      for (const entry of walkFunctions(category)) {
        assert.strictEqual(entry.environment, environment.name, `${fileName}/${entry.name} environment metadata`);
        assert.strictEqual(entry.library, library.name, `${fileName}/${entry.name} library metadata`);
        assert.strictEqual(entry.category, category.name, `${fileName}/${entry.name} category metadata`);
      }
    }
  }
}

console.log('QPM 0.34.0 curated embedded JC Lib hierarchy tests: PASS');
