'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.11.0');
const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of ['qpm.refreshTests','qpm.openTestExplorer','qpm.runAllTests','qpm.runAllTestsWithCoverage','qpm.runTestAtCursor','qpm.debugTestAtCursor']) {
  assert(commandIds.has(id), `${id} must be contributed`);
}
assert(pkg.contributes.views.qpm.some((view) => view.id === 'qpm.quality'));

const originalLoad = Module._load;
class Position { constructor(line, character) { this.line = line; this.character = character; } }
class StatementCoverage { constructor(executed, location) { this.executed = executed; this.location = location; } }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    Position,
    StatementCoverage,
    TestRunProfileKind: { Run: 1, Debug: 2, Coverage: 3 },
    FileCoverage: class FileCoverage {},
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) },
    workspace: {}, window: {}, tests: {}, commands: {}, ProgressLocation: { Notification: 15 }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-testing-040-'));
try {
  const model = require('../out/model/qtProjectManifest');
  const testing = require('../out/services/qpmQtTestingService');
  const manifestPath = path.join(temp, 'QualityTests.qtproject.json');
  const manifest = model.createDefaultQtProjectManifest('QualityTests', 'test-application');
  manifest.testing.framework = 'auto';
  manifest.files.sources = ['tests/tst_math.cpp', 'tests/gtest_sample.cpp', 'tests/catch_sample.cpp'];
  manifest.files.qml = ['qmltests/tst_ui.qml'];
  fs.mkdirSync(path.join(temp, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'qmltests'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'tests', 'tst_math.cpp'), `#include <QtTest/QTest>\nclass MathTest: public QObject { Q_OBJECT\nprivate slots:\n void addition();\n void addition_data();\n void cleanup();\n};\nQTEST_APPLESS_MAIN(MathTest)`);
  fs.writeFileSync(path.join(temp, 'tests', 'gtest_sample.cpp'), `TEST(MathSuite, Adds) { EXPECT_EQ(2, 1+1); }\nTEST_F(MathFixture, Subtracts) {}`);
  fs.writeFileSync(path.join(temp, 'tests', 'catch_sample.cpp'), `TEST_CASE("vector grows", "[vector]") {}\nSCENARIO("user logs in") {}`);
  fs.writeFileSync(path.join(temp, 'qmltests', 'tst_ui.qml'), `import QtTest\nTestCase { name: "UiSuite"\n function test_visible() {}\n function test_click() {}\n}`);
  model.writeQtProjectManifest(manifestPath, manifest);

  const discovery = testing.discoverTestsInQtProject(manifestPath);
  assert.strictEqual(discovery.tests.length, 7);
  assert(discovery.tests.some((entry) => entry.framework === 'qttest' && entry.runtimeName === 'addition'));
  const inlineQt = testing.discoverQtTestFunctions('#include <QtTest/QTest>\nclass InlineTest: public QObject { Q_OBJECT\nprivate slots:\n void inlineCase() { QCOMPARE(1, 1); }\n};\nQTEST_APPLESS_MAIN(InlineTest)', path.join(temp, 'tests', 'tst_inline.cpp'));
  assert.strictEqual(inlineQt.length, 1);
  assert.strictEqual(inlineQt[0].runtimeName, 'inlineCase');
  assert(discovery.tests.some((entry) => entry.framework === 'gtest' && entry.runtimeName === 'MathSuite.Adds'));
  assert(discovery.tests.some((entry) => entry.framework === 'catch2' && entry.runtimeName === 'vector grows'));
  assert(discovery.tests.some((entry) => entry.framework === 'qtquicktest' && entry.runtimeName === 'UiSuite::test_visible'));

  const junit = testing.parseJunitXml(`<testsuite><testcase classname="MathTest" name="addition" time="0.012"/><testcase classname="MathTest" name="failure"><failure message="expected 2">details</failure></testcase><testcase name="skip"><skipped/></testcase></testsuite>`);
  assert.strictEqual(junit.length, 3);
  assert.strictEqual(junit[0].status, 'passed');
  assert.strictEqual(junit[0].durationMs, 12);
  assert.strictEqual(junit[1].status, 'failed');
  assert.strictEqual(junit[2].status, 'skipped');

  const coverage = testing.parseGcovText(`        -:    0:Source:tests/tst_math.cpp\n        3:    1:int main() {\n    #####:    2:return 0;\n        -:    3:}`, 'tests/tst_math.cpp');
  assert(coverage);
  assert.strictEqual(coverage.details.length, 2);
  assert.strictEqual(coverage.details[0].executed, 3);
  assert.strictEqual(coverage.details[1].executed, 0);

  assert.strictEqual(manifest.schemaVersion, 11);
  assert.strictEqual(model.createDefaultQtProjectManifest('Quick', 'quick-test-application').testing.framework, 'qtquicktest');
  console.log('QPM 0.4.0 Qt Test discovery, results and coverage tests: PASS');
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
