import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { QpmWorkspaceProjectRef } from '../model/types';
import {
  QtMsixArchitecture,
  QtProjectManifest,
  QtPublicationConfiguration,
  getActiveQtKitProfile,
  inferQtKitArchitecture,
  isQtProjectManifestPath,
  readQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmBuildService } from './qpmBuildService';
import { QpmQtInstallerService } from './qpmQtInstallerService';
import { QpmQtPackagingService } from './qpmQtPackagingService';
import { resolveQtPackageIdentity, sanitizePackageName } from './qpmQtPackagingModel';
import { QpmWorkspaceService } from './qpmWorkspaceService';

export interface QtPublicationToolReport {
  makeAppx?: string;
  signTool?: string;
  winget?: string;
  wingetCreate?: string;
  gh?: string;
  scp?: string;
  rsync?: string;
}

export interface QtPublicationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface QtPublicationPaths {
  root: string;
  releaseRoot: string;
  generatedRoot: string;
  msixRoot: string;
  msixLayout: string;
  msixManifest: string;
  msixPackage: string;
  appInstaller: string;
  wingetRoot: string;
  wingetVersionManifest: string;
  wingetInstallerManifest: string;
  wingetLocaleManifest: string;
  releaseManifest: string;
  latestManifest: string;
  checksums: string;
  releaseNotes: string;
}

export interface QtPublicationReport {
  project: string;
  enabled: boolean;
  productName: string;
  version: string;
  channel: string;
  msixEnabled: boolean;
  wingetEnabled: boolean;
  publishTarget: string;
  outputRoot: string;
  paths: QtPublicationPaths;
  tools: QtPublicationToolReport;
  artifacts: string[];
  issues: QtPublicationIssue[];
}

interface PublicationContext {
  ref: QpmWorkspaceProjectRef;
  manifest: QtProjectManifest;
  root: string;
  report: QtPublicationReport;
}

