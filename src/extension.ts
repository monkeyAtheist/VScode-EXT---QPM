import * as path from 'path';
import * as vscode from 'vscode';
import { QpmParser } from './model/qpmParser';
import { QpmTreeProvider, FileNode, FolderNode, ProjectNode } from './providers/qpmTreeProvider';
import { QpmFileSymbolsProvider } from './providers/qpmFileSymbolsProvider';
import { QpmQtProjectHealthProvider } from './providers/qpmQtProjectHealthProvider';
import { QpmQtToolsProvider } from './providers/qpmQtToolsProvider';
import { QpmQtQualityProvider } from './providers/qpmQtQualityProvider';
import { QpmBuildService } from './services/qpmBuildService';
import { QpmCppToolsService } from './services/qpmCppToolsService';
import { QpmInstallationService } from './services/qpmInstallationService';
import { QpmWorkspaceService } from './services/qpmWorkspaceService';
import { HomePanel } from './views/homePanel';
import { activate as activateQpmLibraryExplorer } from './jcLibEmbedded';
import { ensureBundledCppLibraryPack } from './services/qpmLibraryPackService';
import { QpmTemplateService } from './services/qpmTemplateService';
import { QpmProjectSettingsService } from './services/qpmProjectSettingsService';
import { QpmSdlService } from './services/qpmSdlService';
import { BuildSettingsPanel } from './views/buildSettingsPanel';
import { QtProjectSettingsPanel } from './views/qtProjectSettingsPanel';
import { QuickActionsView } from './views/quickActionsView';
import { QpmCompletionProvider, QpmSourceSymbol, QpmSymbolService, isSourceOrHeader } from './services/qpmSymbolService';
import { QpmFunctionPanelService } from './services/qpmFunctionPanelService';
import { QpmBuildMode, QpmWorkspace } from './model/types';
import { QpmColorValueService } from './services/qpmColorValueService';
import { QpmEditorUtilitiesService } from './services/qpmEditorUtilitiesService';
import { QpmQtInstallationService } from './services/qpmQtInstallationService';
import { QpmQtProjectService } from './services/qpmQtProjectService';
import { QpmQtToolsService } from './services/qpmQtToolsService';
import { QpmQtQualityService } from './services/qpmQtQualityService';
import { QpmQtTestingService } from './services/qpmQtTestingService';
import { QpmQtKitRegistryService } from './services/qpmQtKitRegistryService';
import { QpmQtKitsProvider } from './providers/qpmQtKitsProvider';
import { QpmQtDebugService } from './services/qpmQtDebugService';
import { QpmQtDebugProvider } from './providers/qpmQtDebugProvider';
import { QpmQtPlatformService } from './services/qpmQtPlatformService';
import { QpmQtPlatformProvider } from './providers/qpmQtPlatformProvider';
import { QpmQtPackagingService } from './services/qpmQtPackagingService';
import { QpmQtPackagingProvider } from './providers/qpmQtPackagingProvider';
import { QpmQtProfilingService } from './services/qpmQtProfilingService';
import { QpmQtProfilingProvider } from './providers/qpmQtProfilingProvider';
import { QpmQtAndroidService } from './services/qpmQtAndroidService';
import { QpmQtAndroidProvider } from './providers/qpmQtAndroidProvider';
import { getQtInstallationPreference, isQtProjectManifestPath, readQtProjectManifest } from './model/qtProjectManifest';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Qt Project Manager');
  await migrateLegacyConfiguration(output);
  const parser = new QpmParser();
  const installations = new QpmInstallationService(output);
  const qtInstallations = new QpmQtInstallationService(output);
  const qtProjects = new QpmQtProjectService(qtInstallations, output);
  const qtKits = new QpmQtKitRegistryService(context, qtInstallations, output);
  const cppTools = new QpmCppToolsService(installations, qtInstallations, parser, output);
  const templates = new QpmTemplateService(context, installations, output);
  const sdl = new QpmSdlService(output);
  const workspaces = new QpmWorkspaceService(context, parser, installations, templates, sdl, qtProjects, output);
  const projectSettings = new QpmProjectSettingsService(workspaces, parser, output);
  const qtTools = new QpmQtToolsService(workspaces, qtInstallations, output);
  const builds = new QpmBuildService(parser, workspaces, qtInstallations, projectSettings, undefined, output);
  const debugging = new QpmQtDebugService(workspaces, builds, qtInstallations, output);
  const android = new QpmQtAndroidService(workspaces, qtInstallations, output);
  const platforms = new QpmQtPlatformService(workspaces, builds, output, android);
  const packaging = new QpmQtPackagingService(workspaces, builds, qtInstallations);
  const profiling = new QpmQtProfilingService(workspaces, builds, qtInstallations, output);
  const quality = new QpmQtQualityService(workspaces, qtInstallations, output);
  const testing = new QpmQtTestingService(workspaces, builds, qtInstallations, quality, output);
  const treeProvider = new QpmTreeProvider(workspaces);
  const treeView = vscode.window.createTreeView('qpm.workspaceExplorer', { treeDataProvider: treeProvider, showCollapseAll: true });
  const symbols = new QpmSymbolService(context.extensionPath, workspaces);
  const fileSymbolsProvider = new QpmFileSymbolsProvider(symbols);
  const fileSymbolsView = vscode.window.createTreeView('qpm.fileSymbols', { treeDataProvider: fileSymbolsProvider });
  fileSymbolsProvider.attachView(fileSymbolsView);
  const projectHealthProvider = new QpmQtProjectHealthProvider(workspaces, qtInstallations, builds, testing, quality, platforms, profiling);
  const projectHealthView = vscode.window.createTreeView('qpm.projectHealth', { treeDataProvider: projectHealthProvider });
  projectHealthProvider.attachView(projectHealthView);
  const qtToolsProvider = new QpmQtToolsProvider(workspaces, qtInstallations);
  const qtToolsView = vscode.window.createTreeView('qpm.qtTools', { treeDataProvider: qtToolsProvider, showCollapseAll: true });
  qtToolsProvider.attachView(qtToolsView);
  const qtQualityProvider = new QpmQtQualityProvider(workspaces, testing, quality);
  const qtQualityView = vscode.window.createTreeView('qpm.quality', { treeDataProvider: qtQualityProvider, showCollapseAll: true });
  qtQualityProvider.attachView(qtQualityView);
  const qtKitsProvider = new QpmQtKitsProvider(workspaces, qtKits);
  const qtKitsView = vscode.window.createTreeView('qpm.kits', { treeDataProvider: qtKitsProvider, showCollapseAll: true });
  qtKitsProvider.attachView(qtKitsView);
  const qtDebugProvider = new QpmQtDebugProvider(workspaces, debugging);
  const qtDebugView = vscode.window.createTreeView('qpm.debugging', { treeDataProvider: qtDebugProvider, showCollapseAll: false });
  qtDebugProvider.attachView(qtDebugView);
  const qtPlatformProvider = new QpmQtPlatformProvider(workspaces, platforms);
  const qtPlatformView = vscode.window.createTreeView('qpm.platforms', { treeDataProvider: qtPlatformProvider, showCollapseAll: false });
  qtPlatformProvider.attachView(qtPlatformView);
  const qtPackagingProvider = new QpmQtPackagingProvider(packaging);
  const qtPackagingView = vscode.window.createTreeView('qpm.packaging', { treeDataProvider: qtPackagingProvider, showCollapseAll: false });
  const qtProfilingProvider = new QpmQtProfilingProvider(profiling);
  const qtProfilingView = vscode.window.createTreeView('qpm.profiling', { treeDataProvider: qtProfilingProvider, showCollapseAll: false });
  const qtAndroidProvider = new QpmQtAndroidProvider(workspaces, android);
  const qtAndroidView = vscode.window.createTreeView('qpm.android', { treeDataProvider: qtAndroidProvider, showCollapseAll: false });
  qtAndroidProvider.attachView(qtAndroidView);
  const completionProvider = new QpmCompletionProvider(symbols);
  const functionPanels = new QpmFunctionPanelService();
  const colorValues = new QpmColorValueService();
  const editorUtilities = new QpmEditorUtilitiesService();
  const completionRegistration = vscode.languages.registerCompletionItemProvider(
    [{ language: 'c', scheme: 'file' }, { language: 'cpp', scheme: 'file' }],
    completionProvider
  );
  const home = new HomePanel(context, workspaces, builds, installations);
  const buildSettings = new BuildSettingsPanel(workspaces, parser, projectSettings);
  const qtProjectSettings = new QtProjectSettingsPanel(workspaces, qtInstallations, projectSettings, builds);
  const quickActions = new QuickActionsView(workspaces, builds, projectSettings);
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

  const updateToolbarContexts = (): void => {
    const activeRef = workspaces.activeProjectRef;
    const targetType = activeRef?.exists ? workspaces.getProject(activeRef)?.targetType : undefined;
    const targetKey = targetType === 'Dynamic Link Library' ? 'dll' : targetType === 'Static Library' ? 'lib' : targetType === 'Executable' ? 'exe' : 'none';
    const nativeQtProjectActive = !!activeRef?.exists && isQtProjectManifestPath(activeRef.absolutePath);
    void vscode.commands.executeCommand('setContext', 'qpm.buildMode', builds.buildMode);
    void vscode.commands.executeCommand('setContext', 'qpm.targetType', targetKey);
    void vscode.commands.executeCommand('setContext', 'qpm.nativeQtProjectActive', nativeQtProjectActive);
  };

  const updateStatusBar = (): void => {
    const targetType = workspaces.activeProject?.targetType;
    const modeText = builds.buildMode === 'debug64' ? 'D64' : builds.buildMode === 'release64' ? 'R64' : builds.buildMode === 'release' ? 'REL' : 'DBG';
    const targetText = targetType === 'Dynamic Link Library' ? 'DLL' : targetType === 'Static Library' ? 'LIB' : targetType === 'Executable' ? 'EXE' : '---';
    const activeRef = workspaces.activeProjectRef;
    let qtInstallation = qtInstallations.getActive();
    if (activeRef?.exists && isQtProjectManifestPath(activeRef.absolutePath)) {
      try {
        const manifest = readQtProjectManifest(activeRef.absolutePath);
        qtInstallation = qtInstallations.getActive(getQtInstallationPreference(manifest, builds.buildMode)) ?? qtInstallation;
      } catch {
        // Keep the global installation as a fallback.
      }
    }
    statusBarItems[0].text = qtInstallation ? `$(versions) Qt ${qtInstallation.version}` : '$(versions) Select Qt';
    statusBarItems[0].tooltip = qtInstallation ? qtInstallation.label : 'Select the Qt installation used by Qt Project Manager.';
    statusBarItems[6].text = '$(debug-alt-small) Debug';
    statusBarItems[6].tooltip = 'Build and debug the active executable with the debugger selected by the Qt kit (GDB, LLDB or Visual Studio).';
    statusBarItems[7].text = modeText;
    statusBarItems[7].tooltip = `Qt build mode: ${modeText}. Click to change.`;
    statusBarItems[8].text = targetText;
    statusBarItems[8].tooltip = `Qt target type: ${targetText}. Click to change.`;
    const show = vscode.workspace.getConfiguration('qpm').get<boolean>('showPersistentStatusBarActions', true);
    for (const item of statusBarItems) {
      if (show) item.show(); else item.hide();
    }
    updateToolbarContexts();
  };

  const register = (command: string, handler: (...args: any[]) => unknown): vscode.Disposable => vscode.commands.registerCommand(command, async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[Qt/C++] ${command} failed: ${message}`);
      vscode.window.showErrorMessage(`Qt Project Manager: ${message}`);
      return undefined;
    }
  });

  const focusTreeThen = async (command: string): Promise<void> => {
    await vscode.commands.executeCommand('qpm.workspaceExplorer.focus');
    await vscode.commands.executeCommand(command);
  };

  const isAndroidPlatformActive = (): boolean => android.activeProfile?.type === 'android';
  const runGdbDebug = async (): Promise<boolean> => isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile();

  context.subscriptions.push(
    output,
    workspaces,
    home,
    buildSettings,
    qtProjectSettings,
    sdl,
    quickActions,
    quickActionsRegistration,
    cppTools,
    qtTools,
    qtKits,
    qtKitsProvider,
    qtKitsView,
    debugging,
    qtDebugProvider,
    qtDebugView,
    platforms,
    qtPlatformProvider,
    qtPlatformView,
    packaging,
    qtPackagingView,
    profiling,
    qtProfilingProvider,
    qtProfilingView,
    android,
    qtAndroidProvider,
    qtAndroidView,
    vscode.debug.registerDebugConfigurationProvider('cppdbg', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('cppdbg') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugConfigurationProvider('cppvsdbg', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('cppvsdbg') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugConfigurationProvider('qml', { provideDebugConfigurations: () => debugging.provideDebugConfigurationsForType('qml') }, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    qtToolsProvider,
    qtToolsView,
    quality,
    testing,
    qtQualityProvider,
    qtQualityView,
    treeView,
    fileSymbolsView,
    projectHealthProvider,
    projectHealthView,
    completionRegistration,
    ...statusBarItems,
    treeView.onDidChangeSelection((event) => {
      const selected = event.selection[0];
      if (selected?.kind === 'file' && isSourceOrHeader(selected.file.absolutePath)) {
        fileSymbolsProvider.setSelectedFile(selected.file.absolutePath);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.scheme === 'file' && isSourceOrHeader(editor.document.uri.fsPath)) {
        fileSymbolsProvider.setSelectedFile(editor.document.uri.fsPath);
        void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'Qt/C++ file opened');
      }
    }),
    workspaces.onDidChange(() => {
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
      qtAndroidProvider.refresh();
      void testing.refresh();
      // The native project manifest is the durable source of truth for the
      // selected architecture and variant. Restore it before regenerating
      // IntelliSense or toolbar state when a project/workspace is switched.
      void builds.restoreBuildModeFromActiveProject().then(() => {
        updateStatusBar();
        quickActions.update();
        return scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
      });
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('qpm')) {
        updateStatusBar();
        home.update();
        quickActions.update();
      }
      if (event.affectsConfiguration('qpm.activeInstallation') || event.affectsConfiguration('qpm.autoConfigureCppTools') || event.affectsConfiguration('qpm.autoAddQpmFolderToWorkspace') || event.affectsConfiguration('qpm.useCppToolsConfigurationProvider') || event.affectsConfiguration('qpm.intelliSenseCompilerPath') || event.affectsConfiguration('qpm.qtCompilerPath') || event.affectsConfiguration('qpm.qtDesignerPath') || event.affectsConfiguration('qpm.additionalIncludePaths') || event.affectsConfiguration('qpm.sdlRootPath') || event.affectsConfiguration('qpm.sdlEnabled') || event.affectsConfiguration('qpm.sdlPackages')) {
        void scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace);
      }
    }),
    register('qpm.openHome', () => home.show()),
    register('qpm.openWorkspace', async () => {
      await workspaces.openWorkspace();
      await scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'project opened');
    }),
    register('qpm.createWorkspaceProject', async () => {
      await workspaces.createWorkspaceProject();
      await builds.prepareNativeQtGeneratedFiles();
      await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt workspace created' });
    }),
    register('qpm.createQtProject', async () => {
      const manifestPath = await qtProjects.createProjectWizard();
      if (manifestPath) {
        await workspaces.load(manifestPath);
        await builds.prepareNativeQtGeneratedFiles();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt project created' });
      }
    }),
    register('qpm.createSdlWorkspaceProject', () => workspaces.createSdlWorkspaceProject()),
    register('qpm.refresh', () => workspaces.refresh()),
    register('qpm.selectQtInstallation', async () => {
      const installation = await qtInstallations.select();
      if (installation) {
        const release = builds.buildMode === 'release' || builds.buildMode === 'release64';
        const mode: QpmBuildMode = installation.architecture === 'x86'
          ? (release ? 'release' : 'debug')
          : (release ? 'release64' : 'debug64');
        await builds.setBuildMode(mode);
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt kit selected' });
      }
      updateStatusBar();
      qtProjectSettings.update();
    }),
    register('qpm.repairQtToolchain', async () => {
      const ref = workspaces.activeProjectRef;
      const manifestRoot = ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? getQtInstallationPreference(readQtProjectManifest(ref.absolutePath)) : undefined;
      const installation = await qtInstallations.repairActiveToolchain(manifestRoot);
      if (installation) {
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, notify: true, ensureWorkspaceFolder: true, reason: 'Qt compiler repaired' });
      }
      updateStatusBar();
      qtProjectSettings.update();
    }),
    register('qpm.selectQtDesigner', async () => {
      const ref = workspaces.activeProjectRef;
      const manifestRoot = ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? getQtInstallationPreference(readQtProjectManifest(ref.absolutePath)) : undefined;
      await qtInstallations.selectDesignerExecutable(manifestRoot);
      qtProjectSettings.update();
    }),
    register('qpm.showQtInstallationInfo', () => qtInstallations.showInformation()),
    register('qpm.showQtProjectInfo', () => qtProjects.showProjectInformation(workspaces.activeProjectRef?.absolutePath)),
    register('qpm.manageQtKits', async () => { await qtKits.manage(); qtKitsProvider.refresh(); }),
    register('qpm.detectQtKits', async () => { await qtKits.detectAndSave(); qtKitsProvider.refresh(); }),
    register('qpm.assignQtKit', async () => {
      const ref = workspaces.activeProjectRef;
      if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      const kit = await qtKits.assignToProject(ref.absolutePath);
      if (kit) {
        workspaces.refresh(); qtProjectSettings.update(); qtKitsProvider.refresh(); projectHealthProvider.refresh();
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'named Qt kit assigned' });
      }
    }),
    register('qpm.selectQtBackend', async () => {
      const ref = workspaces.activeProjectRef;
      if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      await qtProjects.selectBuildBackend(ref.absolutePath);
      workspaces.refresh(); qtProjectSettings.update(); qtKitsProvider.refresh(); projectHealthProvider.refresh();
      await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt build backend changed' });
    }),
    register('qpm.importQtBuildProject', async () => {
      const ref = workspaces.activeProjectRef;
      if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      await qtProjects.importBuildProject(ref.absolutePath);
      workspaces.refresh(); qtProjectSettings.update(); qtKitsProvider.refresh(); projectHealthProvider.refresh();
      await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt backend project imported' });
    }),
    register('qpm.configureQtBackend', async () => { await builds.configureQtBackend(); qtKitsProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.openQtBackendProject', () => builds.openQtBackendProject()),
    register('qpm.manageQtProfiles', () => { const ref = workspaces.activeProjectRef; return ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? qtProjects.manageProfiles(ref.absolutePath).then(async () => { workspaces.refresh(); qtProjectSettings.update(); projectHealthProvider.refresh(); await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt profiles updated' }); }) : vscode.window.showErrorMessage('Open a native .qtproject.json project first.'); }),
    register('qpm.refreshProjectHealth', () => projectHealthProvider.refresh()),
    register('qpm.openProjectHealthReport', () => projectHealthProvider.openReport()),
    register('qpm.refreshQtTools', () => qtToolsProvider.refresh()),
    register('qpm.refreshTests', async () => { await testing.refresh(); qtQualityProvider.refresh(); }),
    register('qpm.openTestExplorer', () => testing.openTestExplorer()),
    register('qpm.runAllTests', async () => { await testing.runAll(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.runAllTestsWithCoverage', async () => { await testing.runAllWithCoverage(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.rerunFailedTests', async () => { await testing.rerunFailed(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.openTestHistory', () => testing.openTestHistory()),
    register('qpm.clearTestHistory', async () => { await testing.clearTestHistory(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.runTestAtCursor', async () => { await testing.runAtCursor(false); qtQualityProvider.refresh(); }),
    register('qpm.debugTestAtCursor', () => testing.runAtCursor(true)),
    register('qpm.runClangTidyFile', async (target?: unknown) => { await quality.runClangTidyFile(target, false); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.runClangTidyProject', async () => { await quality.runClangTidyProject(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.applyClangTidyFixes', async (target?: unknown) => { await quality.runClangTidyFile(target, true); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.runClazyFile', async (target?: unknown) => { await quality.runClazyFile(target); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.runClazyProject', async () => { await quality.runClazyProject(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.clearQualityDiagnostics', () => { quality.clearDiagnostics(); qtQualityProvider.refresh(); }),
    register('qpm.configureQuality', async () => { await quality.configureQuality(); qtQualityProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.createSanitizerProfiles', async () => { await quality.createSanitizerProfiles(); qtQualityProvider.refresh(); }),
    register('qpm.createCoverageProfile', async () => { await quality.createCoverageProfile(); qtQualityProvider.refresh(); }),
    register('qpm.openQualityReport', () => quality.openQualityReport()),
    register('qpm.createTranslation', (target?: unknown) => qtTools.createTranslation(target)),
    register('qpm.updateTranslations', (target?: unknown) => qtTools.updateTranslations(target)),
    register('qpm.releaseTranslations', (target?: unknown) => qtTools.releaseTranslations(target)),
    register('qpm.openTranslationInLinguist', (target?: unknown) => qtTools.openTranslationInLinguist(target)),
    register('qpm.showTranslationStatus', (target?: unknown) => qtTools.showTranslationStatus(target)),
    register('qpm.openQrcEditor', (target?: unknown) => qtTools.openResourceEditor(target)),
    register('qpm.validateQrc', (target?: unknown) => qtTools.validateResourceCollection(target)),
    register('qpm.qmlLintFile', (target?: unknown) => qtTools.lintQmlFile(target)),
    register('qpm.qmlLintProject', (target?: unknown) => qtTools.lintQmlProject(target)),
    register('qpm.qmlFormatFile', (target?: unknown) => qtTools.formatQmlFile(target)),
    register('qpm.qmlFormatProject', (target?: unknown) => qtTools.formatQmlProject(target)),
    register('qpm.qmlPreviewFile', (target?: unknown) => qtTools.previewQmlFile(target)),
    register('qpm.clearQmlDiagnostics', () => qtTools.clearQmlDiagnostics()),
    register('qpm.openQtDocumentation', () => qtTools.openQtDocumentation()),
    register('qpm.openQtDocumentationHome', () => qtTools.openQtDocumentationHome()),
    register('qpm.editQtModules', () => { const ref = workspaces.activeProjectRef; return ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? qtProjects.editModules(ref.absolutePath).then(async () => { workspaces.refresh(); await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'Qt modules updated' }); }) : vscode.window.showErrorMessage('Open a native .qtproject.json project first.'); }),
    register('qpm.showQtBuildPlan', () => builds.showQtBuildPlan()),
    register('qpm.deployQtRuntime', () => builds.deployQtRuntime()),
    register('qpm.configureInstallation', async () => {
      const installation = await installations.selectInstallation(workspaces.currentWorkspace?.qpmDir);
      if (installation) {
        await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'toolchain configured' });
        home.update();
      }
    }),
    register('qpm.configureSdl', async () => {
      await sdl.selectInstallation();
      await cppTools.sync(workspaces.currentWorkspace, true);
      home.update();
      quickActions.update();
    }),
    register('qpm.syncCppTools', () => cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, notify: true, ensureWorkspaceFolder: true, reason: 'manual synchronization' })),
    register('qpm.diagnoseCppTools', () => cppTools.diagnose(workspaces.currentWorkspace)),
    register('qpm.repairCppToolsProvider', () => cppTools.repairCppToolsProviderSelection(workspaces.currentWorkspace)),
    register('qpm.enableAutomaticSuggestions', () => cppTools.enableAutomaticSuggestions(workspaces.currentWorkspace)),
    register('qpm.addWorkspaceFolderForIntelliSense', () => cppTools.addConfigurationRootToWorkspace(workspaces.currentWorkspace)),
    register('qpm.selectBuildMode', () => builds.selectBuildMode()),
    register('qpm.selectBuildModeD32', () => builds.selectBuildMode('debug')),
    register('qpm.selectBuildModeR32', () => builds.selectBuildMode('release')),
    register('qpm.selectBuildModeD64', () => builds.selectBuildMode('debug64')),
    register('qpm.selectBuildModeR64', () => builds.selectBuildMode('release64')),
    // View-title toolbar helpers keep the current D32/R32/D64/R64 label while
    // opening the same build-mode selector as the persistent status-bar item.
    register('qpm.toolbarBuildModeD32', () => builds.selectBuildMode()),
    register('qpm.toolbarBuildModeR32', () => builds.selectBuildMode()),
    register('qpm.toolbarBuildModeD64', () => builds.selectBuildMode()),
    register('qpm.toolbarBuildModeR64', () => builds.selectBuildMode()),
    register('qpm.chooseBuildAction', () => builds.chooseBuildAction()),
    register('qpm.build', () => isAndroidPlatformActive() ? platforms.buildActive(false) : builds.build(false)),
    register('qpm.rebuild', () => isAndroidPlatformActive() ? platforms.buildActive(true) : builds.build(true)),
    register('qpm.clean', () => builds.clean()),
    register('qpm.run', () => isAndroidPlatformActive() ? android.buildInstallRun() : builds.buildAndRun()),
    register('qpm.chooseRunAction', () => builds.chooseRunAction()),
    register('qpm.runWithoutBuild', () => isAndroidPlatformActive() ? android.runApplication() : builds.runWithoutBuild()),
    register('qpm.debugWithGdb', () => runGdbDebug()),
    register('qpm.startQtDebugProfile', () => isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile()),
    register('qpm.startQtDebugProfileWithoutBuild', () => isAndroidPlatformActive() ? android.prepareDebugApplication() : debugging.launchActiveProfile({ build: false })),
    register('qpm.attachQtProcess', () => debugging.attachToLocalProcess()),
    register('qpm.debugQtCoreDump', () => debugging.debugCoreDump()),
    register('qpm.attachQmlDebugger', () => debugging.attachQmlDebugger()),
    register('qpm.manageQtDebugProfiles', async () => { await debugging.manageProfiles(); qtDebugProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.generateQtLaunchJson', () => debugging.generateLaunchJson()),
    register('qpm.manageQtPlatforms', async () => { await platforms.manageProfiles(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }),
    register('qpm.selectQtPlatform', async () => { await platforms.selectActivePlatform(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }),
    register('qpm.detectPlatformCapabilities', async () => { await platforms.openReport(); qtPlatformProvider.refresh(); }),
    register('qpm.buildForPlatform', () => platforms.buildActive(false)),
    register('qpm.deployToPlatform', () => platforms.deployActive()),
    register('qpm.runOnPlatform', () => platforms.runActive()),
    register('qpm.buildDeployRunPlatform', () => platforms.buildDeployRun()),
    register('qpm.openRemoteTerminal', () => platforms.openRemoteTerminal()),
    register('qpm.openDockerShell', () => platforms.openDockerShell()),
    register('qpm.serveWebAssembly', () => platforms.serveWebAssembly()),
    register('qpm.stopWebAssemblyServer', () => platforms.stopWebAssemblyServer()),
    register('qpm.openPlatformReport', () => platforms.openReport()),
    register('qpm.configureAndroidEnvironment', async () => { await android.configureEnvironment(); qtAndroidProvider.refresh(); qtPlatformProvider.refresh(); projectHealthProvider.refresh(); qtProjectSettings.update(); }),
    register('qpm.refreshAndroidDevices', () => { qtAndroidProvider.refresh(); return android.listDevices(); }),
    register('qpm.selectAndroidDevice', async () => { await android.selectDevice(); qtAndroidProvider.refresh(); qtProjectSettings.update(); }),
    register('qpm.selectAndroidAvd', async () => { await android.selectAvd(); qtAndroidProvider.refresh(); qtProjectSettings.update(); }),
    register('qpm.startAndroidAvd', async () => { await android.startAvd(); qtAndroidProvider.refresh(); }),
    register('qpm.installAndroidSdkPackages', async () => { await android.installRequiredSdkPackages(); qtAndroidProvider.refresh(); projectHealthProvider.refresh(); }),
    register('qpm.buildAndroidApk', async () => { await android.buildPackage('apk'); qtAndroidProvider.refresh(); }),
    register('qpm.buildAndroidAab', async () => { await android.buildPackage('aab'); qtAndroidProvider.refresh(); }),
    register('qpm.buildAndroidAar', async () => { await android.buildPackage('aar'); qtAndroidProvider.refresh(); }),
    register('qpm.installAndroidPackage', async () => { await android.installPackage(); qtAndroidProvider.refresh(); }),
    register('qpm.buildInstallRunAndroid', async () => { await android.buildInstallRun(); qtAndroidProvider.refresh(); }),
    register('qpm.runAndroidApplication', () => android.runApplication()),
    register('qpm.uninstallAndroidApplication', () => android.uninstallApplication()),
    register('qpm.prepareAndroidDebug', () => android.prepareDebugApplication()),
    register('qpm.startAndroidLogcat', async () => { await android.startLogcat(); qtAndroidProvider.refresh(); }),
    register('qpm.stopAndroidLogcat', () => { android.stopLogcat(); qtAndroidProvider.refresh(); }),
    register('qpm.openAndroidReport', () => android.openReport()),
    register('qpm.revealAndroidPackage', () => android.revealLatestPackage()),
    register('qpm.generateProductMetadata', async () => { await packaging.generateMetadata(); qtPackagingProvider.refresh(); }),
    register('qpm.createPortablePackage', async () => { const ok = await packaging.createPortablePackage(); if (ok) qtPackagingProvider.refresh(); }),
    register('qpm.openPackagingReport', () => packaging.openReport()),
    register('qpm.revealPackagingOutput', () => packaging.revealOutput()),
    register('qpm.cleanPackagingOutput', async () => { await packaging.cleanOutput(); qtPackagingProvider.refresh(); }),
    register('qpm.profileQmlApplication', async () => { await profiling.runQmlProfiler(); qtProfilingProvider.refresh(); }),
    register('qpm.profileCpu', async () => { await profiling.runCpuProfiler(); qtProfilingProvider.refresh(); }),
    register('qpm.profileMemory', async () => { await profiling.runMemoryProfiler(); qtProfilingProvider.refresh(); }),
    register('qpm.runCppcheck', async () => { await profiling.runCppcheck(); qtProfilingProvider.refresh(); }),
    register('qpm.traceSystemCalls', async () => { await profiling.runSystemTrace(); qtProfilingProvider.refresh(); }),
    register('qpm.stopProfiling', () => { profiling.stopActiveProfilers(); qtProfilingProvider.refresh(); }),
    register('qpm.openLatestProfilingResult', () => profiling.openLatestOutput()),
    register('qpm.openProfilingReport', () => profiling.openReport()),
    register('qpm.revealProfilingOutput', () => profiling.revealOutput()),
    register('qpm.cleanProfilingOutput', async () => { await profiling.cleanOutput(); qtProfilingProvider.refresh(); }),
    register('qpm.openWorkspaceFile', () => builds.openWorkspaceFile()),
    register('qpm.setActiveProject', (node?: ProjectNode) => workspaces.setActiveProject(node?.ref)),
    register('qpm.buildProject', (node?: ProjectNode) => node ? builds.build(false, node.ref) : undefined),
    register('qpm.rebuildProject', (node?: ProjectNode) => node ? builds.build(true, node.ref) : undefined),
    register('qpm.cleanProject', (node?: ProjectNode) => node ? builds.clean(node.ref) : undefined),
    register('qpm.selectTargetType', (node?: ProjectNode) => workspaces.selectTargetType(node?.ref)),
    register('qpm.selectTargetTypeEXE', () => workspaces.selectTargetType()),
    register('qpm.selectTargetTypeDLL', () => workspaces.selectTargetType()),
    register('qpm.selectTargetTypeLIB', () => workspaces.selectTargetType()),
    register('qpm.editBuildSettings', (node?: ProjectNode) => { const ref = node?.ref ?? workspaces.activeProjectRef; return ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? qtProjectSettings.show(ref) : buildSettings.show(ref); }),
    register('qpm.editBuildSettingsSafeMode', (node?: ProjectNode) => { const ref = node?.ref ?? workspaces.activeProjectRef; return ref?.exists && isQtProjectManifestPath(ref.absolutePath) ? qtProjectSettings.showSafeMode(ref) : buildSettings.showSafeMode(ref); }),
    register('qpm.executeProject', (node?: ProjectNode) => node ? builds.buildAndRun(node.ref) : undefined),
    register('qpm.debugProjectWithGdb', async (node?: ProjectNode) => { if (node?.ref) await workspaces.setActiveProject(node.ref); return await runGdbDebug(); }),
    register('qpm.editProjectFile', (node?: ProjectNode) => node ? builds.openProjectFile(node.ref.absolutePath) : undefined),
    register('qpm.openProjectFile', (node?: ProjectNode) => node ? workspaces.openPath(node.ref.absolutePath) : undefined),
    register('qpm.createProjectInWorkspace', async () => {
      await workspaces.createProjectInWorkspace();
      await builds.prepareNativeQtGeneratedFiles();
      await cppTools.synchronizeNativeProject(workspaces.currentWorkspace, { force: true, ensureWorkspaceFolder: true, reason: 'native Qt project added to workspace' });
    }),
    register('qpm.createSdlProjectInWorkspace', () => workspaces.createSdlProjectInWorkspace()),
    register('qpm.addExistingProject', () => workspaces.addExistingProject()),
    register('qpm.removeProject', (node?: ProjectNode) => node ? workspaces.removeProject(node.ref) : undefined),
    register('qpm.addFiles', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.addFiles(node.ref, node.folderPath);
      }
      return workspaces.addFiles(node?.ref);
    }),
    register('qpm.createNewFile', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.createNewFile(node.ref, node.folderPath);
      }
      return workspaces.createNewFile(node?.ref);
    }),
    register('qpm.addFolder', (node?: ProjectNode | FolderNode) => {
      if (node?.kind === 'folder') {
        return workspaces.addFolder(node.ref, node.folderPath);
      }
      return workspaces.addFolder(node?.ref);
    }),
    register('qpm.renameFolder', (node?: FolderNode) => node ? workspaces.renameFolder(node.ref, node.folderPath) : undefined),
    register('qpm.removeFolder', (node?: FolderNode) => node ? workspaces.removeFolder(node.ref, node.folderPath) : undefined),
    register('qpm.removeFile', (node?: FileNode) => node ? workspaces.removeFile(node.ref, node.file.sectionName, node.file.absolutePath) : undefined),
    register('qpm.excludeFile', (node?: FileNode) => node ? workspaces.setFileExcluded(node.ref, node.file, true) : undefined),
    register('qpm.includeFile', (node?: FileNode) => node ? workspaces.setFileExcluded(node.ref, node.file, false) : undefined),
    register('qpm.toggleObjOption', (node?: FileNode) => node ? workspaces.toggleCompileIntoObjectFile(node.ref, node.file) : undefined),
    register('qpm.replaceFile', (node?: FileNode) => node ? workspaces.replaceFile(node.ref, node.file) : undefined),
    register('qpm.renameFile', (node?: FileNode) => node ? workspaces.renameFile(node.ref, node.file) : undefined),
    register('qpm.compileFile', (node?: FileNode) => node ? builds.compileFile(node.file.absolutePath, node.ref) : undefined),
    register('qpm.generatePrototypes', (node?: FileNode) => node ? workspaces.generatePrototypes(node.ref, node.file) : undefined),
    register('qpm.prepareDllImportLibraryGeneration', (node?: FileNode) => node ? builds.prepareDllImportLibraryGeneration(node.file.absolutePath) : undefined),
    register('qpm.refreshFileSymbols', () => fileSymbolsProvider.refresh()),
    register('qpm.revealFileSymbol', (symbol?: QpmSourceSymbol) => symbol ? fileSymbolsProvider.reveal(symbol) : undefined),
    register('qpm.saveFile', (node?: FileNode) => node ? workspaces.saveFile(node.file.absolutePath) : undefined),
    register('qpm.openPanelFile', (node?: FileNode) => node ? builds.openPanelFile(node.file.absolutePath) : undefined),
    register('qpm.openQtDesigner', (target?: unknown) => qtProjects.openDesigner(target)),
    register('qpm.openPanelPathFile', (filePath?: string) => filePath ? builds.openPanelFile(filePath) : undefined),
    register('qpm.openFunctionPanel', (node?: FileNode) => node ? functionPanels.open(node.file.absolutePath) : undefined),
    register('qpm.insertSnippet', () => templates.insertSnippet()),
    register('qpm.insertSnippetC', () => templates.insertSnippet('c')),
    register('qpm.insertSnippetCpp', () => templates.insertSnippet('cpp')),
    register('qpm.insertSnippetQt', () => templates.insertSnippet('qt')),
    register('qpm.insertSnippetWindows', () => templates.insertSnippet('windows')),
    register('qpm.insertSnippetDocumentation', () => templates.insertSnippet('documentation')),
    register('qpm.insertSnippetUser', () => templates.insertSnippet('user')),
    register('qpm.insertFileHeader', () => templates.insertFileDescriptionHeader()),
    register('qpm.insertHeaderChangeEntry', () => templates.insertHeaderChangeEntry()),
    register('qpm.insertCommentSection', () => templates.insertCommentSection()),
    register('qpm.insertSpecialCharacterText', () => templates.insertSpecialCharacterText()),
    register('qpm.insertColorValue', () => colorValues.openColorValuePicker()),
    register('qpm.openCharacterTable', () => editorUtilities.openCharacterTable()),
    register('qpm.convertSelectedTextToDecimalValues', () => editorUtilities.convertSelectedTextToDecimalValues()),
    register('qpm.convertSelectedNumbersToText', () => editorUtilities.convertSelectedNumbersToText()),
    register('qpm.openNumberConverter', () => editorUtilities.openNumberConverter()),
    register('qpm.openTruthTableDesigner', () => editorUtilities.openTruthTableDesigner()),
    register('qpm.openDigitalFilterDesigner', () => editorUtilities.openDigitalFilterDesigner()),
    register('qpm.saveSelectionAsSnippet', () => templates.saveSelectionAsSnippet()),
    register('qpm.manageSnippets', () => templates.manageSnippets()),
    register('qpm.saveFileAsTemplate', (node?: FileNode) => templates.saveCurrentFileAsTemplate(node?.file.absolutePath)),
    register('qpm.importFileTemplate', () => templates.importFileTemplate()),
    register('qpm.manageFileTemplates', () => templates.manageFileTemplates()),
    register('qpm.openFile', (node?: FileNode) => node ? workspaces.openPath(node.file.absolutePath) : undefined),
    register('qpm.revealProjectFile', (node?: ProjectNode) => node ? workspaces.revealInExplorer(node.ref.absolutePath) : undefined),
    register('qpm.revealFile', (node?: FileNode) => node ? workspaces.revealInExplorer(node.file.absolutePath) : undefined),
    register('qpm.copyFilePath', (node?: FileNode) => node ? workspaces.copyFilePath(node.file.absolutePath) : undefined),
    register('qpm.copyRelativeFilePath', (node?: FileNode) => node ? workspaces.copyRelativeFilePath(node.ref, node.file.absolutePath) : undefined),
    register('qpm.convertSelectedIntegerToDecimal', () => convertSelectedIntegerLiteral('decimal')),
    register('qpm.convertSelectedIntegerToHexadecimal', () => convertSelectedIntegerLiteral('hexadecimal')),
    register('qpm.convertSelectedIntegerToBinary', () => convertSelectedIntegerLiteral('binary')),
    register('qpm.exploreProjectDirectory', (node?: ProjectNode) => node ? workspaces.revealInExplorer(path.dirname(node.ref.absolutePath)) : undefined),
    register('qpm.exploreFolderDirectory', (node?: FolderNode) => node ? workspaces.revealInExplorer(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined),
    register('qpm.exploreFileDirectory', (node?: FileNode) => node ? workspaces.revealInExplorer(path.dirname(node.file.absolutePath)) : undefined),
    register('qpm.findProject', (node?: ProjectNode) => node ? workspaces.findInDirectory(path.dirname(node.ref.absolutePath)) : undefined),
    register('qpm.findFolder', (node?: FolderNode) => node ? workspaces.findInDirectory(workspaces.directoryForLogicalFolder(node.ref, node.folderPath)) : undefined),
    register('qpm.findFile', (node?: FileNode) => node ? workspaces.findInDirectory(path.dirname(node.file.absolutePath)) : undefined),
    register('qpm.saveAll', () => vscode.commands.executeCommand('workbench.action.files.saveAll')),
    register('qpm.expandAll', () => focusTreeThen('list.expandAll')),
    register('qpm.collapseAll', () => focusTreeThen('list.collapseAll'))
  );

  context.subscriptions.push(workspaces.onDidChange(() => qtProfilingProvider.refresh()));

  ensureBundledCppLibraryPack(context, output);
  activateQpmLibraryExplorer(context);

  await workspaces.restoreOrAutoLoad();
  await builds.restoreBuildModeFromActiveProject();
  await testing.refresh();
  qtQualityProvider.refresh();

  // Keep activation deterministic and short. Toolchain discovery and Qt/C++
  // IntelliSense synchronization can touch many PATH entries on Windows; running
  // it inline keeps VS Code in the "Activating Extensions..." state for too
  // long when no compiler has been selected yet.
  void runPostActivationSetup(cppTools, workspaces, output);

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document.uri.scheme === 'file' && isSourceOrHeader(activeEditor.document.uri.fsPath)) {
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

async function migrateLegacyConfiguration(output: vscode.OutputChannel): Promise<void> {
  const legacy = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
  const current = vscode.workspace.getConfiguration('qpm');
  const aliases = new Map<string, string>([['autoAddQpmFolderToWorkspace', 'autoAddCviFolderToWorkspace']]);
  let migrated = 0;

  for (const key of QPM_CONFIGURATION_KEYS) {
    const legacyKey = aliases.get(key) ?? key;
    const legacyInspect = legacy.inspect<unknown>(legacyKey);
    const currentInspect = current.inspect<unknown>(key);
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

async function scheduleOptionalCppToolsSync(
  cppTools: QpmCppToolsService,
  workspace: QpmWorkspace | undefined,
  reason = 'project configuration changed'
): Promise<void> {
  const config = vscode.workspace.getConfiguration('qpm');
  const shouldAddFolder = config.get<boolean>('autoAddQpmFolderToWorkspace', true);
  const shouldSync = config.get<boolean>('autoConfigureCppTools', true);
  if (!shouldAddFolder && !shouldSync) {
    return;
  }
  if (shouldSync) {
    await cppTools.synchronizeNativeProject(workspace, {
      ensureWorkspaceFolder: shouldAddFolder,
      reason
    });
  } else if (shouldAddFolder) {
    await cppTools.ensureConfigurationRootInWorkspace(workspace);
  }
}

async function runPostActivationSetup(cppTools: QpmCppToolsService, workspaces: QpmWorkspaceService, output: vscode.OutputChannel): Promise<void> {
  try {
    const cleanedArtifacts = cppTools.cleanupOrphanedWorkspaceArtifacts(workspaces.currentWorkspace);
    if (cleanedArtifacts > 0) {
      output.appendLine(`[Qt/C++] Cleaned ${cleanedArtifacts} stale IntelliSense workspace artifact(s) during activation.`);
    }
    const repairedProvider = await cppTools.autoRepairStaleProviderSelection(workspaces.currentWorkspace);
    await scheduleOptionalCppToolsSync(cppTools, workspaces.currentWorkspace, 'extension activation');
    if (repairedProvider) {
      void vscode.window.showWarningMessage(
        'Qt Project Manager removed an obsolete Qt/C++ configuration provider reference that could disable normal completion outside managed projects. Reload VS Code, then run Qt/C++: Reset IntelliSense Database once.',
        'Reload Window'
      ).then((action) => action === 'Reload Window' ? vscode.commands.executeCommand('workbench.action.reloadWindow') : undefined);
    }
  } catch (error) {
    output.appendLine(`[Qt/C++] Post-activation setup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createStatusBarAction(text: string, tooltip: string, command: string, priority: number): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
  item.text = text;
  item.tooltip = tooltip;
  item.command = command;
  return item;
}

type IntegerLiteralTarget = 'decimal' | 'hexadecimal' | 'binary';

async function convertSelectedIntegerLiteral(target: IntegerLiteralTarget): Promise<void> {
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

function formatIntegerLiteral(literal: string, target: IntegerLiteralTarget): string | undefined {
  const match = literal.match(/^([+-]?)(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)([uUlL]*)$/);
  if (!match) {
    return undefined;
  }
  const [, sign, digits, suffix] = match;
  const unsignedDigits = digits.replace(/^0[xX]/, '').replace(/^0[bB]/, '');
  const base = /^0[xX]/.test(digits) ? 16 : /^0[bB]/.test(digits) ? 2 : 10;
  let value: bigint;
  try {
    value = BigInt(base === 16 ? `0x${unsignedDigits}` : base === 2 ? `0b${unsignedDigits}` : unsignedDigits);
  } catch {
    return undefined;
  }
  const body = target === 'hexadecimal'
    ? `0x${value.toString(16).toUpperCase()}`
    : target === 'binary'
      ? `0b${value.toString(2)}`
      : value.toString(10);
  return `${sign}${body}${suffix}`;
}

export function deactivate(): void {
  // Resources are disposed through context.subscriptions.
}
