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
exports.QpmQtPythonService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtPythonService {
    workspaces;
    output;
    changeEmitter = new vscode.EventEmitter();
    onDidChange = this.changeEmitter.event;
    launchedApplications = new Map();
    cachedStatus;
    constructor(workspaces, output) {
        this.workspaces = workspaces;
        this.output = output;
        this.workspaces.onDidChange(() => {
            this.cachedStatus = undefined;
            this.changeEmitter.fire();
        });
    }
    dispose() {
        for (const processes of this.launchedApplications.values()) {
            for (const child of processes) {
                try {
                    child.kill();
                }
                catch { /* process may already be gone */ }
            }
        }
        this.launchedApplications.clear();
        this.changeEmitter.dispose();
    }
    get activeManifestPath() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return undefined;
        try {
            return (0, qtProjectManifest_1.isQtPythonProject)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath)) ? ref.absolutePath : undefined;
        }
        catch {
            return undefined;
        }
    }
    get status() {
        return this.cachedStatus;
    }
    async refresh() {
        const manifestPath = this.activeManifestPath;
        if (!manifestPath) {
            this.cachedStatus = undefined;
            this.changeEmitter.fire();
            return undefined;
        }
        const status = this.inspect(manifestPath);
        this.cachedStatus = status;
        this.changeEmitter.fire();
        return status;
    }
    inspect(manifestPath) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        if (!(0, qtProjectManifest_1.isQtPythonProject)(manifest)) {
            return { projectName: manifest.name, manifestPath, state: 'disabled', tools: {}, message: 'Qt for Python is disabled for this project.' };
        }
        const interpreter = this.resolveInterpreter(manifestPath, manifest);
        const virtualEnvironment = resolveProjectPath(root, manifest.python.virtualEnvironment);
        const projectFile = resolveProjectPath(root, manifest.python.projectFile);
        const entryPoint = resolveProjectPath(root, manifest.python.entryPoint);
        if (!interpreter) {
            return {
                projectName: manifest.name, manifestPath, state: 'missing-python', virtualEnvironment, projectFile, entryPoint,
                tools: {}, message: 'No usable Python interpreter was found.'
            };
        }
        const probe = probePython(interpreter, this.createEnvironment(manifestPath, manifest, interpreter));
        const tools = this.resolveTools(manifestPath, manifest, interpreter);
        if (!probe.ok) {
            return {
                projectName: manifest.name, manifestPath, state: 'error', interpreter, virtualEnvironment, projectFile, entryPoint, tools,
                message: probe.error || 'Unable to query the selected Python interpreter.'
            };
        }
        const state = probe.pySideVersion ? 'ready' : 'missing-pyside6';
        return {
            projectName: manifest.name,
            manifestPath,
            state,
            interpreter,
            pythonVersion: probe.pythonVersion,
            pySideVersion: probe.pySideVersion,
            virtualEnvironment,
            projectFile,
            entryPoint,
            tools,
            message: probe.pySideVersion
                ? `Python ${probe.pythonVersion} with PySide6 ${probe.pySideVersion}.`
                : `Python ${probe.pythonVersion} is available, but PySide6 is not installed.`
        };
    }
    async bootstrapActiveProject(interactive = true) {
        const manifestPath = this.activeManifestPath;
        if (!manifestPath)
            return false;
        return this.bootstrap(manifestPath, interactive);
    }
    async bootstrap(manifestPath, interactive = true) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!(0, qtProjectManifest_1.isQtPythonProject)(manifest))
            return false;
        const root = path.dirname(manifestPath);
        const venv = resolveProjectPath(root, manifest.python.virtualEnvironment);
        const venvInterpreter = pythonInVirtualEnvironment(venv);
        let interpreter = this.resolveInterpreter(manifestPath, manifest);
        // A project-created virtual environment is the default QPM workflow. Do not
        // silently fall back to a system interpreter when the manifest explicitly
        // requests automatic venv creation and no interpreter was selected yet.
        if (manifest.python.autoCreateVirtualEnvironment && !manifest.python.interpreter.trim() && (!venvInterpreter || !fs.existsSync(venvInterpreter))) {
            if (!await this.createVirtualEnvironment(manifestPath, interactive))
                return false;
            interpreter = this.resolveInterpreter(manifestPath, (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath));
        }
        else if (!interpreter && manifest.python.autoCreateVirtualEnvironment) {
            if (!await this.createVirtualEnvironment(manifestPath, interactive))
                return false;
            interpreter = this.resolveInterpreter(manifestPath, (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath));
        }
        if (!interpreter) {
            if (interactive)
                vscode.window.showErrorMessage('Qt for Python: no Python interpreter is available. Configure an interpreter or create the project virtual environment.');
            return false;
        }
        const probe = probePython(interpreter, this.createEnvironment(manifestPath, manifest, interpreter));
        if (!probe.pySideVersion) {
            if (manifest.python.autoInstallPySide6)
                return this.installPySide6(manifestPath);
            if (interactive) {
                const choice = await vscode.window.showWarningMessage(`PySide6 is not installed in ${venv && interpreter.startsWith(venv) ? manifest.python.virtualEnvironment : interpreter}.`, 'Install PySide6', 'Later');
                if (choice === 'Install PySide6')
                    return this.installPySide6(manifestPath);
            }
            await this.refresh();
            return false;
        }
        await this.refresh();
        return true;
    }
    async createVirtualEnvironment(manifestPath = this.requireActiveManifest(), interactive = true) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const venvPath = resolveProjectPath(root, manifest.python.virtualEnvironment || '.venv');
        const existing = pythonInVirtualEnvironment(venvPath);
        if (existing && fs.existsSync(existing)) {
            manifest.python.interpreter = relativeOrAbsolute(root, existing);
            (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
            await this.configureVsCodeInterpreter(manifestPath, existing);
            await this.refresh();
            if (interactive)
                vscode.window.showInformationMessage(`Qt for Python virtual environment already exists: ${venvPath}`);
            return true;
        }
        const basePython = this.resolveBaseInterpreter(manifestPath, manifest);
        if (!basePython) {
            if (interactive)
                vscode.window.showErrorMessage('Qt for Python: no base Python 3.10+ interpreter was found to create the virtual environment.');
            return false;
        }
        this.output.show(true);
        this.output.appendLine(`[Qt/Python] Create virtual environment: ${venvPath}`);
        const result = await runTool(basePython, ['-m', 'venv', venvPath], root, process.env, this.output, 'python -m venv');
        if (!result)
            return false;
        const interpreter = pythonInVirtualEnvironment(venvPath);
        if (!interpreter || !fs.existsSync(interpreter)) {
            vscode.window.showErrorMessage(`Qt for Python: virtual environment was created but its Python interpreter was not found: ${venvPath}`);
            return false;
        }
        manifest.python.interpreter = relativeOrAbsolute(root, interpreter);
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
        await this.configureVsCodeInterpreter(manifestPath, interpreter);
        await this.refresh();
        if (interactive)
            vscode.window.showInformationMessage(`Created Qt for Python virtual environment: ${manifest.python.virtualEnvironment}`);
        return true;
    }
    async selectInterpreter(manifestPath = this.requireActiveManifest()) {
        const selected = await vscode.window.showOpenDialog({
            title: 'Select Python interpreter for Qt for Python',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: process.platform === 'win32' ? { Python: ['exe'] } : undefined
        });
        const interpreter = selected?.[0]?.fsPath;
        if (!interpreter)
            return false;
        const probe = probePython(interpreter, process.env);
        if (!probe.ok) {
            vscode.window.showErrorMessage(`The selected file is not a usable Python interpreter: ${probe.error ?? interpreter}`);
            return false;
        }
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        manifest.python.interpreter = relativeOrAbsolute(root, interpreter);
        (0, qtProjectManifest_1.writeQtProjectManifest)(manifestPath, manifest);
        await this.configureVsCodeInterpreter(manifestPath, interpreter);
        await this.refresh();
        vscode.window.showInformationMessage(`Qt for Python interpreter: Python ${probe.pythonVersion}.`);
        return true;
    }
    async installPySide6(manifestPath = this.requireActiveManifest()) {
        let manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        let interpreter = this.resolveInterpreter(manifestPath, manifest);
        if (!interpreter && manifest.python.autoCreateVirtualEnvironment) {
            if (!await this.createVirtualEnvironment(manifestPath, false))
                return false;
            manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
            interpreter = this.resolveInterpreter(manifestPath, manifest);
        }
        if (!interpreter) {
            vscode.window.showErrorMessage('Qt for Python: configure a Python interpreter before installing PySide6.');
            return false;
        }
        const requested = manifest.python.pySideVersion.trim();
        const packageName = requested ? `PySide6==${requested}` : 'PySide6';
        this.output.show(true);
        this.output.appendLine(`[Qt/Python] Install ${packageName} with ${interpreter}`);
        const ok = await runTool(interpreter, ['-m', 'pip', 'install', packageName], path.dirname(manifestPath), this.createEnvironment(manifestPath, manifest, interpreter), this.output, `Install ${packageName}`);
        await this.refresh();
        if (ok)
            vscode.window.showInformationMessage(`${packageName} installed for ${manifest.name}.`);
        return ok;
    }
    async build(manifestPath = this.requireActiveManifest(), rebuild = false) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const projectTool = status.tools.project;
        if (!projectTool) {
            vscode.window.showErrorMessage('Qt for Python: pyside6-project was not found in the selected Python environment.');
            return false;
        }
        if (rebuild && !await this.clean(manifestPath))
            return false;
        this.ensurePyProjectFile(manifestPath, manifest);
        const args = ['build', resolveProjectPath(path.dirname(manifestPath), manifest.python.projectFile), ...manifest.python.additionalProjectArguments];
        this.output.show(true);
        this.output.appendLine(`[Qt/Python] Build ${manifest.name}`);
        this.output.appendLine(`[Qt/Python] Tool: ${projectTool}`);
        this.output.appendLine(`[Qt/Python] Arguments: ${args.join(' ')}`);
        return runTool(projectTool, args, path.dirname(manifestPath), this.createEnvironment(manifestPath, manifest, status.interpreter), this.output, `pyside6-project build ${manifest.name}`);
    }
    async clean(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        await this.stopLaunchedApplications(manifestPath);
        const status = this.inspect(manifestPath);
        if (status.interpreter && status.tools.project) {
            const projectFile = resolveProjectPath(path.dirname(manifestPath), manifest.python.projectFile);
            const ok = await runTool(status.tools.project, ['clean', projectFile], path.dirname(manifestPath), this.createEnvironment(manifestPath, manifest, status.interpreter), this.output, `pyside6-project clean ${manifest.name}`);
            if (ok)
                return true;
        }
        // Conservative fallback for environments where pyside6-project is unavailable.
        const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(manifestPath, manifest);
        let removed = 0;
        for (const source of [...files.forms, ...files.resources]) {
            const stem = path.parse(source).name;
            const generated = path.join(path.dirname(source), `${path.extname(source).toLowerCase() === '.ui' ? 'ui_' : 'rc_'}${stem}.py`);
            if (fs.existsSync(generated)) {
                try {
                    fs.rmSync(generated, { force: true });
                    removed += 1;
                }
                catch { /* best effort */ }
            }
        }
        this.output.appendLine(`[Qt/Python] Clean fallback removed ${removed} generated Python file(s).`);
        return true;
    }
    async run(manifestPath = this.requireActiveManifest(), buildFirst) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const shouldBuild = buildFirst ?? manifest.python.buildBeforeRun;
        if (shouldBuild && !await this.build(manifestPath, false))
            return false;
        const status = this.inspect(manifestPath);
        const interpreter = status.interpreter;
        if (!interpreter)
            return false;
        const entryPoint = resolveProjectPath(path.dirname(manifestPath), manifest.python.entryPoint);
        if (!fs.existsSync(entryPoint)) {
            vscode.window.showErrorMessage(`Qt for Python entry point not found: ${entryPoint}`);
            return false;
        }
        const runProfile = manifest.profiles.runs.find((entry) => entry.id === manifest.profiles.active.runProfileId) ?? manifest.profiles.runs[0];
        const args = splitArguments(runProfile?.arguments ?? '');
        const cwd = runProfile?.workingDirectory
            ? resolveProjectPath(path.dirname(manifestPath), runProfile.workingDirectory)
            : path.dirname(manifestPath);
        const env = { ...this.createEnvironment(manifestPath, manifest, interpreter), ...(runProfile?.environment ?? {}) };
        const child = (0, child_process_1.spawn)(interpreter, [entryPoint, ...args], { cwd, env, detached: false, stdio: 'ignore', windowsHide: false });
        this.trackApplication(manifestPath, child);
        child.unref?.();
        this.output.appendLine(`[Qt/Python] Started ${interpreter} ${entryPoint}${args.length ? ` ${args.join(' ')}` : ''}${child.pid ? ` (PID ${child.pid})` : ''}`);
        vscode.window.showInformationMessage(`Started Qt for Python application ${manifest.name}.`);
        return true;
    }
    async debug(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const interpreter = status.interpreter;
        if (!interpreter)
            return false;
        const entryPoint = resolveProjectPath(path.dirname(manifestPath), manifest.python.entryPoint);
        const runProfile = manifest.profiles.runs.find((entry) => entry.id === manifest.profiles.active.runProfileId) ?? manifest.profiles.runs[0];
        const env = { ...manifest.python.environment, ...(runProfile?.environment ?? {}) };
        const config = {
            name: `Qt for Python — ${manifest.name}`,
            type: 'debugpy',
            request: 'launch',
            program: entryPoint,
            python: interpreter,
            cwd: runProfile?.workingDirectory ? resolveProjectPath(path.dirname(manifestPath), runProfile.workingDirectory) : path.dirname(manifestPath),
            args: splitArguments(runProfile?.arguments ?? ''),
            env,
            console: 'integratedTerminal',
            justMyCode: true
        };
        const started = await vscode.debug.startDebugging(undefined, config);
        if (!started)
            vscode.window.showWarningMessage('Qt for Python debugging could not be started. Install/enable the Microsoft Python Debugger extension (debugpy) if necessary.');
        return started;
    }
    async deploy(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!manifest.python.deployEnabled) {
            vscode.window.showWarningMessage('Qt for Python deployment is disabled in the project settings.');
            return false;
        }
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const env = this.createEnvironment(manifestPath, manifest, status.interpreter);
        const root = path.dirname(manifestPath);
        const projectFile = resolveProjectPath(root, manifest.python.projectFile);
        if (status.tools.project) {
            return runTool(status.tools.project, ['deploy', projectFile, ...manifest.python.additionalDeployArguments], root, env, this.output, `pyside6-project deploy ${manifest.name}`);
        }
        if (status.tools.deploy) {
            const entryPoint = resolveProjectPath(root, manifest.python.entryPoint);
            return runTool(status.tools.deploy, [entryPoint, ...manifest.python.additionalDeployArguments], root, env, this.output, `pyside6-deploy ${manifest.name}`);
        }
        vscode.window.showErrorMessage('Qt for Python: neither pyside6-project nor pyside6-deploy was found.');
        return false;
    }
    async deployAndroid(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!manifest.python.androidDeployEnabled) {
            vscode.window.showWarningMessage('Qt for Python Android deployment is disabled in the project settings.');
            return false;
        }
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const tool = status.tools.androidDeploy;
        if (!tool) {
            vscode.window.showErrorMessage('Qt for Python: pyside6-android-deploy was not found.');
            return false;
        }
        const root = path.dirname(manifestPath);
        const spec = resolveProjectPath(root, manifest.python.deploySpecFile);
        const args = fs.existsSync(spec) ? ['--config-file', spec, ...manifest.python.additionalDeployArguments] : [...manifest.python.additionalDeployArguments];
        return runTool(tool, args, root, this.createEnvironment(manifestPath, manifest, status.interpreter), this.output, `pyside6-android-deploy ${manifest.name}`);
    }
    async openDesigner(manifestPath = this.requireActiveManifest(), input) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const designer = status.tools.designer;
        if (!designer) {
            vscode.window.showErrorMessage('Qt for Python: pyside6-designer was not found in the selected environment.');
            return false;
        }
        const candidate = pathFromCommandInput(input) ?? vscode.window.activeTextEditor?.document.uri.fsPath;
        const uiPath = candidate && path.extname(candidate).toLowerCase() === '.ui' ? candidate : undefined;
        const args = uiPath ? [uiPath] : [];
        const child = (0, child_process_1.spawn)(designer, args, {
            cwd: path.dirname(manifestPath),
            env: this.createEnvironment(manifestPath, manifest, status.interpreter),
            // pyside6-designer is a console-subsystem launcher on Windows. Creating it as a
            // detached process without windowsHide causes a transient console window before
            // the actual Qt Designer GUI appears. Keep the launcher hidden on Windows and
            // avoid CREATE_NEW_CONSOLE there; unref() is still enough to avoid blocking QPM.
            detached: process.platform !== 'win32',
            windowsHide: process.platform === 'win32',
            stdio: 'ignore',
            shell: false
        });
        child.once('error', (error) => {
            this.output.appendLine(`[Qt/Python] Designer launch failed: ${error.message}`);
            void vscode.window.showErrorMessage(`Qt for Python Designer could not be started: ${error.message}`);
        });
        child.unref();
        this.output.appendLine(`[Qt/Python] Started Designer without console window: ${designer}${uiPath ? ` ${uiPath}` : ''}`);
        return true;
    }
    async compileUiFiles(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const tool = status.tools.uic;
        if (!tool) {
            vscode.window.showErrorMessage('Qt for Python: pyside6-uic was not found.');
            return false;
        }
        const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(manifestPath, manifest).forms.filter((entry) => fs.existsSync(entry));
        for (const file of files) {
            const outputPath = path.join(path.dirname(file), `ui_${path.parse(file).name}.py`);
            if (!await runTool(tool, [file, '-o', outputPath], path.dirname(manifestPath), this.createEnvironment(manifestPath, manifest, status.interpreter), this.output, `pyside6-uic ${path.basename(file)}`))
                return false;
        }
        vscode.window.showInformationMessage(`Generated ${files.length} Python UI file(s).`);
        return true;
    }
    async compileResourceFiles(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        if (!await this.ensureReady(manifestPath))
            return false;
        const status = this.inspect(manifestPath);
        const tool = status.tools.rcc;
        if (!tool) {
            vscode.window.showErrorMessage('Qt for Python: pyside6-rcc was not found.');
            return false;
        }
        const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(manifestPath, manifest).resources.filter((entry) => fs.existsSync(entry));
        for (const file of files) {
            const outputPath = path.join(path.dirname(file), `rc_${path.parse(file).name}.py`);
            if (!await runTool(tool, [file, '-o', outputPath], path.dirname(manifestPath), this.createEnvironment(manifestPath, manifest, status.interpreter), this.output, `pyside6-rcc ${path.basename(file)}`))
                return false;
        }
        vscode.window.showInformationMessage(`Generated ${files.length} Python resource file(s).`);
        return true;
    }
    async configureVsCodeInterpreter(manifestPath = this.requireActiveManifest(), explicitInterpreter) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const interpreter = explicitInterpreter ?? this.resolveInterpreter(manifestPath, manifest);
        if (!interpreter)
            return false;
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(path.dirname(manifestPath)));
        const config = vscode.workspace.getConfiguration('python', folder?.uri);
        await config.update('defaultInterpreterPath', interpreter, vscode.ConfigurationTarget.WorkspaceFolder);
        this.output.appendLine(`[Qt/Python] VS Code python.defaultInterpreterPath = ${interpreter}`);
        return true;
    }
    async openReport(manifestPath = this.requireActiveManifest()) {
        const status = this.inspect(manifestPath);
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const reportDirectory = path.join(root, '.qpm', 'python');
        fs.mkdirSync(reportDirectory, { recursive: true });
        const reportPath = path.join(reportDirectory, 'QT_FOR_PYTHON_REPORT.md');
        const toolLines = Object.entries(status.tools).map(([key, value]) => `- ${key}: ${value || 'not found'}`);
        const text = [
            `# Qt for Python — ${manifest.name}`,
            '',
            `- State: ${status.state}`,
            `- Binding: PySide6`,
            `- Python: ${status.pythonVersion ?? 'not detected'}`,
            `- PySide6: ${status.pySideVersion ?? 'not installed'}`,
            `- Interpreter: ${status.interpreter ?? 'not resolved'}`,
            `- Virtual environment: ${status.virtualEnvironment ?? 'not configured'}`,
            `- Project file: ${status.projectFile ?? 'not configured'}`,
            `- Entry point: ${status.entryPoint ?? 'not configured'}`,
            '',
            '## Tools',
            '',
            ...toolLines,
            '',
            '## Configuration',
            '',
            `- Auto-create virtual environment: ${manifest.python.autoCreateVirtualEnvironment}`,
            `- Auto-install PySide6: ${manifest.python.autoInstallPySide6}`,
            `- UI mode: ${manifest.python.uiMode}`,
            `- Build before run: ${manifest.python.buildBeforeRun}`,
            `- Desktop deploy: ${manifest.python.deployEnabled}`,
            `- Android deploy: ${manifest.python.androidDeployEnabled}`,
            ''
        ].join('\n');
        fs.writeFileSync(reportPath, text, 'utf8');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(reportPath));
        await vscode.window.showTextDocument(doc, { preview: false });
    }
    async revealEnvironment(manifestPath = this.requireActiveManifest()) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const root = path.dirname(manifestPath);
        const venv = resolveProjectPath(root, manifest.python.virtualEnvironment);
        const target = fs.existsSync(venv) ? venv : root;
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
    }
    requireActiveManifest() {
        const manifestPath = this.activeManifestPath;
        if (!manifestPath)
            throw new Error('The active project is not a Qt for Python project.');
        return manifestPath;
    }
    async ensureReady(manifestPath) {
        const status = this.inspect(manifestPath);
        if (status.state === 'ready')
            return true;
        return this.bootstrap(manifestPath, true);
    }
    resolveInterpreter(manifestPath, manifest) {
        const root = path.dirname(manifestPath);
        const configured = manifest.python.interpreter.trim();
        if (configured) {
            const candidate = resolveProjectPath(root, configured);
            if (isExecutableFile(candidate))
                return candidate;
        }
        const venv = resolveProjectPath(root, manifest.python.virtualEnvironment);
        const venvPython = pythonInVirtualEnvironment(venv);
        if (venvPython && isExecutableFile(venvPython))
            return venvPython;
        const workspacePython = vscode.workspace.getConfiguration('python', vscode.Uri.file(root)).get('defaultInterpreterPath', '').trim();
        if (workspacePython) {
            const candidate = expandWorkspaceVariables(workspacePython, root);
            if (isExecutableFile(candidate))
                return candidate;
        }
        return this.resolveBaseInterpreter(manifestPath, manifest);
    }
    resolveBaseInterpreter(manifestPath, manifest) {
        const root = path.dirname(manifestPath);
        const configured = manifest.python.interpreter.trim();
        if (configured) {
            const candidate = resolveProjectPath(root, configured);
            if (isExecutableFile(candidate) && !pathInside(resolveProjectPath(root, manifest.python.virtualEnvironment), candidate))
                return candidate;
        }
        const workspacePython = vscode.workspace.getConfiguration('python', vscode.Uri.file(root)).get('defaultInterpreterPath', '').trim();
        if (workspacePython) {
            const candidate = expandWorkspaceVariables(workspacePython, root);
            if (isExecutableFile(candidate) && !pathInside(resolveProjectPath(root, manifest.python.virtualEnvironment), candidate))
                return candidate;
        }
        for (const candidate of pythonCommandCandidates()) {
            const check = (0, child_process_1.spawnSync)(candidate.command, [...candidate.prefix, '-c', 'import sys; print(sys.executable)'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5000 });
            if (check.status === 0) {
                const executable = String(check.stdout || '').trim().split(/\r?\n/).pop()?.trim();
                if (executable && isExecutableFile(executable))
                    return executable;
            }
        }
        return undefined;
    }
    resolveTools(manifestPath, manifest, interpreter) {
        const env = this.createEnvironment(manifestPath, manifest, interpreter);
        const scripts = pythonScriptsDirectory(interpreter, env);
        const overrides = manifest.python.toolOverrides;
        const resolve = (override, name) => {
            const root = path.dirname(manifestPath);
            if (override.trim()) {
                const candidate = resolveProjectPath(root, override);
                if (isExecutableFile(candidate))
                    return candidate;
            }
            const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
            for (const dir of [scripts, path.dirname(interpreter)].filter(Boolean)) {
                for (const extension of extensions) {
                    const candidate = path.join(dir, `${name}${extension}`);
                    if (isExecutableFile(candidate))
                        return candidate;
                }
            }
            return findOnPath(name, env);
        };
        return {
            project: resolve(overrides.project, 'pyside6-project'),
            designer: resolve(overrides.designer, 'pyside6-designer'),
            uic: resolve(overrides.uic, 'pyside6-uic'),
            rcc: resolve(overrides.rcc, 'pyside6-rcc'),
            deploy: resolve(overrides.deploy, 'pyside6-deploy'),
            androidDeploy: resolve(overrides.androidDeploy, 'pyside6-android-deploy'),
            linguist: resolve(overrides.linguist, 'pyside6-linguist'),
            lupdate: resolve(overrides.lupdate, 'pyside6-lupdate'),
            lrelease: resolve(overrides.lrelease, 'pyside6-lrelease'),
            qmllint: resolve(overrides.qmllint, 'pyside6-qmllint')
        };
    }
    createEnvironment(manifestPath, manifest, interpreter) {
        const root = path.dirname(manifestPath);
        const env = { ...process.env, ...manifest.python.environment };
        if (interpreter) {
            const scripts = pythonScriptsDirectory(interpreter, env);
            const parts = [scripts, path.dirname(interpreter), env.PATH].filter(Boolean);
            env.PATH = parts.join(path.delimiter);
            env.VIRTUAL_ENV = virtualEnvironmentForInterpreter(interpreter) ?? env.VIRTUAL_ENV;
        }
        env.PYTHONPATH = [root, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
        env.PYTHONUTF8 = env.PYTHONUTF8 || '1';
        return env;
    }
    ensurePyProjectFile(manifestPath, manifest) {
        const root = path.dirname(manifestPath);
        const projectFile = resolveProjectPath(root, manifest.python.projectFile);
        if (fs.existsSync(projectFile))
            return;
        if (path.basename(projectFile).toLowerCase() !== 'pyproject.toml')
            return;
        const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(manifestPath, manifest);
        const entries = [...files.python, ...files.forms, ...files.resources, ...files.qml, ...files.translations]
            .filter((entry) => fs.existsSync(entry))
            .map((entry) => path.relative(root, entry).replace(/\\/g, '/'));
        const content = [
            '[project]',
            `name = ${tomlString(manifest.name)}`,
            `version = ${tomlString(manifest.packaging.productVersion || '1.0.0')}`,
            '',
            '[tool.pyside6-project]',
            `files = [${entries.map(tomlString).join(', ')}]`,
            ''
        ].join('\n');
        fs.writeFileSync(projectFile, content, 'utf8');
        this.output.appendLine(`[Qt/Python] Generated ${projectFile}`);
    }
    trackApplication(manifestPath, child) {
        const key = path.resolve(manifestPath).toLowerCase();
        const set = this.launchedApplications.get(key) ?? new Set();
        set.add(child);
        this.launchedApplications.set(key, set);
        child.once('exit', () => {
            set.delete(child);
            if (set.size === 0)
                this.launchedApplications.delete(key);
        });
    }
    async stopLaunchedApplications(manifestPath) {
        const key = path.resolve(manifestPath).toLowerCase();
        const processes = this.launchedApplications.get(key);
        if (!processes)
            return;
        for (const child of [...processes]) {
            try {
                child.kill();
            }
            catch { /* best effort */ }
        }
        this.launchedApplications.delete(key);
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}
exports.QpmQtPythonService = QpmQtPythonService;
function probePython(interpreter, env) {
    const code = [
        'import sys',
        'print("PY=" + ".".join(map(str, sys.version_info[:3])))',
        'try:',
        ' import PySide6',
        ' print("PYSIDE=" + str(PySide6.__version__))',
        'except Exception:',
        ' print("PYSIDE=")'
    ].join('\n');
    const result = (0, child_process_1.spawnSync)(interpreter, ['-c', code], { encoding: 'utf8', env, windowsHide: true, timeout: 8000 });
    if (result.error || result.status !== 0)
        return { ok: false, error: result.error?.message || String(result.stderr || '').trim() || `exit code ${String(result.status)}` };
    const lines = String(result.stdout || '').split(/\r?\n/);
    const pythonVersion = lines.find((line) => line.startsWith('PY='))?.slice(3).trim();
    const pySideVersion = lines.find((line) => line.startsWith('PYSIDE='))?.slice(7).trim();
    return { ok: true, pythonVersion, pySideVersion: pySideVersion || undefined };
}
async function runTool(tool, args, cwd, env, output, label) {
    output.appendLine(`[Qt/Python] ${label}`);
    output.appendLine(`[Qt/Python] Tool: ${tool}`);
    output.appendLine(`[Qt/Python] Arguments: ${args.join(' ')}`);
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(tool, args, { cwd, env, windowsHide: true, shell: false });
        child.stdout?.on('data', (chunk) => output.append(String(chunk)));
        child.stderr?.on('data', (chunk) => output.append(String(chunk)));
        child.on('error', (error) => {
            output.appendLine(`[Qt/Python] ${label} failed to start: ${error.message}`);
            vscode.window.showErrorMessage(`${label} failed to start. Open the Qt Project Manager output channel for details.`);
            resolve(false);
        });
        child.on('close', (code) => {
            output.appendLine(`[Qt/Python] ${path.basename(tool)} exited with code ${String(code ?? -1)}.`);
            if (code !== 0)
                vscode.window.showErrorMessage(`${label} failed. Open the Qt Project Manager output channel for details.`);
            resolve(code === 0);
        });
    });
}
function resolveProjectPath(root, value) {
    const text = value.trim();
    if (!text)
        return root;
    return path.isAbsolute(text) ? path.normalize(text) : path.resolve(root, text);
}
function relativeOrAbsolute(root, value) {
    const relative = path.relative(root, value);
    return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        ? relative.replace(/\\/g, '/')
        : value;
}
function pythonInVirtualEnvironment(venvPath) {
    return process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
}
function virtualEnvironmentForInterpreter(interpreter) {
    const parent = path.dirname(interpreter);
    const leaf = path.basename(parent).toLowerCase();
    if (leaf === 'scripts' || leaf === 'bin')
        return path.dirname(parent);
    return undefined;
}
function pythonScriptsDirectory(interpreter, env) {
    const venv = virtualEnvironmentForInterpreter(interpreter);
    if (venv)
        return process.platform === 'win32' ? path.join(venv, 'Scripts') : path.join(venv, 'bin');
    const result = (0, child_process_1.spawnSync)(interpreter, ['-c', 'import sysconfig; print(sysconfig.get_path("scripts") or "")'], { encoding: 'utf8', env, windowsHide: true, timeout: 5000 });
    const candidate = String(result.stdout || '').trim().split(/\r?\n/).pop()?.trim();
    return candidate || path.dirname(interpreter);
}
function pythonCommandCandidates() {
    return process.platform === 'win32'
        ? [{ command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] }, { command: 'python3', prefix: [] }]
        : [{ command: 'python3', prefix: [] }, { command: 'python', prefix: [] }];
}
function isExecutableFile(candidate) {
    try {
        return fs.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
}
function findOnPath(name, env) {
    const pathValue = env.PATH || env.Path || env.path || '';
    const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name];
    for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
        for (const executable of names) {
            const candidate = path.join(directory.replace(/^"|"$/g, ''), executable);
            if (isExecutableFile(candidate))
                return candidate;
        }
    }
    return undefined;
}
function pathInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (!!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function expandWorkspaceVariables(value, root) {
    return value.replace(/\$\{workspaceFolder\}/g, root).replace(/\$\{workspaceRoot\}/g, root);
}
function splitArguments(value) {
    const args = [];
    const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+)/g;
    let match;
    while ((match = pattern.exec(value)) !== null)
        args.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\([\\"'])/g, '$1'));
    return args;
}
function tomlString(value) {
    return JSON.stringify(value);
}
function pathFromCommandInput(input) {
    if (!input)
        return undefined;
    if (input instanceof vscode.Uri)
        return input.fsPath;
    if (typeof input === 'string')
        return input;
    if (typeof input === 'object') {
        const value = input;
        if (typeof value.fsPath === 'string')
            return value.fsPath;
        if (typeof value.file?.absolutePath === 'string')
            return value.file.absolutePath;
        if (typeof value.absolutePath === 'string')
            return value.absolutePath;
        if (typeof value.resourceUri?.fsPath === 'string')
            return value.resourceUri.fsPath;
    }
    return undefined;
}
