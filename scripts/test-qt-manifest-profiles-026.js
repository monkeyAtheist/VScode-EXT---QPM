'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const model = require('../out/model/qtProjectManifest');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-profiles-026-'));
try {
  const manifestPath = path.join(root, 'Legacy.qtproject.json');
  const legacy = {
    schemaVersion: 1,
    name: 'Legacy', kind: 'widgets-application', targetName: 'Legacy',
    qt: { installation: 'C:/Qt/6.11/mingw_64', majorVersion: 6, modules: ['Core','Gui','Widgets'], autoMoc: true, autoUic: true, autoRcc: true, autoDeploy: false },
    build: { system: 'direct', cppStandard: 'c++20', outputDirectory: 'build', generatedDirectory: 'generated', debug: { defines: ['DEBUG_APP'], compilerFlags: ['-O0','-g'], linkerFlags: [] }, release: { defines: ['QT_NO_DEBUG'], compilerFlags: ['-O3'], linkerFlags: [] } },
    files: { sources: [], headers: [], forms: [], resources: [], qml: [], translations: [], other: [] },
    includeDirectories: ['include'], libraryDirectories: [], libraries: [], defines: []
  };
  fs.writeFileSync(manifestPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(model.migrateQtProjectManifestFile(manifestPath), true);
  assert(fs.existsSync(`${manifestPath}.schema-v1.backup`));
  const migrated = model.readQtProjectManifest(manifestPath);
  assert.strictEqual(migrated.schemaVersion, 11);
  assert.strictEqual(migrated.profiles.kits.length, 1);
  assert.strictEqual(migrated.profiles.builds.length, 2);
  assert.strictEqual(model.getQtInstallationPreference(migrated), 'C:/Qt/6.11/mingw_64');
  assert.strictEqual(model.getActiveQtBuildProfile(migrated, 'debug64').cppStandard, 'c++20');
  assert(model.getActiveQtBuildProfile(migrated, 'debug64').defines.includes('DEBUG_APP'));
  assert.strictEqual(model.getActiveQtBuildProfile(migrated, 'release64').variant, 'release');
  assert.strictEqual(migrated.testing.framework, 'auto');
  assert.strictEqual(typeof migrated.quality.clangTidyChecks, 'string');
  assert.strictEqual(model.migrateQtProjectManifestFile(manifestPath), false);

  const debugCopy = { ...model.getActiveQtBuildProfile(migrated, 'debug64'), id: 'debug-sanitized', name: 'Debug Sanitized', compilerFlags: ['-O0','-g','-fsanitize=address'] };
  migrated.profiles.builds.push(debugCopy);
  migrated.profiles.active.debugBuildProfileId = debugCopy.id;
  model.setQtInstallationPreference(migrated, 'D:/Qt/6.11/mingw_64');
  model.writeQtProjectManifest(manifestPath, migrated);
  const reloaded = model.readQtProjectManifest(manifestPath);
  assert.strictEqual(model.getActiveQtBuildProfile(reloaded, 'debug64').id, 'debug-sanitized');
  assert.strictEqual(model.getQtInstallationPreference(reloaded, 'debug64'), 'D:/Qt/6.11/mingw_64');
  assert(reloaded.build.debug.compilerFlags.includes('-fsanitize=address'));
  console.log('QPM 0.2.6 manifest profile and migration tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
