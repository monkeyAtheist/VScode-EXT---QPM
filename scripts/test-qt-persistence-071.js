const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '..', 'test-mocks');
require('module').Module._initPaths();

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const model = require(path.join(root, 'out', 'model', 'qtProjectManifest.js'));
const debug = require(path.join(root, 'out', 'services', 'qpmQtDebugService.js'));
assert.strictEqual(pkg.version, '0.30.0');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-persistence-071-'));
const manifestPath = path.join(temp, 'PersistentApp.qtproject.json');
const manifest = model.createDefaultQtProjectManifest('PersistentApp', 'widgets-application');
assert.strictEqual(manifest.schemaVersion, 17);
assert.strictEqual(manifest.profiles.active.buildMode, 'debug64');
model.setPersistedQtBuildMode(manifest, 'release64');
model.writeQtProjectManifest(manifestPath, manifest);
assert.strictEqual(model.readQtProjectManifest(manifestPath).profiles.active.buildMode, 'release64');

// Schema-v6 projects did not contain a durable build mode. Migration must infer
// x64 from the actual compiler/Qt kit rather than silently falling back to x86.
const legacy = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
legacy.schemaVersion = 6;
delete legacy.profiles.active.buildMode;
legacy.profiles.kits[0].architecture = 'auto';
legacy.profiles.kits[0].compilerTargetTriple = 'x86_64-w64-mingw32';
legacy.profiles.kits[0].compilerPath = 'C:\\Qt\\Tools\\mingw1310_64\\bin\\g++.exe';
fs.writeFileSync(manifestPath, JSON.stringify(legacy, null, 2));
assert.strictEqual(model.migrateQtProjectManifestFile(manifestPath), true);
const migrated = model.readQtProjectManifest(manifestPath);
assert.strictEqual(migrated.schemaVersion, 17);
assert.strictEqual(migrated.profiles.active.buildMode, 'debug64');
assert(fs.existsSync(`${manifestPath}.schema-v6.backup`));

const profile = model.getActiveQtDebugProfile(migrated);
assert.strictEqual(debug.modeForDebugProfile(migrated, profile), 'debug64');
model.setPersistedQtBuildMode(migrated, 'release64');
profile.buildProfileId = migrated.profiles.active.releaseBuildProfileId;
assert.strictEqual(debug.modeForDebugProfile(migrated, profile), 'release64');

const x86 = model.createDefaultQtProjectManifest('Legacy32', 'widgets-application');
x86.profiles.kits[0].architecture = 'auto';
x86.profiles.kits[0].compilerTargetTriple = 'i686-w64-mingw32';
delete x86.profiles.active.buildMode;
const normalizedX86 = model.validateAndNormalizeManifest(x86);
assert.strictEqual(normalizedX86.profiles.active.buildMode, 'debug');

const buildServiceSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
assert.match(buildServiceSource, /getPersistedQtBuildMode\(readQtProjectManifest/);
assert.match(buildServiceSource, /setPersistedQtBuildMode\(manifest, mode\)/);
assert.match(buildServiceSource, /restoreBuildModeFromActiveProject/);
const debugSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtDebugService.ts'), 'utf8');
assert.match(debugSource, /await this\.builds\.setBuildMode\(mode\)/);
assert.doesNotMatch(debugSource, /selectBuildModeForProfile[\s\S]{0,500}update\('buildMode'/);
const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
assert.match(extensionSource, /await builds\.restoreBuildModeFromActiveProject\(\)/);
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
assert.strictEqual(schema.properties.schemaVersion.const, 17);
assert(schema.properties.profiles.properties.active.required.includes('buildMode'));
assert.deepStrictEqual(schema.properties.profiles.properties.active.properties.buildMode.enum, ['debug','release','debug64','release64']);

console.log('QPM 0.7.1 project settings and debug build-mode persistence tests: PASS');
