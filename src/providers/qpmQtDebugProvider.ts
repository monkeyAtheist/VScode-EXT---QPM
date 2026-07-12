import * as vscode from 'vscode';
import { getActiveQtDebugProfile, isQtProjectManifestPath, readQtProjectManifest } from '../model/qtProjectManifest';
import { QpmQtDebugService } from '../services/qpmQtDebugService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

interface DebugTreeItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  command?: string;
  tooltip?: string;
}

export class QpmQtDebugProvider implements vscode.TreeDataProvider<DebugTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<DebugTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<DebugTreeItem>;

  constructor(private readonly workspaces: QpmWorkspaceService, private readonly debugging: QpmQtDebugService) {
    this.disposables.push(workspaces.onDidChange(() => this.refresh()));
    this.disposables.push(debugging.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<DebugTreeItem>): void {
    this.view = view;
    this.updateDescription();
  }

  refresh(): void {
    this.updateDescription();
    this.emitter.fire();
  }

  getTreeItem(element: DebugTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip ?? element.description;
    item.iconPath = new vscode.ThemeIcon(element.icon);
    if (element.command) item.command = { command: element.command, title: element.label };
    return item;
  }

  getChildren(): DebugTreeItem[] {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      return [{ id: 'no-project', label: 'No native Qt project', description: 'Open or create a project', icon: 'info', command: 'qpm.openWorkspace' }];
    }
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const profile = getActiveQtDebugProfile(manifest);
      const qml = profile.qmlDebug || profile.request === 'qml-attach';
      return [
        { id: 'active', label: 'Active debug profile', description: profile.name, icon: 'debug-alt', command: 'qpm.manageQtDebugProfiles', tooltip: `${profile.request} · ${profile.debuggerType}` },
        { id: 'start', label: 'Build and start active profile', description: profile.request, icon: 'debug-start', command: 'qpm.startQtDebugProfile' },
        { id: 'start-no-build', label: 'Start without build', description: 'Use existing target', icon: 'play', command: 'qpm.startQtDebugProfileWithoutBuild' },
        { id: 'attach', label: 'Attach to local process', description: 'Pick a running process', icon: 'plug', command: 'qpm.attachQtProcess' },
        { id: 'core', label: 'Open core or dump file', description: 'GDB, LLDB or Visual Studio dump', icon: 'file-binary', command: 'qpm.debugQtCoreDump' },
        { id: 'qml', label: 'Attach QML debugger', description: qml ? `${profile.qmlHost}:${profile.qmlPort}` : 'Use active profile settings', icon: 'symbol-event', command: 'qpm.attachQmlDebugger' },
        { id: 'profiles', label: 'Manage debug profiles', description: `${manifest.profiles.debugs.length} profile(s)`, icon: 'settings-gear', command: 'qpm.manageQtDebugProfiles' },
        { id: 'launch-json', label: 'Generate launch.json', description: 'Export all QPM debug profiles', icon: 'json', command: 'qpm.generateQtLaunchJson' }
      ];
    } catch (error) {
      return [{ id: 'invalid', label: 'Invalid Qt debug configuration', description: error instanceof Error ? error.message : String(error), icon: 'error', command: 'qpm.editBuildSettings' }];
    }
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private updateDescription(): void {
    if (!this.view) return;
    const profile = this.debugging.activeProfile;
    this.view.description = profile ? `${profile.name} · ${profile.request}` : 'No project';
  }
}
