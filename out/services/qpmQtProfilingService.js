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
exports.QpmQtProfilingService = void 0;
exports.parseCppcheckXml = parseCppcheckXml;
exports.parseValgrindXml = parseValgrindXml;
exports.splitCommandLine = splitCommandLine;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtProfilingService {
    workspaces;
    builds;
    installations;
    output;
    diagnostics = vscode.languages.createDiagnosticCollection('qpm-profiling');
    disposables = [this.diagnostics];
    activeProcesses = new Set();
    latestOutputByManifest = new Map();
    constructor(workspaces, builds, installations, output) {
        this.workspaces = workspaces;
        this.builds = builds;
        this.installations = installations;
        this.output = output;
    }
    dispose() {
        this.stopActiveProfilers(false);
        while (this.disposables.length)
            this.disposables.pop()?.dispose();
    }
    getReport(projectRef) {
        const context = this.resolveContext(projectRef, false);
        if (!context)
            return undefined;
        const tools = this.getToolStatus(context.ref);
        const issues = [];
        const platform = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(context.manifest);
        if (!fs.existsSync(context.targetPath))
            issues.push({ severity: 'info', message: 'The application target has not been built yet.' });
        if (context.manifest.files.qml.length > 0 && !tools.qmlProfilerPath)
            issues.push({ severity: 'warning', message: 'qmlprofiler was not found in the selected Qt kit or PATH.' });
        if (platform.type === 'linux-local' || platform.type === 'remote-linux' || process.platform !== 'win32') {
            if (!tools.perfPath && !tools.valgrindPath)
                issues.push({ severity: 'warning', message: 'Neither perf nor Valgrind is available for CPU profiling.' });
            if (!tools.valgrindPath)
                issues.push({ severity: 'warning', message: 'Valgrind Memcheck is not available for memory diagnostics.' });
        }
        else if (!tools.heobPath) {
            issues.push({ severity: 'info', message: 'Heob was not found. Install or configure it for Windows heap diagnostics.' });
        }
        if (context.manifest.profiling.cppcheck.enabled && !tools.cppcheckPath)
            issues.push({ severity: 'warning', message: 'Cppcheck is enabled but the executable was not found.' });
        return {
            project: context.manifest.name,
            manifestPath: context.ref.absolutePath,
            targetPath: context.targetPath,
            outputDirectory: context.outputDirectory,
            platform: platform.type,
            tools,
            issues,
            latestOutput: this.latestOutputByManifest.get(context.ref.absolutePath)
        };
    }
    getToolStatus(projectRef) {
        const context = this.resolveContext(projectRef, false);
        const installation = context?.installation ?? this.installations.getActive();
        return {
            qmlProfilerPath: resolveTool('qmlProfilerPath', ['qmlprofiler'], installation, context?.manifest.profiling.qml.profilerPath),
            perfPath: resolveTool('perfPath', ['perf'], installation),
            valgrindPath: resolveTool('valgrindPath', ['valgrind'], installation),
            callgrindAnnotatePath: resolveTool('callgrindAnnotatePath', ['callgrind_annotate'], installation),
            kcachegrindPath: resolveTool('kcachegrindPath', ['kcachegrind', 'qcachegrind'], installation),
            cppcheckPath: resolveTool('cppcheckPath', ['cppcheck'], installation),
            heobPath: resolveTool('heobPath', ['heob64', 'heob32', 'heob'], installation),
            stracePath: resolveTool('stracePath', ['strace'], installation)
        };
    }
    async runQmlProfiler() {
        const context = await this.prepareContext();
        const tool = this.getToolStatus(context.ref).qmlProfilerPath;
        if (!tool)
            throw new Error('qmlprofiler was not found. Select a Qt kit containing qmlprofiler or configure qpm.qmlProfilerPath.');
        if (!context.manifest.profiling.qml.enabled)
            throw new Error('QML profiling is disabled in Qt Project Settings.');
        const config = context.manifest.profiling.qml;
        const outputFile = this.outputPath(context, config.outputFile || '${target}-qml.qtd', '.qtd');
        const qmlArgument = `-qmljsdebugger=port:${config.port},block,services:${config.services}`;
        this.showCommand('QML application', context.targetPath, [...context.args, qmlArgument], context.root);
        const app = this.spawnTracked(context.targetPath, [...context.args, qmlArgument], context.root, context.env);
        await delay(450);
        const args = ['-p', String(config.port), '-attach', config.host, '-o', outputFile];
        this.showCommand('qmlprofiler', tool, args, context.root);
        const result = await runProcess(tool, args, context.root, context.env, context.manifest.profiling.timeoutMs);
        this.stopTracked(app);
        this.appendResult(result);
        if (result.timedOut)
            throw new Error(`QML profiling timed out after ${context.manifest.profiling.timeoutMs} ms.`);
        if (result.code !== 0)
            throw new Error(`qmlprofiler exited with code ${String(result.code)}.`);
        this.recordOutput(context, fs.existsSync(outputFile) ? outputFile : context.outputDirectory);
        vscode.window.showInformationMessage(`QML profiling completed for ${context.manifest.name}.`);
    }
    async runCpuProfiler() {
        const context = await this.prepareContext();
        const tools = this.getToolStatus(context.ref);
        const requested = context.manifest.profiling.cpu.tool;
        const tool = requested === 'auto' ? (tools.perfPath ? 'perf' : tools.valgrindPath ? 'callgrind' : undefined) : requested;
        if (!tool)
            throw new Error('No CPU profiler is available. Install perf or Valgrind/Callgrind.');
        if (tool === 'perf') {
            if (!tools.perfPath)
                throw new Error('perf was selected but was not found.');
            const dataFile = this.outputPath(context, context.manifest.profiling.cpu.outputFile, '.data');
            const args = ['record', '-F', String(context.manifest.profiling.cpu.samplingFrequency), '-g', '-o', dataFile, '--', context.targetPath, ...context.args];
            this.showCommand('perf', tools.perfPath, args, context.root);
            const result = await runProcess(tools.perfPath, args, context.root, context.env, context.manifest.profiling.timeoutMs);
            this.appendResult(result);
            if (result.timedOut)
                throw new Error('perf profiling timed out.');
            if (result.code !== 0)
                throw new Error(`perf exited with code ${String(result.code)}.`);
            const textFile = `${dataFile}.txt`;
            const report = await runProcess(tools.perfPath, ['report', '--stdio', '-i', dataFile], context.root, context.env, 120000);
            fs.writeFileSync(textFile, report.stdout || report.stderr, 'utf8');
            this.recordOutput(context, dataFile);
        }
        else {
            if (!tools.valgrindPath)
                throw new Error('Valgrind was selected but was not found.');
            const dataFile = this.outputPath(context, context.manifest.profiling.cpu.outputFile, '.callgrind');
            const config = context.manifest.profiling.cpu;
            const args = [
                '--tool=callgrind',
                `--callgrind-out-file=${dataFile}`,
                `--cache-sim=${config.callgrindCacheSimulation ? 'yes' : 'no'}`,
                `--branch-sim=${config.callgrindBranchSimulation ? 'yes' : 'no'}`,
                context.targetPath,
                ...context.args
            ];
            this.showCommand('Callgrind', tools.valgrindPath, args, context.root);
            const result = await runProcess(tools.valgrindPath, args, context.root, context.env, context.manifest.profiling.timeoutMs);
            this.appendResult(result);
            if (result.timedOut)
                throw new Error('Callgrind profiling timed out.');
            if (result.code !== 0)
                throw new Error(`Callgrind exited with code ${String(result.code)}.`);
            if (tools.callgrindAnnotatePath && fs.existsSync(dataFile)) {
                const annotated = await runProcess(tools.callgrindAnnotatePath, ['--auto=yes', dataFile], context.root, context.env, 120000);
                fs.writeFileSync(`${dataFile}.txt`, annotated.stdout || annotated.stderr, 'utf8');
            }
            this.recordOutput(context, dataFile);
        }
        vscode.window.showInformationMessage(`CPU profiling completed for ${context.manifest.name}.`);
    }
    async runMemoryProfiler() {
        const context = await this.prepareContext();
        const tools = this.getToolStatus(context.ref);
        const requested = context.manifest.profiling.memory.tool;
        const tool = requested === 'auto' ? (process.platform === 'win32' && tools.heobPath ? 'heob' : tools.valgrindPath ? 'valgrind-memcheck' : undefined) : requested;
        if (!tool)
            throw new Error('No memory profiler is available. Install Valgrind on Linux or Heob on Windows.');
        if (tool === 'heob') {
            if (!tools.heobPath)
                throw new Error('Heob was selected but was not found.');
            const outputFile = this.outputPath(context, context.manifest.profiling.memory.outputFile.replace(/\.xml$/i, ''), '.html');
            const args = [`-o${outputFile}`, context.targetPath, ...context.args];
            this.showCommand('Heob', tools.heobPath, args, context.root);
            const result = await runProcess(tools.heobPath, args, context.root, context.env, context.manifest.profiling.timeoutMs);
            this.appendResult(result);
            if (result.timedOut)
                throw new Error('Heob profiling timed out.');
            if (result.code !== 0)
                throw new Error(`Heob exited with code ${String(result.code)}.`);
            this.recordOutput(context, outputFile);
        }
        else {
            if (!tools.valgrindPath)
                throw new Error('Valgrind was selected but was not found.');
            const config = context.manifest.profiling.memory;
            const outputFile = this.outputPath(context, config.outputFile, '.xml');
            const args = [
                '--tool=memcheck', '--xml=yes', `--xml-file=${outputFile}`,
                `--leak-check=${config.leakCheck}`,
                `--track-origins=${config.trackOrigins ? 'yes' : 'no'}`,
                `--show-reachable=${config.showReachable ? 'yes' : 'no'}`,
                context.targetPath,
                ...context.args
            ];
            this.showCommand('Valgrind Memcheck', tools.valgrindPath, args, context.root);
            const result = await runProcess(tools.valgrindPath, args, context.root, context.env, context.manifest.profiling.timeoutMs);
            this.appendResult(result);
            if (result.timedOut)
                throw new Error('Valgrind Memcheck timed out.');
            if (result.code !== 0 && !fs.existsSync(outputFile))
                throw new Error(`Valgrind exited with code ${String(result.code)}.`);
            const diagnostics = fs.existsSync(outputFile) ? parseValgrindXml(fs.readFileSync(outputFile, 'utf8'), context.root) : [];
            this.publishDiagnostics(diagnostics);
            this.recordOutput(context, outputFile);
            vscode.window.showInformationMessage(`Memory analysis completed: ${diagnostics.length} diagnostic(s).`);
            return;
        }
        vscode.window.showInformationMessage(`Memory analysis completed for ${context.manifest.name}.`);
    }
    async runCppcheck() {
        const context = this.resolveContext(undefined, true);
        const tool = this.getToolStatus(context.ref).cppcheckPath;
        if (!tool)
            throw new Error('Cppcheck was not found. Configure qpm.cppcheckPath or install Cppcheck.');
        const config = context.manifest.profiling.cppcheck;
        const compileDb = path.join(context.root, 'compile_commands.json');
        if (!fs.existsSync(compileDb))
            await vscode.commands.executeCommand('qpm.syncCppTools');
        if (!fs.existsSync(compileDb))
            throw new Error(`Compilation database not found: ${compileDb}`);
        fs.mkdirSync(context.outputDirectory, { recursive: true });
        const outputFile = path.join(context.outputDirectory, `${safeStem(context.manifest.targetName)}-cppcheck.xml`);
        const args = [
            `--project=${compileDb}`,
            `--enable=${config.checks}`,
            '--xml', '--xml-version=2', `--output-file=${outputFile}`,
            '--inline-suppr', '--force',
            ...(config.inconclusive ? ['--inconclusive'] : []),
            ...(config.suppressionsFile ? [`--suppressions-list=${resolveProjectPath(context.root, config.suppressionsFile)}`] : []),
            ...config.additionalArguments
        ];
        this.showCommand('Cppcheck', tool, args, context.root);
        const result = await runProcess(tool, args, context.root, context.env, context.manifest.profiling.timeoutMs);
        this.appendResult(result);
        if (!fs.existsSync(outputFile) && result.code !== 0)
            throw new Error(`Cppcheck exited with code ${String(result.code)}.`);
        const xml = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : result.stderr;
        const diagnostics = parseCppcheckXml(xml, context.root);
        this.publishDiagnostics(diagnostics);
        this.recordOutput(context, outputFile);
        vscode.window.showInformationMessage(`Cppcheck completed: ${diagnostics.length} diagnostic(s).`);
    }
    async runSystemTrace() {
        const context = await this.prepareContext();
        const tools = this.getToolStatus(context.ref);
        const requested = context.manifest.profiling.tracing.tool;
        const tool = requested === 'auto' ? (tools.stracePath ? 'strace' : undefined) : requested;
        if (!tool || tool === 'none')
            throw new Error('System tracing is disabled or strace was not found.');
        if (!tools.stracePath)
            throw new Error('strace was selected but was not found.');
        const config = context.manifest.profiling.tracing;
        const outputFile = this.outputPath(context, config.outputFile, '.log');
        const args = [
            ...(config.followForks ? ['-f'] : []),
            ...(config.timestamps ? ['-tt'] : []),
            '-o', outputFile,
            context.targetPath,
            ...context.args
        ];
        this.showCommand('strace', tools.stracePath, args, context.root);
        const result = await runProcess(tools.stracePath, args, context.root, context.env, context.manifest.profiling.timeoutMs);
        this.appendResult(result);
        if (result.timedOut)
            throw new Error('System trace timed out.');
        if (result.code !== 0 && !fs.existsSync(outputFile))
            throw new Error(`strace exited with code ${String(result.code)}.`);
        this.recordOutput(context, outputFile);
        vscode.window.showInformationMessage(`System trace completed for ${context.manifest.name}.`);
    }
    async openLatestOutput() {
        const context = this.resolveContext(undefined, true);
        const target = this.latestOutputByManifest.get(context.ref.absolutePath) ?? newestFile(context.outputDirectory);
        if (!target || !fs.existsSync(target))
            throw new Error('No profiling result is available yet.');
        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
            return;
        }
        const extension = path.extname(target).toLowerCase();
        if (['.txt', '.log', '.xml', '.json', '.md'].includes(extension)) {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(target)), { preview: true });
            return;
        }
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
    }
    async openReport() {
        const report = this.getReport();
        if (!report)
            throw new Error('Open a native Qt project first.');
        const lines = [
            `# Qt Profiling and Diagnostics — ${report.project}`,
            '',
            `- Manifest: \`${report.manifestPath}\``,
            `- Target: \`${report.targetPath}\``,
            `- Platform: ${report.platform}`,
            `- Output: \`${report.outputDirectory}\``,
            `- Latest result: ${report.latestOutput ? `\`${report.latestOutput}\`` : 'none'}`,
            '',
            '## Tools',
            '',
            ...Object.entries(report.tools).map(([name, value]) => `- ${name}: ${value ? `\`${value}\`` : 'not found'}`),
            '',
            '## Readiness',
            '',
            ...(report.issues.length ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()}** — ${issue.message}`) : ['- Ready'])
        ];
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async revealOutput() {
        const context = this.resolveContext(undefined, true);
        fs.mkdirSync(context.outputDirectory, { recursive: true });
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(context.outputDirectory));
    }
    async cleanOutput() {
        const context = this.resolveContext(undefined, true);
        fs.rmSync(context.outputDirectory, { recursive: true, force: true });
        this.latestOutputByManifest.delete(context.ref.absolutePath);
        this.diagnostics.clear();
        vscode.window.showInformationMessage(`Profiling output cleaned for ${context.manifest.name}.`);
    }
    stopActiveProfilers(showMessage = true) {
        for (const child of [...this.activeProcesses])
            this.stopTracked(child);
        if (showMessage)
            vscode.window.showInformationMessage('Active QPM profiler processes stopped.');
    }
    async prepareContext() {
        let context = this.resolveContext(undefined, true);
        if (context.manifest.profiling.buildBeforeRun) {
            const success = await this.builds.build(false, context.ref);
            if (!success)
                throw new Error('Build failed. Profiling was not started.');
            context = this.resolveContext(context.ref, true);
        }
        if (!fs.existsSync(context.targetPath))
            throw new Error(`Application target not found: ${context.targetPath}`);
        fs.mkdirSync(context.outputDirectory, { recursive: true });
        return context;
    }
    resolveContext(projectRef, required = true) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            if (required)
                throw new Error('Open a native .qtproject.json project first.');
            return undefined;
        }
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const root = path.dirname(ref.absolutePath);
        const targetPath = (0, qtProjectManifest_1.qtTargetPath)(ref.absolutePath, this.builds.buildMode, manifest);
        const outputDirectory = path.resolve(root, manifest.profiling.outputDirectory);
        const installation = this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, this.builds.buildMode));
        const run = (0, qtProjectManifest_1.getActiveQtRunProfile)(manifest);
        const env = { ...process.env, ...run.environment, ...manifest.profiling.environment };
        const pathEntries = [path.dirname(targetPath), installation?.binDir, installation?.toolchain.binDir, env.PATH].filter((entry) => Boolean(entry));
        env.PATH = pathEntries.join(path.delimiter);
        return {
            ref,
            manifest,
            root,
            targetPath,
            outputDirectory,
            installation,
            env,
            args: [...splitCommandLine(run.arguments), ...manifest.profiling.arguments]
        };
    }
    outputPath(context, template, defaultExtension) {
        const stem = safeStem(context.manifest.targetName);
        let value = (template || `${stem}${defaultExtension}`)
            .replace(/\$\{target\}/g, stem)
            .replace(/\$\{project\}/g, safeStem(context.manifest.name))
            .replace(/\$\{mode\}/g, this.builds.buildMode);
        if (!path.extname(value) && defaultExtension)
            value += defaultExtension;
        const resolved = path.resolve(context.outputDirectory, value);
        const relative = path.relative(context.outputDirectory, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative))
            throw new Error(`Profiling output must stay inside ${context.outputDirectory}.`);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        return resolved;
    }
    recordOutput(context, outputPath) {
        this.latestOutputByManifest.set(context.ref.absolutePath, outputPath);
        this.output.appendLine(`[Qt Profiling] Result: ${outputPath}`);
    }
    spawnTracked(executable, args, cwd, env) {
        const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true, shell: false });
        this.activeProcesses.add(child);
        child.stdout?.on('data', (chunk) => this.output.append(chunk.toString()));
        child.stderr?.on('data', (chunk) => this.output.append(chunk.toString()));
        child.once('close', () => this.activeProcesses.delete(child));
        child.once('error', () => this.activeProcesses.delete(child));
        return child;
    }
    stopTracked(child) {
        if (!this.activeProcesses.has(child))
            return;
        try {
            child.kill();
        }
        catch { }
        this.activeProcesses.delete(child);
    }
    showCommand(label, executable, args, cwd) {
        this.output.show(true);
        this.output.appendLine(`\n[Qt Profiling] ${label}`);
        this.output.appendLine(`[Qt Profiling] Working directory: ${cwd}`);
        this.output.appendLine(`[Qt Profiling] Tool: ${executable}`);
        this.output.appendLine(`[Qt Profiling] Arguments: ${args.map(renderArgument).join(' ')}`);
    }
    appendResult(result) {
        if (result.stdout.trim())
            this.output.appendLine(result.stdout.trimEnd());
        if (result.stderr.trim())
            this.output.appendLine(result.stderr.trimEnd());
        this.output.appendLine(`[Qt Profiling] Process exited with code ${String(result.code)}${result.timedOut ? ' (timeout)' : ''}.`);
    }
    publishDiagnostics(items) {
        this.diagnostics.clear();
        const grouped = new Map();
        for (const item of items) {
            if (!item.filePath)
                continue;
            const diagnostic = new vscode.Diagnostic(new vscode.Range(Math.max(0, item.line - 1), Math.max(0, item.column - 1), Math.max(0, item.line - 1), Math.max(1, item.column)), item.message, item.severity === 'error' ? vscode.DiagnosticSeverity.Error : item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
            diagnostic.source = item.check ? `QPM ${item.check}` : 'QPM Diagnostics';
            diagnostic.code = item.check;
            const absolute = path.resolve(item.filePath);
            const list = grouped.get(absolute) ?? [];
            list.push(diagnostic);
            grouped.set(absolute, list);
        }
        for (const [filePath, diagnostics] of grouped)
            this.diagnostics.set(vscode.Uri.file(filePath), diagnostics);
    }
}
exports.QpmQtProfilingService = QpmQtProfilingService;
function parseCppcheckXml(xml, projectRoot = process.cwd()) {
    const diagnostics = [];
    const errorPattern = /<error\b([^>]*)>([\s\S]*?)<\/error>|<error\b([^>]*)\/>/g;
    let match;
    while ((match = errorPattern.exec(xml)) !== null) {
        const attrs = parseXmlAttributes(match[1] || match[3] || '');
        const body = match[2] || '';
        const locationMatch = /<location\b([^>]*)\/?\s*>/.exec(body);
        const location = parseXmlAttributes(locationMatch?.[1] || '');
        const file = location.file || location.file0 || '';
        if (!file)
            continue;
        diagnostics.push({
            filePath: path.isAbsolute(file) ? path.normalize(file) : path.resolve(projectRoot, file),
            line: numberOr(location.line, 1),
            column: numberOr(location.column, 1),
            severity: cppcheckSeverity(attrs.severity),
            message: decodeXml(attrs.msg || attrs.verbose || attrs.id || 'Cppcheck diagnostic'),
            check: attrs.id
        });
    }
    return diagnostics;
}
function parseValgrindXml(xml, projectRoot = process.cwd()) {
    const diagnostics = [];
    const errorPattern = /<error>([\s\S]*?)<\/error>/g;
    let match;
    while ((match = errorPattern.exec(xml)) !== null) {
        const block = match[1];
        const kind = tagValue(block, 'kind');
        const message = tagValue(block, 'what') || tagValue(block, 'text') || kind || 'Valgrind diagnostic';
        const frame = /<frame>([\s\S]*?)<\/frame>/.exec(block)?.[1] ?? '';
        const file = tagValue(frame, 'file');
        const directory = tagValue(frame, 'dir');
        const absolute = file ? path.resolve(directory || projectRoot, file) : '';
        if (!absolute)
            continue;
        diagnostics.push({
            filePath: absolute,
            line: numberOr(tagValue(frame, 'line'), 1),
            column: 1,
            severity: /Leak|Invalid|Uninit|Overlap|Mismatched|Fishy/i.test(kind) ? 'error' : 'warning',
            message: decodeXml(message),
            check: kind
        });
    }
    return diagnostics;
}
function splitCommandLine(value) {
    const result = [];
    const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+)/g;
    let match;
    while ((match = pattern.exec(value)) !== null)
        result.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\([\\"'])/g, '$1'));
    return result;
}
function resolveTool(setting, names, installation, projectConfigured) {
    const configured = String(projectConfigured ?? '').trim() || vscode.workspace.getConfiguration('qpm').get(setting, '').trim();
    const candidates = [];
    if (configured)
        candidates.push(configured);
    if (installation) {
        for (const directory of [installation.binDir, installation.toolchain.binDir].filter((entry) => Boolean(entry))) {
            for (const name of names)
                candidates.push(executablePath(directory, name));
        }
        for (const ancestor of ancestorsOf(installation.root, 5)) {
            for (const name of names) {
                candidates.push(executablePath(path.join(ancestor, 'Tools', 'LLVM', 'bin'), name));
                candidates.push(executablePath(path.join(ancestor, 'Tools', 'Heob'), name));
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
function runProcess(executable, args, cwd, env, timeoutMs) {
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true, shell: false });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            try {
                child.kill();
            }
            catch { }
            resolve({ code: null, stdout, stderr, timedOut: true });
        }, timeoutMs);
        child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
        child.once('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
        });
        child.once('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut: false });
        });
    });
}
function parseXmlAttributes(value) {
    const result = {};
    const pattern = /([:\w-]+)\s*=\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(value)) !== null)
        result[match[1]] = decodeXml(match[2]);
    return result;
}
function tagValue(block, name) {
    const match = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(block);
    return match ? decodeXml(match[1].trim()) : '';
}
function decodeXml(value) {
    return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function cppcheckSeverity(value) {
    if (value === 'error')
        return 'error';
    if (['warning', 'performance', 'portability'].includes(value))
        return 'warning';
    return 'information';
}
function numberOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function splitPathValue(value) {
    return (value ?? '').split(path.delimiter).map((entry) => entry.replace(/^"|"$/g, '').trim()).filter(Boolean);
}
function findOnPath(name) {
    const names = process.platform === 'win32' && !name.toLowerCase().endsWith('.exe') ? [`${name}.exe`, name] : [name];
    for (const directory of splitPathValue(process.env.PATH)) {
        for (const candidateName of names) {
            const candidate = path.join(directory, candidateName);
            if (isFile(candidate))
                return path.normalize(candidate);
        }
    }
    return undefined;
}
function executablePath(directory, name) {
    return path.join(directory, process.platform === 'win32' && !name.toLowerCase().endsWith('.exe') ? `${name}.exe` : name);
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
function safeStem(value) {
    return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'qt-app';
}
function resolveProjectPath(root, value) {
    return path.isAbsolute(value) ? path.normalize(value) : path.resolve(root, value);
}
function renderArgument(value) {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function newestFile(directory) {
    try {
        const entries = fs.readdirSync(directory, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => ({ path: path.join(directory, entry.name), time: fs.statSync(path.join(directory, entry.name)).mtimeMs }))
            .sort((a, b) => b.time - a.time);
        return entries[0]?.path;
    }
    catch {
        return undefined;
    }
}
