import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { QpmParser } from '../model/qpmParser';
import { QpmBuildMode, QpmInstallation, QpmWorkspace } from '../model/types';
import { QpmInstallationService } from './qpmInstallationService';
import { describeSdlRoot, getSdlConfigurationFromWorkspace } from './qpmSdlService';
import { getActiveQtBuildProfile, getQtKitProfileForBuild, getQtInstallationPreference, isQtProjectManifestPath, qtGeneratedDirectory, qtManifestToQpmProject, readQtProjectManifest, resolveQtProjectFiles } from '../model/qtProjectManifest';
import { QpmQtInstallationService } from './qpmQtInstallationService';
import { createQtDirectBuildPlan, qtCompileArguments, qtObjectPathForSource, resolveQtMkspecDirectory, resolveQtModuleOrder } from './qpmQtDirectBuildService';

const MANAGED_CONFIGURATION_NAME = 'Qt Project Manager (managed)';
const CPPTOOLS_EXTENSION_ID = 'ms-vscode.cpptools';
const QPM_CONFIGURATION_PROVIDER_ID = 'JerryCrozet-ElectronicEngineer.cpp-project-manager';
const LEGACY_QPM_CONFIGURATION_PROVIDER_IDS = ['jc-tools.labwindows-qpm-project-manager', 'JerryCrozet-ElectronicEngineer.labwindows-qpm-project-manager', QPM_CONFIGURATION_PROVIDER_ID];

interface CppPropertiesDocument {
  version?: number;
  enableConfigurationSquiggles?: boolean;
  configurations?: CppToolsConfiguration[];
  [key: string]: unknown;
}

interface CppToolsConfiguration {
  name?: string;
  compilerPath?: string;
  configurationProvider?: string;
  mergeConfigurations?: boolean;
  intelliSenseMode?: string;
  cStandard?: string;
  cppStandard?: string;
  compileCommands?: string;
  includePath?: string[];
  browse?: {
    path?: string[];
    limitSymbolsToIncludedHeaders?: boolean;
    [key: string]: unknown;
  };
  defines?: string[];
  [key: string]: unknown;
}

interface SourceFileConfiguration {
  includePath: string[];
  defines: string[];
  intelliSenseMode?: string;
  standard?: string;
  compilerPath?: string;
}

interface SourceFileConfigurationItem {
  uri: vscode.Uri;
  configuration: SourceFileConfiguration;
}

interface WorkspaceBrowseConfiguration {
  browsePath: string[];
  compilerPath?: string;
  standard?: string;
}

interface CustomConfigurationProviderLike extends vscode.Disposable {
  readonly name: string;
  readonly extensionId: string;
  canProvideConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken): Thenable<boolean>;
  provideConfigurations(uris: vscode.Uri[], token?: vscode.CancellationToken): Thenable<SourceFileConfigurationItem[]>;
  canProvideBrowseConfiguration(token?: vscode.CancellationToken): Thenable<boolean>;
  provideBrowseConfiguration(token?: vscode.CancellationToken): Thenable<WorkspaceBrowseConfiguration | null>;
}

interface CppToolsApiLike extends vscode.Disposable {
  registerCustomConfigurationProvider(provider: CustomConfigurationProviderLike): void;
  notifyReady(provider: CustomConfigurationProviderLike): void;
  didChangeCustomConfiguration(provider: CustomConfigurationProviderLike): void;
  didChangeCustomBrowseConfiguration(provider: CustomConfigurationProviderLike): void;
}

interface ProviderPaths {
  includePath: string[];
  browsePath: string[];
  compilerPath?: string;
}

export class QpmCppToolsService implements vscode.Disposable {
  private syncTimer: NodeJS.Timeout | undefined;
  private currentWorkspace: QpmWorkspace | undefined;
  private cppToolsApi: CppToolsApiLike | undefined;
  private providerRegistered = false;
  private cachedProviderPaths: { key: string; value: ProviderPaths } | undefined;

  private readonly provider: CustomConfigurationProviderLike = {
    name: 'Qt Project Manager',
    extensionId: QPM_CONFIGURATION_PROVIDER_ID,
    canProvideConfiguration: async (uri: vscode.Uri) => this.canProvideConfiguration(uri),
    provideConfigurations: async (uris: vscode.Uri[]) => this.provideConfigurations(uris),
    canProvideBrowseConfiguration: async () => !!this.currentWorkspace,
    provideBrowseConfiguration: async () => this.provideBrowseConfiguration(),
    dispose: () => undefined
  };

  constructor(
    private readonly installations: QpmInstallationService,
    private readonly qtInstallations: QpmQtInstallationService,
    private readonly parser: QpmParser,
    private readonly output: vscode.OutputChannel
  ) {}

  dispose(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.provider.dispose();
    this.cppToolsApi?.dispose();
    this.cppToolsApi = undefined;
  }

  async initializeProvider(): Promise<void> {
    // Disabled permanently since 0.6.0. Registering a custom Qt/C++ provider can
    // remain selected globally by cpptools and affect unrelated Qt/C++ folders.
    // The extension now relies on the managed c_cpp_properties.json entry only.
    if (!this.providerRegistered) {
      this.output.appendLine('[Qt/C++] Dynamic Qt/C++ IntelliSense provider registration is disabled. Using managed c_cpp_properties.json.');
    }
  }

