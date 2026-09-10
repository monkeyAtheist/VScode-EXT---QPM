import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { QpmBuildMode, QpmProject, QpmProjectFile, QpmWorkspaceProjectRef } from '../model/types';
import { getPersistedQtBuildMode, isQtProjectManifestPath, qtGeneratedDirectory, readQtProjectManifest } from '../model/qtProjectManifest';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

export type QpmTreeNode = WorkspaceNode | ProjectNode | FolderNode | FileNode | GeneratedFolderNode | GeneratedFileNode | PlaceholderNode;

export interface WorkspaceNode { kind: 'workspace'; }
export interface ProjectNode { kind: 'project'; ref: QpmWorkspaceProjectRef; }
export interface FolderNode { kind: 'folder'; ref: QpmWorkspaceProjectRef; project: QpmProject; folderPath: string; }
export interface FileNode { kind: 'file'; ref: QpmWorkspaceProjectRef; file: QpmProjectFile; }
export interface GeneratedFolderNode { kind: 'generatedFolder'; ref: QpmWorkspaceProjectRef; absolutePath: string; label: string; mode: QpmBuildMode; root: boolean; }
export interface GeneratedFileNode { kind: 'generatedFile'; ref: QpmWorkspaceProjectRef; absolutePath: string; }
export interface PlaceholderNode { kind: 'placeholder'; label: string; }

export class QpmTreeProvider implements vscode.TreeDataProvider<QpmTreeNode>, vscode.TreeDragAndDropController<QpmTreeNode>, vscode.Disposable {
  private static readonly dragMimeType = 'application/vnd.code.tree.qpm.workspaceexplorer';

