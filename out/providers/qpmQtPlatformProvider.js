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
exports.QpmQtPlatformProvider = void 0;
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtPlatformProvider {
    workspaces;
    platforms;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, platforms) {
        this.workspaces = workspaces;
        this.platforms = platforms;
        this.disposables.push(workspaces.onDidChange(() => this.refresh()));
        this.disposables.push(platforms.onDidChange(() => this.refresh()));
    }
    attachView(view) { this.view = view; this.updateDescription(); }
    refresh() { this.updateDescription(); this.emitter.fire(); }
    dispose() { for (const disposable of this.disposables)
        disposable.dispose(); this.emitter.dispose(); }
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
            return [{ id: 'none', label: 'No native Qt project', description: 'Open or create a project', icon: 'info', command: 'qpm.openWorkspace' }];
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
            const capabilities = this.platforms.detectCapabilities(profile);
            const result = [
                { id: 'active', label: 'Active platform', description: profile.name, icon: iconFor(profile.type), command: 'qpm.selectQtPlatform', tooltip: `${profile.type} · ${profile.buildLocation}` },
                { id: 'status', label: 'Platform status', description: capabilities.summary, icon: capabilities.ready ? 'pass' : 'warning', command: 'qpm.openPlatformReport' },
                { id: 'build', label: 'Build for active platform', description: profile.buildLocation, icon: 'tools', command: 'qpm.buildForPlatform' },
                { id: 'deploy', label: 'Deploy to active platform', description: profile.type, icon: 'cloud-upload', command: 'qpm.deployToPlatform' },
                { id: 'run', label: 'Run on active platform', description: profile.type, icon: 'play', command: 'qpm.runOnPlatform' },
                { id: 'all', label: 'Build, deploy and run', description: 'Complete platform workflow', icon: 'rocket', command: 'qpm.buildDeployRunPlatform' },
                { id: 'ssh-manager', label: 'OpenSSH Device Manager', description: 'Manage OpenSSH aliases, keys and nearby devices', icon: 'remote', command: 'qpm.openSshDeviceManager' },
                { id: 'manage', label: 'Manage platform profiles', description: `${manifest.profiles.platforms.length} profile(s)`, icon: 'settings-gear', command: 'qpm.manageQtPlatforms' },
                { id: 'report', label: 'Open platform report', description: 'Tools and readiness', icon: 'pulse', command: 'qpm.openPlatformReport' }
            ];
            if (profile.type === 'remote-linux')
                result.splice(6, 0, { id: 'ssh', label: 'Open remote terminal', description: profile.sshHost || 'SSH not configured', icon: 'terminal', command: 'qpm.openRemoteTerminal' });
            if (profile.type === 'docker')
                result.splice(6, 0, { id: 'docker-shell', label: 'Open Docker shell', description: profile.dockerImage || 'Image not configured', icon: 'terminal', command: 'qpm.openDockerShell' });
            if (profile.type === 'android') {
                result.splice(6, 0, { id: 'android', label: 'Open Android devices', description: profile.androidDeviceSerial || profile.androidAvdName || 'No device selected', icon: 'device-mobile', command: 'qpm.android.focus' });
                result.splice(7, 0, { id: 'android-configure', label: 'Configure Android environment', description: `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidAbis.join(', ')}`, icon: 'settings-gear', command: 'qpm.configureAndroidEnvironment' });
            }
            if (profile.type === 'webassembly') {
                result.splice(6, 0, { id: 'wasm', label: 'Serve WebAssembly target', description: this.platforms.activeServerDescription || `Port ${profile.wasmServerPort}`, icon: 'globe', command: 'qpm.serveWebAssembly' });
                if (this.platforms.activeServerDescription)
                    result.splice(7, 0, { id: 'wasm-stop', label: 'Stop WebAssembly server', description: this.platforms.activeServerDescription, icon: 'debug-stop', command: 'qpm.stopWebAssemblyServer' });
            }
            return result;
        }
        catch (error) {
            return [{ id: 'invalid', label: 'Invalid platform configuration', description: error instanceof Error ? error.message : String(error), icon: 'error', command: 'qpm.editBuildSettings' }];
        }
    }
    updateDescription() {
        if (!this.view)
            return;
        const profile = this.platforms.activeProfile;
        this.view.description = profile ? `${profile.name} · ${profile.type}` : 'No project';
    }
}
exports.QpmQtPlatformProvider = QpmQtPlatformProvider;
function iconFor(type) { return type === 'android' ? 'device-mobile' : type === 'remote-linux' ? 'remote' : type === 'docker' ? 'package' : type === 'webassembly' ? 'globe' : type === 'linux-local' ? 'terminal-linux' : 'device-desktop'; }
