import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { QpmParser, defaultFolderForType } from '../model/qpmParser';
import { QpmProject, QpmProjectFile, QpmWorkspace, QpmWorkspaceProjectRef } from '../model/types';
import { QpmInstallationService } from './qpmInstallationService';
import { QpmTemplateService } from './qpmTemplateService';
import { QpmSdlService, QpmSdlInstallation, QpmSdlRuntimeMode, QpmSdlResolvedVersion } from './qpmSdlService';
import { isQtProjectManifestPath, migrateQtProjectManifestFile, QT_PROJECT_SCHEMA_VERSION, qtManifestToQpmProject, qtManifestToStandaloneWorkspace, readQtProjectManifest, writeQtProjectManifest } from '../model/qtProjectManifest';
import { QpmQtProjectService } from './qpmQtProjectService';
import { inspectQpmWorkspaceAssociation, removeQpmWorkspaceAssociation, writeQpmWorkspaceAssociation } from '../utils/qpmWorkspaceAssociation';

const LAST_WORKSPACE_KEY = 'qpm.lastWorkspace';
const GLOBAL_LAST_WORKSPACE_KEY = 'qpm.lastWorkspace.global';

export class QpmWorkspaceService implements vscode.Disposable {
  private workspace: QpmWorkspace | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly parser: QpmParser,
    private readonly installations: QpmInstallationService,
    private readonly templates: QpmTemplateService,
    private readonly sdl: QpmSdlService,
    private readonly qtProjects: QpmQtProjectService,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        const extension = path.extname(document.uri.fsPath).toLowerCase();
        if (extension === '.prj' || extension === '.cws' || isQtProjectManifestPath(document.uri.fsPath)) {
          this.refresh();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.autoLoad())
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.changeEmitter.dispose();
  }

  get currentWorkspace(): QpmWorkspace | undefined {
    return this.workspace;
  }

  get activeProjectRef(): QpmWorkspaceProjectRef | undefined {
    return this.workspace?.projects.find((project) => project.index === this.workspace?.activeProjectIndex);
  }

  get activeProject(): QpmProject | undefined {
    const project = this.activeProjectRef;
    if (!project?.exists) {
      return undefined;
    }
    return this.parseProjectPath(project.absolutePath);
  }

  findProjectRefForPath(filePath: string): QpmWorkspaceProjectRef | undefined {
    const target = normalizeComparablePath(filePath);
    return this.workspace?.projects
      .filter((project) => project.exists)
      .map((project) => ({ project, root: path.dirname(path.resolve(project.absolutePath)) }))
      .filter(({ root }) => {
        const comparableRoot = normalizeComparablePath(root);
        return target === comparableRoot || target.startsWith(`${comparableRoot}${path.sep}`);
      })
      .sort((a, b) => b.root.length - a.root.length)[0]?.project;
  }

  getProject(projectRef: QpmWorkspaceProjectRef): QpmProject | undefined {
    if (!projectRef.exists) {
      return undefined;
    }
    try {
      return this.parseProjectPath(projectRef.absolutePath);
    } catch (error) {
      this.output.appendLine(`[QPM] Cannot parse project ${projectRef.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async restoreOrAutoLoad(): Promise<void> {
    const attempted = new Set<string>();
    let restoreFailure: string | undefined;

    // The workspace explicitly loaded in this VS Code window must win over a
    // project-folder association. Otherwise an older folder that remains open
    // can silently replace the user's most recently selected QPM workspace on
    // the next VS Code launch.
    const windowWorkspace = this.context.workspaceState.get<string>(LAST_WORKSPACE_KEY);
    if (windowWorkspace) {
      attempted.add(this.workspacePersistenceIdentity(windowWorkspace));
      if (await this.tryRestoreWorkspace(windowWorkspace, 'last used workspace for this VS Code window')) {
        return;
      }
      await this.context.workspaceState.update(LAST_WORKSPACE_KEY, undefined);
      restoreFailure = `The last Qt workspace for this VS Code window no longer exists or has no existing project: ${windowWorkspace}`;
    }

    const associatedWorkspace = this.findAssociatedWorkspaceFromOpenFolders();
    if (associatedWorkspace && !attempted.has(this.workspacePersistenceIdentity(associatedWorkspace))) {
      attempted.add(this.workspacePersistenceIdentity(associatedWorkspace));
      if (await this.tryRestoreWorkspace(associatedWorkspace, 'folder association')) {
        return;
      }
      restoreFailure ??= `The associated Qt workspace is no longer usable: ${associatedWorkspace}`;
    }

    // Empty/untitled VS Code windows do not always keep a stable workspaceState
    // identity. Keep a global fallback so the last explicitly loaded QPM
    // workspace can still be restored after a complete application restart.
    const globalWorkspace = this.context.globalState?.get<string>(GLOBAL_LAST_WORKSPACE_KEY);
    if (globalWorkspace && !attempted.has(this.workspacePersistenceIdentity(globalWorkspace))) {
      attempted.add(this.workspacePersistenceIdentity(globalWorkspace));
      if (await this.tryRestoreWorkspace(globalWorkspace, 'last globally used workspace')) {
        await this.context.workspaceState.update(LAST_WORKSPACE_KEY, path.resolve(globalWorkspace));
        return;
      }
      await this.context.globalState?.update(GLOBAL_LAST_WORKSPACE_KEY, undefined);
      restoreFailure ??= `The last globally used Qt workspace no longer exists or has no existing project: ${globalWorkspace}`;
    } else if (globalWorkspace && attempted.has(this.workspacePersistenceIdentity(globalWorkspace)) && restoreFailure) {
      await this.context.globalState?.update(GLOBAL_LAST_WORKSPACE_KEY, undefined);
    }

    await this.autoLoad(true);
    if (!this.workspace && restoreFailure) {
      this.output.appendLine(`[QPM] ${restoreFailure}`);
      this.output.appendLine('[QPM] Starting with the blank Qt Project Manager page.');
      this.changeEmitter.fire();
    }
  }

  private async tryRestoreWorkspace(filePath: string, source: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) {
      this.output.appendLine(`[QPM] Skipped ${source}: file no longer exists: ${filePath}`);
      return false;
    }
    try {
      if (!this.isRestorableWorkspace(filePath)) {
        this.output.appendLine(`[QPM] Skipped ${source}: the workspace only references missing projects: ${filePath}`);
        return false;
      }
      await this.load(filePath);
      return true;
    } catch (error) {
      this.output.appendLine(`[QPM] Cannot restore ${source} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private isRestorableWorkspace(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    const extension = path.extname(filePath).toLowerCase();
    if (isQtProjectManifestPath(filePath) || extension === '.prj') {
      return true;
    }
    if (extension !== '.cws') {
      return false;
    }
    const workspace = this.parser.parseWorkspace(filePath);
    return workspace.projects.length === 0 || workspace.projects.some((project) => project.exists);
  }

  private workspacePersistenceIdentity(filePath: string): string {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private async persistLastWorkspace(filePath: string): Promise<string> {
    const resolved = path.resolve(filePath);
    await this.context.workspaceState.update(LAST_WORKSPACE_KEY, resolved);
    await this.context.globalState?.update(GLOBAL_LAST_WORKSPACE_KEY, resolved);
    return resolved;
  }

  private async clearPersistedWorkspace(reason: string): Promise<void> {
    this.workspace = undefined;
    await this.context.workspaceState.update(LAST_WORKSPACE_KEY, undefined);
    // Keep the global fallback here: this method is also used when a single
    // folder association becomes stale, which must not erase another valid
    // workspace that was last used in a different VS Code window.
    this.output.appendLine(`[QPM] ${reason}`);
    this.output.appendLine('[QPM] Starting with the blank Qt Project Manager page.');
    this.changeEmitter.fire();
  }

  async autoLoad(skipFolderAssociation = false): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('qpm').get<boolean>('autoLoadWorkspace', true);
    if (!enabled || this.workspace) {
      return;
    }

    const associatedWorkspace = skipFolderAssociation ? undefined : this.findAssociatedWorkspaceFromOpenFolders();
    if (associatedWorkspace) {
      if (!(await this.tryRestoreWorkspace(associatedWorkspace, 'folder association'))) {
        await this.clearPersistedWorkspace(`The associated Qt workspace is no longer usable: ${associatedWorkspace}`);
      }
      return;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    const candidates = new Set<string>();
    for (const folder of folders) {
      // Only inspect the exact VS Code folder. Recursive discovery in a broad
      // parent such as Downloads could reopen an unrelated historical project
      // and made extension activation unnecessarily expensive.
      this.findFilesAtLimitedDepth(folder.uri.fsPath, '.cws', 0).forEach((candidate) => candidates.add(path.resolve(candidate)));
      this.findFilesBySuffixAtLimitedDepth(folder.uri.fsPath, '.qtproject.json', 0).forEach((candidate) => candidates.add(path.resolve(candidate)));
    }
    if (candidates.size === 1) {
      const candidate = [...candidates][0];
      if (candidate) {
        await this.tryRestoreWorkspace(candidate, 'exact-folder auto detection');
      }
    }
  }

  async openWorkspace(): Promise<void> {
    const files = await vscode.window.showOpenDialog({
      title: 'Open a Qt workspace or project',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Qt workspace or project': ['cws', 'prj', 'json'] }
    });
    if (files?.[0]) {
      await this.load(files[0].fsPath);
    }
  }

  async load(filePath: string): Promise<void> {
    filePath = path.resolve(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const nativeManifest = isQtProjectManifestPath(filePath);
    if (extension !== '.cws' && extension !== '.prj' && !nativeManifest) {
      throw new Error('Select a .qtproject.json project, .cws workspace or .prj compatibility project.');
    }
    if (nativeManifest && migrateQtProjectManifestFile(filePath)) {
      this.output.appendLine(`[QPM] Migrated Qt manifest to schema v${QT_PROJECT_SCHEMA_VERSION}: ${filePath}`);
    }
    this.workspace = nativeManifest ? qtManifestToStandaloneWorkspace(filePath) : extension === '.cws' ? this.parser.parseWorkspace(filePath) : this.parser.parseStandaloneProject(filePath);
    if (extension === '.cws') {
      for (const project of this.workspace.projects.filter((entry) => entry.exists && isQtProjectManifestPath(entry.absolutePath))) {
        if (migrateQtProjectManifestFile(project.absolutePath)) this.output.appendLine(`[QPM] Migrated Qt manifest to schema v${QT_PROJECT_SCHEMA_VERSION}: ${project.absolutePath}`);
      }
    }
    this.writeWorkspaceAssociationMarkers();
    filePath = await this.persistLastWorkspace(filePath);
    this.output.appendLine(`[QPM] Loaded ${extension === '.cws' ? 'workspace' : nativeManifest ? 'native Qt project' : 'compatibility project'}: ${filePath}`);
    this.changeEmitter.fire();
    if (extension === '.cws') {
      const issues = this.parser.inspectWorkspaceCompatibility(filePath);
      if (issues.length > 0) {
        this.output.appendLine('[QPM] Native workspace compatibility issues detected:');
        issues.forEach((issue) => this.output.appendLine(`  - ${issue}`));
        void vscode.window.showWarningMessage(
          `${path.basename(filePath)} contains ${issues.length} Qt workspace compatibility issue(s). Repair the native workspace before saving new run settings.`,
          'Repair workspace',
          'Ignore'
        ).then((answer) => answer === 'Repair workspace' ? this.repairNativeWorkspaceCompatibility() : undefined);
      }
    }
  }

  private findAssociatedWorkspaceFromOpenFolders(): string | undefined {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const inspection = inspectQpmWorkspaceAssociation(folder.uri.fsPath, true);
      if (inspection.valid && inspection.workspacePath) {
        this.output.appendLine(`[QPM] Restoring workspace association from ${folder.uri.fsPath}: ${inspection.workspacePath}`);
        return inspection.workspacePath;
      }
      if (inspection.stale) {
        this.output.appendLine(`[QPM] Removed stale Qt workspace association ${inspection.markerPath}: ${inspection.reason ?? 'invalid association'}`);
      }
    }
    return undefined;
  }

  private writeWorkspaceAssociationMarkers(): void {
    const workspace = this.workspace;
    if (!workspace) {
      return;
    }
    for (const project of workspace.projects) {
      if (!project.exists || !isQtProjectManifestPath(project.absolutePath)) {
        continue;
      }
      try {
        const markerPath = writeQpmWorkspaceAssociation(path.dirname(project.absolutePath), workspace.path, project.absolutePath);
        this.output.appendLine(`[QPM] Qt workspace association synchronized: ${markerPath}`);
      } catch (error) {
        this.output.appendLine(`[QPM] Could not write the Qt workspace association for ${project.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  async repairNativeWorkspaceCompatibility(): Promise<void> {
    const workspace = this.workspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      vscode.window.showErrorMessage('Open a .cws Qt workspace before running the compatibility repair.');
      return;
    }
    const result = this.parser.repairWorkspaceCompatibility(workspace.path);
    if (!result.changed) {
      vscode.window.showInformationMessage(`${path.basename(workspace.path)} does not require a native QPM compatibility repair.`);
      return;
    }
    this.output.appendLine(`[QPM] Native workspace compatibility repair applied to ${workspace.path}:`);
    result.changes.forEach((change) => this.output.appendLine(`  - ${change}`));
    this.refresh();
    vscode.window.showInformationMessage(`Repaired ${path.basename(workspace.path)}. A backup was stored in .vscode/qpm-native-backups.`);
  }

  refresh(): void {
    if (!this.workspace) {
      this.changeEmitter.fire();
      return;
    }
    try {
      const currentPath = this.workspace.path;
      this.workspace = isQtProjectManifestPath(currentPath)
        ? qtManifestToStandaloneWorkspace(currentPath)
        : path.extname(currentPath).toLowerCase() === '.cws'
          ? this.parser.parseWorkspace(currentPath)
          : this.parser.parseStandaloneProject(currentPath);
    } catch (error) {
      this.output.appendLine(`[QPM] Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.changeEmitter.fire();
  }

  async createWorkspaceProject(): Promise<void> {
    const folder = await vscode.window.showOpenDialog({
      title: 'Select the directory for the new Qt workspace',
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!folder?.[0]) return;

    const workspaceName = await vscode.window.showInputBox({
      title: 'Create a Qt workspace',
      prompt: 'Workspace file name without the .cws extension',
      value: 'Qt_Workspace',
      validateInput: validateBaseName
    });
    if (!workspaceName) return;

    const workspacePath = path.join(folder[0].fsPath, `${workspaceName}.cws`);
    if (fs.existsSync(workspacePath)) {
      vscode.window.showErrorMessage(`The Qt workspace already exists: ${workspacePath}`);
      return;
    }

    const manifestPath = await this.qtProjects.createProjectWizard(folder[0].fsPath);
    if (!manifestPath) return;
    const formatVersion = vscode.workspace.getConfiguration('qpm').get<number>('projectFormatVersion', 1200);
    this.parser.createWorkspace(folder[0].fsPath, workspaceName, manifestPath, undefined, formatVersion);
    await this.load(workspacePath);
    vscode.window.showInformationMessage(`Created native Qt workspace ${path.basename(workspacePath)} with ${path.basename(manifestPath)}.`);
  }

  async createSdlWorkspaceProject(): Promise<void> {
    const folder = await vscode.window.showOpenDialog({
      title: 'Select the directory for the new SDL Qt workspace',
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!folder?.[0]) {
      return;
    }

    const workspaceName = await vscode.window.showInputBox({
      title: 'Create an SDL Qt workspace',
      prompt: 'Workspace file name without the .cws extension',
      value: 'SDL_Workspace',
      validateInput: validateBaseName
    });
    if (!workspaceName) {
      return;
    }

    const projectName = await vscode.window.showInputBox({
      title: 'Create an SDL Qt project',
      prompt: 'Project file name without the .prj extension',
      value: 'SDL_App',
      validateInput: validateBaseName
    });
    if (!projectName) {
      return;
    }

    const installation = await this.sdl.selectInstallation();
    if (!installation) {
      return;
    }
    const language = await this.pickSdlLanguage();
    if (!language) {
      return;
    }
    const sdlVersion = normalizeStarterSdlVersion(vscode.workspace.getConfiguration('qpm').get<string>('sdlVersion', 'SDL2'));

    const formatVersion = vscode.workspace.getConfiguration('qpm').get<number>('projectFormatVersion', 1200);
    const result = this.parser.createWorkspaceAndProject(folder[0].fsPath, workspaceName, projectName, 'Executable', undefined, formatVersion);
    const files = await this.writeSdlStarterFiles(path.dirname(result.projectPath), projectName, language, sdlVersion);
    this.parser.addFilesToProject(result.projectPath, files, 'Source Files');
    await this.applySdlProjectConfiguration(installation, path.dirname(result.projectPath));
    await this.load(result.workspacePath);
    vscode.window.showInformationMessage(`Created SDL project ${path.basename(result.projectPath)} with ${installation.label}.`);
  }

  async createSdlProjectInWorkspace(): Promise<void> {
    const workspace = this.workspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      vscode.window.showErrorMessage('Open a .cws Qt workspace before creating an SDL project.');
      return;
    }

    const workspaceDirectory = path.dirname(workspace.path);
    const folders = await vscode.window.showOpenDialog({
      title: 'Select the directory for the new SDL Qt project',
      defaultUri: vscode.Uri.file(workspaceDirectory),
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!folders?.[0]) {
      return;
    }

    const projectName = await vscode.window.showInputBox({
      title: 'Create an SDL Qt project in the current workspace',
      prompt: 'Project file name without the .prj extension',
      value: 'SDL_App',
      validateInput: validateBaseName
    });
    if (!projectName) {
      return;
    }

    const installation = await this.sdl.selectInstallation();
    if (!installation) {
      return;
    }
    const language = await this.pickSdlLanguage();
    if (!language) {
      return;
    }
    const sdlVersion = normalizeStarterSdlVersion(vscode.workspace.getConfiguration('qpm').get<string>('sdlVersion', 'SDL2'));

    const formatVersion = vscode.workspace.getConfiguration('qpm').get<number>('projectFormatVersion', 1200);
    const projectPath = this.parser.createProject(folders[0].fsPath, projectName, 'Executable', undefined, formatVersion);
    const files = await this.writeSdlStarterFiles(path.dirname(projectPath), projectName, language, sdlVersion);
    this.parser.addFilesToProject(projectPath, files, 'Source Files');
    const projectIndex = this.parser.addProjectToWorkspace(workspace.path, projectPath);
    this.parser.setWorkspaceActiveProject(workspace.path, projectIndex);
    await this.applySdlProjectConfiguration(installation, path.dirname(projectPath));
    this.refresh();
    vscode.window.showInformationMessage(`Created SDL project ${path.basename(projectPath)} and added it to ${path.basename(workspace.path)}.`);
  }

  private async pickSdlLanguage(): Promise<'c' | 'cpp' | undefined> {
    const selected = await vscode.window.showQuickPick([
      { label: 'C', value: 'c' as const, description: 'Generate main.c using the selected SDL C API.' },
      { label: 'C++', value: 'cpp' as const, description: 'Generate main.cpp using the selected SDL C API from C++.' }
    ], { title: 'SDL starter language' });
    return selected?.value;
  }

  private async applySdlProjectConfiguration(installation: QpmSdlInstallation, projectDirectory: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('qpm');
    const target = vscode.ConfigurationTarget.Workspace;
    await config.update('sdlEnabled', 'on', target);
    await config.update('sdlRootPath', installation.root, target);
    await config.update('sdlRuntimeMode', config.get<QpmSdlRuntimeMode>('sdlRuntimeMode', 'copy-dlls'), target);
    await config.update('sdlSubsystem', 'windows', target);
    if (installation.architecture === 'x64') {
      await config.update('buildMode', 'debug64', target);
      await config.update('architectureMode', 'auto', target);
    } else if (installation.architecture === 'x86') {
      await config.update('buildMode', 'debug', target);
      await config.update('architectureMode', 'auto', target);
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(projectDirectory, 'assets')));
  }

  private async writeSdlStarterFiles(projectDirectory: string, projectName: string, language: 'c' | 'cpp', sdlVersion: QpmSdlResolvedVersion): Promise<string[]> {
    const sourcePath = path.join(projectDirectory, language === 'cpp' ? 'main.cpp' : 'main.c');
    const readmePath = path.join(projectDirectory, 'README_SDL.md');
    if (fs.existsSync(sourcePath)) {
      throw new Error(`${path.basename(sourcePath)} already exists in ${projectDirectory}.`);
    }
    const source = renderSdlStarterSource(projectName, language, sdlVersion);
    const readme = renderSdlReadme(projectName, sdlVersion);
    fs.writeFileSync(sourcePath, toCrlf(source), 'utf8');
    fs.writeFileSync(readmePath, toCrlf(readme), 'utf8');
    return [sourcePath, readmePath];
  }

  async setActiveProject(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const workspace = this.workspace;
    if (!workspace) {
      return;
    }

    let selected = projectRef;
    if (!selected) {
      const item = await vscode.window.showQuickPick(workspace.projects.map((project) => ({
        label: project.name,
        description: project.relativePath,
        project
      })), { title: 'Select the active Qt project' });
      selected = item?.project;
    }
    if (!selected) {
      return;
    }

    if (path.extname(workspace.path).toLowerCase() === '.cws') {
      this.parser.setWorkspaceActiveProject(workspace.path, selected.index);
    }
    workspace.activeProjectIndex = selected.index;
    this.refresh();
  }

  async addExistingProject(): Promise<void> {
    if (!this.workspace) {
      await this.openWorkspace();
      return;
    }
    const files = await vscode.window.showOpenDialog({
      title: 'Select a Qt project to add',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Qt project': ['json', 'prj'] }
    });
    if (!files?.[0]) {
      return;
    }
    const selectedPath = files[0].fsPath;
    if (!isQtProjectManifestPath(selectedPath) && path.extname(selectedPath).toLowerCase() !== '.prj') {
      vscode.window.showErrorMessage('Select a native .qtproject.json manifest or a legacy .prj compatibility project.');
      return;
    }
    this.parser.addProjectToWorkspace(this.workspace.path, selectedPath);
    this.refresh();
  }

  async createProjectInWorkspace(): Promise<void> {
    const workspace = this.workspace;
    if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
      vscode.window.showErrorMessage('Open a .cws Qt workspace before creating an additional project.');
      return;
    }
    const workspaceDirectory = path.dirname(workspace.path);
    const folders = await vscode.window.showOpenDialog({
      title: 'Select the parent directory for the new native Qt project',
      defaultUri: vscode.Uri.file(workspaceDirectory),
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false
    });
    if (!folders?.[0]) return;
    const manifestPath = await this.qtProjects.createProjectWizard(folders[0].fsPath);
    if (!manifestPath) return;
    const projectIndex = this.parser.addProjectToWorkspace(workspace.path, manifestPath);
    this.parser.setWorkspaceActiveProject(workspace.path, projectIndex);
    this.refresh();
    vscode.window.showInformationMessage(`Created ${path.basename(manifestPath)} and added it to ${path.basename(workspace.path)} as the active Qt project.`);
  }

  async removeProject(projectRef: QpmWorkspaceProjectRef): Promise<void> {
    if (!this.workspace) {
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `Remove ${projectRef.name} from the current Qt workspace? The project manifest/file will not be deleted.`,
      { modal: true },
      'Remove'
    );
    if (answer !== 'Remove') {
      return;
    }
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      removeQpmWorkspaceAssociation(path.dirname(projectRef.absolutePath), this.workspace.path);
    }
    this.parser.removeProjectFromWorkspace(this.workspace.path, projectRef.index);
    this.refresh();
  }

  async addFiles(projectRef?: QpmWorkspaceProjectRef, folderOverride?: string): Promise<void> {
    const ref = projectRef ?? this.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is selected.');
      return;
    }

    const files = await vscode.window.showOpenDialog({
      title: `Add files to ${ref.name}`,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: {
        'Qt project resources': ['c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx', 'ui', 'qrc', 'qml', 'js', 'ts', 'qm', 'lib', 'a', 'obj', 'o'],
        'All files': ['*']
      }
    });
    if (!files?.length) {
      return;
    }

    let folder = folderOverride;
    if (folder === undefined) {
      const inferredTypes = new Set(files.map((file) => inferType(file.fsPath)));
      const suggested = inferredTypes.size === 1 ? defaultFolderForType([...inferredTypes][0]) : '';
      folder = await vscode.window.showInputBox({
        title: 'Logical folder',
        prompt: 'Folder displayed in the project tree. Nested folders can use /. Leave empty to use the default folder for each file type.',
        value: suggested
      });
      if (folder === undefined) {
        return;
      }
    }

    const count = isQtProjectManifestPath(ref.absolutePath)
      ? this.qtProjects.addFiles(ref.absolutePath, files.map((file) => file.fsPath))
      : this.parser.addFilesToProject(ref.absolutePath, files.map((file) => file.fsPath), folder || undefined);
    this.refresh();
    vscode.window.showInformationMessage(`${count} file(s) added to ${ref.name}.`);
  }

  async createNewFile(projectRef?: QpmWorkspaceProjectRef, folderOverride?: string): Promise<void> {
    const ref = projectRef ?? this.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is selected.');
      return;
    }

    const generated = await this.templates.generateNewFiles(path.dirname(ref.absolutePath));
    if (!generated) {
      return;
    }

    const nativeQtProject = isQtProjectManifestPath(ref.absolutePath);
    const added = nativeQtProject
      ? this.qtProjects.addFiles(ref.absolutePath, generated.files)
      : this.parser.addFilesToProject(ref.absolutePath, generated.files, folderOverride);
    const addedModules = nativeQtProject && generated.requiredQtModules?.length
      ? this.qtProjects.ensureModules(ref.absolutePath, generated.requiredQtModules)
      : [];
    this.refresh();

    if (generated.primaryPath && fs.existsSync(generated.primaryPath) && path.extname(generated.primaryPath).toLowerCase() !== '.uir') {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(generated.primaryPath));
      await vscode.window.showTextDocument(document, { preview: false });
    }

    const moduleSummary = addedModules.length ? ` Required Qt modules added: ${addedModules.join(', ')}.` : '';
    const summary = `${added} project reference(s) added. ${generated.createdFiles.length} file(s) written.${moduleSummary}`;
    if (generated.uirPath) {
      const action = await vscode.window.showInformationMessage(`${summary} The blank UIR resource is ready for graphical editing.`, 'Open panel in QPM');
      if (action === 'Open panel in QPM') {
        await vscode.commands.executeCommand('qpm.openPanelPathInQpm', generated.uirPath);
      }
    } else {
      vscode.window.showInformationMessage(summary);
    }
  }

  async convertQtFormToClass(projectRef?: QpmWorkspaceProjectRef, formPath?: string): Promise<QpmWorkspaceProjectRef | undefined> {
    let ref = projectRef;
    if (!ref && formPath) {
      ref = this.findProjectRefForPath(formPath);
    }
    ref ??= this.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is selected.');
      return undefined;
    }
    if (!isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Converting a Designer form to a Qt C++ class is available for native .qtproject.json projects.');
      return undefined;
    }

    let target = formPath ? path.resolve(formPath) : undefined;
    if (!target) {
      const project = this.getProject(ref);
      const forms = project?.files.filter((file) => file.type === 'Qt Form' && file.exists) ?? [];
      if (!forms.length) {
        vscode.window.showInformationMessage('This project does not contain any Qt Designer .ui form to convert.');
        return undefined;
      }
      const selected = await vscode.window.showQuickPick(forms.map((file) => ({
        label: path.basename(file.absolutePath),
        description: file.relativePath ?? file.absolutePath,
        filePath: file.absolutePath
      })), {
        title: 'Convert Designer Form to Qt C++ Class',
        placeHolder: 'Select the .ui form that should receive a C++ QWidget/QDialog/QMainWindow wrapper',
        matchOnDescription: true
      });
      if (!selected) {
        return undefined;
      }
      target = selected.filePath;
    }

    if (path.extname(target).toLowerCase() !== '.ui') {
      vscode.window.showErrorMessage('Select a Qt Designer .ui form to convert.');
      return undefined;
    }

    const generated = await this.templates.convertQtDesignerFormToClass(path.dirname(ref.absolutePath), target);
    if (!generated) {
      return undefined;
    }

    const added = this.qtProjects.addFiles(ref.absolutePath, generated.files);
    this.refresh();

    if (generated.primaryPath && fs.existsSync(generated.primaryPath)) {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(generated.primaryPath));
      await vscode.window.showTextDocument(document, { preview: false });
    }

    const createdNames = generated.createdFiles.map((file) => path.basename(file));
    const createdText = createdNames.length ? createdNames.join(', ') : 'existing class files';
    vscode.window.showInformationMessage(`Qt C++ class wrapper ready for ${path.basename(target)}: ${createdText}. MOC/UIC artifacts will be refreshed automatically.`);
    return ref;
  }

  async addFolder(projectRef?: QpmWorkspaceProjectRef, parentFolder = ''): Promise<void> {
    const ref = projectRef ?? this.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is selected.');
      return;
    }
    if (isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt project folders are derived from file categories and physical directories. Add a file or directory on disk instead.');
      return;
    }
    const prefix = normalizeLogicalFolder(parentFolder);
    const name = await vscode.window.showInputBox({
      title: `Add a Logical folder to ${ref.name}`,
      prompt: prefix ? `New child folder under ${prefix}` : 'New logical folder. Nested folders can use /.',
      validateInput: validateLogicalFolder
    });
    if (!name) {
      return;
    }
    const fullName = normalizeLogicalFolder([prefix, name].filter(Boolean).join('/'));
    this.parser.addFolderToProject(ref.absolutePath, fullName);
    this.refresh();
  }

  async renameFolder(projectRef: QpmWorkspaceProjectRef, folderPath: string): Promise<void> {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt project folders are derived from the manifest file categories.');
      return;
    }
    const current = normalizeLogicalFolder(folderPath);
    const parent = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : '';
    const leaf = current.split('/').pop() ?? current;
    const name = await vscode.window.showInputBox({
      title: 'Rename Logical folder',
      prompt: parent ? `Rename ${leaf} under ${parent}` : `Rename ${leaf}`,
      value: leaf,
      validateInput: validateLogicalFolderLeaf
    });
    if (!name) {
      return;
    }
    this.parser.renameFolderInProject(projectRef.absolutePath, current, [parent, name].filter(Boolean).join('/'));
    this.refresh();
  }

  async removeFolder(projectRef: QpmWorkspaceProjectRef, folderPath: string): Promise<void> {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      vscode.window.showInformationMessage('Remove individual file references from a native Qt project; category folders are structural.');
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `Remove the logical folder ${folderPath} from ${projectRef.name}? Files on disk will never be deleted.`,
      { modal: true },
      'Move contents to parent',
      'Remove file references'
    );
    if (!answer) {
      return;
    }
    this.parser.removeFolderFromProject(projectRef.absolutePath, folderPath, answer === 'Remove file references');
    this.refresh();
  }

  async removeFile(projectRef: QpmWorkspaceProjectRef, sectionName: string, filePath: string): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      `Remove ${path.basename(filePath)} from ${projectRef.name}? The file will not be deleted from disk.`,
      { modal: true },
      'Remove'
    );
    if (answer !== 'Remove') {
      return;
    }
    if (isQtProjectManifestPath(projectRef.absolutePath)) this.qtProjects.removeFile(projectRef.absolutePath, filePath);
    else this.parser.removeFileFromProject(projectRef.absolutePath, sectionName);
    this.refresh();
  }

  setFileExcluded(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile, excluded: boolean): void {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt manifests use explicit file lists. Remove the file reference instead of excluding it.');
      return;
    }
    this.parser.setFileExcluded(projectRef.absolutePath, file.sectionName, excluded);
    this.refresh();
  }

  toggleCompileIntoObjectFile(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile): void {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt manifests compile all listed source and generated Qt source files.');
      return;
    }
    this.parser.setCompileIntoObjectFile(projectRef.absolutePath, file.sectionName, !file.compileIntoObjectFile);
    this.refresh();
  }

  async replaceFile(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      title: `Replace ${path.basename(file.absolutePath)} in ${projectRef.name}`,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(path.dirname(file.absolutePath)),
      filters: { 'Qt project resources': ['c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx', 'ui', 'qrc', 'qml', 'js', 'ts', 'qm', 'lib', 'a', 'obj', 'o'], 'All files': ['*'] }
    });
    if (!selected?.[0]) {
      return;
    }
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      this.qtProjects.removeFile(projectRef.absolutePath, file.absolutePath);
      this.qtProjects.addFiles(projectRef.absolutePath, [selected[0].fsPath]);
    } else {
      this.parser.replaceFileInProject(projectRef.absolutePath, file.sectionName, selected[0].fsPath);
    }
    this.refresh();
  }

  async renameFile(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile): Promise<void> {
    const currentPath = file.absolutePath;
    const currentName = path.basename(currentPath);
    const targetName = await vscode.window.showInputBox({
      title: 'Rename File in Project',
      prompt: `Rename ${currentName}. The file is renamed on disk and the project reference is updated.`,
      value: currentName,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'A file name is required.';
        }
        if (trimmed !== value) {
          return 'Leading or trailing spaces are not allowed.';
        }
        if (/[<>:"/\|?*\x00-\x1f]/.test(trimmed)) {
          return 'The file name contains a character that is not valid on Windows.';
        }
        if (trimmed === '.' || trimmed === '..') {
          return 'This file name is reserved.';
        }
        return undefined;
      }
    });
    if (!targetName) {
      return;
    }

    const targetPath = path.join(path.dirname(currentPath), targetName);
    if (path.normalize(targetPath).toLowerCase() === path.normalize(currentPath).toLowerCase()) {
      vscode.window.showInformationMessage('The file name is unchanged.');
      return;
    }
    if (fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Cannot rename ${currentName}: ${targetName} already exists.`);
      return;
    }

    const openDocument = vscode.workspace.textDocuments.find((candidate) => path.normalize(candidate.uri.fsPath).toLowerCase() === path.normalize(currentPath).toLowerCase());
    if (openDocument?.isDirty) {
      const answer = await vscode.window.showWarningMessage(
        `${currentName} has unsaved changes. Save it before renaming?`,
        { modal: true },
        'Save and rename'
      );
      if (answer !== 'Save and rename') {
        return;
      }
      await openDocument.save();
    }

    try {
      await vscode.workspace.fs.rename(vscode.Uri.file(currentPath), vscode.Uri.file(targetPath), { overwrite: false });
      if (isQtProjectManifestPath(projectRef.absolutePath)) {
        this.qtProjects.removeFile(projectRef.absolutePath, currentPath);
        this.qtProjects.addFiles(projectRef.absolutePath, [targetPath]);
      } else {
        this.parser.replaceFileInProject(projectRef.absolutePath, file.sectionName, targetPath);
      }
      this.refresh();
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath), { preview: false });
    } catch (error) {
      vscode.window.showErrorMessage(`Cannot rename ${currentName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async moveFileToFolder(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile): Promise<void> {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      vscode.window.showInformationMessage('Native Qt manifest folders are structural; file categories are derived from the file type.');
      return;
    }
    const project = this.getProject(projectRef);
    if (!project) {
      vscode.window.showErrorMessage('The selected C/C++ project cannot be read.');
      return;
    }

    const currentFolder = normalizeLogicalFolder(file.folder);
    const folders = collectLogicalFolders(project);
    const items: Array<vscode.QuickPickItem & { targetFolder?: string; createNew?: boolean }> = [
      { label: '$(root-folder) Project root', description: 'No logical folder', targetFolder: '' },
      ...folders.map((folder) => ({ label: folder, description: folder.toLowerCase() === currentFolder.toLowerCase() ? 'current folder' : 'logical folder', targetFolder: folder })),
      { label: '$(new-folder) Create new folder...', description: 'Create a QPM logical folder and move the file into it', createNew: true }
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Move File To Folder',
      placeHolder: `Move ${path.basename(file.absolutePath)} to another QPM logical folder`
    });
    if (!picked) {
      return;
    }

    let targetFolder = picked.targetFolder ?? '';
    if (picked.createNew) {
      const name = await vscode.window.showInputBox({
        title: 'Create Target Folder',
        prompt: 'New logical folder. Nested folders can use /.',
        validateInput: validateLogicalFolder
      });
      if (!name) {
        return;
      }
      targetFolder = normalizeLogicalFolder(name);
    }

    await this.moveFilesToFolder(projectRef, [file.sectionName], targetFolder);
  }

  async moveFilesToFolder(projectRef: QpmWorkspaceProjectRef, sectionNames: string[], targetFolder: string, options: { silent?: boolean } = {}): Promise<void> {
    if (isQtProjectManifestPath(projectRef.absolutePath)) {
      if (!options.silent) vscode.window.showInformationMessage('Native Qt manifest folders are structural; file categories are derived from the file type.');
      return;
    }
    if (!projectRef.exists) {
      vscode.window.showErrorMessage('The selected C/C++ project file does not exist.');
      return;
    }

    const normalizedTarget = normalizeLogicalFolder(targetFolder);
    const moved = this.parser.moveFilesToFolderInProject(projectRef.absolutePath, sectionNames, normalizedTarget);
    if (moved === 0) {
      if (!options.silent) {
        vscode.window.showInformationMessage('The selected file is already in this QPM logical folder.');
      }
      return;
    }

    this.refresh();
    if (!options.silent) {
      const destination = normalizedTarget || 'project root';
      vscode.window.showInformationMessage(`${moved} file reference(s) moved to ${destination}.`);
    }
  }

  async saveFile(filePath: string): Promise<void> {
    const document = vscode.workspace.textDocuments.find((candidate) => path.normalize(candidate.uri.fsPath) === path.normalize(filePath));
    if (document?.isDirty) {
      await document.save();
    }
  }

  async openPath(filePath: string): Promise<void> {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  async revealInExplorer(fileOrDirectoryPath: string): Promise<void> {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(fileOrDirectoryPath));
  }

  async copyFilePath(filePath: string): Promise<void> {
    await vscode.env.clipboard.writeText(path.normalize(filePath));
  }

  async copyRelativeFilePath(projectRef: QpmWorkspaceProjectRef, filePath: string): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const uri = vscode.Uri.file(absolutePath);
    const vscodeFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (vscodeFolder) {
      await vscode.env.clipboard.writeText(relativeOrBasename(vscodeFolder.uri.fsPath, absolutePath));
      return;
    }

    const workspaceRoot = this.workspace ? path.dirname(this.workspace.path) : undefined;
    if (workspaceRoot && isPathInside(workspaceRoot, absolutePath)) {
      await vscode.env.clipboard.writeText(relativeOrBasename(workspaceRoot, absolutePath));
      return;
    }

    await vscode.env.clipboard.writeText(relativeOrBasename(path.dirname(projectRef.absolutePath), absolutePath));
  }

  async findInDirectory(directoryPath: string): Promise<void> {
    const uri = vscode.Uri.file(directoryPath);
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const relative = folder ? vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/') : undefined;
    const normalized = directoryPath.replace(/\\/g, '/');
    const filesToInclude = relative && relative !== '.' ? `${relative}/**` : folder ? '**' : `${normalized}/**`;
    await vscode.commands.executeCommand('workbench.action.findInFiles', { filesToInclude });
  }

  directoryForLogicalFolder(projectRef: QpmWorkspaceProjectRef, folderPath: string): string {
    const project = this.getProject(projectRef);
    if (!project) {
      return path.dirname(projectRef.absolutePath);
    }
    const normalized = normalizeLogicalFolder(folderPath).toLowerCase();
    const files = project.files
      .filter((file) => {
        const candidate = normalizeLogicalFolder(file.folder).toLowerCase();
        return candidate === normalized || candidate.startsWith(`${normalized}/`);
      })
      .map((file) => path.dirname(file.absolutePath));
    return commonAncestor(files) ?? path.dirname(projectRef.absolutePath);
  }


  async selectTargetType(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is selected.');
      return;
    }
    const project = this.getProject(ref);
    const selected = await vscode.window.showQuickPick([
      { label: 'Executable', value: 'Executable', description: 'Generate an .exe target' },
      { label: 'Dynamic Link Library', value: 'Dynamic Link Library', description: 'Generate a .dll target and import library' },
      { label: 'Static Library', value: 'Static Library', description: 'Generate a .lib target' }
    ], { title: `Select the Qt target type for ${ref.name}`, placeHolder: project?.targetType });
    if (!selected) {
      return;
    }
    if (isQtProjectManifestPath(ref.absolutePath)) {
      const manifest = readQtProjectManifest(ref.absolutePath);
      manifest.kind = selected.value === 'Dynamic Link Library' ? 'shared-library' : selected.value === 'Static Library' ? 'static-library' : ['quick-application', 'console-application', 'test-application', 'quick-test-application'].includes(manifest.kind) ? manifest.kind : 'widgets-application';
      writeQtProjectManifest(ref.absolutePath, manifest);
    } else {
      this.parser.setTargetType(ref.absolutePath, selected.value);
    }
    this.refresh();
    vscode.window.showInformationMessage(`${ref.name} target type: ${selected.label}.`);
  }

  async generatePrototypes(projectRef: QpmWorkspaceProjectRef, file: QpmProjectFile): Promise<void> {
    if (path.extname(file.absolutePath).toLowerCase() !== '.c') {
      vscode.window.showErrorMessage('Generate Prototypes is available only for C source files.');
      return;
    }
    if (!fs.existsSync(file.absolutePath)) {
      vscode.window.showErrorMessage(`Source file not found: ${file.absolutePath}`);
      return;
    }
    const headerPath = path.join(path.dirname(file.absolutePath), `${path.basename(file.absolutePath, '.c')}.h`);
    if (fs.existsSync(headerPath)) {
      const answer = await vscode.window.showWarningMessage(`${path.basename(headerPath)} already exists. Replace it with generated prototypes?`, { modal: true }, 'Replace');
      if (answer !== 'Replace') {
        return;
      }
    }
    const source = fs.readFileSync(file.absolutePath, 'utf8');
    const header = generatePrototypeHeader(source, path.basename(headerPath));
    fs.writeFileSync(headerPath, header, 'utf8');
    if (isQtProjectManifestPath(projectRef.absolutePath)) this.qtProjects.addFiles(projectRef.absolutePath, [headerPath]);
    else this.parser.addFilesToProject(projectRef.absolutePath, [headerPath]);
    this.refresh();
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(headerPath));
    await vscode.window.showTextDocument(document, { preview: false });
    vscode.window.showInformationMessage(`Generated ${path.basename(headerPath)}. Review the prototypes before using the header as a public API.`);
  }

  private parseProjectPath(projectPath: string): QpmProject {
    return isQtProjectManifestPath(projectPath) ? qtManifestToQpmProject(projectPath) : this.parser.parseProject(projectPath);
  }

  private findFilesBySuffixAtLimitedDepth(directory: string, suffix: string, depth: number): string[] {
    if (depth < 0 || !fs.existsSync(directory)) return [];
    const result: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build') continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name.toLowerCase().endsWith(suffix.toLowerCase())) result.push(candidate);
      else if (entry.isDirectory()) result.push(...this.findFilesBySuffixAtLimitedDepth(candidate, suffix, depth - 1));
    }
    return result;
  }

  private findFilesAtLimitedDepth(directory: string, extension: string, depth: number): string[] {
    if (depth < 0 || !fs.existsSync(directory)) {
      return [];
    }
    const result: string[] = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) {
        result.push(candidate);
      } else if (entry.isDirectory()) {
        result.push(...this.findFilesAtLimitedDepth(candidate, extension, depth - 1));
      }
    }
    return result;
  }
}

function normalizeComparablePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function renderSdlStarterSource(projectName: string, language: 'c' | 'cpp', sdlVersion: QpmSdlResolvedVersion): string {
  if (sdlVersion === 'SDL3') {
    return renderSdl3StarterSource(projectName, language);
  }
  return renderSdl2StarterSource(projectName, language);
}

function renderSdl2StarterSource(projectName: string, language: 'c' | 'cpp'): string {
  const commentPrefix = language === 'cpp' ? '// C++ SDL2 starter generated by QPM' : '// C SDL2 starter generated by QPM';
  return `${commentPrefix}
// Project: ${projectName}
//
// Features demonstrated:
// - SDL2 initialization and shutdown;
// - window + accelerated renderer creation;
// - keyboard/window event loop;
// - simple color rendering;
// - optional SDL2_image initialization when SDL2_image is selected in QPM settings.

#include <stdio.h>
#include <stdbool.h>
#include <SDL.h>
#if defined(QPM_USE_SDL_IMAGE)
#include <SDL_image.h>
#endif

#define WINDOW_WIDTH  960
#define WINDOW_HEIGHT 540

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    SDL_Window *window = NULL;
    SDL_Renderer *renderer = NULL;
    bool running = true;
    int status = 0;

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_EVENTS) != 0)
    {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return -1;
    }

#if defined(QPM_USE_SDL_IMAGE)
    if ((IMG_Init(IMG_INIT_PNG | IMG_INIT_JPG) & (IMG_INIT_PNG | IMG_INIT_JPG)) == 0)
    {
        fprintf(stderr, "IMG_Init warning: %s\n", IMG_GetError());
    }
#endif

    window = SDL_CreateWindow(
        "${projectName}",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        WINDOW_WIDTH,
        WINDOW_HEIGHT,
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);

    if (window == NULL)
    {
        fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        status = -2;
        goto Cleanup;
    }

    renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    if (renderer == NULL)
    {
        fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
        status = -3;
        goto Cleanup;
    }

    while (running)
    {
        SDL_Event event;
        while (SDL_PollEvent(&event) != 0)
        {
            if (event.type == SDL_QUIT)
            {
                running = false;
            }
            else if (event.type == SDL_KEYDOWN && event.key.keysym.sym == SDLK_ESCAPE)
            {
                running = false;
            }
        }

        SDL_SetRenderDrawColor(renderer, 20, 24, 35, 255);
        SDL_RenderClear(renderer);

        SDL_Rect rect = { WINDOW_WIDTH / 2 - 120, WINDOW_HEIGHT / 2 - 60, 240, 120 };
        SDL_SetRenderDrawColor(renderer, 90, 170, 255, 255);
        SDL_RenderFillRect(renderer, &rect);

        SDL_RenderPresent(renderer);
    }

Cleanup:
    if (renderer != NULL)
    {
        SDL_DestroyRenderer(renderer);
    }
    if (window != NULL)
    {
        SDL_DestroyWindow(window);
    }
#if defined(QPM_USE_SDL_IMAGE)
    IMG_Quit();
#endif
    SDL_Quit();
    return status;
}
`;
}

