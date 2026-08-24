'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback, update: async () => undefined })
      },
      ConfigurationTarget: { Global: 1, Workspace: 2 }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const model = require('../out/model/qtProjectManifest');
const qtInstallations = require('../out/services/qpmQtInstallationService');
const direct = require('../out/services/qpmQtDirectBuildService');
const { QpmQtProjectService } = require('../out/services/qpmQtProjectService');

function touch(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qt-direct-'));
try {
  const qtBase = path.join(root, 'Qt');
  const qtRoot = path.join(qtBase, '6.8.3', 'mingw_64');
  for (const tool of ['moc', 'uic', 'rcc', 'qmake', 'windeployqt', 'designer']) touch(path.join(qtRoot, 'bin', tool));
  for (const module of ['Core', 'Gui', 'Widgets', 'Network']) fs.mkdirSync(path.join(qtRoot, 'include', `Qt${module}`), { recursive: true });
  for (const library of ['Core', 'Gui', 'Widgets', 'Network']) touch(path.join(qtRoot, 'lib', `libQt6${library}.a`));
  touch(path.join(qtRoot, 'lib', 'libQt6EntryPoint.a'));
  touch(path.join(qtRoot, 'bin', 'Qt6Core.dll'));
  touch(path.join(qtRoot, 'lib', 'Qt6EntryPoint.prl'), 'QMAKE_PRL_LIBS = -lshell32 -luser32\n');
  fs.mkdirSync(path.join(qtRoot, 'mkspecs', 'win32-g++'), { recursive: true });
  const toolBin = path.join(qtBase, 'Tools', 'mingw1310_64', 'bin');
  for (const tool of ['g++', 'gcc', 'ar', 'gdb', 'mingw32-make']) touch(path.join(toolBin, tool));

  const installation = qtInstallations.describeQtRoot(qtRoot);
  assert(installation, 'Qt installation should be detected');
  assert.strictEqual(installation.version, '6.8.3');
  assert.strictEqual(installation.compilerFamily, 'mingw');
  assert.strictEqual(installation.architecture, 'x64');
  assert(installation.toolchain.cppCompilerPath.endsWith(path.join('bin', 'g++')));

  const projectRoot = path.join(root, 'Project');
  const manifestPath = path.join(projectRoot, 'Demo.qtproject.json');
  touch(path.join(projectRoot, 'src', 'main.cpp'), '#include "mainwindow.h"\nint main(){ return 0; }\n');
  touch(path.join(projectRoot, 'src', 'mainwindow.cpp'), '#include "mainwindow.h"\n#include "ui_mainwindow.h"\n');
  touch(path.join(projectRoot, 'include', 'mainwindow.h'), '#pragma once\n#include <QMainWindow>\nclass MainWindow : public QMainWindow { Q_OBJECT };\n');
  touch(path.join(projectRoot, 'forms', 'mainwindow.ui'), '<ui version="4.0"><class>MainWindow</class><widget class="QMainWindow" name="MainWindow"/></ui>\n');
  touch(path.join(projectRoot, 'resources', 'resources.qrc'), '<RCC><qresource prefix="/"/></RCC>\n');

  const manifest = model.createDefaultQtProjectManifest('Demo', 'widgets-application', ['Widgets', 'Network']);
  manifest.qt.installation = qtRoot;
  manifest.files.sources = ['src/main.cpp', 'src/mainwindow.cpp'];
  manifest.files.headers = ['include/mainwindow.h'];
  manifest.files.forms = ['forms/mainwindow.ui'];
  manifest.files.resources = ['resources/resources.qrc'];
  model.writeQtProjectManifest(manifestPath, manifest);

  const plan = direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation);
  assert.deepStrictEqual(direct.resolveQtModuleOrder(['Widgets', 'Network']), ['Widgets', 'Gui', 'Network', 'Core']);
  assert.strictEqual(plan.generationSteps.filter(step => step.kind === 'moc-header').length, 1);
  assert.strictEqual(plan.generationSteps.filter(step => step.kind === 'uic').length, 1);
  assert.strictEqual(plan.generationSteps.filter(step => step.kind === 'rcc').length, 1);
  assert(plan.generatedSourceFiles.some(file => path.basename(file).startsWith('moc_mainwindow')));
  assert(plan.generatedSourceFiles.some(file => path.basename(file).startsWith('qrc_resources')));
  assert(plan.generatedHeaderFiles.some(file => path.basename(file) === 'ui_mainwindow.h'));
  assert(plan.qtLibraries.includes('Qt6Widgets'));
  assert(plan.qtLibraries.includes('Qt6Core'));
  assert(plan.includeDirectories.includes(path.join(qtRoot, 'include', 'QtWidgets')));

  const compileArgs = direct.qtCompileArguments(plan, plan.sourceFiles[0], direct.qtObjectPathForSource(plan, plan.sourceFiles[0]));
  assert(compileArgs.includes('-std=c++17'));
  assert(compileArgs.includes('-DQT_WIDGETS_LIB'));
  assert(compileArgs.includes(path.join(qtRoot, 'include', 'QtCore')));

  const linkArgs = direct.qtLinkArguments(plan, ['/tmp/main.o']);
  assert(linkArgs.includes('-lQt6Widgets'));
  assert(linkArgs.includes('-lQt6Core'));
  assert.deepStrictEqual(plan.entryPointArguments, []);

  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const windowsPlan = direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation);
    assert(windowsPlan.defines.includes('QT_NEEDS_QMAIN'));
    assert(windowsPlan.defines.includes('UNICODE'));
    assert(windowsPlan.entryPointArguments.includes('-lmingw32'));
    assert(windowsPlan.entryPointArguments.some(value => value.endsWith('libQt6EntryPoint.a')));
    assert(windowsPlan.platformLibraries.includes('-lshell32'));
    assert(windowsPlan.platformLibraries.includes('-luser32'));
    assert(windowsPlan.targetPath.endsWith('.exe'));
    const windowsLinkArgs = direct.qtLinkArguments(windowsPlan, ['main.o']);
    assert(windowsLinkArgs.includes('-mwindows'));
    assert(windowsLinkArgs.indexOf('-lmingw32') < windowsLinkArgs.indexOf('-lQt6Widgets'));
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
  }


  const rawWithoutAutoDeploy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  delete rawWithoutAutoDeploy.qt.autoDeploy;
  assert.strictEqual(model.validateAndNormalizeManifest(rawWithoutAutoDeploy, manifestPath).qt.autoDeploy, false);
  assert.throws(() => model.validateAndNormalizeManifest({ ...rawWithoutAutoDeploy, targetName: '../escape' }, manifestPath), /targetName/);
  assert.throws(() => model.validateAndNormalizeManifest({ ...rawWithoutAutoDeploy, targetName: 'CON' }, manifestPath), /targetName/);
  assert.throws(() => model.validateAndNormalizeManifest({ ...rawWithoutAutoDeploy, targetName: 'Demo ' }, manifestPath), /targetName/);
  assert.throws(() => model.validateAndNormalizeManifest({ ...rawWithoutAutoDeploy, build: { ...rawWithoutAutoDeploy.build, outputDirectory: '../outside' } }, manifestPath), /must stay inside/);

  const incompatibleMajor = model.readQtProjectManifest(manifestPath);
  incompatibleMajor.qt.majorVersion = 5;
  model.writeQtProjectManifest(manifestPath, incompatibleMajor);
  assert.throws(() => direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation), /requires Qt 5/);
  incompatibleMajor.qt.majorVersion = 'auto';
  model.writeQtProjectManifest(manifestPath, incompatibleMajor);
  assert.throws(() => direct.createQtDirectBuildPlan(manifestPath, 'debug', installation), /32-bit, but the selected Qt kit is x64/);

  const missingModule = model.readQtProjectManifest(manifestPath);
  missingModule.qt.modules.push('SerialPort');
  model.writeQtProjectManifest(manifestPath, missingModule);
  assert.throws(() => direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation), /module SerialPort is not installed/);
  missingModule.qt.modules = missingModule.qt.modules.filter(module => module !== 'SerialPort');
  model.writeQtProjectManifest(manifestPath, missingModule);

  const projectService = new QpmQtProjectService({}, { appendLine: () => undefined });
  const sharedRoot = path.join(root, 'SharedLibrary');
  const sharedManifestPath = projectService.createProject(sharedRoot, 'SignalTools', 'shared-library', ['Core'], qtRoot);
  const sharedManifest = model.readQtProjectManifest(sharedManifestPath);
  assert(sharedManifest.defines.includes('SIGNALTOOLS_LIBRARY'));
  assert(fs.readFileSync(path.join(sharedRoot, 'include', 'signaltools.h'), 'utf8').includes('SIGNALTOOLS_EXPORT Q_DECL_EXPORT'));
  assert(path.basename(model.qtTargetPath(sharedManifestPath, 'debug64', { ...sharedManifest, kind: 'static-library' })).startsWith('lib'));
  const sharedPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const sharedPlan = direct.createQtDirectBuildPlan(sharedManifestPath, 'debug64', installation);
    assert(sharedPlan.targetPath.endsWith('.dll'));
    assert(sharedPlan.importLibraryPath.endsWith('.dll.a'));
    const sharedLinkArgs = direct.qtLinkArguments(sharedPlan, ['signaltools.o']);
    assert(sharedLinkArgs.includes('-shared'));
    assert(sharedLinkArgs.some(value => value.startsWith('-Wl,--out-implib,')));
    assert(!sharedPlan.defines.includes('QT_NEEDS_QMAIN'));
  } finally {
    Object.defineProperty(process, 'platform', sharedPlatformDescriptor);
  }

  const widgetsRoot = path.join(root, 'WidgetsTemplate');
  projectService.createProject(widgetsRoot, 'WidgetsTemplate', 'widgets-application', ['Widgets'], qtRoot);
  const starterUi = fs.readFileSync(path.join(widgetsRoot, 'forms', 'mainwindow.ui'), 'utf8');
  assert(starterUi.includes('<widget class="QWidget" name="centralWidget"/>'));
  assert(!starterUi.includes('<layout class="QVBoxLayout"'), 'New QPM Widgets forms must allow free positioning before the user applies a layout');

  const quickRoot = path.join(root, 'QuickTemplate');
  projectService.createProject(quickRoot, 'QuickTemplate', 'quick-application', ['QuickControls2'], qtRoot);
  assert(fs.readFileSync(path.join(quickRoot, 'src', 'main.cpp'), 'utf8').includes('engine.rootObjects().isEmpty()'));

  const localMetaSource = path.join(projectRoot, 'src', 'localobject.cpp');
  touch(localMetaSource, '#include <QObject>\nclass Local : public QObject { Q_OBJECT };\n');
  const invalid = model.readQtProjectManifest(manifestPath);
  invalid.files.sources.push('src/localobject.cpp');
  model.writeQtProjectManifest(manifestPath, invalid);
  assert.throws(() => direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation), /does not include "localobject\.moc"/);

  const addedHeader = path.join(projectRoot, 'include', 'extra.hpp');
  touch(addedHeader, '#pragma once\n');
  assert.strictEqual(model.addFilesToQtManifest(manifestPath, [addedHeader]), 1);
  assert(model.readQtProjectManifest(manifestPath).files.headers.includes('include/extra.hpp'));
  assert.strictEqual(model.removeFileFromQtManifest(manifestPath, addedHeader), true);
  assert(!model.readQtProjectManifest(manifestPath).files.headers.includes('include/extra.hpp'));

  console.log('QPM 0.2.0 direct Qt build planner tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  Module._load = originalLoad;
}
