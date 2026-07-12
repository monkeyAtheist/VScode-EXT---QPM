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
exports.QpmQtAppleProvider = void 0;
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtAppleService_1 = require("../services/qpmQtAppleService");
class QpmQtAppleProvider {
    workspaces;
    apple;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, apple) {
        this.workspaces = workspaces;
        this.apple = apple;
        this.disposables.push(workspaces.onDidChange(() => this.refresh()));
        this.disposables.push(apple.onDidChange(() => this.refresh()));
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
            if (!(0, qpmQtAppleService_1.isApplePlatform)(profile.type)) {
                return [
                    commandItem('Apple platform is not active', 'Select or create a macOS or iOS platform profile', 'qpm.manageQtPlatforms', 'device-desktop'),
                    commandItem('Configure Apple environment', 'Xcode, signing, notarization and simulator settings', 'qpm.configureAppleEnvironment', 'settings-gear')
                ];
            }
            const report = this.apple.detectEnvironment(profile);
            const selectedSimulator = report.simulators.find((entry) => entry.udid === profile.appleSimulatorId) ?? report.simulators.find((entry) => entry.state === 'Booted');
            const items = [
                item('Environment', report.summary, report.ready ? 'pass' : 'warning'),
                item('Platform', (0, qpmQtAppleService_1.applePlatformLabel)(profile.type), profile.type === 'macos' ? 'device-desktop' : 'device-mobile'),
                item('Xcode', report.xcodeVersion || 'not available', report.xcodeVersion ? 'tools' : 'warning'),
                item('Qt kit', report.qtRoot || 'not configured', report.qtRoot ? 'versions' : 'warning'),
                item('Bundle identifier', profile.appleBundleIdentifier || manifest.packaging.identifier || `org.qtproject.example.${manifest.targetName}`, 'symbol-namespace'),
                item('Signing', profile.appleCodeSignIdentity || (profile.appleAutomaticSigning ? 'Automatic / ad-hoc' : 'Not configured'), profile.appleCodeSignIdentity || profile.appleAutomaticSigning ? 'verified' : 'warning')
            ];
            if (profile.type === 'ios-simulator')
                items.push(item('Simulator', selectedSimulator ? `${selectedSimulator.name} · ${selectedSimulator.state}` : 'No simulator selected', selectedSimulator ? 'device-mobile' : 'warning'));
            if (profile.type === 'ios-device')
                items.push(item('Device', profile.appleDeviceId || 'No physical device configured', profile.appleDeviceId ? 'device-mobile' : 'warning'));
            items.push(commandItem('Configure Apple environment', 'Xcode, bundle identity, signing and notarization', 'qpm.configureAppleEnvironment', 'settings-gear'), commandItem('Refresh Apple devices', `${report.simulators.length} iOS simulator(s)`, 'qpm.refreshAppleDevices', 'refresh'), commandItem('Build Apple target', (0, qpmQtAppleService_1.applePlatformLabel)(profile.type), 'qpm.buildAppleTarget', 'tools'));
            if (profile.type === 'macos') {
                items.push(commandItem('Deploy macOS application', 'Run macdeployqt without creating a disk image', 'qpm.deployMacApplication', 'package'), commandItem('Create macOS DMG', `${profile.appleDmgFileSystem} disk image`, 'qpm.createMacDmg', 'archive'), commandItem('Sign Apple artifacts', profile.appleCodeSignIdentity || 'Configure a Developer ID identity', 'qpm.signAppleArtifacts', 'verified-filled'), commandItem('Verify Apple signatures', 'codesign and Gatekeeper assessment', 'qpm.verifyAppleSignatures', 'shield'), commandItem('Notarize Apple artifact', profile.appleNotaryProfile || 'Configure a notarytool keychain profile', 'qpm.notarizeAppleArtifact', 'cloud-upload'), commandItem('Staple notarization ticket', 'Attach the accepted ticket to an app, DMG or PKG', 'qpm.stapleAppleArtifact', 'pin'));
            }
            else if (profile.type === 'ios-simulator') {
                items.push(commandItem('Select iOS simulator', selectedSimulator?.name || 'Choose an available simulator', 'qpm.selectAppleSimulator', 'list-selection'), commandItem('Boot iOS simulator', selectedSimulator?.name || 'Automatic selection', 'qpm.bootAppleSimulator', 'vm-running'), commandItem('Build, install and run', 'Complete iOS Simulator workflow', 'qpm.installRunIosSimulator', 'rocket'));
            }
            items.push(commandItem('Open Apple environment report', 'Tools, simulators, signing and diagnostics', 'qpm.openAppleReport', 'report'), commandItem('Reveal latest Apple output', this.apple.latestArtifactPath || 'Open Apple build directory', 'qpm.revealAppleOutput', 'folder-opened'), commandItem('Clean Apple output', 'Remove generated Xcode projects and Apple build output', 'qpm.cleanAppleOutput', 'trash'));
            return items;
        }
        catch (error) {
            return [item('Invalid Apple configuration', error instanceof Error ? error.message : String(error), 'error')];
        }
    }
    updateDescription() {
        if (!this.view)
            return;
        const profile = this.apple.activeProfile;
        this.view.description = profile && (0, qpmQtAppleService_1.isApplePlatform)(profile.type) ? (0, qpmQtAppleService_1.applePlatformLabel)(profile.type) : 'No Apple project';
    }
}
exports.QpmQtAppleProvider = QpmQtAppleProvider;
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
