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
  assert(result, `${subtype} generation must succeed`);
  const stem = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  return fs.readFileSync(path.join(tempRoot, 'src', 'widgets', `${stem}.cpp`), 'utf8');
}

(async () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-0291-'));
  const projectRoot = path.join(tempBase, 'Programmes C++ windows', 'Qt Acquisition App');
  fs.mkdirSync(projectRoot, { recursive: true });

  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const { generateQpmDesignerPluginProject } = require(path.join(root, 'out/services/qpmQtDesignerWidgetService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempBase }, extensionPath: root }, {}, { appendLine: () => undefined });

    const signal = await generateWidget(service, projectRoot, 'signal', 'SignalPlot0291');
    assert(signal.includes('QStringLiteral("Vpp %1   Vrms %2   Vavg %3\\nf %4   Duty %5 %")'),
      'Generated SignalPlot must keep the line break escaped inside the C++ string literal');
    assert(!signal.includes('QStringLiteral("Vpp %1   Vrms %2   Vavg %3\nf %4'),
      'Generated SignalPlot must not contain a physical newline inside QStringLiteral');

    const knob = await generateWidget(service, projectRoot, 'knob', 'RotaryKnob0291');
    assert(knob.includes('qMin(qreal(width()), qreal(height()) * qreal(0.78))'),
      'Generated RotaryKnob must use homogeneous qreal arguments for qMin');
    assert(!knob.includes('qMin(width(), height() * 0.78)'),
      'Generated RotaryKnob must not mix int and double in qMin');

    const fakeHeader = path.join(projectRoot, 'include', 'widgets', 'fake_widget.h');
    const fakeSource = path.join(projectRoot, 'src', 'widgets', 'fake_widget.cpp');
    fs.mkdirSync(path.dirname(fakeHeader), { recursive: true });
    fs.mkdirSync(path.dirname(fakeSource), { recursive: true });
    fs.writeFileSync(fakeHeader, '#pragma once\n#include <QWidget>\nclass FakeWidget : public QWidget { Q_OBJECT public: using QWidget::QWidget; };\n');
    fs.writeFileSync(fakeSource, '#include "fake_widget.h"\n');

    const layout = generateQpmDesignerPluginProject(projectRoot, {
      schemaVersion: 1,
      group: 'QPM Instrumentation',
      widgets: [{
        className: 'FakeWidget',
        header: path.relative(projectRoot, fakeHeader),
        source: path.relative(projectRoot, fakeSource),
        includeFile: 'widgets/fake_widget.h',
        displayName: 'Fake Widget',
        toolTip: 'Fake widget for qmake path regression'
      }]
    });
    const pro = fs.readFileSync(layout.projectFile, 'utf8');
    assert(pro.includes('OBJECTS_DIR = obj'), 'Designer plugin OBJECTS_DIR must be relative to the qmake build cwd');
    assert(pro.includes('MOC_DIR = moc'), 'Designer plugin MOC_DIR must be relative');
    assert(pro.includes('RCC_DIR = rcc'), 'Designer plugin RCC_DIR must be relative');
    assert(pro.includes('UI_DIR = ui'), 'Designer plugin UI_DIR must be relative');
    assert(pro.includes('DESTDIR = $$quote('), 'Designer plugin paths must use qmake $$quote()');
    assert(pro.includes('Programmes C++ windows'), 'Regression project must exercise a path containing spaces');
    assert(!/OBJECTS_DIR\s*=.*Programmes C\+\+ windows/.test(pro),
      'Absolute spaced path must never be written into OBJECTS_DIR');

    const backendSource = read('src/services/qpmQtBuildBackendService.ts');
    assert(backendSource.includes("'OBJECTS_DIR = obj'"), 'General qmake backend must also use a relative OBJECTS_DIR');
    assert(backendSource.includes("'MOC_DIR = moc'"), 'General qmake backend must also use a relative MOC_DIR');

    assert(read('CHANGELOG.md').includes('## 0.29.1 — Designer plugin path/build fixes'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
  console.log('QPM 0.29.1 Designer/widget regression tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
