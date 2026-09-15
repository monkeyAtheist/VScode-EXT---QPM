'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require('../package.json');
const model = require('../out/model/qtProjectManifest.js');
const branding = require('../out/services/qpmQtBrandingService.js');
const packaging = require('../out/services/qpmQtPackagingModel.js');

assert.strictEqual(pkg.version, '0.34.3');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-icons-0340-'));
try {
  const manifestPath = path.join(root, 'IconApp.qtproject.json');
  const assets = path.join(root, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'app.ico'), Buffer.from([0, 0, 1, 0, 0, 0]));
  fs.writeFileSync(path.join(assets, 'window.png'), Buffer.from('fake-png-for-generation-test'));
  fs.writeFileSync(path.join(assets, 'package.png'), Buffer.from('fake-package-icon'));

  const manifest = model.createDefaultQtProjectManifest('IconApp', 'widgets-application');
  assert.strictEqual(manifest.schemaVersion, 19);
  assert.deepStrictEqual(manifest.branding, { executableIcon: '', windowIcon: '', autoApplyWindowIcon: true });
  manifest.branding.executableIcon = 'assets/app.ico';
  manifest.branding.windowIcon = 'assets/window.png';
  manifest.packaging.icon = 'assets/package.png';
  model.writeQtProjectManifest(manifestPath, manifest);

  const reloaded = model.readQtProjectManifest(manifestPath);
  assert.strictEqual(model.executableIconPath(reloaded), 'assets/app.ico');
  assert.strictEqual(model.packageIconPath(reloaded), 'assets/package.png');
  assert.strictEqual(model.hasManagedWindowIcon(reloaded), true);

  const validation = branding.validateQtBranding(manifestPath, reloaded);
  assert.deepStrictEqual(validation.errors, []);
  const artifacts = branding.writeQtBrandingArtifacts(manifestPath, reloaded);
  assert.ok(artifacts.windowResource && fs.existsSync(artifacts.windowResource));
  assert.ok(artifacts.windowStartupSource && fs.existsSync(artifacts.windowStartupSource));
  assert.ok(artifacts.windowIconCopy && fs.existsSync(artifacts.windowIconCopy));
  const qrc = fs.readFileSync(artifacts.windowResource, 'utf8');
  const startup = fs.readFileSync(artifacts.windowStartupSource, 'utf8');
  assert.match(qrc, /qpm\/branding/);
  assert.match(qrc, /window-icon\.png/);
  assert.match(startup, /QGuiApplication::setWindowIcon/);
  assert.match(startup, /Q_COREAPP_STARTUP_FUNCTION/);
  assert.match(startup, /topLevelWindows/);

  const fullRc = packaging.renderWindowsResourceScript(manifestPath, reloaded, path.join(root, 'generated.manifest'), true);
  assert.match(fullRc, /app\.ico/);
  assert.doesNotMatch(fullRc, /package\.png/);
  assert.match(fullRc, /VS_VERSION_INFO VERSIONINFO/);
  const iconOnlyRc = packaging.renderWindowsResourceScript(manifestPath, reloaded, path.join(root, 'generated.manifest'), false);
  assert.match(iconOnlyRc, /app\.ico/);
  assert.doesNotMatch(iconOnlyRc, /VS_VERSION_INFO/);

  // Schema <=18 migration: the old single packaging icon becomes the executable
  // icon while package/installer metadata falls back to it.
  const legacyPath = path.join(root, 'Legacy.qtproject.json');
  const legacy = JSON.parse(JSON.stringify(reloaded));
  legacy.schemaVersion = 18;
  delete legacy.branding;
  legacy.packaging.icon = 'assets/app.ico';
  fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
  const migrated = model.readQtProjectManifest(legacyPath);
  assert.strictEqual(migrated.schemaVersion, 19);
  assert.strictEqual(migrated.branding.executableIcon, 'assets/app.ico');
  assert.strictEqual(migrated.packaging.icon, '');
  assert.strictEqual(model.packageIconPath(migrated), 'assets/app.ico');

  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  for (const token of ['section-branding', 'executableIcon', 'windowIcon', 'autoApplyWindowIcon', 'Executable icon (Windows .ico)', 'Qt window / application icon']) {
    assert.ok(settingsSource.includes(token), `settings UI must expose ${token}`);
  }
  const directSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtDirectBuildService.ts'), 'utf8');
  const backendSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtBuildBackendService.ts'), 'utf8');
  assert.ok(directSource.includes('writeQtBrandingArtifacts'));
  assert.ok(directSource.includes('qrc_qpm_branding.cpp'));
  assert.ok(backendSource.includes('brandingArtifacts.windowStartupSource'));
  assert.ok(backendSource.includes('brandingArtifacts.windowResource'));
  assert.ok(backendSource.includes('writeQtWindowsBuildResource'));

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schemas', 'qtproject.schema.json'), 'utf8'));
  assert.strictEqual(schema.properties.schemaVersion.const, 19);
  assert.ok(schema.required.includes('branding'));
  assert.deepStrictEqual(schema.properties.branding.required, ['executableIcon', 'windowIcon', 'autoApplyWindowIcon']);

  console.log('QPM 0.34.0 executable and Qt window icon tests: PASS');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
