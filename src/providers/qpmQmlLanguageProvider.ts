import * as vscode from 'vscode';
import { QpmQmlLanguageService } from '../services/qpmQmlLanguageService';

export class QpmQmlLanguageProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly serviceSubscription: vscode.Disposable;

  constructor(private readonly service: QpmQmlLanguageService) {
    this.serviceSubscription = service.onDidChange(() => this.refresh());
  }

  refresh(): void { this.emitter.fire(); }
  dispose(): void { this.serviceSubscription.dispose(); this.emitter.dispose(); }
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const report = this.service.getReport();
    if (!report) return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
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
