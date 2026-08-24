const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const manifestApi = require('../out/model/qtProjectManifest.js');
const packaging = require('../out/services/qpmQtPackagingModel.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-packaging-080-'));
const manifestPath = path.join(root, 'ProductApp.qtproject.json');
const manifest = manifestApi.createDefaultQtProjectManifest('ProductApp', 'widgets-application');
assert.strictEqual(manifest.schemaVersion, 17);
assert.strictEqual(manifest.packaging.productName, 'ProductApp');
assert.strictEqual(manifest.packaging.productVersion, '1.0.0');
assert.strictEqual(manifest.packaging.archiveFormat, 'zip');
assert.strictEqual(manifest.packaging.windows.embedVersionResource, true);
manifest.packaging.companyName = 'Example Company';
manifest.packaging.productVersion = '2.4.1';
manifest.packaging.description = 'A packaged Qt application';
manifest.packaging.identifier = 'com.example.productapp';
manifest.packaging.packageNamePattern = '${productName}-${version}-${platform}-${arch}-${configuration}';
manifestApi.writeQtProjectManifest(manifestPath, manifest);
const metadata = packaging.writeQtPackagingMetadata(manifestPath, manifest, 'release64');
for (const file of Object.values(metadata)) assert.ok(fs.existsSync(file), `missing metadata ${file}`);
const rc = fs.readFileSync(metadata.windowsResource, 'utf8');
assert.match(rc, /VS_VERSION_INFO VERSIONINFO/);
assert.match(rc, /Example Company/);
assert.match(rc, /2\.4\.1/);
assert.match(rc, /RT_MANIFEST/);
const appManifest = fs.readFileSync(metadata.windowsManifest, 'utf8');
assert.match(appManifest, /requestedExecutionLevel level="asInvoker"/);
assert.match(appManifest, /PerMonitorV2/);
const desktop = fs.readFileSync(metadata.linuxDesktopEntry, 'utf8');
assert.match(desktop, /\[Desktop Entry\]/);
assert.match(desktop, /Name=ProductApp/);
const identity = packaging.resolveQtPackageIdentity(manifest, 'release64');
assert.match(identity.packageName, /^ProductApp-2\.4\.1-desktop-/);
assert.strictEqual(packaging.normalizeFourPartVersion('2.4.1-beta'), '2.4.1.0');
assert.strictEqual(packaging.sanitizePackageName(' A/B:* C '), 'A-B-C');

const legacyPath = path.join(root, 'Legacy.qtproject.json');
const legacy = JSON.parse(JSON.stringify(manifest));
legacy.schemaVersion = 7;
delete legacy.packaging;
fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
assert.strictEqual(manifestApi.migrateQtProjectManifestFile(legacyPath), true);
const migrated = manifestApi.readQtProjectManifest(legacyPath);
assert.strictEqual(migrated.schemaVersion, 17);
assert.strictEqual(migrated.packaging.productName, 'ProductApp');
assert.ok(fs.existsSync(`${legacyPath}.schema-v7.backup`));

const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of ['qpm.generateProductMetadata','qpm.createPortablePackage','qpm.openPackagingReport','qpm.revealPackagingOutput','qpm.cleanPackagingOutput']) {
  assert.ok(commands.has(command), `missing command ${command}`);
}
assert.ok(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.packaging'));
assert.ok(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorPackaging'));
assert.ok(pkg.contributes.menus['qpm.editorPackaging'].length >= 5);
const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
for (const marker of ['section-packaging','packagingProductName','packagingArchiveFormat','packagingEmbedVersion','packagingLinuxDesktop']) assert.ok(settingsSource.includes(marker));
const directSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtDirectBuildService.ts'), 'utf8');
assert.ok(directSource.includes("kind: 'windres'"));
assert.ok(directSource.includes('qpm_product_metadata.o'));
const backendSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'qpmQtBuildBackendService.ts'), 'utf8');
assert.ok(backendSource.includes('RC_FILE ='));
assert.ok(backendSource.includes("' RC'"));

fs.rmSync(root, { recursive: true, force: true });
console.log('QPM 0.8.0 packaging and product metadata tests: PASS');
