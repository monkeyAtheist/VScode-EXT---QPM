'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.6');
const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const id of ['qpm.runClangTidyFile','qpm.runClangTidyProject','qpm.applyClangTidyFixes','qpm.runClazyFile','qpm.runClazyProject','qpm.createSanitizerProfiles','qpm.createCoverageProfile','qpm.openQualityReport']) {
  assert(commandIds.has(id), `${id} must be contributed`);
}

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    languages: { createDiagnosticCollection: () => ({ clear(){}, set(){}, dispose(){} }) },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
    window: {}, commands: {}, Uri: { file: (fsPath) => ({ fsPath }) },
    Diagnostic: class Diagnostic {}, Range: class Range {}, Position: class Position {}, DiagnosticSeverity: { Error:0, Warning:1, Information:2 }
  };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  const model = require('../out/model/qtProjectManifest');
  const quality = require('../out/services/qpmQtQualityService');
  const manifest = model.createDefaultQtProjectManifest('QualityApp', 'widgets-application');
  assert.strictEqual(manifest.schemaVersion, 17);
  assert(manifest.quality.clangTidyChecks.includes('bugprone'));

  const diagnostics = quality.parseCompilerDiagnostics(`C:\\work\\main.cpp:12:7: warning: use nullptr [modernize-use-nullptr]\nC:\\work\\main.cpp:20:3: error: invalid call\nC:\\work\\main.cpp:21:1: note: candidate here`);
  assert.strictEqual(diagnostics.length, 3);
  assert.strictEqual(diagnostics[0].severity, 'warning');
  assert.strictEqual(diagnostics[0].check, 'modernize-use-nullptr');
  assert.strictEqual(diagnostics[1].severity, 'error');
  assert.strictEqual(diagnostics[2].severity, 'information');

  const created = quality.ensureSanitizerBuildProfiles(manifest);
  assert.deepStrictEqual(created, ['AddressSanitizer', 'UndefinedBehaviorSanitizer', 'Address + Undefined Sanitizers']);
  assert.strictEqual(quality.ensureSanitizerBuildProfiles(manifest).length, 0);
  const asan = manifest.profiles.builds.find((entry) => entry.id === 'qpm-asan');
  assert(asan.compilerFlags.includes('-fsanitize=address'));
  assert(asan.linkerFlags.includes('-fsanitize=address'));

  const coverage = quality.ensureCoverageBuildProfile(manifest);
  assert.strictEqual(coverage.created, true);
  assert.strictEqual(quality.ensureCoverageBuildProfile(manifest).created, false);
  const coverageProfile = manifest.profiles.builds.find((entry) => entry.id === coverage.profileId);
  assert(coverageProfile.compilerFlags.includes('--coverage'));
  assert(coverageProfile.linkerFlags.includes('--coverage'));

  const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  assert(extensionSource.includes('new QpmQtTestingService'));
  assert(extensionSource.includes('new QpmQtQualityService'));
  const templates = fs.readFileSync(path.join(root, 'src', 'services', 'qpmTemplateService.ts'), 'utf8');
  assert(templates.includes("value: 'qt-test'"));
  assert(templates.includes("value: 'qt-quick-test'"));
  console.log('QPM 0.4.0 static analysis, sanitizer and coverage profile tests: PASS');
} finally {
  Module._load = originalLoad;
}