function renderSdl3StarterSource(projectName: string, language: 'c' | 'cpp'): string {
  const commentPrefix = language === 'cpp' ? '// C++ SDL3 starter generated by QPM' : '// C SDL3 starter generated by QPM';
  return `${commentPrefix}
// Project: ${projectName}
//
// Features demonstrated:
// - SDL3 initialization and shutdown;
// - window + renderer creation;
// - keyboard/window event loop;
// - simple color rendering;
// - optional SDL3_image initialization when SDL3_image is selected in QPM settings.

#include <stdio.h>
#include <stdbool.h>
#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>
#if defined(QPM_USE_SDL3_IMAGE)
#include <SDL3_image/SDL_image.h>
#endif

#define WINDOW_WIDTH  960
#define WINDOW_HEIGHT 540

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    SDL_Window *window = NULL;
    SDL_Renderer *renderer = NULL;
    bool running = true;
    int status = 0;

    if (!SDL_Init(SDL_INIT_VIDEO))
    {
        fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return -1;
    }

#if defined(QPM_USE_SDL3_IMAGE)
    if (!IMG_Init(IMG_INIT_PNG | IMG_INIT_JPG))
    {
        fprintf(stderr, "IMG_Init warning: %s\n", SDL_GetError());
    }
#endif

    window = SDL_CreateWindow(
        "${projectName}",
        WINDOW_WIDTH,
        WINDOW_HEIGHT,
        SDL_WINDOW_RESIZABLE);

    if (window == NULL)
    {
        fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        status = -2;
        goto Cleanup;
    }

    renderer = SDL_CreateRenderer(window, NULL);
    if (renderer == NULL)
    {
        fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
        status = -3;
        goto Cleanup;
    }

    while (running)
    {
        SDL_Event event;
        while (SDL_PollEvent(&event))
        {
            if (event.type == SDL_EVENT_QUIT)
            {
                running = false;
            }
            else if (event.type == SDL_EVENT_KEY_DOWN && event.key.key == SDLK_ESCAPE)
            {
                running = false;
            }
        }

        SDL_SetRenderDrawColor(renderer, 20, 24, 35, 255);
        SDL_RenderClear(renderer);

        SDL_FRect rect = { WINDOW_WIDTH / 2.0f - 120.0f, WINDOW_HEIGHT / 2.0f - 60.0f, 240.0f, 120.0f };
        SDL_SetRenderDrawColor(renderer, 90, 170, 255, 255);
        SDL_RenderFillRect(renderer, &rect);

        SDL_RenderPresent(renderer);
    }

Cleanup:
    if (renderer != NULL)
    {
        SDL_DestroyRenderer(renderer);
    }
    if (window != NULL)
    {
        SDL_DestroyWindow(window);
    }
#if defined(QPM_USE_SDL3_IMAGE)
    IMG_Quit();
#endif
    SDL_Quit();
    return status;
}
`;
}

