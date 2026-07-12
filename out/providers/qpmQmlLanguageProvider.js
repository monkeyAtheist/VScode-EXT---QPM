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
exports.QpmQmlLanguageProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQmlLanguageProvider {
    service;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    serviceSubscription;
    constructor(service) {
        this.service = service;
        this.serviceSubscription = service.onDidChange(() => this.refresh());
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.serviceSubscription.dispose(); this.emitter.dispose(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const report = this.service.getReport();
        if (!report)
            return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
        const stateIcon = report.state === 'running' ? 'pass' : report.state === 'error' ? 'error' : report.state === 'conflict' ? 'warning' : report.state === 'disabled' ? 'circle-slash' : 'debug-stop';
        return [
            item(report.project, `${report.qmlFiles} QML file(s) · Qt ${report.qtVersion || 'not resolved'}`, 'symbol-class'),
            item('Language server', report.executable || 'qmlls not found', report.executable ? 'server-process' : 'warning'),
            item('State', report.state, stateIcon),
            item('Build directories', report.buildDirectories.length ? `${report.buildDirectories.length} configured` : 'None', report.buildDirectories.length ? 'folder-library' : 'warning'),
            item('Import paths', report.importPaths.length ? `${report.importPaths.length} configured` : 'None', report.importPaths.length ? 'references' : 'warning'),
            item('Official Qt QML extension', report.officialExtensionInstalled ? 'Installed — duplicate protection applies' : 'Not installed', report.officialExtensionInstalled ? 'shield' : 'info'),
            ...(report.lastError ? [item('Last error', report.lastError, 'error')] : []),
            commandItem('Start QML Language Server', 'Start qmlls for the active project', 'qpm.startQmlLanguageServer', 'play'),
            commandItem('Restart QML Language Server', 'Restart qmlls and refresh build/import paths', 'qpm.restartQmlLanguageServer', 'refresh'),
            commandItem('Stop QML Language Server', 'Stop the QPM-managed qmlls process', 'qpm.stopQmlLanguageServer', 'debug-stop'),
            commandItem('Refresh build directories', 'Publish current build directories through $/addBuildDirs', 'qpm.refreshQmlLanguageServer', 'sync'),
            commandItem('Generate .qmlls.ini', report.configurationFile, 'qpm.generateQmllsConfiguration', 'settings-gear'),
            commandItem('Open .qmlls.ini', report.configurationFile, 'qpm.openQmllsConfiguration', 'go-to-file'),
            commandItem('Generate qmldir', 'Create module metadata from project QML files', 'qpm.generateQmldir', 'symbol-module'),
            commandItem('Open QML language report', report.projectRoot, 'qpm.openQmlLanguageReport', 'report'),
            commandItem('Show qmlls output', 'Open the QPM QML Language Server output channel', 'qpm.showQmlLanguageOutput', 'output'),
            commandItem('Show LSP trace', 'Open protocol trace output', 'qpm.showQmlLanguageTrace', 'list-tree')
        ];
    }
}
exports.QpmQmlLanguageProvider = QpmQmlLanguageProvider;
function item(label, description, icon) {
    const result = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    result.description = description;
    result.tooltip = `${label}\n${description}`;
    result.iconPath = new vscode.ThemeIcon(icon);
    return result;
}
function commandItem(label, description, command, icon) {
    const result = item(label, description, icon);
    result.command = { command, title: label };
    return result;
}
