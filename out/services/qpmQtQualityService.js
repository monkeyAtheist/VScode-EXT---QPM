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
exports.QpmQtQualityService = void 0;
exports.parseCompilerDiagnostics = parseCompilerDiagnostics;
exports.ensureSanitizerBuildProfiles = ensureSanitizerBuildProfiles;
exports.ensureCoverageBuildProfile = ensureCoverageBuildProfile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cxx']);
class QpmQtQualityService {
    workspaces;
    installations;
    output;
    diagnostics = vscode.languages.createDiagnosticCollection('qpm-quality');
    disposables = [this.diagnostics];
    lastDiagnostics = [];
    constructor(workspaces, installations, output) {
        this.workspaces = workspaces;
        this.installations = installations;
        this.output = output;
    }
    dispose() {
        while (this.disposables.length > 0)
            this.disposables.pop()?.dispose();
    }
    get diagnosticCount() {
        return this.lastDiagnostics.length;
    }
    getToolStatus(projectRef) {
        const context = this.resolveProjectContext(projectRef, false);
        const installation = context?.installation ?? this.installations.getActive();
        return {
            clangTidyPath: resolveQualityTool('clangTidyPath', ['clang-tidy'], installation),
            clazyPath: resolveQualityTool('clazyPath', ['clazy-standalone', 'clazy'], installation),
            gcovPath: resolveQualityTool('gcovPath', ['gcov'], installation)
        };
    }
    async runClangTidyFile(target, applyFixes = false) {
        const sourcePath = resolveSourceTarget(target) ?? activeSourcePath();
        if (!sourcePath)
            throw new Error('Select or open a C/C++ source file first.');
        await this.runAnalyzer('clang-tidy', [sourcePath], applyFixes);
    }
    async runClangTidyProject() {
        const context = this.resolveProjectContext(undefined, true);
        await this.runAnalyzer('clang-tidy', context.files, false, context.ref);
    }
    async runClazyFile(target) {
        const sourcePath = resolveSourceTarget(target) ?? activeSourcePath();
        if (!sourcePath)
            throw new Error('Select or open a C/C++ source file first.');
        await this.runAnalyzer('clazy', [sourcePath], false);
    }
    async runClazyProject() {
        const context = this.resolveProjectContext(undefined, true);
        await this.runAnalyzer('clazy', context.files, false, context.ref);
    }
    clearDiagnostics() {
        this.lastDiagnostics = [];
        this.diagnostics.clear();
        vscode.window.showInformationMessage('Qt quality diagnostics cleared.');
    }
    async configureQuality() {
        const context = this.resolveProjectContext(undefined, true);
        const manifest = context.manifest;
        const choice = await vscode.window.showQuickPick([
            { id: 'clang', label: 'Clang-Tidy checks', description: manifest.quality.clangTidyChecks },
            { id: 'clazy', label: 'Clazy checks', description: manifest.quality.clazyChecks },
            { id: 'header', label: 'Header filter', description: manifest.quality.headerFilter },
            { id: 'tools', label: 'Tool executable paths', description: 'Configure clang-tidy, Clazy or gcov' }
        ], { title: `Quality configuration — ${manifest.name}` });
        if (!choice)
            return;
        if (choice.id === 'tools') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'qpm.clangTidyPath');
            return;
        }
        const current = choice.id === 'clang' ? manifest.quality.clangTidyChecks : choice.id === 'clazy' ? manifest.quality.clazyChecks : manifest.quality.headerFilter;
        const value = await vscode.window.showInputBox({ title: choice.label, value: current, prompt: 'Comma-separated checks or a regular expression, depending on the selected field.' });
        if (value === undefined)
            return;
        if (choice.id === 'clang')
            manifest.quality.clangTidyChecks = value.trim();
        else if (choice.id === 'clazy')
            manifest.quality.clazyChecks = value.trim();
        else
            manifest.quality.headerFilter = value.trim() || '.*';
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.ref.absolutePath, manifest);
        this.workspaces.refresh();
        vscode.window.showInformationMessage(`Quality settings saved for ${manifest.name}.`);
    }
    async createSanitizerProfiles() {
        const context = this.resolveProjectContext(undefined, true);
        const created = ensureSanitizerBuildProfiles(context.manifest);
        if (created.length === 0) {
            vscode.window.showInformationMessage('AddressSanitizer and UndefinedBehaviorSanitizer build profiles already exist.');
            return;
        }
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.ref.absolutePath, context.manifest);
        this.workspaces.refresh();
        vscode.window.showInformationMessage(`Created sanitizer profiles: ${created.join(', ')}. Select one with “Manage Project Profiles”.`);
    }
    async createCoverageProfile() {
        const context = this.resolveProjectContext(undefined, true);
        const result = ensureCoverageBuildProfile(context.manifest);
        (0, qtProjectManifest_1.writeQtProjectManifest)(context.ref.absolutePath, context.manifest);
        this.workspaces.refresh();
        vscode.window.showInformationMessage(result.created ? 'Coverage build profile created.' : 'Coverage build profile is already available.');
        return result.profileId;
    }
    ensureCoverageProfile(manifestPath) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const result = ensureCoverageBuildProfile(manifest);
        if (result.created || manifest.quality.coverageBuildProfileId !== result.profileId)
            (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
        return result.profileId;
    }
    async openQualityReport() {
        const context = this.resolveProjectContext(undefined, true);
        const tools = this.getToolStatus(context.ref);
        const sanitizerProfiles = context.manifest.profiles.builds.filter((entry) => /^qpm-(?:asan|ubsan|asan-ubsan)$/.test(entry.id));
        const lines = [
            `# Qt Quality Report — ${context.manifest.name}`,
            '',
            `- Manifest: \`${context.ref.absolutePath}\``,
            `- Clang-Tidy: ${tools.clangTidyPath ? `\`${tools.clangTidyPath}\`` : 'not found'}`,
            `- Clazy: ${tools.clazyPath ? `\`${tools.clazyPath}\`` : 'not found'}`,
            `- gcov: ${tools.gcovPath ? `\`${tools.gcovPath}\`` : 'not found'}`,
            `- Published diagnostics: ${this.lastDiagnostics.length}`,
            `- Sanitizer profiles: ${sanitizerProfiles.length ? sanitizerProfiles.map((entry) => entry.name).join(', ') : 'none'}`,
            `- Coverage profile: ${context.manifest.quality.coverageBuildProfileId ?? 'none'}`,
            '',
            '## Static-analysis configuration',
            '',
            `- Clang-Tidy checks: \`${context.manifest.quality.clangTidyChecks}\``,
            `- Clazy checks: \`${context.manifest.quality.clazyChecks}\``,
            `- Header filter: \`${context.manifest.quality.headerFilter}\``,
            '',
            '## Current diagnostics',
            '',
            ...(this.lastDiagnostics.length ? this.lastDiagnostics.map((item) => `- **${item.severity}** ${item.filePath}:${item.line}:${item.column} — ${item.message}${item.check ? ` [${item.check}]` : ''}`) : ['No quality diagnostic is currently published.'])
        ];
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async runAnalyzer(kind, inputFiles, applyFixes, explicitRef) {
        const context = this.resolveProjectContext(explicitRef, true);
        const tools = this.getToolStatus(context.ref);
        const executable = kind === 'clang-tidy' ? tools.clangTidyPath : tools.clazyPath;
        if (!executable)
            throw new Error(`${kind === 'clang-tidy' ? 'clang-tidy' : 'clazy-standalone'} was not found. Configure its path in QPM settings or install LLVM/Clazy.`);
        const compileDatabase = path.join(context.projectRoot, 'compile_commands.json');
        if (!fs.existsSync(compileDatabase)) {
            const action = await vscode.window.showWarningMessage('compile_commands.json is missing. Synchronize Qt/C++ IntelliSense before running static analysis.', 'Synchronize now');
            if (action === 'Synchronize now')
                await vscode.commands.executeCommand('qpm.syncCppTools');
            if (!fs.existsSync(compileDatabase))
                throw new Error(`Compilation database not found: ${compileDatabase}`);
        }
        const files = uniquePaths(inputFiles.map((entry) => path.resolve(entry)).filter((entry) => SOURCE_EXTENSIONS.has(path.extname(entry).toLowerCase()) && fs.existsSync(entry)));
        if (files.length === 0)
            throw new Error('No existing C/C++ source file was selected for analysis.');
        this.output.show(true);
        this.output.appendLine(`[Qt Quality] ${kind} — ${context.manifest.name}`);
        this.output.appendLine(`[Qt Quality] Tool: ${executable}`);
        this.output.appendLine(`[Qt Quality] Sources: ${files.length}`);
        const discovered = [];
        for (const filePath of files) {
            const args = kind === 'clang-tidy'
                ? [filePath, '-p', context.projectRoot, `--checks=${context.manifest.quality.clangTidyChecks}`, `--header-filter=${context.manifest.quality.headerFilter}`, ...(applyFixes ? ['--fix', '--fix-errors'] : [])]
                : [filePath, '-p', context.projectRoot, `-checks=${context.manifest.quality.clazyChecks}`];
            this.output.appendLine(`[Qt Quality] ${path.basename(executable)} ${args.map(renderArgument).join(' ')}`);
            const result = await runProcess(executable, args, context.projectRoot, process.env, 300000);
            this.output.appendLine(normalizeOutput(result.stdout + result.stderr));
            discovered.push(...parseCompilerDiagnostics(result.stdout + result.stderr));
            if (result.timedOut)
                this.output.appendLine(`[Qt Quality] Timeout while analyzing ${filePath}.`);
        }
        this.publishDiagnostics(discovered);
        vscode.window.showInformationMessage(`${kind === 'clang-tidy' ? 'Clang-Tidy' : 'Clazy'} completed: ${discovered.length} diagnostic(s).`);
    }
    publishDiagnostics(items) {
        this.lastDiagnostics = items;
        this.diagnostics.clear();
        const grouped = new Map();
        for (const item of items) {
            const line = Math.max(0, item.line - 1);
            const column = Math.max(0, item.column - 1);
            const range = new vscode.Range(line, column, line, column + 1);
            const severity = item.severity === 'error' ? vscode.DiagnosticSeverity.Error : item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
            const diagnostic = new vscode.Diagnostic(range, item.message, severity);
            diagnostic.source = item.check ? `QPM ${item.check}` : 'QPM Quality';
            diagnostic.code = item.check;
            const key = path.resolve(item.filePath);
            const list = grouped.get(key) ?? [];
            list.push(diagnostic);
            grouped.set(key, list);
        }
        for (const [filePath, diagnostics] of grouped)
            this.diagnostics.set(vscode.Uri.file(filePath), diagnostics);
    }
    resolveProjectContext(projectRef, required = true) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            if (required)
                throw new Error('Open a native .qtproject.json project first.');
            return undefined;
        }
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const resolved = (0, qtProjectManifest_1.resolveQtProjectFiles)(ref.absolutePath, manifest);
        return {
            ref,
            manifest,
            projectRoot: path.dirname(ref.absolutePath),
            installation: this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest)),
            files: resolved.sources
        };
    }
}
exports.QpmQtQualityService = QpmQtQualityService;
function parseCompilerDiagnostics(output) {
    const result = [];
    const pattern = /^(.*?):(\d+):(\d+):\s*(fatal error|error|warning|note|remark):\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/gm;
    let match;
    while ((match = pattern.exec(output.replace(/\r/g, ''))) !== null) {
        const severity = /error/.test(match[4]) ? 'error' : match[4] === 'warning' ? 'warning' : 'information';
        result.push({
            filePath: path.normalize(match[1]),
            line: Number(match[2]),
            column: Number(match[3]),
            severity,
            message: match[5].trim(),
            ...(match[6] ? { check: match[6].trim() } : {})
        });
    }
    return result;
}
function ensureSanitizerBuildProfiles(manifest) {
    const base = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, 'debug64');
    const definitions = [
        { id: 'qpm-asan', name: 'AddressSanitizer', sanitizer: 'address' },
        { id: 'qpm-ubsan', name: 'UndefinedBehaviorSanitizer', sanitizer: 'undefined' },
        { id: 'qpm-asan-ubsan', name: 'Address + Undefined Sanitizers', sanitizer: 'address,undefined' }
    ];
    const created = [];
    for (const definition of definitions) {
        if (manifest.profiles.builds.some((entry) => entry.id === definition.id))
            continue;
        manifest.profiles.builds.push(cloneQualityProfile(base, definition.id, definition.name, `build-${definition.id.replace(/^qpm-/, '')}`, [
            '-O1', '-g', '-fno-omit-frame-pointer', `-fsanitize=${definition.sanitizer}`
        ], [`-fsanitize=${definition.sanitizer}`]));
        created.push(definition.name);
    }
    return created;
}
function ensureCoverageBuildProfile(manifest) {
    const profileId = manifest.quality.coverageBuildProfileId || 'qpm-coverage';
    const existing = manifest.profiles.builds.find((entry) => entry.id === profileId);
    if (existing) {
        manifest.quality.coverageBuildProfileId = existing.id;
        return { profileId: existing.id, created: false };
    }
    const base = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, 'debug64');
    manifest.profiles.builds.push(cloneQualityProfile(base, profileId, 'Coverage', 'build-coverage', ['-O0', '-g', '--coverage'], ['--coverage']));
    manifest.quality.coverageBuildProfileId = profileId;
    return { profileId, created: true };
}
function cloneQualityProfile(base, id, name, outputDirectory, compilerFlags, linkerFlags) {
    return {
        ...base,
        id,
        name,
        variant: 'debug',
        outputDirectory,
        defines: [...base.defines],
        compilerFlags: uniqueStrings([...base.compilerFlags.filter((entry) => !/^-O\d/.test(entry)), ...compilerFlags]),
        linkerFlags: uniqueStrings([...base.linkerFlags, ...linkerFlags]),
        autoMoc: base.autoMoc,
        autoUic: base.autoUic,
        autoRcc: base.autoRcc
    };
}
function resolveQualityTool(setting, names, installation) {
    const configured = vscode.workspace.getConfiguration('qpm').get(setting, '').trim();
    const candidates = [];
    if (configured)
        candidates.push(configured);
    if (installation) {
        if (installation.toolchain.binDir)
            for (const name of names)
                candidates.push(executablePath(installation.toolchain.binDir, name));
        const ancestors = ancestorsOf(installation.root, 5);
        for (const ancestor of ancestors) {
            for (const name of names) {
                candidates.push(executablePath(path.join(ancestor, 'Tools', 'LLVM', 'bin'), name));
                candidates.push(executablePath(path.join(ancestor, 'Tools', 'Clazy', 'bin'), name));
            }
        }
    }
    for (const candidate of candidates)
        if (isFile(candidate))
            return path.normalize(candidate);
    for (const name of names) {
        const resolved = findOnPath(name);
        if (resolved)
            return resolved;
    }
    return undefined;
}
function resolveSourceTarget(target) {
    if (typeof target === 'string')
        return target;
    if (target instanceof vscode.Uri)
        return target.fsPath;
    if (target && typeof target === 'object') {
        const value = target;
        return value.file?.absolutePath ?? value.resourceUri?.fsPath ?? value.uri?.fsPath ?? value.absolutePath;
    }
    return undefined;
}
function activeSourcePath() {
    const filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
    return filePath && SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ? filePath : undefined;
}
function executablePath(directory, name) {
    return path.join(directory, process.platform === 'win32' && !name.toLowerCase().endsWith('.exe') ? `${name}.exe` : name);
}
function findOnPath(name) {
    const pathValue = process.env.PATH ?? '';
    const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
    for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
        for (const candidateName of names) {
            const candidate = path.join(directory.replace(/^"|"$/g, ''), candidateName);
            if (isFile(candidate))
                return path.normalize(candidate);
        }
    }
    return undefined;
}
function ancestorsOf(start, count) {
    const result = [];
    let current = path.resolve(start);
    for (let index = 0; index < count; index += 1) {
        result.push(current);
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return result;
}
function isFile(candidate) {
    try {
        return fs.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
function runProcess(executable, args, cwd, env, timeoutMs) {
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true, shell: false });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled)
                return;
            child.kill();
            settled = true;
            resolve({ code: null, stdout, stderr, timedOut: true });
        }, timeoutMs);
        child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (error) => {
            if (settled)
                return;
            clearTimeout(timeout);
            settled = true;
            resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
        });
        child.on('close', (code) => {
            if (settled)
                return;
            clearTimeout(timeout);
            settled = true;
            resolve({ code, stdout, stderr, timedOut: false });
        });
    });
}
function uniquePaths(values) {
    const seen = new Set();
    return values.filter((value) => {
        const key = process.platform === 'win32' ? value.toLowerCase() : value;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
function renderArgument(value) {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
function normalizeOutput(value) {
    return value.replace(/\r?\n/g, '\n').trimEnd();
}
