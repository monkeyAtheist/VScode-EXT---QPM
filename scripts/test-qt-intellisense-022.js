'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

function touch(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}
function normalize(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase();
}
function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-qt-intellisense-'));
const workspaceRoot = path.join(root, 'Qt_Test2');
const projectRoot = path.join(workspaceRoot, 'QtWidgetsApp');
const workspacePath = path.join(workspaceRoot, 'Qt_Workspace.cws');
const manifestPath = path.join(projectRoot, 'QtWidgetsApp.qtproject.json');
const mainPath = path.join(projectRoot, 'src', 'main.cpp');
const headerPath = path.join(projectRoot, 'include', 'mainwindow.h');
const qtRoot = path.join(root, 'Qt', 'Qt6.11.0', '6.11.0', 'mingw_64');
const qtToolBin = path.join(root, 'Qt', 'Qt6.11.0', 'Tools', 'mingw1310_64', 'bin');
const compilerPath = path.join(qtToolBin, 'g++');

for (const directory of [
  path.join(qtRoot, 'include'),
  path.join(qtRoot, 'include', 'QtCore'),
  path.join(qtRoot, 'include', 'QtGui'),
  path.join(qtRoot, 'include', 'QtWidgets'),
  path.join(qtRoot, 'mkspecs', 'win32-g++'),
  path.join(qtRoot, 'lib'),
  path.join(qtRoot, 'bin'),
  path.join(projectRoot, 'include'),
  path.join(projectRoot, 'src')
]) fs.mkdirSync(directory, { recursive: true });

touch(path.join(qtRoot, 'include', 'QtWidgets', 'QApplication'), '// QApplication');
touch(path.join(qtRoot, 'include', 'QtWidgets', 'QMainWindow'), '// QMainWindow');
touch(path.join(qtRoot, 'include', 'QtCore', 'QObject'), '// QObject');
touch(path.join(qtRoot, 'mkspecs', 'win32-g++', 'qplatformdefs.h'), '// mkspec');
for (const library of ['Qt6Widgets', 'Qt6Gui', 'Qt6Core']) touch(path.join(qtRoot, 'lib', `lib${library}.a`), '');
touch(compilerPath, '');
touch(path.join(qtToolBin, 'gcc'), '');
touch(path.join(qtToolBin, 'gdb'), '');
touch(path.join(qtToolBin, 'ar'), '');
touch(mainPath, '#include <QApplication>\n#include "mainwindow.h"\n');
touch(headerPath, '#include <QMainWindow>\n');
touch(workspacePath, '');
touch(manifestPath, JSON.stringify({
  schemaVersion: 1,
  name: 'QtWidgetsApp',
  kind: 'widgets-application',
  targetName: 'QtWidgetsApp',
  qt: {
    installation: qtRoot,
    majorVersion: 6,
    modules: ['Widgets'],
    autoMoc: true,
    autoUic: true,
    autoRcc: true,
    autoDeploy: false
  },
  build: {
    system: 'direct',
    cppStandard: 'c++17',
    outputDirectory: 'build',
    generatedDirectory: 'generated',
    debug: { defines: ['QT_DEBUG'], compilerFlags: ['-O0', '-g'], linkerFlags: [] },
    release: { defines: ['QT_NO_DEBUG'], compilerFlags: ['-O2'], linkerFlags: [] }
  },
  files: {
    sources: ['src/main.cpp'],
    headers: ['include/mainwindow.h'],
    forms: [],
    resources: [],
    qml: [],
    translations: [],
    other: []
  },
  includeDirectories: ['include'],
  libraryDirectories: [],
  libraries: [],
  defines: ['QT_WIDGETS_LIB']
}, null, 2));

const settings = {
  autoConfigureCppTools: true,
  autoAddQpmFolderToWorkspace: true,
  useCppToolsConfigurationProvider: false,
  intelliSenseCompilerPath: path.join(root, 'Legacy', 'mingw32', 'bin', 'g++'),
  additionalIncludePaths: [],
  sdlEnabled: 'off',
  sdlRootPath: '',
  sdlPackages: [],
  buildMode: 'debug64'
};
let workspaceFolders = [{ uri: { scheme: 'file', fsPath: workspaceRoot }, name: 'Qt_Test2', index: 0 }];
const executedCommands = [];
const outputLines = [];

