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
assert(templatesSource.includes("label: 'Qt Widget / QObject class'"), 'Qt creation UI must clearly expose the C++ class workflow');
assert(templatesSource.includes("label: 'Designer Form Only (.ui)'"), 'standalone .ui creation must be explicitly labelled UI-only');
assert(templatesSource.includes("label: 'QDialog + UI'"), 'QDialog + UI must remain a first-class creation choice');
assert(templatesSource.includes('convertQtDesignerFormToClass'), 'template service must support wrapping an existing Designer form');
assert(templatesSource.includes('inspectQtDesignerForm'), 'conversion must detect the Designer class and root widget type');

const workspaceSource = read('src/services/qpmWorkspaceService.ts');
assert(workspaceSource.includes('convertQtFormToClass'), 'workspace service must orchestrate Designer form conversion');
assert(workspaceSource.includes('this.qtProjects.addFiles(ref.absolutePath, generated.files)'), 'generated .h/.cpp files must be added to the native Qt manifest');
assert(workspaceSource.includes('findProjectRefForPath'), 'Explorer/editor conversion must resolve the owning Qt project');

const extensionSource = read('src/extension.ts');
assert(extensionSource.includes("register('qpm.convertQtFormToClass'"), 'conversion command must be registered');
assert(extensionSource.includes('await builds.prepareNativeQtGeneratedFiles(convertedRef)'), 'conversion must refresh UIC/MOC artifacts immediately when the direct Qt toolchain is available');

const command = pkg.contributes.commands.find((entry) => entry.command === 'qpm.convertQtFormToClass');
assert(command, 'conversion command must be contributed');
const viewContext = pkg.contributes.menus['view/item/context'];
assert(viewContext.some((entry) => entry.command === 'qpm.convertQtFormToClass' && String(entry.when).includes('qpmFile\\.form')), 'QPM Workspace .ui files must expose conversion in their context menu');
assert(pkg.contributes.menus['qpm.editorQtTools'].some((entry) => entry.command === 'qpm.convertQtFormToClass' && String(entry.when).includes('resourceExtname == .ui')), 'editor QPM menu must expose conversion for .ui files');
assert(pkg.contributes.menus['qpm.explorerRoot'].some((entry) => entry.command === 'qpm.convertQtFormToClass' && String(entry.when).includes('resourceExtname == .ui')), 'VS Code Explorer QPM menu must expose conversion for .ui files');

// Functional check of the class wrapper generator. Mock only the VS Code API
// surface reached by this conversion path.
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      window: {
        showErrorMessage: async () => undefined,
        showWarningMessage: async () => undefined
      },
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-form-class-'));
  const formDir = path.join(tempRoot, 'forms');
  fs.mkdirSync(formDir, { recursive: true });
  const formPath = path.join(formDir, 'dialog_electro_stat.ui');
  const formContents = `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>DialogElectroStat</class>\n <widget class="QDialog" name="DialogElectroStat">\n  <property name="windowTitle"><string>Electro stat</string></property>\n </widget>\n <resources/>\n <connections/>\n</ui>\n`;
  fs.writeFileSync(formPath, formContents, 'utf8');

  try {
    const { QpmTemplateService } = require(path.join(root, 'out/services/qpmTemplateService.js'));
    const output = { appendLine: () => undefined };
    const service = new QpmTemplateService({ globalStorageUri: { fsPath: tempRoot }, extensionPath: root }, {}, output);
    const result = await service.convertQtDesignerFormToClass(tempRoot, formPath);
    assert(result, 'QDialog form conversion must succeed');

    const headerPath = path.join(tempRoot, 'include', 'dialog_electro_stat.h');
    const sourcePath = path.join(tempRoot, 'src', 'dialog_electro_stat.cpp');
    assert(fs.existsSync(headerPath), 'conversion must create the C++ header');
    assert(fs.existsSync(sourcePath), 'conversion must create the C++ source');
    assert(result.files.includes(formPath), 'existing .ui form must remain part of the generated project references');

    const header = fs.readFileSync(headerPath, 'utf8');
    const source = fs.readFileSync(sourcePath, 'utf8');
    assert(header.includes('class DialogElectroStat final : public QDialog'), 'header must preserve the Designer QDialog root type');
    assert(header.includes('Q_OBJECT'), 'generated wrapper must participate in Qt MOC');
    assert(source.includes('#include "ui_dialog_electro_stat.h"'), 'source must include the UIC artifact derived from the actual .ui file name');
    assert(source.includes('DialogElectroStat::DialogElectroStat(QWidget *parent)'), 'source must construct the detected Designer class');
    assert.strictEqual(fs.readFileSync(formPath, 'utf8'), formContents, 'conversion must not rewrite or destroy the existing Designer form');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('QPM 0.17.9 Designer form to Qt C++ class conversion tests: PASS');
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
