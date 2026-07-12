import * as vscode from 'vscode';
import { QpmQtPublicationService } from '../services/qpmQtPublicationService';

export class QpmQtPublicationProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposable: vscode.Disposable;
  private view?: vscode.TreeView<vscode.TreeItem>;

  constructor(private readonly publication: QpmQtPublicationService) {
    this.disposable = publication.onDidChange(() => this.refresh());
  }

  attachView(view: vscode.TreeView<vscode.TreeItem>): void { this.view = view; this.updateDescription(); }
  refresh(): void { this.updateDescription(); this.emitter.fire(); }
  dispose(): void { this.disposable.dispose(); this.emitter.dispose(); }
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.TreeItem[] {
    const report = this.publication.getReport();
    if (!report) return [commandItem('No native Qt project', 'Open or create a project', 'qpm.openWorkspace', 'info')];
    const errors = report.issues.filter((entry) => entry.severity === 'error').length;
    const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
    const toolCount = Object.values(report.tools).filter(Boolean).length;
    const items: vscode.TreeItem[] = [
      item(report.productName, `${report.version} · ${report.channel}`, 'package'),
      item('State', !report.enabled ? 'disabled' : errors ? `${errors} blocking issue(s)` : warnings ? `${warnings} warning(s)` : 'ready', errors ? 'error' : warnings ? 'warning' : 'pass'),
      item('Release output', report.paths.releaseRoot, 'folder'),
      item('Publication tools', `${toolCount} detected`, toolCount ? 'tools' : 'warning'),
      item('MSIX / App Installer', report.msixEnabled ? report.paths.msixPackage : 'disabled', report.msixEnabled && report.tools.makeAppx ? 'package' : 'info'),
      item('WinGet manifests', report.wingetEnabled ? report.paths.wingetRoot : 'disabled', report.wingetEnabled && report.tools.winget ? 'cloud-download' : 'info'),
      item('Publish target', report.publishTarget === 'none' ? 'not configured' : report.publishTarget, 'cloud-upload'),
      commandItem('Detect publication tools', 'MakeAppx, SignTool, WinGet, GitHub CLI, SSH tools', 'qpm.detectPublicationTools', 'search'),
      commandItem('Generate publication sources', 'MSIX manifest, App Installer, WinGet and release metadata', 'qpm.generatePublicationSources', 'files'),
      commandItem('Create MSIX package', 'Package the deployed Qt application with MakeAppx', 'qpm.createMsixPackage', 'package'),
      commandItem('Generate App Installer file', 'Configure self-hosted MSIX updates', 'qpm.generateAppInstaller', 'cloud-download'),
      commandItem('Generate WinGet manifests', 'Version, installer and locale manifests', 'qpm.generateWingetManifests', 'list-tree'),
      commandItem('Validate WinGet manifests', 'Use winget validate when available', 'qpm.validateWingetManifests', 'check-all'),
      commandItem('Create release bundle', 'Collect artifacts, checksums and update metadata', 'qpm.createReleaseBundle', 'archive'),
      commandItem('Publish release', 'Local directory, SSH server or GitHub Release', 'qpm.publishRelease', 'cloud-upload'),
      commandItem('Open publication report', 'Configuration, tools, issues and generated paths', 'qpm.openPublicationReport', 'report'),
      commandItem('Reveal publication output', this.publication.latestArtifactPath || report.outputRoot, 'qpm.revealPublicationOutput', 'folder-opened'),
      commandItem('Clean publication output', 'Remove generated publication files and release bundles', 'qpm.cleanPublicationOutput', 'trash')
    ];
    return items;
  }

  private updateDescription(): void {
    if (!this.view) return;
    const report = this.publication.getReport();
    this.view.description = report ? `${report.version} · ${report.channel}` : 'No project';
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
