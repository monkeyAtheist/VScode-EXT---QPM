import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { QpmProject, QpmProjectFile, QpmWorkspaceProjectRef } from '../model/types';
import { isQtProjectManifestPath } from '../model/qtProjectManifest';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';

export type QpmTreeNode = WorkspaceNode | ProjectNode | FolderNode | FileNode | PlaceholderNode;

export interface WorkspaceNode { kind: 'workspace'; }
export interface ProjectNode { kind: 'project'; ref: QpmWorkspaceProjectRef; }
export interface FolderNode { kind: 'folder'; ref: QpmWorkspaceProjectRef; project: QpmProject; folderPath: string; }
export interface FileNode { kind: 'file'; ref: QpmWorkspaceProjectRef; file: QpmProjectFile; }
export interface PlaceholderNode { kind: 'placeholder'; label: string; }

export class QpmTreeProvider implements vscode.TreeDataProvider<QpmTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<QpmTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly workspaces: QpmWorkspaceService) {
    this.workspaces.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: QpmTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'workspace': return this.workspaceItem();
      case 'project': return this.projectItem(element);
      case 'folder': return this.folderItem(element);
      case 'file': return this.fileItem(element);
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
        return this.childrenForFolder(element.ref, project, '');
      }
      case 'folder':
        return this.childrenForFolder(element.ref, element.project, element.folderPath);
      case 'file':
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
  switch (path.extname(file.absolutePath).toLowerCase()) {
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
