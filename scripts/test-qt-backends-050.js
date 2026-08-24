'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const projectRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.6');
const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of ['qpm.manageQtKits','qpm.detectQtKits','qpm.assignQtKit','qpm.selectQtBackend','qpm.importQtBuildProject','qpm.configureQtBackend','qpm.openQtBackendProject']) {
  assert(commands.has(id), `${id} must be contributed`);
}
assert(pkg.contributes.views.qpm.some((view) => view.id === 'qpm.kits'), 'Qt Kits & Backends view must be contributed');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-backends-050-'));
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({})
    },
    window: { showTextDocument: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

function executable(filePath, body) {
  fs.writeFileSync(filePath, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

(async () => {
  try {
    const model = require('../out/model/qtProjectManifest');
    const { QpmQtBuildBackendService } = require('../out/services/qpmQtBuildBackendService');
    const root = path.join(temp, 'BackendApp');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.cpp'), '#include <QCoreApplication>\nint main(int argc,char**argv){QCoreApplication app(argc,argv);return 0;}\n');
    const manifestPath = path.join(root, 'BackendApp.qtproject.json');
    const manifest = model.createDefaultQtProjectManifest('BackendApp', 'console-application', ['Core']);
    manifest.files.sources = ['src/main.cpp'];
    model.setQtInstallationPreference(manifest, path.join(root, 'fake-qt'));
    const kit = model.getActiveQtKitProfile(manifest);
    const debug = model.getActiveQtBuildProfile(manifest, 'debug64');
    debug.parallelJobs = 3;
    debug.precompiledHeader = '';
    debug.unityBuild = true;
    debug.useResponseFiles = true;
    model.writeQtProjectManifest(manifestPath, manifest);
    const migrated = model.readQtProjectManifest(manifestPath);
    assert.strictEqual(migrated.schemaVersion, 17);
    assert.strictEqual(model.getActiveQtBuildProfile(migrated, 'debug64').parallelJobs, 3);
    assert.strictEqual(model.getActiveQtKitProfile(migrated).debuggerType, 'auto');
    const schemaText = fs.readFileSync(path.join(projectRoot, 'schemas', 'qtproject.schema.json'), 'utf8');
    for (const field of ['compilerTargetTriple','compilerVersion','compatibility','diagnostic','qmakePath','cmakePath','buildToolPath','generator']) {
      assert(schemaText.includes(`\"${field}\"`), `schema must expose ${field}`);
    }

    const qmake = executable(path.join(temp, 'qmake'), `
const fs=require('fs'),path=require('path');
const outIndex=process.argv.indexOf('-o');
if(outIndex>=0) fs.writeFileSync(process.argv[outIndex+1], '# generated');
`);
    const make = executable(path.join(temp, 'make'), `
const fs=require('fs'),path=require('path');
fs.mkdirSync(path.dirname(process.env.QPM_TEST_TARGET),{recursive:true});
fs.writeFileSync(process.env.QPM_TEST_TARGET,'qmake-target');
`);
    const cmake = executable(path.join(temp, 'cmake'), `
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2);
if(args[0]==='--build'){
  fs.mkdirSync(path.dirname(process.env.QPM_TEST_TARGET),{recursive:true});
  fs.writeFileSync(process.env.QPM_TEST_TARGET,'cmake-target');
}else{
  const i=args.indexOf('-B'); const build=i>=0?args[i+1]:process.cwd();
  fs.mkdirSync(build,{recursive:true});
  fs.writeFileSync(path.join(build,'compile_commands.json'),'[]');
}
`);
    const fakeQt = path.join(root, 'fake-qt');
    for (const dir of ['bin','include','lib']) fs.mkdirSync(path.join(fakeQt, dir), { recursive: true });
    const installation = {
      id:'fake',label:'Qt 6.11 Fake',root:fakeQt,version:'6.11.0',majorVersion:6,architecture:'x64',compilerFamily:'gcc',
      binDir:path.join(fakeQt,'bin'),includeDir:path.join(fakeQt,'include'),libDir:path.join(fakeQt,'lib'),
      qmakePath:qmake,cmakePath:cmake,
      toolchain:{family:'gcc',architecture:'x64',compatibility:'compatible',cppCompilerPath:'/usr/bin/c++',cCompilerPath:'/usr/bin/cc',makePath:make,source:'configured'}
    };
    kit.qmakePath = qmake;
    kit.cmakePath = cmake;
    kit.buildToolPath = make;
    kit.generator = 'Unix Makefiles';
    kit.compilerFamily = 'gcc';
    kit.compilerPath = '/usr/bin/c++';
    kit.cCompilerPath = '/usr/bin/cc';
    debug.system = 'qmake';
    debug.generateProjectFiles = true;
    model.writeQtProjectManifest(manifestPath, manifest);

    const lines=[];
    const output={append:(v)=>lines.push(String(v)),appendLine:(v='')=>lines.push(String(v))};
    const service = new QpmQtBuildBackendService(output);
    process.env.QPM_TEST_TARGET = model.qtTargetPath(manifestPath, 'debug64', manifest);
    let result = await service.build(manifestPath, 'debug64', installation, true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.backend, 'qmake');
    const pro = fs.readFileSync(result.projectFile, 'utf8');
    assert(pro.includes('QT += core'));
    assert(pro.includes('SOURCES +='));
    assert(pro.includes('CONFIG += debug'));
    assert(lines.some((line)=>line.includes('-j3')), 'qmake build should use configured parallel jobs');

    const cmakeManifest = model.readQtProjectManifest(manifestPath);
    const cmakeKit = model.getActiveQtKitProfile(cmakeManifest);
    const cmakeProfile = model.getActiveQtBuildProfile(cmakeManifest, 'debug64');
    cmakeKit.cmakePath = cmake;
    cmakeKit.generator = 'Unix Makefiles';
    cmakeProfile.system = 'cmake';
    cmakeProfile.generateProjectFiles = true;
    cmakeProfile.unityBuild = true;
    model.writeQtProjectManifest(manifestPath, cmakeManifest);
    process.env.QPM_TEST_TARGET = model.qtTargetPath(manifestPath, 'debug64', cmakeManifest);
    result = await service.build(manifestPath, 'debug64', installation, true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.backend, 'cmake');
    const cmakeText = fs.readFileSync(result.projectFile, 'utf8');
    assert(cmakeText.includes('find_package(Qt6 REQUIRED COMPONENTS Core)'));
    assert(cmakeText.includes('set(CMAKE_AUTOMOC ON)'));
    assert(cmakeText.includes('set(CMAKE_UNITY_BUILD ON)'));
    assert(fs.existsSync(path.join(root, 'compile_commands.json')), 'CMake compile database must be published');

    const directSource = fs.readFileSync(path.join(projectRoot, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
    for (const token of ['runWithConcurrency', 'qpm_link.rsp', 'qpm_unity.cpp', 'qtPrecompiledHeaderArguments']) assert(directSource.includes(token));
    const kitSource = fs.readFileSync(path.join(projectRoot, 'src', 'services', 'qpmQtKitRegistryService.ts'), 'utf8');
    for (const token of ['qt-kits.json', 'assignToProject', 'environmentScript', 'debuggerType', 'compilerTargetTriple', 'compatibility', 'inspectQtCompiler']) assert(kitSource.includes(token));
    const settingsSource = fs.readFileSync(path.join(projectRoot, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
    for (const token of ['manageNamedKits', 'qpm.manageQtKits', 'Debugger:', 'qmake:', 'CMake:', 'Build tool:']) assert(settingsSource.includes(token));
    console.log('QPM 0.5.0 named kits, qmake and CMake backend tests: PASS');
  } finally {
    Module._load = originalLoad;
    delete process.env.QPM_TEST_TARGET;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
