import * as vscode from 'vscode';
import { getActiveQtPlatformProfile, isQtProjectManifestPath, readQtProjectManifest } from '../model/qtProjectManifest';
import { applePlatformLabel, isApplePlatform, QpmQtAppleService } from '../services/qpmQtAppleService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

export class QpmQtAppleProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<vscode.TreeItem>;

  constructor(private readonly workspaces: QpmWorkspaceService, private readonly apple: QpmQtAppleService) {
    this.disposables.push(workspaces.onDidChange(() => this.refresh()));
    this.disposables.push(apple.onDidChange(() => this.refresh()));
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
      if (!isApplePlatform(profile.type)) {
        return [
          commandItem('Apple platform is not active', 'Select or create a macOS or iOS platform profile', 'qpm.manageQtPlatforms', 'device-desktop'),
          commandItem('Configure Apple environment', 'Xcode, signing, notarization and simulator settings', 'qpm.configureAppleEnvironment', 'settings-gear')
        ];
      }
      const report = this.apple.detectEnvironment(profile);
      const selectedSimulator = report.simulators.find((entry) => entry.udid === profile.appleSimulatorId) ?? report.simulators.find((entry) => entry.state === 'Booted');
      const items: vscode.TreeItem[] = [
        item('Environment', report.summary, report.ready ? 'pass' : 'warning'),
        item('Platform', applePlatformLabel(profile.type), profile.type === 'macos' ? 'device-desktop' : 'device-mobile'),
        item('Xcode', report.xcodeVersion || 'not available', report.xcodeVersion ? 'tools' : 'warning'),
        item('Qt kit', report.qtRoot || 'not configured', report.qtRoot ? 'versions' : 'warning'),
        item('Bundle identifier', profile.appleBundleIdentifier || manifest.packaging.identifier || `org.qtproject.example.${manifest.targetName}`, 'symbol-namespace'),
        item('Signing', profile.appleCodeSignIdentity || (profile.appleAutomaticSigning ? 'Automatic / ad-hoc' : 'Not configured'), profile.appleCodeSignIdentity || profile.appleAutomaticSigning ? 'verified' : 'warning')
      ];
      if (profile.type === 'ios-simulator') items.push(item('Simulator', selectedSimulator ? `${selectedSimulator.name} · ${selectedSimulator.state}` : 'No simulator selected', selectedSimulator ? 'device-mobile' : 'warning'));
      if (profile.type === 'ios-device') items.push(item('Device', profile.appleDeviceId || 'No physical device configured', profile.appleDeviceId ? 'device-mobile' : 'warning'));
      items.push(
        commandItem('Configure Apple environment', 'Xcode, bundle identity, signing and notarization', 'qpm.configureAppleEnvironment', 'settings-gear'),
        commandItem('Refresh Apple devices', `${report.simulators.length} iOS simulator(s)`, 'qpm.refreshAppleDevices', 'refresh'),
        commandItem('Build Apple target', applePlatformLabel(profile.type), 'qpm.buildAppleTarget', 'tools')
      );
      if (profile.type === 'macos') {
        items.push(
          commandItem('Deploy macOS application', 'Run macdeployqt without creating a disk image', 'qpm.deployMacApplication', 'package'),
          commandItem('Create macOS DMG', `${profile.appleDmgFileSystem} disk image`, 'qpm.createMacDmg', 'archive'),
          commandItem('Sign Apple artifacts', profile.appleCodeSignIdentity || 'Configure a Developer ID identity', 'qpm.signAppleArtifacts', 'verified-filled'),
          commandItem('Verify Apple signatures', 'codesign and Gatekeeper assessment', 'qpm.verifyAppleSignatures', 'shield'),
          commandItem('Notarize Apple artifact', profile.appleNotaryProfile || 'Configure a notarytool keychain profile', 'qpm.notarizeAppleArtifact', 'cloud-upload'),
          commandItem('Staple notarization ticket', 'Attach the accepted ticket to an app, DMG or PKG', 'qpm.stapleAppleArtifact', 'pin')
        );
      } else if (profile.type === 'ios-simulator') {
        items.push(
          commandItem('Select iOS simulator', selectedSimulator?.name || 'Choose an available simulator', 'qpm.selectAppleSimulator', 'list-selection'),
          commandItem('Boot iOS simulator', selectedSimulator?.name || 'Automatic selection', 'qpm.bootAppleSimulator', 'vm-running'),
          commandItem('Build, install and run', 'Complete iOS Simulator workflow', 'qpm.installRunIosSimulator', 'rocket')
        );
      }
      items.push(
        commandItem('Open Apple environment report', 'Tools, simulators, signing and diagnostics', 'qpm.openAppleReport', 'report'),
        commandItem('Reveal latest Apple output', this.apple.latestArtifactPath || 'Open Apple build directory', 'qpm.revealAppleOutput', 'folder-opened'),
        commandItem('Clean Apple output', 'Remove generated Xcode projects and Apple build output', 'qpm.cleanAppleOutput', 'trash')
      );
      return items;
    } catch (error) {
      return [item('Invalid Apple configuration', error instanceof Error ? error.message : String(error), 'error')];
    }
  }

  private updateDescription(): void {
    if (!this.view) return;
    const profile = this.apple.activeProfile;
    this.view.description = profile && isApplePlatform(profile.type) ? applePlatformLabel(profile.type) : 'No Apple project';
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
