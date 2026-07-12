import * as path from 'path';
import * as vscode from 'vscode';
import { getQtInstallationPreference, isQtProjectManifestPath, readQtProjectManifest } from '../model/qtProjectManifest';
import { QpmQtInstallationService } from '../services/qpmQtInstallationService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

export type QtToolsNode = QtToolsCategoryNode | QtToolsActionNode | QtToolsStatusNode;

interface QtToolsCategoryNode {
  kind: 'category';
  id: string;
  label: string;
  icon: string;
}

interface QtToolsActionNode {
  kind: 'action';
  id: string;
  label: string;
  description?: string;
  icon: string;
  command: string;
}

interface QtToolsStatusNode {
  kind: 'status';
  id: string;
  label: string;
  description: string;
  available: boolean;
}

export class QpmQtToolsProvider implements vscode.TreeDataProvider<QtToolsNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<QtToolsNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<QtToolsNode>;

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly installations: QpmQtInstallationService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<QtToolsNode>): void {
    this.view = view;
    this.updateDescription();
  }

  refresh(): void {
    this.updateDescription();
    this.emitter.fire();
  }

  getTreeItem(element: QtToolsNode): vscode.TreeItem {
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

  getChildren(element?: QtToolsNode): QtToolsNode[] {
    if (!element) {
      return [
        { kind: 'category', id: 'translations', label: 'Translations', icon: 'globe' },
        { kind: 'category', id: 'resources', label: 'Resources', icon: 'package' },
        { kind: 'category', id: 'qml', label: 'QML', icon: 'symbol-color' },
        { kind: 'category', id: 'documentation', label: 'Documentation', icon: 'book' }
      ];
    }
    if (element.kind !== 'category') return [];
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

  dispose(): void {
    while (this.disposables.length > 0) this.disposables.pop()?.dispose();
    this.emitter.dispose();
  }

  private translationChildren(): QtToolsNode[] {
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

  private qmlChildren(): QtToolsNode[] {
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

  private activeInstallation() {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return this.installations.getActive();
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      return this.installations.getActive(getQtInstallationPreference(manifest));
    } catch {
      return this.installations.getActive();
    }
  }

  private updateDescription(): void {
    if (!this.view) return;
    const ref = this.workspaces.activeProjectRef;
    this.view.description = ref?.exists ? ref.name : 'No project';
  }
}

function action(id: string, label: string, description: string | undefined, icon: string, command: string): QtToolsActionNode {
  return { kind: 'action', id, label, description, icon, command };
}

function status(id: string, label: string, description: string, available: boolean): QtToolsStatusNode {
  return { kind: 'status', id, label, description, available };
}
