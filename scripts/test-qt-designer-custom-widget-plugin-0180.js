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

const serviceSource = read('src/services/qpmQtDesignerWidgetService.ts');
assert(serviceSource.includes('QDesignerCustomWidgetInterface'), 'Designer plugin must expose QDesignerCustomWidgetInterface');
assert(serviceSource.includes('QDesignerCustomWidgetCollectionInterface'), 'multiple project widgets must be exported through a collection interface');
assert(serviceSource.includes('Q_PLUGIN_METADATA(IID \\"org.qt-project.Qt.QDesignerCustomWidgetCollectionInterface\\")'), 'collection plugin must export Qt Designer metadata');
assert(serviceSource.includes("'QT += widgets uiplugin'"), 'qmake project must link the Qt UiPlugin abstraction');
assert(serviceSource.includes("'QPM Instrumentation'"), 'default Widget Box group must be QPM Instrumentation');
assert(serviceSource.includes("path.join(runtimeRoot, 'designer')"), 'local plugin output must use the designer/ plugin subdirectory');
assert(serviceSource.includes('resolveDesignerKit'), 'plugin build must resolve the Qt kit that owns the selected Designer when possible');
assert(serviceSource.includes('captureWindowsEnvironment'), 'MSVC Designer kits must be buildable through a captured Visual Studio environment');

const projectSource = read('src/services/qpmQtProjectService.ts');
assert(projectSource.includes("'.qpm', 'designer-plugins', 'runtime'"), 'normal QPM Designer launch must auto-load the project-local plugin root');
assert(projectSource.includes('extraPluginRoots'), 'Designer launcher must accept additional plugin roots');
assert(projectSource.includes('describeQtRoot(path.dirname(path.dirname(installation.designerPath)))'), 'Designer runtime environment must prefer the actual Designer Qt kit');

const extensionSource = read('src/extension.ts');
for (const command of [
  'qpm.configureQtDesignerWidgets',
  'qpm.buildQtDesignerWidgets',
  'qpm.installQtDesignerWidgets',
  'qpm.openQtDesignerWithCustomWidgets',
  'qpm.cleanQtDesignerWidgets',
  'qpm.revealQtDesignerWidgets'
]) {
  assert(extensionSource.includes(`register('${command}'`), `${command} must be registered`);
  assert(pkg.contributes.commands.some((entry) => entry.command === command), `${command} must be contributed`);
}
assert(pkg.contributes.menus['qpm.projectQtTools'].some((entry) => entry.command === 'qpm.configureQtDesignerWidgets'), 'project Qt Tools menu must expose Designer widget configuration');
assert(pkg.contributes.menus['qpm.projectQtTools'].some((entry) => entry.command === 'qpm.buildQtDesignerWidgets'), 'project Qt Tools menu must expose plugin build');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      window: {
        showInformationMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showQuickPick: async () => undefined,
        showInputBox: async () => undefined
      },
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
      },
      commands: { executeCommand: async () => undefined },
      Uri: { file: (fsPath) => ({ fsPath }) }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(() => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-designer-plugin-'));
  try {
    const model = require(path.join(root, 'out/model/qtProjectManifest.js'));
    const service = require(path.join(root, 'out/services/qpmQtDesignerWidgetService.js'));
    fs.mkdirSync(path.join(tempRoot, 'include', 'widgets'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src', 'widgets'), { recursive: true });
    const header = path.join(tempRoot, 'include', 'widgets', 'signal_plot.h');
    const source = path.join(tempRoot, 'src', 'widgets', 'signal_plot.cpp');
    fs.writeFileSync(header, '#pragma once\n#include <QWidget>\nclass SignalPlot final : public QWidget { Q_OBJECT public: explicit SignalPlot(QWidget *parent = nullptr); };\n', 'utf8');
    fs.writeFileSync(source, '#include "widgets/signal_plot.h"\nSignalPlot::SignalPlot(QWidget *parent) : QWidget(parent) {}\n', 'utf8');

    const manifest = model.createDefaultQtProjectManifest('SignalApp', 'widgets-application');
    manifest.files.headers.push('include/widgets/signal_plot.h');
    manifest.files.sources.push('src/widgets/signal_plot.cpp');
    const manifestPath = path.join(tempRoot, 'SignalApp.qtproject.json');
    model.writeQtProjectManifest(manifestPath, manifest);

    const discovered = service.discoverQpmDesignerWidgets(manifestPath);
    assert.strictEqual(discovered.length, 1, 'Q_OBJECT QWidget must be discovered for Designer exposure');
    assert.strictEqual(discovered[0].className, 'SignalPlot');
    assert.strictEqual(discovered[0].includeFile, 'widgets/signal_plot.h');

    const layout = service.generateQpmDesignerPluginProject(tempRoot, {
      schemaVersion: 1,
      group: 'QPM Instrumentation',
      widgets: [{
        className: 'SignalPlot',
        header: 'include/widgets/signal_plot.h',
        source: 'src/widgets/signal_plot.cpp',
        includeFile: 'widgets/signal_plot.h',
        displayName: 'Signal Plot',
        toolTip: 'Realtime signal plot'
      }]
    });
    assert(fs.existsSync(layout.projectFile), 'qmake Designer plugin project must be generated');
    const pro = fs.readFileSync(layout.projectFile, 'utf8');
    const cpp = fs.readFileSync(path.join(layout.sourceDirectory, 'qpm_designer_widgets.cpp'), 'utf8');
    const h = fs.readFileSync(path.join(layout.sourceDirectory, 'qpm_designer_widgets.h'), 'utf8');
    assert(pro.includes('QT += widgets uiplugin'));
    assert(pro.includes('CONFIG += plugin release c++17'));
    assert(pro.includes('designer'));
    assert(cpp.includes('return new SignalPlot(parent);'));
    assert(cpp.includes('QStringLiteral("QPM Instrumentation")'));
    assert(h.includes('Q_PLUGIN_METADATA(IID "org.qt-project.Qt.QDesignerCustomWidgetCollectionInterface")'));
    assert(h.includes('Q_INTERFACES(QDesignerCustomWidgetCollectionInterface)'));
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  console.log('QPM 0.18.0 Qt Designer custom-widget plugin tests: PASS');
})();
