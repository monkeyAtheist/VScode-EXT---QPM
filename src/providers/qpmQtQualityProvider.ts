import * as vscode from 'vscode';
import { QpmQtQualityService } from '../services/qpmQtQualityService';
import { QpmQtTestingService } from '../services/qpmQtTestingService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

export type QtQualityNode = QtQualityCategoryNode | QtQualityActionNode | QtQualityStatusNode;

interface QtQualityCategoryNode {
  kind: 'category';
  id: string;
  label: string;
  icon: string;
}

interface QtQualityActionNode {
  kind: 'action';
  id: string;
  label: string;
  description?: string;
  icon: string;
  command: string;
}

interface QtQualityStatusNode {
  kind: 'status';
  id: string;
  label: string;
  description: string;
  available: boolean;
}

export class QpmQtQualityProvider implements vscode.TreeDataProvider<QtQualityNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<QtQualityNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<QtQualityNode>;

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly testing: QpmQtTestingService,
    private readonly quality: QpmQtQualityService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<QtQualityNode>): void {
    this.view = view;
    this.updateDescription();
  }

  refresh(): void {
    this.updateDescription();
    this.emitter.fire();
  }

  getTreeItem(element: QtQualityNode): vscode.TreeItem {
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

  getChildren(element?: QtQualityNode): QtQualityNode[] {
    if (!element) {
      return [
        { kind: 'category', id: 'tests', label: 'Tests', icon: 'beaker' },
        { kind: 'category', id: 'analysis', label: 'Static analysis', icon: 'search-fuzzy' },
        { kind: 'category', id: 'runtime', label: 'Runtime checks', icon: 'shield' },
        { kind: 'category', id: 'coverage', label: 'Coverage', icon: 'graph' }
      ];
    }
    if (element.kind !== 'category') return [];
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

  dispose(): void {
    while (this.disposables.length > 0) this.disposables.pop()?.dispose();
    this.emitter.dispose();
  }

  private updateDescription(): void {
    if (!this.view) return;
    const ref = this.workspaces.activeProjectRef;
    this.view.description = ref?.exists ? ref.name : 'No project';
  }
}

function action(id: string, label: string, description: string | undefined, icon: string, command: string): QtQualityActionNode {
  return { kind: 'action', id, label, description, icon, command };
}

function status(id: string, label: string, description: string, available: boolean): QtQualityStatusNode {
  return { kind: 'status', id, label, description, available };
}
