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

const templatesSource = read('src/services/qpmTemplateService.ts');
for (const label of ['Complete QPM Instrumentation Pack', 'LED Indicator', 'Digital Meter', 'Rotary Knob', 'Linear Gauge', 'Spectrum Plot', 'XY Plot']) {
  assert(templatesSource.includes(`label: '${label}'`), `${label} must be exposed by the Qt instrumentation generator`);
}
for (const fn of ['qtLedIndicatorHeader', 'qtDigitalMeterHeader', 'qtRotaryKnobHeader', 'qtLinearGaugeHeader', 'qtSpectrumPlotHeader', 'qtXyPlotHeader']) {
  assert(templatesSource.includes(`function ${fn}`), `${fn} must exist`);
}

const designerSource = read('src/services/qpmQtDesignerWidgetService.ts');
assert(designerSource.includes('QDesignerCustomWidgetCollectionInterface'), 'instrumentation widgets must remain compatible with the Designer collection plugin');
assert(designerSource.includes("value: 'QPM Instrumentation'"), 'Designer plugin default group must remain QPM Instrumentation');

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
  return {
    header: fs.readFileSync(path.join(tempRoot, 'include', 'widgets', `${stem}.h`), 'utf8'),
    source: fs.readFileSync(path.join(tempRoot, 'src', 'widgets', `${stem}.cpp`), 'utf8')
  };
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-instrumentation-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });

    const led = await generateWidget(service, tempRoot, 'led', 'StatusLed');
    assert(led.header.includes('Q_PROPERTY(bool active READ isActive WRITE setActive NOTIFY activeChanged)'));
    assert(led.header.includes('Q_PROPERTY(QColor activeColor'));
    assert(led.source.includes('painter.drawEllipse(ledRect)'));
    assert(led.source.includes('QPalette::Highlight'));

    const meter = await generateWidget(service, tempRoot, 'digital', 'DigitalMeter');
    assert(meter.header.includes('Q_PROPERTY(int decimals READ decimals WRITE setDecimals)'));
    assert(meter.header.includes('Q_PROPERTY(QString unit READ unit WRITE setUnit)'));
    assert(meter.source.includes('QFontDatabase::FixedFont'));

    const knob = await generateWidget(service, tempRoot, 'knob', 'RotaryKnob');
    assert(knob.header.includes('Q_PROPERTY(double singleStep READ singleStep WRITE setSingleStep)'));
    assert(knob.source.includes('kSweepAngleDeg = 270.0'));
    assert(knob.source.includes('valueFromPosition'));

    const linear = await generateWidget(service, tempRoot, 'linear', 'LinearGauge');
    assert(linear.header.includes('Q_PROPERTY(Qt::Orientation orientation READ orientation WRITE setOrientation)'));
    assert(linear.header.includes('Q_PROPERTY(bool ticksVisible READ ticksVisible WRITE setTicksVisible)'));
    assert(linear.source.includes('m_orientation==Qt::Horizontal'));

    const spectrum = await generateWidget(service, tempRoot, 'spectrum', 'SpectrumPlot');
    assert(spectrum.header.includes('void setMagnitudes(const QVector<double> &magnitudes)')); // legacy 0.19 primary-trace API
    assert(spectrum.header.includes('cursorBinChanged(int index, double frequency, double magnitude)'));
    assert(spectrum.source.includes('QPainterPath path'));
    assert(spectrum.source.includes('frequencyAt('));

    const xy = await generateWidget(service, tempRoot, 'xy', 'XyPlot');
    assert(xy.header.includes('QVector<QPointF> m_points'));
    assert(xy.header.includes('void appendPoint(const QPointF &point)'));
    assert(xy.header.includes('cursorPointChanged(int index, QPointF point)'));
    assert(xy.source.includes('std::numeric_limits<double>::max()'));
    assert(xy.source.includes('QPainterPath path'));

    const packRoot = path.join(tempRoot, 'pack');
    fs.mkdirSync(packRoot, { recursive: true });
    selectionQueue = ['group-qt', 'qt-custom-painted-widget', 'pack'];
    const pack = await service.generateNewFiles(packRoot);
    assert(pack, 'complete instrumentation pack generation must succeed');
    assert.strictEqual(pack.files.length, 16, 'complete pack must create eight header/source pairs');
    for (const stem of ['status_led', 'digital_meter', 'rotary_knob', 'linear_gauge', 'analog_gauge', 'signal_plot', 'spectrum_plot', 'xy_plot']) {
      assert(fs.existsSync(path.join(packRoot, 'include', 'widgets', `${stem}.h`)), `${stem}.h must exist in complete pack`);
      assert(fs.existsSync(path.join(packRoot, 'src', 'widgets', `${stem}.cpp`)), `${stem}.cpp must exist in complete pack`);
    }
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.19.0 instrumentation widget generator tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
