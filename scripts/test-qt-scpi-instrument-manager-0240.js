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

const templateSource = read('src/services/qpmTemplateService.ts');
assert(templateSource.includes('SCPI Instrument Manager'));
assert(templateSource.includes("result.requiredQtModules = ['Core', 'Widgets', 'Network']"));
assert(templateSource.includes('generic SCPI has no universal LAN discovery protocol'));

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-scpi-manager-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-scpi-instrument-manager'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'SCPI Instrument Manager generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Widgets', 'Network']);

    const expected = [
      'include/instrumentation/qpm_scpi_instrument.h',
      'src/instrumentation/qpm_scpi_instrument.cpp',
      'include/instrumentation/qpm_instrument_manager.h',
      'src/instrumentation/qpm_instrument_manager.cpp',
      'include/widgets/instrument_manager_control.h',
      'src/widgets/instrument_manager_control.cpp'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const instrumentHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_scpi_instrument.h'), 'utf8');
    const instrumentSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_scpi_instrument.cpp'), 'utf8');
    for (const token of ['class QpmScpiInstrument final : public QObject', '#include <QByteArray>', 'QQueue<PendingCommand>', 'writeCommand(', 'query(', 'identify()', 'queryBlocking(', 'requestFinished', 'traffic(', 'timeoutMs'])
      assert(instrumentHeader.includes(token), `SCPI instrument header must contain ${token}`);
    for (const token of ['QTcpSocket', 'connectToHost', '*IDN?', 'm_commandTimer', 'onCommandTimeout', 'QEventLoop', 'queryBlocking()', 'processNext()', 'm_receiveBuffer'])
      assert(instrumentSource.includes(token), `SCPI instrument source must contain ${token}`);

    const managerHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_instrument_manager.h'), 'utf8');
    const managerSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_instrument_manager.cpp'), 'utf8');
    for (const token of ['QpmInstrumentManager final : public QObject', 'addInstrument(', 'removeInstrument(', 'probeConfiguredInstruments()', 'queryActive(', 'writeActive('])
      assert(managerHeader.includes(token), `Instrument manager header must contain ${token}`);
    assert(managerSource.includes('setAutoIdentify(true)'));
    assert(managerSource.includes('m_instruments.value(requestedName, nullptr)'));
    assert(managerSource.includes('emit instrumentUpdated(requestedName)'));
    assert(managerSource.includes('identify()'));
    assert(managerSource.includes('connectAll()'));

    const controlHeader = fs.readFileSync(path.join(tempRoot, 'include/widgets/instrument_manager_control.h'), 'utf8');
    const controlSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/instrument_manager_control.cpp'), 'utf8');
    assert(controlHeader.includes('class InstrumentManagerControl final : public QWidget'));
    assert(controlHeader.includes('Q_OBJECT'));
    assert(controlSource.includes('QPM_DESIGNER_PLUGIN_BUILD'));
    assert(controlSource.includes('Probe configured (*IDN?)'));
    assert(controlSource.includes('SCPI TX/RX history'));
    assert(controlSource.includes('QPlainTextEdit'));
    assert(controlSource.includes('Query queued'));
    assert(controlSource.includes('Command queued'));

    const manifestModel = require(path.join(root, 'out/model/qtProjectManifest.js'));
    const { QpmQtProjectService } = require(path.join(root, 'out/services/qpmQtProjectService.js'));
    const manifestPath = path.join(tempRoot, 'ScpiTest.qtproject.json');
    const manifest = manifestModel.createDefaultQtProjectManifest('ScpiTest', 'widgets-application', ['Core', 'Gui', 'Widgets']);
    manifestModel.writeQtProjectManifest(manifestPath, manifest);
    const projectService = new QpmQtProjectService({}, { appendLine: () => undefined });
    const modulesAdded = projectService.ensureModules(manifestPath, ['Core', 'Widgets', 'Network']);
    assert.deepStrictEqual(modulesAdded, ['Network']);

    assert(read('README.md').includes('QPM 0.24.0'));
    assert(read('CHANGELOG.md').includes('## 0.24.0'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.24.0 SCPI Instrument Manager tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
