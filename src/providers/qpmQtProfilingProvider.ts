import * as vscode from 'vscode';
import { QpmQtProfilingService } from '../services/qpmQtProfilingService';

export class QpmQtProfilingProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly profiling: QpmQtProfilingService) {}

  refresh(): void { this.emitter.fire(); }
  dispose(): void { this.emitter.dispose(); }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const report = this.profiling.getReport();
    if (!report) return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
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

function item(label: string, description: string, icon: string): vscode.TreeItem {
  const result = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  result.description = description;
  result.tooltip = `${label}\n${description}`;
  result.iconPath = new vscode.ThemeIcon(icon);
  return result;
}

function commandItem(label: string, description: string, command: string, icon: string): vscode.TreeItem {
  const result = item(label, description, icon);
  result.command = { command, title: label };
  return result;
}
