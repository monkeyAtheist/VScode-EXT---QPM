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
assert(templateSource.includes('Acquisition Sources + Control Panel'));
assert(templateSource.includes("result.requiredQtModules = ['Core', 'Widgets', 'Network', 'SerialPort']"));
assert(read('src/services/qpmQtProjectService.ts').includes('ensureModules(manifestPath: string, modules: string[])'));
assert(read('src/services/qpmWorkspaceService.ts').includes('generated.requiredQtModules'));

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-acq-source-'));
  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-acquisition-sources'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Acquisition source generation must succeed');
    assert.deepStrictEqual(result.requiredQtModules, ['Core', 'Widgets', 'Network', 'SerialPort']);

    const expected = [
      'include/instrumentation/qpm_signal_buffer.h',
      'src/instrumentation/qpm_signal_buffer.cpp',
      'include/instrumentation/qpm_sample_decoder.h',
      'src/instrumentation/qpm_sample_decoder.cpp',
      'include/instrumentation/qpm_acquisition_source.h',
      'src/instrumentation/qpm_acquisition_source.cpp',
      'include/instrumentation/qpm_serial_acquisition_source.h',
      'src/instrumentation/qpm_serial_acquisition_source.cpp',
      'include/instrumentation/qpm_tcp_acquisition_source.h',
      'src/instrumentation/qpm_tcp_acquisition_source.cpp',
      'include/instrumentation/qpm_udp_acquisition_source.h',
      'src/instrumentation/qpm_udp_acquisition_source.cpp',
      'include/instrumentation/qpm_scpi_acquisition_source.h',
      'src/instrumentation/qpm_scpi_acquisition_source.cpp',
      'include/instrumentation/qpm_acquisition_controller.h',
      'src/instrumentation/qpm_acquisition_controller.cpp',
      'include/widgets/acquisition_control.h',
      'src/widgets/acquisition_control.cpp'
    ];
    for (const relative of expected) assert(fs.existsSync(path.join(tempRoot, relative)), `Expected ${relative}`);

    const decoder = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_sample_decoder.cpp'), 'utf8');
    for (const token of ['AsciiCsv', 'Float32LE', 'Float64LE', 'Int16LE', 'qFromLittleEndian', 'm_pending'])
      assert(decoder.includes(token), `Decoder must contain ${token}`);

    const baseHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_acquisition_source.h'), 'utf8');
    for (const token of ['class QpmAcquisitionSource : public QObject', 'virtual void start() = 0', 'void consumeBytes(', 'QpmSignalBuffer *m_buffer', 'statisticsChanged', 'double m_sampleRateHz = 0.0;', 'sampleRateHzChanged'])
      assert(baseHeader.includes(token), `Base source must contain ${token}`);
    const baseSource = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_acquisition_source.cpp'), 'utf8');
    assert(baseSource.includes('QpmAcquisitionSource::setSampleRateHz(double hertz)'));

    const serial = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_serial_acquisition_source.cpp'), 'utf8');
    assert(serial.includes('QSerialPort'));
    assert(serial.includes('readyRead'));

    const tcp = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_tcp_acquisition_source.cpp'), 'utf8');
    assert(tcp.includes('QTcpSocket'));
    assert(tcp.includes('connectToHost'));

    const udp = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_udp_acquisition_source.cpp'), 'utf8');
    assert(udp.includes('QUdpSocket'));
    assert(udp.includes('hasPendingDatagrams'));

    const scpiHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_scpi_acquisition_source.h'), 'utf8');
    const scpi = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_scpi_acquisition_source.cpp'), 'utf8');
    assert(scpiHeader.includes('READ?'));
    assert(scpi.includes('requestSample'));
    assert(scpi.includes('SampleFormat::AsciiCsv'));

    const controllerHeader = fs.readFileSync(path.join(tempRoot, 'include/instrumentation/qpm_acquisition_controller.h'), 'utf8');
    assert(controllerHeader.includes('double m_sampleRateHz = 0.0;'), 'Controller header must declare m_sampleRateHz used by sampleRateHz()/setSampleRateHz().');
    const controller = fs.readFileSync(path.join(tempRoot, 'src/instrumentation/qpm_acquisition_controller.cpp'), 'utf8');
    for (const token of ['QpmSerialAcquisitionSource', 'QpmTcpAcquisitionSource', 'QpmUdpAcquisitionSource', 'QpmScpiAcquisitionSource', 'createSource()', 'setBuffer(m_buffer)', 'setSampleRateHz', 'source->setSampleRateHz(m_sampleRateHz)'])
      assert(controller.includes(token), `Controller must contain ${token}`);

    const controlHeader = fs.readFileSync(path.join(tempRoot, 'include/widgets/acquisition_control.h'), 'utf8');
    const controlSource = fs.readFileSync(path.join(tempRoot, 'src/widgets/acquisition_control.cpp'), 'utf8');
    assert(controlHeader.includes('class AcquisitionControl final : public QWidget'));
    assert(controlHeader.includes('Q_OBJECT'));
    assert(controlSource.includes('QPM_DESIGNER_PLUGIN_BUILD'));
    assert(controlSource.includes('Start acquisition'));
    assert(controlSource.includes('SCPI / TCP'));
    assert(controlSource.includes('Sample rate'));
    assert(controlSource.includes('setSampleRateHz'));
    assert(controlSource.includes('formattedRate'));

    const manifestModel = require(path.join(root, 'out/model/qtProjectManifest.js'));
    const { QpmQtProjectService } = require(path.join(root, 'out/services/qpmQtProjectService.js'));
    const manifestPath = path.join(tempRoot, 'AcquisitionTest.qtproject.json');
    const manifest = manifestModel.createDefaultQtProjectManifest('AcquisitionTest', 'widgets-application', ['Core', 'Gui', 'Widgets']);
    manifestModel.writeQtProjectManifest(manifestPath, manifest);
    const projectService = new QpmQtProjectService({}, { appendLine: () => undefined });
    const modulesAdded = projectService.ensureModules(manifestPath, ['Core', 'Widgets', 'Network', 'SerialPort']);
    assert.deepStrictEqual(modulesAdded, ['Network', 'SerialPort']);
    const updatedManifest = manifestModel.readQtProjectManifest(manifestPath);
    assert(updatedManifest.qt.modules.includes('Network'));
    assert(updatedManifest.qt.modules.includes('SerialPort'));

    assert(read('README.md').includes('QPM 0.23.0'));
    assert(read('CHANGELOG.md').includes('## 0.23.0'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.23.0 acquisition source tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
