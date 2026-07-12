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
exports.QpmQtPublicationProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtPublicationProvider {
    publication;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposable;
    view;
    constructor(publication) {
        this.publication = publication;
        this.disposable = publication.onDidChange(() => this.refresh());
    }
    attachView(view) { this.view = view; this.updateDescription(); }
    refresh() { this.updateDescription(); this.emitter.fire(); }
    dispose() { this.disposable.dispose(); this.emitter.dispose(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const report = this.publication.getReport();
        if (!report)
            return [commandItem('No native Qt project', 'Open or create a project', 'qpm.openWorkspace', 'info')];
        const errors = report.issues.filter((entry) => entry.severity === 'error').length;
        const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
        const toolCount = Object.values(report.tools).filter(Boolean).length;
        const items = [
            item(report.productName, `${report.version} · ${report.channel}`, 'package'),
            item('State', !report.enabled ? 'disabled' : errors ? `${errors} blocking issue(s)` : warnings ? `${warnings} warning(s)` : 'ready', errors ? 'error' : warnings ? 'warning' : 'pass'),
            item('Release output', report.paths.releaseRoot, 'folder'),
            item('Publication tools', `${toolCount} detected`, toolCount ? 'tools' : 'warning'),
            item('MSIX / App Installer', report.msixEnabled ? report.paths.msixPackage : 'disabled', report.msixEnabled && report.tools.makeAppx ? 'package' : 'info'),
            item('WinGet manifests', report.wingetEnabled ? report.paths.wingetRoot : 'disabled', report.wingetEnabled && report.tools.winget ? 'cloud-download' : 'info'),
            item('Publish target', report.publishTarget === 'none' ? 'not configured' : report.publishTarget, 'cloud-upload'),
            commandItem('Detect publication tools', 'MakeAppx, SignTool, WinGet, GitHub CLI, SSH tools', 'qpm.detectPublicationTools', 'search'),
            commandItem('Generate publication sources', 'MSIX manifest, App Installer, WinGet and release metadata', 'qpm.generatePublicationSources', 'files'),
            commandItem('Create MSIX package', 'Package the deployed Qt application with MakeAppx', 'qpm.createMsixPackage', 'package'),
            commandItem('Generate App Installer file', 'Configure self-hosted MSIX updates', 'qpm.generateAppInstaller', 'cloud-download'),
            commandItem('Generate WinGet manifests', 'Version, installer and locale manifests', 'qpm.generateWingetManifests', 'list-tree'),
            commandItem('Validate WinGet manifests', 'Use winget validate when available', 'qpm.validateWingetManifests', 'check-all'),
            commandItem('Create release bundle', 'Collect artifacts, checksums and update metadata', 'qpm.createReleaseBundle', 'archive'),
            commandItem('Publish release', 'Local directory, SSH server or GitHub Release', 'qpm.publishRelease', 'cloud-upload'),
            commandItem('Open publication report', 'Configuration, tools, issues and generated paths', 'qpm.openPublicationReport', 'report'),
            commandItem('Reveal publication output', this.publication.latestArtifactPath || report.outputRoot, 'qpm.revealPublicationOutput', 'folder-opened'),
            commandItem('Clean publication output', 'Remove generated publication files and release bundles', 'qpm.cleanPublicationOutput', 'trash')
        ];
        return items;
    }
    updateDescription() {
        if (!this.view)
            return;
        const report = this.publication.getReport();
        this.view.description = report ? `${report.version} · ${report.channel}` : 'No project';
    }
}
exports.QpmQtPublicationProvider = QpmQtPublicationProvider;
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
