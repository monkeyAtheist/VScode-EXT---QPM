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

const templatesSource = read('src/services/qpmTemplateService.ts');
assert(templatesSource.includes("label: 'Custom Painted Widget (QPainter)'"), 'Qt creation menu must expose custom painted widgets');
assert(templatesSource.includes("label: 'Generic Painted Value Widget'"), 'generic painted widget starter must be available');
assert(templatesSource.includes("label: 'Analog Gauge / Dial'"), 'analog gauge/dial starter must be available');
assert(templatesSource.includes("label: 'Signal Plot / Chart'"), 'signal plot/chart starter must be available');
assert(templatesSource.includes('qtPaintedValueWidgetHeader'), 'generic QPainter widget template must exist');
assert(templatesSource.includes('qtAnalogGaugeHeader'), 'analog gauge template must exist');
assert(templatesSource.includes('qtSignalPlotHeader'), 'signal plot template must exist');
assert(templatesSource.includes('Q_PROPERTY(double value'), 'instrument widgets must expose Qt properties');
assert(templatesSource.includes('QPainterPath'), 'signal plot must use a path-based painter implementation');
assert(templatesSource.includes('Promote a QWidget'), 'generated widgets must document the Qt Designer promotion path');

const extensionSource = read('src/extension.ts');
assert(extensionSource.includes('await builds.prepareNativeQtGeneratedFiles(ref)'), 'new Qt classes must refresh MOC/UIC generation after creation');

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
  assert.strictEqual(result.files.length, 2, `${subtype} must create one header and one source`);

  const stem = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  const headerPath = path.join(tempRoot, 'include', 'widgets', `${stem}.h`);
  const sourcePath = path.join(tempRoot, 'src', 'widgets', `${stem}.cpp`);
  assert(fs.existsSync(headerPath), `${subtype} header must be written under include/widgets`);
  assert(fs.existsSync(sourcePath), `${subtype} source must be written under src/widgets`);
  return {
    header: fs.readFileSync(headerPath, 'utf8'),
    source: fs.readFileSync(sourcePath, 'utf8')
  };
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-custom-widget-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const output = { appendLine: () => undefined };
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, output);

    const generic = await generateWidget(service, tempRoot, 'value', 'VoltageIndicator');
    assert(generic.header.includes('class VoltageIndicator final : public QWidget'));
    assert(generic.header.includes('Q_PROPERTY(double value READ value WRITE setValue NOTIFY valueChanged)'));
    assert(generic.source.includes('void VoltageIndicator::paintEvent'));
    assert(generic.source.includes('QStyle::PE_Widget'), 'generic widget must preserve QWidget/QSS background styling');
    assert(generic.source.includes('void VoltageIndicator::wheelEvent'));

    const gauge = await generateWidget(service, tempRoot, 'gauge', 'VoltageGauge');
    assert(gauge.header.includes('Q_PROPERTY(QString unit READ unit WRITE setUnit)'));
    assert(gauge.source.includes('constexpr double kSweepAngleDeg = 270.0'));
    assert(gauge.source.includes('needleAngleDeg'), 'gauge starter must paint an analog needle');
    assert(gauge.source.includes('valueFromPosition'), 'gauge starter must support direct mouse interaction');

    const signal = await generateWidget(service, tempRoot, 'signal', 'SignalPlot');
    assert(signal.header.includes('const QVector<double> &samples() const noexcept')); // legacy primary-channel access
    assert(signal.header.includes('void appendSample(double sample)'));
    assert(signal.header.includes('void cursorSampleChanged(int index, double value)'));
    assert(signal.source.includes('QPainterPath path'));
    assert(signal.source.includes('void SignalPlot::wheelEvent'));
    assert(signal.source.includes('emit cursorSampleChanged(index, m_channels[0].samples[index])')); // legacy cursor signal still uses primary channel
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('QPM 0.17.9 custom painted widget generator tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
