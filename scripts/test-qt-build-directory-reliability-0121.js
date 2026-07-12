'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const direct = require('../out/services/qpmQtDirectBuildService.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-build-dir-0121-'));
try {
  const generated = path.join(root, 'build', 'debug', 'generated');
  const objectDirectory = path.join(root, 'build', 'debug', 'obj');
  const directories = direct.qtGenerationOutputDirectories({
    generatedDirectory: generated,
    generationSteps: [
      { outputPath: path.join(generated, 'ui_mainwindow.h') },
      { outputPath: path.join(generated, 'qrc_resources.cpp') },
      { outputPath: path.join(objectDirectory, 'qpm_product_metadata.o') }
    ]
  });
  assert(directories.includes(path.normalize(generated)), 'generated directory missing');
  assert(directories.includes(path.normalize(objectDirectory)), 'windres object directory missing');
  assert.strictEqual(directories.length, 2, 'generation output directories should be deduplicated');

  const buildSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmBuildService.ts'), 'utf8');
  assert(buildSource.includes('qtGenerationOutputDirectories(plan)'), 'native preparation does not ensure every code-generation output parent');
  assert(buildSource.includes('createDirectoryParentFirst(normalized)'), 'robust parent-first directory creation missing');
  assert(buildSource.includes('tryCreateDirectoryWithWindowsShell(normalized)'), 'Windows mkdir fallback missing');

  const cppToolsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmCppToolsService.ts'), 'utf8');
  assert(!/fs\.mkdirSync\(generatedDirectory/.test(cppToolsSource), 'IntelliSense still mutates the generated build directory');

  const originalLoad = Module._load;
  class EventEmitter { constructor(){ this.event = () => ({ dispose(){} }); } fire(){} dispose(){} }
  Module._load = function patched(request, parent, isMain) {
    if (request === 'vscode') return {
      EventEmitter,
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), openTextDocument: async () => ({}) },
      window: {
        createOutputChannel: () => ({ appendLine(){}, append(){}, show(){}, clear(){}, dispose(){} }),
        showErrorMessage(){}, showWarningMessage(){}, showInformationMessage(){}, showTextDocument: async () => undefined
      },
      commands: { executeCommand: async () => undefined },
      Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const manifestApi = require('../out/model/qtProjectManifest.js');
    const installerApi = require('../out/services/qpmQtInstallerService.js');
    const innoRoot = path.join(root, 'Inno Setup 6');
    fs.mkdirSync(innoRoot, { recursive: true });
    const guiCompiler = path.join(innoRoot, 'Compil32.exe');
    const cliCompiler = path.join(innoRoot, 'ISCC.exe');
    fs.writeFileSync(guiCompiler, 'gui');
    fs.writeFileSync(cliCompiler, 'cli');
    const manifest = manifestApi.createDefaultQtProjectManifest('DirectoryFix', 'widgets-application');
    manifest.packaging.installer.inno.isccPath = guiCompiler;
    const tools = installerApi.detectQtInstallerTools(manifest);
    assert.strictEqual(path.normalize(tools.iscc), path.normalize(cliCompiler), 'Compil32.exe should resolve to sibling ISCC.exe');
  } finally {
    Module._load = originalLoad;
  }

  console.log('QPM 0.12.1 Windows build-directory and Inno compiler reliability: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
