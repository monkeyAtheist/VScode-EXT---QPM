'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: { showWarningMessage: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-ui-module-clean-0151-'));
(async () => {
  try {
    const model = require('../out/model/qtProjectManifest.js');
    const inference = require('../out/services/qpmQtModuleInference.js');
    const direct = require('../out/services/qpmQtDirectBuildService.js');
    const cleanup = require('../out/services/qpmBuildCleanup.js');

    const projectRoot = path.join(temp, 'OpenGLUiApp');
    const forms = path.join(projectRoot, 'forms');
    const src = path.join(projectRoot, 'src');
    const include = path.join(projectRoot, 'include');
    fs.mkdirSync(forms, { recursive: true });
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(include, { recursive: true });
    fs.writeFileSync(path.join(forms, 'mainwindow.ui'), `<?xml version="1.0"?><ui version="4.0"><class>MainWindow</class><widget class="QMainWindow" name="MainWindow"><widget class="QOpenGLWidget" name="openGLWidget"/></widget><resources/><connections/></ui>`);
    fs.writeFileSync(path.join(src, 'main.cpp'), '#include <QApplication>\nint main(int argc,char**argv){QApplication app(argc,argv);return 0;}\n');
    fs.writeFileSync(path.join(include, 'mainwindow.h'), '#pragma once\n');

    const manifest = model.createDefaultQtProjectManifest('OpenGLUiApp', 'widgets-application');
    manifest.qt.modules = ['Core', 'Gui', 'Widgets'];
    manifest.files.sources = ['src/main.cpp'];
    manifest.files.headers = ['include/mainwindow.h'];
    manifest.files.forms = ['forms/mainwindow.ui'];
    manifest.packaging.enabled = false;
    const manifestPath = path.join(projectRoot, 'OpenGLUiApp.qtproject.json');
    model.writeQtProjectManifest(manifestPath, manifest);

    const detected = inference.inferQtModulesFromProject(manifestPath, manifest);
    assert(detected.modules.includes('OpenGLWidgets'), 'QOpenGLWidget in a .ui file must infer Qt OpenGL Widgets');
    const evidence = detected.evidence.find((entry) => entry.module === 'OpenGLWidgets');
    assert(evidence && evidence.files.includes('forms/mainwindow.ui'));
    assert(evidence.symbols.includes('QOpenGLWidget'));

    const qtRoot = path.join(temp, 'Qt', '6.11.0', 'mingw_64');
    const binDir = path.join(qtRoot, 'bin');
    const includeDir = path.join(qtRoot, 'include');
    const libDir = path.join(qtRoot, 'lib');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    for (const module of ['Core', 'Gui', 'Widgets', 'OpenGL', 'OpenGLWidgets']) {
      fs.mkdirSync(path.join(includeDir, `Qt${module}`), { recursive: true });
      fs.writeFileSync(path.join(libDir, `libQt6${module}.a`), 'fake');
    }
    for (const tool of ['moc', 'uic', 'rcc', 'g++']) fs.writeFileSync(path.join(binDir, tool), 'fake');
    const installation = {
      id: 'qt611', label: 'Qt 6.11.0 — mingw_64', root: qtRoot, version: '6.11.0', majorVersion: 6,
      architecture: 'x64', compilerFamily: 'mingw', binDir, includeDir, libDir,
      mocPath: path.join(binDir, 'moc'), uicPath: path.join(binDir, 'uic'), rccPath: path.join(binDir, 'rcc'),
      toolchain: {
        family: 'mingw', compatibility: 'compatible', cppCompilerPath: path.join(binDir, 'g++'),
        binDir, detectedArchitecture: 'x64'
      }
    };
    const plan = direct.createQtDirectBuildPlan(manifestPath, 'debug64', installation);
    assert(plan.qtLibraries.includes('Qt6OpenGLWidgets'), 'direct link plan must add Qt6OpenGLWidgets');
    assert(plan.qtLibraries.includes('Qt6OpenGL'), 'OpenGLWidgets dependency must add Qt6OpenGL');
    assert(plan.autoDetectedModules.some((entry) => entry.startsWith('OpenGLWidgets')));
    assert(direct.qtLinkArguments(plan, []).includes('-lQt6OpenGLWidgets'));

    const modeDirectory = path.join(projectRoot, 'build', 'debug');
    const generatedDirectory = path.join(modeDirectory, 'generated');
    const objectDirectory = path.join(modeDirectory, 'obj');
    fs.mkdirSync(generatedDirectory, { recursive: true });
    fs.mkdirSync(objectDirectory, { recursive: true });
    fs.writeFileSync(path.join(generatedDirectory, 'ui_mainwindow.h'), 'old');
    fs.writeFileSync(path.join(objectDirectory, 'main.o'), 'old');
    fs.writeFileSync(path.join(modeDirectory, 'OpenGLUiApp.exe'), 'old');
    const cleanResult = await cleanup.cleanQtDirectModeDirectory({ modeDirectory, requiredDirectories: [generatedDirectory, objectDirectory], retryDelayMs: 5 });
    assert.strictEqual(cleanResult.success, true);
    assert(['rename', 'in-place'].includes(cleanResult.strategy));
    if (cleanResult.strategy === 'in-place') {
      assert(fs.statSync(generatedDirectory).isDirectory(), 'in-place clean must preserve generated directory root');
      assert(fs.statSync(objectDirectory).isDirectory(), 'in-place clean must preserve object directory root');
    } else {
      assert(!fs.existsSync(generatedDirectory), 'atomic clean must leave directory recreation to the next build');
      assert(!fs.existsSync(objectDirectory), 'atomic clean must leave directory recreation to the next build');
    }
    assert(!fs.existsSync(path.join(modeDirectory, 'OpenGLUiApp.exe')));
    assert(!fs.existsSync(path.join(objectDirectory, 'main.o')));

    const buildSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
    for (const marker of ['stopApplicationsForTarget', 'trackLaunchedApplication', 'cleanQtDirectModeDirectory', 'taskkill.exe', 'Get-CimInstance Win32_Process']) {
      assert(buildSource.includes(marker), `build cleanup/process marker missing: ${marker}`);
    }
    const backendSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtBuildBackendService.ts'), 'utf8');
    assert(backendSource.includes('effectiveQtModules(context.manifestPath, context.manifest)'), 'generated qmake/CMake backends must use inferred modules');
    const cppToolsSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmCppToolsService.ts'), 'utf8');
    assert(cppToolsSource.includes('effectiveQtModules(activeRef.absolutePath, manifest)'), 'IntelliSense must use inferred modules');

    console.log('QPM 0.15.1 Qt Designer module inference and Windows clean reliability: PASS');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
