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
exports.QpmQtQualityProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtQualityProvider {
    workspaces;
    testing;
    quality;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    disposables = [];
    view;
    constructor(workspaces, testing, quality) {
        this.workspaces = workspaces;
        this.testing = testing;
        this.quality = quality;
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
            item.contextValue = 'qpmQtQuality.category';
            return item;
        }
        if (element.kind === 'status') {
            const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
            item.description = element.description;
            item.iconPath = new vscode.ThemeIcon(element.available ? 'pass-filled' : 'warning');
            item.contextValue = element.available ? 'qpmQtQuality.status.available' : 'qpmQtQuality.status.missing';
            return item;
        }
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.iconPath = new vscode.ThemeIcon(element.icon);
        item.contextValue = 'qpmQtQuality.action';
        item.command = { command: element.command, title: element.label };
        return item;
    }
    getChildren(element) {
        if (!element) {
            return [
                { kind: 'category', id: 'tests', label: 'Tests', icon: 'beaker' },
                { kind: 'category', id: 'analysis', label: 'Static analysis', icon: 'search-fuzzy' },
                { kind: 'category', id: 'runtime', label: 'Runtime checks', icon: 'shield' },
                { kind: 'category', id: 'coverage', label: 'Coverage', icon: 'graph' }
            ];
        }
        if (element.kind !== 'category')
            return [];
        const tools = this.quality.getToolStatus();
        switch (element.id) {
            case 'tests': return [
                status('test-status', 'Discovered tests', `${this.testing.testCount} test(s) in ${this.testing.projectCount} project(s)`, this.testing.testCount > 0),
                action('test-refresh', 'Refresh test discovery', undefined, 'refresh', 'qpm.refreshTests'),
                action('test-explorer', 'Open Test Explorer', undefined, 'beaker', 'qpm.openTestExplorer'),
                action('test-run-all', 'Run all project tests', undefined, 'run-all', 'qpm.runAllTests'),
                action('test-rerun-failed', 'Rerun failed tests', `${this.testing.failedTestCount} failed`, 'debug-rerun', 'qpm.rerunFailedTests'),
                action('test-run-current', 'Run test at cursor', undefined, 'play', 'qpm.runTestAtCursor'),
                action('test-debug-current', 'Debug test at cursor', undefined, 'debug-alt', 'qpm.debugTestAtCursor'),
                action('test-history', 'Open test history', undefined, 'history', 'qpm.openTestHistory'),
                action('test-history-clear', 'Clear test history', undefined, 'clear-all', 'qpm.clearTestHistory')
            ];
            case 'analysis': return [
                status('clang-tidy-status', 'Clang-Tidy', tools.clangTidyPath ?? 'not found', !!tools.clangTidyPath),
                status('clazy-status', 'Clazy', tools.clazyPath ?? 'not found', !!tools.clazyPath),
                action('clang-file', 'Clang-Tidy current file', undefined, 'check', 'qpm.runClangTidyFile'),
                action('clang-project', 'Clang-Tidy project', undefined, 'check-all', 'qpm.runClangTidyProject'),
                action('clang-fix', 'Apply Clang-Tidy fixes to file', undefined, 'wand', 'qpm.applyClangTidyFixes'),
                action('clazy-file', 'Clazy current file', undefined, 'search', 'qpm.runClazyFile'),
                action('clazy-project', 'Clazy project', undefined, 'search-fuzzy', 'qpm.runClazyProject'),
                action('quality-clear', 'Clear quality diagnostics', `${this.quality.diagnosticCount} published`, 'clear-all', 'qpm.clearQualityDiagnostics')
            ];
            case 'runtime': return [
                action('sanitizers-create', 'Create sanitizer build profiles', 'ASan, UBSan and combined', 'shield', 'qpm.createSanitizerProfiles'),
                action('quality-config', 'Configure quality checks', undefined, 'settings-gear', 'qpm.configureQuality'),
                action('quality-report', 'Open quality report', undefined, 'report', 'qpm.openQualityReport')
            ];
            case 'coverage': return [
                status('gcov-status', 'gcov', tools.gcovPath ?? 'not found', !!tools.gcovPath),
                action('coverage-profile', 'Create coverage build profile', undefined, 'add', 'qpm.createCoverageProfile'),
                action('coverage-run', 'Run all tests with coverage', undefined, 'graph', 'qpm.runAllTestsWithCoverage')
            ];
            default: return [];
        }
    }
    dispose() {
        while (this.disposables.length > 0)
            this.disposables.pop()?.dispose();
        this.emitter.dispose();
    }
    updateDescription() {
        if (!this.view)
            return;
        const ref = this.workspaces.activeProjectRef;
        this.view.description = ref?.exists ? ref.name : 'No project';
    }
}
exports.QpmQtQualityProvider = QpmQtQualityProvider;
function action(id, label, description, icon, command) {
    return { kind: 'action', id, label, description, icon, command };
}
function status(id, label, description, available) {
    return { kind: 'status', id, label, description, available };
}
