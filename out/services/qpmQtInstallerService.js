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
exports.QpmQtInstallerService = void 0;
exports.detectQtInstallerTools = detectQtInstallerTools;
exports.buildSignToolPreviewArguments = buildSignToolPreviewArguments;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtInstallerModel_1 = require("./qpmQtInstallerModel");
class QpmQtInstallerService {
    workspaces;
    packaging;
    builds;
    installations;
    output = vscode.window.createOutputChannel('Qt Project Manager Installers');
    latestInstaller;
    constructor(workspaces, packaging, builds, installations) {
        this.workspaces = workspaces;
        this.packaging = packaging;
        this.builds = builds;
        this.installations = installations;
    }
    dispose() { this.output.dispose(); }
    get latestInstallerPath() { return this.latestInstaller; }
    getReport(projectRef) {
        return this.resolve(projectRef, false)?.report;
    }
    async detectTools(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return undefined;
        this.output.show(true);
        this.output.appendLine('');
        this.output.appendLine(`[Installer] Tool detection for ${context.manifest.name}`);
        for (const [name, value] of Object.entries(context.report.tools))
            this.output.appendLine(`[Installer] ${name}: ${value || 'not found'}`);
        const missing = context.report.issues.filter((issue) => issue.severity === 'error').length;
        vscode.window.showInformationMessage(missing ? `Installer tools detected with ${missing} blocking issue(s).` : 'Installer tools are ready.');
        return context.report.tools;
    }
    async generateInstallerProject(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return undefined;
        const stageReady = await this.ensureStage(context);
        if (!stageReady)
            return undefined;
        const generated = this.generateBackendFiles(context);
        this.output.appendLine(`[Installer] Generated sources: ${generated.root}`);
        vscode.window.showInformationMessage(`Installer sources generated for ${context.manifest.name}.`);
        return generated;
    }
    async createInstaller(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return false;
        if (!context.manifest.packaging.installer.enabled) {
            vscode.window.showWarningMessage('Desktop installer generation is disabled in Qt Project Settings.');
            return false;
        }
        const blocking = context.report.issues.filter((issue) => issue.severity === 'error');
        if (blocking.length) {
            this.output.show(true);
            for (const issue of blocking)
                this.output.appendLine(`[Installer] ERROR: ${issue.message}`);
            vscode.window.showErrorMessage('The installer configuration contains blocking errors. Open the installer report.');
            return false;
        }
        this.output.show(true);
        this.output.appendLine('');
        this.output.appendLine(`[Installer] Build ${context.report.backend} installer for ${context.manifest.name}`);
        if (!await this.ensureStage(context))
            return false;
        if (context.manifest.packaging.installer.signing.enabled && context.manifest.packaging.installer.signing.signTargetBinary) {
            const stagedTarget = path.join(context.report.stageDirectory, path.basename((0, qtProjectManifest_1.qtTargetPath)(context.ref.absolutePath, this.builds.buildMode, context.manifest)));
            if (fs.existsSync(stagedTarget) && !await this.signFile(stagedTarget, context))
                return false;
        }
        this.generateBackendFiles(context);
        fs.mkdirSync(context.report.outputRoot, { recursive: true });
        let success = false;
        if (context.report.backend === 'qt-ifw')
            success = await this.buildQtIfwInstaller(context);
        else if (context.report.backend === 'inno-setup')
            success = await this.buildInnoInstaller(context);
        else
            success = await this.buildNsisInstaller(context);
        if (!success)
            return false;
        const actualInstaller = findBuiltInstaller(context.report.outputRoot, context.report.identity.installerBaseName, context.report.installerPath) ?? context.report.installerPath;
        this.latestInstaller = actualInstaller;
        if (context.manifest.packaging.installer.signing.enabled && context.manifest.packaging.installer.signing.signInstaller) {
            if (!await this.signFile(actualInstaller, context))
                return false;
        }
        vscode.window.showInformationMessage(`Installer created: ${actualInstaller}`);
        return true;
    }
    async createUpdateRepository(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return false;
        if (!await this.ensureStage(context))
            return false;
        this.generateQtIfwFiles(context);
        const repogen = context.report.tools.repogen;
        if (!repogen) {
            vscode.window.showErrorMessage('Qt Installer Framework repogen was not found.');
            return false;
        }
        if (fs.existsSync(context.report.repositoryPath))
            fs.rmSync(context.report.repositoryPath, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(context.report.repositoryPath), { recursive: true });
        const ifw = context.manifest.packaging.installer.qtIfw;
        const args = ['-p', context.report.generated.qtIfwPackages, '--archive-format', ifw.archiveFormat, '--compression', String(ifw.compression), context.report.repositoryPath];
        const ok = await runProcess(repogen, args, path.dirname(context.ref.absolutePath), this.output);
        if (ok)
            vscode.window.showInformationMessage(`Qt IFW update repository created: ${context.report.repositoryPath}`);
        return ok;
    }
    async signDistributionArtifacts(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return false;
        const signing = context.manifest.packaging.installer.signing;
        if (!signing.enabled) {
            vscode.window.showWarningMessage('Authenticode signing is disabled in Qt Project Settings.');
            return false;
        }
        const files = [];
        if (signing.signTargetBinary) {
            const target = (0, qtProjectManifest_1.qtTargetPath)(context.ref.absolutePath, this.builds.buildMode, context.manifest);
            if (fs.existsSync(target))
                files.push(target);
        }
        if (signing.signInstaller) {
            const installer = this.latestInstaller ?? findBuiltInstaller(context.report.outputRoot, context.report.identity.installerBaseName, context.report.installerPath);
            if (installer && fs.existsSync(installer))
                files.push(installer);
        }
        if (!files.length) {
            vscode.window.showWarningMessage('No configured distribution artifact was found to sign.');
            return false;
        }
        for (const file of files)
            if (!await this.signFile(file, context))
                return false;
        vscode.window.showInformationMessage(`${files.length} distribution artifact(s) signed.`);
        return true;
    }
    async verifyDistributionSignatures(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return false;
        const signTool = context.report.tools.signTool;
        if (!signTool) {
            vscode.window.showErrorMessage('SignTool was not found. Install a Windows SDK or configure its path.');
            return false;
        }
        const candidates = [
            (0, qtProjectManifest_1.qtTargetPath)(context.ref.absolutePath, this.builds.buildMode, context.manifest),
            this.latestInstaller ?? findBuiltInstaller(context.report.outputRoot, context.report.identity.installerBaseName, context.report.installerPath) ?? ''
        ].filter((entry, index, values) => entry && fs.existsSync(entry) && values.indexOf(entry) === index);
        if (!candidates.length) {
            vscode.window.showWarningMessage('No executable or installer was found to verify.');
            return false;
        }
        for (const file of candidates) {
            if (!await runProcess(signTool, ['verify', '/pa', '/v', file], path.dirname(context.ref.absolutePath), this.output))
                return false;
        }
        vscode.window.showInformationMessage(`${candidates.length} signature(s) verified.`);
        return true;
    }
    async openReport(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return;
        const report = context.report;
        const lines = [
            `# QPM Installer and Signing Report — ${report.project}`,
            '',
            `- Backend: **${report.backend}**`,
            `- Product: **${report.identity.productName} ${report.identity.version}**`,
            `- Platform: **${report.identity.platform} · ${report.identity.architecture} · ${report.identity.configuration}**`,
            `- Portable staging: \`${report.stageDirectory}\``,
            `- Installer output: \`${report.installerPath}\``,
            `- Qt IFW repository: \`${report.repositoryPath}\``,
            '',
            '## Tool readiness',
            '',
            ...Object.entries(report.tools).map(([key, value]) => `- ${key}: ${value ? `\`${value}\`` : '**not found**'}`),
            '',
            '## Validation',
            '',
            ...(report.issues.length ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()}** — ${issue.message}`) : ['- **OK** — Installer configuration is ready.']),
            '',
            '## Generated sources',
            '',
            `- Qt IFW config: \`${report.generated.qtIfwConfig}\``,
            `- Qt IFW package: \`${report.generated.qtIfwPackageXml}\``,
            `- Inno Setup script: \`${report.generated.innoScript}\``,
            `- NSIS script: \`${report.generated.nsisScript}\``,
            '',
            'Passwords are never stored in the project manifest. A PFX password is read only from the configured environment variable at signing time.',
            ''
        ];
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async revealOutput(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return;
        fs.mkdirSync(context.report.outputRoot, { recursive: true });
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(context.report.outputRoot));
    }
    async cleanOutput(projectRef) {
        const context = this.resolve(projectRef);
        if (!context)
            return;
        if (fs.existsSync(context.report.outputRoot))
            fs.rmSync(context.report.outputRoot, { recursive: true, force: true });
        if (fs.existsSync(context.report.generated.root))
            fs.rmSync(context.report.generated.root, { recursive: true, force: true });
        this.latestInstaller = undefined;
        vscode.window.showInformationMessage(`Installer output cleaned for ${context.manifest.name}.`);
    }
    resolve(projectRef, notify = true) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            if (notify)
                vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
            return undefined;
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            return { ref, manifest, report: this.createReport(ref, manifest) };
        }
        catch (error) {
            if (notify)
                vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            return undefined;
        }
    }
    createReport(ref, manifest) {
        const packagingReport = this.packaging.getReport(ref);
        const identity = (0, qpmQtInstallerModel_1.resolveQtInstallerIdentity)(manifest, this.builds.buildMode);
        const root = path.dirname(ref.absolutePath);
        const outputRoot = path.resolve(root, manifest.packaging.installer.outputDirectory);
        const generated = (0, qpmQtInstallerModel_1.installerGeneratedPaths)(ref.absolutePath, manifest.packaging.installer.qtIfw.componentId);
        const extension = manifest.packaging.installer.backend === 'qt-ifw' && process.platform !== 'win32' ? '' : '.exe';
        const installerPath = path.join(outputRoot, `${identity.installerBaseName}${extension}`);
        const repositoryPath = path.resolve(root, manifest.packaging.installer.qtIfw.repositoryOutputDirectory);
        const tools = detectQtInstallerTools(manifest, this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, this.builds.buildMode))?.root);
        const issues = [];
        const config = manifest.packaging.installer;
        if (!config.enabled)
            issues.push({ severity: 'warning', message: 'Installer generation is disabled.' });
        if (!config.fileNamePattern.trim())
            issues.push({ severity: 'error', message: 'Installer filename pattern is empty.' });
        if (!config.installDirectoryName.trim())
            issues.push({ severity: 'error', message: 'Installation directory name is empty.' });
        if (!packagingReport)
            issues.push({ severity: 'error', message: 'Portable packaging report is unavailable.' });
        if (config.backend === 'qt-ifw' && !tools.binaryCreator)
            issues.push({ severity: 'error', message: 'Qt Installer Framework binarycreator was not found.' });
        if (config.backend === 'inno-setup' && !tools.iscc)
            issues.push({ severity: 'error', message: 'Inno Setup ISCC was not found.' });
        if (config.backend === 'nsis' && !tools.makensis)
            issues.push({ severity: 'error', message: 'NSIS makensis was not found.' });
        if ((config.backend === 'inno-setup' || config.backend === 'nsis') && process.platform !== 'win32')
            issues.push({ severity: 'error', message: 'Inno Setup and NSIS installer builds require Windows.' });
        if (config.qtIfw.mode === 'online' && !config.qtIfw.repositoryUrl)
            issues.push({ severity: 'error', message: 'Online Qt IFW installers require a repository URL.' });
        if (config.qtIfw.mode === 'hybrid' && !config.qtIfw.repositoryUrl)
            issues.push({ severity: 'warning', message: 'Hybrid Qt IFW installers should define a repository URL for maintenance updates.' });
        if (!/^[A-Za-z0-9_.-]+$/.test(config.qtIfw.componentId))
            issues.push({ severity: 'warning', message: 'Qt IFW component ID contains unsupported characters and will be normalized.' });
        const projectRoot = path.dirname(ref.absolutePath);
        if (config.backend === 'inno-setup' && config.inno.scriptFile && !fs.existsSync(resolveProjectPath(projectRoot, config.inno.scriptFile)))
            issues.push({ severity: 'error', message: `Custom Inno Setup script not found: ${config.inno.scriptFile}` });
        if (config.backend === 'nsis' && config.nsis.scriptFile && !fs.existsSync(resolveProjectPath(projectRoot, config.nsis.scriptFile)))
            issues.push({ severity: 'error', message: `Custom NSIS script not found: ${config.nsis.scriptFile}` });
        if (config.qtIfw.controlScript && !fs.existsSync(resolveProjectPath(projectRoot, config.qtIfw.controlScript)))
            issues.push({ severity: 'warning', message: `Qt IFW controller script not found: ${config.qtIfw.controlScript}` });
        if (config.qtIfw.componentScript && !fs.existsSync(resolveProjectPath(projectRoot, config.qtIfw.componentScript)))
            issues.push({ severity: 'warning', message: `Qt IFW component script not found: ${config.qtIfw.componentScript}` });
        if (config.signing.enabled) {
            if (process.platform !== 'win32')
                issues.push({ severity: 'error', message: 'Authenticode signing with SignTool requires Windows.' });
            if (!tools.signTool)
                issues.push({ severity: 'error', message: 'SignTool was not found.' });
            if (config.signing.certificateFile && !fs.existsSync(resolveProjectPath(root, config.signing.certificateFile)))
                issues.push({ severity: 'error', message: `Signing certificate not found: ${config.signing.certificateFile}` });
            if (!config.signing.certificateFile && !config.signing.certificateThumbprint && !config.signing.certificateSubject)
                issues.push({ severity: 'info', message: 'SignTool will automatically select a suitable certificate from the Windows certificate store.' });
        }
        return {
            project: manifest.name,
            backend: config.backend,
            identity,
            outputRoot,
            installerPath,
            repositoryPath,
            stageDirectory: packagingReport?.stageDirectory ?? path.join(path.resolve(root, manifest.packaging.outputDirectory), identity.packageName),
            generated,
            tools,
            issues
        };
    }
    async ensureStage(context) {
        const config = context.manifest.packaging.installer;
        if (config.buildPortablePackage) {
            const success = await this.packaging.createPortablePackage(context.ref);
            if (!success)
                return false;
        }
        if (!fs.existsSync(context.report.stageDirectory)) {
            vscode.window.showErrorMessage(`Portable staging directory not found: ${context.report.stageDirectory}`);
            return false;
        }
        return true;
    }
    generateBackendFiles(context) {
        if (context.report.backend === 'qt-ifw')
            this.generateQtIfwFiles(context);
        else if (context.report.backend === 'inno-setup')
            this.generateInnoFiles(context);
        else
            this.generateNsisFiles(context);
        return context.report.generated;
    }
    generateQtIfwFiles(context) {
        const { manifest, report, ref } = context;
        const paths = report.generated;
        if (fs.existsSync(paths.qtIfwRoot))
            fs.rmSync(paths.qtIfwRoot, { recursive: true, force: true });
        const componentId = (0, qpmQtInstallerModel_1.sanitizeComponentId)(manifest.packaging.installer.qtIfw.componentId);
        const packageRoot = path.join(paths.qtIfwPackages, componentId);
        const dataDirectory = path.join(packageRoot, 'data');
        const metaDirectory = path.join(packageRoot, 'meta');
        fs.mkdirSync(dataDirectory, { recursive: true });
        fs.mkdirSync(metaDirectory, { recursive: true });
        copyDirectoryContents(report.stageDirectory, dataDirectory);
        const targetName = path.basename((0, qtProjectManifest_1.qtTargetPath)(ref.absolutePath, this.builds.buildMode, manifest));
        let iconBase = '';
        if (manifest.packaging.icon) {
            const source = resolveProjectPath(path.dirname(ref.absolutePath), manifest.packaging.icon);
            if (fs.existsSync(source)) {
                const destination = path.join(path.dirname(paths.qtIfwConfig), path.basename(source));
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(source, destination);
                iconBase = path.basename(source, path.extname(source));
            }
        }
        let hasScript = false;
        const customComponentScript = manifest.packaging.installer.qtIfw.componentScript;
        if (customComponentScript) {
            const source = resolveProjectPath(path.dirname(ref.absolutePath), customComponentScript);
            if (fs.existsSync(source)) {
                fs.copyFileSync(source, paths.qtIfwComponentScript);
                hasScript = true;
            }
        }
        else if (manifest.kind !== 'static-library' && manifest.kind !== 'shared-library' && (manifest.packaging.installer.createDesktopShortcut || manifest.packaging.installer.createStartMenuShortcut)) {
            fs.writeFileSync(paths.qtIfwComponentScript, (0, qpmQtInstallerModel_1.renderQtIfwComponentScript)(manifest, targetName), 'utf8');
            hasScript = true;
        }
        if (manifest.packaging.installer.qtIfw.controlScript) {
            const source = resolveProjectPath(path.dirname(ref.absolutePath), manifest.packaging.installer.qtIfw.controlScript);
            if (fs.existsSync(source)) {
                const destination = path.join(path.dirname(paths.qtIfwConfig), path.basename(source));
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(source, destination);
            }
        }
        fs.mkdirSync(path.dirname(paths.qtIfwConfig), { recursive: true });
        const releaseDate = manifest.packaging.installer.qtIfw.releaseDate || new Date().toISOString().slice(0, 10);
        fs.writeFileSync(paths.qtIfwConfig, (0, qpmQtInstallerModel_1.renderQtIfwConfig)(manifest, report.identity, targetName, iconBase), 'utf8');
        fs.writeFileSync(paths.qtIfwPackageXml, (0, qpmQtInstallerModel_1.renderQtIfwPackageXml)(manifest, report.identity, releaseDate, hasScript), 'utf8');
    }
    generateInnoFiles(context) {
        const custom = context.manifest.packaging.installer.inno.scriptFile;
        if (custom)
            return;
        fs.mkdirSync(context.report.generated.innoRoot, { recursive: true });
        const script = (0, qpmQtInstallerModel_1.renderInnoSetupScript)(context.manifest, context.report.identity, path.dirname(context.ref.absolutePath), context.report.stageDirectory, context.report.outputRoot, context.report.identity.installerBaseName);
        fs.writeFileSync(context.report.generated.innoScript, script, 'utf8');
    }
    generateNsisFiles(context) {
        const custom = context.manifest.packaging.installer.nsis.scriptFile;
        if (custom)
            return;
        fs.mkdirSync(context.report.generated.nsisRoot, { recursive: true });
        const script = (0, qpmQtInstallerModel_1.renderNsisScript)(context.manifest, context.report.identity, context.report.stageDirectory, context.report.installerPath);
        fs.writeFileSync(context.report.generated.nsisScript, script, 'utf8');
    }
    async buildQtIfwInstaller(context) {
        const tool = context.report.tools.binaryCreator;
        if (!tool)
            return false;
        const ifw = context.manifest.packaging.installer.qtIfw;
        const args = [];
        if (ifw.mode === 'offline')
            args.push('--offline-only');
        else if (ifw.mode === 'online')
            args.push('--online-only');
        else
            args.push('--hybrid');
        if (context.report.tools.installerBase)
            args.push('-t', context.report.tools.installerBase);
        args.push('-p', context.report.generated.qtIfwPackages, '-c', context.report.generated.qtIfwConfig, '--archive-format', ifw.archiveFormat, '--compression', String(ifw.compression));
        args.push(...ifw.additionalArguments, context.report.installerPath);
        return await runProcess(tool, args, path.dirname(context.ref.absolutePath), this.output);
    }
    async buildInnoInstaller(context) {
        const tool = context.report.tools.iscc;
        if (!tool)
            return false;
        const configured = context.manifest.packaging.installer.inno.scriptFile;
        const script = configured ? resolveProjectPath(path.dirname(context.ref.absolutePath), configured) : context.report.generated.innoScript;
        return await runProcess(tool, [`/O${context.report.outputRoot}`, `/F${context.report.identity.installerBaseName}`, script], path.dirname(context.ref.absolutePath), this.output);
    }
    async buildNsisInstaller(context) {
        const tool = context.report.tools.makensis;
        if (!tool)
            return false;
        const configured = context.manifest.packaging.installer.nsis.scriptFile;
        const script = configured ? resolveProjectPath(path.dirname(context.ref.absolutePath), configured) : context.report.generated.nsisScript;
        return await runProcess(tool, [script], path.dirname(context.ref.absolutePath), this.output);
    }
    async signFile(file, context) {
        const signTool = context.report.tools.signTool;
        if (!signTool) {
            vscode.window.showErrorMessage('SignTool was not found.');
            return false;
        }
        if (!fs.existsSync(file)) {
            vscode.window.showErrorMessage(`File to sign not found: ${file}`);
            return false;
        }
        const config = context.manifest.packaging.installer.signing;
        const args = ['sign', '/fd', config.fileDigest.toUpperCase()];
        if (config.timestampUrl)
            args.push('/tr', config.timestampUrl, '/td', config.timestampDigest.toUpperCase());
        const root = path.dirname(context.ref.absolutePath);
        const sensitive = [];
        if (config.certificateFile) {
            args.push('/f', resolveProjectPath(root, config.certificateFile));
            const password = process.env[config.certificatePasswordEnvironment];
            if (password) {
                args.push('/p', password);
                sensitive.push(password);
            }
        }
        else if (config.certificateThumbprint)
            args.push('/sha1', config.certificateThumbprint);
        else if (config.certificateSubject)
            args.push('/n', config.certificateSubject);
        else
            args.push('/a');
        args.push(...config.additionalArguments, file);
        const signed = await runProcess(signTool, args, root, this.output, sensitive);
        if (!signed)
            return false;
        if (config.verifyAfterSigning)
            return await runProcess(signTool, ['verify', '/pa', '/v', file], root, this.output);
        return true;
    }
}
exports.QpmQtInstallerService = QpmQtInstallerService;
function detectQtInstallerTools(manifest, qtRoot) {
    const config = manifest.packaging.installer;
    const ifwRoots = qtInstallerFrameworkRoots(qtRoot);
    const binaryCreator = configuredOrDetected(config.qtIfw.binaryCreatorPath, [
        ...ifwRoots.flatMap((root) => executableCandidates(path.join(root, 'bin'), 'binarycreator')),
        ...ifwRoots.flatMap((root) => executableCandidates(root, 'binarycreator')),
        ...pathExecutableCandidates('binarycreator')
    ]);
    const binaryRoot = binaryCreator ? path.dirname(binaryCreator) : '';
    const repogen = configuredOrDetected(config.qtIfw.repogenPath, [
        ...executableCandidates(binaryRoot, 'repogen'),
        ...ifwRoots.flatMap((root) => executableCandidates(path.join(root, 'bin'), 'repogen')),
        ...pathExecutableCandidates('repogen')
    ]);
    const installerBase = configuredOrDetected(config.qtIfw.installerBasePath, [
        ...executableCandidates(binaryRoot, 'installerbase'),
        ...ifwRoots.flatMap((root) => executableCandidates(path.join(root, 'bin'), 'installerbase'))
    ]);
    const iscc = configuredInnoCompiler(config.inno.isccPath, [
        ...windowsProgramCandidates('Inno Setup 7', 'ISCC.exe'),
        ...windowsProgramCandidates('Inno Setup 6', 'ISCC.exe'),
        ...pathExecutableCandidates('ISCC')
    ]);
    const makensis = configuredOrDetected(config.nsis.makensisPath, [
        ...windowsProgramCandidates('NSIS', 'makensis.exe'),
        ...pathExecutableCandidates('makensis')
    ]);
    const signTool = configuredOrDetected(config.signing.signToolPath, [
        ...windowsSdkSignToolCandidates(),
        ...pathExecutableCandidates('signtool')
    ]);
    return { binaryCreator, repogen, installerBase, iscc, makensis, signTool };
}
function buildSignToolPreviewArguments(manifest, filePath) {
    const config = manifest.packaging.installer.signing;
    const args = ['sign', '/fd', config.fileDigest.toUpperCase()];
    if (config.timestampUrl)
        args.push('/tr', config.timestampUrl, '/td', config.timestampDigest.toUpperCase());
    if (config.certificateFile)
        args.push('/f', config.certificateFile, '/p', `<${config.certificatePasswordEnvironment}>`);
    else if (config.certificateThumbprint)
        args.push('/sha1', config.certificateThumbprint);
    else if (config.certificateSubject)
        args.push('/n', config.certificateSubject);
    else
        args.push('/a');
    return [...args, ...config.additionalArguments, filePath];
}
function configuredInnoCompiler(configured, candidates) {
    if (configured && isFile(configured)) {
        const normalized = path.normalize(configured);
        if (/^compil32\.exe$/i.test(path.basename(normalized))) {
            const commandLineCompiler = path.join(path.dirname(normalized), 'ISCC.exe');
            if (isFile(commandLineCompiler))
                return commandLineCompiler;
        }
        return normalized;
    }
    return firstExisting(candidates);
}
function configuredOrDetected(configured, candidates) {
    if (configured && isFile(configured))
        return path.normalize(configured);
    return firstExisting(candidates);
}
function qtInstallerFrameworkRoots(qtRoot) {
    const roots = [];
    let current = qtRoot ? path.normalize(qtRoot) : '';
    for (let depth = 0; current && depth < 6; depth += 1) {
        roots.push(path.join(current, 'Tools', 'QtInstallerFramework'));
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    if (process.platform === 'win32')
        roots.push('C:\\Qt\\Tools\\QtInstallerFramework');
    const expanded = [];
    for (const root of roots) {
        if (!isDirectory(root))
            continue;
        expanded.push(root);
        for (const entry of safeDirectories(root))
            expanded.push(path.join(root, entry));
    }
    return unique(expanded).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
function windowsProgramCandidates(directory, executable) {
    if (process.platform !== 'win32')
        return [];
    return unique([
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, directory, executable) : '',
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], directory, executable) : ''
    ].filter(Boolean));
}
function windowsSdkSignToolCandidates() {
    if (process.platform !== 'win32')
        return [];
    const roots = [
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Windows Kits', '10', 'bin') : '',
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Windows Kits', '10', 'bin') : ''
    ].filter(Boolean);
    const result = [];
    for (const root of roots) {
        if (!isDirectory(root))
            continue;
        for (const version of safeDirectories(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
            result.push(path.join(root, version, 'x64', 'signtool.exe'), path.join(root, version, 'x86', 'signtool.exe'));
        }
    }
    return result;
}
function pathExecutableCandidates(name) {
    const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
    const entries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    return entries.flatMap((directory) => extensions.map((extension) => path.join(directory, `${name}${extension}`)));
}
function executableCandidates(directory, baseName) {
    if (!directory)
        return [];
    return process.platform === 'win32'
        ? [path.join(directory, `${baseName}.exe`), path.join(directory, baseName)]
        : [path.join(directory, baseName), path.join(directory, `${baseName}.exe`)];
}
function firstExisting(candidates) {
    for (const candidate of unique(candidates))
        if (candidate && isFile(candidate))
            return path.normalize(candidate);
    return undefined;
}
function safeDirectories(directory) {
    try {
        return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }
    catch {
        return [];
    }
}
function isFile(candidate) {
    try {
        return fs.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
function isDirectory(candidate) {
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
}
function unique(values) { return [...new Set(values.filter(Boolean).map((entry) => path.normalize(entry)))]; }
function resolveProjectPath(root, value) { return path.isAbsolute(value) ? path.normalize(value) : path.resolve(root, value); }
function copyDirectoryContents(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory())
            fs.cpSync(from, to, { recursive: true, force: true });
        else if (entry.isFile())
            fs.copyFileSync(from, to);
    }
}
function findBuiltInstaller(outputRoot, baseName, preferred) {
    if (isFile(preferred))
        return preferred;
    if (!isDirectory(outputRoot))
        return undefined;
    const candidates = fs.readdirSync(outputRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && (entry.name === baseName || entry.name.toLowerCase() === `${baseName}.exe`.toLowerCase() || entry.name.toLowerCase().startsWith(baseName.toLowerCase())))
        .map((entry) => path.join(outputRoot, entry.name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0];
}
function runProcess(executable, args, cwd, output, sensitiveValues = []) {
    return new Promise((resolve) => {
        const displayArgs = args.map((arg) => sensitiveValues.includes(arg) ? '<redacted>' : quoteArgument(arg));
        output.appendLine(`[Installer] ${quoteArgument(executable)} ${displayArgs.join(' ')}`);
        const child = (0, child_process_1.spawn)(executable, args, { cwd, windowsHide: true, shell: false, env: process.env });
        child.stdout.on('data', (data) => output.append(String(data)));
        child.stderr.on('data', (data) => output.append(String(data)));
        child.on('error', (error) => { output.appendLine(`[Installer] ${error.message}`); resolve(false); });
        child.on('close', (code) => { output.appendLine(`[Installer] Exit code: ${code ?? -1}`); resolve(code === 0); });
    });
}
function quoteArgument(value) { return /[\s"']/g.test(value) ? JSON.stringify(value) : value; }
