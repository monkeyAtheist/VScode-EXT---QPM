const assert = require('assert');
const fs = require('fs');
const path = require('path');

const manifestModule = require('../out/model/qtProjectManifest.js');

const created = manifestModule.createDefaultQtProjectManifest('ProgramIoTest', 'widgets-application');
assert.strictEqual(created.profiles.runs[0].outputMode, 'integrated-terminal', 'Integrated Terminal must be the default run output mode.');

const legacy = JSON.parse(JSON.stringify(created));
delete legacy.profiles.runs[0].outputMode;
const normalizedLegacy = manifestModule.validateAndNormalizeManifest(legacy, '<program-io-test>');
assert.strictEqual(normalizedLegacy.profiles.runs[0].outputMode, 'integrated-terminal', 'Legacy projects must migrate to Integrated Terminal behavior.');

const captured = JSON.parse(JSON.stringify(created));
captured.profiles.runs[0].outputMode = 'output-channel';
assert.strictEqual(manifestModule.validateAndNormalizeManifest(captured, '<program-io-test>').profiles.runs[0].outputMode, 'output-channel');

const detached = JSON.parse(JSON.stringify(created));
detached.profiles.runs[0].outputMode = 'detached';
assert.strictEqual(manifestModule.validateAndNormalizeManifest(detached, '<program-io-test>').profiles.runs[0].outputMode, 'detached');

const invalid = JSON.parse(JSON.stringify(created));
invalid.profiles.runs[0].outputMode = 'invalid-mode';
assert.strictEqual(manifestModule.validateAndNormalizeManifest(invalid, '<program-io-test>').profiles.runs[0].outputMode, 'integrated-terminal');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'qtproject.schema.json'), 'utf8'));
assert.deepStrictEqual(schema.$defs.runProfile.properties.outputMode.enum, ['integrated-terminal', 'output-channel', 'detached']);

const buildRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'services', 'qpmBuildService.js'), 'utf8');
assert(buildRuntime.includes("vscode.window.createTerminal"), 'C++ run must support VS Code Integrated Terminal.');
assert(buildRuntime.includes("stdio: ['ignore', 'pipe', 'pipe']"), 'C++ output-channel mode must pipe stdout/stderr.');
assert(buildRuntime.includes("stdio: 'ignore'"), 'Detached mode must preserve non-interactive launch behavior.');
assert(buildRuntime.includes("Qt Project Manager - Program Output") === false, 'The shared Program Output channel should be created once by extension activation, not per build service.');

const extensionRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'extension.js'), 'utf8');
assert(extensionRuntime.includes("createOutputChannel('Qt Project Manager - Program Output')"), 'Extension activation must register the shared Program Output channel.');

const projectSettingsRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'views', 'qtProjectSettingsPanel.js'), 'utf8');
assert(projectSettingsRuntime.includes('Program output'), 'Qt project settings must expose Program output.');
assert(projectSettingsRuntime.includes('Integrated Terminal — stdout/stderr + interactive stdin'), 'Qt project settings must explain interactive terminal I/O.');

const genericSettingsRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'views', 'buildSettingsPanel.js'), 'utf8');
assert(genericSettingsRuntime.includes('QPM Program Output'), 'Generic QPM settings must expose captured program output.');

const advancedDebugRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'services', 'qpmQtDebugService.js'), 'utf8');
assert(advancedDebugRuntime.includes('avoidWindowsConsoleRedirection: false'), 'cppdbg must keep Windows terminal redirection enabled.');
assert(advancedDebugRuntime.includes("internalConsoleOptions: 'neverOpen'"), 'Debug configuration must avoid stealing output into the Debug Console.');

const buildDebugRuntime = buildRuntime;
assert(buildDebugRuntime.includes('avoidWindowsConsoleRedirection: false'), 'Build-and-debug path must enable cppdbg Windows terminal redirection.');

const pythonRuntime = fs.readFileSync(path.join(__dirname, '..', 'out', 'services', 'qpmQtPythonService.js'), 'utf8');
assert(pythonRuntime.includes('QPM Python —'), 'Qt for Python should also honor Integrated Terminal run mode.');
assert(pythonRuntime.includes("outputMode === 'output-channel'"), 'Qt for Python should honor captured output mode.');

console.log('QPM 0.34.7 program I/O regression test: OK');
