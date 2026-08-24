'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.2');

const commandIds = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of [
  'qpm.dependencies.configure',
  'qpm.dependencies.detectTools',
  'qpm.dependencies.generateManifests',
  'qpm.dependencies.install',
  'qpm.dependencies.openReport',
  'qpm.dependencies.revealOutput',
  'qpm.dependencies.clean'
]) assert(commandIds.has(command), `${command} must be contributed`);
assert(pkg.activationEvents.includes('onView:qpm.dependencies'));
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.dependencies'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorDependencies'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.explorerDependencies'));
assert(pkg.contributes.menus['qpm.editorDependencies'].length >= 7);
assert(pkg.contributes.menus['qpm.explorerDependencies'].length >= 7);

const model = require('../out/model/qtProjectManifest');
const integrationModel = require('../out/services/qpmQtDependencyModel');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-dependency-managers-0170-'));
try {
  const manifestPath = path.join(temp, 'DependencyApp.qtproject.json');
  const manifest = model.createDefaultQtProjectManifest('DependencyApp', 'widgets-application');
  assert.strictEqual(manifest.schemaVersion, 17);
  assert.strictEqual(manifest.dependencies.enabled, false);
  assert.strictEqual(manifest.dependencies.autoInstallBeforeBuild, false);
  assert.strictEqual(manifest.dependencies.outputDirectory, '.qpm/dependencies');
  assert.strictEqual(manifest.dependencies.vcpkg.manifestFile, 'vcpkg.json');
  assert.strictEqual(manifest.dependencies.vcpkg.installRoot, '.qpm/dependencies/vcpkg_installed');
  assert.strictEqual(manifest.dependencies.conan.manifestFile, 'conanfile.txt');
  assert.strictEqual(manifest.dependencies.conan.buildMissing, true);
  assert.strictEqual(manifest.dependencies.pkgConfig.staticLink, false);
  model.writeQtProjectManifest(manifestPath, manifest);

  const integrationFile = integrationModel.dependencyIntegrationPath(temp, '.qpm/dependencies');
  integrationModel.writeDependencyIntegration(integrationFile, {
    includeDirectories: [path.join(temp, 'deps', 'include')],
    libraryDirectories: [path.join(temp, 'deps', 'lib')],
    libraries: ['fmt'],
    compilerFlags: ['-pthread'],
    linkerFlags: [],
    cmakeConfigureArguments: ['-DVCPKG_TARGET_TRIPLET=x64-windows'],
    cmakeFindPackages: ['fmt CONFIG REQUIRED'],
    cmakeLinkTargets: ['fmt::fmt'],
    environment: { PKG_CONFIG_PATH: path.join(temp, 'deps', 'pkgconfig') }
  });
  assert(fs.existsSync(integrationFile));
  const integration = integrationModel.readDependencyIntegration(temp, '.qpm/dependencies');
  assert(integration.includeDirectories[0].endsWith(path.join('deps', 'include')));
  assert.deepStrictEqual(integration.libraries, ['fmt']);
  assert.deepStrictEqual(integration.cmakeLinkTargets, ['fmt::fmt']);

  const legacyPath = path.join(temp, 'Legacy16.qtproject.json');
  const legacy = JSON.parse(JSON.stringify(manifest));
  legacy.schemaVersion = 16;
  delete legacy.dependencies;
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  assert.strictEqual(model.migrateQtProjectManifestFile(legacyPath), true);
  const migrated = model.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 17);
  assert.strictEqual(migrated.dependencies.enabled, false);
  assert(fs.existsSync(`${legacyPath}.schema-v16.backup`));

  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 17);
  assert(schema.required.includes('dependencies'));
  assert(schema.properties.dependencies.properties.vcpkg);
  assert(schema.properties.dependencies.properties.conan);
  assert(schema.properties.dependencies.properties.pkgConfig);

  const service = fs.readFileSync(path.join(root, 'src/services/qpmQtDependencyService.ts'), 'utf8');
  for (const marker of ['vcpkg install', 'Conan install', 'pkg-config', 'CMakeDeps', 'CMakeToolchain', 'PkgConfigDeps']) {
    assert(service.includes(marker), `dependency service marker missing: ${marker}`);
  }
  const direct = fs.readFileSync(path.join(root, 'src/services/qpmQtDirectBuildService.ts'), 'utf8');
  assert(direct.includes('readDependencyIntegration'));
  assert(direct.includes('dependencyIntegration?.includeDirectories'));
  const backend = fs.readFileSync(path.join(root, 'src/services/qpmQtBuildBackendService.ts'), 'utf8');
  assert(backend.includes('cmakeFindPackages'));
  assert(backend.includes('cmakeConfigureArguments'));
  assert(backend.includes('dependencyIntegration.libraries'));
  const build = fs.readFileSync(path.join(root, 'src/services/qpmBuildService.ts'), 'utf8');
  assert(build.includes('prepareForBuild'));
  const settings = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
  for (const marker of ['section-dependencies', 'dependenciesVcpkgPackages', 'dependenciesConanRequires', 'dependenciesPkgConfigPackages', 'qpm.dependencies.install']) {
    assert(settings.includes(marker), `dependency settings marker missing: ${marker}`);
  }
  const extension = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  assert(extension.includes("createTreeView('qpm.dependencies'"));
  assert(extension.includes("register('qpm.dependencies.install'"));
  assert(extension.includes('qpm.qtCppProjectActive'));

  console.log('QPM 0.17.1 vcpkg, Conan 2 and pkg-config dependency manager tests: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