export class QpmQtPublicationService implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel('Qt Project Manager Publication');
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private latestArtifact = '';

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly packaging: QpmQtPackagingService,
    private readonly installers: QpmQtInstallerService,
    private readonly builds: QpmBuildService,
    private readonly sharedOutput?: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.changed.dispose();
    this.output.dispose();
  }

  get latestArtifactPath(): string { return this.latestArtifact; }

  getReport(projectRef?: QpmWorkspaceProjectRef): QtPublicationReport | undefined {
    return this.resolve(projectRef, false)?.report;
  }

  async detectTools(projectRef?: QpmWorkspaceProjectRef): Promise<QtPublicationToolReport | undefined> {
    const context = this.resolve(projectRef);
    if (!context) return undefined;
    this.output.show(true);
    this.output.appendLine(`[Publication] Tool detection for ${context.manifest.name}`);
    for (const [name, value] of Object.entries(context.report.tools)) this.output.appendLine(`[Publication] ${name}: ${value || 'not found'}`);
    const blockers = context.report.issues.filter((entry) => entry.severity === 'error').length;
    vscode.window.showInformationMessage(blockers ? `Publication tools detected with ${blockers} blocking issue(s).` : 'Publication tools are ready.');
    return context.report.tools;
  }

  async generatePublicationSources(projectRef?: QpmWorkspaceProjectRef): Promise<QtPublicationPaths | undefined> {
    const context = this.resolve(projectRef);
    if (!context) return undefined;
    fs.mkdirSync(context.report.paths.generatedRoot, { recursive: true });
    writeText(context.report.paths.msixManifest, generateMsixManifest(context.manifest, this.builds.buildMode));
    if (context.manifest.publication.msix.generateAppInstaller) {
      writeText(context.report.paths.appInstaller, generateAppInstallerFile(context.manifest, this.builds.buildMode, path.basename(context.report.paths.msixPackage)));
    }
    await this.generateWingetManifests(context.ref, false);
    this.writeReleaseMetadata(context, []);
    this.output.appendLine(`[Publication] Generated publication sources: ${context.report.paths.generatedRoot}`);
    vscode.window.showInformationMessage(`Publication sources generated for ${context.manifest.name}.`);
    this.changed.fire();
    return context.report.paths;
  }

  async createMsixPackage(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.resolve(projectRef);
    if (!context) return false;
    if (!context.manifest.publication.msix.enabled) {
      vscode.window.showWarningMessage('MSIX generation is disabled in Qt Project Settings.');
      return false;
    }
    const packagingReport = this.packaging.getReport(context.ref);
    if (!packagingReport) {
      vscode.window.showErrorMessage('Portable packaging report is unavailable.');
      return false;
    }
    if (!await this.packaging.createPortablePackage(context.ref)) return false;
    if (!fs.existsSync(packagingReport.stageDirectory)) {
      vscode.window.showErrorMessage(`Portable package staging directory not found: ${packagingReport.stageDirectory}`);
      return false;
    }
    if (!context.report.tools.makeAppx) {
      vscode.window.showErrorMessage('MakeAppx.exe was not found. Install a Windows SDK or configure its path in Qt Project Settings.');
      return false;
    }

    fs.rmSync(context.report.paths.msixLayout, { recursive: true, force: true });
    fs.mkdirSync(context.report.paths.msixLayout, { recursive: true });
    copyDirectoryContents(packagingReport.stageDirectory, context.report.paths.msixLayout);
    this.prepareMsixLayout(context);
    fs.mkdirSync(path.dirname(context.report.paths.msixPackage), { recursive: true });
    this.output.show(true);
    this.output.appendLine(`[Publication] Create MSIX for ${context.manifest.name}`);
    const ok = await runProcess(context.report.tools.makeAppx, ['pack', '/d', context.report.paths.msixLayout, '/p', context.report.paths.msixPackage, '/o'], context.root, this.output);
    if (!ok) return false;
    if (context.manifest.publication.msix.signPackage) {
      if (!await this.signMsix(context)) return false;
    }
    if (context.manifest.publication.msix.generateAppInstaller) {
      writeText(context.report.paths.appInstaller, generateAppInstallerFile(context.manifest, this.builds.buildMode, path.basename(context.report.paths.msixPackage)));
    }
    this.latestArtifact = context.report.paths.msixPackage;
    this.writeReleaseMetadata(context, [context.report.paths.msixPackage, ...(fs.existsSync(context.report.paths.appInstaller) ? [context.report.paths.appInstaller] : [])]);
    this.changed.fire();
    vscode.window.showInformationMessage(`MSIX package created: ${path.basename(context.report.paths.msixPackage)}`);
    return true;
  }

  async generateAppInstaller(projectRef?: QpmWorkspaceProjectRef): Promise<string | undefined> {
    const context = this.resolve(projectRef);
    if (!context) return undefined;
    const content = generateAppInstallerFile(context.manifest, this.builds.buildMode, path.basename(context.report.paths.msixPackage));
    writeText(context.report.paths.appInstaller, content);
    this.latestArtifact = context.report.paths.appInstaller;
    this.changed.fire();
    vscode.window.showInformationMessage(`App Installer file generated: ${path.basename(context.report.paths.appInstaller)}`);
    return context.report.paths.appInstaller;
  }

  async generateWingetManifests(projectRef?: QpmWorkspaceProjectRef, notify = true): Promise<string[] | undefined> {
    const context = this.resolve(projectRef, notify);
    if (!context) return undefined;
    if (!context.manifest.publication.winget.enabled && notify) {
      vscode.window.showWarningMessage('WinGet manifest generation is disabled in Qt Project Settings.');
      return undefined;
    }
    const installer = this.resolveInstallerArtifact(context);
    const hash = installer && fs.existsSync(installer) ? sha256File(installer) : ''.padEnd(64, '0');
    const manifests = generateWingetManifestSet(context.manifest, this.builds.buildMode, hash);
    writeText(context.report.paths.wingetVersionManifest, manifests.version);
    writeText(context.report.paths.wingetInstallerManifest, manifests.installer);
    writeText(context.report.paths.wingetLocaleManifest, manifests.locale);
    const files = [context.report.paths.wingetVersionManifest, context.report.paths.wingetInstallerManifest, context.report.paths.wingetLocaleManifest];
    if (notify) {
      this.latestArtifact = context.report.paths.wingetRoot;
      vscode.window.showInformationMessage('WinGet manifests generated.');
      this.changed.fire();
    }
    return files;
  }

  async validateWingetManifests(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.resolve(projectRef);
    if (!context) return false;
    const files = await this.generateWingetManifests(context.ref, false);
    if (!files) return false;
    if (!context.report.tools.winget) {
      const valid = files.every((file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('ManifestType:'));
      vscode.window.showWarningMessage(valid ? 'WinGet CLI was not found. Internal manifest checks passed.' : 'WinGet CLI was not found and internal checks failed.');
      return valid;
    }
    this.output.show(true);
    return runProcess(context.report.tools.winget, ['validate', '--manifest', context.report.paths.wingetRoot], context.root, this.output);
  }

  async createReleaseBundle(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.resolve(projectRef);
    if (!context) return false;
    if (!context.manifest.publication.enabled) {
      vscode.window.showWarningMessage('Publication is disabled in Qt Project Settings.');
      return false;
    }
    fs.rmSync(context.report.paths.releaseRoot, { recursive: true, force: true });
    fs.mkdirSync(context.report.paths.releaseRoot, { recursive: true });
    const artifacts: string[] = [];

    if (context.manifest.publication.includePortablePackage) {
      if (!await this.packaging.createPortablePackage(context.ref)) return false;
      const packagingReport = this.packaging.getReport(context.ref);
      if (packagingReport) {
        const packaged = packagingReport.archivePath && fs.existsSync(packagingReport.archivePath) ? packagingReport.archivePath : packagingReport.stageDirectory;
        if (fs.existsSync(packaged)) artifacts.push(copyArtifact(packaged, context.report.paths.releaseRoot));
      }
    }
    if (context.manifest.publication.includeInstaller) {
      const installerReport = this.installers.getReport(context.ref);
      if (installerReport && !fs.existsSync(installerReport.installerPath)) {
        const ok = await this.installers.createInstaller(context.ref);
        if (!ok) return false;
      }
      const installer = this.resolveInstallerArtifact(context);
      if (installer && fs.existsSync(installer)) artifacts.push(copyArtifact(installer, context.report.paths.releaseRoot));
    }
    if (context.manifest.publication.msix.enabled) {
      if (!fs.existsSync(context.report.paths.msixPackage) && !await this.createMsixPackage(context.ref)) return false;
      if (fs.existsSync(context.report.paths.msixPackage)) artifacts.push(copyArtifact(context.report.paths.msixPackage, context.report.paths.releaseRoot));
      if (fs.existsSync(context.report.paths.appInstaller)) artifacts.push(copyArtifact(context.report.paths.appInstaller, context.report.paths.releaseRoot));
    }
    if (context.manifest.publication.includeQtIfwRepository) {
      const installerReport = this.installers.getReport(context.ref);
      if (installerReport && !fs.existsSync(installerReport.repositoryPath)) await this.installers.createUpdateRepository(context.ref);
      if (installerReport && fs.existsSync(installerReport.repositoryPath)) artifacts.push(copyArtifact(installerReport.repositoryPath, context.report.paths.releaseRoot));
    }
    if (context.manifest.publication.winget.enabled) {
      const wingetFiles = await this.generateWingetManifests(context.ref, false);
      if (wingetFiles) for (const file of wingetFiles) artifacts.push(copyArtifact(file, path.join(context.report.paths.releaseRoot, 'winget')));
    }

    this.writeReleaseMetadata(context, artifacts);
    this.latestArtifact = context.report.paths.releaseRoot;
    this.changed.fire();
    vscode.window.showInformationMessage(`Release bundle created for ${context.manifest.packaging.productName} ${context.manifest.packaging.productVersion}.`);
    return true;
  }

  async publishRelease(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const context = this.resolve(projectRef);
    if (!context) return false;
    if (!fs.existsSync(context.report.paths.releaseRoot) && !await this.createReleaseBundle(context.ref)) return false;
    const target = context.manifest.publication.publish.target;
    if (target === 'none') {
      vscode.window.showWarningMessage('No publication target is configured.');
      return false;
    }
    if (target === 'local') return this.publishLocal(context);
    if (target === 'ssh') return this.publishSsh(context);
    if (target === 'github') return this.publishGithub(context);
    return false;
  }

  async openReport(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const context = this.resolve(projectRef);
    if (!context) return;
    const report = context.report;
    const lines = [
      `# QPM Publication and Updates Report — ${report.project}`,
      '',
      `- Product: **${report.productName} ${report.version}**`,
      `- Channel: **${report.channel}**`,
      `- Output: \`${report.outputRoot}\``,
      `- Publish target: **${context.manifest.publication.publish.target}**`,
      '',
      '## Tool readiness',
      '',
      ...Object.entries(report.tools).map(([key, value]) => `- ${key}: ${value ? `\`${value}\`` : '**not found**'}`),
      '',
      '## Validation',
      '',
      ...(report.issues.length ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()}** — ${issue.message}`) : ['- **OK** — Publication configuration is ready.']),
      '',
      '## Generated outputs',
      '',
      `- Release bundle: \`${report.paths.releaseRoot}\``,
      `- MSIX: \`${report.paths.msixPackage}\``,
      `- App Installer: \`${report.paths.appInstaller}\``,
      `- WinGet manifests: \`${report.paths.wingetRoot}\``,
      `- Release manifest: \`${report.paths.releaseManifest}\``,
      `- Latest manifest: \`${report.paths.latestManifest}\``,
      '',
      'Authentication secrets are not written to the project manifest. GitHub uses the authenticated gh CLI session; SSH uses the configured system tools and keys.',
      ''
    ];
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async revealOutput(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const context = this.resolve(projectRef);
    if (!context) return;
    fs.mkdirSync(context.report.outputRoot, { recursive: true });
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(context.report.outputRoot));
  }

  async cleanOutput(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const context = this.resolve(projectRef);
    if (!context) return;
    fs.rmSync(context.report.outputRoot, { recursive: true, force: true });
    fs.rmSync(context.report.paths.generatedRoot, { recursive: true, force: true });
    this.latestArtifact = '';
    this.changed.fire();
    vscode.window.showInformationMessage(`Publication output cleaned for ${context.manifest.name}.`);
  }

  private resolve(projectRef?: QpmWorkspaceProjectRef, notify = true): PublicationContext | undefined {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      if (notify) vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      return undefined;
    }
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const root = path.dirname(ref.absolutePath);
      return { ref, manifest, root, report: this.createReport(ref, manifest) };
    } catch (error) {
      if (notify) vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  private createReport(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest): QtPublicationReport {
    const root = path.dirname(ref.absolutePath);
    const identity = resolveQtPackageIdentity(manifest, this.builds.buildMode);
    const outputRoot = path.resolve(root, manifest.publication.outputDirectory);
    const paths = publicationPaths(ref.absolutePath, manifest, this.builds.buildMode);
    const tools = detectPublicationTools(manifest);
    const issues: QtPublicationIssue[] = [];
    if (!manifest.publication.enabled) issues.push({ severity: 'info', message: 'Publication is disabled.' });
    if (manifest.publication.msix.enabled) {
      if (!tools.makeAppx) issues.push({ severity: 'error', message: 'MakeAppx.exe was not found.' });
      if (!manifest.publication.msix.packageIdentityName) issues.push({ severity: 'error', message: 'MSIX package identity is empty.' });
      if (!/^CN=/.test(manifest.publication.msix.publisher)) issues.push({ severity: 'warning', message: 'MSIX publisher usually uses a certificate subject such as CN=Company.' });
      if (manifest.publication.msix.generateAppInstaller && !manifest.publication.msix.packageUri && !manifest.publication.baseUrl) issues.push({ severity: 'warning', message: 'App Installer generation should define a package URI or publication base URL.' });
      if (manifest.publication.msix.signPackage && !tools.signTool) issues.push({ severity: 'error', message: 'SignTool was not found for MSIX signing.' });
    }
    if (manifest.publication.winget.enabled) {
      if (!manifest.publication.winget.installerUrl) issues.push({ severity: 'error', message: 'WinGet publication requires an installer URL.' });
      if (!manifest.publication.winget.packageIdentifier.includes('.')) issues.push({ severity: 'warning', message: 'WinGet package identifiers normally use Publisher.Product form.' });
    }
    if (manifest.publication.publish.target === 'local' && !manifest.publication.publish.localDirectory) issues.push({ severity: 'error', message: 'Local publication requires a destination directory.' });
    if (manifest.publication.publish.target === 'ssh') {
      if (!manifest.publication.publish.sshHost || !manifest.publication.publish.sshDirectory) issues.push({ severity: 'error', message: 'SSH publication requires a host and remote directory.' });
      if (manifest.publication.publish.useRsync && !tools.rsync) issues.push({ severity: 'error', message: 'rsync was not found.' });
      if (!manifest.publication.publish.useRsync && !tools.scp) issues.push({ severity: 'error', message: 'scp was not found.' });
    }
    if (manifest.publication.publish.target === 'github') {
      if (!tools.gh) issues.push({ severity: 'error', message: 'GitHub CLI was not found.' });
      if (!manifest.publication.github.repository) issues.push({ severity: 'error', message: 'GitHub publication requires an owner/repository value.' });
    }
    const artifacts = listFiles(paths.releaseRoot);
    return { project: manifest.name, enabled: manifest.publication.enabled, productName: identity.productName, version: identity.version, channel: manifest.publication.channel, msixEnabled: manifest.publication.msix.enabled, wingetEnabled: manifest.publication.winget.enabled, publishTarget: manifest.publication.publish.target, outputRoot, paths, tools, artifacts, issues };
  }

  private prepareMsixLayout(context: PublicationContext): void {
    const assetsDirectory = path.join(context.report.paths.msixLayout, 'Assets');
    fs.mkdirSync(assetsDirectory, { recursive: true });
    copyOrPlaceholderAsset(context.root, context.manifest.publication.msix.logo44, path.join(assetsDirectory, 'Square44x44Logo.png'));
    copyOrPlaceholderAsset(context.root, context.manifest.publication.msix.logo150, path.join(assetsDirectory, 'Square150x150Logo.png'));
    copyOrPlaceholderAsset(context.root, context.manifest.publication.msix.storeLogo, path.join(assetsDirectory, 'StoreLogo.png'));
    writeText(path.join(context.report.paths.msixLayout, 'AppxManifest.xml'), generateMsixManifest(context.manifest, this.builds.buildMode));
  }

  private async signMsix(context: PublicationContext): Promise<boolean> {
    const tool = context.report.tools.signTool;
    if (!tool) return false;
    const signing = context.manifest.packaging.installer.signing;
    const args = ['sign', '/fd', signing.fileDigest];
    if (signing.certificateFile) {
      args.push('/f', path.resolve(context.root, signing.certificateFile));
      const password = process.env[signing.certificatePasswordEnvironment];
      if (password) args.push('/p', password);
    } else if (signing.certificateThumbprint) args.push('/sha1', signing.certificateThumbprint);
    else if (signing.certificateSubject) args.push('/n', signing.certificateSubject);
    else args.push('/a');
    if (signing.timestampUrl) args.push('/tr', signing.timestampUrl, '/td', signing.timestampDigest);
    args.push(...signing.additionalArguments, context.report.paths.msixPackage);
    return runProcess(tool, args, context.root, this.output, true);
  }

  private resolveInstallerArtifact(context: PublicationContext): string | undefined {
    if (fs.existsSync(context.report.paths.msixPackage) && context.manifest.publication.winget.installerType === 'msix') return context.report.paths.msixPackage;
    const installer = this.installers.latestInstallerPath || this.installers.getReport(context.ref)?.installerPath;
    if (installer && fs.existsSync(installer)) return installer;
    const packagingReport = this.packaging.getReport(context.ref);
    if (packagingReport?.archivePath && fs.existsSync(packagingReport.archivePath)) return packagingReport.archivePath;
    return undefined;
  }

  private writeReleaseMetadata(context: PublicationContext, providedArtifacts: string[]): void {
    fs.mkdirSync(context.report.paths.releaseRoot, { recursive: true });
    const artifacts = providedArtifacts.length ? providedArtifacts : listFiles(context.report.paths.releaseRoot);
    const normalizedArtifacts = artifacts.filter((entry) => fs.existsSync(entry)).map((entry) => ({
      name: path.basename(entry),
      type: fs.statSync(entry).isDirectory() ? 'directory' : 'file',
      size: fs.statSync(entry).isFile() ? fs.statSync(entry).size : 0,
      sha256: fs.statSync(entry).isFile() ? sha256File(entry) : '',
      url: joinUrl(context.manifest.publication.baseUrl, path.basename(entry))
    }));
    const metadata = {
      generatedBy: 'Qt Project Manager',
      schemaVersion: 1,
      project: context.manifest.name,
      productName: context.manifest.packaging.productName,
      version: context.manifest.packaging.productVersion,
      channel: context.manifest.publication.channel,
      generatedAt: new Date().toISOString(),
      minimumVersion: '',
      artifacts: normalizedArtifacts
    };
    writeText(context.report.paths.releaseManifest, `${JSON.stringify(metadata, null, 2)}\n`);
    if (context.manifest.publication.generateLatestManifest) writeText(context.report.paths.latestManifest, `${JSON.stringify(metadata, null, 2)}\n`);
    if (context.manifest.publication.generateChecksums) {
      const lines = normalizedArtifacts.filter((entry) => entry.sha256).map((entry) => `${entry.sha256}  ${entry.name}`);
      writeText(context.report.paths.checksums, `${lines.join('\n')}${lines.length ? '\n' : ''}`);
    }
    const configuredNotes = context.manifest.publication.releaseNotesFile ? path.resolve(context.root, context.manifest.publication.releaseNotesFile) : '';
    if (configuredNotes && fs.existsSync(configuredNotes)) fs.copyFileSync(configuredNotes, context.report.paths.releaseNotes);
    else if (!fs.existsSync(context.report.paths.releaseNotes)) writeText(context.report.paths.releaseNotes, `# ${context.manifest.packaging.productName} ${context.manifest.packaging.productVersion}\n\nRelease channel: ${context.manifest.publication.channel}.\n`);
  }

  private async publishLocal(context: PublicationContext): Promise<boolean> {
    const target = path.resolve(context.root, context.manifest.publication.publish.localDirectory);
    const parsed = path.parse(target);
    if (target === parsed.root || path.resolve(target) === path.resolve(context.root)) {
      vscode.window.showErrorMessage('Refusing to publish into a drive root or directly over the Qt project directory.');
      return false;
    }
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    copyDirectoryContents(context.report.paths.releaseRoot, target);
    this.latestArtifact = target;
    vscode.window.showInformationMessage(`Release published locally to ${target}.`);
    return true;
  }

  private async publishSsh(context: PublicationContext): Promise<boolean> {
    const config = context.manifest.publication.publish;
    const remote = `${config.sshUser ? `${config.sshUser}@` : ''}${config.sshHost}:${config.sshDirectory.replace(/\\/g, '/')}`;
    this.output.show(true);
    if (config.useRsync) {
      const tool = context.report.tools.rsync;
      if (!tool) return false;
      const args = ['-az', ...(config.deleteRemote ? ['--delete'] : []), '-e', `ssh -p ${config.sshPort}`, `${context.report.paths.releaseRoot}${path.sep}`, `${remote}/`];
      return runProcess(tool, args, context.root, this.output);
    }
    const tool = context.report.tools.scp;
    if (!tool) return false;
    return runProcess(tool, ['-P', String(config.sshPort), '-r', context.report.paths.releaseRoot, remote], context.root, this.output);
  }

  private async publishGithub(context: PublicationContext): Promise<boolean> {
    const config = context.manifest.publication.github;
    const tool = context.report.tools.gh;
    if (!tool) return false;
    const tag = expandTokens(config.tagPattern, context.manifest);
    const title = expandTokens(config.releaseNamePattern, context.manifest);
    const assets = listFiles(context.report.paths.releaseRoot).filter((entry) => fs.statSync(entry).isFile());
    const args = ['release', 'create', tag, ...assets, '--repo', config.repository, '--title', title];
    if (config.generateNotes) args.push('--generate-notes');
    else if (fs.existsSync(context.report.paths.releaseNotes)) args.push('--notes-file', context.report.paths.releaseNotes);
    if (config.draft) args.push('--draft');
    if (config.prerelease) args.push('--prerelease');
    let ok = await runProcess(tool, args, context.root, this.output);
    if (!ok && config.clobberAssets) {
      this.output.appendLine(`[Publication] Release creation failed; attempting to upload and replace assets on existing GitHub release ${tag}.`);
      ok = await runProcess(tool, ['release', 'upload', tag, ...assets, '--repo', config.repository, '--clobber'], context.root, this.output);
    }
    if (ok) vscode.window.showInformationMessage(`GitHub release ${tag} published.`);
    return ok;
  }
}

