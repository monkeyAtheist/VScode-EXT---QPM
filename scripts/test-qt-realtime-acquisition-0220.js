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
assert(templateSource.includes('Real-time Signal Acquisition Support'));
assert(templateSource.includes('setChannelSamplesBatch(const QVector<QVector<double>> &channels)'));

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-realtime-acq-'));
  try {
    // Simulate an existing SignalPlot header so the bridge dependency is explicit.
    fs.mkdirSync(path.join(tempRoot, 'include', 'widgets'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'include', 'widgets', 'signal_plot.h'), '// SignalPlot placeholder');

    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-realtime-acquisition'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Realtime acquisition generation must succeed');

    const bufferHeader = fs.readFileSync(path.join(tempRoot, 'include', 'instrumentation', 'qpm_signal_buffer.h'), 'utf8');
    const bufferSource = fs.readFileSync(path.join(tempRoot, 'src', 'instrumentation', 'qpm_signal_buffer.cpp'), 'utf8');
    const bridgeHeader = fs.readFileSync(path.join(tempRoot, 'include', 'instrumentation', 'qpm_signal_plot_bridge.h'), 'utf8');
    const bridgeSource = fs.readFileSync(path.join(tempRoot, 'src', 'instrumentation', 'qpm_signal_plot_bridge.cpp'), 'utf8');

    for (const token of [
      'class QpmSignalBuffer final',
      'QReadWriteLock',
      'std::atomic<quint64>',
      'bool appendFrame(',
      'bool appendInterleaved(',
      'bool trySnapshot(',
      'struct ChannelSnapshot',
      'struct Snapshot'
    ]) assert(bufferHeader.includes(token), `Buffer header must contain ${token}`);

    for (const token of [
      'QWriteLocker',
      'QReadLocker',
      'm_lock.tryLockForRead()',
      'orderedSamplesUnlocked',
      'm_revision.fetch_add',
      'channel.writeIndex = (channel.writeIndex + 1) % m_capacity'
    ]) assert(bufferSource.includes(token), `Buffer source must contain ${token}`);

    assert(bridgeHeader.includes('#include "widgets/signal_plot.h"'), 'Bridge header must include the complete SignalPlot type for QPointer');
    assert(bridgeHeader.includes('#include <limits>'), 'Bridge header must include <limits> for std::numeric_limits');
    assert(!bridgeHeader.includes('class SignalPlot;'), 'Bridge header must not rely on an incomplete SignalPlot type');

    for (const token of [
      'class QpmSignalPlotBridge final : public QObject',
      'Q_PROPERTY(int refreshRateHz',
      'Q_PROPERTY(int windowSamples',
      'void refreshNow()',
      'refreshSkipped(quint64 totalSkipped)'
    ]) assert(bridgeHeader.includes(token), `Bridge header must contain ${token}`);

    for (const token of [
      'Qt::PreciseTimer',
      'trySnapshot(snapshot, m_windowSamples)',
      'QThread::currentThread() != m_plot->thread()',
      'applySignalBatch(m_plot.data(), samples, 0)',
      'Compatibility fallback for SignalPlot classes generated before QPM 0.22.0',
      'setSampleInterval(snapshot.sampleInterval)'
    ]) assert(bridgeSource.includes(token), `Bridge source must contain ${token}`);

    assert(read('README.md').includes('QPM 0.22.0 — Real-time acquisition buffer'));
    assert(read('CHANGELOG.md').includes('## 0.22.0 — Thread-safe acquisition and SignalPlot bridge'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.22.0 real-time acquisition tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
