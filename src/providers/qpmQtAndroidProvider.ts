import * as vscode from 'vscode';
import { QpmQtAndroidService } from '../services/qpmQtAndroidService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';
import { getActiveQtPlatformProfile, isQtProjectManifestPath, readQtProjectManifest } from '../model/qtProjectManifest';

export class QpmQtAndroidProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<vscode.TreeItem>;

  constructor(private readonly workspaces: QpmWorkspaceService, private readonly android: QpmQtAndroidService) {
    this.disposables.push(workspaces.onDidChange(() => this.refresh()));
    this.disposables.push(android.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<vscode.TreeItem>): void { this.view = view; this.updateDescription(); }
  refresh(): void { this.updateDescription(); this.emitter.fire(); }
  dispose(): void { for (const disposable of this.disposables) disposable.dispose(); this.emitter.dispose(); }
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.TreeItem[] {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return [commandItem('No native Qt project', 'Open or create a project', 'qpm.openWorkspace', 'info')];
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const profile = getActiveQtPlatformProfile(manifest);
      if (profile.type !== 'android') {
        return [
          commandItem('Android platform is not active', 'Select or create an Android platform profile', 'qpm.manageQtPlatforms', 'device-mobile'),
          commandItem('Manage Android environment', 'SDK, NDK, JDK and Qt Android kit', 'qpm.configureAndroidEnvironment', 'settings-gear')
        ];
      }
      const report = this.android.detectEnvironment(profile);
      const device = report.devices.find((entry) => entry.serial === profile.androidDeviceSerial) ?? report.devices.find((entry) => entry.state === 'device');
      const result: vscode.TreeItem[] = [
        item('Environment', report.summary, report.ready ? 'pass' : 'warning'),
        item('Qt Android kit', report.qtRoot || 'not configured', 'versions'),
        item('SDK / NDK / JDK', report.sdkRoot && report.ndkRoot && report.jdkRoot ? 'Configured' : 'Incomplete', report.ready ? 'tools' : 'warning'),
        item('Package', `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidBuildAllAbis ? 'all ABIs' : profile.androidAbis.join(', ')}`, 'package'),
        item('Device', device ? `${device.description} · ${device.serial}` : 'No connected device selected', device ? 'device-mobile' : 'warning'),
        commandItem('Configure Android environment', 'SDK, NDK, JDK, ABI, device and AVD', 'qpm.configureAndroidEnvironment', 'settings-gear'),
        commandItem('Refresh Android devices', `${report.devices.length} device(s), ${report.avds.length} AVD(s)`, 'qpm.refreshAndroidDevices', 'refresh'),
        commandItem('Start Android emulator', profile.androidAvdName || 'Select an AVD', 'qpm.startAndroidAvd', 'vm-running'),
        commandItem('Build APK', 'Build an installable Android package', 'qpm.buildAndroidApk', 'package'),
        commandItem('Build AAB', 'Build a Google Play Android App Bundle', 'qpm.buildAndroidAab', 'archive'),
        commandItem('Build AAR', 'Build a reusable Android Archive', 'qpm.buildAndroidAar', 'library'),
        commandItem('Install APK', profile.androidDeviceSerial || 'Automatic device selection', 'qpm.installAndroidPackage', 'cloud-download'),
        commandItem('Build, install and run', 'Complete Android device workflow', 'qpm.buildInstallRunAndroid', 'rocket'),
        commandItem('Run Android application', profile.androidPackageName || `org.qtproject.example.${manifest.targetName}`, 'qpm.runAndroidApplication', 'play'),
        commandItem('Uninstall Android application', 'Remove package from selected device', 'qpm.uninstallAndroidApplication', 'trash'),
        commandItem('Prepare wait-for-debugger launch', 'Start the app and wait for an Android debugger', 'qpm.prepareAndroidDebug', 'debug-alt'),
        commandItem(this.android.activeLogcatDescription ? 'Stop logcat' : 'Start logcat', this.android.activeLogcatDescription || profile.androidLogcatFilter, this.android.activeLogcatDescription ? 'qpm.stopAndroidLogcat' : 'qpm.startAndroidLogcat', this.android.activeLogcatDescription ? 'debug-stop' : 'output'),
        commandItem('Open Android environment report', 'Prerequisites, tools, devices and SDK packages', 'qpm.openAndroidReport', 'report'),
        commandItem('Reveal latest Android package', this.android.latestPackagePath || 'Open Android build output', 'qpm.revealAndroidPackage', 'folder-opened')
      ];
      return result;
    } catch (error) {
      return [item('Invalid Android configuration', error instanceof Error ? error.message : String(error), 'error')];
    }
  }

  private updateDescription(): void {
    if (!this.view) return;
    const profile = this.android.activeProfile;
    this.view.description = profile ? `${profile.androidPackageFormat.toUpperCase()} · ${profile.androidBuildAllAbis ? 'all ABIs' : profile.androidAbis.join(', ')}` : 'No Android project';
  }
}

function item(label: string, description: string, icon: string): vscode.TreeItem {
  const result = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  result.description = description;
  result.iconPath = new vscode.ThemeIcon(icon);
  result.tooltip = `${label}\n${description}`;
  return result;
}

function commandItem(label: string, description: string, command: string, icon: string): vscode.TreeItem {
  const result = item(label, description, icon);
  result.command = { command, title: label };
  return result;
}
