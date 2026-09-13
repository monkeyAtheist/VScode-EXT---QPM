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
assert(source.includes('#include "widgets/signal_plot.h"'));

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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qpointer-0292-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'include', 'widgets'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'include', 'widgets', 'signal_plot.h'), `#pragma once\n#include <QWidget>\nclass SignalPlot final : public QWidget { public: explicit SignalPlot(QWidget *p=nullptr): QWidget(p) {} };\n`);

    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, { appendLine: () => undefined });
    selectionQueue = ['group-qt', 'qt-realtime-acquisition'];
    const result = await service.generateNewFiles(tempRoot);
    assert(result, 'Realtime acquisition generation must succeed');

    const header = fs.readFileSync(path.join(tempRoot, 'include', 'instrumentation', 'qpm_signal_plot_bridge.h'), 'utf8');
    assert(header.includes('#include "widgets/signal_plot.h"'));
    assert(header.includes('QPointer<SignalPlot> m_plot;'));
    assert(header.includes('SignalPlot *signalPlot() const noexcept { return m_plot.data(); }'));
    assert(!header.includes('class SignalPlot;'));
    assert(header.includes('#include <limits>'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.29.2 SignalPlot bridge QPointer regression: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
