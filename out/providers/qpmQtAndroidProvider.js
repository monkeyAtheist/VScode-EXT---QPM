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
exports.QpmQtAndroidProvider = void 0;
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtAndroidProvider {
    workspaces;
    android;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, android) {
        this.workspaces = workspaces;
        this.android = android;
        this.disposables.push(workspaces.onDidChange(() => this.refresh()));
        this.disposables.push(android.onDidChange(() => this.refresh()));
    }
    attachView(view) { this.view = view; this.updateDescription(); }
    refresh() { this.updateDescription(); this.emitter.fire(); }
    dispose() { for (const disposable of this.disposables)
        disposable.dispose(); this.emitter.dispose(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return [commandItem('No native Qt project', 'Open or create a project', 'qpm.openWorkspace', 'info')];
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            const profile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
            if (profile.type !== 'android') {
                return [
                    commandItem('Android platform is not active', 'Select or create an Android platform profile', 'qpm.manageQtPlatforms', 'device-mobile'),
                    commandItem('Manage Android environment', 'SDK, NDK, JDK and Qt Android kit', 'qpm.configureAndroidEnvironment', 'settings-gear')
                ];
            }
            const report = this.android.detectEnvironment(profile);
            const device = report.devices.find((entry) => entry.serial === profile.androidDeviceSerial) ?? report.devices.find((entry) => entry.state === 'device');
            const result = [
                item('Environment', report.summary, report.ready ? 'pass' : 'warning'),
                item('Qt Android kit', report.qtRoot || 'not configured', 'versions'),
                item('SDK / NDK / JDK', report.sdkRoot && report.ndkRoot && report.jdkRoot ? 'Configured' : 'Incomplete', report.ready ? 'tools' : 'warning'),
                item('Package', `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidBuildAllAbis ? 'all ABIs' : profile.androidAbis.join(', ')}`, 'package'),
                item('Device', device ? `${device.description} · ${device.serial}` : 'No connected device selected', device ? 'device-mobile' : 'warning'),
                commandItem('Configure Android environment', 'SDK, NDK, JDK, ABI, device and AVD', 'qpm.configureAndroidEnvironment', 'settings-gear'),
                commandItem('Refresh Android devices', `${report.devices.length} device(s), ${report.avds.length} AVD(s)`, 'qpm.refreshAndroidDevices', 'refresh'),
                commandItem('Start Android emulator', profile.androidAvdName || 'Select an AVD', 'qpm.startAndroidAvd', 'vm-running'),
                commandItem('Build APK', 'Build an installable Android package', 'qpm.buildAndroidApk', 'package'),
                commandItem('Build AAB', 'Build a Google Play Android App Bundle', 'qpm.buildAndroidAab', 'archive'),
                commandItem('Build AAR', 'Build a reusable Android Archive', 'qpm.buildAndroidAar', 'library'),
                commandItem('Install APK', profile.androidDeviceSerial || 'Automatic device selection', 'qpm.installAndroidPackage', 'cloud-download'),
                commandItem('Build, install and run', 'Complete Android device workflow', 'qpm.buildInstallRunAndroid', 'rocket'),
                commandItem('Run Android application', profile.androidPackageName || `org.qtproject.example.${manifest.targetName}`, 'qpm.runAndroidApplication', 'play'),
                commandItem('Uninstall Android application', 'Remove package from selected device', 'qpm.uninstallAndroidApplication', 'trash'),
                commandItem('Prepare wait-for-debugger launch', 'Start the app and wait for an Android debugger', 'qpm.prepareAndroidDebug', 'debug-alt'),
                commandItem(this.android.activeLogcatDescription ? 'Stop logcat' : 'Start logcat', this.android.activeLogcatDescription || profile.androidLogcatFilter, this.android.activeLogcatDescription ? 'qpm.stopAndroidLogcat' : 'qpm.startAndroidLogcat', this.android.activeLogcatDescription ? 'debug-stop' : 'output'),
                commandItem('Open Android environment report', 'Prerequisites, tools, devices and SDK packages', 'qpm.openAndroidReport', 'report'),
                commandItem('Reveal latest Android package', this.android.latestPackagePath || 'Open Android build output', 'qpm.revealAndroidPackage', 'folder-opened')
            ];
            return result;
        }
        catch (error) {
            return [item('Invalid Android configuration', error instanceof Error ? error.message : String(error), 'error')];
        }
    }
    updateDescription() {
        if (!this.view)
            return;
        const profile = this.android.activeProfile;
        this.view.description = profile ? `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidBuildAllAbis ? 'all ABIs' : profile.androidAbis.join(', ')}` : 'No Android project';
    }
}
exports.QpmQtAndroidProvider = QpmQtAndroidProvider;
function item(label, description, icon) {
    const result = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    result.description = description;
    result.iconPath = new vscode.ThemeIcon(icon);
    result.tooltip = `${label}\n${description}`;
    return result;
}
function commandItem(label, description, command, icon) {
    const result = item(label, description, icon);
    result.command = { command, title: label };
    return result;
}
