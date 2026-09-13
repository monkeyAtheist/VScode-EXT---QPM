const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '..', 'test-mocks');
require('module').Module._initPaths();

const model = require('../out/model/qtProjectManifest');
const debug = require('../out/services/qpmQtDebugService');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-debug-060-'));
const manifestPath = path.join(root, 'DebugApp.qtproject.json');
const manifest = model.createDefaultQtProjectManifest('DebugApp', 'quick-application');
model.writeQtProjectManifest(manifestPath, manifest);
const reloaded = model.readQtProjectManifest(manifestPath);
assert.strictEqual(reloaded.schemaVersion, 19);
assert.strictEqual(reloaded.profiles.debugs.length, 1);
assert.strictEqual(reloaded.profiles.active.debugProfileId, 'local-debug');
assert.strictEqual(model.getActiveQtDebugProfile(reloaded).request, 'launch');

const targetPath = path.join(root, 'build', 'debug', 'DebugApp.exe');
const installation = {
  root: 'C:\\Qt\\6.11.0\\mingw_64',
  binDir: 'C:\\Qt\\6.11.0\\mingw_64\\bin',
  pluginsDir: 'C:\\Qt\\6.11.0\\mingw_64\\plugins',
  qmlDir: 'C:\\Qt\\6.11.0\\mingw_64\\qml',
  toolchain: { debuggerPath: 'C:\\Qt\\Tools\\mingw1310_64\\bin\\gdb.exe', binDir: 'C:\\Qt\\Tools\\mingw1310_64\\bin' }
};
const kit = {
  id: 'kit', name: 'Qt MinGW', architecture: 'x64', deviceType: 'desktop', debuggerType: 'gdb', compilerFamily: 'mingw', debuggerPath: installation.toolchain.debuggerPath
};
const runProfile = { id: 'run', name: 'Run', buildProfileId: 'debug', arguments: '--mode "debug mode"', workingDirectory: '', environment: { APP_ENV: 'test' } };
const profile = {
  ...model.getActiveQtDebugProfile(reloaded),
  qmlDebug: true,
  qmlPort: 4242,
  breakOnQtWarnings: true,
  sourceFileMap: { '/build/agent/src': root },
  additionalSolibSearchPath: ['lib'],
  arguments: '--extra 42'
};
const context = { projectRoot: root, targetPath, mode: 'debug64', manifest: reloaded, profile, runProfile, kit, installation };
const local = debug.buildQtCppDebugConfiguration(context);
assert.strictEqual(local.type, 'cppdbg');
assert.strictEqual(local.request, 'launch');
assert.strictEqual(local.MIMode, 'gdb');
assert.strictEqual(local.miDebuggerPath, installation.toolchain.debuggerPath);
assert.deepStrictEqual(local.args.slice(0, 4), ['--mode', 'debug mode', '--extra', '42']);
assert(local.args.some((entry) => String(entry).includes('-qmljsdebugger=port:4242,block,services:')));
assert(local.setupCommands.some((entry) => entry.text === '-enable-pretty-printing'));
assert(local.setupCommands.some((entry) => entry.text === '-break-insert qFatal'));
assert.strictEqual(local.sourceFileMap['/build/agent/src'], root);
assert(String(local.additionalSOLibSearchPath).includes(path.join(root, 'lib')));
assert(local.environment.some((entry) => entry.name === 'QML_DISABLE_DISK_CACHE' && entry.value === '1'));

const attach = debug.buildQtCppDebugConfiguration({ ...context, profile: { ...profile, request: 'attach', qmlDebug: false, processId: '' } });
assert.strictEqual(attach.request, 'attach');
assert.strictEqual(attach.processId, '${command:pickProcess}');
assert.strictEqual(attach.args, undefined);

const remote = debug.buildQtCppDebugConfiguration({ ...context, profile: { ...profile, request: 'remote-gdb', qmlDebug: false, remoteHost: '192.168.1.50', remotePort: 2345 } });
assert.strictEqual(remote.miDebuggerServerAddress, '192.168.1.50:2345');
assert.strictEqual(remote.request, 'launch');

const core = debug.buildQtCppDebugConfiguration({ ...context, profile: { ...profile, request: 'core-dump', qmlDebug: false, coreDumpPath: 'crashes/app.core' } });
assert.strictEqual(core.coreDumpPath, path.join(root, 'crashes', 'app.core'));

const msvcKit = { ...kit, compilerFamily: 'msvc', debuggerType: 'cppvsdbg', debuggerPath: '' };
const msvcAttach = debug.buildQtCppDebugConfiguration({ ...context, kit: msvcKit, profile: { ...profile, request: 'attach', qmlDebug: false } });
assert.strictEqual(msvcAttach.type, 'cppvsdbg');
assert.strictEqual(msvcAttach.processId, '${command:pickProcess}');

const qml = debug.buildQmlAttachConfiguration(profile);
assert.strictEqual(qml.type, 'qml');
assert.strictEqual(qml.request, 'attach');
assert.strictEqual(qml.port, 4242);
assert.strictEqual(debug.qmlDebuggerArgument(profile), '-qmljsdebugger=port:4242,block,services:DebugMessages,QmlDebugger,V8Debugger');

const sshProfile = { ...profile, remoteProgram: '/opt/app/bin/debug-app', remoteWorkingDirectory: '/opt/app', remotePort: 7777 };
const sshCommand = debug.buildRemoteGdbServerCommand(sshProfile, ['--name', 'value with spaces']);
assert(sshCommand.includes("cd '/opt/app' && gdbserver :7777 '/opt/app/bin/debug-app' '--name' 'value with spaces'"));
assert.deepStrictEqual(debug.parseCommandLine('--alpha "two words" \'three words\' C:\\Qt\\bin'), ['--alpha', 'two words', 'three words', 'C:\\Qt\\bin']);
const jsonc = debug.parseJsonc('{\n  // comment\n  \"version\": \"0.2.0\",\n  \"configurations\": [\n    { \"name\": \"Existing\", },\n  ],\n}');
assert.strictEqual(jsonc.configurations[0].name, 'Existing');

// Migration from schema v4 must create a valid default debug profile.
const legacy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
legacy.schemaVersion = 4;
delete legacy.profiles.debugs;
delete legacy.profiles.active.debugProfileId;
fs.writeFileSync(manifestPath, JSON.stringify(legacy, null, 2));
assert.strictEqual(model.migrateQtProjectManifestFile(manifestPath), true);
const migrated = model.readQtProjectManifest(manifestPath);
assert.strictEqual(migrated.schemaVersion, 19);
assert.strictEqual(migrated.profiles.debugs.length, 1);
assert.strictEqual(migrated.profiles.active.debugProfileId, migrated.profiles.debugs[0].id);
assert(fs.existsSync(`${manifestPath}.schema-v4.backup`));

console.log('QPM 0.6.1 advanced Qt debugging profile and configuration tests: PASS');
