const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const expected = {
  'c_language_pack.json': ['c_language_pack', '2.2.0'],
  'cpp_language_pack.json': ['jclib.cpp.language', '3.2.0'],
  'system_scripting_pack.json': ['scripting-system-pack', '1.12.0'],
  'qt_pack.json': ['qt-cpp-complete-pack', '2.0.0']
};
for (const [file, [id, version]] of Object.entries(expected)) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
  assert.strictEqual(data.id, id, file + ' id');
  assert.strictEqual(data.version, version, file + ' version');
}

function allFunctions(pack) {
  const result = [];
  function visitGroup(environment, library, category, group) {
    for (const fn of group.functions || []) result.push({environment, library, category, fn});
    for (const child of group.groups || []) visitGroup(environment, library, category, child);
  }
  for (const env of pack.environments || []) {
    for (const lib of env.libraries || []) {
      for (const cat of lib.categories || []) {
        for (const fn of cat.functions || []) result.push({environment: env.name, library: lib.name, category: cat.name, fn});
        for (const group of cat.groups || []) visitGroup(env.name, lib.name, cat.name, group);
      }
    }
  }
  return result;
}
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const cFns = allFunctions(load('c_language_pack.json'));
const cppFns = allFunctions(load('cpp_language_pack.json'));
const scriptFns = allFunctions(load('system_scripting_pack.json'));
const qtFns = allFunctions(load('qt_pack.json'));

const cAlloc = cFns.find(x => x.fn.name === 'malloc typed pointer allocation').fn;
const cppAlloc = cppFns.find(x => x.fn.name === 'std::malloc typed pointer allocation (C interop)').fn;
assert(cAlloc.parameters.some(p => p.insertValueMap), 'C allocation must use insertValueMap');
assert(cppAlloc.parameters.some(p => p.insertValueMap), 'C++ allocation must use insertValueMap');
const gitPush = scriptFns.find(x => x.fn.name === 'git push').fn;
const gitFlags = gitPush.parameters.find(p => p.name === 'flags');
assert(gitFlags.options.some(o => (typeof o === 'string' ? o : o.value) === '-u'), 'git push must expose -u');
assert.strictEqual(gitFlags.pickerConfig.allowEmptySelection, true, 'git flags must allow empty selection');
assert(qtFns.some(x => x.fn.name.includes('QRangeModelAdapter')), 'Qt 6.11 QRangeModelAdapter card missing');
assert(qtFns.some(x => x.fn.name.includes('QRestAccessManager')), 'Qt REST card missing');
assert(qtFns.some(x => x.fn.name.includes('pragma ComponentBehavior Bound')), 'modern QML card missing');

// Execute the actual generated embedded engine and expose its internal helpers only in this VM.
const runtime = fs.readFileSync(path.join(root, 'out', 'jcLibEmbedded.js'), 'utf8') +
  '\nmodule.exports.__apply = applyParameterizedInsertTemplate;' +
  '\nmodule.exports.__normalizePicker = normalizeStructuredPickerConfig;';
class DummyTreeItem {}
class DummyEventEmitter { constructor(){ this.event = () => ({dispose(){}}); } fire(){} dispose(){} }
class DummyThemeIcon { constructor(id){ this.id = id; } }
const vscode = new Proxy({
  TreeItem: DummyTreeItem,
  EventEmitter: DummyEventEmitter,
  ThemeIcon: DummyThemeIcon,
  TreeItemCollapsibleState: {None:0, Collapsed:1, Expanded:2},
  Uri: {joinPath(){ return {}; }, file(){ return {}; }},
  ViewColumn: {Active:1, Beside:2}
}, {get(target, prop){ if (prop in target) return target[prop]; return new Proxy(function(){}, {get(){ return new Proxy(function(){},{get(){return undefined;}}); }, apply(){ return undefined; }, construct(){ return {}; }}); }});
const moduleObj = {exports:{}};
const sandbox = {
  module: moduleObj,
  exports: moduleObj.exports,
  require(name){ if (name === 'vscode') return vscode; return require(name); },
  __dirname: path.join(root, 'out'), __filename: path.join(root, 'out', 'jcLibEmbedded.js'),
  console, process, Buffer, setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder
};
vm.runInNewContext(runtime, sandbox, {filename: 'jcLibEmbedded.js'});
const apply = moduleObj.exports.__apply;
const normalizePicker = moduleObj.exports.__normalizePicker;
assert.strictEqual(typeof apply, 'function');

function valuesFor(fn, overrides) {
  return (fn.parameters || []).map(p => Object.prototype.hasOwnProperty.call(overrides, p.name) ? overrides[p.name] : String(p.defaultValue ?? ''));
}
const cGenerated = apply(cAlloc, valuesFor(cAlloc, {variable:'buffer', baseType:'char', pointerDepth:'3', size:'taille', allocationMode:'declaration', castStyle:'explicit'}));
assert.strictEqual(cGenerated, 'char*** buffer = (char***)malloc(sizeof *buffer * (taille));');
const cppGenerated = apply(cppAlloc, valuesFor(cppAlloc, {variable:'buffer', baseType:'char', pointerDepth:'4', size:'taille', allocationMode:'declaration'}));
assert.strictEqual(cppGenerated, 'char**** buffer = static_cast<char****>(std::malloc(sizeof *buffer * (taille)));');
const normalized = normalizePicker(gitFlags.pickerConfig, 'Git flags');
assert.strictEqual(normalized.allowEmptySelection, true);

const sourceText = fs.readFileSync(path.join(root, 'src', 'jcLibEmbedded.ts'), 'utf8');
assert(sourceText.includes("const EMBEDDED_JCLIB_VERSION = '0.8.38';"));
assert(sourceText.includes("case 'qt_cpp_core':"));
assert(sourceText.includes("case 'qt_multimedia_core':"));
assert(sourceText.includes("case 'qt_sql_test_core':"));
assert.strictEqual((sourceText.match(/case 'qt_all':/g) || []).length, 1, 'qt_all duplicate case');

console.log('QPM embedded JC Lib 0.8.38 synchronization: OK');
console.log('C allocation:', cGenerated);
console.log('C++ allocation:', cppGenerated);
console.log('Git push -u + empty multiselect: OK');
console.log('Qt 2.0.0 modern API cards: OK');