  cleanupOrphanedWorkspaceArtifacts(workspace: QpmWorkspace | undefined = this.currentWorkspace): number {
    this.setCurrentWorkspace(workspace);
    const activeConfigPath = workspace
      ? path.resolve(path.join(this.findConfigurationRoot(workspace.path, false), '.vscode', 'c_cpp_properties.json')).toLowerCase()
      : undefined;
    let modified = 0;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const configPath = path.join(folder.uri.fsPath, '.vscode', 'c_cpp_properties.json');
      if (!fs.existsSync(configPath)) {
        continue;
      }
      const normalized = path.resolve(configPath).toLowerCase();
      const document = this.readExistingDocument(configPath);
      if (!document || !Array.isArray(document.configurations)) {
        continue;
      }
      if (document.configurations.length === 0) {
        if (this.deleteInvalidOrManagedCppProperties(configPath, 'empty configurations array')) {
          modified += 1;
        }
        continue;
      }
      if (!activeConfigPath || normalized !== activeConfigPath) {
        if (this.removeManagedConfigurationFromDocument(configPath, document, 'orphaned or inactive QPM workspace folder')) {
          modified += 1;
        }
      }
    }
    return modified;
  }

  requestSync(workspace: QpmWorkspace | undefined): void {
    this.setCurrentWorkspace(workspace);
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      void this.sync(workspace);
    }, 1200);
  }

  async sync(workspace: QpmWorkspace | undefined, notify = false, force = false): Promise<string | undefined> {
    this.setCurrentWorkspace(workspace);
    if (!workspace) {
      if (notify) {
        vscode.window.showErrorMessage('Open a Qt workspace or project before synchronizing IntelliSense.');
      }
      return undefined;
    }

    const enabled = vscode.workspace.getConfiguration('qpm').get<boolean>('autoConfigureCppTools', true);
    if (!enabled && !notify && !force) {
      return undefined;
    }

    const installation = this.getActiveInstallation(workspace, notify);
    if (!installation) {
      if (notify) {
        vscode.window.showErrorMessage('No Qt/C++ toolchain is selected. Detect or select a toolchain before synchronizing IntelliSense.');
      }
      return undefined;
    }

    const root = this.findConfigurationRoot(workspace.path);
    const configPath = path.join(root, '.vscode', 'c_cpp_properties.json');
    this.cleanupStaleManagedConfigurations(configPath);
    const repairedLegacyDriveRoot = this.cleanupLegacyDriveRootManagedConfiguration(root);
    const compileCommandsPath = this.synchronizeNativeQtCompileCommands(workspace, root);
    const configuration = this.createManagedConfiguration(installation, workspace, compileCommandsPath);
    const document = this.readExistingDocument(configPath);
    if (!document) {
      return undefined;
    }

    const configurations = Array.isArray(document.configurations) ? [...document.configurations] : [];
    const previousIndex = configurations.findIndex((candidate) => candidate?.name === MANAGED_CONFIGURATION_NAME);
    if (previousIndex >= 0) {
      configurations[previousIndex] = configuration;
    } else {
      configurations.unshift(configuration);
    }

    const updated: CppPropertiesDocument = {
      ...document,
      version: 4,
      enableConfigurationSquiggles: true,
      configurations
    };
    const rendered = `${JSON.stringify(updated, null, 2)}\n`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : undefined;
    if (previous !== rendered) {
      fs.writeFileSync(configPath, rendered, 'utf8');
      this.output.appendLine(`[Qt/C++] Synchronized Qt/C++ IntelliSense configuration: ${configPath}`);
    }

    this.notifyProviderChanged();

    const exactFolder = findExactWorkspaceFolder(root);
    if (!exactFolder) {
      this.output.appendLine(`[Qt/C++] IntelliSense configuration was written in ${configPath}, but ${root} is not an exact VS Code workspace folder.`);
      const added = await this.ensureConfigurationRootInWorkspace(workspace, notify);
      if (!added && notify) {
        vscode.window.showWarningMessage(`Add ${root} as a VS Code workspace folder so the Microsoft C/C++ extension loads the generated c_cpp_properties.json file.`);
      }
    }

    try {
      await this.activateCppToolsExtension();
      await vscode.commands.executeCommand('C_Cpp.RescanWorkspace');
      if (repairedLegacyDriveRoot) {
        await vscode.commands.executeCommand('C_Cpp.ResetDatabase');
      }
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Microsoft C/C++ rescan was deferred: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (notify) {
      vscode.window.showInformationMessage(`Qt/C++ IntelliSense configuration synchronized in ${configPath}.`);
    }
    return configPath;
  }

  async synchronizeNativeProject(
    workspace: QpmWorkspace | undefined = this.currentWorkspace,
    options: { force?: boolean; notify?: boolean; ensureWorkspaceFolder?: boolean; reason?: string } = {}
  ): Promise<string | undefined> {
    this.setCurrentWorkspace(workspace);
    if (!workspace || !this.hasNativeQtProject(workspace)) {
      return undefined;
    }

    const force = options.force === true;
    const notify = options.notify === true;
    const shouldEnsureWorkspaceFolder = options.ensureWorkspaceFolder !== false
      && (force || vscode.workspace.getConfiguration('qpm').get<boolean>('autoAddQpmFolderToWorkspace', true));
    if (shouldEnsureWorkspaceFolder) {
      await this.ensureConfigurationRootInWorkspace(workspace, false, force);
      await this.waitForConfigurationRoot(workspace);
    }

    const configPath = await this.sync(workspace, notify, force);
    if (configPath && options.reason) {
      this.output.appendLine(`[Qt/C++] Automatic IntelliSense synchronization completed (${options.reason}): ${configPath}`);
    }
    return configPath;
  }

  async ensureConfigurationRootInWorkspace(workspace: QpmWorkspace | undefined = this.currentWorkspace, notify = false, force = false): Promise<boolean> {
    if (!workspace) {
      return false;
    }
    const enabled = vscode.workspace.getConfiguration('qpm').get<boolean>('autoAddQpmFolderToWorkspace', true);
    if (!enabled && !force) {
      return false;
    }

    const root = this.findConfigurationRoot(workspace.path, false);
    const rootUri = vscode.Uri.file(root);
    if (findExactWorkspaceFolder(root)) {
      return false;
    }

    const currentFolders = vscode.workspace.workspaceFolders ?? [];
    const added = vscode.workspace.updateWorkspaceFolders(currentFolders.length, 0, { uri: rootUri, name: path.basename(root) });
    if (!added) {
      this.output.appendLine(`[Qt/C++] VS Code could not add ${root} to the standard Explorer automatically.`);
      if (notify) {
        vscode.window.showWarningMessage(`VS Code could not add ${root} to the current workspace automatically. Open this directory manually.`);
      }
      return false;
    }

    this.output.appendLine(`[Qt/C++] Added the Qt/C++ folder to the standard VS Code Explorer: ${root}`);
    if (notify) {
      vscode.window.showInformationMessage(`Added ${root} to the standard VS Code Explorer.`);
    }
    return true;
  }

  async addConfigurationRootToWorkspace(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<void> {
    if (!workspace) {
      vscode.window.showErrorMessage('Open a Qt workspace or project first.');
      return;
    }
    const root = this.findConfigurationRoot(workspace.path, false);
    const rootUri = vscode.Uri.file(root);
    const alreadyOpen = !!findExactWorkspaceFolder(root);
    if (!alreadyOpen) {
      const currentFolders = vscode.workspace.workspaceFolders ?? [];
      const added = vscode.workspace.updateWorkspaceFolders(currentFolders.length, 0, { uri: rootUri, name: path.basename(root) });
      if (!added) {
        vscode.window.showWarningMessage(`VS Code could not add ${root} to the current workspace automatically. Open this directory manually.`);
        return;
      }
      this.output.appendLine(`[Qt/C++] Added the Qt/C++ folder to the standard VS Code Explorer: ${root}`);
    }
    await this.sync(workspace, false);
    vscode.window.showInformationMessage(alreadyOpen
      ? `${root} is already available in the standard VS Code Explorer.`
      : `Added ${root} to the standard VS Code Explorer for Qt/C++ IntelliSense.`);
  }

  async offerProviderRepairIfNeeded(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<void> {
    if (!this.hasConfiguredQpmProviderReference()) {
      return;
    }
    const action = await vscode.window.showWarningMessage(
      'A legacy dynamic Qt/C++ configuration provider is still selected in VS Code. It can override normal IntelliSense settings outside managed projects. Use the managed c_cpp_properties.json configuration instead?',
      'Repair IntelliSense',
      'Keep provider'
    );
    if (action === 'Repair IntelliSense') {
      await this.repairCppToolsProviderSelection(workspace);
    }
  }

  async autoRepairStaleProviderSelection(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<boolean> {
    const clearedScopes: string[] = [];
    const settingName = 'default.configurationProvider';
    const clearIfManaged = async (resource: vscode.Uri | undefined, target: vscode.ConfigurationTarget, value: unknown, scopeLabel: string): Promise<void> => {
      if (!isQpmProviderId(value)) {
        return;
      }
      await vscode.workspace.getConfiguration('C_Cpp', resource).update(settingName, undefined, target);
      clearedScopes.push(scopeLabel);
    };

    const globalConfig = vscode.workspace.getConfiguration('C_Cpp');
    const globalInspect = globalConfig.inspect<string>(settingName);
    await clearIfManaged(undefined, vscode.ConfigurationTarget.Global, globalInspect?.globalValue, 'user settings');
    await clearIfManaged(undefined, vscode.ConfigurationTarget.Workspace, globalInspect?.workspaceValue, 'workspace settings');

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const scoped = vscode.workspace.getConfiguration('C_Cpp', folder.uri);
      const inspected = scoped.inspect<string>(settingName);
      await clearIfManaged(folder.uri, vscode.ConfigurationTarget.WorkspaceFolder, inspected?.workspaceFolderValue, `folder settings: ${folder.name}`);
    }

    const oldSetting = vscode.workspace.getConfiguration('qpm').get<boolean>('useCppToolsConfigurationProvider', false);
    if (oldSetting) {
      await vscode.workspace.getConfiguration('qpm').update('useCppToolsConfigurationProvider', false, vscode.ConfigurationTarget.Global);
      clearedScopes.push('deprecated dynamic provider setting');
    }
    const removedFromFiles = await this.removeManagedProviderReferencesFromOpenedFolders();
    const changed = clearedScopes.length > 0 || removedFromFiles > 0;
    if (changed) {
      this.output.appendLine(`[Qt/C++] Automatically removed stale dynamic IntelliSense provider references${clearedScopes.length ? ` from ${clearedScopes.join(', ')}` : ''}${removedFromFiles ? ` and ${removedFromFiles} managed c_cpp_properties.json file(s)` : ''}.`);
    }
    return changed;
  }

  async enableAutomaticSuggestions(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<void> {
    const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;

    await this.autoRepairStaleProviderSelection(workspace);

    const rootConfig = vscode.workspace.getConfiguration();
    await rootConfig.update('editor.quickSuggestions', { other: 'on', comments: 'off', strings: 'off' }, target);
    await rootConfig.update('editor.quickSuggestionsDelay', 10, target);
    await rootConfig.update('editor.suggestOnTriggerCharacters', true, target);
    await rootConfig.update('editor.suggest.snippetsPreventQuickSuggestions', false, target);

    const cppConfig = vscode.workspace.getConfiguration('C_Cpp');
    await cppConfig.update('autocomplete', 'Default', target);
    await cppConfig.update('intelliSenseEngine', 'Default', target);
    await cppConfig.update('errorSquiggles', 'Enabled', target);

    const extensionConfig = vscode.workspace.getConfiguration('qpm');
    await extensionConfig.update('enableSupplementalCompletionProvider', false, target);
    await extensionConfig.update('enableStandardLibraryCompletionProvider', true, target);
    await extensionConfig.update('standardLibraryCompletionAutoInclude', true, target);

    this.output.appendLine('[Qt/C++] Automatic suggestions enabled. Project-symbol supplemental completion is disabled; lightweight standard-library completion with auto-include is enabled.');

    const resetCommand = await this.findAvailableCommand(['C_Cpp.ResetDatabase', 'C_Cpp.RescanWorkspace']);
    const action = await vscode.window.showInformationMessage(
      'Automatic Qt/C++ suggestions have been enabled for this workspace. Project-symbol QPM supplemental completion was disabled, while lightweight standard-library completion remains enabled. Reload VS Code; if old QPM symbols are still suggested, reset the Microsoft Qt/C++ IntelliSense database.',
      resetCommand ? 'Reset Qt/C++ database' : 'Reload Window',
      'Reload Window'
    );
    if (action === 'Reset Qt/C++ database' && resetCommand) {
      await vscode.commands.executeCommand(resetCommand);
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (action === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private async findAvailableCommand(candidates: string[]): Promise<string | undefined> {
    const commands = await vscode.commands.getCommands(true);
    return candidates.find((candidate) => commands.includes(candidate));
  }

  async repairCppToolsProviderSelection(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<void> {
    const changed = await this.autoRepairStaleProviderSelection(workspace);
    this.output.appendLine(changed
      ? '[Qt/C++] IntelliSense repair removed stale provider references.'
      : '[Qt/C++] IntelliSense repair found no stale Qt Project Manager provider reference.');
    const action = await vscode.window.showInformationMessage(
      'Qt/C++ provider cleanup completed. Reload VS Code, then run Qt/C++: Reset IntelliSense Database once to restore native completion such as printf.',
      'Reload Window'
    );
    if (action === 'Reload Window') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private hasConfiguredQpmProviderReference(): boolean {
    const settingName = 'default.configurationProvider';
    const inspect = vscode.workspace.getConfiguration('C_Cpp').inspect<string>(settingName);
    if (isQpmProviderId(inspect?.globalValue) || isQpmProviderId(inspect?.workspaceValue)) {
      return true;
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const scoped = vscode.workspace.getConfiguration('C_Cpp', folder.uri).inspect<string>(settingName);
      if (isQpmProviderId(scoped?.workspaceFolderValue)) {
        return true;
      }
    }
    return false;
  }

  private async removeManagedProviderReferencesFromOpenedFolders(): Promise<number> {
    let modifiedFiles = 0;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const configPath = path.join(folder.uri.fsPath, '.vscode', 'c_cpp_properties.json');
      if (!fs.existsSync(configPath)) {
        continue;
      }
      const document = this.readExistingDocument(configPath);
      if (!document || !Array.isArray(document.configurations)) {
        continue;
      }
      let changed = false;
      for (const configuration of document.configurations) {
        if (configuration?.name !== MANAGED_CONFIGURATION_NAME) {
          continue;
        }
        if (isQpmProviderId(configuration.configurationProvider)) {
          delete configuration.configurationProvider;
          changed = true;
        }
        if (configuration.mergeConfigurations !== undefined) {
          delete configuration.mergeConfigurations;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
        this.output.appendLine(`[Qt/C++] Removed stale provider reference from ${configPath}`);
        modifiedFiles += 1;
      }
    }
    return modifiedFiles;
  }

  private cleanupStaleManagedConfigurations(activeConfigPath: string): number {
    let modified = 0;
    const active = path.resolve(activeConfigPath).toLowerCase();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const configPath = path.join(folder.uri.fsPath, '.vscode', 'c_cpp_properties.json');
      if (path.resolve(configPath).toLowerCase() === active || !fs.existsSync(configPath)) {
        continue;
      }
      const document = this.readExistingDocument(configPath);
      if (!document || !Array.isArray(document.configurations)) {
        continue;
      }
      if (this.removeManagedConfigurationFromDocument(configPath, document, 'stale broad workspace configuration')) {
        modified += 1;
      }
    }
    return modified;
  }

  async diagnose(workspace: QpmWorkspace | undefined = this.currentWorkspace): Promise<void> {
    this.setCurrentWorkspace(workspace);
    this.output.appendLine('');
    this.output.appendLine('========== Qt Project Manager IntelliSense diagnostic ==========');
    if (!workspace) {
      this.output.appendLine('[Qt/C++] No Qt workspace is currently loaded.');
      this.output.show(true);
      vscode.window.showErrorMessage('No Qt workspace is currently loaded. Open a .cws or .prj file first.');
      return;
    }

    const installation = this.getActiveInstallation(workspace);
    const root = this.findConfigurationRoot(workspace.path);
    const owningFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(workspace.path));
    this.output.appendLine(`[Qt/C++] Workspace: ${workspace.path}`);
    this.output.appendLine(`[Qt/C++] Configuration root: ${root}`);
    this.output.appendLine(`[Qt/C++] Configuration root is active in VS Code: ${owningFolder ? 'yes' : 'no'}`);
    this.output.appendLine(`[Qt/C++] Dynamic provider registered: ${this.providerRegistered ? 'yes' : 'no'}`);
    this.output.appendLine(`[Qt/C++] Microsoft Qt/C++ extension detected: ${vscode.extensions.getExtension(CPPTOOLS_EXTENSION_ID) ? 'yes' : 'no'}`);

    if (!installation) {
      this.output.appendLine('[Qt/C++] No active Qt/C++ toolchain detected.');
      this.output.show(true);
      vscode.window.showWarningMessage('No active Qt/C++ toolchain detected. Detect or select a toolchain, then synchronize IntelliSense.');
      return;
    }

    const compilerPath = this.resolveCompilerPath(installation, workspace);
    this.output.appendLine(`[Qt/C++] Active toolchain root: ${installation.root}`);
    this.output.appendLine(`[Qt/C++] C compiler: ${installation.cCompilerExe ?? installation.compileExe ?? 'not configured'}`);
    this.output.appendLine(`[Qt/C++] C++ compiler: ${installation.cppCompilerExe ?? 'not configured'}`);
    this.output.appendLine(`[Qt/C++] Archiver: ${installation.archiverExe ?? 'not configured'}`);
    this.output.appendLine(`[Qt/C++] Debugger: ${installation.debuggerExe ?? 'not configured'}`);
    this.output.appendLine(`[Qt/C++] IntelliSense compiler: ${compilerPath ?? 'not detected; explicit include paths will be used'}`);

    const windowsHeaderCandidates = findWindowsHeaderCandidates();
    const exceptionHeaderCandidates = findMsvcCompatibilityIncludeDirectories().map((directory) => path.join(directory, 'excpt.h')).filter((candidate) => fs.existsSync(candidate)).map(toForwardSlashes);
    this.output.appendLine(`[Qt/C++] windows.h candidates: ${windowsHeaderCandidates.length ? windowsHeaderCandidates.join(' · ') : 'not found in detected Windows SDK directories'}`);
    this.output.appendLine(`[Qt/C++] excpt.h candidates: ${exceptionHeaderCandidates.length ? exceptionHeaderCandidates.join(' · ') : 'not found in detected MSVC compatibility include directories'}`);

    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (activeFile) {
      this.output.appendLine(`[Qt/C++] Active editor file: ${activeFile}`);
      this.output.appendLine(`[Qt/C++] Dynamic provider accepts active file: ${this.canProvideConfiguration(vscode.Uri.file(activeFile)) ? 'yes' : 'no'}`);
    }

    const paths = this.getProviderPaths(workspace, installation);
    this.output.appendLine(`[Qt/C++] Provider include directories: ${paths.includePath.length}`);
    for (const includePath of paths.includePath) {
      this.output.appendLine(`  - ${includePath}`);
    }
    this.output.appendLine('===================================================================');
    this.output.show(true);

    const message = compilerPath
      ? 'Qt/C++ IntelliSense diagnostic complete. Details were written to the Qt Project Manager output channel.'
      : 'No IntelliSense compiler is configured. Select a toolchain or set qpm.intelliSenseCompilerPath.';
    const action = await vscode.window.showInformationMessage(message, 'Synchronize now', 'Select toolchain');
    if (action === 'Synchronize now') {
      await this.sync(workspace, true);
    } else if (action === 'Select toolchain') {
      await vscode.commands.executeCommand('qpm.configureInstallation');
    }
  }

  private hasNativeQtProject(workspace: QpmWorkspace): boolean {
    return workspace.projects.some((project) => project.exists && isQtProjectManifestPath(project.absolutePath));
  }

  private async waitForConfigurationRoot(workspace: QpmWorkspace, timeoutMs = 1500): Promise<void> {
    const root = this.findConfigurationRoot(workspace.path, false);
    if (findExactWorkspaceFolder(root)) {
      return;
    }
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await delay(75);
      if (findExactWorkspaceFolder(root)) {
        return;
      }
    }
  }

  private async activateCppToolsExtension(): Promise<void> {
    const extension = vscode.extensions.getExtension(CPPTOOLS_EXTENSION_ID);
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  }

  private getActiveInstallation(workspace: QpmWorkspace, notify = false): QpmInstallation | undefined {
    const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex);
    if (activeRef?.exists && isQtProjectManifestPath(activeRef.absolutePath)) {
      try {
        const manifest = readQtProjectManifest(activeRef.absolutePath);
        const qt = this.qtInstallations.getActive(getQtInstallationPreference(manifest));
        if (qt) {
          return {
            root: qt.toolchain.binDir ?? qt.root,
            label: `${qt.label} toolchain`,
            compileExe: qt.toolchain.cCompilerPath,
            cCompilerExe: qt.toolchain.cCompilerPath,
            cppCompilerExe: qt.toolchain.cppCompilerPath,
            archiverExe: qt.toolchain.archiverPath,
            debuggerExe: qt.toolchain.debuggerPath,
            source: 'configured'
          };
        }
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Cannot resolve native Qt toolchain: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return this.installations.getActiveInstallation(workspace.qpmDir, notify);
  }

  private setCurrentWorkspace(workspace: QpmWorkspace | undefined): void {
    if (this.currentWorkspace?.path !== workspace?.path) {
      this.cachedProviderPaths = undefined;
    }
    this.currentWorkspace = workspace;
    this.notifyProviderChanged();
  }

  private notifyProviderChanged(): void {
    if (!this.providerRegistered || !this.cppToolsApi) {
      return;
    }
    try {
      this.cppToolsApi.didChangeCustomConfiguration(this.provider);
      this.cppToolsApi.didChangeCustomBrowseConfiguration(this.provider);
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Cannot notify the Qt/C++ extension about updated Qt/C++ paths: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private canProvideConfiguration(uri: vscode.Uri): boolean {
    const workspace = this.currentWorkspace;
    if (!workspace || uri.scheme !== 'file') {
      return false;
    }
    const extension = path.extname(uri.fsPath).toLowerCase();
    if (!['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx'].includes(extension)) {
      return false;
    }
    const candidate = path.resolve(uri.fsPath);
    const workspaceDirectory = path.dirname(workspace.path);
    if (isPathInside(candidate, workspaceDirectory)) {
      return true;
    }
    for (const project of workspace.projects) {
      if (project.exists && isPathInside(candidate, path.dirname(project.absolutePath))) {
        return true;
      }
    }
    const installation = this.getActiveInstallation(workspace);
    return !!installation && isPathInside(candidate, installation.root);
  }

  private provideConfigurations(uris: vscode.Uri[]): SourceFileConfigurationItem[] {
    const workspace = this.currentWorkspace;
    if (!workspace) {
      return [];
    }
    const installation = this.getActiveInstallation(workspace, false);
    if (!installation) {
      return [];
    }
    const paths = this.getProviderPaths(workspace, installation);
    return uris.filter((uri) => this.canProvideConfiguration(uri)).map((uri) => ({
      uri,
      configuration: {
        includePath: paths.includePath,
        defines: defaultDefines(),
        intelliSenseMode: detectIntelliSenseMode(paths.compilerPath ?? installation.root),
        standard: isCppFile(uri.fsPath) ? 'c++17' : 'c11',
        ...(paths.compilerPath ? { compilerPath: paths.compilerPath } : {})
      }
    }));
  }

  private provideBrowseConfiguration(): WorkspaceBrowseConfiguration | null {
    const workspace = this.currentWorkspace;
    if (!workspace) {
      return null;
    }
    const installation = this.getActiveInstallation(workspace, false);
    if (!installation) {
      return null;
    }
    const paths = this.getProviderPaths(workspace, installation);
    return {
      browsePath: paths.browsePath,
      standard: 'c11',
      ...(paths.compilerPath ? { compilerPath: paths.compilerPath } : {})
    };
  }

  private getProviderPaths(workspace: QpmWorkspace, installation: QpmInstallation): ProviderPaths {
    const additional = this.getAdditionalIncludePaths();
    const compilerPath = this.resolveCompilerPath(installation, workspace);
    const key = JSON.stringify({ workspace: workspace.path, installation: installation.root, compilerPath, additional });
    if (this.cachedProviderPaths?.key === key) {
      return this.cachedProviderPaths.value;
    }

    const projectDirectories = this.collectProjectDirectories(workspace);
    const compilerIncludeDirectories = findCompilerIncludeDirectories(installation);
    const windowsKitRoots = findWindowsKitIncludeDirectories();
    const msvcCompatibilityRoots = findMsvcCompatibilityIncludeDirectories();
    const includePath = unique([
      ...projectDirectories,
      ...compilerIncludeDirectories,
      ...windowsKitRoots.flatMap((directory) => collectHeaderDirectories(directory, 3, 300)),
      ...msvcCompatibilityRoots,
      ...additional
    ].filter((entry) => fs.existsSync(entry)).map(toForwardSlashes));
    const browsePath = unique([
      ...projectDirectories,
      ...compilerIncludeDirectories,
      ...windowsKitRoots,
      ...msvcCompatibilityRoots,
      ...additional
    ].filter((entry) => fs.existsSync(entry)).map(toForwardSlashes));
    const value: ProviderPaths = {
      includePath,
      browsePath,
      compilerPath
    };
    this.cachedProviderPaths = { key, value };
    return value;
  }

  private collectProjectDirectories(workspace: QpmWorkspace): string[] {
    const directories = [path.dirname(workspace.path)];
    for (const projectRef of workspace.projects) {
      if (!projectRef.exists) {
        continue;
      }
      directories.push(path.dirname(projectRef.absolutePath));
      try {
        const project = isQtProjectManifestPath(projectRef.absolutePath) ? qtManifestToQpmProject(projectRef.absolutePath) : this.parser.parseProject(projectRef.absolutePath);
        for (const file of project.files) {
          directories.push(path.dirname(file.absolutePath));
        }
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Cannot collect IntelliSense paths from ${projectRef.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return unique(directories.filter((entry) => fs.existsSync(entry)).map(toForwardSlashes));
  }

  private workspaceContainsCppSources(workspace: QpmWorkspace): boolean {
    for (const projectRef of workspace.projects) {
      if (!projectRef.exists) {
        continue;
      }
      try {
        const project = isQtProjectManifestPath(projectRef.absolutePath) ? qtManifestToQpmProject(projectRef.absolutePath) : this.parser.parseProject(projectRef.absolutePath);
        if (project.files.some((file) => isCppFile(file.absolutePath))) {
          return true;
        }
      } catch {
        if (isCppFile(projectRef.absolutePath)) {
          return true;
        }
      }
    }
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    return !!activeFile && isPathInside(activeFile, path.dirname(workspace.path)) && isCppFile(activeFile);
  }

  private resolveCompilerPath(installation: QpmInstallation, workspace?: QpmWorkspace): string | undefined {
    const override = vscode.workspace.getConfiguration('qpm').get<string>('intelliSenseCompilerPath', '').trim();
    const workspaceUsesCpp = workspace ? this.workspaceContainsCppSources(workspace) : true;
    const preferredCompilers = workspaceUsesCpp
      ? [installation.cppCompilerExe, installation.cCompilerExe]
      : [installation.cCompilerExe, installation.cppCompilerExe];
    const activeRef = workspace?.projects.find((project) => project.index === workspace.activeProjectIndex);
    const nativeQtProject = !!activeRef?.exists && isQtProjectManifestPath(activeRef.absolutePath);
    let nativeKitCompilers: string[] = [];
    if (nativeQtProject && activeRef?.exists) {
      try {
        const manifest = readQtProjectManifest(activeRef.absolutePath);
        const mode = normalizeBuildMode(vscode.workspace.getConfiguration('qpm').get<string>('buildMode', 'debug64'));
        const kit = getQtKitProfileForBuild(manifest, mode);
        nativeKitCompilers = workspaceUsesCpp
          ? [kit.compilerPath, kit.cCompilerPath].filter((entry): entry is string => !!entry)
          : [kit.cCompilerPath, kit.compilerPath].filter((entry): entry is string => !!entry);
      } catch {
        nativeKitCompilers = [];
      }
    }
    const resolvedOverride = resolveExecutablePath(override);
    const resolvedToolchainCompilers = [installation.cCompilerExe, installation.cppCompilerExe, installation.clangCcExe, installation.compileExe]
      .map(resolveExecutablePath)
      .filter((value): value is string => !!value);
    const overrideLooksAutoPersisted = !!resolvedOverride && resolvedToolchainCompilers.some((compiler) => samePath(resolvedOverride, compiler));
    const candidates = [
      // Native Qt projects must use the compiler resolved from their Qt kit. A
      // stale generic IntelliSense override from CPM/QPM compatibility mode can
      // otherwise reintroduce a 32-bit compiler after the build toolchain was fixed.
      ...(!nativeQtProject && override && !overrideLooksAutoPersisted ? [override] : []),
      ...nativeKitCompilers,
      ...preferredCompilers,
      installation.clangCcExe,
      installation.compileExe
    ].filter((value): value is string => !!value?.trim());

    for (const candidate of candidates) {
      const resolved = resolveExecutablePath(candidate);
      if (resolved) {
        return toForwardSlashes(resolved);
      }
      if (!path.isAbsolute(candidate) && !candidate.includes(path.sep) && !candidate.includes('/')) {
        return candidate;
      }
      this.output.appendLine(`[Qt/C++] Configured IntelliSense compiler path does not exist: ${candidate}`);
    }
    return undefined;
  }

  private getAdditionalIncludePaths(): string[] {
    const base = vscode.workspace.getConfiguration('qpm').get<string[]>('additionalIncludePaths', [])
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => path.normalize(entry));
    const sdl = getSdlConfigurationFromWorkspace();
    if (sdl.enabled !== 'off' && sdl.rootPath) {
      const installation = describeSdlRoot(sdl.rootPath, 'configured');
      if (installation) {
        base.push(...installation.includeDirectories);
      }
    }
    const activeRef = this.currentWorkspace?.projects.find((project) => project.index === this.currentWorkspace?.activeProjectIndex);
    if (activeRef?.exists && isQtProjectManifestPath(activeRef.absolutePath)) {
      try {
        const manifest = readQtProjectManifest(activeRef.absolutePath);
        const qt = this.qtInstallations.getActive(getQtInstallationPreference(manifest));
        if (qt) {
          const modules = resolveQtModuleOrder(manifest.qt.modules);
          base.push(qt.includeDir, ...modules.map((module) => path.join(qt.includeDir, `Qt${module}`)));
          const mkspecDirectory = resolveQtMkspecDirectory(qt);
          if (mkspecDirectory) base.push(mkspecDirectory);
          for (const includeDirectory of manifest.includeDirectories) {
            base.push(path.resolve(path.dirname(activeRef.absolutePath), includeDirectory));
          }
          const generatedDirectory = qtGeneratedDirectory(activeRef.absolutePath, vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug'), manifest);
          fs.mkdirSync(generatedDirectory, { recursive: true });
          base.push(generatedDirectory);
        }
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Cannot collect native Qt include paths: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const qt = this.qtInstallations.getActive();
      if (qt) base.push(qt.includeDir);
    }
    return unique(base);
  }

  private findConfigurationRoot(workspacePath: string, preferOpenedFolder = true): string {
    const workspace = this.currentWorkspace;
    const projectRoot = workspace ? this.findProjectConfigurationRoot(workspace) : undefined;
    const fallbackRoot = projectRoot ?? path.dirname(workspacePath);
    if (!preferOpenedFolder) {
      return fallbackRoot;
    }

    const fallbackUri = vscode.Uri.file(fallbackRoot);
    const owner = vscode.workspace.getWorkspaceFolder(fallbackUri);
    if (!owner) {
      return fallbackRoot;
    }

    // Avoid falling back to a broad VS Code folder such as Downloads, OneDrive or
    // the extension development workspace. A broad root makes cpptools index far
    // more files than the managed Qt project actually owns.
    const relative = path.relative(owner.uri.fsPath, fallbackRoot);
    const ownerIsExact = relative === '';
    return ownerIsExact ? owner.uri.fsPath : fallbackRoot;
  }

  private findProjectConfigurationRoot(workspace: QpmWorkspace): string | undefined {
    const directories: string[] = [];
    const activeProjectRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex && project.exists)
      ?? workspace.projects.find((project) => project.exists);

    if (activeProjectRef?.exists && isQtProjectManifestPath(activeProjectRef.absolutePath)) {
      // A native Qt manifest is authoritative: IntelliSense files belong beside
      // that manifest, never at the workspace root or the Windows drive root.
      return path.dirname(path.resolve(activeProjectRef.absolutePath));
    }

    const collectFromProject = (projectRef: typeof activeProjectRef): void => {
      if (!projectRef?.exists) {
        return;
      }
      directories.push(path.dirname(projectRef.absolutePath));
      try {
        const project = this.parser.parseProject(projectRef.absolutePath);
        for (const file of project.files) {
          if (file.exists && isSourceOrHeaderPath(file.absolutePath)) {
            directories.push(path.dirname(file.absolutePath));
          }
        }
      } catch {
        // Keep the project file directory as a safe fallback.
      }
    };

    collectFromProject(activeProjectRef);
    if (!directories.length) {
      return undefined;
    }
    return commonAncestorDirectory(unique(directories.map((directory) => path.resolve(directory))));
  }

  private synchronizeNativeQtCompileCommands(workspace: QpmWorkspace, root: string): string | undefined {
    const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex && project.exists)
      ?? workspace.projects.find((project) => project.exists);
    if (!activeRef?.exists || !isQtProjectManifestPath(activeRef.absolutePath)) {
      return undefined;
    }

    try {
      const manifest = readQtProjectManifest(activeRef.absolutePath);
      const installation = this.qtInstallations.getActive(getQtInstallationPreference(manifest));
      if (!installation) {
        return undefined;
      }
      const mode = normalizeBuildMode(vscode.workspace.getConfiguration('qpm').get<string>('buildMode', 'debug64'));
      const profile = getActiveQtBuildProfile(manifest, mode);
      const kit = getQtKitProfileForBuild(manifest, mode);
      const compilerPath = kit.compilerPath || installation.toolchain.cppCompilerPath;
      if (!compilerPath) {
        return undefined;
      }
      const compiler = path.resolve(compilerPath);
      const compileCommandsPath = path.join(root, 'compile_commands.json');

      // CMake produces the authoritative database. Keep it when the backend has
      // already configured or built the project; otherwise create a QPM fallback
      // so headers and code completion work immediately after switching backend.
      if (profile.system === 'cmake' && fs.existsSync(compileCommandsPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(compileCommandsPath, 'utf8'));
          if (Array.isArray(parsed) && parsed.length > 0) return compileCommandsPath;
        } catch {
          // Recreate a valid fallback below.
        }
      }

      let entries: Array<{ directory: string; file: string; arguments: string[]; output: string }>;
      if (profile.system === 'direct') {
        const effectiveInstallation = {
          ...installation,
          compilerFamily: kit.compilerFamily && kit.compilerFamily !== 'unknown' ? kit.compilerFamily : installation.compilerFamily,
          architecture: kit.architecture === 'x86' || kit.architecture === 'x64' ? kit.architecture : installation.architecture,
          toolchain: {
            ...installation.toolchain,
            family: kit.compilerFamily && kit.compilerFamily !== 'unknown' ? kit.compilerFamily : installation.toolchain.family,
            architecture: kit.architecture === 'x86' || kit.architecture === 'x64' ? kit.architecture : installation.toolchain.architecture,
            detectedArchitecture: kit.architecture === 'x86' || kit.architecture === 'x64' ? kit.architecture : installation.toolchain.detectedArchitecture,
            targetTriple: kit.compilerTargetTriple || installation.toolchain.targetTriple,
            compilerVersion: kit.compilerVersion || installation.toolchain.compilerVersion,
            compatibility: kit.compatibility || installation.toolchain.compatibility,
            diagnostic: kit.diagnostic || installation.toolchain.diagnostic,
            cCompilerPath: kit.cCompilerPath || installation.toolchain.cCompilerPath,
            cppCompilerPath: kit.compilerPath || installation.toolchain.cppCompilerPath,
            debuggerPath: kit.debuggerPath || installation.toolchain.debuggerPath,
            makePath: kit.buildToolPath || installation.toolchain.makePath,
            environmentScript: kit.environmentScript || installation.toolchain.environmentScript
          }
        };
        const plan = createQtDirectBuildPlan(activeRef.absolutePath, mode, effectiveInstallation);
        const sources = unique([...plan.sourceFiles, ...plan.generatedSourceFiles]);
        entries = sources.map((sourcePath) => {
          const objectPath = qtObjectPathForSource(plan, sourcePath);
          return {
            directory: plan.projectDirectory,
            file: sourcePath,
            arguments: [compiler, ...qtCompileArguments(plan, sourcePath, objectPath)],
            output: objectPath
          };
        });
      } else {
        const projectRoot = path.dirname(activeRef.absolutePath);
        const files = resolveQtProjectFiles(activeRef.absolutePath, manifest);
        const generatedDirectory = qtGeneratedDirectory(activeRef.absolutePath, mode, manifest);
        fs.mkdirSync(generatedDirectory, { recursive: true });
        const includeDirectories = unique([
          projectRoot,
          ...manifest.includeDirectories.map((entry) => path.resolve(projectRoot, entry)),
          generatedDirectory,
          installation.includeDir,
          ...resolveQtModuleOrder(manifest.qt.modules).map((module) => path.join(installation.includeDir, `Qt${module}`)),
          resolveQtMkspecDirectory(installation) || ''
        ].filter(Boolean));
        const defines = unique([
          ...manifest.defines,
          ...profile.defines,
          ...manifest.qt.modules.map((module) => `QT_${module.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_LIB`)
        ]);
        const objectDirectory = path.resolve(projectRoot, profile.outputDirectory, isReleaseBuildModeCompat(mode) ? 'release' : 'debug', 'obj');
        const sources = unique(files.sources);
        entries = sources.map((sourcePath) => {
          const relative = path.relative(projectRoot, sourcePath).replace(/[^A-Za-z0-9_.-]+/g, '_');
          const objectPath = path.join(objectDirectory, `${relative}.o`);
          const family = kit.compilerFamily || installation.compilerFamily;
          const argumentsList = createBackendCompileDatabaseArguments(compiler, sourcePath, objectPath, profile.cppStandard, includeDirectories, defines, profile.compilerFlags, family === 'msvc');
          return { directory: projectRoot, file: sourcePath, arguments: argumentsList, output: objectPath };
        });
      }

      const rendered = `${JSON.stringify(entries, null, 2)}\n`;
      const previous = fs.existsSync(compileCommandsPath) ? fs.readFileSync(compileCommandsPath, 'utf8') : undefined;
      if (previous !== rendered) {
        fs.writeFileSync(compileCommandsPath, rendered, 'utf8');
        this.output.appendLine(`[Qt/C++] Synchronized Qt compile database (${profile.system}): ${compileCommandsPath}`);
      }
      return compileCommandsPath;
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Compile database generation skipped: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private cleanupLegacyDriveRootManagedConfiguration(projectRoot: string): boolean {
    const driveRoot = parsePathRoot(projectRoot);
    if (!driveRoot || samePath(driveRoot, projectRoot)) {
      return false;
    }
    const configPath = joinPathPortable(driveRoot, '.vscode', 'c_cpp_properties.json');
    if (!fs.existsSync(configPath)) {
      return false;
    }
    try {
      const document = this.readExistingDocument(configPath);
      if (!document || !Array.isArray(document.configurations)) {
        return false;
      }
      if (!this.removeManagedConfigurationFromDocument(configPath, document, 'obsolete drive-root configuration')) {
        return false;
      }

      const folders = vscode.workspace.workspaceFolders ?? [];
      const driveFolderIndex = folders.findIndex((folder) => samePath(folder.uri.fsPath, driveRoot));
      if (driveFolderIndex >= 0) {
        const removed = vscode.workspace.updateWorkspaceFolders(driveFolderIndex, 1);
        if (removed) {
          this.output.appendLine(`[Qt/C++] Removed obsolete drive-root workspace folder added by an earlier QPM version: ${driveRoot}`);
        }
      }
      return true;
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Could not clean obsolete drive-root IntelliSense configuration ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private removeManagedConfigurationFromDocument(configPath: string, document: CppPropertiesDocument, reason: string): boolean {
    if (!Array.isArray(document.configurations)) {
      return false;
    }
    const before = document.configurations.length;
    document.configurations = document.configurations.filter((configuration) => configuration?.name !== MANAGED_CONFIGURATION_NAME);
    if (document.configurations.length === before) {
      return false;
    }
    if (document.configurations.length === 0) {
      return this.deleteInvalidOrManagedCppProperties(configPath, reason);
    }
    fs.writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    this.output.appendLine(`[Qt/C++] Removed ${reason} from ${configPath}`);
    return true;
  }

  private deleteInvalidOrManagedCppProperties(configPath: string, reason: string): boolean {
    try {
      fs.unlinkSync(configPath);
      removeDirectoryIfEmpty(path.dirname(configPath));
      this.output.appendLine(`[Qt/C++] Deleted ${configPath} (${reason}); cpptools rejects configuration files with an empty configurations array.`);
      return true;
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Could not delete ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private readExistingDocument(configPath: string): CppPropertiesDocument | undefined {
    if (!fs.existsSync(configPath)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(raw))) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('the root value is not a JSON object');
      }
      return parsed as CppPropertiesDocument;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`[Qt/C++] Cannot update ${configPath}: ${message}`);
      vscode.window.showWarningMessage(`The existing .vscode/c_cpp_properties.json file is invalid and was not modified: ${message}`);
      return undefined;
    }
  }

  private getActiveNativeQtManifest(workspace: QpmWorkspace) {
    const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex);
    if (!activeRef?.exists || !isQtProjectManifestPath(activeRef.absolutePath)) return undefined;
    try {
      return readQtProjectManifest(activeRef.absolutePath);
    } catch {
      return undefined;
    }
  }

  private createManagedConfiguration(installation: QpmInstallation, workspace: QpmWorkspace, compileCommandsPath?: string): CppToolsConfiguration {
    const compilerIncludeDirectories = findCompilerIncludeDirectories(installation);
    const windowsKitIncludeDirectories = findWindowsKitIncludeDirectories();
    const msvcCompatibilityIncludeDirectories = findMsvcCompatibilityIncludeDirectories();
    const projectDirectories = this.collectProjectDirectories(workspace);
    const additional = this.getAdditionalIncludePaths();
    const compilerPath = this.resolveCompilerPath(installation, workspace);
    const explicitSystemIncludes = compilerPath ? [] : [
      ...compilerIncludeDirectories,
      ...windowsKitIncludeDirectories,
      ...windowsKitIncludeDirectories.map((directory) => `${directory}${path.sep}**`),
      ...msvcCompatibilityIncludeDirectories
    ];

    const includePath = unique([
      '${workspaceFolder}',
      ...projectDirectories,
      ...explicitSystemIncludes,
      ...additional.map(existingPath)
    ].filter((value): value is string => !!value).map(toForwardSlashes));

    const browsePath = unique([
      '${workspaceFolder}',
      ...projectDirectories,
      ...(compilerPath ? [] : compilerIncludeDirectories),
      ...(compilerPath ? [] : windowsKitIncludeDirectories),
      ...(compilerPath ? [] : msvcCompatibilityIncludeDirectories),
      ...additional.map(existingPath)
    ].filter((value): value is string => !!value).map(toForwardSlashes));

    const nativeManifest = this.getActiveNativeQtManifest(workspace);
    const configuration: CppToolsConfiguration = {
      name: MANAGED_CONFIGURATION_NAME,
      intelliSenseMode: detectIntelliSenseMode(compilerPath ?? installation.root),
      cStandard: 'c11',
      cppStandard: nativeManifest?.build.cppStandard ?? 'c++17',
      ...(compileCommandsPath ? { compileCommands: toForwardSlashes(compileCommandsPath) } : {}),
      includePath,
      browse: {
        path: browsePath,
        limitSymbolsToIncludedHeaders: true
      },
      defines: unique([...defaultDefines(), ...(nativeManifest?.defines ?? []), ...(nativeManifest?.build.debug.defines ?? [])])
    };

    if (compilerPath) {
      configuration.compilerPath = compilerPath;
    }
    return configuration;
  }
}

function removeDirectoryIfEmpty(directory: string): void {
  try {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isQpmProviderId(value: unknown): boolean {
  return typeof value === 'string' && LEGACY_QPM_CONFIGURATION_PROVIDER_IDS.includes(value);
}


function resolveExecutablePath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (fs.existsSync(trimmed)) {
    return path.normalize(trimmed);
  }
  if (path.isAbsolute(trimmed) || trimmed.includes(path.sep) || trimmed.includes('/')) {
    return undefined;
  }
  const names = executableNamesForCompilerPath(trimmed);
  for (const directory of splitPathLikeEnvironment()) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (fs.existsSync(candidate)) {
        return path.normalize(candidate);
      }
    }
  }
  return undefined;
}

function executableNamesForCompilerPath(name: string): string[] {
  if (path.extname(name)) {
    return [name];
  }
  return process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name, `${name}.exe`];
}

function splitPathLikeEnvironment(): string[] {
  return (process.env.Path || process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectIntelliSenseMode(compilerOrRoot: string | undefined): string {
  const text = String(compilerOrRoot || '').toLowerCase();
  const arch = text.includes('mingw32') || text.includes('i686') || text.includes('x86_32') || text.includes('32') ? 'x86' : 'x64';
  if (process.platform === 'darwin') {
    return text.includes('clang') ? 'macos-clang-x64' : 'macos-gcc-x64';
  }
  if (process.platform !== 'win32') {
    return text.includes('clang') ? 'linux-clang-x64' : 'linux-gcc-x64';
  }
  return text.includes('clang') ? `windows-clang-${arch}` : `windows-gcc-${arch}`;
}

function findCompilerIncludeDirectories(installation: QpmInstallation): string[] {
  const bases = getToolchainBaseDirectories(installation);
  const result: string[] = [];
  for (const base of bases) {
    result.push(path.join(base, 'include'));
    result.push(...findLibStdCppIncludeDirectories(base));
    result.push(...findVersionedSubdirectories(path.join(base, 'lib', 'gcc'), 4)
      .filter((directory) => hasAnyHeader(directory, ['stddef.h', 'stdint.h', 'stdarg.h'])));
    result.push(...findVersionedSubdirectories(path.join(base, 'lib', 'clang'), 3)
      .filter((directory) => hasAnyHeader(directory, ['stddef.h', 'stdint.h', 'stdarg.h'])));
  }
  const compilerDirectories = [installation.cppCompilerExe, installation.cCompilerExe, installation.clangCcExe, installation.compileExe]
    .map(resolveExecutablePath)
    .filter((value): value is string => !!value)
    .map((value) => path.dirname(value));
  for (const compilerDirectory of compilerDirectories) {
    const base = path.basename(compilerDirectory).toLowerCase() === 'bin' ? path.dirname(compilerDirectory) : compilerDirectory;
    result.push(path.join(base, 'include'));
    result.push(...findLibStdCppIncludeDirectories(base));
    result.push(...findVersionedSubdirectories(path.join(base, 'lib', 'gcc'), 4)
      .filter((directory) => hasAnyHeader(directory, ['stddef.h', 'stdint.h', 'stdarg.h'])));
  }
  return unique(result.filter((entry) => fs.existsSync(entry)).map(toForwardSlashes));
}

function findLibStdCppIncludeDirectories(base: string): string[] {
  const root = path.join(base, 'include', 'c++');
  if (!fs.existsSync(root)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of safeReadDirectories(root)) {
    const versionDirectory = path.join(root, entry.name);
    if (!hasAnyHeader(versionDirectory, ['iostream', 'cstdio', 'exception', 'stdexcept'])) {
      continue;
    }
    result.push(versionDirectory);
    for (const target of safeReadDirectories(versionDirectory)) {
      const targetDirectory = path.join(versionDirectory, target.name);
      if (fs.existsSync(path.join(targetDirectory, 'bits', 'c++config.h'))) {
        result.push(targetDirectory);
      }
    }
    const backwardDirectory = path.join(versionDirectory, 'backward');
    if (fs.existsSync(backwardDirectory)) {
      result.push(backwardDirectory);
    }
  }
  return unique(result);
}

function getToolchainBaseDirectories(installation: QpmInstallation): string[] {
  const candidates: string[] = [];
  const addRoot = (root: string | undefined): void => {
    if (!root) return;
    const normalized = path.normalize(root);
    candidates.push(normalized);
    if (path.basename(normalized).toLowerCase() === 'bin') {
      candidates.push(path.dirname(normalized));
    }
  };
  addRoot(installation.root);
  for (const compiler of [installation.cppCompilerExe, installation.cCompilerExe, installation.clangCcExe, installation.compileExe]) {
    const resolved = resolveExecutablePath(compiler);
    if (!resolved) continue;
    const directory = path.dirname(resolved);
    candidates.push(directory);
    if (path.basename(directory).toLowerCase() === 'bin') {
      candidates.push(path.dirname(directory));
    }
  }
  return unique(candidates.filter((entry) => fs.existsSync(entry)).map(path.normalize));
}

function findVersionedSubdirectories(root: string, maxDepth: number): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length && result.length < 600) {
    const current = queue.shift()!;
    if (hasAnyHeader(current.directory, ['stdio.h', 'iostream', 'stddef.h', 'stdint.h', 'exception'])) {
      result.push(current.directory);
    }
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const entry of safeReadDirectories(current.directory)) {
      queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
    }
  }
  return unique(result);
}

function hasAnyHeader(directory: string, names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(directory, name)));
}

function findMsvcCompatibilityIncludeDirectories(): string[] {
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const roots = unique([
    path.join(programFiles, 'Microsoft Visual Studio'),
    path.join(programFilesX86, 'Microsoft Visual Studio'),
    path.join(programFilesX86, 'Microsoft Visual Studio 14.0', 'VC', 'include'),
    path.join(programFiles, 'Microsoft Visual Studio 14.0', 'VC', 'include')
  ]);
  const directories: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }
    if (fs.existsSync(path.join(root, 'excpt.h'))) {
      directories.push(root);
    }
    for (const header of findHeaderCandidates(root, ['excpt.h'], 9, 3000)) {
      directories.push(path.dirname(header));
    }
  }
  return unique(directories.map(toForwardSlashes));
}

function defaultDefines(): string[] {
  return [
    '_WINDOWS',
    '_WIN32',
    'WIN32',
    '_CRT_SECURE_NO_WARNINGS'
  ];
}

function findWindowsKitIncludeDirectories(): string[] {
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const roots = unique([
    path.join(programFilesX86, 'Windows Kits', '10', 'Include'),
    path.join(programFiles, 'Windows Kits', '10', 'Include'),
    path.join(programFilesX86, 'Windows Kits', '8.1', 'Include'),
    path.join(programFiles, 'Windows Kits', '8.1', 'Include'),
    path.join(programFilesX86, 'Microsoft SDKs', 'Windows', 'v7.1A', 'Include'),
    path.join(programFiles, 'Microsoft SDKs', 'Windows', 'v7.1A', 'Include')
  ]);
  const result: string[] = [];
  for (const includeRoot of roots) {
    if (!fs.existsSync(includeRoot)) {
      continue;
    }
    result.push(includeRoot);
    result.push(...collectHeaderDirectories(includeRoot, 4, 1200));
    for (const entry of safeReadDirectories(includeRoot)) {
      const versionDirectory = path.join(includeRoot, entry.name);
      result.push(versionDirectory);
      for (const segment of ['ucrt', 'shared', 'um', 'winrt', 'cppwinrt']) {
        const candidate = path.join(versionDirectory, segment);
        if (fs.existsSync(candidate)) {
          result.push(candidate);
        }
      }
    }
    for (const segment of ['ucrt', 'shared', 'um', 'winrt', 'cppwinrt']) {
      const candidate = path.join(includeRoot, segment);
      if (fs.existsSync(candidate)) {
        result.push(candidate);
      }
    }
  }
  return unique(result.map(toForwardSlashes));
}

function findWindowsHeaderCandidates(): string[] {
  const result: string[] = [];
  for (const directory of findWindowsKitIncludeDirectories()) {
    const candidate = path.join(directory, 'windows.h');
    if (fs.existsSync(candidate)) {
      result.push(toForwardSlashes(candidate));
    }
  }
  return unique(result);
}

function findHeaderCandidates(root: string, names: string[], maxDepth: number, maxDirectories: number): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const expected = new Set(names.map((name) => name.toLowerCase()));
  const result: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxDirectories) {
    const current = queue.shift()!;
    visited += 1;
    for (const entry of safeReadEntries(current.directory)) {
      if (entry.isFile() && expected.has(entry.name.toLowerCase())) {
        result.push(toForwardSlashes(path.join(current.directory, entry.name)));
      } else if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
      }
    }
  }
  return unique(result);
}