export function publicationPaths(manifestPath: string, manifest: QtProjectManifest, mode: string): QtPublicationPaths {
  const root = path.dirname(manifestPath);
  const identity = resolveQtPackageIdentity(manifest, mode as any);
  const outputRoot = path.resolve(root, manifest.publication.outputDirectory);
  const generatedRoot = path.join(root, '.qpm', 'publication', 'generated');
  const msixRoot = path.join(generatedRoot, 'msix');
  const architecture = resolveMsixArchitecture(manifest);
  const msixBase = sanitizePackageName(`${identity.productName}-${identity.version}-${architecture}`);
  const wingetRoot = path.join(generatedRoot, 'winget', manifest.publication.winget.packageIdentifier, identity.version);
  const releaseRoot = path.join(outputRoot, `${sanitizePackageName(identity.productName)}-${identity.version}-${manifest.publication.channel}`);
  return {
    root: outputRoot,
    releaseRoot,
    generatedRoot,
    msixRoot,
    msixLayout: path.join(msixRoot, 'layout'),
    msixManifest: path.join(msixRoot, 'AppxManifest.xml'),
    msixPackage: path.join(outputRoot, `${msixBase}.msix`),
    appInstaller: path.join(outputRoot, `${sanitizePackageName(identity.productName)}.appinstaller`),
    wingetRoot,
    wingetVersionManifest: path.join(wingetRoot, `${manifest.publication.winget.packageIdentifier}.yaml`),
    wingetInstallerManifest: path.join(wingetRoot, `${manifest.publication.winget.packageIdentifier}.installer.yaml`),
    wingetLocaleManifest: path.join(wingetRoot, `${manifest.publication.winget.packageIdentifier}.locale.${manifest.publication.winget.locale}.yaml`),
    releaseManifest: path.join(releaseRoot, 'release.json'),
    latestManifest: path.join(releaseRoot, 'latest.json'),
    checksums: path.join(releaseRoot, 'SHA256SUMS.txt'),
    releaseNotes: path.join(releaseRoot, 'RELEASE_NOTES.md')
  };
}

