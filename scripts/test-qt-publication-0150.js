'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.6');
const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
for (const command of [
  'qpm.detectPublicationTools','qpm.generatePublicationSources','qpm.createMsixPackage',
  'qpm.generateAppInstaller','qpm.generateWingetManifests','qpm.validateWingetManifests',
  'qpm.createReleaseBundle','qpm.publishRelease','qpm.openPublicationReport',
  'qpm.revealPublicationOutput','qpm.cleanPublicationOutput'
]) assert(commands.has(command), `${command} must be contributed`);
assert(pkg.activationEvents.includes('onView:qpm.publication'));
assert(pkg.contributes.views.qpm.some((entry) => entry.id === 'qpm.publication'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.editorPublication'));
assert(pkg.contributes.submenus.some((entry) => entry.id === 'qpm.explorerPublication'));
assert(pkg.contributes.menus['qpm.editorPublication'].length >= 11);

const messages = [];
const outputLines = [];
const originalLoad = Module._load;
class EventEmitter {
  constructor(){ this.listeners=[]; this.event=(listener)=>{ if (typeof listener === 'function') this.listeners.push(listener); return { dispose(){} }; }; }
  fire(value){ for (const listener of this.listeners) listener(value); }
  dispose(){ this.listeners=[]; }
}
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    EventEmitter,
    TreeItem: class TreeItem { constructor(label, state){ this.label=label; this.collapsibleState=state; } },
    TreeItemCollapsibleState: { None: 0 },
    ThemeIcon: class ThemeIcon { constructor(id){ this.id=id; } },
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async (value) => value
    },
    window: {
      createOutputChannel: () => ({ appendLine(value){ outputLines.push(String(value)); }, append(value){ outputLines.push(String(value)); }, show(){}, clear(){}, dispose(){} }),
      showErrorMessage(value){ messages.push(['error', String(value)]); },
      showWarningMessage(value){ messages.push(['warning', String(value)]); },
      showInformationMessage(value){ messages.push(['info', String(value)]); },
      showTextDocument: async () => undefined
    },
    commands: { executeCommand: async () => undefined },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file' }) }
  };
  return originalLoad.call(this, request, parent, isMain);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-publication-0150-'));
