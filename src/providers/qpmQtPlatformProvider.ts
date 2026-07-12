import * as vscode from 'vscode';
import { getActiveQtPlatformProfile, isQtProjectManifestPath, readQtProjectManifest } from '../model/qtProjectManifest';
import { QpmQtPlatformService } from '../services/qpmQtPlatformService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

interface PlatformTreeItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  command?: string;
  tooltip?: string;
}

export class QpmQtPlatformProvider implements vscode.TreeDataProvider<PlatformTreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<PlatformTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<PlatformTreeItem>;

  constructor(private readonly workspaces: QpmWorkspaceService, private readonly platforms: QpmQtPlatformService) {
    this.disposables.push(workspaces.onDidChange(() => this.refresh()));
    this.disposables.push(platforms.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<PlatformTreeItem>): void { this.view = view; this.updateDescription(); }
  refresh(): void { this.updateDescription(); this.emitter.fire(); }
  dispose(): void { for (const disposable of this.disposables) disposable.dispose(); this.emitter.dispose(); }

  getTreeItem(element: PlatformTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip ?? element.description;
    item.iconPath = new vscode.ThemeIcon(element.icon);
    if (element.command) item.command = { command: element.command, title: element.label };
    return item;
  }

  getChildren(): PlatformTreeItem[] {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      return [{ id:'none', label:'No native Qt project', description:'Open or create a project', icon:'info', command:'qpm.openWorkspace' }];
    }
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const profile = getActiveQtPlatformProfile(manifest);
      const capabilities = this.platforms.detectCapabilities(profile);
      const result: PlatformTreeItem[] = [
        { id:'active', label:'Active platform', description:profile.name, icon:iconFor(profile.type), command:'qpm.selectQtPlatform', tooltip:`${profile.type} · ${profile.buildLocation}` },
        { id:'status', label:'Platform status', description:capabilities.summary, icon:capabilities.ready?'pass':'warning', command:'qpm.openPlatformReport' },
        { id:'build', label:'Build for active platform', description:profile.buildLocation, icon:'tools', command:'qpm.buildForPlatform' },
        { id:'deploy', label:'Deploy to active platform', description:profile.type, icon:'cloud-upload', command:'qpm.deployToPlatform' },
        { id:'run', label:'Run on active platform', description:profile.type, icon:'play', command:'qpm.runOnPlatform' },
        { id:'all', label:'Build, deploy and run', description:'Complete platform workflow', icon:'rocket', command:'qpm.buildDeployRunPlatform' },
        { id:'manage', label:'Manage platform profiles', description:`${manifest.profiles.platforms.length} profile(s)`, icon:'settings-gear', command:'qpm.manageQtPlatforms' },
        { id:'report', label:'Open platform report', description:'Tools and readiness', icon:'pulse', command:'qpm.openPlatformReport' }
      ];
      if (profile.type === 'remote-linux') result.splice(6,0,{ id:'ssh', label:'Open remote terminal', description:profile.sshHost || 'SSH not configured', icon:'terminal', command:'qpm.openRemoteTerminal' });
      if (profile.type === 'docker') result.splice(6,0,{ id:'docker-shell', label:'Open Docker shell', description:profile.dockerImage || 'Image not configured', icon:'terminal', command:'qpm.openDockerShell' });
      if (profile.type === 'android') {
        result.splice(6,0,{ id:'android', label:'Open Android devices', description:profile.androidDeviceSerial || profile.androidAvdName || 'No device selected', icon:'device-mobile', command:'qpm.android.focus' });
        result.splice(7,0,{ id:'android-configure', label:'Configure Android environment', description:`${profile.androidPackageFormat.toUpperCase()} · ${profile.androidAbis.join(', ')}`, icon:'settings-gear', command:'qpm.configureAndroidEnvironment' });
      }
      if (profile.type === 'webassembly') {
        result.splice(6,0,{ id:'wasm', label:'Serve WebAssembly target', description:this.platforms.activeServerDescription || `Port ${profile.wasmServerPort}`, icon:'globe', command:'qpm.serveWebAssembly' });
        if (this.platforms.activeServerDescription) result.splice(7,0,{ id:'wasm-stop', label:'Stop WebAssembly server', description:this.platforms.activeServerDescription, icon:'debug-stop', command:'qpm.stopWebAssemblyServer' });
      }
      return result;
    } catch (error) {
      return [{ id:'invalid', label:'Invalid platform configuration', description:error instanceof Error?error.message:String(error), icon:'error', command:'qpm.editBuildSettings' }];
    }
  }

  private updateDescription(): void {
    if (!this.view) return;
    const profile = this.platforms.activeProfile;
    this.view.description = profile ? `${profile.name} · ${profile.type}` : 'No project';
  }
}

function iconFor(type: string): string { return type==='android'?'device-mobile':type==='remote-linux'?'remote':type==='docker'?'package':type==='webassembly'?'globe':type==='linux-local'?'terminal-linux':'device-desktop'; }