export function generateMsixManifest(manifest: QtProjectManifest, mode: string): string {
  const config = manifest.publication.msix;
  const architecture = resolveMsixArchitecture(manifest);
  const executable = `${manifest.targetName}.exe`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">\n  <Identity Name="${xmlEscape(config.packageIdentityName)}" Publisher="${xmlEscape(config.publisher)}" Version="${xmlEscape(config.version)}" ProcessorArchitecture="${architecture}"/>\n  <Properties>\n    <DisplayName>${xmlEscape(config.displayName)}</DisplayName>\n    <PublisherDisplayName>${xmlEscape(config.publisherDisplayName)}</PublisherDisplayName>\n    <Description>${xmlEscape(config.description)}</Description>\n    <Logo>Assets\\StoreLogo.png</Logo>\n  </Properties>\n  <Resources><Resource Language="${xmlEscape(manifest.publication.winget.locale || 'en-US')}"/></Resources>\n  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="${xmlEscape(config.minimumOsVersion)}" MaxVersionTested="${xmlEscape(config.targetOsVersion)}"/></Dependencies>\n  <Applications>\n    <Application Id="App" Executable="${xmlEscape(executable)}" EntryPoint="Windows.FullTrustApplication">\n      <uap:VisualElements DisplayName="${xmlEscape(config.displayName)}" Description="${xmlEscape(config.description)}" BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png"/>\n    </Application>\n  </Applications>\n  <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>\n</Package>\n`;
}

export function generateAppInstallerFile(manifest: QtProjectManifest, mode: string, packageFileName: string): string {
  const config = manifest.publication.msix;
  const architecture = resolveMsixArchitecture(manifest);
  const packageUri = config.packageUri || joinUrl(manifest.publication.baseUrl, packageFileName);
  const appInstallerUri = config.appInstallerUri || joinUrl(manifest.publication.baseUrl, `${sanitizePackageName(manifest.packaging.productName)}.appinstaller`);
  const updateChildren: string[] = [];
  if (config.updateOnLaunch) updateChildren.push(`    <OnLaunch HoursBetweenUpdateChecks="${config.hoursBetweenUpdateChecks}" ShowPrompt="${config.showPrompt}" UpdateBlocksActivation="${config.updateBlocksActivation}"/>`);
  if (config.automaticBackgroundTask) updateChildren.push('    <AutomaticBackgroundTask/>');
  if (config.forceUpdateFromAnyVersion) updateChildren.push('    <ForceUpdateFromAnyVersion>true</ForceUpdateFromAnyVersion>');
  return `<?xml version="1.0" encoding="utf-8"?>\n<AppInstaller xmlns="http://schemas.microsoft.com/appx/appinstaller/2021" Version="${xmlEscape(config.version)}" Uri="${xmlEscape(appInstallerUri)}">\n  <MainPackage Name="${xmlEscape(config.packageIdentityName)}" Publisher="${xmlEscape(config.publisher)}" Version="${xmlEscape(config.version)}" ProcessorArchitecture="${architecture}" Uri="${xmlEscape(packageUri)}"/>\n  <UpdateSettings>\n${updateChildren.join('\n')}\n  </UpdateSettings>\n</AppInstaller>\n`;
}

export function generateWingetManifestSet(manifest: QtProjectManifest, mode: string, installerSha256: string): { version: string; installer: string; locale: string } {
  const config = manifest.publication.winget;
  const version = manifest.packaging.productVersion;
  const architecture = resolveMsixArchitecture(manifest) === 'neutral' ? 'x64' : resolveMsixArchitecture(manifest);
  const schemaBase = 'https://aka.ms/winget-manifest';
  const versionManifest = `# yaml-language-server: $schema=${schemaBase}.version.1.10.0.schema.json\nPackageIdentifier: ${yamlScalar(config.packageIdentifier)}\nPackageVersion: ${yamlScalar(version)}\nDefaultLocale: ${yamlScalar(config.locale)}\nManifestType: version\nManifestVersion: 1.10.0\n`;
  const installerManifest = `# yaml-language-server: $schema=${schemaBase}.installer.1.10.0.schema.json\nPackageIdentifier: ${yamlScalar(config.packageIdentifier)}\nPackageVersion: ${yamlScalar(version)}\nMinimumOSVersion: ${yamlScalar(config.minimumOsVersion)}\nInstallerType: ${yamlScalar(config.installerType)}\nScope: ${yamlScalar(config.scope)}\nInstallers:\n  - Architecture: ${yamlScalar(architecture)}\n    InstallerUrl: ${yamlScalar(config.installerUrl)}\n    InstallerSha256: ${installerSha256.toUpperCase()}\nManifestType: installer\nManifestVersion: 1.10.0\n`;
  const optional = [
    config.publisherUrl ? `PublisherUrl: ${yamlScalar(config.publisherUrl)}` : '',
    config.packageUrl ? `PackageUrl: ${yamlScalar(config.packageUrl)}` : '',
    config.licenseUrl ? `LicenseUrl: ${yamlScalar(config.licenseUrl)}` : '',
    config.releaseNotesUrl ? `ReleaseNotesUrl: ${yamlScalar(config.releaseNotesUrl)}` : '',
    config.tags.length ? `Tags:\n${config.tags.map((entry) => `  - ${yamlScalar(entry)}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
  const localeManifest = `# yaml-language-server: $schema=${schemaBase}.defaultLocale.1.10.0.schema.json\nPackageIdentifier: ${yamlScalar(config.packageIdentifier)}\nPackageVersion: ${yamlScalar(version)}\nPackageLocale: ${yamlScalar(config.locale)}\nPublisher: ${yamlScalar(config.publisher)}\nPackageName: ${yamlScalar(config.packageName)}\nLicense: ${yamlScalar(config.license)}\nShortDescription: ${yamlScalar(config.shortDescription)}\n${optional}${optional ? '\n' : ''}ManifestType: defaultLocale\nManifestVersion: 1.10.0\n`;
  return { version: versionManifest, installer: installerManifest, locale: localeManifest };
}

export function detectPublicationTools(manifest: QtProjectManifest): QtPublicationToolReport {
  return {
    makeAppx: firstExisting([manifest.publication.msix.makeAppxPath, ...windowsSdkTools('makeappx.exe'), findOnPath('makeappx')]),
    signTool: firstExisting([manifest.packaging.installer.signing.signToolPath, ...windowsSdkTools('signtool.exe'), findOnPath('signtool')]),
    winget: firstExisting([manifest.publication.winget.wingetPath, findOnPath(process.platform === 'win32' ? 'winget.exe' : 'winget')]),
    wingetCreate: firstExisting([manifest.publication.winget.wingetCreatePath, findOnPath(process.platform === 'win32' ? 'wingetcreate.exe' : 'wingetcreate')]),
    gh: firstExisting([manifest.publication.github.ghPath, findOnPath(process.platform === 'win32' ? 'gh.exe' : 'gh')]),
    scp: firstExisting([manifest.publication.publish.scpPath, findOnPath(process.platform === 'win32' ? 'scp.exe' : 'scp')]),
    rsync: firstExisting([manifest.publication.publish.rsyncPath, findOnPath(process.platform === 'win32' ? 'rsync.exe' : 'rsync')])
  };
}

function resolveMsixArchitecture(manifest: QtProjectManifest): 'x86' | 'x64' | 'arm64' | 'neutral' {
  const configured = manifest.publication.msix.architecture;
  if (configured !== 'auto') return configured;
  const kit = getActiveQtKitProfile(manifest);
  const inferred = inferQtKitArchitecture(kit);
  if (inferred === 'x86' || inferred === 'x64') return inferred;
  const evidence = [kit?.compilerTargetTriple, kit?.compilerPath, kit?.name].filter(Boolean).join(' ').toLowerCase();
  return /aarch64|arm64/.test(evidence) ? 'arm64' : 'x64';
}

function windowsSdkTools(fileName: string): string[] {
  if (process.platform !== 'win32') return [];
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean).map((entry) => path.join(entry!, 'Windows Kits', '10', 'bin'));
  const results: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root).filter((entry) => /^\d+\.\d+/.test(entry)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      for (const arch of ['x64', 'x86', 'arm64']) results.push(path.join(root, version, arch, fileName));
    }
  }
  return results;
}

