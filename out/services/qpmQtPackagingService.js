"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpmQtPackagingService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtPackagingModel_1 = require("./qpmQtPackagingModel");
class QpmQtPackagingService {
    workspaces;
    builds;
    installations;
    output = vscode.window.createOutputChannel('Qt Project Manager Packaging');
    constructor(workspaces, builds, installations) {
        this.workspaces = workspaces;
        this.builds = builds;
        this.installations = installations;
    }
    dispose() { this.output.dispose(); }
    async generateMetadata(projectRef) {
        const resolved = this.resolve(projectRef);
        if (!resolved)
            return undefined;
        const paths = (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
        this.output.appendLine(`[Packaging] Product metadata generated in ${paths.root}`);
        vscode.window.showInformationMessage(`Qt product metadata generated for ${resolved.manifest.name}.`);
        return paths;
    }
    async createPortablePackage(projectRef) {
        const resolved = this.resolve(projectRef);
        if (!resolved)
            return false;
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
            if (!built)
                return false;
        }
        const targetPath = (0, qtProjectManifest_1.qtTargetPath)(ref.absolutePath, this.builds.buildMode, manifest);
        if (!fs.existsSync(targetPath)) {
            vscode.window.showErrorMessage(`Build target not found: ${targetPath}`);
            return false;
        }
        const metadata = (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(ref.absolutePath, manifest, this.builds.buildMode);
        let runtimeSourceDirectory;
        if (manifest.packaging.includeQtRuntime && manifest.kind !== 'static-library') {
            this.output.appendLine('[Packaging] Prepare clean standalone deployment before staging.');
            if (!await this.builds.deployQtRuntime(ref))
                return false;
            runtimeSourceDirectory = (0, qtProjectManifest_1.qtDeploymentDirectory)(ref.absolutePath, this.builds.buildMode, manifest);
        }
        const report = this.createReport(ref, manifest, metadata);
        if (report.issues.some((issue) => issue.severity === 'error')) {
            report.issues.forEach((issue) => this.output.appendLine(`[Packaging] ${issue.severity.toUpperCase()}: ${issue.message}`));
            vscode.window.showErrorMessage('The package configuration contains blocking errors. Open the packaging report.');
            return false;
        }
        if (manifest.packaging.cleanOutput && fs.existsSync(report.stageDirectory))
            fs.rmSync(report.stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(report.stageDirectory, { recursive: true });
        if (runtimeSourceDirectory) {
            this.copyRuntimeTree(runtimeSourceDirectory, report.stageDirectory, manifest.packaging.includeDebugSymbols);
        }
        else {
            fs.copyFileSync(targetPath, path.join(report.stageDirectory, path.basename(targetPath)));
        }
        this.copyProjectFile(ref.absolutePath, manifest.packaging.readmeFile, report.stageDirectory);
        this.copyProjectFile(ref.absolutePath, manifest.packaging.licenseFile, report.stageDirectory);
        for (const entry of manifest.packaging.extraFiles)
            this.copyProjectFile(ref.absolutePath, entry, report.stageDirectory);
        this.copyMetadataForPackage(metadata, report.stageDirectory, report.identity.platform);
        await this.releaseTranslations(ref, manifest, report.stageDirectory);
        const packageInfoDestination = path.join(report.stageDirectory, 'package-info.json');
        fs.copyFileSync(metadata.packageInfo, packageInfoDestination);
        this.output.appendLine(`[Packaging] Staging directory: ${report.stageDirectory}`);
        if (manifest.packaging.archiveFormat !== 'folder') {
            const archived = await this.createArchive(report.stageDirectory, report.archivePath, manifest.packaging.archiveFormat);
            if (!archived)
                return false;
            this.output.appendLine(`[Packaging] Archive: ${report.archivePath}`);
        }
        vscode.window.showInformationMessage(`Package created: ${report.archivePath ?? report.stageDirectory}`);
        return true;
    }
    async openReport(projectRef) {
        const resolved = this.resolve(projectRef);
        if (!resolved)
            return;
        const metadata = (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
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
    async revealOutput(projectRef) {
        const resolved = this.resolve(projectRef);
        if (!resolved)
            return;
        const outputRoot = path.resolve(path.dirname(resolved.ref.absolutePath), resolved.manifest.packaging.outputDirectory);
        fs.mkdirSync(outputRoot, { recursive: true });
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputRoot));
    }
    async cleanOutput(projectRef) {
        const resolved = this.resolve(projectRef);
        if (!resolved)
            return;
        const outputRoot = path.resolve(path.dirname(resolved.ref.absolutePath), resolved.manifest.packaging.outputDirectory);
        if (fs.existsSync(outputRoot))
            fs.rmSync(outputRoot, { recursive: true, force: true });
        vscode.window.showInformationMessage(`Packaging output cleaned for ${resolved.manifest.name}.`);
    }
    getReport(projectRef) {
        const resolved = this.resolve(projectRef, false);
        if (!resolved)
            return undefined;
        const metadata = (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(resolved.ref.absolutePath, resolved.manifest, this.builds.buildMode);
        return this.createReport(resolved.ref, resolved.manifest, metadata);
    }
    resolve(projectRef, notify = true) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            if (notify)
                vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
            return undefined;
        }
        return { ref, manifest: (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath) };
    }
    createReport(ref, manifest, metadata) {
        const identity = (0, qpmQtPackagingModel_1.resolveQtPackageIdentity)(manifest, this.builds.buildMode);
        const root = path.dirname(ref.absolutePath);
        const outputRoot = path.resolve(root, manifest.packaging.outputDirectory);
        const stageDirectory = path.join(outputRoot, identity.packageName);
        const archivePath = manifest.packaging.archiveFormat === 'folder' ? undefined : `${stageDirectory}${manifest.packaging.archiveFormat === 'zip' ? '.zip' : '.tar.gz'}`;
        const targetPath = (0, qtProjectManifest_1.qtTargetPath)(ref.absolutePath, this.builds.buildMode, manifest);
        const issues = [];
        if (!manifest.packaging.productName.trim())
            issues.push({ severity: 'error', message: 'Product name is empty.' });
        if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(manifest.packaging.productVersion))
            issues.push({ severity: 'error', message: 'Product version must use semantic form such as 1.2.3.' });
        if (!manifest.packaging.identifier.includes('.'))
            issues.push({ severity: 'warning', message: 'Application identifier should use reverse-DNS form, for example com.company.product.' });
        for (const [label, entry] of [['icon', manifest.packaging.icon], ['license', manifest.packaging.licenseFile], ['readme', manifest.packaging.readmeFile]]) {
            if (entry && !fs.existsSync(path.resolve(root, entry)))
                issues.push({ severity: 'warning', message: `${label} file not found: ${entry}` });
        }
        if (manifest.packaging.windows.embedVersionResource && process.platform === 'win32') {
            const installation = this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, this.builds.buildMode));
            const compilerBin = installation?.toolchain.binDir || (installation?.toolchain.cppCompilerPath ? path.dirname(installation.toolchain.cppCompilerPath) : '');
            const configured = manifest.packaging.windows.resourceCompilerPath ? path.resolve(root, manifest.packaging.windows.resourceCompilerPath) : '';
            const available = [configured, compilerBin && path.join(compilerBin, 'windres.exe'), compilerBin && path.join(compilerBin, 'windres')].filter(Boolean).some((entry) => fs.existsSync(entry));
            if (!available)
                issues.push({ severity: 'warning', message: 'windres was not found. Metadata files will be generated but not embedded by the direct MinGW backend.' });
        }
        if (!fs.existsSync(targetPath))
            issues.push({ severity: 'info', message: 'The target has not been built yet. Packaging can build it automatically.' });
        return { project: manifest.name, targetPath, outputRoot, stageDirectory, archivePath, identity, metadata, issues };
    }
    copyRuntimeTree(sourceDirectory, destination, includeDebugSymbols) {
        const excludedDirectories = new Set(['obj', 'generated', '.qpm', 'CMakeFiles']);
        const excludedExtensions = new Set(['.o', '.obj', '.d', '.gch', '.exp', '.ilk']);
        const walk = (source, target) => {
            fs.mkdirSync(target, { recursive: true });
            for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
                if (entry.isDirectory() && excludedDirectories.has(entry.name))
                    continue;
                const sourcePath = path.join(source, entry.name);
                const targetPath = path.join(target, entry.name);
                if (entry.isDirectory())
                    walk(sourcePath, targetPath);
                else {
                    const extension = path.extname(entry.name).toLowerCase();
                    if (excludedExtensions.has(extension))
                        continue;
                    if (!includeDebugSymbols && ['.pdb', '.debug', '.dwarf'].includes(extension))
                        continue;
                    if (/^qpm_(?:link|unity)/i.test(entry.name))
                        continue;
                    fs.copyFileSync(sourcePath, targetPath);
                }
            }
        };
        walk(sourceDirectory, destination);
    }
    copyProjectFile(manifestPath, entry, destination) {
        if (!entry)
            return;
        const source = path.resolve(path.dirname(manifestPath), entry);
        if (!fs.existsSync(source))
            return;
        const target = path.join(destination, path.basename(source));
        if (fs.statSync(source).isDirectory())
            copyDirectory(source, target);
        else
            fs.copyFileSync(source, target);
    }
    copyMetadataForPackage(metadata, destination, platform) {
        const metadataRoot = path.join(destination, 'metadata');
        fs.mkdirSync(metadataRoot, { recursive: true });
        fs.copyFileSync(metadata.packageInfo, path.join(metadataRoot, 'package-info.json'));
        if (platform.includes('linux') || process.platform === 'linux')
            fs.copyFileSync(metadata.linuxDesktopEntry, path.join(metadataRoot, path.basename(metadata.linuxDesktopEntry)));
        if (process.platform === 'win32') {
            fs.copyFileSync(metadata.windowsManifest, path.join(metadataRoot, path.basename(metadata.windowsManifest)));
            fs.copyFileSync(metadata.windowsResource, path.join(metadataRoot, path.basename(metadata.windowsResource)));
        }
    }
    async releaseTranslations(ref, manifest, destination) {
        if (!manifest.packaging.includeTranslations || manifest.files.translations.length === 0)
            return;
        const output = path.join(destination, 'translations');
        fs.mkdirSync(output, { recursive: true });
        const installation = this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, this.builds.buildMode));
        for (const entry of manifest.files.translations) {
            const source = path.resolve(path.dirname(ref.absolutePath), entry);
            if (!fs.existsSync(source))
                continue;
            const extension = path.extname(source).toLowerCase();
            if (extension === '.qm')
                fs.copyFileSync(source, path.join(output, path.basename(source)));
            else if (extension === '.ts' && installation?.lreleasePath) {
                await runProcess(installation.lreleasePath, [source, '-qm', path.join(output, `${path.basename(source, extension)}.qm`)], path.dirname(ref.absolutePath), this.output);
            }
        }
    }
    async createArchive(stageDirectory, archivePath, format) {
        fs.mkdirSync(path.dirname(archivePath), { recursive: true });
        if (fs.existsSync(archivePath))
            fs.rmSync(archivePath, { force: true });
        if (format === 'tar-gz') {
            const ok = await runProcess('tar', ['-czf', archivePath, '-C', path.dirname(stageDirectory), path.basename(stageDirectory)], path.dirname(stageDirectory), this.output);
            if (!ok)
                vscode.window.showErrorMessage('Unable to create tar.gz archive. Ensure tar is available.');
            return ok;
        }
        if (process.platform === 'win32') {
            const escapedSource = stageDirectory.replace(/'/g, "''");
            const escapedDestination = archivePath.replace(/'/g, "''");
            const command = `Compress-Archive -LiteralPath '${escapedSource}' -DestinationPath '${escapedDestination}' -Force`;
            const ok = await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], path.dirname(stageDirectory), this.output);
            if (ok)
                return true;
        }
        const zipOk = await runProcess('zip', ['-r', archivePath, path.basename(stageDirectory)], path.dirname(stageDirectory), this.output);
        if (!zipOk)
            vscode.window.showErrorMessage('Unable to create ZIP archive. Install zip or use the folder package format.');
        return zipOk;
    }
}
exports.QpmQtPackagingService = QpmQtPackagingService;
function copyDirectory(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory())
            copyDirectory(from, to);
        else
            fs.copyFileSync(from, to);
    }
}
function runProcess(executable, args, cwd, output) {
    return new Promise((resolve) => {
        output.appendLine(`[Packaging] ${executable} ${args.join(' ')}`);
        const child = (0, child_process_1.spawn)(executable, args, { cwd, windowsHide: true, env: process.env });
        child.stdout.on('data', (data) => output.append(data.toString()));
        child.stderr.on('data', (data) => output.append(data.toString()));
        child.on('error', (error) => { output.appendLine(`[Packaging] ${error.message}`); resolve(false); });
        child.on('close', (code) => resolve(code === 0));
    });
}
