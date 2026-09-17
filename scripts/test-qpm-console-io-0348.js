const assert = require('assert');
const fs = require('fs');
const path = require('path');
const manifestModel = require('../out/model/qtProjectManifest.js');

function makeManifest(kind, outputMode, runBuildProfileId='debug') {
  return {
    kind,
    profiles: {
      runs: [{ id: 'run', name: 'Run', buildProfileId: runBuildProfileId, arguments: '', workingDirectory: '', environment: {}, outputMode }],
      active: { runProfileId: 'run' }
    }
  };
}
const profile = { id: 'debug' };
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('widgets-application', 'integrated-terminal'), profile), 'console');
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('quick-application', 'integrated-terminal'), profile), 'console');
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('widgets-application', 'detached'), profile), 'windows');
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('widgets-application', 'output-channel'), profile), 'windows');
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('console-application', 'detached'), profile), 'console');
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('shared-library', 'integrated-terminal'), profile), undefined);
assert.strictEqual(manifestModel.qtWindowsSubsystemForBuild(makeManifest('widgets-application', 'integrated-terminal', 'release'), profile), 'windows');

const direct = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtDirectBuildService.ts'), 'utf8');
assert(direct.includes("args.push('-mconsole')"), 'direct backend must emit -mconsole');
assert(direct.includes("args.push('-mwindows')"), 'direct backend must retain -mwindows for GUI mode');
assert(direct.includes('windowsGuiEntryPoint ? [\'QT_NEEDS_QMAIN\'] : []'), 'QT_NEEDS_QMAIN must only be used for GUI subsystem');
assert(direct.includes('useGuiEntryPoint: boolean'), 'Qt GUI entry point selection must be explicit');

const backend = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtBuildBackendService.ts'), 'utf8');
assert(backend.includes("config.push('console')"), 'qmake generator must emit console config');
assert(backend.includes("config.push('windows')"), 'qmake generator must retain windows config');
assert(backend.includes("&& !consoleSubsystem ? ' WIN32' : ''"), 'CMake generator must omit WIN32 in console mode');

const build = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmBuildService.ts'), 'utf8');
assert(build.includes('readWindowsPeSubsystem(executablePath)'), 'runtime must detect stale GUI subsystem EXEs');
const settingsUi = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
assert(settingsUi.includes('fgets(stdin)'), 'settings help should cover fgets stdin use case');

console.log('QPM 0.34.8 console I/O regression checks: OK');
