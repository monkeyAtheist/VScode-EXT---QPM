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

const source = read('src/services/qpmTemplateService.ts');
assert(source.includes('automatic Vpp/Vrms/Vavg/frequency/duty measurements'));
assert(source.includes('max/min hold, persistence, peak marker'));

const originalLoad = Module._load;
let selectionQueue = [];
let className = '';
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
        showInputBox: async () => className,
        showWarningMessage: async () => 'Overwrite generated files',
        showErrorMessage: async () => undefined,
        showSaveDialog: async () => undefined
      },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined }) }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function generateWidget(service, tempRoot, subtype, name) {
  selectionQueue = ['group-qt', 'qt-custom-painted-widget', subtype];
  className = name;
  const result = await service.generateNewFiles(tempRoot);
  assert(result, `${subtype} generation must succeed`);
  const stem = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  return {
    header: fs.readFileSync(path.join(tempRoot, 'include', 'widgets', `${stem}.h`), 'utf8'),
    source: fs.readFileSync(path.join(tempRoot, 'src', 'widgets', `${stem}.cpp`), 'utf8')
  };
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-scope-analysis-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });

    const signal = await generateWidget(service, tempRoot, 'signal', 'ScopePlot');
    for (const token of [
      'enum class Coupling { DC, AC }',
      'enum class TriggerMode { Off, Auto, Normal }',
      'enum class TriggerEdge { Rising, Falling }',
      'Q_PROPERTY(TriggerMode triggerMode',
      'Q_PROPERTY(double triggerLevel',
      'Q_PROPERTY(double triggerPosition',
      'Q_PROPERTY(bool measurementsVisible',
      'Q_PROPERTY(bool horizontalCursorsVisible',
      'double peakToPeak() const',
      'double rms() const',
      'double average() const',
      'double measuredFrequency() const',
      'double dutyCycle() const',
      'automaticMeasurementsChanged(double peakToPeak, double rms, double average, double frequency, double dutyCycle)',
      'horizontalCursorMeasurementsChanged(double y1, double y2, double deltaY)',
      'triggerDetected(int index, double time)'
    ]) assert(signal.header.includes(token), `Signal header must contain ${token}`);
    for (const token of [
      'triggerCrossing(',
      'findLatestTrigger(',
      'm_lastTriggerIndex',
      'm_coupling == Coupling::AC',
      'std::sqrt(sumSq / count)',
      'result.dutyCycle = 100.0 * above / count',
      '1.0 / (periodSamples * m_sampleInterval)',
      'Qt::AltModifier',
      'Qt::ControlModifier',
      'TRIG %1 %2',
      'Vpp %1   Vrms %2   Vavg %3'
    ]) assert(signal.source.includes(token), `Signal source must contain ${token}`);

    const spectrum = await generateWidget(service, tempRoot, 'spectrum', 'AnalyzerPlot');
    for (const token of [
      'enum class HoldMode { Off, Maximum, Minimum }',
      'Q_PROPERTY(HoldMode holdMode',
      'Q_PROPERTY(int persistenceFrames',
      'Q_PROPERTY(bool peakMarkerVisible',
      'QVector<double> holdMagnitudes',
      'QVector<QVector<double>> persistence',
      'void clearHold()',
      'void clearPersistence()',
      'double peakFrequency() const',
      'double peakMagnitude() const'
    ]) assert(spectrum.header.includes(token), `Spectrum header must contain ${token}`);
    for (const token of [
      'updateTraceHistory(',
      'updateTraceHold(',
      'HoldMode::Maximum',
      'trace.persistence.push_back',
      'painter.setOpacity(opacity)',
      'Qt::DashLine',
      'Peak %1  %2 dB',
      'emit peakChanged(peakFrequency(), peakMagnitude())'
    ]) assert(spectrum.source.includes(token), `Spectrum source must contain ${token}`);

    assert(read('README.md').includes('QPM 0.21.0 — Oscilloscope trigger and analysis'));
    assert(read('CHANGELOG.md').includes('## 0.21.0 — Trigger, automatic measurements and spectral persistence'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.21.0 oscilloscope/analysis tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