function renderSdlReadme(projectName: string, sdlVersion: QpmSdlResolvedVersion): string {
  return `# ${projectName} ${sdlVersion} starter

This project was generated by QPM as an ${sdlVersion} graphical application.

QPM injects SDL include paths, SDL libraries and runtime handling from the workspace settings:

- qpm.sdlEnabled
- qpm.sdlVersion
- qpm.sdlRootPath
- qpm.sdlPackages
- qpm.sdlRuntimeMode
- qpm.sdlSubsystem

On Windows, the recommended mode is 'copy-dlls'. The build copies SDL runtime DLLs from the selected SDK bin directory beside the executable so the program can run from the build folder.

For SDL2, QPM links SDL2main on Windows and defines QPM_USE_SDL2. For SDL3, QPM uses <SDL3/SDL.h>, <SDL3/SDL_main.h> and links SDL3 without SDL3main.

If you enable ${sdlVersion}_image in qpm.sdlPackages, QPM automatically defines QPM_USE_${sdlVersion}_IMAGE and QPM_USE_SDL_IMAGE so the optional image initialization block in main is compiled without extra manual symbols.
`;
}

function normalizeStarterSdlVersion(value: string | undefined): QpmSdlResolvedVersion {
  return value === 'SDL3' ? 'SDL3' : 'SDL2';
}