function collectHeaderDirectories(root: string, maxDepth: number, maxDirectories: number): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  while (queue.length && result.length < maxDirectories) {
    const current = queue.shift()!;
    const entries = safeReadEntries(current.directory);
    if (entries.some((entry) => entry.isFile() && /\.(h|hpp|hh|hxx)$/i.test(entry.name))) {
      result.push(current.directory);
    }
    if (current.depth >= maxDepth) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
      }
    }
  }
  if (!result.length) {
    result.push(root);
  }
  return unique(result.map(toForwardSlashes));
}

function safeReadEntries(directory: string): fs.Dirent[] {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeReadDirectories(directory: string): fs.Dirent[] {
  return safeReadEntries(directory).filter((entry) => entry.isDirectory());
}

function existingPath(value: string): string | undefined {
  return fs.existsSync(value) ? value : undefined;
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function findExactWorkspaceFolder(directory: string): vscode.WorkspaceFolder | undefined {
  return (vscode.workspace.workspaceFolders ?? []).find((folder) => samePath(folder.uri.fsPath, directory));
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}


function isSourceOrHeaderPath(filePath: string): boolean {
  return ['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(path.extname(filePath).toLowerCase());
}

export function commonAncestorDirectory(directories: string[]): string {
  if (!directories.length) {
    return '';
  }
  const flavor = directories.some(isWindowsStylePath) ? path.win32 : path.posix;
  const resolved = directories.map((directory) => flavor.resolve(directory));
  const firstRoot = flavor.parse(resolved[0]).root;
  if (resolved.some((directory) => flavor.parse(directory).root.toLowerCase() !== firstRoot.toLowerCase())) {
    return firstRoot || resolved[0];
  }
  const relativeSegments = resolved.map((directory) => directory
    .slice(firstRoot.length)
    .split(/[\\/]+/)
    .filter(Boolean));
  const first = relativeSegments[0];
  const common: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index];
    if (relativeSegments.every((candidate) => candidate[index]?.toLowerCase() === segment.toLowerCase())) {
      common.push(segment);
    } else {
      break;
    }
  }
  return flavor.normalize(flavor.join(firstRoot, ...common));
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}


function createBackendCompileDatabaseArguments(
  compiler: string,
  sourcePath: string,
  objectPath: string,
  cppStandard: string,
  includeDirectories: string[],
  defines: string[],
  compilerFlags: string[],
  msvc: boolean
): string[] {
  if (msvc) {
    const standard = cppStandard === 'c++23' ? '/std:c++latest' : `/std:${cppStandard}`;
    const translatedFlags = compilerFlags.flatMap((flag) => {
      if (flag.startsWith('/')) return [flag];
      if (flag === '-O0') return ['/Od'];
      if (flag === '-O1') return ['/O1'];
      if (flag === '-O2' || flag === '-O3') return ['/O2'];
      if (flag === '-g') return ['/Zi'];
      return [];
    });
    return [compiler, '/nologo', standard, ...translatedFlags, ...defines.map((value) => `/D${value}`), ...includeDirectories.map((value) => `/I${value}`), '/c', sourcePath, `/Fo${objectPath}`];
  }
  return [compiler, `-std=${cppStandard}`, ...compilerFlags, ...defines.map((value) => `-D${value}`), ...includeDirectories.map((value) => `-I${value}`), '-c', sourcePath, '-o', objectPath];
}

function isReleaseBuildModeCompat(mode: QpmBuildMode): boolean {
  return mode === 'release' || mode === 'release64';
}

function parsePathRoot(value: string): string {
  const flavor = isWindowsStylePath(value) ? path.win32 : path.posix;
  return flavor.parse(value).root;
}

function joinPathPortable(root: string, ...segments: string[]): string {
  const flavor = isWindowsStylePath(root) ? path.win32 : path.posix;
  return flavor.join(root, ...segments);
}

function normalizeBuildMode(value: string | undefined): QpmBuildMode {
  switch ((value ?? '').toLowerCase()) {
    case 'debug':
    case 'release':
    case 'debug64':
    case 'release64':
      return value!.toLowerCase() as QpmBuildMode;
    default:
      return 'debug64';
  }
}

function isCppFile(filePath: string): boolean {
  return ['.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(path.extname(filePath).toLowerCase());
}

function stripTrailingCommas(value: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === ',') {
      let lookAhead = index + 1;
      while (lookAhead < value.length && /\s/.test(value[lookAhead])) {
        lookAhead += 1;
      }
      if (value[lookAhead] === '}' || value[lookAhead] === ']') {
        continue;
      }
    }
    result += current;
  }

  return result;
}

function stripJsonComments(value: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (lineComment) {
      if (current === '\n' || current === '\r') {
        lineComment = false;
        result += current;
      }
      continue;
    }

    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === '\\') {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}
