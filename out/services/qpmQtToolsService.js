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
exports.QpmQtToolsService = void 0;
exports.readQtTranslationStatistics = readQtTranslationStatistics;
exports.parseQmlLintDiagnostics = parseQmlLintDiagnostics;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qtResourceEditorPanel_1 = require("../views/qtResourceEditorPanel");
class QpmQtToolsService {
    workspaces;
    installations;
    output;
    qmlDiagnostics = vscode.languages.createDiagnosticCollection('qpm-qmllint');
    disposables = [];
    formattingFiles = new Set();
    resourcePanels = new Map();
    constructor(workspaces, installations, output) {
        this.workspaces = workspaces;
        this.installations = installations;
        this.output = output;
        this.disposables.push(this.qmlDiagnostics, vscode.workspace.onDidSaveTextDocument((document) => void this.handleSavedDocument(document)));
    }
    dispose() {
        for (const panel of this.resourcePanels.values())
            panel.dispose();
        this.resourcePanels.clear();
        while (this.disposables.length > 0)
            this.disposables.pop()?.dispose();
    }
    async createTranslation(target) {
        const context = this.requireContext(target);
        if (!context.installation.lupdatePath)
            throw new Error('The selected Qt kit does not provide lupdate. Install the Qt Linguist tools component or select another kit.');
        const language = await vscode.window.showInputBox({
            title: 'Create Qt translation',
            prompt: 'Target language code used by Qt Linguist (for example fr_FR, en_GB or de_DE).',
            value: 'fr_FR',
            validateInput: (value) => /^[A-Za-z]{2,3}(?:_[A-Za-z]{2}|_[0-9]{3})?$/.test(value.trim()) ? undefined : 'Use a Qt locale code such as fr_FR.'
        });
        if (!language)
            return;
        const defaultDirectory = vscode.workspace.getConfiguration('qpm').get('translationOutputDirectory', 'translations').trim() || 'translations';
        const suggested = path.join(context.root, defaultDirectory, `${sanitizeFileName(context.manifest.name)}_${language}.ts`);
        const selected = await vscode.window.showSaveDialog({
            title: `Create ${language} Qt translation`,
            defaultUri: vscode.Uri.file(suggested),
            filters: { 'Qt translation source': ['ts'] }
        });
        if (!selected)
            return;
        const tsPath = ensureExtension(selected.fsPath, '.ts');
        fs.mkdirSync(path.dirname(tsPath), { recursive: true });
        (0, qtProjectManifest_1.addFilesToQtManifest)(context.manifestPath, [tsPath]);
        await this.runLupdate(context, [tsPath], language);
        this.workspaces.refresh();
        const open = await vscode.window.showInformationMessage(`Qt translation created: ${path.basename(tsPath)}`, 'Open in Qt Linguist');
        if (open === 'Open in Qt Linguist')
            await this.openTranslationInLinguist(tsPath);
    }
    async updateTranslations(target) {
        const context = this.requireContext(target);
        const translations = this.translationSourceFiles(context);
        if (translations.length === 0) {
            const action = await vscode.window.showWarningMessage('The active project has no .ts translation file.', 'Create translation');
            if (action === 'Create translation')
                await this.createTranslation(target);
            return false;
        }
        const ok = await this.runLupdate(context, translations);
        if (ok)
            vscode.window.showInformationMessage(`${translations.length} Qt translation file(s) updated.`);
        return ok;
    }
    async releaseTranslations(target) {
        const context = this.requireContext(target);
        if (!context.installation.lreleasePath)
            throw new Error('The selected Qt kit does not provide lrelease. Install the Qt Linguist tools component or select another kit.');
        const sources = this.translationSourceFiles(context);
        if (sources.length === 0) {
            vscode.window.showWarningMessage('The active project has no .ts translation file to release.');
            return false;
        }
        const generated = [];
        const failOnUnfinished = vscode.workspace.getConfiguration('qpm').get('translationFailOnUnfinished', false);
        for (const source of sources) {
            const qmPath = source.replace(/\.ts$/i, '.qm');
            const args = [...(failOnUnfinished ? ['-fail-on-unfinished'] : []), source, '-qm', qmPath];
            const result = await this.runTool(context.installation.lreleasePath, args, context.root, `lrelease ${path.basename(source)}`, false, this.qtEnvironment(context));
            if (result.code !== 0 || !fs.existsSync(qmPath)) {
                vscode.window.showErrorMessage(`lrelease failed for ${path.basename(source)}. See the Qt Project Manager output.`);
                return false;
            }
            generated.push(qmPath);
        }
        (0, qtProjectManifest_1.addFilesToQtManifest)(context.manifestPath, generated);
        this.workspaces.refresh();
        vscode.window.showInformationMessage(`${generated.length} Qt .qm catalog(s) generated.`);
        return true;
    }
    async openTranslationInLinguist(target) {
        const context = this.requireContext(target);
        if (!context.installation.linguistPath)
            throw new Error('Qt Linguist was not found in the selected Qt installation. Install Qt Linguist or select a kit that provides linguist.exe.');
        const filePath = await this.resolveProjectFile(context, target, ['.ts', '.xlf'], 'Select a translation file to open in Qt Linguist');
        if (!filePath)
            return;
        this.output.appendLine(`[Qt Linguist] ${context.installation.linguistPath} ${filePath}`);
        const child = (0, child_process_1.spawn)(context.installation.linguistPath, [filePath], {
            cwd: context.root,
            env: this.qtEnvironment(context),
            detached: true,
            windowsHide: false,
            stdio: 'ignore'
        });
        child.on('error', (error) => vscode.window.showErrorMessage(`Unable to start Qt Linguist: ${error.message}`));
        child.unref();
    }
    async showTranslationStatus(target) {
        const context = this.requireContext(target);
        const files = this.translationSourceFiles(context);
        const statistics = files.map((filePath) => readQtTranslationStatistics(filePath));
        const total = statistics.reduce((sum, item) => ({
            contexts: sum.contexts + item.contexts,
            messages: sum.messages + item.messages,
            finished: sum.finished + item.finished,
            unfinished: sum.unfinished + item.unfinished,
            obsolete: sum.obsolete + item.obsolete,
            vanished: sum.vanished + item.vanished
        }), { contexts: 0, messages: 0, finished: 0, unfinished: 0, obsolete: 0, vanished: 0 });
        const coverage = total.messages > 0 ? Math.round((total.finished / total.messages) * 1000) / 10 : 100;
        const lines = [
            '# Qt Translation Status', '',
            `Project: **${context.manifest.name}**`,
            `Qt kit: ${context.installation.label}`, '',
            `Overall coverage: **${coverage}%** (${total.finished}/${total.messages} messages)`, '',
            '| File | Contexts | Messages | Finished | Unfinished | Obsolete | Vanished |',
            '|---|---:|---:|---:|---:|---:|---:|',
            ...statistics.map((item) => `| ${escapeTable(path.relative(context.root, item.filePath))} | ${item.contexts} | ${item.messages} | ${item.finished} | ${item.unfinished} | ${item.obsolete} | ${item.vanished} |`),
            '',
            `lupdate: ${context.installation.lupdatePath ?? 'not found'}`,
            `lrelease: ${context.installation.lreleasePath ?? 'not found'}`,
            `Qt Linguist: ${context.installation.linguistPath ?? 'not found'}`
        ];
        if (statistics.length === 0)
            lines.splice(7, 0, '> No `.ts` file is registered in the project manifest.', '');
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(document, { preview: true });
    }
    async openResourceEditor(target) {
        const context = this.requireContext(target);
        const qrcPath = await this.resolveProjectFile(context, target, ['.qrc'], 'Select a Qt resource collection');
        if (!qrcPath)
            return;
        const key = normalizeKey(qrcPath);
        const existing = this.resourcePanels.get(key);
        if (existing) {
            existing.reveal();
            return;
        }
        const panel = new qtResourceEditorPanel_1.QtResourceEditorPanel(qrcPath, this.output, () => this.workspaces.refresh(), () => this.resourcePanels.delete(key));
        this.resourcePanels.set(key, panel);
    }
    async validateResourceCollection(target) {
        const context = this.requireContext(target);
        const qrcPath = await this.resolveProjectFile(context, target, ['.qrc'], 'Select a Qt resource collection to validate');
        if (!qrcPath)
            return false;
        const document = (0, qtResourceEditorPanel_1.readQtResourceDocument)(qrcPath);
        const issues = (0, qtResourceEditorPanel_1.validateQtResourceDocument)(qrcPath, document);
        const lines = [
            '# Qt Resource Validation', '',
            `File: ${qrcPath}`, '',
            issues.length === 0 ? '**PASS** — all referenced files exist and runtime aliases are unique.' : `**${issues.filter((issue) => issue.severity === 'error').length} error(s), ${issues.filter((issue) => issue.severity === 'warning').length} warning(s)**`, '',
            ...issues.map((issue) => `- **${issue.severity.toUpperCase()}**: ${issue.message}`)
        ];
        const report = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
        await vscode.window.showTextDocument(report, { preview: true });
        return issues.every((issue) => issue.severity !== 'error');
    }
    async lintQmlFile(target, notify = true) {
        const context = this.requireContext(target);
        if (!context.installation.qmlLintPath)
            throw new Error('qmllint was not found in the selected Qt kit. Install the Qt Declarative tools component.');
        const filePath = await this.resolveProjectFile(context, target, ['.qml'], 'Select a QML file to lint');
        if (!filePath)
            return false;
        const document = vscode.workspace.textDocuments.find((entry) => normalizeKey(entry.uri.fsPath) === normalizeKey(filePath));
        if (document?.isDirty)
            await document.save();
        const args = [...this.qmlImportArguments(context), filePath];
        const result = await this.runTool(context.installation.qmlLintPath, args, context.root, `qmllint ${path.basename(filePath)}`, true, this.qtEnvironment(context));
        const diagnostics = parseQmlLintDiagnostics(filePath, `${result.stdout}\n${result.stderr}`);
        if (result.code !== 0 && diagnostics.length === 0)
            diagnostics.push(genericDiagnostic(`qmllint exited with code ${result.code}. See the Qt Project Manager output.`));
        this.qmlDiagnostics.set(vscode.Uri.file(filePath), diagnostics);
        if (notify) {
            const errors = diagnostics.filter((entry) => entry.severity === vscode.DiagnosticSeverity.Error).length;
            const warnings = diagnostics.filter((entry) => entry.severity === vscode.DiagnosticSeverity.Warning).length;
            if (errors > 0)
                vscode.window.showErrorMessage(`qmllint: ${errors} error(s), ${warnings} warning(s) in ${path.basename(filePath)}.`);
            else
                vscode.window.showInformationMessage(`qmllint: ${warnings} warning(s) in ${path.basename(filePath)}.`);
        }
        return result.code === 0 && diagnostics.every((entry) => entry.severity !== vscode.DiagnosticSeverity.Error);
    }
    async lintQmlProject(target) {
        const context = this.requireContext(target);
        const files = this.qmlFiles(context);
        if (files.length === 0) {
            vscode.window.showWarningMessage('The active project has no QML file.');
            return false;
        }
        let success = true;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Linting QML project', cancellable: true }, async (progress, token) => {
            for (let index = 0; index < files.length && !token.isCancellationRequested; index += 1) {
                progress.report({ message: path.basename(files[index]), increment: 100 / files.length });
                success = (await this.lintQmlFile(files[index], false)) && success;
            }
        });
        const diagnosticCount = files.reduce((sum, filePath) => sum + (this.qmlDiagnostics.get(vscode.Uri.file(filePath))?.length ?? 0), 0);
        vscode.window.showInformationMessage(`qmllint completed for ${files.length} file(s): ${diagnosticCount} diagnostic(s).`);
        return success;
    }
    clearQmlDiagnostics() {
        this.qmlDiagnostics.clear();
        vscode.window.showInformationMessage('QML diagnostics cleared.');
    }
    async formatQmlFile(target, notify = true) {
        const context = this.requireContext(target);
        if (!context.installation.qmlFormatPath)
            throw new Error('qmlformat was not found in the selected Qt kit. Install the Qt Declarative tools component.');
        const filePath = await this.resolveProjectFile(context, target, ['.qml'], 'Select a QML file to format');
        if (!filePath)
            return false;
        const key = normalizeKey(filePath);
        if (this.formattingFiles.has(key))
            return true;
        const openDocument = vscode.workspace.textDocuments.find((entry) => normalizeKey(entry.uri.fsPath) === key);
        if (openDocument?.isDirty)
            await openDocument.save();
        this.formattingFiles.add(key);
        try {
            let result = await this.runTool(context.installation.qmlFormatPath, ['-i', filePath], context.root, `qmlformat ${path.basename(filePath)}`, true, this.qtEnvironment(context));
            if (result.code !== 0) {
                result = await this.runTool(context.installation.qmlFormatPath, [filePath], context.root, `qmlformat ${path.basename(filePath)} (stdout fallback)`, true, this.qtEnvironment(context));
                if (result.code === 0 && result.stdout.trim())
                    fs.writeFileSync(filePath, result.stdout, 'utf8');
            }
            if (result.code !== 0) {
                if (notify)
                    vscode.window.showErrorMessage(`qmlformat failed for ${path.basename(filePath)}. See the Qt Project Manager output.`);
                return false;
            }
            const openAfterFormat = vscode.workspace.textDocuments.find((entry) => normalizeKey(entry.uri.fsPath) === key);
            if (openAfterFormat && !openAfterFormat.isDirty) {
                const formattedText = fs.readFileSync(filePath, 'utf8');
                const end = openAfterFormat.lineCount > 0
                    ? openAfterFormat.lineAt(openAfterFormat.lineCount - 1).rangeIncludingLineBreak.end
                    : new vscode.Position(0, 0);
                const edit = new vscode.WorkspaceEdit();
                edit.replace(openAfterFormat.uri, new vscode.Range(new vscode.Position(0, 0), end), formattedText);
                await vscode.workspace.applyEdit(edit);
                await openAfterFormat.save();
            }
            if (notify)
                vscode.window.showInformationMessage(`Formatted ${path.basename(filePath)} with qmlformat.`);
            return true;
        }
        finally {
            setTimeout(() => this.formattingFiles.delete(key), 500);
        }
    }
    async formatQmlProject(target) {
        const context = this.requireContext(target);
        const files = this.qmlFiles(context);
        if (files.length === 0) {
            vscode.window.showWarningMessage('The active project has no QML file.');
            return false;
        }
        let success = true;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Formatting QML project', cancellable: true }, async (progress, token) => {
            for (let index = 0; index < files.length && !token.isCancellationRequested; index += 1) {
                progress.report({ message: path.basename(files[index]), increment: 100 / files.length });
                success = (await this.formatQmlFile(files[index], false)) && success;
            }
        });
        vscode.window.showInformationMessage(`qmlformat completed for ${files.length} file(s).`);
        return success;
    }
    async previewQmlFile(target) {
        const context = this.requireContext(target);
        const executable = context.installation.qmlRuntimePath ?? context.installation.qmlScenePath;
        if (!executable)
            throw new Error('Neither the Qt qml runtime nor qmlscene was found in the selected kit.');
        const filePath = await this.resolveProjectFile(context, target, ['.qml'], 'Select a QML file to preview');
        if (!filePath)
            return;
        const args = [...this.qmlImportArguments(context), filePath];
        this.output.appendLine(`[QML Preview] ${executable} ${args.join(' ')}`);
        const child = (0, child_process_1.spawn)(executable, args, { cwd: context.root, env: this.qtEnvironment(context), detached: true, stdio: 'ignore', windowsHide: false });
        child.on('error', (error) => vscode.window.showErrorMessage(`Unable to start the QML preview: ${error.message}`));
        child.unref();
    }
    async openQtDocumentation() {
        const context = this.tryContext();
        const editor = vscode.window.activeTextEditor;
        let query = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : '';
        if (!query && editor) {
            const range = editor.document.getWordRangeAtPosition(editor.selection.active, /[A-Za-z_][A-Za-z0-9_:]*/);
            if (range)
                query = editor.document.getText(range);
        }
        if (!query) {
            query = await vscode.window.showInputBox({ title: 'Search Qt documentation', prompt: 'Qt class, function, module or QML type', placeHolder: 'QApplication' }) ?? '';
        }
        if (!query.trim())
            return;
        const major = context?.installation.majorVersion || 6;
        const url = vscode.Uri.parse(`https://doc.qt.io/qt-${major}/search-results.html?q=${encodeURIComponent(query.trim())}`);
        await vscode.env.openExternal(url);
    }
    async openQtDocumentationHome() {
        const major = this.tryContext()?.installation.majorVersion || 6;
        await vscode.env.openExternal(vscode.Uri.parse(`https://doc.qt.io/qt-${major}/`));
    }
    async handleSavedDocument(document) {
        if (document.uri.scheme !== 'file' || path.extname(document.uri.fsPath).toLowerCase() !== '.qml')
            return;
        const key = normalizeKey(document.uri.fsPath);
        if (this.formattingFiles.has(key) || !this.tryContext(document.uri.fsPath))
            return;
        const config = vscode.workspace.getConfiguration('qpm');
        try {
            if (config.get('qmlFormatOnSave', false))
                await this.formatQmlFile(document.uri.fsPath, false);
            if (config.get('qmlLintOnSave', true))
                await this.lintQmlFile(document.uri.fsPath, false);
        }
        catch (error) {
            this.output.appendLine(`[Qt Tools] Automatic QML processing skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async runLupdate(context, translations, targetLanguage) {
        if (!context.installation.lupdatePath)
            throw new Error('lupdate was not found in the selected Qt kit.');
        const sourceFiles = this.translationInputs(context);
        const toolsDirectory = path.join(context.root, '.qpm', 'tools');
        fs.mkdirSync(toolsDirectory, { recursive: true });
        const listPath = path.join(toolsDirectory, 'lupdate-inputs.lst');
        const listLines = [
            ...sourceFiles.map((filePath) => normalizeSlash(path.relative(context.root, filePath))),
            ...context.manifest.includeDirectories.map((entry) => `-I${normalizeSlash(path.resolve(context.root, entry))}`)
        ];
        fs.writeFileSync(listPath, `${listLines.join(os.EOL)}${os.EOL}`, 'utf8');
        const sourceLanguage = vscode.workspace.getConfiguration('qpm').get('translationSourceLanguage', 'en').trim();
        const args = [
            `@${listPath}`,
            '-locations', 'relative',
            ...(sourceLanguage ? ['-source-language', sourceLanguage] : []),
            ...(targetLanguage ? ['-target-language', targetLanguage] : []),
            '-ts', ...translations
        ];
        const result = await this.runTool(context.installation.lupdatePath, args, context.root, `lupdate ${translations.map((entry) => path.basename(entry)).join(', ')}`, false, this.qtEnvironment(context));
        if (result.code !== 0) {
            vscode.window.showErrorMessage('lupdate failed. See the Qt Project Manager output.');
            return false;
        }
        return true;
    }
    translationInputs(context) {
        const fields = [context.manifest.files.sources, context.manifest.files.headers, context.manifest.files.forms, context.manifest.files.qml, context.manifest.files.resources];
        return uniquePaths(fields.flat().map((entry) => path.resolve(context.root, entry)).filter((entry) => fs.existsSync(entry)));
    }
    translationSourceFiles(context) {
        return uniquePaths(context.manifest.files.translations
            .filter((entry) => path.extname(entry).toLowerCase() === '.ts')
            .map((entry) => path.resolve(context.root, entry))
            .filter((entry) => fs.existsSync(entry)));
    }
    qmlFiles(context) {
        return uniquePaths(context.manifest.files.qml
            .filter((entry) => path.extname(entry).toLowerCase() === '.qml')
            .map((entry) => path.resolve(context.root, entry))
            .filter((entry) => fs.existsSync(entry)));
    }
    qmlImportArguments(context) {
        const configured = vscode.workspace.getConfiguration('qpm').get('qmlImportPaths', []);
        const qmlDirectories = this.qmlFiles(context).map((entry) => path.dirname(entry));
        const importPaths = uniquePaths([
            ...(context.installation.qmlDir ? [context.installation.qmlDir] : []),
            context.root,
            ...qmlDirectories,
            ...configured.map((entry) => path.isAbsolute(entry) ? entry : path.resolve(context.root, entry))
        ].filter((entry) => fs.existsSync(entry)));
        return importPaths.flatMap((entry) => ['-I', entry]);
    }
    qtEnvironment(context) {
        const env = { ...process.env };
        const pathEntries = uniquePaths([context.installation.binDir, context.installation.toolchain.binDir].filter((entry) => !!entry));
        env.PATH = [...pathEntries, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
        if (context.installation.pluginsDir)
            env.QT_PLUGIN_PATH = context.installation.pluginsDir;
        const qmlPaths = this.qmlImportArguments(context).filter((_, index) => index % 2 === 1);
        if (qmlPaths.length > 0) {
            env.QML_IMPORT_PATH = qmlPaths.join(path.delimiter);
            env.QML2_IMPORT_PATH = qmlPaths.join(path.delimiter);
        }
        return env;
    }
    async resolveProjectFile(context, target, extensions, title) {
        const candidate = targetFilePath(target) ?? activeFilePath();
        if (candidate && extensions.includes(path.extname(candidate).toLowerCase()) && fs.existsSync(candidate))
            return candidate;
        const all = [
            ...context.manifest.files.forms,
            ...context.manifest.files.resources,
            ...context.manifest.files.qml,
            ...context.manifest.files.translations,
            ...context.manifest.files.other
        ].map((entry) => path.resolve(context.root, entry)).filter((entry) => extensions.includes(path.extname(entry).toLowerCase()) && fs.existsSync(entry));
        if (all.length === 0) {
            vscode.window.showWarningMessage(`No ${extensions.join('/')} file is registered in the active project.`);
            return undefined;
        }
        if (all.length === 1)
            return all[0];
        const selected = await vscode.window.showQuickPick(all.map((filePath) => ({ label: path.basename(filePath), description: path.relative(context.root, filePath), filePath })), { title });
        return selected?.filePath;
    }
    requireContext(target) {
        const context = this.tryContext(target);
        if (!context)
            throw new Error('Open a native .qtproject.json project and select a valid Qt kit first.');
        return context;
    }
    tryContext(target) {
        const targetRef = targetProjectRef(target);
        let ref = targetRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(targetRef.absolutePath) ? targetRef : undefined;
        const filePath = targetFilePath(target) ?? activeFilePath();
        if (!ref && filePath) {
            ref = this.workspaces.currentWorkspace?.projects.find((entry) => entry.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(entry.absolutePath) && isPathInside(path.dirname(entry.absolutePath), filePath));
        }
        ref ??= this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return undefined;
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const installation = this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
        if (!installation)
            return undefined;
        return { ref, manifestPath: ref.absolutePath, manifest, root: path.dirname(ref.absolutePath), installation };
    }
    runTool(executable, args, cwd, label, allowNonZero = false, env = process.env) {
        this.output.show(true);
        this.output.appendLine('');
        this.output.appendLine(`[Qt Tools] ${label}`);
        this.output.appendLine(`[Qt Tools] Tool: ${executable}`);
        this.output.appendLine(`[Qt Tools] Arguments: ${args.map(quoteArgument).join(' ')}`);
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true, shell: false });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => { const text = chunk.toString(); stdout += text; this.output.append(text); });
            child.stderr.on('data', (chunk) => { const text = chunk.toString(); stderr += text; this.output.append(text); });
            child.on('error', reject);
            child.on('close', (code) => {
                const exitCode = code ?? -1;
                this.output.appendLine(`[Qt Tools] ${path.basename(executable)} exited with code ${exitCode}.`);
                if (exitCode !== 0 && !allowNonZero)
                    this.output.appendLine('[Qt Tools] Command failed.');
                resolve({ code: exitCode, stdout, stderr });
            });
        });
    }
}
exports.QpmQtToolsService = QpmQtToolsService;
function readQtTranslationStatistics(filePath) {
    const xml = fs.readFileSync(filePath, 'utf8');
    const contexts = (xml.match(/<context\b/gi) ?? []).length;
    let messages = 0;
    let finished = 0;
    let unfinished = 0;
    let obsolete = 0;
    let vanished = 0;
    const pattern = /<message\b[^>]*>([\s\S]*?)<\/message>/gi;
    let match;
    while ((match = pattern.exec(xml)) !== null) {
        messages += 1;
        const translation = match[1].match(/<translation\b([^>]*)>([\s\S]*?)<\/translation>|<translation\b([^>]*)\/>/i);
        const attributes = translation?.[1] ?? translation?.[3] ?? '';
        const content = stripXml(translation?.[2] ?? '').trim();
        const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
        if (type === 'obsolete')
            obsolete += 1;
        else if (type === 'vanished')
            vanished += 1;
        else if (type === 'unfinished' || !content)
            unfinished += 1;
        else
            finished += 1;
    }
    return { filePath, contexts, messages, finished, unfinished, obsolete, vanished };
}
function parseQmlLintDiagnostics(filePath, output) {
    const diagnostics = [];
    const normalizedTarget = normalizeKey(filePath);
    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const match = line.match(/^(?:(Warning|Info|Error|Critical):\s*)?(.+):(\d+):(\d+):\s*(.+)$/i);
        if (!match)
            continue;
        const reportedPath = path.isAbsolute(match[2]) ? match[2] : path.resolve(path.dirname(filePath), match[2]);
        if (normalizeKey(reportedPath) !== normalizedTarget && path.basename(reportedPath).toLowerCase() !== path.basename(filePath).toLowerCase())
            continue;
        const lineIndex = Math.max(0, Number(match[3]) - 1);
        const columnIndex = Math.max(0, Number(match[4]) - 1);
        const severityText = (match[1] ?? '').toLowerCase();
        const message = match[5].trim();
        const severity = severityText === 'error' || severityText === 'critical' || /\berror\b/i.test(message)
            ? vscode.DiagnosticSeverity.Error
            : severityText === 'info' || /\binfo\b/i.test(message)
                ? vscode.DiagnosticSeverity.Information
                : vscode.DiagnosticSeverity.Warning;
        const diagnostic = new vscode.Diagnostic(new vscode.Range(lineIndex, columnIndex, lineIndex, columnIndex + 1), message, severity);
        diagnostic.source = 'qmllint';
        const category = message.match(/\[([^\]]+)\]\s*$/)?.[1];
        if (category)
            diagnostic.code = category;
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}
function genericDiagnostic(message) {
    const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'qmllint';
    return diagnostic;
}
function targetProjectRef(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const candidate = value;
    return candidate.ref;
}
function targetFilePath(value) {
    if (typeof value === 'string')
        return value;
    if (value instanceof vscode.Uri)
        return value.fsPath;
    if (!value || typeof value !== 'object')
        return undefined;
    const candidate = value;
    return candidate.file?.absolutePath ?? candidate.uri?.fsPath ?? candidate.resourceUri?.fsPath ?? candidate.fsPath;
}
function activeFilePath() {
    return vscode.window.activeTextEditor?.document.uri.scheme === 'file' ? vscode.window.activeTextEditor.document.uri.fsPath : undefined;
}
function isPathInside(root, candidate) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function ensureExtension(filePath, extension) { return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`; }
function sanitizeFileName(value) { return value.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'application'; }
function uniquePaths(values) { const seen = new Set(); return values.filter((value) => { const key = normalizeKey(value); if (!key || seen.has(key))
    return false; seen.add(key); return true; }); }
function normalizeKey(value) { const normalized = path.normalize(value); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; }
function normalizeSlash(value) { return value.replace(/\\/g, '/'); }
function quoteArgument(value) { return /\s|"/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value; }
function escapeTable(value) { return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
function stripXml(value) { return value.replace(/<numerusform\b[^>]*>/gi, '').replace(/<\/numerusform>/gi, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
