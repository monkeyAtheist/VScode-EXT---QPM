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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qpmParser_1 = require("./model/qpmParser");
const qpmTreeProvider_1 = require("./providers/qpmTreeProvider");
const qpmFileSymbolsProvider_1 = require("./providers/qpmFileSymbolsProvider");
const qpmQtProjectHealthProvider_1 = require("./providers/qpmQtProjectHealthProvider");
const qpmQtToolsProvider_1 = require("./providers/qpmQtToolsProvider");
const qpmQtQualityProvider_1 = require("./providers/qpmQtQualityProvider");
const qpmBuildService_1 = require("./services/qpmBuildService");
const qpmCppToolsService_1 = require("./services/qpmCppToolsService");
const qpmInstallationService_1 = require("./services/qpmInstallationService");
const qpmWorkspaceService_1 = require("./services/qpmWorkspaceService");
const homePanel_1 = require("./views/homePanel");
const jcLibEmbedded_1 = require("./jcLibEmbedded");
const qpmLibraryPackService_1 = require("./services/qpmLibraryPackService");
const qpmTemplateService_1 = require("./services/qpmTemplateService");
const qpmProjectSettingsService_1 = require("./services/qpmProjectSettingsService");
const qpmSdlService_1 = require("./services/qpmSdlService");
const buildSettingsPanel_1 = require("./views/buildSettingsPanel");
const qtProjectSettingsPanel_1 = require("./views/qtProjectSettingsPanel");
const quickActionsView_1 = require("./views/quickActionsView");
const qpmSymbolService_1 = require("./services/qpmSymbolService");
const qpmFunctionPanelService_1 = require("./services/qpmFunctionPanelService");
const qpmColorValueService_1 = require("./services/qpmColorValueService");
const qpmEditorUtilitiesService_1 = require("./services/qpmEditorUtilitiesService");
const qpmQtInstallationService_1 = require("./services/qpmQtInstallationService");
const qpmQtProjectService_1 = require("./services/qpmQtProjectService");
const qpmQtDesignerWidgetService_1 = require("./services/qpmQtDesignerWidgetService");
const qpmQtToolsService_1 = require("./services/qpmQtToolsService");
const qpmQtQualityService_1 = require("./services/qpmQtQualityService");
const qpmQtTestingService_1 = require("./services/qpmQtTestingService");
const qpmQtKitRegistryService_1 = require("./services/qpmQtKitRegistryService");
const qpmQtKitsProvider_1 = require("./providers/qpmQtKitsProvider");
const qpmQtDebugService_1 = require("./services/qpmQtDebugService");
const qpmQtDebugProvider_1 = require("./providers/qpmQtDebugProvider");
const qpmQtPlatformService_1 = require("./services/qpmQtPlatformService");
const qpmSshDeviceManager_1 = require("./services/qpmSshDeviceManager");
const qpmQtPlatformProvider_1 = require("./providers/qpmQtPlatformProvider");
const qpmQtPackagingService_1 = require("./services/qpmQtPackagingService");
const qpmQtPackagingProvider_1 = require("./providers/qpmQtPackagingProvider");
const qpmQtInstallerService_1 = require("./services/qpmQtInstallerService");
const qpmQtInstallerProvider_1 = require("./providers/qpmQtInstallerProvider");
const qpmQtProfilingService_1 = require("./services/qpmQtProfilingService");
const qpmQtProfilingProvider_1 = require("./providers/qpmQtProfilingProvider");
const qpmQtAndroidService_1 = require("./services/qpmQtAndroidService");
const qpmQtAndroidProvider_1 = require("./providers/qpmQtAndroidProvider");
const qpmQtAppleService_1 = require("./services/qpmQtAppleService");
const qpmQtAppleProvider_1 = require("./providers/qpmQtAppleProvider");
const qpmQtPublicationService_1 = require("./services/qpmQtPublicationService");
const qpmQtPublicationProvider_1 = require("./providers/qpmQtPublicationProvider");
const qpmQmlLanguageService_1 = require("./services/qpmQmlLanguageService");
const qpmQmlLanguageProvider_1 = require("./providers/qpmQmlLanguageProvider");
const qpmQtPythonService_1 = require("./services/qpmQtPythonService");
const qpmQtPythonProvider_1 = require("./providers/qpmQtPythonProvider");
const qpmQtDependencyService_1 = require("./services/qpmQtDependencyService");
const qpmInstrumentProfileService_1 = require("./services/qpmInstrumentProfileService");
const qpmQtDependencyProvider_1 = require("./providers/qpmQtDependencyProvider");
const qtProjectManifest_1 = require("./model/qtProjectManifest");
async function activate(context) {
    const output = vscode.window.createOutputChannel('Qt Project Manager');
    const buildTrace = vscode.window.createOutputChannel('Qt Project Manager - Build Trace');
    await migrateLegacyConfiguration(output);
    const parser = new qpmParser_1.QpmParser();
    const installations = new qpmInstallationService_1.QpmInstallationService(output);
    const qtInstallations = new qpmQtInstallationService_1.QpmQtInstallationService(output);
    const qtProjects = new qpmQtProjectService_1.QpmQtProjectService(qtInstallations, output);
    const qtKits = new qpmQtKitRegistryService_1.QpmQtKitRegistryService(context, qtInstallations, output);
    const cppTools = new qpmCppToolsService_1.QpmCppToolsService(installations, qtInstallations, parser, output);
    const templates = new qpmTemplateService_1.QpmTemplateService(context, installations, output);
    const sdl = new qpmSdlService_1.QpmSdlService(output);
    const workspaces = new qpmWorkspaceService_1.QpmWorkspaceService(context, parser, installations, templates, sdl, qtProjects, output);
    const qtDesignerWidgets = new qpmQtDesignerWidgetService_1.QpmQtDesignerWidgetService(workspaces, qtInstallations, qtProjects, output);
    const projectSettings = new qpmProjectSettingsService_1.QpmProjectSettingsService(workspaces, parser, output);
    const qtTools = new qpmQtToolsService_1.QpmQtToolsService(workspaces, qtInstallations, output);
    const qmlLanguage = new qpmQmlLanguageService_1.QpmQmlLanguageService(workspaces, qtInstallations, output);
    const qtPython = new qpmQtPythonService_1.QpmQtPythonService(workspaces, output);
    const qtDependencies = new qpmQtDependencyService_1.QpmQtDependencyService(workspaces, output);
    const instrumentProfiles = new qpmInstrumentProfileService_1.QpmInstrumentProfileService(context.extensionPath, workspaces, output);
    const builds = new qpmBuildService_1.QpmBuildService(parser, workspaces, qtInstallations, projectSettings, undefined, output, qtPython, qtDependencies, buildTrace);
    const debugging = new qpmQtDebugService_1.QpmQtDebugService(workspaces, builds, qtInstallations, output);
    const android = new qpmQtAndroidService_1.QpmQtAndroidService(workspaces, qtInstallations, output);
    const apple = new qpmQtAppleService_1.QpmQtAppleService(workspaces, builds, qtInstallations, output);
    const platforms = new qpmQtPlatformService_1.QpmQtPlatformService(workspaces, builds, output, android, apple);
    const packaging = new qpmQtPackagingService_1.QpmQtPackagingService(workspaces, builds, qtInstallations);
    const installers = new qpmQtInstallerService_1.QpmQtInstallerService(workspaces, packaging, builds, qtInstallations);
    const publication = new qpmQtPublicationService_1.QpmQtPublicationService(workspaces, packaging, installers, builds, output);
    const profiling = new qpmQtProfilingService_1.QpmQtProfilingService(workspaces, builds, qtInstallations, output);
    const quality = new qpmQtQualityService_1.QpmQtQualityService(workspaces, qtInstallations, output);
    const testing = new qpmQtTestingService_1.QpmQtTestingService(workspaces, builds, qtInstallations, quality, output);
    const treeProvider = new qpmTreeProvider_1.QpmTreeProvider(workspaces);
    const treeView = vscode.window.createTreeView('qpm.workspaceExplorer', { treeDataProvider: treeProvider, dragAndDropController: treeProvider, showCollapseAll: true, canSelectMany: true });
    const symbols = new qpmSymbolService_1.QpmSymbolService(context.extensionPath, workspaces);
    const fileSymbolsProvider = new qpmFileSymbolsProvider_1.QpmFileSymbolsProvider(symbols);
    const fileSymbolsView = vscode.window.createTreeView('qpm.fileSymbols', { treeDataProvider: fileSymbolsProvider });
    fileSymbolsProvider.attachView(fileSymbolsView);
    const projectHealthProvider = new qpmQtProjectHealthProvider_1.QpmQtProjectHealthProvider(workspaces, qtInstallations, builds, testing, quality, platforms, profiling, installers, publication);
    const projectHealthView = vscode.window.createTreeView('qpm.projectHealth', { treeDataProvider: projectHealthProvider });
    projectHealthProvider.attachView(projectHealthView);
    const qtToolsProvider = new qpmQtToolsProvider_1.QpmQtToolsProvider(workspaces, qtInstallations);
    const qtToolsView = vscode.window.createTreeView('qpm.qtTools', { treeDataProvider: qtToolsProvider, showCollapseAll: true });
    qtToolsProvider.attachView(qtToolsView);
    const qtQualityProvider = new qpmQtQualityProvider_1.QpmQtQualityProvider(workspaces, testing, quality);
    const qtQualityView = vscode.window.createTreeView('qpm.quality', { treeDataProvider: qtQualityProvider, showCollapseAll: true });
    qtQualityProvider.attachView(qtQualityView);
    const qtKitsProvider = new qpmQtKitsProvider_1.QpmQtKitsProvider(workspaces, qtKits);
    const qtKitsView = vscode.window.createTreeView('qpm.kits', { treeDataProvider: qtKitsProvider, showCollapseAll: true });
    qtKitsProvider.attachView(qtKitsView);
    const qtDebugProvider = new qpmQtDebugProvider_1.QpmQtDebugProvider(workspaces, debugging);
    const qtDebugView = vscode.window.createTreeView('qpm.debugging', { treeDataProvider: qtDebugProvider, showCollapseAll: false });
    qtDebugProvider.attachView(qtDebugView);
    const qtPlatformProvider = new qpmQtPlatformProvider_1.QpmQtPlatformProvider(workspaces, platforms);
    const qtPlatformView = vscode.window.createTreeView('qpm.platforms', { treeDataProvider: qtPlatformProvider, showCollapseAll: false });
    qtPlatformProvider.attachView(qtPlatformView);
    const qtPackagingProvider = new qpmQtPackagingProvider_1.QpmQtPackagingProvider(packaging);
    const qtPackagingView = vscode.window.createTreeView('qpm.packaging', { treeDataProvider: qtPackagingProvider, showCollapseAll: false });
    const qtInstallerProvider = new qpmQtInstallerProvider_1.QpmQtInstallerProvider(installers);
    const qtInstallerView = vscode.window.createTreeView('qpm.installers', { treeDataProvider: qtInstallerProvider, showCollapseAll: false });
    const qtProfilingProvider = new qpmQtProfilingProvider_1.QpmQtProfilingProvider(profiling);
    const qtProfilingView = vscode.window.createTreeView('qpm.profiling', { treeDataProvider: qtProfilingProvider, showCollapseAll: false });
    const qtAndroidProvider = new qpmQtAndroidProvider_1.QpmQtAndroidProvider(workspaces, android);
    const qmlLanguageProvider = new qpmQmlLanguageProvider_1.QpmQmlLanguageProvider(qmlLanguage);
    const qmlLanguageView = vscode.window.createTreeView('qpm.qmlLanguage', { treeDataProvider: qmlLanguageProvider, showCollapseAll: false });
    const qtAndroidView = vscode.window.createTreeView('qpm.android', { treeDataProvider: qtAndroidProvider, showCollapseAll: false });
    qtAndroidProvider.attachView(qtAndroidView);
    const qtAppleProvider = new qpmQtAppleProvider_1.QpmQtAppleProvider(workspaces, apple);
    const qtAppleView = vscode.window.createTreeView('qpm.apple', { treeDataProvider: qtAppleProvider, showCollapseAll: false });
    qtAppleProvider.attachView(qtAppleView);
    const qtPublicationProvider = new qpmQtPublicationProvider_1.QpmQtPublicationProvider(publication);
    const qtPublicationView = vscode.window.createTreeView('qpm.publication', { treeDataProvider: qtPublicationProvider, showCollapseAll: false });
    qtPublicationProvider.attachView(qtPublicationView);
    const qtPythonProvider = new qpmQtPythonProvider_1.QpmQtPythonProvider(qtPython);
    const qtPythonView = vscode.window.createTreeView('qpm.python', { treeDataProvider: qtPythonProvider, showCollapseAll: false });
    qtPythonProvider.attachView(qtPythonView);
    const qtDependencyProvider = new qpmQtDependencyProvider_1.QpmQtDependencyProvider(qtDependencies);
    const qtDependencyView = vscode.window.createTreeView('qpm.dependencies', { treeDataProvider: qtDependencyProvider, showCollapseAll: false });
    qtDependencyProvider.attachView(qtDependencyView);
    const completionProvider = new qpmSymbolService_1.QpmCompletionProvider(symbols);
    const functionPanels = new qpmFunctionPanelService_1.QpmFunctionPanelService();
    const colorValues = new qpmColorValueService_1.QpmColorValueService();
    const editorUtilities = new qpmEditorUtilitiesService_1.QpmEditorUtilitiesService();
    const completionRegistration = vscode.languages.registerCompletionItemProvider([{ language: 'c', scheme: 'file' }, { language: 'cpp', scheme: 'file' }], completionProvider);
    const home = new homePanel_1.HomePanel(context, workspaces, builds, installations);
    const buildSettings = new buildSettingsPanel_1.BuildSettingsPanel(workspaces, parser, projectSettings);
    const qtProjectSettings = new qtProjectSettingsPanel_1.QtProjectSettingsPanel(workspaces, qtInstallations, projectSettings, builds);
    const quickActions = new quickActionsView_1.QuickActionsView(workspaces, builds, projectSettings);
    const quickActionsRegistration = vscode.window.registerTreeDataProvider('qpm.quickActions', quickActions);
    const statusBarItems = [
        createStatusBarAction('$(versions)', 'Select the active Qt installation', 'qpm.selectQtInstallation', 100),
        createStatusBarAction('$(home)', 'Qt Project Manager home', 'qpm.openHome', 99),
        createStatusBarAction('$(folder-opened)', 'Open a Qt workspace or project', 'qpm.openWorkspace', 98),
        createStatusBarAction('$(tools)', 'Build / rebuild / clean the active Qt project', 'qpm.chooseBuildAction', 97),
        createStatusBarAction('$(play)', 'Build and run the active Qt target', 'qpm.run', 96),
        createStatusBarAction('$(list-selection)', 'Advanced Qt run options', 'qpm.chooseRunAction', 95),
        createStatusBarAction('$(debug-alt-small)', 'Build and debug with the active Qt kit debugger', 'qpm.debugWithGdb', 94.5),
        createStatusBarAction('D32', 'Select the Qt build mode', 'qpm.selectBuildMode', 94),
        createStatusBarAction('EXE', 'Select the Qt target type', 'qpm.selectTargetType', 93)
    ];
    const updateToolbarContexts = () => {
        const activeRef = workspaces.activeProjectRef;
        const targetType = activeRef?.exists ? workspaces.getProject(activeRef)?.targetType : undefined;
        const targetKey = targetType === 'Dynamic Link Library' ? 'dll' : targetType === 'Static Library' ? 'lib' : targetType === 'Executable' ? 'exe' : 'none';
        const nativeQtProjectActive = !!activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath);
        let qtPythonProjectActive = false;
        if (nativeQtProjectActive && activeRef?.exists) {
            try {
                qtPythonProjectActive = (0, qtProjectManifest_1.isQtPythonProject)((0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath));
            }
            catch {
                qtPythonProjectActive = false;
            }
        }
        void vscode.commands.executeCommand('setContext', 'qpm.buildMode', builds.buildMode);
        void vscode.commands.executeCommand('setContext', 'qpm.targetType', targetKey);
        void vscode.commands.executeCommand('setContext', 'qpm.nativeQtProjectActive', nativeQtProjectActive);
        void vscode.commands.executeCommand('setContext', 'qpm.qtPythonProjectActive', qtPythonProjectActive);
        void vscode.commands.executeCommand('setContext', 'qpm.qtCppProjectActive', nativeQtProjectActive && !qtPythonProjectActive);
    };
    const updateStatusBar = () => {
        const targetType = workspaces.activeProject?.targetType;
        const modeText = builds.buildMode === 'debug64' ? 'D64' : builds.buildMode === 'release64' ? 'R64' : builds.buildMode === 'release' ? 'REL' : 'DBG';
        const targetText = targetType === 'Dynamic Link Library' ? 'DLL' : targetType === 'Static Library' ? 'LIB' : targetType === 'Executable' ? 'EXE' : '---';
        const activeRef = workspaces.activeProjectRef;
        let qtInstallation = qtInstallations.getActive();
        if (activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath)) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                qtInstallation = qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, builds.buildMode)) ?? qtInstallation;
            }
            catch {
                // Keep the global installation as a fallback.
            }
        }
        const pythonProject = isQtPythonActive();
        if (pythonProject) {
            const pythonStatus = qtPython.status;
            statusBarItems[0].text = pythonStatus?.pySideVersion ? `$(symbol-class) PySide6 ${pythonStatus.pySideVersion}` : '$(symbol-class) PySide6';
            statusBarItems[0].tooltip = pythonStatus?.message ?? 'Qt for Python / PySide6 project. Open the Qt for Python view to configure the interpreter.';
            statusBarItems[6].text = '$(debug-alt-small) Python Debug';
            statusBarItems[6].tooltip = 'Build and debug the active PySide6 application with the VS Code Python debugger.';
            statusBarItems[7].text = 'PY';
            statusBarItems[7].tooltip = 'Qt for Python project. Build variants are managed by Python deployment tooling.';
            statusBarItems[8].text = 'APP';
            statusBarItems[8].tooltip = 'Qt for Python application target.';
        }
        else {
            statusBarItems[0].text = qtInstallation ? `$(versions) Qt ${qtInstallation.version}` : '$(versions) Select Qt';
            statusBarItems[0].tooltip = qtInstallation ? qtInstallation.label : 'Select the Qt installation used by Qt Project Manager.';
            statusBarItems[6].text = '$(debug-alt-small) Debug';
            statusBarItems[6].tooltip = 'Build and debug the active executable with the debugger selected by the Qt kit (GDB, LLDB or Visual Studio).';
            statusBarItems[7].text = modeText;
            statusBarItems[7].tooltip = `Qt build mode: ${modeText}. Click to change.`;
            statusBarItems[8].text = targetText;
            statusBarItems[8].tooltip = `Qt target type: ${targetText}. Click to change.`;
        }
        const show = vscode.workspace.getConfiguration('qpm').get('showPersistentStatusBarActions', true);
        for (const item of statusBarItems) {
            if (show)
                item.show();
            else
                item.hide();
        }
        updateToolbarContexts();
    };
    const register = (command, handler) => vscode.commands.registerCommand(command, async (...args) => {
        try {
            return await handler(...args);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            output.appendLine(`[Qt/C++] ${command} failed: ${message}`);
            vscode.window.showErrorMessage(`Qt Project Manager: ${message}`);
            return undefined;
        }
    });
    const focusTreeThen = async (command) => {
        await vscode.commands.executeCommand('qpm.workspaceExplorer.focus');
        await vscode.commands.executeCommand(command);
    };
    const isAndroidPlatformActive = () => android.activeProfile?.type === 'android';
    const isApplePlatformActive = () => !!apple.activeProfile && (0, qpmQtAppleService_1.isApplePlatform)(apple.activeProfile.type);
    const isQtPythonActive = () => {
        const ref = workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return false;
        try {
            return (0, qtProjectManifest_1.isQtPythonProject)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath));
        }
        catch {
            return false;
        }
    };
    const runGdbDebug = async () => isQtPythonActive() ? qtPython.debug() : isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile();
    context.subscriptions.push(output, buildTrace, builds, workspaces, home, buildSettings, qtProjectSettings, sdl, quickActions, quickActionsRegistration, cppTools, qtTools, qtKits, qtKitsProvider, qtKitsView, debugging, qtDebugProvider, qtDebugView, platforms, qtPlatformProvider, qtPlatformView, packaging, qtPackagingView, installers, qtInstallerProvider, qtInstallerView, publication, qtPublicationProvider, qtPublicationView, profiling, qtProfilingProvider, qtProfilingView, android, apple, qmlLanguage, qmlLanguageProvider, qmlLanguageView, qtPython, qtPythonProvider, qtPythonView, qtDependencies, instrumentProfiles, qtDependencyProvider, qtDependencyView, qtAndroidProvider, qtAndroidView, qtAppleProvider, qtAppleView, vscode.debug.registerDebugConfigurationProvider('cppdbg', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('cppdbg') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic), vscode.debug.registerDebugConfigurationProvider('cppvsdbg', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('cppvsdbg') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic), vscode.debug.registerDebugConfigurationProvider('qml', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('qml') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic), qtToolsProvider, qtToolsView, quality, testing, qtQualityProvider, qtQualityView, treeProvider, treeView, fileSymbolsView, projectHealthProvider, projectHealthView, completionRegistration, ...statusBarItems, treeView.onDidChangeSelection((event) => {
        const selected = event.selection[0];
        if (selected?.kind === 'file' && (0, qpmSymbolService_1.isSourceOrHeader)(selected.file.absolutePath)) {
            fileSymbolsProvider.setSelectedFile(selected.file.absolutePath);
        }
        else if (selected?.kind === 'generatedFile' && (0, qpmSymbolService_1.isSourceOrHeader)(selected.absolutePath)) {
            fileSymbolsProvider.setSelectedFile(selected.absolutePath);
        }
    }), vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri.scheme === 'file' && (0, qpmSymbolService_1.isSourceOrHeader)(editor.document.uri.fsPath)) {
            fileSymbolsProvider.setSelectedFile(editor.document.uri.fsPath);
            void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'Qt/C++ file opened');
        }
    }), workspaces.onDidChange(() => {
        symbols.invalidateProjectCache();
        fileSymbolsProvider.refresh();
        qtProjectSettings.update();
        projectHealthProvider.refresh();
        qtToolsProvider.refresh();
        qtQualityProvider.refresh();
        qtKitsProvider.refresh();
        qtDebugProvider.refresh();
        qtPlatformProvider.refresh();
        qtPackagingProvider.refresh();
        qtInstallerProvider.refresh();
        qtAndroidProvider.refresh();
        qtAppleProvider.refresh();
        qmlLanguageProvider.refresh();
        qtPythonProvider.refresh();
        void qtPython.refresh().then(() => updateStatusBar());
        void qmlLanguage.autoStartIfNeeded();
        void testing.refresh();
        // The native project manifest is the durable source of truth for the
        // selected architecture and variant. Restore it before regenerating
        // IntelliSense or toolbar state when a project/workspace is switched.
        void builds.restoreBuildModeFromActiveProject().then(() => {
            updateStatusBar();
            quickActions.update();
            return scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
        });
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('qpm')) {
            updateStatusBar();
            home.update();
            quickActions.update();
        }
        if (event.affectsConfiguration('qpm.activeInstallation') || event.affectsConfiguration('qpm.autoConfigureCppTools') || event.affectsConfiguration('qpm.autoAddQpmFolderToWorkspace') || event.affectsConfiguration('qpm.useCppToolsConfigurationProvider') || event.affectsConfiguration('qpm.intelliSenseCompilerPath') || event.affectsConfiguration('qpm.qtCompilerPath') || event.affectsConfiguration('qpm.qtDesignerPath') || event.affectsConfiguration('qpm.additionalIncludePaths') || event.affectsConfiguration('qpm.sdlRootPath') || event.affectsConfiguration('qpm.sdlEnabled') || event.affectsConfiguration('qpm.sdlPackages')) {
            void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
        }
    }), register('qpm.openHome', () => home.show()), register('qpm.openWorkspace', async () => {
        await workspaces.openWorkspace();
        await scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'project opened');
    }), register('qpm.createWorkspaceProject', async () => {
        await workspaces.createWorkspaceProject();
        await builds.prepareNativeQtGeneratedFiles();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt workspace created' });
    }), register('qpm.createQtProject', async () => {
        const manifestPath = await qtProjects.createProjectWizard();
        if (manifestPath) {
            await workspaces.load(manifestPath);
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
            if ((0, qtProjectManifest_1.isQtPythonProject)(manifest)) {
                await qtPython.bootstrap(manifestPath, true);
                qtPythonProvider.refresh();
            }
            else {
                await builds.prepareNativeQtGeneratedFiles();
                await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt project created' });
            }
        }
    }), register('qpm.createSdlWorkspaceProject', () => workspaces.createSdlWorkspaceProject()), register('qpm.refresh', () => workspaces.refresh()), register('qpm.selectQtInstallation', async () => {
        const installation = await qtInstallations.select();
        if (installation) {
            const release = builds.buildMode === 'release' || builds.buildMode === 'release64';
            const mode = installation.architecture === 'x86'
                ? (release ? 'release' : 'debug')
                : (release ? 'release64' : 'debug64');
            await builds.setBuildMode(mode);
            await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt kit selected' });
        }
        updateStatusBar();
        qtProjectSettings.update();
    }), register('qpm.repairQtToolchain', async () => {
        const ref = workspaces.activeProjectRef;
        const manifestRoot = ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? (0, qtProjectManifest_1.getQtInstallationPreference)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath)) : undefined;
        const installation = await qtInstallations.repairActiveToolchain(manifestRoot);
        if (installation) {
            await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, notify: true, ensureWorkspaceFolder: true, reason: 'Qt compiler repaired' });
        }
        updateStatusBar();
        qtProjectSettings.update();
    }), register('qpm.selectQtDesigner', async () => {
        const ref = workspaces.activeProjectRef;
        const manifestRoot = ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? (0, qtProjectManifest_1.getQtInstallationPreference)((0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath)) : undefined;
        await qtInstallations.selectDesignerExecutable(manifestRoot);
        qtProjectSettings.update();
    }), register('qpm.showQtInstallationInfo', () => qtInstallations.showInformation()), register('qpm.showQtProjectInfo', () => qtProjects.showProjectInformation(workspaces.activeProjectRef?.absolutePath)), register('qpm.manageQtKits', async () => { await qtKits.manage(); qtKitsProvider.refresh(); }), register('qpm.detectQtKits', async () => { await qtKits.detectAndSave(); qtKitsProvider.refresh(); }), register('qpm.assignQtKit', async () => {
        const ref = workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
        const kit = await qtKits.assignToProject(ref.absolutePath);
        if (kit) {
            workspaces.refresh();
            qtProjectSettings.update();
            qtKitsProvider.refresh();
            projectHealthProvider.refresh();
            await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'named Qt kit assigned' });
        }
    }), register('qpm.selectQtBackend', async () => {
        const ref = workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
        await qtProjects.selectBuildBackend(ref.absolutePath);
        workspaces.refresh();
        qtProjectSettings.update();
        qtKitsProvider.refresh();
        projectHealthProvider.refresh();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt build backend changed' });
    }), register('qpm.importQtBuildProject', async () => {
        const ref = workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath))
            return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
        await qtProjects.importBuildProject(ref.absolutePath);
        workspaces.refresh();
        qtProjectSettings.update();
        qtKitsProvider.refresh();
        projectHealthProvider.refresh();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt backend project imported' });
    }), register('qpm.configureQtBackend', async () => { await builds.configureQtBackend(); qtKitsProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.openQtBackendProject', () => builds.openQtBackendProject()), register('qpm.manageQtProfiles', () => { const ref = workspaces.activeProjectRef; return ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? qtProjects.manageProfiles(ref.absolutePath).then(async () => { workspaces.refresh(); qtProjectSettings.update(); projectHealthProvider.refresh(); await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt profiles updated' }); }) : vscode.window.showErrorMessage('Open a native .qtproject.json project first.'); }), register('qpm.refreshProjectHealth', () => projectHealthProvider.refresh()), register('qpm.openProjectHealthReport', () => projectHealthProvider.openReport()), register('qpm.refreshQtTools', () => qtToolsProvider.refresh()), register('qpm.refreshTests', async () => { await testing.refresh(); qtQualityProvider.refresh(); }), register('qpm.openTestExplorer', () => testing.openTestExplorer()), register('qpm.runAllTests', async () => { await testing.runAll(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.runAllTestsWithCoverage', async () => { await testing.runAllWithCoverage(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.rerunFailedTests', async () => { await testing.rerunFailed(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.openTestHistory', () => testing.openTestHistory()), register('qpm.clearTestHistory', async () => { await testing.clearTestHistory(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.runTestAtCursor', async () => { await testing.runAtCursor(false); qtQualityProvider.refresh(); }), register('qpm.debugTestAtCursor', () => testing.runAtCursor(true)), register('qpm.runClangTidyFile', async (target) => { await quality.runClangTidyFile(target, false); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.runClangTidyProject', async () => { await quality.runClangTidyProject(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.applyClangTidyFixes', async (target) => { await quality.runClangTidyFile(target, true); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.runClazyFile', async (target) => { await quality.runClazyFile(target); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.runClazyProject', async () => { await quality.runClazyProject(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.clearQualityDiagnostics', () => { quality.clearDiagnostics(); qtQualityProvider.refresh(); }), register('qpm.configureQuality', async () => { await quality.configureQuality(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.createSanitizerProfiles', async () => { await quality.createSanitizerProfiles(); qtQualityProvider.refresh(); }), register('qpm.createCoverageProfile', async () => { await quality.createCoverageProfile(); qtQualityProvider.refresh(); }), register('qpm.openQualityReport', () => quality.openQualityReport()), register('qpm.createTranslation', (target) => qtTools.createTranslation(target)), register('qpm.updateTranslations', (target) => qtTools.updateTranslations(target)), register('qpm.releaseTranslations', (target) => qtTools.releaseTranslations(target)), register('qpm.openTranslationInLinguist', (target) => qtTools.openTranslationInLinguist(target)), register('qpm.showTranslationStatus', (target) => qtTools.showTranslationStatus(target)), register('qpm.openQrcEditor', (target) => qtTools.openResourceEditor(target)), register('qpm.openInstrumentProfileEditor', (target) => instrumentProfiles.openEditor(target)), register('qpm.openInstrumentProfileFile', (target) => instrumentProfiles.openProfileFile(target)), register('qpm.newInstrumentProfileFromCatalog', () => instrumentProfiles.newFromCatalog()), register('qpm.validateQrc', (target) => qtTools.validateResourceCollection(target)), register('qpm.qmlLintFile', (target) => qtTools.lintQmlFile(target)), register('qpm.qmlLintProject', (target) => qtTools.lintQmlProject(target)), register('qpm.qmlFormatFile', (target) => qtTools.formatQmlFile(target)), register('qpm.qmlFormatProject', (target) => qtTools.formatQmlProject(target)), register('qpm.qmlPreviewFile', (target) => qtTools.previewQmlFile(target)), register('qpm.clearQmlDiagnostics', () => qtTools.clearQmlDiagnostics()), register('qpm.startQmlLanguageServer', () => qmlLanguage.start(false, true)), register('qpm.restartQmlLanguageServer', () => qmlLanguage.restart()), register('qpm.stopQmlLanguageServer', () => qmlLanguage.stop(true)), register('qpm.refreshQmlLanguageServer', () => qmlLanguage.refreshBuildDirectories()), register('qpm.generateQmllsConfiguration', () => qmlLanguage.generateConfigurationFile(true)), register('qpm.openQmllsConfiguration', () => qmlLanguage.openConfigurationFile()), register('qpm.generateQmldir', () => qmlLanguage.generateQmldir()), register('qpm.openQmlLanguageReport', () => qmlLanguage.openReport()), register('qpm.showQmlLanguageOutput', () => qmlLanguage.showOutput()), register('qpm.showQmlLanguageTrace', () => qmlLanguage.showTraceOutput()), register('qpm.openQtDocumentation', () => qtTools.openQtDocumentation()), register('qpm.openQtDocumentationHome', () => qtTools.openQtDocumentationHome()), register('qpm.editQtModules', () => { const ref = workspaces.activeProjectRef; return ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? qtProjects.editModules(ref.absolutePath).then(async () => { workspaces.refresh(); await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt modules updated' }); }) : vscode.window.showErrorMessage('Open a native .qtproject.json project first.'); }), register('qpm.showQtBuildPlan', () => builds.showQtBuildPlan()), register('qpm.deployQtRuntime', () => builds.deployQtRuntime()), register('qpm.configureInstallation', async () => {
        const installation = await installations.selectInstallation(workspaces.currentWorkspace?.qpmDir);
        if (installation) {
            await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'toolchain configured' });
            home.update();
        }
    }), register('qpm.configureSdl', async () => {
        await sdl.selectInstallation();
        await cppTools.sync(workspaces.currentWorkspace, true);
        home.update();
        quickActions.update();
    }), register('qpm.syncCppTools', () => cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, notify: true, ensureWorkspaceFolder: true, reason: 'manual synchronization' })), register('qpm.diagnoseCppTools', () => cppTools.diagnose(workspaces.currentWorkspace)), register('qpm.repairCppToolsProvider', () => cppTools.repairCppToolsProviderSelection(workspaces.currentWorkspace)), register('qpm.enableAutomaticSuggestions', () => cppTools.enableAutomaticSuggestions(workspaces.currentWorkspace)), register('qpm.addWorkspaceFolderForIntelliSense', () => cppTools.addConfigurationRootToWorkspace(workspaces.currentWorkspace)), register('qpm.selectBuildMode', () => builds.selectBuildMode()), register('qpm.selectBuildModeD32', () => builds.selectBuildMode('debug')), register('qpm.selectBuildModeR32', () => builds.selectBuildMode('release')), register('qpm.selectBuildModeD64', () => builds.selectBuildMode('debug64')), register('qpm.selectBuildModeR64', () => builds.selectBuildMode('release64')), 
    // View-title toolbar helpers keep the current D32/R32/D64/R64 label while
    // opening the same build-mode selector as the persistent status-bar item.
    register('qpm.toolbarBuildModeD32', () => builds.selectBuildMode()), register('qpm.toolbarBuildModeR32', () => builds.selectBuildMode()), register('qpm.toolbarBuildModeD64', () => builds.selectBuildMode()), register('qpm.toolbarBuildModeR64', () => builds.selectBuildMode()), register('qpm.chooseBuildAction', async () => { const result = await builds.chooseBuildAction(); treeProvider.refresh(); return result; }), register('qpm.showBuildProblems', () => vscode.commands.executeCommand('workbench.actions.view.problems')), register('qpm.showBuildTrace', () => buildTrace.show(true)), register('qpm.build', async () => { const result = isAndroidPlatformActive() ? await platforms.buildActive(false) : await builds.build(false); treeProvider.refresh(); return result; }), register('qpm.rebuild', async () => { const result = isAndroidPlatformActive() ? await platforms.buildActive(true) : await builds.build(true); treeProvider.refresh(); return result; }), register('qpm.clean', async () => { const result = await builds.clean(); treeProvider.refresh(); return result; }), register('qpm.run', () => isAndroidPlatformActive() ? android.buildInstallRun() : isApplePlatformActive() ? platforms.buildDeployRun() : builds.buildAndRun()), register('qpm.chooseRunAction', () => builds.chooseRunAction()), register('qpm.runWithoutBuild', () => isAndroidPlatformActive() ? android.runApplication() : isApplePlatformActive() ? platforms.runActive() : builds.runWithoutBuild()), register('qpm.debugWithGdb', () => runGdbDebug()), register('qpm.startQtDebugProfile', () => isQtPythonActive() ? qtPython.debug() : isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile()), register('qpm.startQtDebugProfileWithoutBuild', () => isQtPythonActive() ? qtPython.debug() : isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile({ build: false })), register('qpm.attachQtProcess', () => debugging.attachToLocalProcess()), register('qpm.debugQtCoreDump', () => debugging.debugCoreDump()), register('qpm.attachQmlDebugger', () => debugging.attachQmlDebugger()), register('qpm.manageQtDebugProfiles', async () => { await debugging.manageProfiles(); qtDebugProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.generateQtLaunchJson', () => debugging.generateLaunchJson()), register('qpm.manageQtPlatforms', async () => { await platforms.manageProfiles(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }), register('qpm.selectQtPlatform', async () => { await platforms.selectActivePlatform(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }), register('qpm.detectPlatformCapabilities', async () => { await platforms.openReport(); qtPlatformProvider.refresh(); }), register('qpm.buildForPlatform', () => platforms.buildActive(false)), register('qpm.deployToPlatform', () => platforms.deployActive()), register('qpm.runOnPlatform', () => platforms.runActive()), register('qpm.buildDeployRunPlatform', () => platforms.buildDeployRun()), register('qpm.openSshDeviceManager', () => (0, qpmSshDeviceManager_1.openSshDeviceManager)(context)), register('qpm.openRemoteTerminal', () => platforms.openRemoteTerminal()), register('qpm.openDockerShell', () => platforms.openDockerShell()), register('qpm.serveWebAssembly', () => platforms.serveWebAssembly()), register('qpm.stopWebAssemblyServer', () => platforms.stopWebAssemblyServer()), register('qpm.openPlatformReport', () => platforms.openReport()), register('qpm.configureAndroidEnvironment', async () => { await android.configureEnvironment(); qtAndroidProvider.refresh(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }), register('qpm.refreshAndroidDevices', () => { qtAndroidProvider.refresh(); return android.listDevices(); }), register('qpm.selectAndroidDevice', async () => { await android.selectDevice(); qtAndroidProvider.refresh(); qtProjectSettings.update(); }), register('qpm.selectAndroidAvd', async () => { await android.selectAvd(); qtAndroidProvider.refresh(); qtProjectSettings.update(); }), register('qpm.startAndroidAvd', async () => { await android.startAvd(); qtAndroidProvider.refresh(); }), register('qpm.installAndroidSdkPackages', async () => { await android.installRequiredSdkPackages(); qtAndroidProvider.refresh(); projectHealthProvider.refresh(); }), register('qpm.buildAndroidApk', async () => { await android.buildPackage('apk'); qtAndroidProvider.refresh(); }), register('qpm.buildAndroidAab', async () => { await android.buildPackage('aab'); qtAndroidProvider.refresh(); }), register('qpm.buildAndroidAar', async () => { await android.buildPackage('aar'); qtAndroidProvider.refresh(); }), register('qpm.installAndroidPackage', async () => { await android.installPackage(); qtAndroidProvider.refresh(); }), register('qpm.buildInstallRunAndroid', async () => { await android.buildInstallRun(); qtAndroidProvider.refresh(); }), register('qpm.runAndroidApplication', () => android.runApplication()), register('qpm.uninstallAndroidApplication', () => android.uninstallApplication()), register('qpm.prepareAndroidDebug', () => android.prepareDebugApplication()), register('qpm.startAndroidLogcat', async () => { await android.startLogcat(); qtAndroidProvider.refresh(); }), register('qpm.stopAndroidLogcat', () => { android.stopLogcat(); qtAndroidProvider.refresh(); }), register('qpm.openAndroidReport', () => android.openReport()), register('qpm.revealAndroidPackage', () => android.revealLatestPackage()), register('qpm.configureAppleEnvironment', async () => { await apple.configureEnvironment(); qtAppleProvider.refresh(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }), register('qpm.refreshAppleDevices', async () => { apple.detectEnvironment(); qtAppleProvider.refresh(); }), register('qpm.selectAppleSimulator', async () => { await apple.selectSimulator(); qtAppleProvider.refresh(); qtProjectSettings.update(); }), register('qpm.bootAppleSimulator', async () => { await apple.bootSimulator(); qtAppleProvider.refresh(); }), register('qpm.buildAppleTarget', async () => { await apple.buildActive(); qtAppleProvider.refresh(); }), register('qpm.deployMacApplication', async () => { await apple.deployMacApplication(false); qtAppleProvider.refresh(); }), register('qpm.createMacDmg', async () => { await apple.deployMacApplication(true); qtAppleProvider.refresh(); }), register('qpm.signAppleArtifacts', async () => { await apple.signArtifacts(); qtAppleProvider.refresh(); }), register('qpm.verifyAppleSignatures', async () => { await apple.verifySignatures(); qtAppleProvider.refresh(); }), register('qpm.notarizeAppleArtifact', async () => { await apple.notarizeArtifact(); qtAppleProvider.refresh(); }), register('qpm.stapleAppleArtifact', async () => { await apple.stapleArtifact(); qtAppleProvider.refresh(); }), register('qpm.installRunIosSimulator', async () => { await apple.installAndRunIosSimulator(); qtAppleProvider.refresh(); }), register('qpm.openAppleReport', () => apple.openReport()), register('qpm.revealAppleOutput', () => apple.revealOutput()), register('qpm.cleanAppleOutput', async () => { await apple.cleanOutput(); qtAppleProvider.refresh(); }), register('qpm.generateProductMetadata', async () => { await packaging.generateMetadata(); qtPackagingProvider.refresh(); }), register('qpm.createPortablePackage', async () => { const ok = await packaging.createPortablePackage(); if (ok)
        qtPackagingProvider.refresh(); }), register('qpm.openPackagingReport', () => packaging.openReport()), register('qpm.revealPackagingOutput', () => packaging.revealOutput()), register('qpm.cleanPackagingOutput', async () => { await packaging.cleanOutput(); qtPackagingProvider.refresh(); }), register('qpm.createDesktopInstaller', async () => { const ok = await installers.createInstaller(); qtInstallerProvider.refresh(); if (ok)
        qtPackagingProvider.refresh(); }), register('qpm.generateInstallerProject', async () => { await installers.generateInstallerProject(); qtInstallerProvider.refresh(); }), register('qpm.createQtIfwRepository', async () => { await installers.createUpdateRepository(); qtInstallerProvider.refresh(); }), register('qpm.signDistributionArtifacts', async () => { await installers.signDistributionArtifacts(); qtInstallerProvider.refresh(); }), register('qpm.verifyDistributionSignatures', async () => { await installers.verifyDistributionSignatures(); qtInstallerProvider.refresh(); }), register('qpm.detectInstallerTools', async () => { await installers.detectTools(); qtInstallerProvider.refresh(); }), register('qpm.openInstallerReport', () => installers.openReport()), register('qpm.revealInstallerOutput', () => installers.revealOutput()), register('qpm.cleanInstallerOutput', async () => { await installers.cleanOutput(); qtInstallerProvider.refresh(); }), register('qpm.detectPublicationTools', async () => { await publication.detectTools(); qtPublicationProvider.refresh(); }), register('qpm.generatePublicationSources', async () => { await publication.generatePublicationSources(); qtPublicationProvider.refresh(); }), register('qpm.createMsixPackage', async () => { await publication.createMsixPackage(); qtPublicationProvider.refresh(); }), register('qpm.generateAppInstaller', async () => { await publication.generateAppInstaller(); qtPublicationProvider.refresh(); }), register('qpm.generateWingetManifests', async () => { await publication.generateWingetManifests(); qtPublicationProvider.refresh(); }), register('qpm.validateWingetManifests', async () => { await publication.validateWingetManifests(); qtPublicationProvider.refresh(); }), register('qpm.createReleaseBundle', async () => { await publication.createReleaseBundle(); qtPublicationProvider.refresh(); }), register('qpm.publishRelease', async () => { await publication.publishRelease(); qtPublicationProvider.refresh(); }), register('qpm.openPublicationReport', () => publication.openReport()), register('qpm.revealPublicationOutput', () => publication.revealOutput()), register('qpm.cleanPublicationOutput', async () => { await publication.cleanOutput(); qtPublicationProvider.refresh(); }), register('qpm.profileQmlApplication', async () => { await profiling.runQmlProfiler(); qtProfilingProvider.refresh(); }), register('qpm.profileCpu', async () => { await profiling.runCpuProfiler(); qtProfilingProvider.refresh(); }), register('qpm.profileMemory', async () => { await profiling.runMemoryProfiler(); qtProfilingProvider.refresh(); }), register('qpm.runCppcheck', async () => { await profiling.runCppcheck(); qtProfilingProvider.refresh(); }), register('qpm.traceSystemCalls', async () => { await profiling.runSystemTrace(); qtProfilingProvider.refresh(); }), register('qpm.stopProfiling', () => { profiling.stopActiveProfilers(); qtProfilingProvider.refresh(); }), register('qpm.openLatestProfilingResult', () => profiling.openLatestOutput()), register('qpm.openProfilingReport', () => profiling.openReport()), register('qpm.revealProfilingOutput', () => profiling.revealOutput()), register('qpm.cleanProfilingOutput', async () => { await profiling.cleanOutput(); qtProfilingProvider.refresh(); }), register('qpm.python.bootstrap', async () => { await qtPython.bootstrapActiveProject(true); qtPythonProvider.refresh(); updateStatusBar(); }), register('qpm.python.selectInterpreter', async () => { await qtPython.selectInterpreter(); qtPythonProvider.refresh(); updateStatusBar(); }), register('qpm.python.createVirtualEnvironment', async () => { await qtPython.createVirtualEnvironment(); qtPythonProvider.refresh(); updateStatusBar(); }), register('qpm.python.installPySide6', async () => { await qtPython.installPySide6(); qtPythonProvider.refresh(); updateStatusBar(); }), register('qpm.python.build', async () => { await qtPython.build(); qtPythonProvider.refresh(); }), register('qpm.python.run', async () => { await qtPython.run(); qtPythonProvider.refresh(); }), register('qpm.python.debug', async () => { await qtPython.debug(); qtPythonProvider.refresh(); }), register('qpm.python.clean', async () => { await qtPython.clean(); qtPythonProvider.refresh(); }), register('qpm.python.compileUi', async () => { await qtPython.compileUiFiles(); qtPythonProvider.refresh(); }), register('qpm.python.compileResources', async () => { await qtPython.compileResourceFiles(); qtPythonProvider.refresh(); }), register('qpm.python.openDesigner', (target) => qtPython.openDesigner(undefined, target)), register('qpm.python.deploy', async () => { await qtPython.deploy(); qtPythonProvider.refresh(); }), register('qpm.python.deployAndroid', async () => { await qtPython.deployAndroid(); qtPythonProvider.refresh(); }), register('qpm.python.openReport', () => qtPython.openReport()), register('qpm.python.revealEnvironment', () => qtPython.revealEnvironment()), register('qpm.dependencies.configure', async () => { await qtDependencies.configure(); qtDependencyProvider.refresh?.(); }), register('qpm.dependencies.detectTools', async () => { await qtDependencies.detectTools(); }), register('qpm.dependencies.generateManifests', async () => { await qtDependencies.generateManifests(); }), register('qpm.dependencies.install', async () => { await qtDependencies.install(); }), register('qpm.dependencies.openReport', () => qtDependencies.openReport()), register('qpm.dependencies.revealOutput', () => qtDependencies.revealOutput()), register('qpm.dependencies.clean', async () => { await qtDependencies.clean(); }), register('qpm.openWorkspaceFile', () => builds.openWorkspaceFile()), register('qpm.setActiveProject', (node) => workspaces.setActiveProject(node?.ref)), register('qpm.buildProject', async (node) => { const result = node ? await builds.build(false, node.ref) : undefined; treeProvider.refresh(); return result; }), register('qpm.rebuildProject', async (node) => { const result = node ? await builds.build(true, node.ref) : undefined; treeProvider.refresh(); return result; }), register('qpm.cleanProject', async (node) => { const result = node ? await builds.clean(node.ref) : undefined; treeProvider.refresh(); return result; }), register('qpm.selectTargetType', (node) => workspaces.selectTargetType(node?.ref)), register('qpm.selectTargetTypeEXE', () => workspaces.selectTargetType()), register('qpm.selectTargetTypeDLL', () => workspaces.selectTargetType()), register('qpm.selectTargetTypeLIB', () => workspaces.selectTargetType()), register('qpm.editBuildSettings', (node) => { const ref = node?.ref ?? workspaces.activeProjectRef; return ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? qtProjectSettings.show(ref) : buildSettings.show(ref); }), register('qpm.editBuildSettingsSafeMode', (node) => { const ref = node?.ref ?? workspaces.activeProjectRef; return ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) ? qtProjectSettings.showSafeMode(ref) : buildSettings.showSafeMode(ref); }), register('qpm.executeProject', (node) => node ? builds.buildAndRun(node.ref) : undefined), register('qpm.debugProjectWithGdb', async (node) => { if (node?.ref)
        await workspaces.setActiveProject(node.ref); return await runGdbDebug(); }), register('qpm.editProjectFile', (node) => node ? builds.openProjectFile(node.ref.absolutePath) : undefined), register('qpm.openProjectFile', (node) => node ? workspaces.openPath(node.ref.absolutePath) : undefined), register('qpm.createProjectInWorkspace', async () => {
        await workspaces.createProjectInWorkspace();
        await builds.prepareNativeQtGeneratedFiles();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt project added to workspace' });
    }), register('qpm.createSdlProjectInWorkspace', () => workspaces.createSdlProjectInWorkspace()), register('qpm.addExistingProject', () => workspaces.addExistingProject()), register('qpm.removeProject', (node) => node ? workspaces.removeProject(node.ref) : undefined), register('qpm.addFiles', (node) => {
        if (node?.kind === 'folder') {
            return workspaces.addFiles(node.ref, node.folderPath);
        }
        return workspaces.addFiles(node?.ref);
    }), register('qpm.createNewFile', async (node) => {
        const ref = node?.ref ?? workspaces.activeProjectRef;
        if (node?.kind === 'folder') {
            await workspaces.createNewFile(node.ref, node.folderPath);
        }
        else {
            await workspaces.createNewFile(node?.ref);
        }
        await builds.prepareNativeQtGeneratedFiles(ref);
        treeProvider.refresh();
    }), register('qpm.convertQtFormToClass', async (target) => {
        let ref = target && 'kind' in target && target.kind === 'file' ? target.ref : undefined;
        let formPath = target && 'kind' in target && target.kind === 'file'
            ? target.file.absolutePath
            : target instanceof vscode.Uri
                ? target.fsPath
                : undefined;
        if (!formPath && vscode.window.activeTextEditor?.document.uri.scheme === 'file' && path.extname(vscode.window.activeTextEditor.document.uri.fsPath).toLowerCase() === '.ui') {
            formPath = vscode.window.activeTextEditor.document.uri.fsPath;
        }
        ref ??= formPath ? workspaces.findProjectRefForPath(formPath) : undefined;
        const convertedRef = await workspaces.convertQtFormToClass(ref, formPath);
        if (convertedRef) {
            await builds.prepareNativeQtGeneratedFiles(convertedRef);
            treeProvider.refresh();
        }
    }), register('qpm.addFolder', (node) => {
        if (node?.kind === 'folder') {
            return workspaces.addFolder(node.ref, node.folderPath);
        }
        return workspaces.addFolder(node?.ref);
    }), register('qpm.renameFolder', (node) => node ? workspaces.renameFolder(node.ref, node.folderPath) : undefined), register('qpm.removeFolder', (node) => node ? workspaces.removeFolder(node.ref, node.folderPath) : undefined), register('qpm.removeFile', (node) => node ? workspaces.removeFile(node.ref, node.file.sectionName, node.file.absolutePath) : undefined), register('qpm.excludeFile', (node) => node ? workspaces.setFileExcluded(node.ref, node.file, true) : undefined), register('qpm.includeFile', (node) => node ? workspaces.setFileExcluded(node.ref, node.file, false) : undefined), register('qpm.toggleObjOption', (node) => node ? workspaces.toggleCompileIntoObjectFile(node.ref, node.file) : undefined), register('qpm.replaceFile', (node) => node ? workspaces.replaceFile(node.ref, node.file) : undefined), register('qpm.renameFile', (node) => node ? workspaces.renameFile(node.ref, node.file) : undefined), register('qpm.moveFileToFolder', (node) => node ? workspaces.moveFileToFolder(node.ref, node.file) : undefined), register('qpm.compileFile', (node) => node ? builds.compileFile(node.file.absolutePath, node.ref) : undefined), register('qpm.generatePrototypes', (node) => node ? workspaces.generatePrototypes(node.ref, node.file) : undefined), register('qpm.prepareDllImportLibraryGeneration', (node) => node ? builds.prepareDllImportLibraryGeneration(node.file.absolutePath) : undefined), register('qpm.refreshFileSymbols', () => fileSymbolsProvider.refresh()), register('qpm.revealFileSymbol', (symbol) => symbol ? fileSymbolsProvider.reveal(symbol) : undefined), register('qpm.saveFile', (node) => node ? workspaces.saveFile(node.file.absolutePath) : undefined), register('qpm.openPanelFile', (node) => node ? builds.openPanelFile(node.file.absolutePath) : undefined), register('qpm.openQtDesigner', (target) => isQtPythonActive() ? qtPython.openDesigner(undefined, target) : qtProjects.openDesigner(target)), register('qpm.prepareQtDesignerWidgets', (node) => qtDesignerWidgets.prepareAll(node?.ref)), register('qpm.prepareAndOpenQtDesignerWidgets', (target) => qtDesignerWidgets.prepareAllAndOpen(target)), register('qpm.configureQtDesignerWidgets', (node) => qtDesignerWidgets.configure(node?.ref)), register('qpm.buildQtDesignerWidgets', (node) => qtDesignerWidgets.build(node?.ref)), register('qpm.installQtDesignerWidgets', (node) => qtDesignerWidgets.install(node?.ref)), register('qpm.openQtDesignerWithCustomWidgets', (target) => qtDesignerWidgets.openDesigner(target)), register('qpm.cleanQtDesignerWidgets', (node) => qtDesignerWidgets.clean(node?.ref)), register('qpm.revealQtDesignerWidgets', (node) => qtDesignerWidgets.reveal(node?.ref)), register('qpm.openPanelPathFile', (filePath) => filePath ? builds.openPanelFile(filePath) : undefined), register('qpm.openFunctionPanel', (node) => node ? functionPanels.open(node.file.absolutePath) : undefined), register('qpm.insertSnippet', () => templates.insertSnippet()), register('qpm.insertSnippetC', () => templates.insertSnippet('c')), register('qpm.insertSnippetCpp', () => templates.insertSnippet('cpp')), register('qpm.insertSnippetQt', () => templates.insertSnippet('qt')), register('qpm.insertSnippetWindows', () => templates.insertSnippet('windows')), register('qpm.insertSnippetDocumentation', () => templates.insertSnippet('documentation')), register('qpm.insertSnippetUser', () => templates.insertSnippet('user')), register('qpm.insertFileHeader', () => templates.insertFileDescriptionHeader()), register('qpm.insertHeaderChangeEntry', () => templates.insertHeaderChangeEntry()), register('qpm.insertCommentSection', () => templates.insertCommentSection()), register('qpm.insertSpecialCharacterText', () => templates.insertSpecialCharacterText()), register('qpm.insertColorValue', () => colorValues.openColorValuePicker()), register('qpm.openCharacterTable', () => editorUtilities.openCharacterTable()), register('qpm.convertSelectedTextToDecimalValues', () => editorUtilities.convertSelectedTextToDecimalValues()), register('qpm.convertSelectedNumbersToText', () => editorUtilities.convertSelectedNumbersToText()), register('qpm.openNumberConverter', () => editorUtilities.openNumberConverter()), register('qpm.openTruthTableDesigner', () => editorUtilities.openTruthTableDesigner()), register('qpm.openDigitalFilterDesigner', () => editorUtilities.openDigitalFilterDesigner()), register('qpm.saveSelectionAsSnippet', () => templates.saveSelectionAsSnippet()), register('qpm.manageSnippets', () => templates.manageSnippets()), register('qpm.saveFileAsTemplate', (node) => templates.saveCurrentFileAsTemplate(node?.file.absolutePath)), register('qpm.importFileTemplate', () => templates.importFileTemplate()), register('qpm.manageFileTemplates', () => templates.manageFileTemplates()), register('qpm.openFile', (node) => node ? workspaces.openPath(node.file.absolutePath) : undefined), register('qpm.openGeneratedFile', (node) => node ? workspaces.openPath(node.absolutePath) : undefined), register('qpm.revealGeneratedPath', (node) => node ? workspaces.revealInExplorer(node.absolutePath) : undefined), register('qpm.copyGeneratedPath', (node) => node ? workspaces.copyFilePath(node.absolutePath) : undefined), register('qpm.revealProjectFile', (node) => node ? workspaces.revealInExplorer(node.ref.absolutePath) : undefined), register('qpm.revealFile', (node) => node ? workspaces.revealInExplorer(node.file.absolutePath) : undefined), register('qpm.copyFilePath', (node) => node ? workspaces.copyFilePath(node.file.absolutePath) : undefined), register('qpm.copyRelativeFilePath', (node) => node ? workspaces.copyRelativeFilePath(node.ref, node.file.absolutePath) : undefined), register('qpm.convertSelectedIntegerToDecimal', () => convertSelectedIntegerLiteral('decimal')), register('qpm.convertSelectedIntegerToHexadecimal', () => convertSelectedIntegerLiteral('hexadecimal')), register('qpm.convertSelectedIntegerToBinary', () => convertSelectedIntegerLiteral('binary')), register('qpm.exploreProjectDirectory', (node) => node ? workspaces.revealInExplorer(path.dirname(node.ref.absolutePath)) : undefined), register('qpm.exploreFolderDirectory', (node) => node ? workspaces.revealInExplorer(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined), register('qpm.exploreFileDirectory', (node) => node ? workspaces.revealInExplorer(path.dirname(node.file.absolutePath)) : undefined), register('qpm.findProject', (node) => node ? workspaces.findInDirectory(path.dirname(node.ref.absolutePath)) : undefined), register('qpm.findFolder', (node) => node ? workspaces.findInDirectory(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined), register('qpm.findFile', (node) => node ? workspaces.findInDirectory(path.dirname(node.file.absolutePath)) : undefined), register('qpm.saveAll', () => vscode.commands.executeCommand('workbench.action.files.saveAll')), register('qpm.expandAll', () => focusTreeThen('list.expandAll')), register('qpm.collapseAll', () => focusTreeThen('list.collapseAll')));
    context.subscriptions.push(workspaces.onDidChange(() => { qtProfilingProvider.refresh(); qtPublicationProvider.refresh(); }));
    (0, qpmLibraryPackService_1.ensureBundledCppLibraryPack)(context, output);
    (0, jcLibEmbedded_1.activate)(context);
    await workspaces.restoreOrAutoLoad();
    await builds.restoreBuildModeFromActiveProject();
    await testing.refresh();
    qtQualityProvider.refresh();
    await qtPython.refresh();
    void qmlLanguage.autoStartIfNeeded();
    // Keep activation deterministic and short. Toolchain discovery and Qt/C++
    // IntelliSense synchronization can touch many PATH entries on Windows; running
    // it inline keeps VS Code in the "Activating Extensions..." state for too
    // long when no compiler has been selected yet.
    void runPostActivationSetup(cppTools, workspaces, output);
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document.uri.scheme === 'file' && (0, qpmSymbolService_1.isSourceOrHeader)(activeEditor.document.uri.fsPath)) {
        fileSymbolsProvider.setSelectedFile(activeEditor.document.uri.fsPath);
    }
    updateStatusBar();
}
const LEGACY_CONFIGURATION_SECTION = 'labwindowsCvi';
const QPM_CONFIGURATION_KEYS = [
    'installations',
    'activeInstallation',
    'buildMode',
    'runArguments',
    'projectFormatVersion',
    'autoLoadWorkspace',
    'autoConfigureCppTools',
    'autoAddQpmFolderToWorkspace',
    'intelliSenseCompilerPath',
    'additionalIncludePaths',
    'enableSupplementalCompletionProvider',
    'enableStandardLibraryCompletionProvider',
    'standardLibraryCompletionAutoInclude',
    'showPersistentStatusBarActions',
    'cCompilerPath',
    'cppCompilerPath',
    'archiverPath',
    'debuggerPath',
    'outputDirectory',
    'cStandard',
    'cppStandard',
    'warningLevel',
    'optimizationLevel',
    'debugInformation',
    'architectureMode',
    'compilerFlags',
    'cCompilerFlags',
    'cppCompilerFlags',
    'linkerFlags',
    'includePaths',
    'libraryPaths',
    'libraries',
    'defineSymbols',
    'useBuildModeArchitectureFlags',
    'runtimeDependencyMode',
    'deployRuntimeDlls',
    'useLocalBuildCacheForOneDrive',
    'cleanRuntimeDllsOnDeploy',
    'sdlInstallations',
    'sdlRootPath',
    'sdlEnabled',
    'sdlPackages',
    'sdlRuntimeMode',
    'sdlSubsystem',
    'sdlCopyAllRuntimeDlls'
];
async function migrateLegacyConfiguration(output) {
    const legacy = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
    const current = vscode.workspace.getConfiguration('qpm');
    const aliases = new Map([['autoAddQpmFolderToWorkspace', 'autoAddCviFolderToWorkspace']]);
    let migrated = 0;
    for (const key of QPM_CONFIGURATION_KEYS) {
        const legacyKey = aliases.get(key) ?? key;
        const legacyInspect = legacy.inspect(legacyKey);
        const currentInspect = current.inspect(key);
        if (!legacyInspect) {
            continue;
        }
        const legacyWorkspaceValue = legacyInspect.workspaceValue;
        if (legacyWorkspaceValue !== undefined && currentInspect?.workspaceValue === undefined) {
            await current.update(key, legacyWorkspaceValue, vscode.ConfigurationTarget.Workspace);
            migrated++;
        }
        const legacyGlobalValue = legacyInspect.globalValue;
        if (legacyGlobalValue !== undefined && currentInspect?.globalValue === undefined && currentInspect?.workspaceValue === undefined) {
            await current.update(key, legacyGlobalValue, vscode.ConfigurationTarget.Global);
            migrated++;
        }
        if (legacyWorkspaceValue !== undefined) {
            await legacy.update(legacyKey, undefined, vscode.ConfigurationTarget.Workspace);
        }
    }
    if (migrated > 0) {
        output.appendLine(`[Qt/C++] Migrated ${migrated} legacy setting(s) to qpm.*.`);
    }
}
async function scheduleOptionalCppToolsSync(cppTools, workspace, reason = 'project configuration changed') {
    const config = vscode.workspace.getConfiguration('qpm');
    const shouldAddFolder = config.get('autoAddQpmFolderToWorkspace', true);
    const shouldSync = config.get('autoConfigureCppTools', true);
    if (!shouldAddFolder && !shouldSync) {
        return;
    }
    if (shouldSync) {
        await cppTools.synchronizeNativeProject(workspace, {
            ensureWorkspaceFolder: shouldAddFolder,
            reason
        });
    }
    else if (shouldAddFolder) {
        await cppTools.ensureConfigurationRootInWorkspace(workspace);
    }
}
async function runPostActivationSetup(cppTools, workspaces, output) {
    try {
        const cleanedArtifacts = cppTools.cleanupOrphanedWorkspaceArtifacts(workspaces.currentWorkspace);
        if (cleanedArtifacts > 0) {
            output.appendLine(`[Qt/C++] Cleaned ${cleanedArtifacts} stale IntelliSense workspace artifact(s) during activation.`);
        }
        const repairedProvider = await cppTools.autoRepairStaleProviderSelection(workspaces.currentWorkspace);
        await scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'extension activation');
        if (repairedProvider) {
            void vscode.window.showWarningMessage('Qt Project Manager removed an obsolete Qt/C++ configuration provider reference that could disable normal completion outside managed projects. Reload VS Code, then run Qt/C++: Reset IntelliSense Database once.', 'Reload Window').then((action) => action === 'Reload Window' ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined);
        }
    }
    catch (error) {
        output.appendLine(`[Qt/C++] Post-activation setup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function createStatusBarAction(text, tooltip, command, priority) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
    item.text = text;
    item.tooltip = tooltip;
    item.command = command;
    return item;
}
async function convertSelectedIntegerLiteral(target) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Select an integer literal before converting it.');
        return;
    }
    const selectedText = editor.document.getText(editor.selection);
    const leadingWhitespace = selectedText.match(/^\s*/)?.[0] ?? '';
    const trailingWhitespace = selectedText.match(/\s*$/)?.[0] ?? '';
    const literal = selectedText.trim();
    const converted = formatIntegerLiteral(literal, target);
    if (!converted) {
        vscode.window.showErrorMessage('The selected text is not a supported decimal, hexadecimal (0x...) or binary (0b...) integer literal.');
        return;
    }
    await editor.edit((builder) => builder.replace(editor.selection, `${leadingWhitespace}${converted}${trailingWhitespace}`));
}
function formatIntegerLiteral(literal, target) {
    const match = literal.match(/^([+-]?)(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)([uUlL]*)$/);
    if (!match) {
        return undefined;
    }
    const [, sign, digits, suffix] = match;
    const unsignedDigits = digits.replace(/^0[xX]/, '').replace(/^0[bB]/, '');
    const base = /^0[xX]/.test(digits) ? 16 : /^0[bB]/.test(digits) ? 2 : 10;
    let value;
    try {
        value = BigInt(base === 16 ? `0x${unsignedDigits}` : base === 2 ? `0b${unsignedDigits}` : unsignedDigits);
    }
    catch {
        return undefined;
    }
    const body = target === 'hexadecimal'
        ? `0x${value.toString(16).toUpperCase()}`
        : target === 'binary'
            ? `0b${value.toString(2)}`
            : value.toString(10);
    return `${sign}${body}${suffix}`;
}
function deactivate() {
    // Resources are disposed through context.subscriptions.
}
