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
assert(templateSource.includes('Complete Acquisition Dashboard'));
assert(templateSource.includes("case 'qt-acquisition-dashboard'"));
assert(templateSource.includes('class AcquisitionDashboard final : public QWidget'));
assert(templateSource.includes('integrateAcquisitionDashboardIntoBlankMainWindowUi'));
assert(templateSource.includes("result.requiredQtModules = ['Core', 'Gui', 'Widgets', 'Network', 'SerialPort']"));

const designerSource = read('src/services/qpmQtDesignerWidgetService.ts');
assert(designerSource.includes('async prepareAll('));
assert(designerSource.includes('async prepareAllAndOpen('));
assert(designerSource.includes('Prepare all & rebuild'));
assert(read('src/extension.ts').includes("register('qpm.prepareQtDesignerWidgets'"));
assert(read('src/extension.ts').includes("register('qpm.prepareAndOpenQtDesignerWidgets'"));
assert(pkg.contributes.commands.some((entry) => entry.command === 'qpm.prepareQtDesignerWidgets'));
assert(pkg.contributes.commands.some((entry) => entry.command === 'qpm.prepareAndOpenQtDesignerWidgets'));

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
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showSaveDialog: async () => undefined
      },
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined }) }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-acq-dashboard-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'forms'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'forms', 'mainwindow.ui'), `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>MainWindow</class>\n <widget class="QMainWindow" name="MainWindow">\n  <widget class="QWidget" name="centralWidget"/>\n  <widget class="QMenuBar" name="menuBar"/>\n  <widget class="QStatusBar" name="statusBar"/>\n </widget>\n <resources/>\n <connections/>\n</ui>\n`, 'utf8');

    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-acquisition-dashboard'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Complete acquisition dashboard generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Gui', 'Widgets', 'Network', 'SerialPort']);

    const expected = [
      'include/widgets/acquisition_dashboard.h',
      'src/widgets/acquisition_dashboard.cpp',
      'include/widgets/acquisition_control.h',
      'src/widgets/acquisition_control.cpp',
      'include/widgets/signal_plot.h',
      'src/widgets/signal_plot.cpp',
      'include/instrumentation/qpm_signal_buffer.h',
      'src/instrumentation/qpm_signal_buffer.cpp',
      'include/instrumentation/qpm_signal_plot_bridge.h',
      'src/instrumentation/qpm_signal_plot_bridge.cpp',
      'include/instrumentation/qpm_acquisition_controller.h',
      'src/instrumentation/qpm_acquisition_controller.cpp'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const dashboardHeader = fs.readFileSync(path.join(tempRoot, 'include/widgets/acquisition_dashboard.h'), 'utf8');
    const dashboardSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/acquisition_dashboard.cpp'), 'utf8');
    for (const token of ['AcquisitionDashboard final : public QWidget', 'Q_PROPERTY(int channelCount', 'QpmSignalBuffer *signalBuffer()', 'QpmAcquisitionController *controller()', 'QpmSignalPlotBridge *plotBridge()'])
      assert(dashboardHeader.includes(token), `Dashboard header must contain ${token}`);
    for (const token of ['new AcquisitionControl(this)', 'new SignalPlot(this)', 'new QpmAcquisitionController', 'new QpmSignalPlotBridge', 'm_bridge->start()', 'QPM_DESIGNER_PLUGIN_BUILD'])
      assert(dashboardSource.includes(token), `Dashboard source must contain ${token}`);

    const mainUi = fs.readFileSync(path.join(tempRoot, 'forms/mainwindow.ui'), 'utf8');
    assert(mainUi.includes('class="AcquisitionDashboard" name="acquisitionDashboard"'));
    assert(mainUi.includes('<class>AcquisitionDashboard</class>'));
    assert(mainUi.includes('<header>widgets/acquisition_dashboard.h</header>'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.29.0 acquisition dashboard + Designer preparation tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
