'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.version, '0.33.0');

const templateSource = read('src/services/qpmTemplateService.ts');
for (const token of [
  'SCPI Instrument Manager + Auto Profile Detection',
  'qtScpiProfileMatcherHeader',
  'qtScpiProfileMatcherSource',
  'automatic *IDN? parsing and manufacturer/model profile matching',
  'Apply suggested profile'
]) assert(templateSource.includes(token), `Template service must contain ${token}`);

const originalLoad = Module._load;
let selectionQueue = [];
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      window: {
        showQuickPick: async (items) => {
          const value = selectionQueue.shift();
          const found = items.find((item) => item.value === value);
          assert(found, `QuickPick value ${value} must exist`);
          return found;
        },
        showInputBox: async () => undefined,
        showWarningMessage: async () => 'Overwrite generated files',
        showErrorMessage: async () => undefined,
        showSaveDialog: async () => undefined
      },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined }) }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const editor = require(path.join(root, 'out/views/qtInstrumentProfileEditorPanel.js'));
  const catalog = editor.readQtInstrumentProfileCatalog(path.join(root, 'data/qt_instrument_profile_catalog.json'));
  const identity = editor.parseScpiIdentity('KEYSIGHT TECHNOLOGIES,34461A,MY12345678,A.03.00');
  assert.strictEqual(identity.manufacturer, 'KEYSIGHT TECHNOLOGIES');
  assert.strictEqual(identity.model, '34461A');
  assert.strictEqual(identity.serialNumber, 'MY12345678');
  assert.strictEqual(identity.firmware, 'A.03.00');
  const matches = editor.matchScpiIdentityToCatalog(catalog, identity.raw);
  assert(matches.length > 0);
  assert.strictEqual(matches[0].entry.profile.manufacturer, 'Keysight');
  assert.strictEqual(matches[0].entry.profile.model, '34461A');
  assert.strictEqual(matches[0].score, 100);
  assert.strictEqual(matches[0].confidence, 'high');
  const legacyVendor = editor.matchScpiIdentityToCatalog(catalog, 'AGILENT TECHNOLOGIES,34461A,SN,FW');
  assert.strictEqual(legacyVendor[0].entry.profile.model, '34461A');
  assert.strictEqual(legacyVendor[0].score, 100);
  const rigol = editor.matchScpiIdentityToCatalog(catalog, 'RIGOL TECHNOLOGIES,DS1054Z-S,DS1ZA000000000,00.04');
  assert(rigol.some((match) => match.entry.profile.model === 'DS1054Z' && match.score >= 85));
  assert(!matches.some((match) => match.entry.profile.manufacturer === 'Generic'), 'Generic profiles must not be auto-detection candidates');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-auto-profile-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-scpi-instrument-manager'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'SCPI Instrument Manager generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Widgets', 'Network']);

    const expected = [
      'include/instrumentation/qpm_instrument_profile.h',
      'src/instrumentation/qpm_instrument_profile.cpp',
      'include/instrumentation/qpm_scpi_profile_matcher.h',
      'src/instrumentation/qpm_scpi_profile_matcher.cpp',
      'include/instrumentation/qpm_instrument_manager.h',
      'src/instrumentation/qpm_instrument_manager.cpp',
      'include/widgets/instrument_manager_control.h',
      'src/widgets/instrument_manager_control.cpp'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const matcherHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_scpi_profile_matcher.h'), 'utf8');
    const matcherSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_scpi_profile_matcher.cpp'), 'utf8');
    for (const token of ['QpmScpiIdentity', 'QpmScpiProfileMatch', 'bestMatch(', 'scoreProfile(', 'Confidence'])
      assert(matcherHeader.includes(token), `Matcher header must contain ${token}`);
    for (const token of ['KEYSIGHT', 'agilent', 'hewlettpackard', 'manufacturer match', 'exact model match', 'score >= 90'])
      assert(matcherSource.toLowerCase().includes(token.toLowerCase()), `Matcher source must contain ${token}`);

    const managerHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_instrument_manager.h'), 'utf8');
    const managerSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_instrument_manager.cpp'), 'utf8');
    for (const token of ['profileDirectory', 'suggestedProfileId', 'suggestedProfileScore', 'applySuggestedProfile', 'profileSuggestionChanged', 'profileApplied'])
      assert(managerHeader.includes(token), `Manager header must contain ${token}`);
    for (const token of ['identityChanged', 'refreshProfileSuggestion(name)', 'QpmScpiProfileMatcher::bestMatch', 'm_appliedProfiles.insert'])
      assert(managerSource.includes(token), `Manager source must contain ${token}`);

    const controlSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/instrument_manager_control.cpp'), 'utf8');
    for (const token of ['Apply suggested profile', 'Profile directory', 'Suggested profile', 'onApplyProfile', 'profileSuggestionChanged', 'profilePathApplied'])
      assert(controlSource.includes(token), `InstrumentManagerControl must contain ${token}`);

    assert(templateSource.includes('setInstrumentManager(QpmInstrumentManager *manager)'));
    assert(templateSource.includes('applyProfileFile(const QString &filePath)'));
    assert(templateSource.includes('QPM_HAS_INSTRUMENT_MANAGER'));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  assert(read('README.md').includes('QPM 0.27.0'));
  assert(read('CHANGELOG.md').includes('## 0.27.0'));
  console.log('QPM 0.27.0 SCPI profile auto-detection tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
