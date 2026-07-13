const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
assert.strictEqual(pkg.version, '0.15.2');

const manifestModule = require(path.join(root, 'out', 'model', 'qtProjectManifest.js'));
const manifest = manifestModule.createDefaultQtProjectManifest('PlatformApp', 'widgets-application');
assert.strictEqual(manifest.schemaVersion, 15);
assert.ok(Array.isArray(manifest.profiles.platforms));
assert.strictEqual(manifest.profiles.platforms.length, 1);
assert.strictEqual(manifest.profiles.active.platformProfileId, 'desktop-platform');
assert.strictEqual(manifestModule.getActiveQtPlatformProfile(manifest).type, 'desktop');

manifest.profiles.platforms.push({
  ...JSON.parse(JSON.stringify(manifest.profiles.platforms[0])),
  id: 'remote-linux', name: 'Remote Linux', type: 'remote-linux', buildLocation: 'local',
  sshHost: '192.168.1.42', sshUser: 'qt', remoteProjectDirectory: '~/PlatformApp', remoteDeployDirectory: '~/PlatformApp/bin'
});
manifest.profiles.active.platformProfileId = 'remote-linux';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-platforms-070-'));
const manifestPath = path.join(temp, 'PlatformApp.qtproject.json');
manifestModule.writeQtProjectManifest(manifestPath, manifest);
const reloaded = manifestModule.readQtProjectManifest(manifestPath);
assert.strictEqual(manifestModule.getActiveQtPlatformProfile(reloaded).type, 'remote-linux');
assert.strictEqual(manifestModule.getActiveQtPlatformProfile(reloaded).sshPort, 22);

const packageViews = pkg.contributes.views.qpm.map((entry) => entry.id);
assert.ok(packageViews.includes('qpm.platforms'));
const commandIds = pkg.contributes.commands.map((entry) => entry.command);
for (const id of [
  'qpm.manageQtPlatforms','qpm.selectQtPlatform','qpm.buildForPlatform','qpm.deployToPlatform',
  'qpm.runOnPlatform','qpm.buildDeployRunPlatform','qpm.openRemoteTerminal','qpm.openDockerShell',
  'qpm.serveWebAssembly','qpm.stopWebAssemblyServer','qpm.openPlatformReport'
]) assert.ok(commandIds.includes(id), `missing command ${id}`);

const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
assert.match(extension, /new QpmQtPlatformService/);
assert.match(extension, /qpm\.platforms/);
assert.match(extension, /qpm\.buildDeployRunPlatform/);
const settings = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
assert.ok(settings.includes("sectionHeading('platforms','Platforms')"));
assert.match(settings, /platformDockerImage/);
assert.match(settings, /platformRemoteProjectDirectory/);
assert.match(settings, /platformWasmServerPort/);
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
assert.strictEqual(schema.properties.schemaVersion.const, 15);
assert.ok(schema.properties.profiles.properties.platforms);
assert.ok(schema.$defs.platformProfile);

console.log('QPM 0.7.0 platform profiles and workflow tests: PASS');
