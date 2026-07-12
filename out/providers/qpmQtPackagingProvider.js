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
exports.QpmQtPackagingProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtPackagingProvider {
    packaging;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    constructor(packaging) {
        this.packaging = packaging;
    }
    refresh() { this.emitter.fire(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const report = this.packaging.getReport();
        if (!report)
            return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
        const blocking = report.issues.filter((entry) => entry.severity === 'error').length;
        const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
        return [
            item(report.identity.productName, `Version ${report.identity.version}`, 'package'),
            item('Package format', report.archivePath ? report.archivePath.endsWith('.zip') ? 'ZIP archive' : 'tar.gz archive' : 'Folder', 'file-zip'),
            item('Target platform', `${report.identity.platform} · ${report.identity.architecture} · ${report.identity.configuration}`, 'device-desktop'),
            item('Readiness', blocking ? `${blocking} blocking error(s)` : warnings ? `${warnings} warning(s)` : 'Ready', blocking ? 'error' : warnings ? 'warning' : 'pass'),
            commandItem('Create portable package', 'Build, stage runtime files and create the selected archive', 'qpm.createPortablePackage', 'package'),
            commandItem('Generate product metadata', 'Generate Windows manifest/resource and Linux desktop entry', 'qpm.generateProductMetadata', 'symbol-property'),
            commandItem('Open packaging report', report.stageDirectory, 'qpm.openPackagingReport', 'report'),
            commandItem('Reveal packaging output', report.outputRoot, 'qpm.revealPackagingOutput', 'folder-opened'),
            commandItem('Clean packaging output', 'Remove generated distribution folders and archives', 'qpm.cleanPackagingOutput', 'trash')
        ];
    }
}
exports.QpmQtPackagingProvider = QpmQtPackagingProvider;
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
