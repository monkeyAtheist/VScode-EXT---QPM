'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const childProcess = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.15.0');
const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of ['qpm.rerunFailedTests', 'qpm.openTestHistory', 'qpm.clearTestHistory']) assert(commandIds.has(id), `${id} must be contributed`);
assert(pkg.contributes.configuration.properties['qpm.ctestPath']);

const originalLoad = Module._load;
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class StatementCoverage { constructor(executed, location) { this.executed = executed; this.location = location; } }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    Position, StatementCoverage,
    TestRunProfileKind: { Run: 1, Debug: 2, Coverage: 3 },
    FileCoverage: class FileCoverage {}, Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: {}, tests: {}, commands: {}, ProgressLocation: { Notification: 15 }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-testing-0100-'));
try {
  const model = require('../out/model/qtProjectManifest');
  const testing = require('../out/services/qpmQtTestingService');
  const manifest = model.createDefaultQtProjectManifest('ExtendedTests', 'test-application');
  assert.strictEqual(manifest.schemaVersion, 15);
  assert.strictEqual(manifest.testing.parallelJobs, 0);
  assert.strictEqual(manifest.testing.repeatMode, 'never');
  assert.strictEqual(manifest.testing.ctest.outputOnFailure, true);
  assert.strictEqual(manifest.testing.boost.logLevel, 'test_suite');

  const sourcePath = path.join(temp, 'boost_tests.cpp');
  const boostSource = `#define BOOST_TEST_MODULE Demo\n#include <boost/test/unit_test.hpp>\nBOOST_AUTO_TEST_SUITE(Math)\nBOOST_AUTO_TEST_CASE(Adds) {}\nBOOST_FIXTURE_TEST_CASE(Subtracts, Fixture) {}\nBOOST_AUTO_TEST_SUITE_END()\nBOOST_AUTO_TEST_CASE(GlobalCase) {}`;
  const boostTests = testing.discoverBoostTests(boostSource, sourcePath);
  assert.strictEqual(boostTests.length, 3);
  assert(boostTests.some((entry) => entry.runtimeName === 'Math/Adds'));
  assert(boostTests.some((entry) => entry.runtimeName === 'Math/Subtracts'));
  assert(boostTests.some((entry) => entry.runtimeName === 'GlobalCase'));

  const manifestPath = path.join(temp, 'ExtendedTests.qtproject.json');
  fs.writeFileSync(path.join(temp, 'CMakeLists.txt'), 'enable_testing()\nadd_test(NAME smoke COMMAND app --smoke)\n');
  const ctestJson = JSON.stringify({
    kind: 'ctestInfo', version: { major: 1, minor: 0 },
    backtraceGraph: { files: ['CMakeLists.txt'], nodes: [{ file: 0, line: 2 }] },
    tests: [
      { name: 'smoke', command: [path.join(temp, 'app'), '--smoke'], backtrace: 0, properties: [{ name: 'LABELS', value: ['fast', 'unit'] }, { name: 'WORKING_DIRECTORY', value: temp }] },
      { name: 'disabled', command: [path.join(temp, 'app')], properties: [{ name: 'DISABLED', value: true }] }
    ]
  });
  const ctests = testing.parseCTestJson(ctestJson, manifestPath);
  assert.strictEqual(ctests.length, 2);
  assert.strictEqual(ctests[0].framework, 'ctest');
  assert.strictEqual(ctests[0].line, 2);
  assert.deepStrictEqual(ctests[0].labels, ['fast', 'unit']);
  assert.strictEqual(ctests[1].disabled, true);

  manifest.testing.framework = 'ctest';
  manifest.testing.parallelJobs = 4;
  manifest.testing.stopOnFailure = true;
  manifest.testing.repeatMode = 'until-fail';
  manifest.testing.repeatCount = 3;
  manifest.testing.ctest.buildDirectory = 'build/debug/cmake';
  manifest.testing.ctest.labelRegex = 'unit';
  manifest.testing.ctest.excludeRegex = 'slow';
  manifest.testing.ctest.outputOnFailure = true;
  const resolution = { ctestPath: 'ctest', buildDirectory: path.join(temp, 'build/debug/cmake'), cwd: temp, usePreset: false, diagnostic: 'ready' };
  const args = testing.buildCTestRunArguments(manifest, resolution, ['smoke'], path.join(temp, 'results.xml'));
  for (const marker of ['--test-dir', '--tests-regex', '--label-regex', '--exclude-regex', '--parallel', '--stop-on-failure', '--repeat', '--output-junit']) assert(args.includes(marker), `${marker} missing from CTest args`);

  const cmakeLists = `cmake_minimum_required(VERSION 3.16)\nproject(QpmCTest NONE)\nenable_testing()\nadd_test(NAME pass COMMAND "\${CMAKE_COMMAND}" -E true)\nadd_test(NAME second COMMAND "\${CMAKE_COMMAND}" -E true)\nset_tests_properties(pass PROPERTIES LABELS "fast;unit")\n`;
  const ctestSource = path.join(temp, 'ctest-source');
  const ctestBuild = path.join(temp, 'ctest-build');
  fs.mkdirSync(ctestSource, { recursive: true });
  fs.writeFileSync(path.join(ctestSource, 'CMakeLists.txt'), cmakeLists);
  childProcess.execFileSync('cmake', ['-S', ctestSource, '-B', ctestBuild], { stdio: 'pipe' });
  const actualJson = childProcess.execFileSync('ctest', ['--test-dir', ctestBuild, '--show-only=json-v1'], { encoding: 'utf8' });
  const actualTests = testing.parseCTestJson(actualJson, manifestPath);
  assert(actualTests.some((entry) => entry.runtimeName === 'pass'));
  const actualResult = path.join(temp, 'actual-ctest.xml');
  childProcess.execFileSync('ctest', ['--test-dir', ctestBuild, '--tests-regex', '^pass$', '--output-junit', actualResult], { stdio: 'pipe' });
  assert(fs.existsSync(actualResult));
  const actualJunit = testing.parseJunitXml(fs.readFileSync(actualResult, 'utf8'));
  assert(actualJunit.some((entry) => entry.name === 'pass' && entry.status === 'passed'));

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 15);
  assert(schema.properties.testing.properties.ctest);
  assert(schema.properties.testing.properties.boost);
  const settingsSource = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of ['testCtestBuildDirectory', 'testBoostLogLevel', 'testRepeatMode', 'qpm.rerunFailedTests']) assert(settingsSource.includes(marker), `settings marker missing: ${marker}`);
  console.log('QPM 0.10.0 extended CTest and Boost.Test integration tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
