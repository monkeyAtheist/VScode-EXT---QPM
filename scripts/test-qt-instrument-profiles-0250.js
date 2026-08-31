'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.strictEqual(pkg.version, '0.30.0');

const templateSource = read('src/services/qpmTemplateService.ts');
assert(templateSource.includes('SCPI Instrument Profiles + Auto Control Panel'));
assert(templateSource.includes("case 'qt-instrument-profiles'"));
assert(templateSource.includes("qtInstrumentProfileJson('oscilloscope')"));
assert(templateSource.includes('Commands are generic SCPI starters'));

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-instrument-profiles-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-instrument-profiles'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Instrument profile generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Widgets', 'Network']);

    const expected = [
      'include/instrumentation/qpm_scpi_instrument.h',
      'src/instrumentation/qpm_scpi_instrument.cpp',
      'include/instrumentation/qpm_instrument_profile.h',
      'src/instrumentation/qpm_instrument_profile.cpp',
      'include/widgets/profiled_instrument_control.h',
      'src/widgets/profiled_instrument_control.cpp',
      'instrument_profiles/generic_dmm.json',
      'instrument_profiles/generic_power_supply.json',
      'instrument_profiles/generic_signal_generator.json',
      'instrument_profiles/generic_oscilloscope.json'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const profileHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_instrument_profile.h'), 'utf8');
    const profileSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_instrument_profile.cpp'), 'utf8');
    for (const token of ['struct QpmInstrumentProfile', 'DigitalMultimeter', 'PowerSupply', 'SignalGenerator', 'Oscilloscope', 'ControlKind', 'loadJsonFile', 'saveJsonFile', 'builtIns'])
      assert(profileHeader.includes(token), `Profile header must contain ${token}`);
    for (const token of ['MEAS:VOLT:DC?', 'VOLT %1', 'CURR %1', 'FREQ %1', 'TIM:SCAL %1', 'QJsonDocument', 'Generic SCPI Oscilloscope'])
      assert(profileSource.includes(token), `Profile source must contain ${token}`);

    const controlHeader = fs.readFileSync(path.join(tempRoot, 'include/widgets/profiled_instrument_control.h'), 'utf8');
    const controlSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/profiled_instrument_control.cpp'), 'utf8');
    for (const token of ['class ProfiledInstrumentControl final : public QWidget', 'Q_PROPERTY(QString profileId', 'setInstrument(', 'loadProfileFile(', 'refreshAll()', 'actionResult'])
      assert(controlHeader.includes(token), `Profiled control header must contain ${token}`);
    for (const token of ['QPM_DESIGNER_PLUGIN_BUILD', 'QDoubleSpinBox', 'QCheckBox', 'setProfileId(QStringLiteral("dmm"))', 'writeCommand(command)', 'm_instrument->query', 'QSignalBlocker'])
      assert(controlSource.includes(token), `Profiled control source must contain ${token}`);

    const profiles = [
      ['generic_dmm.json', 'dmm', 'MEAS:VOLT:DC?'],
      ['generic_power_supply.json', 'power-supply', 'OUTP %1'],
      ['generic_signal_generator.json', 'signal-generator', 'FREQ %1'],
      ['generic_oscilloscope.json', 'oscilloscope', 'TIM:SCAL %1']
    ];
    for (const [file, id, token] of profiles) {
      const json = JSON.parse(fs.readFileSync(path.join(tempRoot, 'instrument_profiles', file), 'utf8'));
      assert.strictEqual(json.id, id);
      assert(Array.isArray(json.actions) && json.actions.length > 0);
      assert(JSON.stringify(json).includes(token));
    }

    const manifestModel = require(path.join(root, 'out/model/qtProjectManifest.js'));
    const { QpmQtProjectService } = require(path.join(root, 'out/services/qpmQtProjectService.js'));
    const manifestPath = path.join(tempRoot, 'Profiles.qtproject.json');
    const manifest = manifestModel.createDefaultQtProjectManifest('Profiles', 'widgets-application', ['Core', 'Gui', 'Widgets']);
    manifestModel.writeQtProjectManifest(manifestPath, manifest);
    const projectService = new QpmQtProjectService({}, { appendLine: () => undefined });
    const modulesAdded = projectService.ensureModules(manifestPath, ['Core', 'Widgets', 'Network']);
    assert.deepStrictEqual(modulesAdded, ['Network']);

    assert(read('README.md').includes('QPM 0.26.0'));
    assert(read('CHANGELOG.md').includes('## 0.26.0'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.26.0 SCPI Instrument Profiles tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