function findOnPath(name: string): string | undefined {
  if (path.isAbsolute(name) && fs.existsSync(name)) return name;
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory.replace(/^"|"$/g, ''), process.platform === 'win32' && !path.extname(name) ? `${name}${extension.toLowerCase()}` : name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function firstExisting(values: Array<string | undefined>): string | undefined {
  for (const value of values) if (value && fs.existsSync(value)) return path.resolve(value);
  return undefined;
}

function copyOrPlaceholderAsset(root: string, configured: string, destination: string): void {
  if (configured) {
    const source = path.resolve(root, configured);
    if (fs.existsSync(source)) { fs.copyFileSync(source, destination); return; }
  }
  const dimensions = /44x44/i.test(destination) ? [44, 44] : /150x150/i.test(destination) ? [150, 150] : [50, 50];
  fs.writeFileSync(destination, createTransparentPng(dimensions[0], dimensions[1]));
}

function createTransparentPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function copyDirectoryContents(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true, force: true });
    else fs.copyFileSync(from, to);
  }
}

function copyArtifact(source: string, destinationRoot: string): string {
  fs.mkdirSync(destinationRoot, { recursive: true });
  const destination = path.join(destinationRoot, path.basename(source));
  if (fs.statSync(source).isDirectory()) fs.cpSync(source, destination, { recursive: true, force: true });
  else fs.copyFileSync(source, destination);
  return destination;
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).map((entry) => path.join(root, entry));
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  fs.writeFileSync(filePath, content, 'utf8');
}

