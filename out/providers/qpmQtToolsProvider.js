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
exports.QpmQtToolsProvider = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmQtToolsProvider {
    workspaces;
    installations;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, installations) {
        this.workspaces = workspaces;
        this.installations = installations;
        this.disposables.push(this.workspaces.onDidChange(() => this.refresh()));
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
        if (element.kind === 'category') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
            item.id = element.id;
            item.iconPath = new vscode.ThemeIcon(element.icon);
            item.contextValue = 'qpmQtTools.category';
            return item;
        }
        if (element.kind === 'status') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
            item.description = element.description;
            item.iconPath = new vscode.ThemeIcon(element.available ? 'pass-filled' : 'warning');
            item.contextValue = element.available ? 'qpmQtTools.status.available' : 'qpmQtTools.status.missing';
            return item;
        }
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.iconPath = new vscode.ThemeIcon(element.icon);
        item.contextValue = 'qpmQtTools.action';
        item.command = { command: element.command, title: element.label };
        return item;
    }
    getChildren(element) {
        if (!element) {
            return [
                { kind: 'category', id: 'translations', label: 'Translations', icon: 'globe' },
                { kind: 'category', id: 'resources', label: 'Resources', icon: 'package' },
                { kind: 'category', id: 'qml', label: 'QML', icon: 'symbol-color' },
                { kind: 'category', id: 'documentation', label: 'Documentation', icon: 'book' }
            ];
        }
        if (element.kind !== 'category')
            return [];
        switch (element.id) {
            case 'translations': return this.translationChildren();
            case 'resources': return [
                action('qrc-editor', 'Open Qt Resource Editor', 'Edit prefixes, aliases and files', 'edit', 'qpm.openQrcEditor'),
                action('qrc-validate', 'Validate resource collection', 'Check files and runtime paths', 'check-all', 'qpm.validateQrc')
            ];
            case 'qml': return this.qmlChildren();
            case 'documentation': return [
                action('docs-symbol', 'Search selected Qt symbol', undefined, 'search', 'qpm.openQtDocumentation'),
                action('docs-home', 'Open Qt documentation', undefined, 'book', 'qpm.openQtDocumentationHome')
            ];
            default: return [];
        }
    }
    dispose() {
        while (this.disposables.length > 0)
            this.disposables.pop()?.dispose();
        this.emitter.dispose();
    }
    translationChildren() {
        const installation = this.activeInstallation();
        return [
            status('linguist-status', 'Qt Linguist tools', installation?.linguistPath && installation.lupdatePath && installation.lreleasePath ? 'available' : 'incomplete', !!(installation?.linguistPath && installation.lupdatePath && installation.lreleasePath)),
            action('translation-create', 'Create translation', undefined, 'new-file', 'qpm.createTranslation'),
            action('translation-update', 'Update translations', 'Run lupdate', 'sync', 'qpm.updateTranslations'),
            action('translation-release', 'Release translations', 'Generate .qm catalogs', 'package', 'qpm.releaseTranslations'),
            action('translation-open', 'Open in Qt Linguist', undefined, 'go-to-file', 'qpm.openTranslationInLinguist'),
            action('translation-status', 'Translation status', undefined, 'graph', 'qpm.showTranslationStatus')
        ];
    }
    qmlChildren() {
        const installation = this.activeInstallation();
        return [
            status('qml-status', 'QML tools', installation?.qmlLintPath && installation.qmlFormatPath ? 'available' : 'incomplete', !!(installation?.qmlLintPath && installation.qmlFormatPath)),
            action('qml-lint-file', 'Lint current QML file', undefined, 'check', 'qpm.qmlLintFile'),
            action('qml-lint-project', 'Lint all project QML', undefined, 'check-all', 'qpm.qmlLintProject'),
            action('qml-format-file', 'Format current QML file', undefined, 'symbol-keyword', 'qpm.qmlFormatFile'),
            action('qml-format-project', 'Format all project QML', undefined, 'files', 'qpm.qmlFormatProject'),
            action('qml-preview', 'Preview current QML file', installation?.qmlRuntimePath || installation?.qmlScenePath ? path.basename(installation.qmlRuntimePath ?? installation.qmlScenePath ?? '') : 'runtime not found', 'preview', 'qpm.qmlPreviewFile'),
            action('qml-clear', 'Clear QML diagnostics', undefined, 'clear-all', 'qpm.clearQmlDiagnostics')
        ];
    }
    activeInstallation() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return this.installations.getActive();
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            return this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
        }
        catch {
            return this.installations.getActive();
        }
    }
    updateDescription() {
        if (!this.view)
            return;
        const ref = this.workspaces.activeProjectRef;
        this.view.description = ref?.exists ? ref.name : 'No project';
    }
}
exports.QpmQtToolsProvider = QpmQtToolsProvider;
function action(id, label, description, icon, command) {
    return { kind: 'action', id, label, description, icon, command };
}
function status(id, label, description, available) {
    return { kind: 'status', id, label, description, available };
}
