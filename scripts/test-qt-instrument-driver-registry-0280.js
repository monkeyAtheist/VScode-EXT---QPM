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
  'Instrument Driver Registry + Capabilities',
  'qt-instrument-driver-registry',
  'qtInstrumentDriverRegistryHeader',
  'qtInstrumentDriverRegistrySource',
  'qtInstrumentCapabilitiesControlHeader',
  'qtInstrumentCapabilitiesControlSource'
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

const editor = require(path.join(root, 'out/views/qtInstrumentProfileEditorPanel.js'));
const blank = editor.createBlankInstrumentProfile();
assert(Array.isArray(blank.capabilities));
assert(blank.capabilities.some((cap) => cap.id === 'system.identify'));

const normalized = editor.normalizeQtInstrumentProfile({
  schemaVersion: 1,
  id: 'test-psu',
  displayName: 'Test PSU',
  family: 'power-supply',
  actions: [
    { id: 'voltage', label: 'Voltage', kind: 'numeric', query: 'VOLT?', write: 'VOLT %1', unit: 'V', minimum: 0, maximum: 30, decimals: 3, defaultValue: 5, readback: true },
    { id: 'output', label: 'Output', kind: 'toggle', query: 'OUTP?', write: 'OUTP %1', readback: true }
  ]
});
assert(normalized.capabilities.some((cap) => cap.id === 'power.voltage-set'));
assert(normalized.capabilities.some((cap) => cap.id === 'power.output'));
const serialized = editor.serializeQtInstrumentProfile(normalized);
assert(serialized.includes('"capabilities"'));
assert(serialized.includes('"power.voltage-set"'));

const invalid = editor.normalizeQtInstrumentProfile({
  ...normalized,
  capabilities: [{ id: 'broken.capability', label: 'Broken', category: 'test', actions: ['missing-action'] }]
});
assert(editor.validateQtInstrumentProfile(invalid).some((issue) => issue.message.includes('unknown action')));


(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-driver-registry-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-instrument-driver-registry'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Driver registry generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Widgets']);

    const expected = [
      'include/instrumentation/qpm_instrument_profile.h',
      'src/instrumentation/qpm_instrument_profile.cpp',
      'include/instrumentation/qpm_instrument_driver_registry.h',
      'src/instrumentation/qpm_instrument_driver_registry.cpp',
      'include/widgets/instrument_capabilities_control.h',
      'src/widgets/instrument_capabilities_control.cpp',
      'instrument_profiles/generic_dmm.json',
      'instrument_profiles/generic_power_supply.json',
      'instrument_profiles/generic_signal_generator.json',
      'instrument_profiles/generic_oscilloscope.json'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const profileHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_instrument_profile.h'), 'utf8');
    for (const token of ['struct Capability', 'QList<Capability> capabilities', 'supportsCapability', 'capabilityIds'])
      assert(profileHeader.includes(token), `Profile header must contain ${token}`);

    const registryHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_instrument_driver_registry.h'), 'utf8');
    for (const token of ['class QpmInstrumentDriverRegistry final : public QObject', 'capabilitiesForDriver', 'actionIdsForCapability', 'driversForCapability', 'supports(', 'registryChanged'])
      assert(registryHeader.includes(token), `Registry header must contain ${token}`);

    const registrySource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_instrument_driver_registry.cpp'), 'utf8');
    for (const token of ['QpmInstrumentProfile::builtIns()', 'entryInfoList', 'rebuildCapabilityIndex', 'm_capabilityDrivers'])
      assert(registrySource.includes(token), `Registry source must contain ${token}`);

    const templateServiceSource = read('src/services/qpmTemplateService.ts');
    assert(templateServiceSource.includes('invokeActiveCapability'));
    assert(templateServiceSource.includes('invokeCapability(const QString &name, const QString &capabilityId'));
    assert(templateServiceSource.includes('ControlKind::Measurement'));
    assert(templateServiceSource.includes('ControlKind::Numeric'));
    assert(templateServiceSource.includes('ControlKind::Toggle'));

    const controlHeader = fs.readFileSync(path.join(tempRoot, 'include/widgets/instrument_capabilities_control.h'), 'utf8');
    const controlSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/instrument_capabilities_control.cpp'), 'utf8');
    assert(controlHeader.includes('class InstrumentCapabilitiesControl final : public QWidget'));
    assert(controlHeader.includes('Q_OBJECT'));
    assert(controlSource.includes('QPM_DESIGNER_PLUGIN_BUILD'));
    assert(controlSource.includes('capabilityActivated'));
    assert(controlSource.includes('Filter capability ID'));

    const psu = JSON.parse(fs.readFileSync(path.join(tempRoot, 'instrument_profiles/generic_power_supply.json'), 'utf8'));
    assert(Array.isArray(psu.capabilities));
    assert(psu.capabilities.some((cap) => cap.id === 'power.voltage-set' && cap.actions.includes('voltage')));
    assert(psu.capabilities.some((cap) => cap.id === 'measure.dc-voltage' && cap.actions.includes('measured-voltage')));

    // Regression: both acquisition classes must own the sample-rate member they expose.
    selectionQueue = ['group-qt', 'qt-acquisition-sources'];
    await service.generateNewFiles(tempRoot);
    const acquisitionController = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_acquisition_controller.h'), 'utf8');
    const acquisitionSource = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_acquisition_source.h'), 'utf8');
    assert(acquisitionController.includes('double m_sampleRateHz = 0.0;'));
    assert(acquisitionSource.includes('double m_sampleRateHz = 0.0;'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.28.0 instrument driver registry tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
