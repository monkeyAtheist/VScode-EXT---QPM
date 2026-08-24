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
exports.QpmQtDependencyService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtDependencyModel_1 = require("./qpmQtDependencyModel");
class QpmQtDependencyService {
    workspaces;
    output;
    changeEmitter = new vscode.EventEmitter();
    onDidChange = this.changeEmitter.event;
    currentStatus;
    disposables = [];
    constructor(workspaces, output) {
        this.workspaces = workspaces;
        this.output = output;
        this.disposables.push(this.workspaces.onDidChange(() => void this.refresh()));
    }
    dispose() { for (const d of this.disposables)
        d.dispose(); this.changeEmitter.dispose(); }
    get status() { return this.currentStatus; }
    get activeManifestPath() {
        const ref = this.workspaces.activeProjectRef;
        return ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? ref.absolutePath : undefined;
    }
    async refresh() {
        const manifestPath = this.activeManifestPath;
        if (!manifestPath) {
            this.currentStatus = undefined;
            this.changeEmitter.fire();
            return undefined;
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
            if ((0, qtProjectManifest_1.isQtPythonProject)(manifest)) {
                this.currentStatus = undefined;
                this.changeEmitter.fire();
                return undefined;
            }
            const root = path.dirname(manifestPath);
            const cfg = manifest.dependencies;
            const vcpkgPath = resolveTool(cfg.vcpkg.executable, ['vcpkg', 'vcpkg.exe'], cfg.vcpkg.root ? [cfg.vcpkg.root, path.join(cfg.vcpkg.root, process.platform === 'win32' ? 'vcpkg.exe' : 'vcpkg')] : []);
            const conanPath = resolveTool(cfg.conan.executable, ['conan', 'conan.exe']);
            const pkgConfigPath = resolveTool(cfg.pkgConfig.executable, ['pkg-config', 'pkgconf', 'pkg-config.exe', 'pkgconf.exe']);
            const managers = [cfg.vcpkg.enabled ? 'vcpkg' : '', cfg.conan.enabled ? 'Conan 2' : '', cfg.pkgConfig.enabled ? 'pkg-config' : ''].filter(Boolean);
            const missing = [cfg.vcpkg.enabled && !vcpkgPath ? 'vcpkg' : '', cfg.conan.enabled && !conanPath ? 'Conan' : '', cfg.pkgConfig.enabled && !pkgConfigPath ? 'pkg-config' : ''].filter(Boolean);
            const integrationFile = (0, qpmQtDependencyModel_1.dependencyIntegrationPath)(root, cfg.outputDirectory);
            const lastSync = fs.existsSync(integrationFile) ? fs.statSync(integrationFile).mtime.toISOString() : undefined;
            const configuredPackages = cfg.vcpkg.dependencies.length + cfg.conan.requires.length + cfg.pkgConfig.packages.length;
            let state = !cfg.enabled ? 'disabled' : missing.length ? 'missing-tool' : fs.existsSync(integrationFile) ? 'ready' : 'needs-sync';
            let message = !cfg.enabled ? 'Dependency management is disabled for this project.' : missing.length ? `Missing tools: ${missing.join(', ')}.` : fs.existsSync(integrationFile) ? 'Dependency integration is synchronized.' : 'Generate/install dependencies to create build integration.';
            this.currentStatus = { projectName: manifest.name, manifestPath, enabled: cfg.enabled, state, message, vcpkgPath, conanPath, pkgConfigPath, managers, configuredPackages, outputDirectory: path.resolve(root, cfg.outputDirectory), integrationFile, lastSync };
        }
        catch (error) {
            this.currentStatus = { projectName: path.basename(manifestPath), manifestPath, enabled: true, state: 'error', message: error instanceof Error ? error.message : String(error), vcpkgPath: '', conanPath: '', pkgConfigPath: '', managers: [], configuredPackages: 0, outputDirectory: '', integrationFile: '' };
        }
        this.changeEmitter.fire();
        return this.currentStatus;
    }
    async configure() {
        const manifestPath = this.requireManifest();
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const enabled = await vscode.window.showQuickPick([{ label: 'Enable dependency management', value: true }, { label: 'Disable dependency management', value: false }], { title: 'Qt dependency management' });
        if (!enabled)
            return;
        manifest.dependencies.enabled = enabled.value;
        if (enabled.value) {
            const managers = await vscode.window.showQuickPick([
                { label: 'vcpkg', value: 'vcpkg', picked: manifest.dependencies.vcpkg.enabled },
                { label: 'Conan 2', value: 'conan', picked: manifest.dependencies.conan.enabled },
                { label: 'pkg-config', value: 'pkg', picked: manifest.dependencies.pkgConfig.enabled }
            ], { title: 'Dependency managers', canPickMany: true });
            if (managers) {
                manifest.dependencies.vcpkg.enabled = managers.some((x) => x.value === 'vcpkg');
                manifest.dependencies.conan.enabled = managers.some((x) => x.value === 'conan');
                manifest.dependencies.pkgConfig.enabled = managers.some((x) => x.value === 'pkg');
            }
        }
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
        await this.refresh();
    }
    async detectTools() {
        const status = await this.refresh();
        if (!status)
            return undefined;
        this.output.appendLine('[Qt Dependencies] Tool detection');
        this.output.appendLine(`[Qt Dependencies] vcpkg: ${status.vcpkgPath || 'not found'}`);
        this.output.appendLine(`[Qt Dependencies] Conan: ${status.conanPath || 'not found'}`);
        this.output.appendLine(`[Qt Dependencies] pkg-config: ${status.pkgConfigPath || 'not found'}`);
        vscode.window.showInformationMessage(status.message);
        return status;
    }
    async generateManifests() {
        const manifestPath = this.requireManifest();
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const cfg = manifest.dependencies;
        if (!cfg.enabled)
            throw new Error('Dependency management is disabled. Enable it in Qt Project Settings first.');
        if (cfg.vcpkg.enabled)
            this.generateVcpkgManifest(root, manifest.name, cfg);
        if (cfg.conan.enabled)
            this.generateConanManifest(root, cfg);
        await this.generateIntegration(manifestPath);
        await this.writeReport(manifestPath);
        this.output.appendLine(`[Qt Dependencies] Dependency manifests generated for ${manifest.name}.`);
        await this.refresh();
        return true;
    }
    async install() {
        const manifestPath = this.requireManifest();
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const cfg = manifest.dependencies;
        if (!cfg.enabled)
            throw new Error('Dependency management is disabled.');
        await this.generateManifests();
        const status = await this.refresh();
        if (!status)
            return false;
        if (cfg.vcpkg.enabled) {
            if (!status.vcpkgPath)
                throw new Error('vcpkg was not found. Configure the executable or VCPKG_ROOT.');
            const args = ['install', '--x-manifest-root', root, '--x-install-root', path.resolve(root, cfg.vcpkg.installRoot)];
            if (cfg.vcpkg.triplet)
                args.push('--triplet', cfg.vcpkg.triplet);
            if (cfg.vcpkg.hostTriplet)
                args.push('--host-triplet', cfg.vcpkg.hostTriplet);
            for (const entry of cfg.vcpkg.overlayPorts)
                args.push('--overlay-ports', path.resolve(root, entry));
            for (const entry of cfg.vcpkg.overlayTriplets)
                args.push('--overlay-triplets', path.resolve(root, entry));
            args.push(...cfg.vcpkg.additionalArguments);
            if (!await this.run(status.vcpkgPath, args, root, 'vcpkg install'))
                return false;
        }
        if (cfg.conan.enabled) {
            if (!status.conanPath)
                throw new Error('Conan was not found. Configure the executable or install Conan 2.');
            const conanfile = path.resolve(root, cfg.conan.manifestFile);
            const args = ['install', conanfile, '--output-folder', path.resolve(root, cfg.conan.outputDirectory)];
            if (cfg.conan.buildMissing)
                args.push('--build=missing');
            if (cfg.conan.profileHost)
                args.push('-pr:h', cfg.conan.profileHost);
            if (cfg.conan.profileBuild)
                args.push('-pr:b', cfg.conan.profileBuild);
            if (cfg.conan.lockfile)
                args.push('--lockfile', path.resolve(root, cfg.conan.lockfile));
            args.push(...cfg.conan.additionalArguments);
            if (!await this.run(status.conanPath, args, root, 'Conan install'))
                return false;
        }
        await this.generateIntegration(manifestPath);
        await this.writeReport(manifestPath);
        await this.refresh();
        vscode.window.showInformationMessage(`Dependencies synchronized for ${manifest.name}.`);
        return true;
    }
    async prepareForBuild(manifestPath, _mode) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!manifest.dependencies.enabled)
            return true;
        if (manifest.dependencies.autoInstallBeforeBuild)
            return this.installForManifest(manifestPath);
        const integration = (0, qpmQtDependencyModel_1.dependencyIntegrationPath)(path.dirname(manifestPath), manifest.dependencies.outputDirectory);
        if (!fs.existsSync(integration))
            await this.generateIntegration(manifestPath);
        return true;
    }
    async installForManifest(manifestPath) {
        const previous = this.workspaces.activeProjectRef;
        if (previous?.absolutePath === manifestPath)
            return this.install();
        // Dependency build order may include non-active projects. Use a non-interactive path.
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const cfg = manifest.dependencies;
        if (!cfg.enabled)
            return true;
        this.generateVcpkgManifest(root, manifest.name, cfg);
        this.generateConanManifest(root, cfg);
        const vcpkg = resolveTool(cfg.vcpkg.executable, ['vcpkg', 'vcpkg.exe'], cfg.vcpkg.root ? [cfg.vcpkg.root, path.join(cfg.vcpkg.root, process.platform === 'win32' ? 'vcpkg.exe' : 'vcpkg')] : []);
        const conan = resolveTool(cfg.conan.executable, ['conan', 'conan.exe']);
        if (cfg.vcpkg.enabled) {
            if (!vcpkg)
                throw new Error(`vcpkg is enabled for ${manifest.name} but was not found.`);
            const args = ['install', '--x-manifest-root', root, '--x-install-root', path.resolve(root, cfg.vcpkg.installRoot)];
            if (cfg.vcpkg.triplet)
                args.push('--triplet', cfg.vcpkg.triplet);
            if (cfg.vcpkg.hostTriplet)
                args.push('--host-triplet', cfg.vcpkg.hostTriplet);
            for (const entry of cfg.vcpkg.overlayPorts)
                args.push('--overlay-ports', path.resolve(root, entry));
            for (const entry of cfg.vcpkg.overlayTriplets)
                args.push('--overlay-triplets', path.resolve(root, entry));
            args.push(...cfg.vcpkg.additionalArguments);
            if (!await this.run(vcpkg, args, root, `vcpkg install — ${manifest.name}`))
                return false;
        }
        if (cfg.conan.enabled) {
            if (!conan)
                throw new Error(`Conan is enabled for ${manifest.name} but was not found.`);
            const args = ['install', path.resolve(root, cfg.conan.manifestFile), '--output-folder', path.resolve(root, cfg.conan.outputDirectory)];
            if (cfg.conan.buildMissing)
                args.push('--build=missing');
            if (cfg.conan.profileHost)
                args.push('-pr:h', cfg.conan.profileHost);
            if (cfg.conan.profileBuild)
                args.push('-pr:b', cfg.conan.profileBuild);
            if (cfg.conan.lockfile)
                args.push('--lockfile', path.resolve(root, cfg.conan.lockfile));
            args.push(...cfg.conan.additionalArguments);
            if (!await this.run(conan, args, root, `Conan install — ${manifest.name}`))
                return false;
        }
        await this.generateIntegration(manifestPath);
        return true;
    }
    async generateIntegration(manifestPath = this.requireManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const cfg = manifest.dependencies;
        const integration = (0, qpmQtDependencyModel_1.emptyDependencyIntegration)();
        integration.cmakeFindPackages = [...cfg.cmakeFindPackages];
        integration.cmakeLinkTargets = [...cfg.cmakeLinkTargets];
        integration.includeDirectories.push(...cfg.additionalIncludeDirectories.map((x) => path.resolve(root, x)));
        integration.libraryDirectories.push(...cfg.additionalLibraryDirectories.map((x) => path.resolve(root, x)));
        integration.libraries.push(...cfg.additionalLibraries);
        if (cfg.vcpkg.enabled) {
            const installRoot = path.resolve(root, cfg.vcpkg.installRoot);
            const triplet = cfg.vcpkg.triplet || inferVcpkgTriplet();
            const tripletRoot = path.join(installRoot, triplet);
            const include = path.join(tripletRoot, 'include');
            const lib = path.join(tripletRoot, 'lib');
            if (fs.existsSync(include))
                integration.includeDirectories.push(include);
            if (fs.existsSync(lib))
                integration.libraryDirectories.push(lib);
            const vcpkgRoot = cfg.vcpkg.root || process.env.VCPKG_ROOT || '';
            const toolchain = vcpkgRoot ? path.join(vcpkgRoot, 'scripts', 'buildsystems', 'vcpkg.cmake') : '';
            if (toolchain && fs.existsSync(toolchain))
                integration.cmakeConfigureArguments.push(`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`);
            if (cfg.vcpkg.triplet)
                integration.cmakeConfigureArguments.push(`-DVCPKG_TARGET_TRIPLET=${cfg.vcpkg.triplet}`);
        }
        if (cfg.conan.enabled) {
            const out = path.resolve(root, cfg.conan.outputDirectory);
            const candidates = [path.join(out, 'conan_toolchain.cmake'), path.join(out, 'build', 'generators', 'conan_toolchain.cmake'), path.join(out, 'generators', 'conan_toolchain.cmake')];
            const toolchain = candidates.find((x) => fs.existsSync(x));
            if (toolchain)
                integration.cmakeConfigureArguments.push(`-DCMAKE_TOOLCHAIN_FILE=${toolchain}`);
            const pkgPaths = [out, path.join(out, 'generators')].filter((x) => fs.existsSync(x));
            if (pkgPaths.length)
                integration.environment.PKG_CONFIG_PATH = pkgPaths.join(path.delimiter);
        }
        if (cfg.pkgConfig.enabled && cfg.pkgConfig.packages.length) {
            const exe = resolveTool(cfg.pkgConfig.executable, ['pkg-config', 'pkgconf', 'pkg-config.exe', 'pkgconf.exe']);
            if (!exe)
                throw new Error('pkg-config is enabled but no pkg-config/pkgconf executable was found.');
            const env = { ...process.env };
            const configuredPath = cfg.pkgConfig.searchPaths.map((x) => path.resolve(root, x)).join(path.delimiter);
            if (configuredPath)
                env.PKG_CONFIG_PATH = [configuredPath, env.PKG_CONFIG_PATH].filter(Boolean).join(path.delimiter);
            const flags = await runCapture(exe, [...(cfg.pkgConfig.staticLink ? ['--static'] : []), '--cflags', '--libs', ...cfg.pkgConfig.additionalArguments, ...cfg.pkgConfig.packages], root, env);
            parsePkgConfigFlags(flags, integration);
            if (configuredPath)
                integration.environment.PKG_CONFIG_PATH = configuredPath;
        }
        dedupeIntegration(integration);
        (0, qpmQtDependencyModel_1.writeDependencyIntegration)((0, qpmQtDependencyModel_1.dependencyIntegrationPath)(root, cfg.outputDirectory), integration);
        this.output.appendLine(`[Qt Dependencies] Build integration: ${(0, qpmQtDependencyModel_1.dependencyIntegrationPath)(root, cfg.outputDirectory)}`);
        return integration;
    }
    async openReport() {
        const manifestPath = this.requireManifest();
        const report = await this.writeReport(manifestPath);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(report), { preview: true });
    }
    async revealOutput() {
        const manifestPath = this.requireManifest();
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const dir = path.resolve(path.dirname(manifestPath), manifest.dependencies.outputDirectory);
        fs.mkdirSync(dir, { recursive: true });
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
    }
    async clean() {
        const manifestPath = this.requireManifest();
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const dir = path.resolve(path.dirname(manifestPath), manifest.dependencies.outputDirectory);
        if (fs.existsSync(dir))
            fs.rmSync(dir, { recursive: true, force: true });
        this.output.appendLine(`[Qt Dependencies] Cleaned ${dir}`);
        await this.refresh();
    }
    generateVcpkgManifest(root, projectName, cfg) {
        if (!cfg.vcpkg.enabled)
            return;
        const target = path.resolve(root, cfg.vcpkg.manifestFile);
        const deps = cfg.vcpkg.dependencies.map(parseVcpkgDependency);
        const json = { name: normalizeVcpkgName(projectName), 'version-string': '0.0.0', dependencies: deps };
        if (cfg.vcpkg.baseline)
            json['builtin-baseline'] = cfg.vcpkg.baseline;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
        this.output.appendLine(`[Qt Dependencies] Generated ${target}`);
    }
    generateConanManifest(root, cfg) {
        if (!cfg.conan.enabled)
            return;
        const target = path.resolve(root, cfg.conan.manifestFile);
        const lines = [];
        if (cfg.conan.requires.length)
            lines.push('[requires]', ...cfg.conan.requires, '');
        if (cfg.conan.toolRequires.length)
            lines.push('[tool_requires]', ...cfg.conan.toolRequires, '');
        lines.push('[generators]', 'CMakeDeps', 'CMakeToolchain', 'PkgConfigDeps', '');
        if (cfg.conan.options.length)
            lines.push('[options]', ...cfg.conan.options, '');
        lines.push('[layout]', 'cmake_layout', '');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
        this.output.appendLine(`[Qt Dependencies] Generated ${target}`);
    }
    async writeReport(manifestPath) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const cfg = manifest.dependencies;
        const status = await this.refresh();
        const report = path.resolve(root, cfg.outputDirectory, 'QPM_DEPENDENCIES.md');
        fs.mkdirSync(path.dirname(report), { recursive: true });
        const text = `# Qt Dependencies — ${manifest.name}\n\n- Enabled: ${cfg.enabled ? 'yes' : 'no'}\n- Auto install before build: ${cfg.autoInstallBeforeBuild ? 'yes' : 'no'}\n- vcpkg: ${cfg.vcpkg.enabled ? (status?.vcpkgPath || 'missing') : 'disabled'}\n- Conan 2: ${cfg.conan.enabled ? (status?.conanPath || 'missing') : 'disabled'}\n- pkg-config: ${cfg.pkgConfig.enabled ? (status?.pkgConfigPath || 'missing') : 'disabled'}\n- Integration: ${(0, qpmQtDependencyModel_1.dependencyIntegrationPath)(root, cfg.outputDirectory)}\n\n## vcpkg dependencies\n\n${cfg.vcpkg.dependencies.map((x) => `- ${x}`).join('\n') || '- none'}\n\n## Conan requires\n\n${cfg.conan.requires.map((x) => `- ${x}`).join('\n') || '- none'}\n\n## pkg-config packages\n\n${cfg.pkgConfig.packages.map((x) => `- ${x}`).join('\n') || '- none'}\n\n## CMake packages / targets\n\nFind packages:\n${cfg.cmakeFindPackages.map((x) => `- ${x}`).join('\n') || '- none'}\n\nLink targets:\n${cfg.cmakeLinkTargets.map((x) => `- ${x}`).join('\n') || '- none'}\n`;
        fs.writeFileSync(report, text, 'utf8');
        return report;
    }
    requireManifest() {
        const file = this.activeManifestPath;
        if (!file)
            throw new Error('Open a native Qt C++ project first.');
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(file);
        if ((0, qtProjectManifest_1.isQtPythonProject)(manifest))
            throw new Error('C++ dependency managers are not used by Qt for Python projects. Use pip/pyproject.toml for PySide6 dependencies.');
        return file;
    }
    run(executable, args, cwd, label) {
        this.output.appendLine(`[Qt Dependencies] ${label}`);
        this.output.appendLine(`[Qt Dependencies] Tool: ${executable}`);
        this.output.appendLine(`[Qt Dependencies] Arguments: ${args.map(renderArg).join(' ')}`);
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(executable, args, { cwd, env: process.env, shell: false });
            child.stdout.on('data', (data) => this.output.append(String(data)));
            child.stderr.on('data', (data) => this.output.append(String(data)));
            child.on('error', (error) => { this.output.appendLine(`[Qt Dependencies] ${error.message}`); resolve(false); });
            child.on('close', (code) => { this.output.appendLine(`[Qt Dependencies] ${path.basename(executable)} exited with code ${String(code)}.`); resolve(code === 0); });
        });
    }
}
exports.QpmQtDependencyService = QpmQtDependencyService;
function resolveTool(configured, names, extra = []) {
    for (const candidate of [configured, ...extra]) {
        if (!candidate)
            continue;
        const resolved = path.resolve(candidate);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile())
            return resolved;
    }
    const pathValue = process.env.PATH || '';
    for (const dir of pathValue.split(path.delimiter))
        for (const name of names) {
            const candidate = path.join(dir, name);
            if (fs.existsSync(candidate))
                return candidate;
        }
    return '';
}
function normalizeVcpkgName(value) { return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'qpm-project'; }
function parseVcpkgDependency(value) {
    const match = /^([^\[]+)\[([^\]]+)\]$/.exec(value.trim());
    return match ? { name: match[1].trim(), features: match[2].split(',').map((x) => x.trim()).filter(Boolean) } : value.trim();
}
function inferVcpkgTriplet() { return process.platform === 'win32' ? (process.arch === 'arm64' ? 'arm64-windows' : 'x64-windows') : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'arm64-osx' : 'x64-osx') : (process.arch === 'arm64' ? 'arm64-linux' : 'x64-linux'); }
function renderArg(value) { return /\s/.test(value) ? JSON.stringify(value) : value; }
function runCapture(executable, args, cwd, env) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(executable, args, { cwd, env, shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => stdout += String(d));
        child.stderr.on('data', (d) => stderr += String(d));
        child.on('error', reject);
        child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(executable)} exited with code ${String(code)}: ${stderr.trim()}`)));
    });
}
function parsePkgConfigFlags(text, integration) {
    const tokens = splitShell(text);
    for (const token of tokens) {
        if (token.startsWith('-I') && token.length > 2)
            integration.includeDirectories.push(token.slice(2));
        else if (token.startsWith('-L') && token.length > 2)
            integration.libraryDirectories.push(token.slice(2));
        else if (token.startsWith('-l') && token.length > 2)
            integration.libraries.push(token.slice(2));
        else if (token.startsWith('-D') || token.startsWith('-f') || token.startsWith('-pthread'))
            integration.compilerFlags.push(token);
        else
            integration.linkerFlags.push(token);
    }
}
function splitShell(value) { const result = []; const re = /"([^"]*)"|'([^']*)'|([^\s]+)/g; let m; while ((m = re.exec(value)))
    result.push(m[1] ?? m[2] ?? m[3]); return result; }
function dedupeIntegration(value) {
    for (const key of ['includeDirectories', 'libraryDirectories', 'libraries', 'compilerFlags', 'linkerFlags', 'cmakeConfigureArguments', 'cmakeFindPackages', 'cmakeLinkTargets'])
        value[key] = [...new Set(value[key])];
}
