'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.33.0');
const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of [
  'qpm.profileQmlApplication', 'qpm.profileCpu', 'qpm.profileMemory', 'qpm.runCppcheck',
  'qpm.traceSystemCalls', 'qpm.stopProfiling', 'qpm.openLatestProfilingResult',
  'qpm.openProfilingReport', 'qpm.revealProfilingOutput', 'qpm.cleanProfilingOutput'
]) assert(commands.has(id), `${id} must be contributed`);
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.profiling'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorProfiling'));
for (const key of ['qpm.qmlProfilerPath','qpm.perfPath','qpm.valgrindPath','qpm.callgrindAnnotatePath','qpm.cppcheckPath','qpm.heobPath','qpm.stracePath']) {
  assert(pkg.contributes.configuration.properties[key], `${key} configuration is missing`);
}

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    languages: { createDiagnosticCollection: () => ({ clear(){}, set(){}, dispose(){} }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: {}, commands: {}, env: {},
    Uri: { file: (fsPath) => ({ fsPath }) },
    Diagnostic: class Diagnostic {}, Range: class Range {}, Position: class Position {},
    DiagnosticSeverity: { Error:0, Warning:1, Information:2 }
  };
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
  try {
    const model = require('../out/model/qtProjectManifest');
    const profiling = require('../out/services/qpmQtProfilingService');
    const manifest = model.createDefaultQtProjectManifest('ProfileApp', 'quick-application');
    assert.strictEqual(manifest.schemaVersion, 18);
    assert.strictEqual(manifest.profiling.outputDirectory, '.qpm/profiling');
    assert.strictEqual(manifest.profiling.qml.port, 3769);
    assert.strictEqual(manifest.profiling.cpu.tool, 'auto');
    assert.strictEqual(manifest.profiling.memory.tool, 'auto');
    assert.strictEqual(manifest.profiling.cppcheck.enabled, true);
    assert.strictEqual(manifest.profiling.tracing.tool, 'auto');

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-profiling-'));
    const manifestPath = path.join(temp, 'Legacy.qtproject.json');
    const legacy = model.createDefaultQtProjectManifest('Legacy', 'widgets-application');
    legacy.schemaVersion = 8;
    delete legacy.profiling;
    fs.writeFileSync(manifestPath, JSON.stringify(legacy, null, 2));
    assert.strictEqual(model.migrateQtProjectManifestFile(manifestPath), true);
    const migrated = model.readQtProjectManifest(manifestPath);
    assert.strictEqual(migrated.schemaVersion, 18);
    assert(migrated.profiling);
    assert(fs.existsSync(`${manifestPath}.schema-v8.backup`));

    const cppcheckXml = `<?xml version="1.0"?><results><errors><error id="nullPointer" severity="error" msg="Possible null pointer"><location file="src/main.cpp" line="14" column="7"/></error><error id="style" severity="style" msg="Style issue"><location file="include/test.h" line="4"/></error></errors></results>`;
    const cppDiagnostics = profiling.parseCppcheckXml(cppcheckXml, temp);
    assert.strictEqual(cppDiagnostics.length, 2);
    assert.strictEqual(cppDiagnostics[0].severity, 'error');
    assert.strictEqual(cppDiagnostics[0].line, 14);
    assert.strictEqual(cppDiagnostics[0].check, 'nullPointer');
    assert.strictEqual(cppDiagnostics[1].severity, 'information');

    const valgrindXml = `<valgrindoutput><error><kind>Leak_DefinitelyLost</kind><what>16 bytes definitely lost</what><stack><frame><dir>${temp}</dir><file>src/main.cpp</file><line>22</line></frame></stack></error></valgrindoutput>`;
    const valgrindDiagnostics = profiling.parseValgrindXml(valgrindXml, temp);
    assert.strictEqual(valgrindDiagnostics.length, 1);
    assert.strictEqual(valgrindDiagnostics[0].severity, 'error');
    assert.strictEqual(valgrindDiagnostics[0].line, 22);

    assert.deepStrictEqual(profiling.splitCommandLine('--flag "value with spaces" --other=1'), ['--flag', 'value with spaces', '--other=1']);

    const serviceSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtProfilingService.ts'), 'utf8');
    for (const marker of ['-qmljsdebugger=port:', "'--tool=callgrind'", "'--tool=memcheck'", '`--project=${compileDb}`', "'strace'"]) {
      assert(serviceSource.includes(marker), `profiling service marker missing: ${marker}`);
    }
    const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
    for (const marker of ['section-profiling','profilingQmlServices','profilingCpuTool','profilingMemoryTool','profilingCppcheckChecks','profilingTraceTool']) {
      assert(settingsSource.includes(marker), `settings UI marker missing: ${marker}`);
    }
    const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    assert(extensionSource.includes('new QpmQtProfilingService'));
    assert(extensionSource.includes('new QpmQtProfilingProvider'));
    const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
    assert.strictEqual(schema.properties.schemaVersion.const, 18);
    assert(schema.properties.profiling);
    console.log('QPM 0.9.0 profiling and diagnostics tests: PASS');
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
