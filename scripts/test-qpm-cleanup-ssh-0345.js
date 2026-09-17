'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const decode = (codes) => String.fromCharCode(...codes);
const retiredA = decode([77,80,84]);
const retiredB = decode([72,78,70]);
const retiredC = decode([84,78,84,95,69,88,69,67]);

const compiled = path.join(root, 'out', 'services', 'qpmLibraryPackService.js');
let code = fs.readFileSync(compiled, 'utf8');
code += '\nmodule.exports.__qpm0345 = { purgeRetiredGlobalPackStorage, isRetiredCatalogIdentifier };\n';

const vscodeMock = { Uri: { joinPath(base, ...parts) { return { fsPath: path.join(base.fsPath || String(base), ...parts) }; } } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};
let api;
try {
  const m = new Module(compiled, module);
  m.filename = compiled;
  m.paths = Module._nodeModulePaths(path.dirname(compiled));
  m._compile(code, compiled);
  api = m.exports.__qpm0345;
} finally {
  Module._load = originalLoad;
}
assert(api && typeof api.purgeRetiredGlobalPackStorage === 'function');
assert(api.isRetiredCatalogIdentifier(retiredA + 'Lua'));
assert(api.isRetiredCatalogIdentifier(retiredB + '_Sequenceur'));
assert(api.isRetiredCatalogIdentifier(retiredC));
assert(!api.isRetiredCatalogIdentifier('Lua standard 5.4'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm0345-cleanup-'));
const packs = path.join(temp, 'packs');
const backups = path.join(packs, 'backups');
fs.mkdirSync(backups, { recursive: true });
fs.writeFileSync(path.join(packs, 'lua_pack.json'), JSON.stringify({
  id: 'lua-pack', name: 'Lua', environments: [{ name: 'Lua', libraries: [
    { name: 'Lua standard 5.4', categories: [] },
    { name: retiredA + ' Studio', categories: [] }
  ] }]
}, null, 2));
fs.writeFileSync(path.join(packs, 'legacy.json'), JSON.stringify({ id: retiredC, name: 'Legacy', environments: [] }));
fs.writeFileSync(path.join(backups, 'mixed.backup.json'), JSON.stringify({ id: 'mixed', name: 'Backup', environments: [{ name: 'C', libraries: [{ name: retiredB + '_Tool', categories: [] }] }] }));
const log = [];
const stats = api.purgeRetiredGlobalPackStorage(packs, { appendLine(line) { log.push(line); } });
assert.strictEqual(fs.existsSync(path.join(packs, 'legacy.json')), false, 'dedicated retired pack must be deleted');
assert.strictEqual(fs.existsSync(path.join(backups, 'mixed.backup.json')), false, 'retired backup must be deleted');
const cleaned = JSON.parse(fs.readFileSync(path.join(packs, 'lua_pack.json'), 'utf8'));
assert.deepStrictEqual(cleaned.environments[0].libraries.map((x) => x.name), ['Lua standard 5.4']);
assert(stats.deletedFiles >= 2);
assert(stats.removedLibraries >= 1);
fs.rmSync(temp, { recursive: true, force: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(/^0\.34\.(?:[5-9]|[1-9]\d+)$/.test(pkg.version), `expected QPM >= 0.34.5, got ${pkg.version}`);
assert(pkg.activationEvents.includes('onCommand:qpm.openSshDeviceManager'));
assert(pkg.contributes.commands.some((x) => x.command === 'qpm.openSshDeviceManager'));
assert((pkg.contributes.menus['view/title'] || []).some((x) => x.command === 'qpm.openSshDeviceManager' && x.when === 'view == qpm.platforms'));
const extSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const sshSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmSshDeviceManager.ts'), 'utf8');
const platformSource = fs.readFileSync(path.join(root, 'src', 'providers', 'qpmQtPlatformProvider.ts'), 'utf8');
assert(extSource.includes("register('qpm.openSshDeviceManager'"));
assert(sshSource.includes('OpenSSH Device Manager'));
for (const capability of ['saveAlias', 'deleteAlias', 'connect', 'inspect', 'testKey', 'generateKey', 'enrollKey']) assert(sshSource.includes(capability));
assert(platformSource.includes("command:'qpm.openSshDeviceManager'"));


const sshCompiled = path.join(root, 'out', 'services', 'qpmSshDeviceManager.js');
let sshCode = fs.readFileSync(sshCompiled, 'utf8');
sshCode += '\nmodule.exports.__renderSsh = renderSshDeviceManagerHtml;\n';
const sshModule = new Module(sshCompiled, module);
sshModule.filename = sshCompiled;
sshModule.paths = Module._nodeModulePaths(path.dirname(sshCompiled));
const savedLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { ViewColumn: { Active: 1 } };
  return savedLoad.call(this, request, parent, isMain);
};
try { sshModule._compile(sshCode, sshCompiled); } finally { Module._load = savedLoad; }
const sshHtml = sshModule.exports.__renderSsh({ configPath: 'C:/Users/test/.ssh/config', aliases: [], hosts: [], neighbors: [] });
const scriptMatches = [...sshHtml.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert(scriptMatches.length > 0, 'SSH manager must render a script block');
for (const match of scriptMatches) new Function(match[1]);

const cPack = JSON.parse(fs.readFileSync(path.join(root, 'data', 'c_language_pack.json'), 'utf8'));
assert.strictEqual(cPack.version, '2.2.0');

const scanRoots = ['src', 'out', 'data', 'docs', 'README.md', 'CHANGELOG.md'];
function containsRetiredSemanticIdentifier(text) {
  const upper = String(text || '').toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  const compact = tokens.join('');
  return tokens.some((token) => token === retiredA || token.startsWith(retiredA) || token === retiredB || token.startsWith(retiredB))
    || compact.includes(retiredC.replace('_', ''));
}
function scan(file) {
  const text = fs.readFileSync(file, 'utf8');
  assert(!containsRetiredSemanticIdentifier(text), `retired catalog marker leaked into ${path.relative(root, file)}`);
}
for (const rel of scanRoots) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) continue;
  const stat = fs.statSync(target);
  if (stat.isFile()) { scan(target); continue; }
  const stack = [target];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (/\.(?:ts|js|json|md|txt|csv)$/i.test(entry.name)) scan(p);
    }
  }
}

console.log('QPM 0.34.5 retired-catalog cleanup + SSH Device Manager: PASS');