const vscodeMock = {
  workspace: {
    getConfiguration: () => ({
      get: (key, fallback) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback,
      inspect: () => undefined,
      update: async (key, value) => { settings[key] = value; }
    }),
    get workspaceFolders() { return workspaceFolders; },
    getWorkspaceFolder: (uri) => workspaceFolders.find((folder) => inside(uri.fsPath, folder.uri.fsPath)),
    updateWorkspaceFolders: (_start, _deleteCount, ...items) => {
      workspaceFolders.push(...items.map((item, index) => ({ uri: item.uri, name: item.name, index: workspaceFolders.length + index })));
      return true;
    }
  },
  Uri: { file: (fsPath) => ({ scheme: 'file', fsPath: path.resolve(fsPath) }) },
  commands: { executeCommand: async (command) => { executedCommands.push(command); } },
  extensions: { getExtension: () => undefined },
  window: {
    activeTextEditor: undefined,
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const { QpmCppToolsService } = require('../out/services/qpmCppToolsService.js');
    const qtInstallation = {
      id: '6.11.0-mingw_64',
      label: 'Qt 6.11.0 — mingw_64 (mingw, x64)',
      root: qtRoot,
      version: '6.11.0',
      majorVersion: 6,
      architecture: 'x64',
      compilerFamily: 'mingw',
      binDir: path.join(qtRoot, 'bin'),
      includeDir: path.join(qtRoot, 'include'),
      libDir: path.join(qtRoot, 'lib'),
      mkspecsDir: path.join(qtRoot, 'mkspecs'),
      mocPath: path.join(qtRoot, 'bin', 'moc'),
      uicPath: path.join(qtRoot, 'bin', 'uic'),
      rccPath: path.join(qtRoot, 'bin', 'rcc'),
      toolchain: {
        family: 'mingw',
        architecture: 'x64',
        detectedArchitecture: 'x64',
        targetTriple: 'x86_64-w64-mingw32',
        compatibility: 'compatible',
        binDir: qtToolBin,
        cCompilerPath: path.join(qtToolBin, 'gcc'),
        cppCompilerPath: compilerPath,
        archiverPath: path.join(qtToolBin, 'ar'),
        debuggerPath: path.join(qtToolBin, 'gdb'),
        source: 'qt-tools'
      }
    };
    const qtInstallations = { getActive: () => qtInstallation };
    const installations = { getActiveInstallation: () => undefined };
    const parser = { parseProject: () => ({ files: [] }) };
    const output = { appendLine: (line) => outputLines.push(line), show: () => undefined };
    const workspace = {
      path: workspacePath,
      name: 'Qt_Workspace',
      activeProjectIndex: 1,
      qpmDir: path.join(workspaceRoot, '.qpm'),
      projects: [{
        index: 1,
        relativePath: path.relative(workspaceRoot, manifestPath),
        absolutePath: manifestPath,
        name: 'QtWidgetsApp',
        exists: true
      }]
    };

    const service = new QpmCppToolsService(installations, qtInstallations, parser, output);
    const configPath = await service.sync(workspace, false);
    assert(configPath, 'c_cpp_properties.json path must be returned');
    assert.strictEqual(normalize(configPath), normalize(path.join(projectRoot, '.vscode', 'c_cpp_properties.json')));
    assert(fs.existsSync(configPath), 'managed IntelliSense configuration must be generated');
    assert(workspaceFolders.some((folder) => normalize(folder.uri.fsPath) === normalize(projectRoot)), 'native Qt project root must be added as an exact workspace folder');
    assert(executedCommands.includes('C_Cpp.RescanWorkspace'), 'Microsoft C/C++ rescan must be requested');

    const document = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const managed = document.configurations.find((entry) => entry.name === 'Qt Project Manager (managed)');
    assert(managed, 'managed Qt configuration must exist');
    assert.strictEqual(normalize(managed.compilerPath), normalize(compilerPath), 'Qt kit compiler must replace stale generic IntelliSense compiler');

    const includes = managed.includePath.map((entry) => entry === '${workspaceFolder}' ? entry : normalize(entry));
    for (const expected of [
      path.join(projectRoot, 'include'),
      path.join(qtRoot, 'include'),
      path.join(qtRoot, 'include', 'QtWidgets'),
      path.join(qtRoot, 'include', 'QtGui'),
      path.join(qtRoot, 'include', 'QtCore'),
      path.join(qtRoot, 'mkspecs', 'win32-g++'),
      path.join(projectRoot, 'build', 'debug', 'generated')
    ]) {
      assert(includes.includes(normalize(expected)), `managed include path missing: ${expected}`);
    }
    assert(managed.defines.includes('QT_WIDGETS_LIB'));
    assert(managed.defines.includes('QT_DEBUG'));
    assert.strictEqual(managed.cppStandard, 'c++17');
    const compileCommandsPath = path.join(projectRoot, 'compile_commands.json');
    assert.strictEqual(normalize(managed.compileCommands), normalize(compileCommandsPath), 'managed configuration must reference the project compile database');
    assert(fs.existsSync(compileCommandsPath), 'compile_commands.json must be generated beside the native Qt manifest');
    const compileCommands = JSON.parse(fs.readFileSync(compileCommandsPath, 'utf8'));
    assert(compileCommands.some((entry) => normalize(entry.file) === normalize(mainPath)), 'compile database must contain main.cpp');
    assert(compileCommands.every((entry) => normalize(entry.directory) === normalize(projectRoot)), 'compile database directory must stay inside the native project root');
    assert(compileCommands.some((entry) => entry.arguments.includes(compilerPath)), 'compile database must use the Qt kit compiler');

    console.log('QPM 0.2.4 Qt IntelliSense synchronization and compile database tests: PASS');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
