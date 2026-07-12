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
exports.QuickActionsView = void 0;
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
/**
 * Native summary view used instead of a WebviewView.
 *
 * A contributed WebviewView starts a Chromium service worker as soon as the
 * side bar is restored. On affected VS Code installations, a stale Chromium
 * state can make every webview fail with InvalidStateError. A native tree view
 * avoids that failure path during extension activation while preserving the
 * useful project summary.
 */
class QuickActionsView {
    workspaces;
    builds;
    projectSettings;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    constructor(workspaces, builds, projectSettings) {
        this.workspaces = workspaces;
        this.builds = builds;
        this.projectSettings = projectSettings;
        this.disposables.push(this.workspaces.onDidChange(() => this.update()));
    }
    update() {
        this.emitter.fire();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.description = element.description;
        item.tooltip = element.tooltip ?? [element.label, element.description].filter(Boolean).join(' — ');
        item.contextValue = element.contextValue ?? 'qpmQuickActionSummary';
        if (element.icon) {
            item.iconPath = new vscode.ThemeIcon(element.icon);
        }
        item.command = element.command;
        return item;
    }
    getChildren() {
        const workspace = this.workspaces.currentWorkspace;
        const ref = this.workspaces.activeProjectRef;
        if (!workspace) {
            return [
                info('No workspace loaded', 'Open or create a Qt workspace to display the active target summary.', 'info'),
                action('Open workspace or project…', 'qpm.openWorkspace', 'folder-opened'),
                action('Create native Qt project…', 'qpm.createQtProject', 'new-folder'),
                action('Create workspace and native Qt project…', 'qpm.createWorkspaceProject', 'root-folder')
            ];
        }
        if (!ref?.exists) {
            return [
                info('No active project', 'Select an existing project in the workspace tree.', 'info'),
                action('Open workspace or project…', 'qpm.openWorkspace', 'folder-opened')
            ];
        }
        const summary = this.createSummary();
        if (!summary) {
            return [];
        }
        return [
            info(summary.projectName, `${summary.workspaceName} · ${summary.projectCount} project${summary.projectCount === 1 ? '' : 's'}`, 'project'),
            info('Target type', summary.targetType, 'symbol-enum'),
            info('Build mode', modeDescription(summary.buildMode), 'settings-gear'),
            ...(summary.platform ? [info('Platform', summary.platform, 'remote')] : []),
            info('Command line', summary.commandLine, 'terminal'),
            info('Working directory', summary.workingDirectory, 'folder'),
            info('Environment', summary.environment, 'symbol-key'),
            info('Build steps', summary.buildSteps, 'list-ordered'),
            info('Dependencies', summary.dependencies, 'references'),
            info('Project files', summary.files, summary.hasMissingFiles ? 'warning' : 'pass'),
            action((0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? 'Open Qt project settings…' : 'Open compatibility build settings…', 'qpm.editBuildSettings', 'settings-gear'),
            ...((0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? [
                action('Select Qt installation…', 'qpm.selectQtInstallation', 'versions'),
                action('Edit Qt modules…', 'qpm.editQtModules', 'library'),
                action('Manage platforms…', 'qpm.manageQtPlatforms', 'remote'),
                action('Build, deploy and run on platform', 'qpm.buildDeployRunPlatform', 'rocket')
            ] : []),
            action('Open settings in safe mode…', 'qpm.editBuildSettingsSafeMode', 'shield'),
            action('Enable automatic suggestions', 'qpm.enableAutomaticSuggestions', 'sparkle'),
            action('Build & Debug', 'qpm.debugInQpm', 'debug-alt-small'),
            action('Build & Run', 'qpm.run', 'play'),
            action('Run without build', 'qpm.runWithoutBuild', 'run')
        ];
    }
    dispose() {
        this.emitter.dispose();
        for (const disposable of this.disposables)
            disposable.dispose();
    }
    createSummary() {
        const workspace = this.workspaces.currentWorkspace;
        const ref = this.workspaces.activeProjectRef;
        if (!workspace || !ref?.exists) {
            return undefined;
        }
        const project = this.workspaces.getProject(ref);
        const settings = this.projectSettings.getSettings(ref);
        const actionCounts = [settings.preBuildActions.length, settings.customBuildActions.length, settings.postBuildActions.length];
        const actionTotal = actionCounts.reduce((sum, count) => sum + count, 0);
        const missingFiles = project?.files.filter((file) => !file.exists).length ?? 0;
        const totalFiles = project?.files.length ?? 0;
        let platform;
        if ((0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            try {
                const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath));
                platform = `${profile.name} · ${platformDescription(profile.type)}`;
            }
            catch {
                platform = 'Unavailable';
            }
        }
        return {
            workspaceName: workspace.name,
            projectCount: workspace.projects.length,
            projectName: ref.name,
            projectPath: ref.absolutePath,
            buildMode: this.builds.buildMode,
            targetType: project?.targetType || 'Unknown',
            commandLine: configuredLabel(settings.run.arguments),
            workingDirectory: configuredLabel(settings.run.workingDirectory),
            environment: configuredLabel(settings.run.environmentOptions),
            buildSteps: actionTotal === 0 ? 'Empty' : `Pre ${actionCounts[0]} · Custom ${actionCounts[1]} · Post ${actionCounts[2]}`,
            dependencies: settings.dependencies.length === 0 ? 'None' : String(settings.dependencies.length),
            files: missingFiles === 0 ? `${totalFiles} · no missing file` : `${totalFiles} · ${missingFiles} missing`,
            hasMissingFiles: missingFiles > 0,
            platform
        };
    }
}
exports.QuickActionsView = QuickActionsView;
function info(label, description, icon) {
    return { label, description, icon };
}
function action(label, command, icon) {
    return { label, icon, contextValue: 'qpmQuickActionCommand', command: { command, title: label } };
}
function configuredLabel(value) { return value.trim() ? 'Configured' : 'Empty'; }
function modeDescription(mode) {
    switch (mode) {
        case 'release': return 'Release x86';
        case 'debug64': return 'Debug x64';
        case 'release64': return 'Release x64';
        default: return 'Debug x86';
    }
}
function platformDescription(type) {
    switch (type) {
        case 'linux-local': return 'Linux local';
        case 'remote-linux': return 'Remote Linux';
        case 'docker': return 'Docker';
        case 'webassembly': return 'WebAssembly';
        default: return 'Desktop';
    }
}
