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
exports.QpmQtInstallerProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtInstallerProvider {
    installers;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    constructor(installers) {
        this.installers = installers;
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.emitter.dispose(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const report = this.installers.getReport();
        if (!report)
            return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
        const blocking = report.issues.filter((entry) => entry.severity === 'error').length;
        const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
        const backendLabel = report.backend === 'qt-ifw' ? 'Qt Installer Framework' : report.backend === 'inno-setup' ? 'Inno Setup' : 'NSIS';
        const selectedTool = report.backend === 'qt-ifw' ? report.tools.binaryCreator : report.backend === 'inno-setup' ? report.tools.iscc : report.tools.makensis;
        return [
            item(report.identity.productName, `Version ${report.identity.version}`, 'package'),
            item('Installer backend', backendLabel, 'tools'),
            item('Compiler', selectedTool || 'Not found', selectedTool ? 'pass' : 'warning'),
            item('Signing', report.tools.signTool ? 'SignTool detected' : 'SignTool not found', report.tools.signTool ? 'verified-filled' : 'shield'),
            item('Readiness', blocking ? `${blocking} blocking error(s)` : warnings ? `${warnings} warning(s)` : 'Ready', blocking ? 'error' : warnings ? 'warning' : 'pass'),
            commandItem('Create desktop installer', report.installerPath, 'qpm.createDesktopInstaller', 'package'),
            commandItem('Generate installer sources', report.generated.root, 'qpm.generateInstallerProject', 'files'),
            commandItem('Create Qt IFW update repository', report.repositoryPath, 'qpm.createQtIfwRepository', 'cloud-upload'),
            commandItem('Sign distribution artifacts', 'Sign target and latest installer according to project settings', 'qpm.signDistributionArtifacts', 'verified'),
            commandItem('Verify signatures', 'Validate Authenticode signatures with Windows policy', 'qpm.verifyDistributionSignatures', 'shield'),
            commandItem('Detect installer tools', 'Search Qt IFW, Inno Setup, NSIS and Windows SDK tools', 'qpm.detectInstallerTools', 'search'),
            commandItem('Open installer report', report.outputRoot, 'qpm.openInstallerReport', 'report'),
            commandItem('Reveal installer output', report.outputRoot, 'qpm.revealInstallerOutput', 'folder-opened'),
            commandItem('Clean installer output', 'Remove generated scripts, repositories and installers', 'qpm.cleanInstallerOutput', 'trash')
        ];
    }
}
exports.QpmQtInstallerProvider = QpmQtInstallerProvider;
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
