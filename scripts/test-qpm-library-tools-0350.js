const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const commands = new Set((pkg.contributes?.commands || []).map((item) => item.command));
for (const id of [
  'qpm.generateImportLibraryFromHeaders',
  'qpm.generateImportLibraryFromDll',
  'qpm.extractDllDefinitionFile',
  'qpm.openImportLibraryReport',
  'qpm.analyzeDll',
  'qpm.analyzeLibrary'
]) assert(commands.has(id), `missing command contribution ${id}`);

const treeMenus = pkg.contributes?.menus?.['view/item/context'] || [];
const menuText = JSON.stringify(treeMenus);
for (const id of ['qpm.generateImportLibraryFromHeaders','qpm.generateImportLibraryFromDll','qpm.extractDllDefinitionFile','qpm.analyzeDll','qpm.analyzeLibrary']) {
  assert(menuText.includes(id), `missing context menu ${id}`);
}

const settingsTs = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
assert(settingsTs.includes("id: 'libraries'"), 'Libraries settings page missing');
assert(settingsTs.includes('Windows import-library generation'), 'import-library settings section missing');
assert(settingsTs.includes('DLL / .lib / .a analyzers'), 'analyzer settings section missing');
assert(settingsTs.includes("manifest.kind === 'static-library'"), 'static format selector is not target-contextual');
assert(settingsTs.includes("manifest.kind === 'shared-library'"), 'DLL format selector is not target-contextual');

const buildTs = fs.readFileSync(path.join(root, 'src/services/qpmBuildService.ts'), 'utf8');
for (const token of ['gnu-dll-a','gnu-a-windows-lib','windowsImportLibraryPath','generateBuiltDllImportLibrary']) {
  assert(buildTs.includes(token), `build integration token missing: ${token}`);
}

const manifestTs = fs.readFileSync(path.join(root, 'src/model/qtProjectManifest.ts'), 'utf8');
assert(manifestTs.includes('QT_PROJECT_SCHEMA_VERSION = 20'), 'Qt manifest schema is not v20');
assert(manifestTs.includes('staticLibraryFormat'), 'static library format not persisted');
assert(manifestTs.includes('dllImportLibraryFormat'), 'DLL import format not persisted');

const importLib = require(path.join(root, 'out/services/qpmImportLibraryService.js'));
const dllAnalyzer = require(path.join(root, 'out/services/qpmDllAnalyzerService.js'));
const archiveAnalyzer = require(path.join(root, 'out/services/qpmLibraryAnalyzerService.js'));

const header = `
extern "C" int api_open(void);
int api_close(int code);
static int helper(void);
class Device { public: int method(); };
`;
const headerResult = importLib.collectHeaderImportSymbols(header, 'device.hpp');
assert.deepStrictEqual(headerResult.symbols.map((s) => s.name).sort(), ['api_close','api_open']);

function makePe64Dll(file) {
  const b = Buffer.alloc(0x800, 0);
  b.write('MZ', 0, 'ascii');
  b.writeUInt32LE(0x80, 0x3c);
  b.write('PE\0\0', 0x80, 'ascii');
  const fh = 0x84;
  b.writeUInt16LE(0x8664, fh + 0); // AMD64
  b.writeUInt16LE(1, fh + 2);      // one section
  b.writeUInt32LE(1700000000, fh + 4);
  b.writeUInt16LE(0xF0, fh + 16);  // optional header size
  b.writeUInt16LE(0x2022, fh + 18);
  const oh = 0x98;
  b.writeUInt16LE(0x20b, oh);      // PE32+
  b.writeUInt32LE(0x1200, oh + 16); // entry
  b.writeBigUInt64LE(0x140000000n, oh + 24);
  b.writeUInt32LE(0x2000, oh + 56); // size image
  b.writeUInt32LE(0x400, oh + 60);  // headers
  b.writeUInt16LE(3, oh + 68);      // console subsystem
  b.writeUInt32LE(16, oh + 108);    // data directories
  b.writeUInt32LE(0x1000, oh + 112); // export RVA
  b.writeUInt32LE(0x100, oh + 116);  // export size
  const sh = oh + 0xF0;
  b.write('.edata\0\0', sh, 'ascii');
  b.writeUInt32LE(0x200, sh + 8);
  b.writeUInt32LE(0x1000, sh + 12);
  b.writeUInt32LE(0x200, sh + 16);
  b.writeUInt32LE(0x400, sh + 20);
  b.writeUInt32LE(0x40000040, sh + 36);
  const ed = 0x400;
  b.writeUInt32LE(0x1050, ed + 12); // dll name
  b.writeUInt32LE(1, ed + 16);      // ordinal base
  b.writeUInt32LE(2, ed + 20);      // functions
  b.writeUInt32LE(1, ed + 24);      // names
  b.writeUInt32LE(0x1060, ed + 28); // funcs
  b.writeUInt32LE(0x1070, ed + 32); // names
  b.writeUInt32LE(0x1080, ed + 36); // ordinals
  b.write('qpmtest.dll\0', 0x450, 'ascii');
  b.writeUInt32LE(0x1200, 0x460);
  b.writeUInt32LE(0x1210, 0x464);   // ordinal-only export
  b.writeUInt32LE(0x1090, 0x470);
  b.writeUInt16LE(0, 0x480);
  b.write('QpmExport\0', 0x490, 'ascii');
  fs.writeFileSync(file, b);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-libtools-'));
const dllPath = path.join(tmp, 'qpmtest.dll');
makePe64Dll(dllPath);
const pe = importLib.parsePeExports(fs.readFileSync(dllPath));
assert.strictEqual(pe.architecture, 'x64');
assert.strictEqual(pe.dllName, 'qpmtest.dll');
assert.strictEqual(pe.symbols[0].name, 'QpmExport');
assert.strictEqual(pe.ordinalOnlyCount, 1);
const dll = dllAnalyzer.analyzeDllFile(dllPath);
assert.strictEqual(dll.architecture, 'x64');
assert.strictEqual(dll.peFormat, 'PE32+');
assert(dll.exports.some((s) => s.name === 'QpmExport'));
const def = importLib.renderModuleDefinition('qpmtest.dll', pe.symbols);
assert(def.includes('LIBRARY "qpmtest.dll"'));
assert(def.includes('QpmExport'));
const inv = importLib.buildImportLibraryInvocation({ kind:'gnu-dlltool', executable:'dlltool' }, path.join(tmp,'qpmtest.def'), path.join(tmp,'qpmtest.lib'), 'qpmtest.dll', 'x64');
assert(inv.args.includes('-d') && inv.args.includes('-l') && inv.args.includes('-D'));

const gcc = cp.spawnSync('bash', ['-lc', 'command -v gcc && command -v ar'], { encoding:'utf8' });
if (gcc.status === 0) {
  const c = path.join(tmp, 'test.c');
  const o = path.join(tmp, 'test.o');
  const a = path.join(tmp, 'libqpmtest.a');
  fs.writeFileSync(c, 'int qpm_add(int a,int b){return a+b;}\n');
  cp.execFileSync('gcc', ['-c', c, '-o', o]);
  cp.execFileSync('ar', ['rcs', a, o]);
  const archive = archiveAnalyzer.analyzeLibraryFile(a);
  assert.strictEqual(archive.libraryKind, 'static');
  assert(archive.memberCount >= 1);
  assert(archive.symbols.some((s) => s.includes('qpm_add')));
}

fs.rmSync(tmp, { recursive:true, force:true });
console.log('QPM 0.35.0 library tooling regression: PASS');
