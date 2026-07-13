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
exports.QpmCppToolsService = void 0;
exports.commonAncestorDirectory = commonAncestorDirectory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qpmSdlService_1 = require("./qpmSdlService");
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtDirectBuildService_1 = require("./qpmQtDirectBuildService");
const qpmQtModuleInference_1 = require("./qpmQtModuleInference");
const MANAGED_CONFIGURATION_NAME = 'Qt Project Manager (managed)';
const CPPTOOLS_EXTENSION_ID = 'ms-vscode.cpptools';
const QPM_CONFIGURATION_PROVIDER_ID = 'JerryCrozet-ElectronicEngineer.cpp-project-manager';
const LEGACY_QPM_CONFIGURATION_PROVIDER_IDS = ['jc-tools.labwindows-qpm-project-manager', 'JerryCrozet-ElectronicEngineer.labwindows-qpm-project-manager', QPM_CONFIGURATION_PROVIDER_ID];
class QpmCppToolsService {
    installations;
    qtInstallations;
    parser;
    output;
    syncTimer;
    currentWorkspace;
    cppToolsApi;
    providerRegistered = false;
    cachedProviderPaths;
    provider = {
        name: 'Qt Project Manager',
        extensionId: QPM_CONFIGURATION_PROVIDER_ID,
        canProvideConfiguration: async (uri) => this.canProvideConfiguration(uri),
        provideConfigurations: async (uris) => this.provideConfigurations(uris),
        canProvideBrowseConfiguration: async () => !!this.currentWorkspace,
        provideBrowseConfiguration: async () => this.provideBrowseConfiguration(),
        dispose: () => undefined
    };
    constructor(installations, qtInstallations, parser, output) {
        this.installations = installations;
        this.qtInstallations = qtInstallations;
        this.parser = parser;
        this.output = output;
    }
    dispose() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = undefined;
        }
        this.provider.dispose();
        this.cppToolsApi?.dispose();
        this.cppToolsApi = undefined;
    }
    async initializeProvider() {
        // Disabled permanently since 0.6.0. Registering a custom Qt/C++ provider can
        // remain selected globally by cpptools and affect unrelated Qt/C++ folders.
        // The extension now relies on the managed c_cpp_properties.json entry only.
        if (!this.providerRegistered) {
            this.output.appendLine('[Qt/C++] Dynamic Qt/C++ IntelliSense provider registration is disabled. Using managed c_cpp_properties.json.');
        }
    }
    cleanupOrphanedWorkspaceArtifacts(workspace = this.currentWorkspace) {
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
    requestSync(workspace) {
        this.setCurrentWorkspace(workspace);
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }
        this.syncTimer = setTimeout(() => {
            this.syncTimer = undefined;
            void this.sync(workspace);
        }, 1200);
    }
    async sync(workspace, notify = false, force = false) {
        this.setCurrentWorkspace(workspace);
        if (!workspace) {
            if (notify) {
                vscode.window.showErrorMessage('Open a Qt workspace or project before synchronizing IntelliSense.');
            }
            return undefined;
        }
        const enabled = vscode.workspace.getConfiguration('qpm').get('autoConfigureCppTools', true);
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
        }
        else {
            configurations.unshift(configuration);
        }
        const updated = {
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
        }
        catch (error) {
            this.output.appendLine(`[Qt/C++] Microsoft C/C++ rescan was deferred: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (notify) {
            vscode.window.showInformationMessage(`Qt/C++ IntelliSense configuration synchronized in ${configPath}.`);
        }
        return configPath;
    }
    async synchronizeNativeProject(workspace = this.currentWorkspace, options = {}) {
        this.setCurrentWorkspace(workspace);
        if (!workspace || !this.hasNativeQtProject(workspace)) {
            return undefined;
        }
        const force = options.force === true;
        const notify = options.notify === true;
        const shouldEnsureWorkspaceFolder = options.ensureWorkspaceFolder !== false
            && (force || vscode.workspace.getConfiguration('qpm').get('autoAddQpmFolderToWorkspace', true));
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
    async ensureConfigurationRootInWorkspace(workspace = this.currentWorkspace, notify = false, force = false) {
        if (!workspace) {
            return false;
        }
        const enabled = vscode.workspace.getConfiguration('qpm').get('autoAddQpmFolderToWorkspace', true);
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
    async addConfigurationRootToWorkspace(workspace = this.currentWorkspace) {
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
    async offerProviderRepairIfNeeded(workspace = this.currentWorkspace) {
        if (!this.hasConfiguredQpmProviderReference()) {
            return;
        }
        const action = await vscode.window.showWarningMessage('A legacy dynamic Qt/C++ configuration provider is still selected in VS Code. It can override normal IntelliSense settings outside managed projects. Use the managed c_cpp_properties.json configuration instead?', 'Repair IntelliSense', 'Keep provider');
        if (action === 'Repair IntelliSense') {
            await this.repairCppToolsProviderSelection(workspace);
        }
    }
    async autoRepairStaleProviderSelection(workspace = this.currentWorkspace) {
        const clearedScopes = [];
        const settingName = 'default.configurationProvider';
        const clearIfManaged = async (resource, target, value, scopeLabel) => {
            if (!isQpmProviderId(value)) {
                return;
            }
            await vscode.workspace.getConfiguration('C_Cpp', resource).update(settingName, undefined, target);
            clearedScopes.push(scopeLabel);
        };
        const globalConfig = vscode.workspace.getConfiguration('C_Cpp');
        const globalInspect = globalConfig.inspect(settingName);
        await clearIfManaged(undefined, vscode.ConfigurationTarget.Global, globalInspect?.globalValue, 'user settings');
        await clearIfManaged(undefined, vscode.ConfigurationTarget.Workspace, globalInspect?.workspaceValue, 'workspace settings');
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const scoped = vscode.workspace.getConfiguration('C_Cpp', folder.uri);
            const inspected = scoped.inspect(settingName);
            await clearIfManaged(folder.uri, vscode.ConfigurationTarget.WorkspaceFolder, inspected?.workspaceFolderValue, `folder settings: ${folder.name}`);
        }
        const oldSetting = vscode.workspace.getConfiguration('qpm').get('useCppToolsConfigurationProvider', false);
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
    async enableAutomaticSuggestions(workspace = this.currentWorkspace) {
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
        const action = await vscode.window.showInformationMessage('Automatic Qt/C++ suggestions have been enabled for this workspace. Project-symbol QPM supplemental completion was disabled, while lightweight standard-library completion remains enabled. Reload VS Code; if old QPM symbols are still suggested, reset the Microsoft Qt/C++ IntelliSense database.', resetCommand ? 'Reset Qt/C++ database' : 'Reload Window', 'Reload Window');
        if (action === 'Reset Qt/C++ database' && resetCommand) {
            await vscode.commands.executeCommand(resetCommand);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
        else if (action === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
    async findAvailableCommand(candidates) {
        const commands = await vscode.commands.getCommands(true);
        return candidates.find((candidate) => commands.includes(candidate));
    }
    async repairCppToolsProviderSelection(workspace = this.currentWorkspace) {
        const changed = await this.autoRepairStaleProviderSelection(workspace);
        this.output.appendLine(changed
            ? '[Qt/C++] IntelliSense repair removed stale provider references.'
            : '[Qt/C++] IntelliSense repair found no stale Qt Project Manager provider reference.');
        const action = await vscode.window.showInformationMessage('Qt/C++ provider cleanup completed. Reload VS Code, then run Qt/C++: Reset IntelliSense Database once to restore native completion such as printf.', 'Reload Window');
        if (action === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    }
    hasConfiguredQpmProviderReference() {
        const settingName = 'default.configurationProvider';
        const inspect = vscode.workspace.getConfiguration('C_Cpp').inspect(settingName);
        if (isQpmProviderId(inspect?.globalValue) || isQpmProviderId(inspect?.workspaceValue)) {
            return true;
        }
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            const scoped = vscode.workspace.getConfiguration('C_Cpp', folder.uri).inspect(settingName);
            if (isQpmProviderId(scoped?.workspaceFolderValue)) {
                return true;
            }
        }
        return false;
    }
    async removeManagedProviderReferencesFromOpenedFolders() {
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
    cleanupStaleManagedConfigurations(activeConfigPath) {
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
    async diagnose(workspace = this.currentWorkspace) {
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
        }
        else if (action === 'Select toolchain') {
            await vscode.commands.executeCommand('qpm.configureInstallation');
        }
    }
    hasNativeQtProject(workspace) {
        return workspace.projects.some((project) => project.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(project.absolutePath));
    }
    async waitForConfigurationRoot(workspace, timeoutMs = 1500) {
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
    async activateCppToolsExtension() {
        const extension = vscode.extensions.getExtension(CPPTOOLS_EXTENSION_ID);
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    }
    getActiveInstallation(workspace, notify = false) {
        const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex);
        if (activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath)) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                const qt = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
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
            }
            catch (error) {
                this.output.appendLine(`[Qt/C++] Cannot resolve native Qt toolchain: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return this.installations.getActiveInstallation(workspace.qpmDir, notify);
    }
    setCurrentWorkspace(workspace) {
        if (this.currentWorkspace?.path !== workspace?.path) {
            this.cachedProviderPaths = undefined;
        }
        this.currentWorkspace = workspace;
        this.notifyProviderChanged();
    }
    notifyProviderChanged() {
        if (!this.providerRegistered || !this.cppToolsApi) {
            return;
        }
        try {
            this.cppToolsApi.didChangeCustomConfiguration(this.provider);
            this.cppToolsApi.didChangeCustomBrowseConfiguration(this.provider);
        }
        catch (error) {
            this.output.appendLine(`[Qt/C++] Cannot notify the Qt/C++ extension about updated Qt/C++ paths: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    canProvideConfiguration(uri) {
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
    provideConfigurations(uris) {
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
    provideBrowseConfiguration() {
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
    getProviderPaths(workspace, installation) {
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
        const value = {
            includePath,
            browsePath,
            compilerPath
        };
        this.cachedProviderPaths = { key, value };
        return value;
    }
    collectProjectDirectories(workspace) {
        const directories = [path.dirname(workspace.path)];
        for (const projectRef of workspace.projects) {
            if (!projectRef.exists) {
                continue;
            }
            directories.push(path.dirname(projectRef.absolutePath));
            try {
                const project = (0, qtProjectManifest_1.isQtProjectManifestPath)(projectRef.absolutePath) ? (0, qtProjectManifest_1.qtManifestToQpmProject)(projectRef.absolutePath) : this.parser.parseProject(projectRef.absolutePath);
                for (const file of project.files) {
                    directories.push(path.dirname(file.absolutePath));
                }
            }
            catch (error) {
                this.output.appendLine(`[Qt/C++] Cannot collect IntelliSense paths from ${projectRef.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return unique(directories.filter((entry) => fs.existsSync(entry)).map(toForwardSlashes));
    }
    workspaceContainsCppSources(workspace) {
        for (const projectRef of workspace.projects) {
            if (!projectRef.exists) {
                continue;
            }
            try {
                const project = (0, qtProjectManifest_1.isQtProjectManifestPath)(projectRef.absolutePath) ? (0, qtProjectManifest_1.qtManifestToQpmProject)(projectRef.absolutePath) : this.parser.parseProject(projectRef.absolutePath);
                if (project.files.some((file) => isCppFile(file.absolutePath))) {
                    return true;
                }
            }
            catch {
                if (isCppFile(projectRef.absolutePath)) {
                    return true;
                }
            }
        }
        const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        return !!activeFile && isPathInside(activeFile, path.dirname(workspace.path)) && isCppFile(activeFile);
    }
    resolveCompilerPath(installation, workspace) {
        const override = vscode.workspace.getConfiguration('qpm').get('intelliSenseCompilerPath', '').trim();
        const workspaceUsesCpp = workspace ? this.workspaceContainsCppSources(workspace) : true;
        const preferredCompilers = workspaceUsesCpp
            ? [installation.cppCompilerExe, installation.cCompilerExe]
            : [installation.cCompilerExe, installation.cppCompilerExe];
        const activeRef = workspace?.projects.find((project) => project.index === workspace.activeProjectIndex);
        const nativeQtProject = !!activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath);
        let nativeKitCompilers = [];
        if (nativeQtProject && activeRef?.exists) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                const mode = normalizeBuildMode(vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug64'));
                const kit = (0, qtProjectManifest_1.getQtKitProfileForBuild)(manifest, mode);
                nativeKitCompilers = workspaceUsesCpp
                    ? [kit.compilerPath, kit.cCompilerPath].filter((entry) => !!entry)
                    : [kit.cCompilerPath, kit.compilerPath].filter((entry) => !!entry);
            }
            catch {
                nativeKitCompilers = [];
            }
        }
        const resolvedOverride = resolveExecutablePath(override);
        const resolvedToolchainCompilers = [installation.cCompilerExe, installation.cppCompilerExe, installation.clangCcExe, installation.compileExe]
            .map(resolveExecutablePath)
            .filter((value) => !!value);
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
        ].filter((value) => !!value?.trim());
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
    getAdditionalIncludePaths() {
        const base = vscode.workspace.getConfiguration('qpm').get('additionalIncludePaths', [])
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => path.normalize(entry));
        const sdl = (0, qpmSdlService_1.getSdlConfigurationFromWorkspace)();
        if (sdl.enabled !== 'off' && sdl.rootPath) {
            const installation = (0, qpmSdlService_1.describeSdlRoot)(sdl.rootPath, 'configured');
            if (installation) {
                base.push(...installation.includeDirectories);
            }
        }
        const activeRef = this.currentWorkspace?.projects.find((project) => project.index === this.currentWorkspace?.activeProjectIndex);
        if (activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath)) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                const qt = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
                if (qt) {
                    const modules = (0, qpmQtDirectBuildService_1.resolveQtModuleOrder)((0, qpmQtModuleInference_1.effectiveQtModules)(activeRef.absolutePath, manifest).modules);
                    base.push(qt.includeDir, ...modules.map((module) => path.join(qt.includeDir, `Qt${module}`)));
                    const mkspecDirectory = (0, qpmQtDirectBuildService_1.resolveQtMkspecDirectory)(qt);
                    if (mkspecDirectory)
                        base.push(mkspecDirectory);
                    for (const includeDirectory of manifest.includeDirectories) {
                        base.push(path.resolve(path.dirname(activeRef.absolutePath), includeDirectory));
                    }
                    const generatedDirectory = (0, qtProjectManifest_1.qtGeneratedDirectory)(activeRef.absolutePath, vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug'), manifest);
                    // Include paths do not need to exist yet. The build service owns
                    // creation of generated/object directories to avoid Windows races.
                    base.push(generatedDirectory);
                }
            }
            catch (error) {
                this.output.appendLine(`[Qt/C++] Cannot collect native Qt include paths: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        else {
            const qt = this.qtInstallations.getActive();
            if (qt)
                base.push(qt.includeDir);
        }
        return unique(base);
    }
    findConfigurationRoot(workspacePath, preferOpenedFolder = true) {
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
    findProjectConfigurationRoot(workspace) {
        const directories = [];
        const activeProjectRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex && project.exists)
            ?? workspace.projects.find((project) => project.exists);
        if (activeProjectRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeProjectRef.absolutePath)) {
            // A native Qt manifest is authoritative: IntelliSense files belong beside
            // that manifest, never at the workspace root or the Windows drive root.
            return path.dirname(path.resolve(activeProjectRef.absolutePath));
        }
        const collectFromProject = (projectRef) => {
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
            }
            catch {
                // Keep the project file directory as a safe fallback.
            }
        };
        collectFromProject(activeProjectRef);
        if (!directories.length) {
            return undefined;
        }
        return commonAncestorDirectory(unique(directories.map((directory) => path.resolve(directory))));
    }
    synchronizeNativeQtCompileCommands(workspace, root) {
        const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex && project.exists)
            ?? workspace.projects.find((project) => project.exists);
        if (!activeRef?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath)) {
            return undefined;
        }
        try {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
            const installation = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
            if (!installation) {
                return undefined;
            }
            const mode = normalizeBuildMode(vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug64'));
            const profile = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, mode);
            const kit = (0, qtProjectManifest_1.getQtKitProfileForBuild)(manifest, mode);
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
                    if (Array.isArray(parsed) && parsed.length > 0)
                        return compileCommandsPath;
                }
                catch {
                    // Recreate a valid fallback below.
                }
            }
            let entries;
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
                const plan = (0, qpmQtDirectBuildService_1.createQtDirectBuildPlan)(activeRef.absolutePath, mode, effectiveInstallation);
                const sources = unique([...plan.sourceFiles, ...plan.generatedSourceFiles]);
                entries = sources.map((sourcePath) => {
                    const objectPath = (0, qpmQtDirectBuildService_1.qtObjectPathForSource)(plan, sourcePath);
                    return {
                        directory: plan.projectDirectory,
                        file: sourcePath,
                        arguments: [compiler, ...(0, qpmQtDirectBuildService_1.qtCompileArguments)(plan, sourcePath, objectPath)],
                        output: objectPath
                    };
                });
            }
            else {
                const projectRoot = path.dirname(activeRef.absolutePath);
                const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(activeRef.absolutePath, manifest);
                const generatedDirectory = (0, qtProjectManifest_1.qtGeneratedDirectory)(activeRef.absolutePath, mode, manifest);
                const includeDirectories = unique([
                    projectRoot,
                    ...manifest.includeDirectories.map((entry) => path.resolve(projectRoot, entry)),
                    generatedDirectory,
                    installation.includeDir,
                    ...(0, qpmQtDirectBuildService_1.resolveQtModuleOrder)((0, qpmQtModuleInference_1.effectiveQtModules)(activeRef.absolutePath, manifest).modules).map((module) => path.join(installation.includeDir, `Qt${module}`)),
                    (0, qpmQtDirectBuildService_1.resolveQtMkspecDirectory)(installation) || ''
                ].filter(Boolean));
                const defines = unique([
                    ...manifest.defines,
                    ...profile.defines,
                    ...(0, qpmQtModuleInference_1.effectiveQtModules)(activeRef.absolutePath, manifest).modules.map((module) => `QT_${module.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}_LIB`)
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
        }
        catch (error) {
            this.output.appendLine(`[Qt/C++] Compile database generation skipped: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    cleanupLegacyDriveRootManagedConfiguration(projectRoot) {
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
        }
        catch (error) {
            this.output.appendLine(`[Qt/C++] Could not clean obsolete drive-root IntelliSense configuration ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    removeManagedConfigurationFromDocument(configPath, document, reason) {
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
    deleteInvalidOrManagedCppProperties(configPath, reason) {
        try {
            fs.unlinkSync(configPath);
            removeDirectoryIfEmpty(path.dirname(configPath));
            this.output.appendLine(`[Qt/C++] Deleted ${configPath} (${reason}); cpptools rejects configuration files with an empty configurations array.`);
            return true;
        }
        catch (error) {
            this.output.appendLine(`[Qt/C++] Could not delete ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    readExistingDocument(configPath) {
        if (!fs.existsSync(configPath)) {
            return {};
        }
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(raw)));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('the root value is not a JSON object');
            }
            return parsed;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.output.appendLine(`[Qt/C++] Cannot update ${configPath}: ${message}`);
            vscode.window.showWarningMessage(`The existing .vscode/c_cpp_properties.json file is invalid and was not modified: ${message}`);
            return undefined;
        }
    }
    getActiveNativeQtManifest(workspace) {
        const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex);
        if (!activeRef?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath))
            return undefined;
        try {
            return (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
        }
        catch {
            return undefined;
        }
    }
    createManagedConfiguration(installation, workspace, compileCommandsPath) {
        const compilerIncludeDirectories = findCompilerIncludeDirectories(installation);
        const windowsKitIncludeDirectories = findWindowsKitIncludeDirectories();
        const msvcCompatibilityIncludeDirectories = findMsvcCompatibilityIncludeDirectories();
        const projectDirectories = this.collectProjectDirectories(workspace);
        const additional = this.getAdditionalIncludePaths();
        const nativeManifest = this.getActiveNativeQtManifest(workspace);
        const activeRef = workspace.projects.find((project) => project.index === workspace.activeProjectIndex && project.exists);
        const managedGeneratedDirectory = nativeManifest && activeRef?.exists
            ? (0, qtProjectManifest_1.qtGeneratedDirectory)(activeRef.absolutePath, vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug'), nativeManifest)
            : undefined;
        const usableAdditionalPath = (value) => managedGeneratedDirectory && samePath(value, managedGeneratedDirectory) ? value : existingPath(value);
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
            ...additional.map(usableAdditionalPath)
        ].filter((value) => !!value).map(toForwardSlashes));
        const browsePath = unique([
            '${workspaceFolder}',
            ...projectDirectories,
            ...(compilerPath ? [] : compilerIncludeDirectories),
            ...(compilerPath ? [] : windowsKitIncludeDirectories),
            ...(compilerPath ? [] : msvcCompatibilityIncludeDirectories),
            ...additional.map(usableAdditionalPath)
        ].filter((value) => !!value).map(toForwardSlashes));
        const configuration = {
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
exports.QpmCppToolsService = QpmCppToolsService;
function removeDirectoryIfEmpty(directory) {
    try {
        if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
            fs.rmdirSync(directory);
        }
    }
    catch {
        // Best-effort cleanup only.
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function isQpmProviderId(value) {
    return typeof value === 'string' && LEGACY_QPM_CONFIGURATION_PROVIDER_IDS.includes(value);
}
function resolveExecutablePath(value) {
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
function executableNamesForCompilerPath(name) {
    if (path.extname(name)) {
        return [name];
    }
    return process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name] : [name, `${name}.exe`];
}
function splitPathLikeEnvironment() {
    return (process.env.Path || process.env.PATH || '')
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function detectIntelliSenseMode(compilerOrRoot) {
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
function findCompilerIncludeDirectories(installation) {
    const bases = getToolchainBaseDirectories(installation);
    const result = [];
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
        .filter((value) => !!value)
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
function findLibStdCppIncludeDirectories(base) {
    const root = path.join(base, 'include', 'c++');
    if (!fs.existsSync(root)) {
        return [];
    }
    const result = [];
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
function getToolchainBaseDirectories(installation) {
    const candidates = [];
    const addRoot = (root) => {
        if (!root)
            return;
        const normalized = path.normalize(root);
        candidates.push(normalized);
        if (path.basename(normalized).toLowerCase() === 'bin') {
            candidates.push(path.dirname(normalized));
        }
    };
    addRoot(installation.root);
    for (const compiler of [installation.cppCompilerExe, installation.cCompilerExe, installation.clangCcExe, installation.compileExe]) {
        const resolved = resolveExecutablePath(compiler);
        if (!resolved)
            continue;
        const directory = path.dirname(resolved);
        candidates.push(directory);
        if (path.basename(directory).toLowerCase() === 'bin') {
            candidates.push(path.dirname(directory));
        }
    }
    return unique(candidates.filter((entry) => fs.existsSync(entry)).map(path.normalize));
}
function findVersionedSubdirectories(root, maxDepth) {
    if (!fs.existsSync(root)) {
        return [];
    }
    const result = [];
    const queue = [{ directory: root, depth: 0 }];
    while (queue.length && result.length < 600) {
        const current = queue.shift();
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
function hasAnyHeader(directory, names) {
    return names.some((name) => fs.existsSync(path.join(directory, name)));
}
function findMsvcCompatibilityIncludeDirectories() {
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const roots = unique([
        path.join(programFiles, 'Microsoft Visual Studio'),
        path.join(programFilesX86, 'Microsoft Visual Studio'),
        path.join(programFilesX86, 'Microsoft Visual Studio 14.0', 'VC', 'include'),
        path.join(programFiles, 'Microsoft Visual Studio 14.0', 'VC', 'include')
    ]);
    const directories = [];
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
function defaultDefines() {
    return [
        '_WINDOWS',
        '_WIN32',
        'WIN32',
        '_CRT_SECURE_NO_WARNINGS'
    ];
}
function findWindowsKitIncludeDirectories() {
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
    const result = [];
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
function findWindowsHeaderCandidates() {
    const result = [];
    for (const directory of findWindowsKitIncludeDirectories()) {
        const candidate = path.join(directory, 'windows.h');
        if (fs.existsSync(candidate)) {
            result.push(toForwardSlashes(candidate));
        }
    }
    return unique(result);
}
function findHeaderCandidates(root, names, maxDepth, maxDirectories) {
    if (!fs.existsSync(root)) {
        return [];
    }
    const expected = new Set(names.map((name) => name.toLowerCase()));
    const result = [];
    const queue = [{ directory: root, depth: 0 }];
    let visited = 0;
    while (queue.length && visited < maxDirectories) {
        const current = queue.shift();
        visited += 1;
        for (const entry of safeReadEntries(current.directory)) {
            if (entry.isFile() && expected.has(entry.name.toLowerCase())) {
                result.push(toForwardSlashes(path.join(current.directory, entry.name)));
            }
            else if (entry.isDirectory() && current.depth < maxDepth) {
                queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
            }
        }
    }
    return unique(result);
}
function collectHeaderDirectories(root, maxDepth, maxDirectories) {
    if (!fs.existsSync(root)) {
        return [];
    }
    const result = [];
    const queue = [{ directory: root, depth: 0 }];
    while (queue.length && result.length < maxDirectories) {
        const current = queue.shift();
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
function safeReadEntries(directory) {
    try {
        return fs.readdirSync(directory, { withFileTypes: true });
    }
    catch {
        return [];
    }
}
function safeReadDirectories(directory) {
    return safeReadEntries(directory).filter((entry) => entry.isDirectory());
}
function existingPath(value) {
    return fs.existsSync(value) ? value : undefined;
}
function toForwardSlashes(value) {
    return value.replace(/\\/g, '/');
}
function unique(values) {
    const seen = new Set();
    return values.filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function findExactWorkspaceFolder(directory) {
    return (vscode.workspace.workspaceFolders ?? []).find((folder) => samePath(folder.uri.fsPath, directory));
}
function samePath(left, right) {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
function isPathInside(candidate, parent) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function isSourceOrHeaderPath(filePath) {
    return ['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(path.extname(filePath).toLowerCase());
}
function commonAncestorDirectory(directories) {
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
    const common = [];
    for (let index = 0; index < first.length; index += 1) {
        const segment = first[index];
        if (relativeSegments.every((candidate) => candidate[index]?.toLowerCase() === segment.toLowerCase())) {
            common.push(segment);
        }
        else {
            break;
        }
    }
    return flavor.normalize(flavor.join(firstRoot, ...common));
}
function isWindowsStylePath(value) {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}
function createBackendCompileDatabaseArguments(compiler, sourcePath, objectPath, cppStandard, includeDirectories, defines, compilerFlags, msvc) {
    if (msvc) {
        const standard = cppStandard === 'c++23' ? '/std:c++latest' : `/std:${cppStandard}`;
        const translatedFlags = compilerFlags.flatMap((flag) => {
            if (flag.startsWith('/'))
                return [flag];
            if (flag === '-O0')
                return ['/Od'];
            if (flag === '-O1')
                return ['/O1'];
            if (flag === '-O2' || flag === '-O3')
                return ['/O2'];
            if (flag === '-g')
                return ['/Zi'];
            return [];
        });
        return [compiler, '/nologo', standard, ...translatedFlags, ...defines.map((value) => `/D${value}`), ...includeDirectories.map((value) => `/I${value}`), '/c', sourcePath, `/Fo${objectPath}`];
    }
    return [compiler, `-std=${cppStandard}`, ...compilerFlags, ...defines.map((value) => `-D${value}`), ...includeDirectories.map((value) => `-I${value}`), '-c', sourcePath, '-o', objectPath];
}
function isReleaseBuildModeCompat(mode) {
    return mode === 'release' || mode === 'release64';
}
function parsePathRoot(value) {
    const flavor = isWindowsStylePath(value) ? path.win32 : path.posix;
    return flavor.parse(value).root;
}
function joinPathPortable(root, ...segments) {
    const flavor = isWindowsStylePath(root) ? path.win32 : path.posix;
    return flavor.join(root, ...segments);
}
function normalizeBuildMode(value) {
    switch ((value ?? '').toLowerCase()) {
        case 'debug':
        case 'release':
        case 'debug64':
        case 'release64':
            return value.toLowerCase();
        default:
            return 'debug64';
    }
}
function isCppFile(filePath) {
    return ['.cpp', '.hpp', '.cc', '.cxx', '.hh', '.hxx'].includes(path.extname(filePath).toLowerCase());
}
function stripTrailingCommas(value) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const current = value[index];
        if (inString) {
            result += current;
            if (escaped) {
                escaped = false;
            }
            else if (current === '\\') {
                escaped = true;
            }
            else if (current === '"') {
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
function stripJsonComments(value) {
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
            }
            else if (current === '\\') {
                escaped = true;
            }
            else if (current === '"') {
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
