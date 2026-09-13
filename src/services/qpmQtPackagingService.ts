import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { QpmWorkspaceProjectRef } from '../model/types';
import {
  QtProjectManifest, packageIconPath,
  getQtInstallationPreference,
  isQtProjectManifestPath,
  qtDeploymentDirectory,
  qtTargetPath,
  readQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmBuildService } from './qpmBuildService';
import { QpmQtInstallationService } from './qpmQtInstallationService';
import { QpmWorkspaceService } from './qpmWorkspaceService';
import { QtPackageIdentity, QtPackagingMetadataPaths, resolveQtPackageIdentity, writeQtPackagingMetadata } from './qpmQtPackagingModel';

export interface QtPackagingReport {
  project: string;
  targetPath: string;
  outputRoot: string;
  stageDirectory: string;
  archivePath?: string;
  identity: QtPackageIdentity;
  metadata: QtPackagingMetadataPaths;
  issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string }>;
}

export class QpmQtPackagingService implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel('Qt Project Manager Packaging');

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly builds: QpmBuildService,
    private readonly installations: QpmQtInstallationService
  ) {}

  dispose(): void { this.output.dispose(); }

  async generateMetadata(projectRef?: QpmWorkspaceProjectRef): Promise<QtPackagingMetadataPaths | undefined> {
    const resolved = this.resolve(projectRef);
    if (!resolved) return undefined;
    const paths = writeQtPackagingMetadata(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
    this.output.appendLine(`[Packaging] Product metadata generated in ${paths.root}`);
    vscode.window.showInformationMessage(`Qt product metadata generated for ${resolved.manifest.name}.`);
    return paths;
  }

  async createPortablePackage(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const resolved = this.resolve(projectRef);
    if (!resolved) return false;
    const { ref, manifest } = resolved;
    if (!manifest.packaging.enabled) {
      vscode.window.showWarningMessage('Packaging is disabled in Qt Project Settings.');
      return false;
    }

    this.output.show(true);
    this.output.appendLine('');
    this.output.appendLine(`[Packaging] Start ${manifest.name} (${this.builds.buildMode})`);
    if (manifest.packaging.buildBeforePackaging) {
      const built = await this.builds.build(false, ref);
      if (!built) return false;
    }

    const targetPath = qtTargetPath(ref.absolutePath, this.builds.buildMode, manifest);
    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Build target not found: ${targetPath}`);
      return false;
    }

    const metadata = writeQtPackagingMetadata(ref.absolutePath, manifest, this.builds.buildMode);
    let runtimeSourceDirectory: string | undefined;
    if (manifest.packaging.includeQtRuntime && manifest.kind !== 'static-library') {
      this.output.appendLine('[Packaging] Prepare clean standalone deployment before staging.');
      if (!await this.builds.deployQtRuntime(ref)) return false;
      runtimeSourceDirectory = qtDeploymentDirectory(ref.absolutePath, this.builds.buildMode, manifest);
    }

    const report = this.createReport(ref, manifest, metadata);
    if (report.issues.some((issue) => issue.severity === 'error')) {
      report.issues.forEach((issue) => this.output.appendLine(`[Packaging] ${issue.severity.toUpperCase()}: ${issue.message}`));
      vscode.window.showErrorMessage('The package configuration contains blocking errors. Open the packaging report.');
      return false;
    }

    if (manifest.packaging.cleanOutput && fs.existsSync(report.stageDirectory)) fs.rmSync(report.stageDirectory, { recursive: true, force: true });
    fs.mkdirSync(report.stageDirectory, { recursive: true });
    if (runtimeSourceDirectory) {
      this.copyRuntimeTree(runtimeSourceDirectory, report.stageDirectory, manifest.packaging.includeDebugSymbols);
    } else {
      fs.copyFileSync(targetPath, path.join(report.stageDirectory, path.basename(targetPath)));
    }
    this.copyProjectFile(ref.absolutePath, manifest.packaging.readmeFile, report.stageDirectory);
    this.copyProjectFile(ref.absolutePath, manifest.packaging.licenseFile, report.stageDirectory);
    for (const entry of manifest.packaging.extraFiles) this.copyProjectFile(ref.absolutePath, entry, report.stageDirectory);
    this.copyMetadataForPackage(metadata, report.stageDirectory, report.identity.platform);
    await this.releaseTranslations(ref, manifest, report.stageDirectory);

    const packageInfoDestination = path.join(report.stageDirectory, 'package-info.json');
    fs.copyFileSync(metadata.packageInfo, packageInfoDestination);
    this.output.appendLine(`[Packaging] Staging directory: ${report.stageDirectory}`);

    if (manifest.packaging.archiveFormat !== 'folder') {
      const archived = await this.createArchive(report.stageDirectory, report.archivePath!, manifest.packaging.archiveFormat);
      if (!archived) return false;
      this.output.appendLine(`[Packaging] Archive: ${report.archivePath}`);
    }
    vscode.window.showInformationMessage(`Package created: ${report.archivePath ?? report.stageDirectory}`);
    return true;
  }

  async openReport(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const resolved = this.resolve(projectRef);
    if (!resolved) return;
    const metadata = writeQtPackagingMetadata(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
    const report = this.createReport(resolved.ref, resolved.manifest, metadata);
    const lines = [
      `# QPM Packaging Report — ${resolved.manifest.name}`,
      '',
      `- Product: **${report.identity.productName}**`,
      `- Version: **${report.identity.version}**`,
      `- Platform: **${report.identity.platform}**`,
      `- Architecture: **${report.identity.architecture}**`,
      `- Configuration: **${report.identity.configuration}**`,
      `- Target: \`${report.targetPath}\``,
      `- Staging: \`${report.stageDirectory}\``,
      `- Archive: ${report.archivePath ? `\`${report.archivePath}\`` : 'folder only'}`,
      '',
      '## Validation',
      '',
      ...(report.issues.length ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()}** — ${issue.message}`) : ['- **OK** — Packaging configuration is ready.']),
      '',
      '## Generated metadata',
      '',
      `- Windows resource: \`${metadata.windowsResource}\``,
      `- Windows manifest: \`${metadata.windowsManifest}\``,
      `- Linux desktop entry: \`${metadata.linuxDesktopEntry}\``,
      `- Package information: \`${metadata.packageInfo}\``,
      ''
    ];
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async revealOutput(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const resolved = this.resolve(projectRef);
    if (!resolved) return;
    const outputRoot = path.resolve(path.dirname(resolved.ref.absolutePath), resolved.manifest.packaging.outputDirectory);
    fs.mkdirSync(outputRoot, { recursive: true });
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputRoot));
  }

  async cleanOutput(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const resolved = this.resolve(projectRef);
    if (!resolved) return;
    const outputRoot = path.resolve(path.dirname(resolved.ref.absolutePath), resolved.manifest.packaging.outputDirectory);
    if (fs.existsSync(outputRoot)) fs.rmSync(outputRoot, { recursive: true, force: true });
    vscode.window.showInformationMessage(`Packaging output cleaned for ${resolved.manifest.name}.`);
  }

  getReport(projectRef?: QpmWorkspaceProjectRef): QtPackagingReport | undefined {
    const resolved = this.resolve(projectRef, false);
    if (!resolved) return undefined;
    const metadata = writeQtPackagingMetadata(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
    return this.createReport(resolved.ref, resolved.manifest, metadata);
  }

  private resolve(projectRef?: QpmWorkspaceProjectRef, notify = true): { ref: QpmWorkspaceProjectRef; manifest: QtProjectManifest } | undefined {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      if (notify) vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      return undefined;
    }
    return { ref, manifest: readQtProjectManifest(ref.absolutePath) };
  }

  private createReport(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, metadata: QtPackagingMetadataPaths): QtPackagingReport {
    const identity = resolveQtPackageIdentity(manifest, this.builds.buildMode);
    const root = path.dirname(ref.absolutePath);
    const outputRoot = path.resolve(root, manifest.packaging.outputDirectory);
    const stageDirectory = path.join(outputRoot, identity.packageName);
    const archivePath = manifest.packaging.archiveFormat === 'folder' ? undefined : `${stageDirectory}${manifest.packaging.archiveFormat === 'zip' ? '.zip' : '.tar.gz'}`;
    const targetPath = qtTargetPath(ref.absolutePath, this.builds.buildMode, manifest);
    const issues: QtPackagingReport['issues'] = [];
    if (!manifest.packaging.productName.trim()) issues.push({ severity: 'error', message: 'Product name is empty.' });
    if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(manifest.packaging.productVersion)) issues.push({ severity: 'error', message: 'Product version must use semantic form such as 1.2.3.' });
    if (!manifest.packaging.identifier.includes('.')) issues.push({ severity: 'warning', message: 'Application identifier should use reverse-DNS form, for example com.company.product.' });
    for (const [label, entry] of [['icon', packageIconPath(manifest)], ['license', manifest.packaging.licenseFile], ['readme', manifest.packaging.readmeFile]] as Array<[string, string]>) {
      if (entry && !fs.existsSync(path.resolve(root, entry))) issues.push({ severity: 'warning', message: `${label} file not found: ${entry}` });
    }
    if (manifest.packaging.windows.embedVersionResource && process.platform === 'win32') {
      const installation = this.installations.getActive(getQtInstallationPreference(manifest, this.builds.buildMode));
      const compilerBin = installation?.toolchain.binDir || (installation?.toolchain.cppCompilerPath ? path.dirname(installation.toolchain.cppCompilerPath) : '');
      const configured = manifest.packaging.windows.resourceCompilerPath ? path.resolve(root, manifest.packaging.windows.resourceCompilerPath) : '';
      const available = [configured, compilerBin && path.join(compilerBin, 'windres.exe'), compilerBin && path.join(compilerBin, 'windres')].filter(Boolean).some((entry) => fs.existsSync(entry));
      if (!available) issues.push({ severity: 'warning', message: 'windres was not found. Metadata files will be generated but not embedded by the direct MinGW backend.' });
    }
    if (!fs.existsSync(targetPath)) issues.push({ severity: 'info', message: 'The target has not been built yet. Packaging can build it automatically.' });
    return { project: manifest.name, targetPath, outputRoot, stageDirectory, archivePath, identity, metadata, issues };
  }

  private copyRuntimeTree(sourceDirectory: string, destination: string, includeDebugSymbols: boolean): void {
    const excludedDirectories = new Set(['obj', 'generated', '.qpm', 'CMakeFiles']);
    const excludedExtensions = new Set(['.o', '.obj', '.d', '.gch', '.exp', '.ilk']);
    const walk = (source: string, target: string): void => {
      fs.mkdirSync(target, { recursive: true });
      for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);
        if (entry.isDirectory()) walk(sourcePath, targetPath);
        else {
          const extension = path.extname(entry.name).toLowerCase();
          if (excludedExtensions.has(extension)) continue;
          if (!includeDebugSymbols && ['.pdb', '.debug', '.dwarf'].includes(extension)) continue;
          if (/^qpm_(?:link|unity)/i.test(entry.name)) continue;
          fs.copyFileSync(sourcePath, targetPath);
        }
      }
    };
    walk(sourceDirectory, destination);
  }

  private copyProjectFile(manifestPath: string, entry: string, destination: string): void {
    if (!entry) return;
    const source = path.resolve(path.dirname(manifestPath), entry);
    if (!fs.existsSync(source)) return;
    const target = path.join(destination, path.basename(source));
    if (fs.statSync(source).isDirectory()) copyDirectory(source, target); else fs.copyFileSync(source, target);
  }

  private copyMetadataForPackage(metadata: QtPackagingMetadataPaths, destination: string, platform: string): void {
    const metadataRoot = path.join(destination, 'metadata');
    fs.mkdirSync(metadataRoot, { recursive: true });
    fs.copyFileSync(metadata.packageInfo, path.join(metadataRoot, 'package-info.json'));
    if (platform.includes('linux') || process.platform === 'linux') fs.copyFileSync(metadata.linuxDesktopEntry, path.join(metadataRoot, path.basename(metadata.linuxDesktopEntry)));
    if (process.platform === 'win32') {
      fs.copyFileSync(metadata.windowsManifest, path.join(metadataRoot, path.basename(metadata.windowsManifest)));
      fs.copyFileSync(metadata.windowsResource, path.join(metadataRoot, path.basename(metadata.windowsResource)));
    }
  }

  private async releaseTranslations(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, destination: string): Promise<void> {
    if (!manifest.packaging.includeTranslations || manifest.files.translations.length === 0) return;
    const output = path.join(destination, 'translations');
    fs.mkdirSync(output, { recursive: true });
    const installation = this.installations.getActive(getQtInstallationPreference(manifest, this.builds.buildMode));
    for (const entry of manifest.files.translations) {
      const source = path.resolve(path.dirname(ref.absolutePath), entry);
      if (!fs.existsSync(source)) continue;
      const extension = path.extname(source).toLowerCase();
      if (extension === '.qm') fs.copyFileSync(source, path.join(output, path.basename(source)));
      else if (extension === '.ts' && installation?.lreleasePath) {
        await runProcess(installation.lreleasePath, [source, '-qm', path.join(output, `${path.basename(source, extension)}.qm`)], path.dirname(ref.absolutePath), this.output);
      }
    }
  }

  private async createArchive(stageDirectory: string, archivePath: string, format: 'zip' | 'tar-gz'): Promise<boolean> {
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    if (fs.existsSync(archivePath)) fs.rmSync(archivePath, { force: true });
    if (format === 'tar-gz') {
      const ok = await runProcess('tar', ['-czf', archivePath, '-C', path.dirname(stageDirectory), path.basename(stageDirectory)], path.dirname(stageDirectory), this.output);
      if (!ok) vscode.window.showErrorMessage('Unable to create tar.gz archive. Ensure tar is available.');
      return ok;
    }
    if (process.platform === 'win32') {
      const escapedSource = stageDirectory.replace(/'/g, "''");
      const escapedDestination = archivePath.replace(/'/g, "''");
      const command = `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedDestination}' -Force`;
      const ok = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], path.dirname(stageDirectory), this.output);
      if (ok) return true;
    }
    const zipOk = await runProcess('zip', ['-r', archivePath, path.basename(stageDirectory)], path.dirname(stageDirectory), this.output);
    if (!zipOk) vscode.window.showErrorMessage('Unable to create ZIP archive. Install zip or use the folder package format.');
    return zipOk;
  }
}

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to); else fs.copyFileSync(from, to);
  }
}

function runProcess(executable: string, args: string[], cwd: string, output: vscode.OutputChannel): Promise<boolean> {
  return new Promise((resolve) => {
    output.appendLine(`[Packaging] ${executable} ${args.join(' ')}`);
    const child = spawn(executable, args, { cwd, windowsHide: true, env: process.env });
    child.stdout.on('data', (data) => output.append(data.toString()));
    child.stderr.on('data', (data) => output.append(data.toString()));
    child.on('error', (error) => { output.appendLine(`[Packaging] ${error.message}`); resolve(false); });
    child.on('close', (code) => resolve(code === 0));
  });
}
