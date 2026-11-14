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
exports.HomePanel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const webviewKit_1 = require("./webviewKit");
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const BUILD_MODE_SHORT = { debug: 'D32', release: 'R32', debug64: 'D64', release64: 'R64' };
const BUILD_MODE_LONG = { debug: 'Debug, 32-bit', release: 'Release, 32-bit', debug64: 'Debug, 64-bit', release64: 'Release, 64-bit' };
const TARGET_SHORT = { 'Executable': 'EXE', 'Dynamic Link Library': 'DLL', 'Static Library': 'LIB' };
const PLATFORM_LABEL = { desktop: 'Desktop', 'linux-local': 'Linux local', 'remote-linux': 'Remote Linux', docker: 'Docker', webassembly: 'WebAssembly', android: 'Android', macos: 'macOS', 'ios-simulator': 'iOS Simulator', 'ios-device': 'iOS device' };
/**
 * Home page. The HTML skeleton is rendered once; every later change (workspace, configuration, Qt kit,
 * build result, problems, recents) is pushed with postMessage and drawn by media/webview/home.js,
 * so the page never reloads, flickers or loses its scroll position.
 */
class HomePanel {
    context;
    workspaces;
    builds;
    installations;
    qtInstallations;
    qtPython;
    panel;
    disposables = [];
    updateTimer;
    constructor(context, workspaces, builds, installations, qtInstallations, qtPython) {
        this.context = context;
        this.workspaces = workspaces;
        this.builds = builds;
        this.installations = installations;
        this.qtInstallations = qtInstallations;
        this.qtPython = qtPython;
        this.disposables.push(this.workspaces.onDidChange(() => this.update()), this.builds.onDidFinishBuild(() => this.update()), vscode.languages.onDidChangeDiagnostics(() => this.scheduleUpdate()));
        if (this.qtPython)
            this.disposables.push(this.qtPython.onDidChange(() => this.scheduleUpdate()));
    }
    dispose() {
        if (this.updateTimer)
            clearTimeout(this.updateTimer);
        this.panel?.dispose();
        for (const disposable of this.disposables)
            disposable.dispose();
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.update();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('qpm.home', 'Qt Project Manager', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        });
        this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'qpm.svg');
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
        this.panel.webview.html = this.renderSkeleton(this.panel.webview);
    }
    /** Pushes fresh state to an open page (no reload). */
    update() {
        if (!this.panel)
            return;
        void this.panel.webview.postMessage({ type: 'state', state: this.collectState() });
    }
    scheduleUpdate() {
        if (!this.panel)
            return;
        if (this.updateTimer)
            clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(() => this.update(), 250);
    }
    async handleMessage(message) {
        try {
            switch (String(message?.type ?? '')) {
                case 'ready':
                    return;
                case 'command':
                    await (0, webviewKit_1.executeWebviewCommand)(message.command);
                    return;
                case 'openRecent': {
                    const target = String(message.path ?? '');
                    const known = this.workspaces.getRecentWorkspaces().find((entry) => entry.path === target);
                    if (!known)
                        return;
                    if (!known.exists) {
                        const answer = await vscode.window.showWarningMessage(`${known.name} no longer exists at ${known.path}.`, 'Remove from recents');
                        if (answer)
                            await this.workspaces.forgetRecentWorkspace(known.path);
                        return;
                    }
                    await this.workspaces.load(known.path);
                    return;
                }
                case 'forgetRecent':
                    await this.workspaces.forgetRecentWorkspace(String(message.path ?? ''));
                    return;
            }
        }
        catch (error) {
            void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        }
        finally {
            this.update();
        }
    }
    collectState() {
        const workspace = this.workspaces.currentWorkspace;
        const activeProject = this.workspaces.activeProjectRef;
        const project = activeProject?.exists ? this.workspaces.getProject(activeProject) : undefined;
        const mode = this.builds.buildMode;
        const targetType = project?.targetType ?? '';
        let language = 'compat';
        let platform;
        let qtPreference;
        if (activeProject?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeProject.absolutePath)) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeProject.absolutePath);
                language = (0, qtProjectManifest_1.isQtPythonProject)(manifest) ? 'qt-python' : 'qt-cpp';
                const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
                platform = { name: profile.name, type: profile.type, label: PLATFORM_LABEL[profile.type] ?? profile.type };
                qtPreference = (0, qtProjectManifest_1.getQtInstallationPreference)(manifest, mode);
            }
            catch {
                language = 'qt-cpp';
            }
        }
        const qt = this.collectQtState(qtPreference, workspace?.qpmDir);
        const python = language === 'qt-python' ? this.collectPythonState() : undefined;
        let errors = 0;
        let warnings = 0;
        this.builds.diagnostics.forEach((_uri, items) => {
            for (const item of items) {
                if (item.severity === vscode.DiagnosticSeverity.Error)
                    errors++;
                else if (item.severity === vscode.DiagnosticSeverity.Warning)
                    warnings++;
            }
        });
        return {
            workspace: workspace ? { name: workspace.name, path: workspace.path, projectCount: workspace.projects.length, canAddProject: path.extname(workspace.path).toLowerCase() === '.cws' } : undefined,
            project: activeProject?.exists ? { name: activeProject.name, path: activeProject.absolutePath, targetType, targetShort: TARGET_SHORT[targetType] ?? targetType, language, platform } : undefined,
            mode,
            modeShort: BUILD_MODE_SHORT[mode] ?? mode,
            modeLong: BUILD_MODE_LONG[mode] ?? mode,
            qt,
            python,
            lastBuild: this.builds.lastBuild,
            problems: { errors, warnings },
            recents: this.workspaces.getRecentWorkspaces().map((entry) => ({ ...entry, current: Boolean(workspace && path.resolve(workspace.path) === path.resolve(entry.path)) }))
        };
    }
    collectQtState(preference, compatDir) {
        const installation = this.qtInstallations?.getActive(preference);
        if (!installation) {
            // Compatibility C/C++ projects (.cws/.prj) build with the plain toolchain.
            const toolchain = this.installations.getActiveInstallation(compatDir, false);
            return {
                root: toolchain?.root,
                compiler: toolchain ? 'Compatibility C/C++ toolchain' : undefined,
                tools: toolchain ? [
                    fileTool('C++ compiler', 'g++', toolchain.cppCompilerExe),
                    fileTool('Archiver', 'ar', toolchain.archiverExe),
                    fileTool('Debugger', 'gdb', toolchain.debuggerExe)
                ] : []
            };
        }
        const chain = installation.toolchain;
        const compilerParts = [chain.family !== 'unknown' ? chain.family.toUpperCase() : installation.compilerFamily.toUpperCase(), chain.compilerVersion, chain.architecture || installation.architecture].filter(Boolean);
        return {
            version: installation.version,
            label: installation.label,
            root: installation.root,
            compiler: compilerParts.join(' · '),
            compatibility: chain.compatibility,
            diagnostic: chain.diagnostic,
            tools: [
                fileTool('Build', 'qmake', installation.qmakePath ?? installation.cmakePath),
                fileTool('Compiler', path.basename(chain.cppCompilerPath ?? '') || 'c++', chain.cppCompilerPath),
                fileTool('Debugger', path.basename(chain.debuggerPath ?? '') || 'gdb', chain.debuggerPath),
                fileTool('Designer', 'designer', installation.designerPath),
                fileTool('Translations', 'lupdate', installation.lupdatePath),
                fileTool('QML', 'qmllint', installation.qmlLintPath),
                fileTool('Deploy', path.basename(installation.deployToolPath ?? '') || 'windeployqt', installation.deployToolPath)
            ]
        };
    }
    collectPythonState() {
        const status = this.qtPython?.status;
        if (!status)
            return { state: 'unknown', message: 'Qt for Python status is being refreshed…', tools: [] };
        return {
            state: status.state,
            message: status.message,
            interpreter: status.interpreter,
            pythonVersion: status.pythonVersion,
            pySideVersion: status.pySideVersion,
            virtualEnvironment: status.virtualEnvironment,
            tools: [
                fileTool('Interpreter', 'python', status.interpreter),
                fileTool('UI compiler', 'pyside6-uic', status.tools.uic),
                fileTool('Resources', 'pyside6-rcc', status.tools.rcc),
                fileTool('Designer', 'pyside6-designer', status.tools.designer),
                fileTool('Deploy', 'pyside6-deploy', status.tools.deploy)
            ]
        };
    }
    renderSkeleton(webview) {
        const style = (0, webviewKit_1.mediaUri)(webview, 'home.css');
        const script = (0, webviewKit_1.mediaUri)(webview, 'home.js');
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Qt Project Manager</title>
${style ? `<link rel="stylesheet" href="${style.toString()}">` : ''}
</head>
<body class="home">
<div id="app" class="home-shell" aria-live="polite"></div>
<script>window.QPM_HOME_INIT = ${(0, webviewKit_1.safeJson)(this.collectState())};</script>
${script ? `<script src="${script.toString()}"></script>` : ''}
</body>
</html>`;
        return (0, webviewKit_1.hardenHtml)(html, webview, { sharedStyles: true });
    }
}
exports.HomePanel = HomePanel;
function fileTool(role, label, executable) {
    if (!executable)
        return { role, label, path: '', status: 'missing', message: `${role}: ${label} was not found` };
    const exists = (() => { try {
        return fs.statSync(executable).isFile();
    }
    catch {
        return false;
    } })();
    if (exists)
        return { role, label, path: executable, status: 'ok', message: '' };
    // Bare names (resolved through PATH at run time) are flagged as unresolved rather than missing.
    return path.isAbsolute(executable) || /[\\/]/.test(executable)
        ? { role, label, path: executable, status: 'missing', message: `Not found: ${executable}` }
        : { role, label, path: executable, status: 'unresolved', message: `${executable} is expected on PATH` };
}
