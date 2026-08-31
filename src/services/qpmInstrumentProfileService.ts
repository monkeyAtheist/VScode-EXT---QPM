import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isQtProjectManifestPath } from '../model/qtProjectManifest';
import { QtInstrumentProfileEditorPanel, readQtInstrumentProfileCatalog } from '../views/qtInstrumentProfileEditorPanel';
import { QpmWorkspaceService } from './qpmWorkspaceService';

export class QpmInstrumentProfileService implements vscode.Disposable {
  private readonly panels = new Map<string, QtInstrumentProfileEditorPanel>();
  private readonly catalogPath: string;

  constructor(
    extensionPath: string,
    private readonly workspaces: QpmWorkspaceService,
    private readonly output: vscode.OutputChannel
  ) {
    this.catalogPath = path.join(extensionPath, 'data', 'qt_instrument_profile_catalog.json');
  }

  dispose(): void {
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }

  async openEditor(target?: unknown): Promise<void> {
    const root = this.requireNativeQtProjectRoot();
    const targetPath = this.resolveProfileTarget(target, root);
    const key = targetPath ? normalizeKey(targetPath) : `${normalizeKey(root)}::catalog`;
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      if (targetPath) await existing.loadFile(targetPath);
      return;
    }

    const catalog = readQtInstrumentProfileCatalog(this.catalogPath);
    const panel = new QtInstrumentProfileEditorPanel(
      targetPath,
      root,
      catalog,
      this.output,
      () => this.workspaces.refresh(),
      () => this.panels.delete(key)
    );
    this.panels.set(key, panel);
  }

  async newFromCatalog(): Promise<void> {
    await this.openEditor();
  }

  async openProfileFile(target?: unknown): Promise<void> {
    const root = this.requireNativeQtProjectRoot();
    const targetPath = this.resolveProfileTarget(target, root);
    if (targetPath) {
      await this.openEditor(targetPath);
      return;
    }
    const profileDirectory = path.join(root, 'instrument_profiles');
    const selected = await vscode.window.showOpenDialog({
      title: 'Open SCPI instrument profile',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(fs.existsSync(profileDirectory) ? profileDirectory : root),
      filters: { 'SCPI instrument profile': ['json'] }
    });
    if (selected?.[0]) await this.openEditor(selected[0].fsPath);
  }

  private requireNativeQtProjectRoot(): string {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      throw new Error('Open a native .qtproject.json project before editing SCPI instrument profiles.');
    }
    return path.dirname(ref.absolutePath);
  }

  private resolveProfileTarget(target: unknown, projectRoot: string): string | undefined {
    const candidates: string[] = [];
    if (typeof target === 'string') candidates.push(target);
    if (target instanceof vscode.Uri) candidates.push(target.fsPath);
    if (target && typeof target === 'object') {
      const value = target as { fsPath?: string; absolutePath?: string; uri?: vscode.Uri; file?: { absolutePath?: string } };
      if (value.fsPath) candidates.push(value.fsPath);
      if (value.absolutePath) candidates.push(value.absolutePath);
      if (value.uri?.fsPath) candidates.push(value.uri.fsPath);
      if (value.file?.absolutePath) candidates.push(value.file.absolutePath);
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active?.scheme === 'file') candidates.push(active.fsPath);

    for (const candidate of candidates) {
      const absolute = path.resolve(candidate);
      if (!absolute.toLowerCase().endsWith('.json')) continue;
      if (!fs.existsSync(absolute)) continue;
      if (!isUnderProfileDirectory(absolute, projectRoot)) continue;
      return absolute;
    }
    return undefined;
  }
}

function isUnderProfileDirectory(filePath: string, projectRoot: string): boolean {
  const profileDirectory = normalizeKey(path.join(projectRoot, 'instrument_profiles'));
  const normalized = normalizeKey(filePath);
  return normalized === profileDirectory || normalized.startsWith(`${profileDirectory}${path.sep}`.toLowerCase());
}

function normalizeKey(value: string): string {
  return path.resolve(value).toLowerCase();
}
