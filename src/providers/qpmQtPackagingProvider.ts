import * as vscode from 'vscode';
import { QpmQtPackagingService } from '../services/qpmQtPackagingService';

export class QpmQtPackagingProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly packaging: QpmQtPackagingService) {}

  refresh(): void { this.emitter.fire(); }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const report = this.packaging.getReport();
    if (!report) return [item('No active Qt project', 'Open or create a native Qt project', 'info')];
    const blocking = report.issues.filter((entry) => entry.severity === 'error').length;
    const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
    return [
      item(report.identity.productName, `Version ${report.identity.version}`, 'package'),
      item('Package format', report.archivePath ? report.archivePath.endsWith('.zip') ? 'ZIP archive' : 'tar.gz archive' : 'Folder', 'file-zip'),
      item('Target platform', `${report.identity.platform} · ${report.identity.architecture} · ${report.identity.configuration}`, 'device-desktop'),
      item('Readiness', blocking ? `${blocking} blocking error(s)` : warnings ? `${warnings} warning(s)` : 'Ready', blocking ? 'error' : warnings ? 'warning' : 'pass'),
      commandItem('Create portable package', 'Build, stage runtime files and create the selected archive', 'qpm.createPortablePackage', 'package'),
      commandItem('Generate product metadata', 'Generate Windows manifest/resource and Linux desktop entry', 'qpm.generateProductMetadata', 'symbol-property'),
      commandItem('Open packaging report', report.stageDirectory, 'qpm.openPackagingReport', 'report'),
      commandItem('Reveal packaging output', report.outputRoot, 'qpm.revealPackagingOutput', 'folder-opened'),
      commandItem('Clean packaging output', 'Remove generated distribution folders and archives', 'qpm.cleanPackagingOutput', 'trash')
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
