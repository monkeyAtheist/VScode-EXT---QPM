"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpmTreeProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
class QpmTreeProvider {
    workspaces;
    changeEmitter = new vscode.EventEmitter();
    disposables = [];
    onDidChangeTreeData = this.changeEmitter.event;
    constructor(workspaces) {
        this.workspaces = workspaces;
        this.disposables.push(this.workspaces.onDidChange(() => this.refresh()), vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('qpm.buildMode'))
                this.refresh();
        }));
    }
    dispose() {
        for (const disposable of this.disposables)
            disposable.dispose();
        this.changeEmitter.dispose();
    }
    refresh() {
        this.changeEmitter.fire();
    }
    getTreeItem(element) {
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
    getChildren(element) {
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
    childrenForFolder(ref, project, parentFolder) {
        const directFolders = new Set();
        const directFiles = [];
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
        const folders = [...directFolders]
            .filter((folder) => folder !== parentFolder)
            .sort((a, b) => a.localeCompare(b))
            .map((folderPath) => ({ kind: 'folder', ref, project, folderPath }));
        directFiles.sort((a, b) => path.basename(a.file.absolutePath).localeCompare(path.basename(b.file.absolutePath)));
        return [...folders, ...directFiles];
    }
    generatedRootForProject(ref) {
        if (!ref.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            return undefined;
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            const mode = (0, qtProjectManifest_1.getPersistedQtBuildMode)(manifest);
            return {
                kind: 'generatedFolder',
                ref,
                absolutePath: (0, qtProjectManifest_1.qtGeneratedDirectory)(ref.absolutePath, mode, manifest),
                label: 'Generated Files',
                mode,
                root: true
            };
        }
        catch {
            return undefined;
        }
    }
    childrenForGeneratedFolder(node) {
        if (!fs.existsSync(node.absolutePath)) {
            return [{ kind: 'placeholder', label: 'No generated files yet — build the project first' }];
        }
        let entries;
        try {
            entries = fs.readdirSync(node.absolutePath, { withFileTypes: true });
        }
        catch {
            return [{ kind: 'placeholder', label: 'Unable to read generated files' }];
        }
        const visibleEntries = entries
            .filter((entry) => entry.isDirectory() || entry.isFile())
            .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory())
                return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        if (visibleEntries.length === 0) {
            return [{ kind: 'placeholder', label: 'Generated directory is empty' }];
        }
        return visibleEntries.map((entry) => {
            const absolutePath = path.join(node.absolutePath, entry.name);
            if (entry.isDirectory()) {
                return { kind: 'generatedFolder', ref: node.ref, absolutePath, label: entry.name, mode: node.mode, root: false };
            }
            return { kind: 'generatedFile', ref: node.ref, absolutePath };
        });
    }
    workspaceItem() {
        const workspace = this.workspaces.currentWorkspace;
        const item = new vscode.TreeItem(workspace.name, vscode.TreeItemCollapsibleState.Expanded);
        item.description = workspace.path.toLowerCase().endsWith('.qtproject.json') ? 'native Qt project' : path.extname(workspace.path).toLowerCase() === '.cws' ? `${workspace.projects.length} project(s)` : 'compatibility project';
        item.tooltip = workspace.path;
        item.contextValue = 'qpmWorkspace';
        item.iconPath = new vscode.ThemeIcon('root-folder');
        return item;
    }
    projectItem(node) {
        const workspace = this.workspaces.currentWorkspace;
        const active = node.ref.index === workspace.activeProjectIndex;
        const project = this.workspaces.getProject(node.ref);
        const item = new vscode.TreeItem(node.ref.name, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = `${active ? 'active · ' : ''}${project?.targetType ?? (node.ref.exists ? 'project' : 'missing')}`;
        item.tooltip = node.ref.absolutePath;
        item.contextValue = (0, qtProjectManifest_1.isQtProjectManifestPath)(node.ref.absolutePath) ? 'qpmProjectNative' : 'qpmProjectCompatibility';
        item.iconPath = new vscode.ThemeIcon(active ? 'star-full' : node.ref.exists ? 'project' : 'warning');
        return item;
    }
    folderItem(node) {
        const label = node.folderPath.split('/').pop() ?? node.folderPath;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.contextValue = 'qpmFolder';
        item.tooltip = `Logical folder: ${node.folderPath}`;
        item.iconPath = new vscode.ThemeIcon('folder');
        return item;
    }
    fileItem(node) {
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
    generatedFolderItem(node) {
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
    generatedFileItem(node) {
        const item = new vscode.TreeItem(`└─ ${path.basename(node.absolutePath)}`, vscode.TreeItemCollapsibleState.None);
        item.description = generatedArtifactDescription(node.absolutePath);
        item.tooltip = `${node.absolutePath}\nGenerated Qt artifact — changes may be overwritten on the next build.`;
        item.contextValue = 'qpmGeneratedFile';
        item.iconPath = new vscode.ThemeIcon(iconForPath(node.absolutePath));
        item.resourceUri = vscode.Uri.file(node.absolutePath);
        item.command = { command: 'qpm.openGeneratedFile', title: 'Open Generated File', arguments: [node] };
        return item;
    }
    placeholderItem(node) {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
    }
}
exports.QpmTreeProvider = QpmTreeProvider;
function normalizeLogicalFolder(value) {
    return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}
function isPanel(file) {
    return file.type === 'User Interface Resource' || path.extname(file.absolutePath).toLowerCase() === '.uir';
}
function isFunctionPanel(file) {
    return file.type === 'Function Panel' || path.extname(file.absolutePath).toLowerCase() === '.fp';
}
function contextValueForFile(file) {
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
function statusDescription(file) {
    const parts = [];
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
function iconForFile(file) {
    if (!fs.existsSync(file.absolutePath)) {
        return 'warning';
    }
    return iconForPath(file.absolutePath);
}
function iconForPath(filePath) {
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
function buildModeLabel(mode) {
    switch (mode) {
        case 'debug': return 'Debug';
        case 'release': return 'Release';
        case 'debug64': return 'Debug x64';
        case 'release64': return 'Release x64';
    }
}
function generatedArtifactDescription(filePath) {
    const name = path.basename(filePath).toLowerCase();
    if (name.startsWith('moc_') && ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(name)))
        return 'MOC · generated';
    if (name.startsWith('ui_') && ['.h', '.hh', '.hpp', '.hxx'].includes(path.extname(name)))
        return 'UIC · generated';
    if (name.startsWith('qrc_') && ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(name)))
        return 'RCC · generated';
    return 'generated';
}