(async () => {
  try {
    const model = require('../out/model/qtProjectManifest');
    const publicationApi = require('../out/services/qpmQtPublicationService');
    const manifestPath = path.join(temp, 'PublishApp.qtproject.json');
    const manifest = model.createDefaultQtProjectManifest('PublishApp', 'widgets-application');
    assert.strictEqual(manifest.schemaVersion, 17);
    assert.strictEqual(manifest.publication.enabled, false);
    assert.strictEqual(manifest.publication.channel, 'stable');
    assert.strictEqual(manifest.publication.msix.generateAppInstaller, true);
    assert.strictEqual(manifest.publication.github.tagPattern, 'v${version}');
    assert.strictEqual(manifest.publication.publish.target, 'none');

    manifest.packaging.productName = 'Publish Application';
    manifest.packaging.productVersion = '2.4.1';
    manifest.packaging.companyName = 'Example Company';
    manifest.packaging.description = 'Published Qt desktop application';
    manifest.packaging.identifier = 'com.example.publishapp';
    manifest.publication.enabled = true;
    manifest.publication.outputDirectory = 'dist/publication';
    manifest.publication.baseUrl = 'https://downloads.example.test/publishapp';
    manifest.publication.msix.enabled = true;
    manifest.publication.msix.packageIdentityName = 'Example.PublishApp';
    manifest.publication.msix.publisher = 'CN=Example Company';
    manifest.publication.msix.publisherDisplayName = 'Example Company';
    manifest.publication.msix.displayName = 'Publish Application';
    manifest.publication.msix.version = '2.4.1.0';
    manifest.publication.msix.architecture = 'x64';
    manifest.publication.msix.signPackage = false;
    manifest.publication.winget.enabled = true;
    manifest.publication.winget.packageIdentifier = 'Example.PublishApp';
    manifest.publication.winget.publisher = 'Example Company';
    manifest.publication.winget.packageName = 'Publish Application';
    manifest.publication.winget.installerType = 'msix';
    manifest.publication.winget.installerUrl = 'https://downloads.example.test/publishapp/Publish-Application-2.4.1-x64.msix';
    manifest.publication.github.enabled = true;
    manifest.publication.github.repository = 'example/publishapp';
    manifest.publication.publish.target = 'local';
    manifest.publication.publish.localDirectory = path.join(temp, 'published');
    model.writeQtProjectManifest(manifestPath, manifest);

    const reloaded = model.readQtProjectManifest(manifestPath);
    assert.strictEqual(reloaded.publication.msix.packageIdentityName, 'Example.PublishApp');
    assert.strictEqual(reloaded.publication.winget.installerType, 'msix');
    assert.strictEqual(reloaded.publication.publish.target, 'local');
    assert(!JSON.stringify(reloaded).toLowerCase().includes('githubtoken'));
    assert(!JSON.stringify(reloaded).toLowerCase().includes('sshpassword'));

    const legacyPath = path.join(temp, 'Legacy.qtproject.json');
    const legacy = JSON.parse(JSON.stringify(reloaded));
    legacy.schemaVersion = 14;
    delete legacy.publication;
    fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
    assert.strictEqual(model.migrateQtProjectManifestFile(legacyPath), true);
    const migrated = model.readQtProjectManifest(legacyPath);
    assert.strictEqual(migrated.schemaVersion, 17);
    assert.strictEqual(migrated.publication.outputDirectory, 'dist/publication');
    assert(fs.existsSync(`${legacyPath}.schema-v14.backup`));

    const paths = publicationApi.publicationPaths(manifestPath, reloaded, 'release64');
    assert(paths.msixPackage.endsWith(path.join('dist', 'publication', 'Publish-Application-2.4.1-x64.msix')));
    assert(paths.releaseManifest.startsWith(paths.releaseRoot));
    assert(paths.latestManifest.startsWith(paths.releaseRoot));
    assert(paths.wingetInstallerManifest.includes('Example.PublishApp.installer.yaml'));

    const msix = publicationApi.generateMsixManifest(reloaded, 'release64');
    for (const marker of ['Windows.FullTrustApplication','runFullTrust','Example.PublishApp','CN=Example Company','PublishApp.exe','10.0.19041.0']) {
      assert(msix.includes(marker), `MSIX marker missing: ${marker}`);
    }
    const appInstaller = publicationApi.generateAppInstallerFile(reloaded, 'release64', path.basename(paths.msixPackage));
    assert(appInstaller.includes('<MainPackage'));
    assert(appInstaller.includes('<OnLaunch HoursBetweenUpdateChecks="0"'));
    assert(appInstaller.includes('https://downloads.example.test/publishapp/'));
    const winget = publicationApi.generateWingetManifestSet(reloaded, 'release64', 'ab'.repeat(32));
    assert(winget.version.includes('ManifestType: version'));
    assert(winget.installer.includes('InstallerType: msix'));
    assert(winget.installer.includes('AB'.repeat(32)));
    assert(winget.locale.includes('PackageLocale: en-US'));

    const toolsDir = path.join(temp, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    const makeAppx = path.join(toolsDir, process.platform === 'win32' ? 'fake-makeappx.cmd' : 'fake-makeappx');
    if (process.platform === 'win32') {
      fs.writeFileSync(makeAppx, '@echo off\r\nset out=\r\n:loop\r\nif "%1"=="" goto done\r\nif /I "%1"=="/p" set out=%2\r\nshift\r\ngoto loop\r\n:done\r\necho fake-msix>"%out%"\r\n');
    } else {
      fs.writeFileSync(makeAppx, '#!/bin/sh\nout=""\nprev=""\nfor arg in "$@"; do\n  if [ "$prev" = "/p" ]; then out="$arg"; fi\n  prev="$arg"\ndone\nprintf fake-msix > "$out"\n');
      fs.chmodSync(makeAppx, 0o755);
    }
    reloaded.publication.msix.makeAppxPath = makeAppx;
    model.writeQtProjectManifest(manifestPath, reloaded);
    const stage = path.join(temp, 'stage');
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(stage, 'PublishApp.exe'), 'fake-executable');
    const projectRef = { absolutePath: manifestPath, exists: true, name: 'PublishApp', kind: 'project' };
    const packaging = {
      getReport: () => ({ stageDirectory: stage, archivePath: '' }),
      createPortablePackage: async () => true
    };
    const installers = {
      latestInstallerPath: '',
      getReport: () => undefined,
      createInstaller: async () => false,
      createUpdateRepository: async () => false
    };
    const builds = { buildMode: 'release64' };
    const workspaces = { activeProjectRef: projectRef };
    const service = new publicationApi.QpmQtPublicationService(workspaces, packaging, installers, builds);
    const created = await service.createMsixPackage(projectRef);
    assert.strictEqual(created, true);
    assert(fs.existsSync(paths.msixPackage));
    assert(fs.existsSync(paths.appInstaller));
    assert(fs.existsSync(path.join(paths.msixLayout, 'AppxManifest.xml')));
    for (const asset of ['Square44x44Logo.png','Square150x150Logo.png','StoreLogo.png']) {
      const assetPath = path.join(paths.msixLayout, 'Assets', asset);
      assert(fs.existsSync(assetPath), `${asset} must be generated`);
      assert(fs.statSync(assetPath).size > 60, `${asset} must be a valid non-empty PNG`);
    }
    service.dispose();

    const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'qtproject.schema.json'), 'utf8'));
    assert.strictEqual(schema.properties.schemaVersion.const, 17);
    assert(schema.required.includes('publication'));
    assert.deepStrictEqual(schema.properties.publication.properties.channel.enum, ['stable','beta','nightly']);
    assert(schema.properties.publication.properties.msix.properties.generateAppInstaller);
    assert(schema.properties.publication.properties.winget.properties.installerType.enum.includes('msix'));
    assert(schema.properties.publication.properties.publish.properties.target.enum.includes('github'));

    const settings = fs.readFileSync(path.join(root, 'src/views/qtProjectSettingsPanel.ts'), 'utf8');
    for (const marker of ['section-publication','publicationMsixIdentity','publicationWingetIdentifier','publicationGithubRepository','publicationPublishTarget','qpm.createReleaseBundle']) {
      assert(settings.includes(marker), `publication settings marker missing: ${marker}`);
    }
    const extension = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
    assert(extension.includes("createTreeView('qpm.publication'"));
    assert(extension.includes("register('qpm.createMsixPackage'"));
    assert(extension.includes("register('qpm.publishRelease'"));
    const serviceSource = fs.readFileSync(path.join(root, 'src/services/qpmQtPublicationService.ts'), 'utf8');
    for (const marker of ['makeappx.exe','AppxManifest.xml','gh', "'release', 'create'", 'SHA256SUMS.txt', 'workspace/didChangeWatchedFiles']) {
      if (marker === 'workspace/didChangeWatchedFiles') continue;
      assert(serviceSource.toLowerCase().includes(marker.toLowerCase()), `publication service marker missing: ${marker}`);
    }

    console.log('QPM 0.15.0 MSIX, App Installer, WinGet and release publication tests: PASS');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
