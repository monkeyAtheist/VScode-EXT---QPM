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
exports.QpmQtDebugProvider = void 0;
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtDebugProvider {
    workspaces;
    debugging;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, debugging) {
        this.workspaces = workspaces;
        this.debugging = debugging;
        this.disposables.push(workspaces.onDidChange(() => this.refresh()));
        this.disposables.push(debugging.onDidChange(() => this.refresh()));
    }
    attachView(view) {
        this.view = view;
        this.updateDescription();
    }
    refresh() {
        this.updateDescription();
        this.emitter.fire();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.tooltip = element.tooltip ?? element.description;
        item.iconPath = new vscode.ThemeIcon(element.icon);
        if (element.command)
            item.command = { command: element.command, title: element.label };
        return item;
    }
    getChildren() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            return [{ id: 'no-project', label: 'No native Qt project', description: 'Open or create a project', icon: 'info', command: 'qpm.openWorkspace' }];
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            const profile = (0, qtProjectManifest_1.getActiveQtDebugProfile)(manifest);
            const qml = profile.qmlDebug || profile.request === 'qml-attach';
            return [
                { id: 'active', label: 'Active debug profile', description: profile.name, icon: 'debug-alt', command: 'qpm.manageQtDebugProfiles', tooltip: `${profile.request} · ${profile.debuggerType}` },
                { id: 'start', label: 'Build and start active profile', description: profile.request, icon: 'debug-start', command: 'qpm.startQtDebugProfile' },
                { id: 'start-no-build', label: 'Start without build', description: 'Use existing target', icon: 'play', command: 'qpm.startQtDebugProfileWithoutBuild' },
                { id: 'attach', label: 'Attach to local process', description: 'Pick a running process', icon: 'plug', command: 'qpm.attachQtProcess' },
                { id: 'core', label: 'Open core or dump file', description: 'GDB, LLDB or Visual Studio dump', icon: 'file-binary', command: 'qpm.debugQtCoreDump' },
                { id: 'qml', label: 'Attach QML debugger', description: qml ? `${profile.qmlHost}:${profile.qmlPort}` : 'Use active profile settings', icon: 'symbol-event', command: 'qpm.attachQmlDebugger' },
                { id: 'profiles', label: 'Manage debug profiles', description: `${manifest.profiles.debugs.length} profile(s)`, icon: 'settings-gear', command: 'qpm.manageQtDebugProfiles' },
                { id: 'launch-json', label: 'Generate launch.json', description: 'Export all QPM debug profiles', icon: 'json', command: 'qpm.generateQtLaunchJson' }
            ];
        }
        catch (error) {
            return [{ id: 'invalid', label: 'Invalid Qt debug configuration', description: error instanceof Error ? error.message : String(error), icon: 'error', command: 'qpm.editBuildSettings' }];
        }
    }
    dispose() {
        this.emitter.dispose();
        for (const disposable of this.disposables)
            disposable.dispose();
    }
    updateDescription() {
        if (!this.view)
            return;
        const profile = this.debugging.activeProfile;
        this.view.description = profile ? `${profile.name} · ${profile.request}` : 'No project';
    }
}
exports.QpmQtDebugProvider = QpmQtDebugProvider;
