'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.version, '0.34.2');

const commands = new Set((pkg.contributes.commands || []).map((entry) => entry.command));
for (const command of ['qpm.openInstrumentProfileEditor', 'qpm.openInstrumentProfileFile', 'qpm.newInstrumentProfileFromCatalog']) {
  assert(commands.has(command), `Missing command ${command}`);
}
assert((pkg.contributes.menus['qpm.projectQtTools'] || []).some((item) => item.command === 'qpm.openInstrumentProfileEditor'));
assert((pkg.contributes.menus['editor/title'] || []).some((item) => item.command === 'qpm.openInstrumentProfileEditor' && String(item.when).includes('instrument_profiles')));

const panelSource = read('src/views/qtInstrumentProfileEditorPanel.ts');
for (const token of [
  'SCPI Instrument Profile Catalog & Editor',
  'Profile catalog',
  'Auto-control preview',
  'validateQtInstrumentProfile',
  'serializeQtInstrumentProfile',
  'readQtInstrumentProfileCatalog',
  'manufacturer',
  'documentationUrl',
  'numeric write template does not contain %1'
]) assert(panelSource.includes(token), `Profile editor must contain ${token}`);

const serviceSource = read('src/services/qpmInstrumentProfileService.ts');
for (const token of ['qt_instrument_profile_catalog.json', 'instrument_profiles', 'openEditor', 'openProfileFile']) {
  assert(serviceSource.includes(token), `Profile service must contain ${token}`);
}

const templateSource = read('src/services/qpmTemplateService.ts');
for (const token of [
  'QString manufacturer;',
  'QString model;',
  'QString documentationUrl;',
  'root.value(QStringLiteral("manufacturer"))',
  'root.insert(QStringLiteral("schemaVersion"), 1)',
  "manufacturer: 'Generic'"
]) assert(templateSource.includes(token), `Generated C++ profile support must contain ${token}`);

const catalog = JSON.parse(read('data/qt_instrument_profile_catalog.json'));
assert.strictEqual(catalog.schemaVersion, 1);
assert(Array.isArray(catalog.entries) && catalog.entries.length >= 8, 'Catalog should include generic and manufacturer/model starter entries');
for (const entry of catalog.entries) {
  assert(entry.catalogId);
  assert(entry.status);
  assert(entry.profile && entry.profile.id && entry.profile.displayName);
  assert(Array.isArray(entry.profile.actions) && entry.profile.actions.length > 0);
}
for (const expected of [
  ['Keysight', '34461A'],
  ['Fluke', '8845A'],
  ['Keysight', 'E36313A'],
  ['Rigol', 'DG1022Z'],
  ['Rigol', 'DS1054Z']
]) {
  assert(catalog.entries.some((entry) => entry.profile.manufacturer === expected[0] && entry.profile.model === expected[1]), `Missing catalog starter ${expected.join(' ')}`);
}
assert(catalog.entries.filter((entry) => entry.profile.manufacturer !== 'Generic').every((entry) => entry.status === 'starter'));
assert(catalog.entries.filter((entry) => entry.profile.manufacturer !== 'Generic').every((entry) => /verify|review|baseline/i.test(`${entry.notes} ${entry.profile.description}`)));

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    class Uri {
      static file(fsPath) { return { fsPath, scheme: 'file' }; }
      static parse(value) { return { value, scheme: String(value).split(':')[0] }; }
    }
    return {
      Uri,
      ViewColumn: { Active: 1 },
      ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
      window: {},
      workspace: {},
      commands: {},
      env: {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const editor = require(path.join(root, 'out/views/qtInstrumentProfileEditorPanel.js'));
  const catalogEntries = editor.readQtInstrumentProfileCatalog(path.join(root, 'data/qt_instrument_profile_catalog.json'));
  assert(catalogEntries.length >= 8);
  const blank = editor.createBlankInstrumentProfile();
  assert.strictEqual(blank.actions[0].query, '*IDN?');
  assert.deepStrictEqual(editor.validateQtInstrumentProfile(blank), []);

  const invalid = JSON.parse(JSON.stringify(blank));
  invalid.actions = [
    { id: 'set-value', label: 'Set value', kind: 'numeric', query: '', write: 'VOLT', unit: 'V', minimum: 10, maximum: 1, decimals: 6, defaultValue: 5, readback: true },
    { id: 'set-value', label: 'Duplicate', kind: 'measurement', query: '', write: '', unit: '', minimum: 0, maximum: 1, decimals: 6, defaultValue: 0, readback: true }
  ];
  const issues = editor.validateQtInstrumentProfile(invalid);
  assert(issues.some((issue) => issue.severity === 'error' && issue.message.includes('Duplicate action ID')));
  assert(issues.some((issue) => issue.message.includes('minimum is greater than maximum')));
  assert(issues.some((issue) => issue.message.includes('does not contain %1')));
  assert(issues.some((issue) => issue.message.includes('measurement but has no query')));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-profile-editor-'));
  try {
    const profilePath = path.join(tempRoot, 'profile.json');
    const profile = catalogEntries.find((entry) => entry.profile.manufacturer === 'Keysight' && entry.profile.model === '34461A').profile;
    profile.documentationUrl = 'docs/34461a.pdf';
    fs.writeFileSync(profilePath, editor.serializeQtInstrumentProfile(profile), 'utf8');
    const loaded = editor.readQtInstrumentProfile(profilePath);
    assert.strictEqual(loaded.manufacturer, 'Keysight');
    assert.strictEqual(loaded.model, '34461A');
    assert.strictEqual(loaded.documentationUrl, 'docs/34461a.pdf');
    assert.strictEqual(loaded.actions[0].query, 'MEAS:VOLT:DC?');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
} finally {
  Module._load = originalLoad;
}

assert(read('README.md').includes('QPM 0.26.0'));
assert(read('CHANGELOG.md').includes('## 0.26.0'));
console.log('QPM 0.26.0 SCPI Instrument Profile Catalog & Editor tests: PASS');