function joinUrl(base: string, fileName: string): string {
  if (!base) return fileName;
  return `${base.replace(/\/+$/g, '')}/${encodeURIComponent(fileName)}`;
}

function expandTokens(pattern: string, manifest: QtProjectManifest): string {
  return pattern.replace(/\$\{(version|productName|target|channel)\}/g, (_match, key: string) => {
    if (key === 'version') return manifest.packaging.productVersion;
    if (key === 'productName') return manifest.packaging.productName;
    if (key === 'target') return manifest.targetName;
    return manifest.publication.channel;
  });
}

function xmlEscape(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function yamlScalar(value: string): string {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_.+:/-]+$/.test(text) && !/^(?:true|false|null|~|\d+(?:\.\d+)*)$/i.test(text)) return text;
  return JSON.stringify(text);
}

async function runProcess(executable: string, args: string[], cwd: string, output: vscode.OutputChannel, redactPassword = false): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const shown = redactPassword ? args.map((entry, index) => index > 0 && args[index - 1] === '/p' ? '********' : entry) : args;
    output.appendLine(`[Publication] Tool: ${executable}`);
    output.appendLine(`[Publication] Arguments: ${shown.join(' ')}`);
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, env: process.env });
    child.stdout?.on('data', (data: Buffer) => output.append(data.toString()));
    child.stderr?.on('data', (data: Buffer) => output.append(data.toString()));
    child.on('error', (error) => { output.appendLine(`[Publication] ${error.message}`); resolve(false); });
    child.on('close', (code) => { output.appendLine(`[Publication] Process exited with code ${code ?? -1}.`); resolve(code === 0); });
  });
}