function toCrlf(value: string): string {
  return value.replace(/\r?\n/g, '\r\n');
}

function validateBaseName(value: string): string | undefined {
  if (!value.trim()) {
    return 'A name is required.';
  }
  if (/[<>:"/\\|?*]/.test(value)) {
    return 'The name contains a character that is not permitted in a Windows file name.';
  }
  return undefined;
}

function collectLogicalFolders(project: QpmProject): string[] {
  const seen = new Set<string>();
  const addFolder = (value: string): void => {
    const normalized = normalizeLogicalFolder(value);
    if (normalized) {
      seen.add(normalized);
      let current = normalized;
      while (current.includes('/')) {
        current = current.slice(0, current.lastIndexOf('/'));
        if (current) {
          seen.add(current);
        }
      }
    }
  };

  for (const folder of project.folders) {
    addFolder(folder);
  }
  for (const file of project.files) {
    addFolder(file.folder);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function validateLogicalFolder(value: string): string | undefined {
  if (!value.trim()) {
    return 'A folder name is required.';
  }
  if (/[<>:"\\|?*]/.test(value)) {
    return 'The logical folder contains an unsupported character.';
  }
  return undefined;
}

function validateLogicalFolderLeaf(value: string): string | undefined {
  const error = validateLogicalFolder(value);
  if (error) {
    return error;
  }
  if (value.includes('/')) {
    return 'Enter only the folder name, without a slash.';
  }
  return undefined;
}

function normalizeLogicalFolder(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').trim();
}

function inferType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.c':
    case '.cc':
    case '.cpp':
    case '.cxx': return 'CSource';
    case '.h':
    case '.hh':
    case '.hpp':
    case '.hxx': return 'Include';
    case '.lib':
    case '.a': return 'Library';
    default: return 'Other';
  }
}

function commonAncestor(paths: string[]): string | undefined {
  if (paths.length === 0) {
    return undefined;
  }
  const split = paths.map((candidate) => path.resolve(candidate).split(path.sep));
  const first = split[0];
  let length = first.length;
  for (const candidate of split.slice(1)) {
    length = Math.min(length, candidate.length);
    for (let index = 0; index < length; index += 1) {
      if (candidate[index].toLowerCase() !== first[index].toLowerCase()) {
        length = index;
        break;
      }
    }
  }
  return length > 0 ? first.slice(0, length).join(path.sep) || path.parse(paths[0]).root : undefined;
}


function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function relativeOrBasename(rootPath: string, filePath: string): string {
  return path.relative(path.resolve(rootPath), path.resolve(filePath)) || path.basename(filePath);
}

export function generatePrototypeHeader(source: string, headerName: string): string {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const pattern = /(^|\n)\s*((?:(?!\bstatic\b)[A-Za-z_][A-Za-z0-9_\s\*]*?))\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;{}]*)\)\s*\{/g;
  const blocked = new Set(['if', 'for', 'while', 'switch', 'catch']);
  const prototypes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    const returnType = match[2].replace(/\s+/g, ' ').trim();
    const name = match[3];
    const parameters = match[4].replace(/\s+/g, ' ').trim();
    if (!returnType || blocked.has(name) || /\bstatic\b/.test(returnType)) {
      continue;
    }
    const prototype = `${returnType} ${name} (${parameters || 'void'});`;
    if (!prototypes.includes(prototype)) {
      prototypes.push(prototype);
    }
  }
  const guard = headerName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  const body = prototypes.length ? prototypes.join('\n') : '/* No non-static function definitions were detected automatically. */';
  return `#ifndef ${guard}\n#define ${guard}\n\n#ifdef __cplusplus\nextern "C" {\n#endif\n\n${body}\n\n#ifdef __cplusplus\n}\n#endif\n\n#endif /* ${guard} */\n`;
}
