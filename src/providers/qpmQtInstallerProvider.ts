import * as vscode from 'vscode';
import { QpmQtInstallerService } from '../services/qpmQtInstallerService';

export class QpmQtInstallerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly installers: QpmQtInstallerService) {}

  refresh(): void { this.emitter.fire(); }

  dispose(): void { this.emitter.dispose(); }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const report = this.installers.getReport();
    if (!report) return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
    const blocking = report.issues.filter((entry) => entry.severity === 'error').length;
    const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
    const backendLabel = report.backend === 'qt-ifw' ? 'Qt Installer Framework' : report.backend === 'inno-setup' ? 'Inno Setup' : 'NSIS';
    const selectedTool = report.backend === 'qt-ifw' ? report.tools.binaryCreator : report.backend === 'inno-setup' ? report.tools.iscc : report.tools.makensis;
    return [
      item(report.identity.productName, `Version ${report.identity.version}`, 'package'),
      item('Installer backend', backendLabel, 'tools'),
      item('Compiler', selectedTool || 'Not found', selectedTool ? 'pass' : 'warning'),
      item('Signing', report.tools.signTool ? 'SignTool detected' : 'SignTool not found', report.tools.signTool ? 'verified-filled' : 'shield'),
      item('Readiness', blocking ? `${blocking} blocking error(s)` : warnings ? `${warnings} warning(s)` : 'Ready', blocking ? 'error' : warnings ? 'warning' : 'pass'),
      commandItem('Create desktop installer', report.installerPath, 'qpm.createDesktopInstaller', 'package'),
      commandItem('Generate installer sources', report.generated.root, 'qpm.generateInstallerProject', 'files'),
      commandItem('Create Qt IFW update repository', report.repositoryPath, 'qpm.createQtIfwRepository', 'cloud-upload'),
      commandItem('Sign distribution artifacts', 'Sign target and latest installer according to project settings', 'qpm.signDistributionArtifacts', 'verified'),
      commandItem('Verify signatures', 'Validate Authenticode signatures with Windows policy', 'qpm.verifyDistributionSignatures', 'shield'),
      commandItem('Detect installer tools', 'Search Qt IFW, Inno Setup, NSIS and Windows SDK tools', 'qpm.detectInstallerTools', 'search'),
      commandItem('Open installer report', report.outputRoot, 'qpm.openInstallerReport', 'report'),
      commandItem('Reveal installer output', report.outputRoot, 'qpm.revealInstallerOutput', 'folder-opened'),
      commandItem('Clean installer output', 'Remove generated scripts, repositories and installers', 'qpm.cleanInstallerOutput', 'trash')
    ];
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
