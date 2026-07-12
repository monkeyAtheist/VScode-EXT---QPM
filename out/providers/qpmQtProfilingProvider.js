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
exports.QpmQtProfilingProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtProfilingProvider {
    profiling;
    emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.emitter.event;
    constructor(profiling) {
        this.profiling = profiling;
    }
    refresh() { this.emitter.fire(); }
    dispose() { this.emitter.dispose(); }
    getTreeItem(element) { return element; }
    getChildren() {
        const report = this.profiling.getReport();
        if (!report)
            return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
        const errors = report.issues.filter((entry) => entry.severity === 'error').length;
        const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
        const tools = report.tools;
        return [
            item(report.project, `${report.platform} · ${report.latestOutput ? 'result available' : 'no result yet'}`, 'pulse'),
            item('QML Profiler', tools.qmlProfilerPath ? 'Ready' : 'Not found', tools.qmlProfilerPath ? 'pass' : 'warning'),
            item('CPU profiler', tools.perfPath ? 'perf' : tools.valgrindPath ? 'Callgrind' : 'Not found', tools.perfPath || tools.valgrindPath ? 'pass' : 'warning'),
            item('Memory profiler', tools.valgrindPath ? 'Valgrind Memcheck' : tools.heobPath ? 'Heob' : 'Not found', tools.valgrindPath || tools.heobPath ? 'pass' : 'warning'),
            item('Cppcheck', tools.cppcheckPath ? 'Ready' : 'Not found', tools.cppcheckPath ? 'pass' : 'warning'),
            item('Readiness', errors ? `${errors} error(s)` : warnings ? `${warnings} warning(s)` : 'Ready', errors ? 'error' : warnings ? 'warning' : 'pass'),
            commandItem('Profile QML / Qt Quick', 'Capture QML tracing data with qmlprofiler', 'qpm.profileQmlApplication', 'graph-line'),
            commandItem('Profile CPU', 'Run perf or Valgrind Callgrind', 'qpm.profileCpu', 'dashboard'),
            commandItem('Analyze memory', 'Run Valgrind Memcheck or Heob', 'qpm.profileMemory', 'bug'),
            commandItem('Run Cppcheck', 'Publish Cppcheck diagnostics in VS Code', 'qpm.runCppcheck', 'checklist'),
            commandItem('Trace system calls', 'Run strace when available', 'qpm.traceSystemCalls', 'list-tree'),
            commandItem('Stop active profiler', 'Terminate profiler processes started by QPM', 'qpm.stopProfiling', 'debug-stop'),
            commandItem('Open latest result', report.latestOutput ?? report.outputDirectory, 'qpm.openLatestProfilingResult', 'folder-opened'),
            commandItem('Open profiling report', report.outputDirectory, 'qpm.openProfilingReport', 'report'),
            commandItem('Reveal profiling output', report.outputDirectory, 'qpm.revealProfilingOutput', 'folder'),
            commandItem('Clean profiling output', 'Remove generated reports and traces', 'qpm.cleanProfilingOutput', 'trash')
        ];
    }
}
exports.QpmQtProfilingProvider = QpmQtProfilingProvider;
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