  readonly dragMimeTypes = [QpmTreeProvider.dragMimeType];
  readonly dropMimeTypes = [QpmTreeProvider.dragMimeType];
  private readonly changeEmitter = new vscode.EventEmitter<QpmTreeNode | undefined | null | void>();
  private readonly disposables: vscode.Disposable[] = [];
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly workspaces: QpmWorkspaceService) {
    this.disposables.push(
      this.workspaces.onDidChange(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('qpm.buildMode')) this.refresh();
      })
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.changeEmitter.dispose();
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  handleDrag(source: readonly QpmTreeNode[], dataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): void {
    const files = source
      .filter((node): node is FileNode => node.kind === 'file')
      .map((node) => ({
        projectPath: node.ref.absolutePath,
        projectIndex: node.ref.index,
        sectionName: node.file.sectionName,
        filePath: node.file.absolutePath,
        fileName: path.basename(node.file.absolutePath)
      }));

    if (files.length === 0) {
      return;
    }

    dataTransfer.set(QpmTreeProvider.dragMimeType, new vscode.DataTransferItem(JSON.stringify({ files })));
  }

  async handleDrop(target: QpmTreeNode | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    if (token.isCancellationRequested) {
      return;
    }

    const transfer = dataTransfer.get(QpmTreeProvider.dragMimeType);
    if (!transfer) {
      return;
    }

    const dropTarget = this.dropTargetForNode(target);
    if (!dropTarget) {
      vscode.window.showInformationMessage('Drop project files onto a QPM folder or onto a project root to move them.');
      return;
    }

    const payload = this.parseDragPayload(transfer.value);
    const matchingFiles = payload.files.filter((file) => path.normalize(file.projectPath).toLowerCase() === path.normalize(dropTarget.ref.absolutePath).toLowerCase());
    if (matchingFiles.length === 0) {
      vscode.window.showWarningMessage('Files can only be moved inside their own QPM project.');
      return;
    }

    if (isQtProjectManifestPath(dropTarget.ref.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt manifest folders are structural; drag/drop reclassification is not applied.');
      return;
    }

    await this.workspaces.moveFilesToFolder(
      dropTarget.ref,
      matchingFiles.map((file) => file.sectionName),
      dropTarget.folderPath,
      { silent: true }
    );
  }

  private dropTargetForNode(node: QpmTreeNode | undefined): { ref: QpmWorkspaceProjectRef; folderPath: string } | undefined {
    if (!node) {
      return undefined;
    }
    if (node.kind === 'folder') {
      return { ref: node.ref, folderPath: node.folderPath };
    }
    if (node.kind === 'project') {
      return { ref: node.ref, folderPath: '' };
    }
    return undefined;
  }

  private parseDragPayload(value: unknown): { files: Array<{ projectPath: string; projectIndex: number; sectionName: string; filePath: string; fileName: string }> } {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && Array.isArray(parsed.files)) {
          return { files: parsed.files.filter((file: unknown): file is { projectPath: string; projectIndex: number; sectionName: string; filePath: string; fileName: string } => {
            const candidate = file as { projectPath?: unknown; projectIndex?: unknown; sectionName?: unknown; filePath?: unknown; fileName?: unknown };
            return typeof candidate.projectPath === 'string'
              && typeof candidate.projectIndex === 'number'
              && typeof candidate.sectionName === 'string'
              && typeof candidate.filePath === 'string'
              && typeof candidate.fileName === 'string';
          }) };
        }
      } catch {
        return { files: [] };
      }
    }
    return { files: [] };
  }

  getTreeItem(element: QpmTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'workspace': return this.workspaceItem();
      case 'project': return this.projectItem(element);
      case 'folder': return this.folderItem(element);
      case 'file': return this.fileItem(element);
      case 'generatedFolder': return this.generatedFolderItem(element);
      case 'generatedFile': return this.generatedFileItem(element);
      case 'placeholder': return this.placeholderItem(element);
    }
  }

  getChildren(element?: QpmTreeNode): QpmTreeNode[] {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      return [];
    }
    if (!element) {
      return [{ kind: 'workspace' }];
    }

    switch (element.kind) {
      case 'workspace':
        return workspace.projects.map((ref) => ({ kind: 'project', ref }));
      case 'project': {
        const project = this.workspaces.getProject(element.ref);
        if (!project) {
          return [{ kind: 'placeholder', label: element.ref.exists ? 'Unable to parse project' : 'Project file not found' }];
        }
        const projectChildren = this.childrenForFolder(element.ref, project, '');
        const generated = this.generatedRootForProject(element.ref);
        return generated ? [...projectChildren, generated] : projectChildren;
      }
      case 'folder':
        return this.childrenForFolder(element.ref, element.project, element.folderPath);
      case 'generatedFolder':
        return this.childrenForGeneratedFolder(element);
      case 'file':
      case 'generatedFile':
      case 'placeholder':
        return [];
    }
  }

  private childrenForFolder(ref: QpmWorkspaceProjectRef, project: QpmProject, parentFolder: string): QpmTreeNode[] {
    const directFolders = new Set<string>();
    const directFiles: FileNode[] = [];

    for (const file of project.files) {
      const folder = normalizeLogicalFolder(file.folder);
      if (folder === parentFolder) {
        directFiles.push({ kind: 'file', ref, file });
      }
      if (folder.startsWith(parentFolder ? `${parentFolder}/` : '')) {
        const remainder = parentFolder ? folder.slice(parentFolder.length + 1) : folder;
        const nextSegment = remainder.split('/')[0];
        if (nextSegment && `${parentFolder ? `${parentFolder}/` : ''}${nextSegment}` !== parentFolder) {
          directFolders.add(`${parentFolder ? `${parentFolder}/` : ''}${nextSegment}`);
        }
      }
    }

    for (const declared of project.folders) {
      const folder = normalizeLogicalFolder(declared);
      if (folder.startsWith(parentFolder ? `${parentFolder}/` : '')) {
        const remainder = parentFolder ? folder.slice(parentFolder.length + 1) : folder;
        const nextSegment = remainder.split('/')[0];
        if (nextSegment) {
          directFolders.add(`${parentFolder ? `${parentFolder}/` : ''}${nextSegment}`);
        }
      }
    }

    const folders: FolderNode[] = [...directFolders]
      .filter((folder) => folder !== parentFolder)
      .sort((a, b) => a.localeCompare(b))
      .map((folderPath) => ({ kind: 'folder', ref, project, folderPath }));

    directFiles.sort((a, b) => path.basename(a.file.absolutePath).localeCompare(path.basename(b.file.absolutePath)));
    return [...folders, ...directFiles];
  }

  private generatedRootForProject(ref: QpmWorkspaceProjectRef): GeneratedFolderNode | undefined {
    if (!ref.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      return undefined;
    }
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const mode = getPersistedQtBuildMode(manifest);
      return {
        kind: 'generatedFolder',
        ref,
        absolutePath: qtGeneratedDirectory(ref.absolutePath, mode, manifest),
        label: 'Generated Files',
        mode,
        root: true
      };
    } catch {
      return undefined;
    }
  }

  private childrenForGeneratedFolder(node: GeneratedFolderNode): QpmTreeNode[] {
    if (!fs.existsSync(node.absolutePath)) {
      return [{ kind: 'placeholder', label: 'No generated files yet — build the project first' }];
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(node.absolutePath, { withFileTypes: true });
    } catch {
      return [{ kind: 'placeholder', label: 'Unable to read generated files' }];
    }

    const visibleEntries = entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    if (visibleEntries.length === 0) {
      return [{ kind: 'placeholder', label: 'Generated directory is empty' }];
    }

    return visibleEntries.map((entry): QpmTreeNode => {
      const absolutePath = path.join(node.absolutePath, entry.name);
      if (entry.isDirectory()) {
        return { kind: 'generatedFolder', ref: node.ref, absolutePath, label: entry.name, mode: node.mode, root: false };
      }
      return { kind: 'generatedFile', ref: node.ref, absolutePath };
    });
  }

  private workspaceItem(): vscode.TreeItem {
    const workspace = this.workspaces.currentWorkspace!;
    const item = new vscode.TreeItem(workspace.name, vscode.TreeItemCollapsibleState.Expanded);
    item.description = workspace.path.toLowerCase().endsWith('.qtproject.json') ? 'native Qt project' : path.extname(workspace.path).toLowerCase() === '.cws' ? `${workspace.projects.length} project(s)` : 'compatibility project';
    item.tooltip = workspace.path;
    item.contextValue = 'qpmWorkspace';
    item.iconPath = new vscode.ThemeIcon('root-folder');
    return item;
  }

  private projectItem(node: ProjectNode): vscode.TreeItem {
    const workspace = this.workspaces.currentWorkspace!;
    const active = node.ref.index === workspace.activeProjectIndex;
    const project = this.workspaces.getProject(node.ref);
    const item = new vscode.TreeItem(node.ref.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = `${active ? 'active · ' : ''}${project?.targetType ?? (node.ref.exists ? 'project' : 'missing')}`;
    item.tooltip = node.ref.absolutePath;
    item.contextValue = isQtProjectManifestPath(node.ref.absolutePath) ? 'qpmProjectNative' : 'qpmProjectCompatibility';
    item.iconPath = new vscode.ThemeIcon(active ? 'star-full' : node.ref.exists ? 'project' : 'warning');
    return item;
  }

  private folderItem(node: FolderNode): vscode.TreeItem {
    const label = node.folderPath.split('/').pop() ?? node.folderPath;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'qpmFolder';
    item.tooltip = `Logical folder: ${node.folderPath}`;
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  private fileItem(node: FileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(`└─ ${path.basename(node.file.absolutePath)}`, vscode.TreeItemCollapsibleState.None);
    item.description = statusDescription(node.file);
    item.tooltip = [
      node.file.type,
      node.file.absolutePath,
      node.file.excluded ? 'Excluded from build' : 'Included in build',
      node.file.type === 'CSource' ? `.Obj option: ${node.file.compileIntoObjectFile ? 'enabled' : 'disabled'}` : undefined
    ].filter(Boolean).join('\n');
    item.contextValue = contextValueForFile(node.file);
    item.iconPath = new vscode.ThemeIcon(iconForFile(node.file));
    item.resourceUri = vscode.Uri.file(node.file.absolutePath);
    const extension = path.extname(node.file.absolutePath).toLowerCase();
    item.command = extension === '.ui'
      ? { command: 'qpm.openQtDesigner', title: 'Open in Qt Widgets Designer', arguments: [node] }
      : extension === '.qrc'
        ? { command: 'qpm.openQrcEditor', title: 'Open in Qt Resource Editor', arguments: [node] }
        : extension === '.ts' || extension === '.xlf'
          ? { command: 'qpm.openTranslationInLinguist', title: 'Open in Qt Linguist', arguments: [node] }
      : isPanel(node.file)
        ? { command: 'qpm.openFile', title: 'Open File', arguments: [node] }
        : isFunctionPanel(node.file)
          ? { command: 'qpm.openFunctionPanel', title: 'Open Function Panel', arguments: [node] }
          : { command: 'qpm.openFile', title: 'Open File', arguments: [node] };
    return item;
  }

  private generatedFolderItem(node: GeneratedFolderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = node.root ? `${buildModeLabel(node.mode)} · generated` : undefined;
    item.contextValue = 'qpmGeneratedFolder';
    item.tooltip = node.root
      ? `Qt generated files (${buildModeLabel(node.mode)})\n${node.absolutePath}\nMOC/UIC/RCC artifacts are regenerated during builds; edit the source .h/.ui/.qrc files instead.`
      : node.absolutePath;
    item.iconPath = new vscode.ThemeIcon(node.root ? 'symbol-namespace' : 'folder');
    item.resourceUri = vscode.Uri.file(node.absolutePath);
    return item;
  }

  private generatedFileItem(node: GeneratedFileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(`└─ ${path.basename(node.absolutePath)}`, vscode.TreeItemCollapsibleState.None);
    item.description = generatedArtifactDescription(node.absolutePath);
    item.tooltip = `${node.absolutePath}\nGenerated Qt artifact — changes may be overwritten on the next build.`;
    item.contextValue = 'qpmGeneratedFile';
    item.iconPath = new vscode.ThemeIcon(iconForPath(node.absolutePath));
    item.resourceUri = vscode.Uri.file(node.absolutePath);
    item.command = { command: 'qpm.openGeneratedFile', title: 'Open Generated File', arguments: [node] };
    return item;
  }

  private placeholderItem(node: PlaceholderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('warning');
    return item;
  }
}

function normalizeLogicalFolder(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function isPanel(file: QpmProjectFile): boolean {
  return file.type === 'User Interface Resource' || path.extname(file.absolutePath).toLowerCase() === '.uir';
}

function isFunctionPanel(file: QpmProjectFile): boolean {
  return file.type === 'Function Panel' || path.extname(file.absolutePath).toLowerCase() === '.fp';
}

function contextValueForFile(file: QpmProjectFile): string {
  const extension = path.extname(file.absolutePath).toLowerCase();
  const kind = file.type === 'CSource' ? 'source'
    : extension === '.ui' ? 'form'
      : extension === '.qrc' ? 'resource'
        : extension === '.qml' || extension === '.js' || extension === '.mjs' ? 'qml'
          : extension === '.py' || extension === '.pyi' ? 'python'
          : extension === '.ts' || extension === '.qm' ? 'translation'
            : isPanel(file) ? 'panel'
              : isFunctionPanel(file) ? 'functionPanel'
                : file.type === 'Include' ? 'header'
                  : file.type === 'Library' ? 'library'
                    : 'other';
  const build = file.excluded ? 'excluded' : 'included';
  const obj = file.type === 'CSource' ? (file.compileIntoObjectFile ? 'objOn' : 'objOff') : 'objNA';
  return `qpmFile.${kind}.${build}.${obj}`;
}

function statusDescription(file: QpmProjectFile): string | undefined {
  const parts: string[] = [];
  if (file.excluded) {
    parts.push('excluded');
  }
  if (!file.exists) {
    parts.push('missing');
  }
  if (file.type === 'CSource' && file.compileIntoObjectFile) {
    parts.push('.obj');
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function iconForFile(file: QpmProjectFile): string {
  if (!fs.existsSync(file.absolutePath)) {
    return 'warning';
  }
  return iconForPath(file.absolutePath);
}

function iconForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.c':
    case '.cc':
    case '.cpp':
    case '.cxx': return 'file-code';
    case '.h':
    case '.hh':
    case '.hpp':
    case '.hxx': return 'symbol-interface';
    case '.ui': return 'layout';
    case '.qrc': return 'package';
    case '.qml': return 'symbol-color';
    case '.py':
    case '.pyi': return 'file-code';
    case '.ts':
    case '.qm': return 'globe';
    case '.uir': return 'preview';
    case '.lib':
    case '.a': return 'library';
    case '.fp': return 'symbol-method';
    default: return 'file';
  }
}

function buildModeLabel(mode: QpmBuildMode): string {
  switch (mode) {
    case 'debug': return 'Debug';
    case 'release': return 'Release';
    case 'debug64': return 'Debug x64';
    case 'release64': return 'Release x64';
  }
}

function generatedArtifactDescription(filePath: string): string {
  const name = path.basename(filePath).toLowerCase();
  if (name.startsWith('moc_') && ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(name))) return 'MOC · generated';
  if (name.startsWith('ui_') && ['.h', '.hh', '.hpp', '.hxx'].includes(path.extname(name))) return 'UIC · generated';
  if (name.startsWith('qrc_') && ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(name))) return 'RCC · generated';
  return 'generated';
}
