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

const source = read('src/services/qpmTemplateService.ts');
assert(source.includes('Oscilloscope-style multichannel plot'), 'SignalPlot generator description must expose the advanced oscilloscope workflow');
assert(source.includes('Multitrace FFT/spectrum analyzer'), 'SpectrumPlot generator description must expose the advanced analyzer workflow');

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
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function generateWidget(service, tempRoot, subtype, name) {
  selectionQueue = ['group-qt', 'qt-custom-painted-widget', subtype];
  className = name;
  const result = await service.generateNewFiles(tempRoot);
  assert(result, `${subtype} widget generation must succeed`);
  const stem = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  return {
    header: fs.readFileSync(path.join(tempRoot, 'include', 'widgets', `${stem}.h`), 'utf8'),
    source: fs.readFileSync(path.join(tempRoot, 'src', 'widgets', `${stem}.cpp`), 'utf8')
  };
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-advanced-instrumentation-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });

    const signal = await generateWidget(service, tempRoot, 'signal', 'ScopePlot');
    for (const token of [
      'struct Channel',
      'int addChannel(',
      'void setChannelSamples(',
      'void appendSample(int channel, double sample)',
      'Q_PROPERTY(double sampleInterval',
      'Q_PROPERTY(bool legendVisible',
      'Q_PROPERTY(bool autoScale',
      'Q_PROPERTY(bool cursorsVisible',
      'Q_PROPERTY(bool followLatest',
      'void appendSamples(int channel, const QVector<double> &samples)',
      'cursorMeasurementsChanged(double deltaTime, double deltaValue, double frequency)',
      'void setSamples(const QVector<double> &samples)',
      'void appendSample(double sample)'
    ]) assert(signal.header.includes(token), `SignalPlot header must contain ${token}`);
    for (const token of [
      'Qt::MiddleButton',
      'Qt::ShiftModifier',
      'Qt::ControlModifier',
      'm_xZoom',
      'm_xPan',
      'm_followLatest',
      'updateAutoScale()',
      'std::abs(1.0 / deltaTime)',
      'QStringLiteral("Δt=%1 s   ΔV=%2   f=%3 Hz")'
    ]) assert(signal.source.includes(token), `SignalPlot source must contain ${token}`);

    const spectrum = await generateWidget(service, tempRoot, 'spectrum', 'AnalyzerPlot');
    for (const token of [
      'struct Trace',
      'int addTrace(',
      'void setTraceMagnitudes(',
      'Q_PROPERTY(double frequencyMinimum',
      'Q_PROPERTY(bool logarithmicFrequency',
      'Q_PROPERTY(bool legendVisible',
      'Q_PROPERTY(bool autoScale',
      'cursorMeasurementsChanged(double deltaFrequency, double deltaMagnitude)',
      'void setMagnitudes(const QVector<double> &magnitudes)',
      'void setViewFrequencyRange(double minimum, double maximum)'
    ]) assert(spectrum.header.includes(token), `SpectrumPlot header must contain ${token}`);
    for (const token of [
      'm_viewFrequencyMinimum',
      'm_viewFrequencyMaximum',
      'std::log(',
      'std::exp(',
      'panFrequencyView',
      'Qt::MiddleButton',
      'Qt::ControlModifier',
      'QStringLiteral("Δf=%1   ΔA=%2 dB")'
    ]) assert(spectrum.source.includes(token), `SpectrumPlot source must contain ${token}`);

    assert(read('README.md').includes('QPM 0.20.0 — Advanced oscilloscope and spectrum widgets'));
    assert(read('CHANGELOG.md').includes('## 0.20.0 — Advanced SignalPlot and SpectrumPlot instrumentation'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.20.0 advanced instrumentation tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
