import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';
import * as vscode from 'vscode';
import { QpmBuildMode, QpmProjectFile, QpmWorkspaceProjectRef } from '../model/types';
import { QpmParser } from '../model/qpmParser';
import { QpmWorkspaceService } from './qpmWorkspaceService';
import { QpmProjectSettingsService } from './qpmProjectSettingsService';
import { normalizeRuntimePath } from '../utils/pathUtils';
import { QpmSdlConfiguration, createSdlBuildPlan } from './qpmSdlService';
import { getActiveQtBuildProfile, getActiveQtDeployProfile, getQtKitProfileForBuild, getActiveQtRunProfile, getQtInstallationPreference, isQtProjectManifestPath, qtObjectDirectory, qtTargetPath, readQtProjectManifest, writeQtProjectManifest, getPersistedQtBuildMode, setPersistedQtBuildMode, isReleaseBuildMode, QtProjectManifest } from '../model/qtProjectManifest';
import { QpmQtInstallation, QpmQtInstallationService } from './qpmQtInstallationService';
import { createQtDirectBuildPlan, generationStepIsOutdated, qtCompileArguments, qtLinkArguments, qtObjectPathForSource, sourceNeedsCompilation, qtPrecompiledHeaderArguments, QtDirectBuildPlan } from './qpmQtDirectBuildService';
import { QpmQtBuildBackendService } from './qpmQtBuildBackendService';
import { createGnuResponseFileArguments, estimateGnuArgumentLength, shouldUseGnuResponseFile } from './qpmGnuResponseFile';

type QpmRuntimeDependencyMode = 'copy-dlls' | 'path-only' | 'static-link';

interface GenericCompilerConfiguration {
  cCompilerPath: string;
  cppCompilerPath: string;
  archiverPath: string;
  debuggerPath: string;
  outputDirectory: string;
  cStandard: string;
  cppStandard: string;
  warningLevel: string;
  optimizationLevel: string;
  debugInformation: string;
  architectureMode: string;
  compilerFlags: string[];
  cCompilerFlags: string[];
  cppCompilerFlags: string[];
  linkerFlags: string[];
  includePaths: string[];
  libraryPaths: string[];
  libraries: string[];
  defineSymbols: string[];
  useBuildModeArchitectureFlags: boolean;
  deployRuntimeDlls: string;
  runtimeDependencyMode: QpmRuntimeDependencyMode;
  cleanRuntimeDllsOnDeploy: boolean;
  useLocalBuildCacheForOneDrive: boolean;
  sdl: QpmSdlConfiguration;
}


interface BuildArtifacts {
  targetPath: string;
  objectDirectory: string;
  objectFiles: string[];
}

export class QpmBuildService {
  private readonly qtBackends: QpmQtBuildBackendService;

  constructor(
    private readonly parser: QpmParser,
    private readonly workspaces: QpmWorkspaceService,
    private readonly qtInstallations: QpmQtInstallationService,
    private readonly projectSettings: QpmProjectSettingsService,
    _breakpoints: unknown,
    private readonly output: vscode.OutputChannel
  ) { this.qtBackends = new QpmQtBuildBackendService(output); }

  get buildMode(): QpmBuildMode {
    const ref = this.workspaces.activeProjectRef;
    if (ref?.exists && isQtProjectManifestPath(ref.absolutePath)) {
      try { return getPersistedQtBuildMode(readQtProjectManifest(ref.absolutePath)); } catch { /* fall back to VS Code settings */ }
    }
    return vscode.workspace.getConfiguration('qpm').get<QpmBuildMode>('buildMode', 'debug64');
  }

  async chooseBuildAction(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: '$(tools) Build', value: 'build', description: 'Compile and link the selected Qt target' },
      { label: '$(sync) Rebuild', value: 'rebuild', description: 'Delete generated objects before compiling' },
      { label: '$(trash) Clean generated target', value: 'clean', description: 'Delete generated objects and target files without touching sources' }
    ], { title: 'Qt build action' });
    if (!selected) {
      return;
    }
    if (selected.value === 'clean') {
      await this.clean(projectRef);
    } else {
      await this.build(selected.value === 'rebuild', projectRef);
    }
  }

  async chooseRunAction(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const selected = await vscode.window.showQuickPick([
      { label: '$(play) Build and run', value: 'buildRun', description: 'Build the active executable and launch it' },
      { label: '$(run) Run without build', value: 'runOnly', description: 'Launch the existing executable target' },
      { label: '$(debug-alt) Build and debug', value: 'debug', description: 'Build, then start a VS Code Qt/C++ debugger session' }
    ], { title: 'Qt run action' });
    if (!selected) {
      return;
    }
    if (selected.value === 'runOnly') {
      await this.runWithoutBuild(projectRef);
    } else if (selected.value === 'debug') {
      await this.debugWithGdb(projectRef);
    } else {
      await this.buildAndRun(projectRef);
    }
  }

  async selectBuildMode(explicitMode?: QpmBuildMode): Promise<void> {
    const choices = [
      { label: 'Debug', value: 'debug' as QpmBuildMode, description: 'Adds -g -O0' },
      { label: 'Release', value: 'release' as QpmBuildMode, description: 'Adds -O2' },
      { label: 'Debug x64', value: 'debug64' as QpmBuildMode, description: 'Adds -g -O0 and optionally -m64' },
      { label: 'Release x64', value: 'release64' as QpmBuildMode, description: 'Adds -O2 and optionally -m64' }
    ];
    const selected = explicitMode
      ? choices.find((entry) => entry.value === explicitMode)
      : await vscode.window.showQuickPick(choices, { title: 'Select the Qt build mode' });
    if (!selected) return;
    await this.setBuildMode(selected.value);
    vscode.window.showInformationMessage(`Qt build mode: ${selected.label}.`);
  }

  async setBuildMode(mode: QpmBuildMode, persistProject = true): Promise<void> {
    if (persistProject) {
      const ref = this.workspaces.activeProjectRef;
      if (ref?.exists && isQtProjectManifestPath(ref.absolutePath)) {
        const manifest = readQtProjectManifest(ref.absolutePath);
        if (getPersistedQtBuildMode(manifest) !== mode) {
          setPersistedQtBuildMode(manifest, mode);
          writeQtProjectManifest(ref.absolutePath, manifest);
        }
      }
    }
    const config = vscode.workspace.getConfiguration('qpm');
    const target = vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await config.update('buildMode', mode, target);
    // Untitled multi-root windows can discard a workspace-scoped value when the
    // window is recreated. The project manifest remains the source of truth;
    // this global fallback only keeps the toolbar coherent before restoration.
    if (vscode.workspace.getConfiguration('qpm').get<QpmBuildMode>('buildMode', 'debug64') !== mode && target === vscode.ConfigurationTarget.Workspace) {
      await vscode.workspace.getConfiguration('qpm').update('buildMode', mode, vscode.ConfigurationTarget.Global);
    }
    await vscode.commands.executeCommand('setContext', 'qpm.buildMode', mode);
  }

  async restoreBuildModeFromActiveProject(): Promise<QpmBuildMode> {
    const ref = this.workspaces.activeProjectRef;
    if (ref?.exists && isQtProjectManifestPath(ref.absolutePath)) {
      const mode = getPersistedQtBuildMode(readQtProjectManifest(ref.absolutePath));
      await this.setBuildMode(mode, false);
      return mode;
    }
    const mode = vscode.workspace.getConfiguration('qpm').get<QpmBuildMode>('buildMode', 'debug64');
    await vscode.commands.executeCommand('setContext', 'qpm.buildMode', mode);
    return mode;
  }

  async build(rebuild = false, projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active Qt project is available for build.');
      return false;
    }

    this.beginOutput(`${rebuild ? 'Rebuild' : 'Build'} ${ref.name}`);
    const order = this.projectSettings.getBuildOrder(ref);
    this.output.appendLine(`[Qt/C++] Build order: ${order.map((item) => item.name).join(' -> ')}`);
    this.output.appendLine('');

    for (const item of order) {
      const cwd = path.dirname(item.absolutePath);
      const settings = this.projectSettings.getSettings(item);
      if (!await this.projectSettings.runActions(settings.preBuildActions, `Pre-build actions — ${item.name}`, cwd)) {
        return false;
      }
      if (!await this.projectSettings.runActions(settings.customBuildActions, `Custom build actions — ${item.name}`, cwd)) {
        return false;
      }
      const success = await this.buildOneProject(item, rebuild);
      if (!success) {
        return false;
      }
      if (!await this.projectSettings.runActions(settings.postBuildActions, `Post-build actions — ${item.name}`, cwd)) {
        return false;
      }
    }

    try {
      await vscode.commands.executeCommand('C_Cpp.RescanWorkspace');
    } catch {
      // Microsoft C/C++ may not be installed or active.
    }
    vscode.window.showInformationMessage(`${rebuild ? 'Rebuild' : 'Build'} completed successfully.`);
    return true;
  }

  async prepareNativeQtGeneratedFiles(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      return false;
    }

    const manifest = readQtProjectManifest(ref.absolutePath);
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) {
      this.output.appendLine('[Qt/C++] IntelliSense preparation skipped: no valid Qt installation is selected.');
      return false;
    }

    try {
      const profile = getActiveQtBuildProfile(manifest, this.buildMode);
      if (profile.system !== 'direct') {
        this.output.appendLine(`[Qt/C++] IntelliSense preparation uses the ${profile.system} backend compilation database after configure/build.`);
        return true;
      }
      const plan = createQtDirectBuildPlan(ref.absolutePath, this.buildMode, installation);
      if (!await this.ensureDirectory(plan.generatedDirectory, 'Qt generated directory')) {
        return false;
      }

      let generated = 0;
      for (const step of plan.generationSteps) {
        if (!generationStepIsOutdated(step)) {
          continue;
        }
        const ok = await this.spawnTool(step.toolPath, step.arguments, plan.projectDirectory, `Prepare ${step.kind} ${path.basename(step.inputPath)}`);
        if (!ok || !this.validateProducedFile(step.outputPath, `${step.kind} output`)) {
          return false;
        }
        generated += 1;
      }

      this.output.appendLine(`[Qt/C++] IntelliSense preparation: ${generated} Qt generated file(s) refreshed in ${plan.generatedDirectory}.`);
      return true;
    } catch (error) {
      this.output.appendLine(`[Qt/C++] IntelliSense preparation skipped: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async clean(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing active Qt project is available to clean.');
      return;
    }
    this.beginOutput(`Clean ${ref.name}`);
    const artifacts = this.resolveArtifacts(ref);
    if (isQtProjectManifestPath(ref.absolutePath)) {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const profile = getActiveQtBuildProfile(manifest, this.buildMode);
      if (profile.system !== 'direct') {
        const installation = this.resolveQtInstallation(manifest);
        if (!installation) throw new Error('No valid Qt installation is selected for this project.');
        const ok = await this.qtBackends.clean(ref.absolutePath, this.buildMode, installation);
        if (ok) vscode.window.showInformationMessage(`Clean completed for ${ref.name} (${profile.system}).`);
        else vscode.window.showErrorMessage(`Clean failed for ${ref.name}. Open the Qt Project Manager output channel.`);
        return;
      }
      const modeDirectory = path.dirname(artifacts.targetPath);
      if (fs.existsSync(modeDirectory)) {
        try {
          fs.rmSync(modeDirectory, { recursive: true, force: true });
          this.output.appendLine(`[Qt Direct] Deleted mode output directory: ${modeDirectory}`);
          vscode.window.showInformationMessage(`Clean completed for ${ref.name}.`);
          return;
        } catch (error) {
          this.output.appendLine(`[Qt Direct] Unable to delete ${modeDirectory}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    const candidates = new Set<string>([artifacts.targetPath]);
    if (path.extname(artifacts.targetPath).toLowerCase() === '.exe') {
      candidates.add(replaceExtension(artifacts.targetPath, '.pdb'));
    }
    let removed = 0;
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      try {
        fs.rmSync(candidate, { force: true });
        this.output.appendLine(`[Qt/C++] Deleted: ${candidate}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Unable to delete ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (fs.existsSync(artifacts.objectDirectory)) {
      try {
        fs.rmSync(artifacts.objectDirectory, { recursive: true, force: true });
        this.output.appendLine(`[Qt/C++] Deleted object directory: ${artifacts.objectDirectory}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Unable to delete ${artifacts.objectDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, this.getCompilerConfiguration());
    if (fallbackObjectDirectory && fs.existsSync(fallbackObjectDirectory)) {
      try {
        fs.rmSync(fallbackObjectDirectory, { recursive: true, force: true });
        this.output.appendLine(`[Qt/C++] Deleted local object directory: ${fallbackObjectDirectory}`);
        removed += 1;
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Unable to delete ${fallbackObjectDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (removed === 0) {
      this.output.appendLine('[Qt/C++] No generated target or object directory was found.');
    }
    vscode.window.showInformationMessage(`Clean completed for ${ref.name}: ${removed} generated item(s) removed.`);
  }

  async compileFile(filePath: string, projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is available to provide compiler options.');
      return false;
    }
    if (!isSource(filePath)) {
      vscode.window.showErrorMessage('Compile File is available only for Qt/C++ source files.');
      return false;
    }
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`Source file not found: ${filePath}`);
      return false;
    }
    this.beginOutput(`Compile ${path.basename(filePath)}`);
    if (isQtProjectManifestPath(ref.absolutePath)) {
      return await this.compileNativeQtFile(ref, filePath);
    }
    const config = this.getCompilerConfiguration();
    const project = this.workspaces.getProject(ref);
    const artifacts = this.resolveArtifacts(ref);
    if (!await this.ensureDirectory(artifacts.objectDirectory, 'object directory', false)) {
      const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, config);
      if (!fallbackObjectDirectory || !await this.ensureDirectory(fallbackObjectDirectory, 'local object directory')) {
        return false;
      }
      this.output.appendLine(`[Qt/C++] Falling back to local object directory: ${fallbackObjectDirectory}`);
      artifacts.objectDirectory = fallbackObjectDirectory;
    }
    const objectPath = this.objectPathForSource(filePath, ref.absolutePath, artifacts.objectDirectory);
    const args = this.compileArguments(filePath, objectPath, ref, project?.files ?? [], config);
    return await this.spawnTool(this.compilerForSource(filePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(filePath)}`);
  }

  async run(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    await this.buildAndRun(projectRef);
  }

  async buildAndRun(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is available to build and run.');
      return;
    }
    const success = await this.build(false, ref);
    if (!success) {
      return;
    }
    await this.runWithoutBuild(ref);
  }

  async runWithoutBuild(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is available to run.');
      return;
    }
    const project = this.workspaces.getProject(ref);
    if (project?.targetType !== 'Executable' && project?.targetType !== 'Dynamic Link Library') {
      vscode.window.showErrorMessage('Run is available only for executable targets, or for DLL targets with an external host configured.');
      return;
    }

    const run = this.getProjectRunSettings(ref);
    const targetPath = this.resolveTargetPath(ref, project?.targetType);
    const useExternalHost = project?.targetType === 'Dynamic Link Library' && run.externalProcessPath.trim().length > 0;
    const rawExecutablePath = useExternalHost ? run.externalProcessPath.trim() : targetPath;
    if (!rawExecutablePath) {
      vscode.window.showErrorMessage(`The output target for ${ref.name} could not be resolved.`);
      return;
    }
    const executablePath = normalizeRuntimePath(rawExecutablePath);
    if (process.platform === 'win32' && path.extname(executablePath).toLowerCase() !== '.exe') {
      vscode.window.showErrorMessage(`The selected target is ${path.basename(executablePath)}, not an executable. Configure an external executable for DLL debugging in Project Build Settings.`);
      return;
    }
    if (!fs.existsSync(executablePath)) {
      vscode.window.showErrorMessage(`The executable does not exist: ${executablePath}. Build the target before launching it.`);
      return;
    }
    const fallbackArgs = vscode.workspace.getConfiguration('qpm').get<string[]>('runArguments', []);
    const args = run.arguments.trim() ? this.projectSettings.parseArguments(run.arguments) : fallbackArgs;
    const cwd = run.workingDirectory.trim() ? normalizeRuntimePath(run.workingDirectory.trim()) : path.dirname(executablePath);
    if (!fs.existsSync(cwd)) {
      vscode.window.showErrorMessage(`The configured working directory does not exist: ${cwd}`);
      return;
    }
    const config = this.getRuntimeCompilerConfiguration(ref);
    this.deployToolchainRuntimeDlls(executablePath, config);
    const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    this.deploySdlRuntimeDlls(executablePath, sdlPlan);
    const env = this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(run.environmentOptions), config, executablePath);
    const child = spawn(executablePath, args, { cwd, env, detached: true, shell: false, stdio: 'ignore' });
    child.unref();
    this.output.appendLine(`[Qt/C++] Started ${executablePath} ${args.map(renderArgument).join(' ')}`);
    this.output.appendLine(`[Qt/C++] Runtime PATH prepended with: ${this.runtimeSearchDirectories(config, executablePath).join(path.delimiter)}`);
  }

  async debugWithGdb(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      vscode.window.showErrorMessage('No existing Qt project is available for debugging.');
      return false;
    }
    const project = this.workspaces.getProject(ref);
    if (project?.targetType !== 'Executable') {
      vscode.window.showErrorMessage('VS Code debugger launch is available only for executable targets.');
      return false;
    }
    if (this.buildMode === 'release' || this.buildMode === 'release64') {
      const debugMode: QpmBuildMode = this.buildMode === 'release64' ? 'debug64' : 'debug';
      const answer = await vscode.window.showWarningMessage(`The active build mode is ${this.buildMode}. Switch to ${debugMode}, build and debug?`, 'Switch, build and debug', 'Continue current mode', 'Cancel');
      if (answer === 'Cancel' || !answer) {
        return false;
      }
      if (answer === 'Switch, build and debug') {
        await this.setBuildMode(debugMode);
      }
    }
    const success = await this.build(false, ref);
    if (!success) {
      return false;
    }
    const targetPath = this.resolveTargetPath(ref, project?.targetType);
    if (!targetPath || !fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Debug target not found: ${targetPath || ref.name}`);
      return false;
    }
    const runSettings = this.getProjectRunSettings(ref);
    const config = this.getRuntimeCompilerConfiguration(ref);
    this.deployToolchainRuntimeDlls(targetPath, config);
    const sdlPlan = project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    this.deploySdlRuntimeDlls(targetPath, sdlPlan);
    const args = runSettings.arguments.trim() ? this.projectSettings.parseArguments(runSettings.arguments) : [];
    const cwd = runSettings.workingDirectory.trim() ? normalizeRuntimePath(runSettings.workingDirectory.trim()) : path.dirname(targetPath);
    const debugEnvironment = this.debugEnvironmentFromProcessEnv(this.createRuntimeEnvironment(this.projectSettings.parseEnvironment(runSettings.environmentOptions), config, targetPath));
    let debuggerType: 'auto' | 'gdb' | 'lldb' | 'cdb' | 'cppvsdbg' = 'auto';
    let compilerFamily = '';
    if (isQtProjectManifestPath(ref.absolutePath)) {
      try {
        const kit = getQtKitProfileForBuild(readQtProjectManifest(ref.absolutePath), this.buildMode);
        debuggerType = kit.debuggerType;
        compilerFamily = kit.compilerFamily?.toLowerCase() ?? '';
      } catch {
        // Fall back to the resolved runtime toolchain below.
      }
    }
    const useVisualStudioDebugger = debuggerType === 'cppvsdbg'
      || debuggerType === 'cdb'
      || compilerFamily === 'msvc'
      || /(?:^|[\/])cl(?:\.exe)?$/i.test(config.cppCompilerPath);
    const debugConfig: vscode.DebugConfiguration = useVisualStudioDebugger
      ? {
          name: `Debug ${ref.name}`,
          type: 'cppvsdbg',
          request: 'launch',
          program: targetPath,
          args,
          cwd,
          stopAtEntry: false,
          externalConsole: false,
          environment: debugEnvironment
        }
      : {
          name: `Debug ${ref.name}`,
          type: 'cppdbg',
          request: 'launch',
          program: targetPath,
          args,
          cwd,
          stopAtEntry: false,
          externalConsole: false,
          MIMode: debuggerType === 'lldb' ? 'lldb' : 'gdb',
          miDebuggerPath: config.debuggerPath || (debuggerType === 'lldb' ? 'lldb' : 'gdb'),
          environment: debugEnvironment
        };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath)), debugConfig);
    if (!started) {
      vscode.window.showErrorMessage('Unable to start the VS Code Qt/C++ debug session. Check that the Microsoft Qt/C++ extension and gdb are installed.');
    }
    return started;
  }

  async openWorkspaceFile(): Promise<void> {
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) {
      vscode.window.showErrorMessage('No Qt workspace is loaded.');
      return;
    }
    await this.workspaces.openPath(workspace.path);
  }

  async openProjectFile(projectPath: string): Promise<void> {
    await this.workspaces.openPath(projectPath);
  }

  async prepareDllImportLibraryGeneration(headerPath: string): Promise<void> {
    await vscode.env.clipboard.writeText(headerPath);
    vscode.window.showInformationMessage('The header path was copied. Use your compiler toolchain or dlltool to generate an import library if required.');
  }

  async openPanelFile(panelPath: string): Promise<void> {
    await this.workspaces.openPath(panelPath);
  }

  async showQtBuildPlan(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Open a native .qtproject.json project to inspect its direct Qt build plan.');
      return;
    }
    const manifest = readQtProjectManifest(ref.absolutePath);
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) throw new Error('No valid Qt installation is selected for this project.');
    const profile = getActiveQtBuildProfile(manifest, this.buildMode);
    if (profile.system !== 'direct') {
      const visibleBackend = this.qtBackends.describe(ref.absolutePath, this.buildMode, installation);
      const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(visibleBackend, null, 2) });
      await vscode.window.showTextDocument(document, { preview: true });
      return;
    }
    const plan = createQtDirectBuildPlan(ref.absolutePath, this.buildMode, installation);
    const visiblePlan = {
      project: plan.manifest.name,
      mode: plan.mode,
      qtInstallation: plan.installation.label,
      compiler: plan.installation.toolchain.cppCompilerPath,
      targetPath: plan.targetPath,
      importLibraryPath: plan.importLibraryPath,
      objectDirectory: plan.objectDirectory,
      generatedDirectory: plan.generatedDirectory,
      sourceFiles: plan.sourceFiles,
      generatedSources: plan.generatedSourceFiles,
      generatedHeaders: plan.generatedHeaderFiles,
      includeDirectories: plan.includeDirectories,
      libraryDirectories: plan.libraryDirectories,
      defines: plan.defines,
      entryPointArguments: plan.entryPointArguments,
      QtLibraries: plan.qtLibraries,
      platformLibraries: plan.platformLibraries,
      generationSteps: plan.generationSteps.map((step) => ({ kind: step.kind, input: step.inputPath, output: step.outputPath, tool: step.toolPath, arguments: step.arguments }))
    };
    const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(visiblePlan, null, 2) });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async configureQtBackend(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      return false;
    }
    const manifest = readQtProjectManifest(ref.absolutePath);
    const profile = getActiveQtBuildProfile(manifest, this.buildMode);
    if (profile.system === 'direct') {
      vscode.window.showInformationMessage('The direct Qt backend does not require a configure step.');
      return true;
    }
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) throw new Error('No valid Qt installation is selected for this project.');
    const result = await this.qtBackends.configureOnly(ref.absolutePath, this.buildMode, installation);
    if (result.success) vscode.window.showInformationMessage(`${profile.system === 'qmake' ? 'qmake' : 'CMake'} configuration completed for ${manifest.name}.`);
    else vscode.window.showErrorMessage(`${profile.system === 'qmake' ? 'qmake' : 'CMake'} configuration failed. Open the QPM output.`);
    return result.success;
  }

  async openQtBackendProject(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Open a native .qtproject.json project first.');
      return;
    }
    const manifest = readQtProjectManifest(ref.absolutePath);
    const profile = getActiveQtBuildProfile(manifest, this.buildMode);
    if (profile.system === 'direct') {
      vscode.window.showInformationMessage('The direct backend has no .pro or CMakeLists.txt file. Use Show Qt Build Plan instead.');
      return;
    }
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) throw new Error('No valid Qt installation is selected for this project.');
    await this.qtBackends.openGeneratedProject(ref.absolutePath, this.buildMode, installation);
  }

  async deployQtRuntime(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Qt runtime deployment requires a native .qtproject.json project.');
      return false;
    }
    const manifest = readQtProjectManifest(ref.absolutePath);
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) {
      vscode.window.showErrorMessage('No valid Qt installation is selected for this project.');
      return false;
    }
    this.beginOutput(`Deploy Qt runtime for ${ref.name}`);
    return await this.deployNativeQtTarget(ref, manifest, installation, true);
  }

  private async deployNativeQtTarget(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, installation: QpmQtInstallation, announce: boolean): Promise<boolean> {
    if (!installation.deployToolPath) {
      vscode.window.showErrorMessage('The selected Qt installation does not provide a deployment tool.');
      return false;
    }
    const targetPath = qtTargetPath(ref.absolutePath, this.buildMode, manifest);
    if (!fs.existsSync(targetPath)) {
      vscode.window.showErrorMessage(`Build the target before deployment: ${targetPath}`);
      return false;
    }
    const deployProfile = getActiveQtDeployProfile(manifest);
    if (deployProfile.translations && !await this.releaseAndDeployApplicationTranslations(ref, manifest, installation, path.dirname(targetPath))) {
      return false;
    }
    const args: string[] = [];
    if (process.platform === 'win32') {
      args.push(isReleaseBuildMode(this.buildMode) ? '--release' : '--debug');
      if (manifest.files.qml.length > 0) args.push('--qmldir', path.dirname(path.resolve(path.dirname(ref.absolutePath), manifest.files.qml[0])));
      if (!vscode.workspace.getConfiguration('qpm').get<boolean>('qtDeployTranslations', false)) args.push('--no-translations');
    }
    args.push(targetPath);
    const deployed = await this.spawnTool(installation.deployToolPath, args, path.dirname(ref.absolutePath), `Deploy ${path.basename(targetPath)}`);
    if (deployed && announce) vscode.window.showInformationMessage(`Qt runtime deployed beside ${path.basename(targetPath)}.`);
    return deployed;
  }

  private async releaseAndDeployApplicationTranslations(
    ref: QpmWorkspaceProjectRef,
    manifest: QtProjectManifest,
    installation: QpmQtInstallation,
    targetDirectory: string
  ): Promise<boolean> {
    const projectRoot = path.dirname(ref.absolutePath);
    const entries = manifest.files.translations
      .map((entry) => ({ entry, absolutePath: path.resolve(projectRoot, entry) }))
      .filter(({ absolutePath }) => fs.existsSync(absolutePath));
    if (entries.length === 0) {
      this.output.appendLine('[Qt Tools] Deploy profile requests application translations, but the manifest contains no existing .ts or .qm file.');
      return true;
    }

    const tsEntries = entries.filter(({ absolutePath }) => path.extname(absolutePath).toLowerCase() === '.ts');
    if (tsEntries.length > 0 && !installation.lreleasePath) {
      vscode.window.showErrorMessage('The active deploy profile includes application translations, but lrelease was not found in the selected Qt kit.');
      return false;
    }

    const deploymentRoot = path.join(targetDirectory, 'translations');
    fs.mkdirSync(deploymentRoot, { recursive: true });
    const failOnUnfinished = vscode.workspace.getConfiguration('qpm').get<boolean>('translationFailOnUnfinished', false);
    let deployedCount = 0;
    for (const { entry, absolutePath } of entries) {
      const extension = path.extname(absolutePath).toLowerCase();
      if (extension !== '.ts' && extension !== '.qm') continue;
      const destination = path.join(deploymentRoot, applicationTranslationRelativePath(entry));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (extension === '.ts') {
        const args = [...(failOnUnfinished ? ['-fail-on-unfinished'] : []), absolutePath, '-qm', destination];
        if (!await this.spawnTool(installation.lreleasePath!, args, projectRoot, `Release ${path.basename(absolutePath)}`)) return false;
      } else {
        fs.copyFileSync(absolutePath, destination);
        this.output.appendLine(`[Qt Tools] Copy translation ${absolutePath} -> ${destination}`);
      }
      deployedCount += 1;
    }
    this.output.appendLine(`[Qt Tools] Application translation deployment: ${deployedCount} catalog(s) available in ${deploymentRoot}`);
    return true;
  }

  private async buildOneProject(ref: QpmWorkspaceProjectRef, rebuild: boolean): Promise<boolean> {
    if (isQtProjectManifestPath(ref.absolutePath)) {
      return await this.buildNativeQtProject(ref, rebuild);
    }
    this.output.appendLine('[Qt/C++] Compatibility project detected: .prj projects use the generic C/C++ pipeline and do not run moc, uic or rcc. Create or open a .qtproject.json project to use the selected Qt kit and native Qt build engine.');
    this.output.appendLine('');
    const project = this.workspaces.getProject(ref);
    if (!project) {
      vscode.window.showErrorMessage(`Unable to parse project: ${ref.name}`);
      return false;
    }
    const config = this.getCompilerConfiguration();
    const artifacts = this.resolveArtifacts(ref, project.targetType);
    const sourceFiles = project.files.filter((file) => !file.excluded && isSource(file.absolutePath));
    if (sourceFiles.length === 0) {
      vscode.window.showErrorMessage(`${ref.name} has no Qt/C++ source file included in the build.`);
      return false;
    }
    if (rebuild && fs.existsSync(artifacts.objectDirectory)) {
      try {
        fs.rmSync(artifacts.objectDirectory, { recursive: true, force: true });
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Warning: unable to remove previous object directory before rebuild: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!await this.ensureDirectory(artifacts.objectDirectory, 'object directory', false)) {
      const fallbackObjectDirectory = this.resolveLocalObjectDirectory(ref, config);
      if (!fallbackObjectDirectory || !await this.ensureDirectory(fallbackObjectDirectory, 'local object directory')) {
        return false;
      }
      this.output.appendLine(`[Qt/C++] Falling back to local object directory: ${fallbackObjectDirectory}`);
      artifacts.objectDirectory = fallbackObjectDirectory;
    }
    if (!await this.ensureDirectory(path.dirname(artifacts.targetPath), 'target directory')) {
      return false;
    }

    const objectFiles: string[] = [];
    for (const source of sourceFiles) {
      const objectPath = this.objectPathForSource(source.absolutePath, ref.absolutePath, artifacts.objectDirectory);
      const shouldCompile = rebuild || !fs.existsSync(objectPath) || fs.statSync(source.absolutePath).mtimeMs > fs.statSync(objectPath).mtimeMs;
      if (shouldCompile) {
        const args = this.compileArguments(source.absolutePath, objectPath, ref, project.files, config);
        const success = await this.spawnTool(this.compilerForSource(source.absolutePath, config), args, path.dirname(ref.absolutePath), `Compile ${path.basename(source.absolutePath)}`);
        if (!success) {
          return false;
        }
      } else {
        this.output.appendLine(`[Qt/C++] Up to date: ${path.basename(source.absolutePath)}`);
      }
      objectFiles.push(objectPath);
    }

    artifacts.objectFiles = objectFiles;
    const linkSuccess = await this.linkArtifacts(ref, project.targetType, artifacts, project.files, config);
    return linkSuccess;
  }

  private async compileNativeQtFile(ref: QpmWorkspaceProjectRef, filePath: string): Promise<boolean> {
    const manifest = readQtProjectManifest(ref.absolutePath);
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) throw new Error('No valid Qt installation is selected for this project.');
    const profile = getActiveQtBuildProfile(manifest, this.buildMode);
    if (profile.system !== 'direct') {
      vscode.window.showErrorMessage(`Compile File is available only with the direct backend. Use the ${profile.system} build command for this project.`);
      return false;
    }
    const plan = createQtDirectBuildPlan(ref.absolutePath, this.buildMode, installation);
    for (const directory of [plan.generatedDirectory, plan.objectDirectory]) {
      if (!await this.ensureDirectory(directory, 'Qt generated build directory')) return false;
    }
    for (const step of plan.generationSteps) {
      if (generationStepIsOutdated(step)) {
        const ok = await this.spawnTool(step.toolPath, step.arguments, plan.projectDirectory, `${step.kind} ${path.basename(step.inputPath)}`);
        if (!ok) return false;
        if (!this.validateProducedFile(step.outputPath, `${step.kind} output`)) return false;
      }
    }
    const objectPath = qtObjectPathForSource(plan, filePath);
    const compiled = await this.spawnTool(installation.toolchain.cppCompilerPath!, qtCompileArguments(plan, filePath, objectPath), plan.projectDirectory, `Compile ${path.basename(filePath)}`);
    return compiled && this.validateProducedFile(objectPath, 'compiler output');
  }

  private async buildNativeQtProject(ref: QpmWorkspaceProjectRef, rebuild: boolean): Promise<boolean> {
    const manifest = readQtProjectManifest(ref.absolutePath);
    const installation = this.resolveQtInstallation(manifest);
    if (!installation) {
      vscode.window.showErrorMessage('No valid Qt installation is selected for this native Qt project.');
      return false;
    }

    const profile = getActiveQtBuildProfile(manifest, this.buildMode);
    if (profile.system !== 'direct') {
      this.output.appendLine(`[Qt ${profile.system === 'qmake' ? 'qmake' : 'CMake'}] Project: ${manifest.name}`);
      this.output.appendLine(`[Qt ${profile.system === 'qmake' ? 'qmake' : 'CMake'}] Qt kit: ${installation.label}`);
      const result = await this.qtBackends.build(ref.absolutePath, this.buildMode, installation, rebuild);
      if (result.success && getActiveQtDeployProfile(manifest).enabled) {
        if (!await this.deployNativeQtTarget(ref, manifest, installation, false)) return false;
      }
      return result.success;
    }
    const plan = createQtDirectBuildPlan(ref.absolutePath, this.buildMode, installation);

    this.output.appendLine(`[Qt Direct] Project: ${manifest.name}`);
    this.output.appendLine(`[Qt Direct] Qt kit: ${installation.label}`);
    this.output.appendLine(`[Qt Direct] Compiler: ${installation.toolchain.cppCompilerPath}`);
    this.output.appendLine(`[Qt Direct] Modules: ${plan.qtLibraries.join(', ')}`);
    this.output.appendLine(`[Qt Direct] Generated steps: ${plan.generationSteps.length}`);
    this.output.appendLine(`[Qt Direct] Target: ${plan.targetPath}`);
    for (const warning of plan.warnings) this.output.appendLine(`[Qt Direct] Warning: ${warning}`);
    this.output.appendLine('');

    const modeOutputDirectory = path.dirname(plan.targetPath);
    if (rebuild && fs.existsSync(modeOutputDirectory)) {
      try {
        fs.rmSync(modeOutputDirectory, { recursive: true, force: true });
        this.output.appendLine(`[Qt Direct] Removed previous mode output: ${modeOutputDirectory}`);
      } catch (error) {
        this.output.appendLine(`[Qt Direct] Warning: unable to remove ${modeOutputDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const [directory, label] of [[plan.generatedDirectory, 'Qt generated directory'], [plan.objectDirectory, 'Qt object directory'], [path.dirname(plan.targetPath), 'Qt target directory']] as Array<[string, string]>) {
      if (!await this.ensureDirectory(directory, label)) return false;
    }

    for (const step of plan.generationSteps) {
      if (!generationStepIsOutdated(step) && !rebuild) {
        this.output.appendLine(`[Qt Direct] Up to date: ${path.basename(step.outputPath)}`);
        continue;
      }
      const ok = await this.spawnTool(step.toolPath, step.arguments, plan.projectDirectory, `${step.kind} ${path.basename(step.inputPath)}`);
      if (!ok) return false;
      if (!this.validateProducedFile(step.outputPath, `${step.kind} output`)) return false;
    }

    if (plan.precompiledHeaderPath && plan.precompiledHeaderCopyPath && plan.precompiledHeaderOutputPath) {
      const sourceChanged = !fs.existsSync(plan.precompiledHeaderCopyPath) || fs.statSync(plan.precompiledHeaderPath).mtimeMs > fs.statSync(plan.precompiledHeaderCopyPath).mtimeMs;
      if (sourceChanged) fs.copyFileSync(plan.precompiledHeaderPath, plan.precompiledHeaderCopyPath);
      const pchOutdated = rebuild || !fs.existsSync(plan.precompiledHeaderOutputPath) || fs.statSync(plan.precompiledHeaderCopyPath).mtimeMs > fs.statSync(plan.precompiledHeaderOutputPath).mtimeMs;
      if (pchOutdated) {
        const ok = await this.spawnTool(installation.toolchain.cppCompilerPath!, qtPrecompiledHeaderArguments(plan), plan.projectDirectory, `Precompile ${path.basename(plan.precompiledHeaderPath)}`);
        if (!ok || !this.validateProducedFile(plan.precompiledHeaderOutputPath, 'precompiled header output')) return false;
      } else {
        this.output.appendLine(`[Qt Direct] Up to date: ${path.basename(plan.precompiledHeaderOutputPath)}`);
      }
    }

    let allSources = [...plan.sourceFiles, ...plan.generatedSourceFiles];
    if (plan.buildProfile.unityBuild && allSources.length > 1) {
      const unityPath = path.join(plan.generatedDirectory, 'qpm_unity.cpp');
      const unityContent = ['// Generated by Qt Project Manager unity build', ...allSources.map((entry) => `#include ${JSON.stringify(entry.replace(/\\/g, '/'))}`), ''].join('\n');
      if (!fs.existsSync(unityPath) || fs.readFileSync(unityPath, 'utf8') !== unityContent) fs.writeFileSync(unityPath, unityContent, 'utf8');
      allSources = [unityPath];
      this.output.appendLine(`[Qt Direct] Unity build source: ${unityPath}`);
    }
    if (allSources.length === 0) {
      vscode.window.showErrorMessage(`${manifest.name} has no C++ source file to compile.`);
      return false;
    }
    // GCC/Clang .d files provide the exact per-source include graph. Generated sources
    // are invalidated by their own timestamps, so no project-wide header list is needed here.
    const generatedDependencies: string[] = [];
    const sourceObjectFiles = allSources.map((sourcePath) => qtObjectPathForSource(plan, sourcePath));
    const compileItems = allSources.map((sourcePath, index) => ({ sourcePath, objectPath: sourceObjectFiles[index] }))
      .filter((item) => sourceNeedsCompilation(item.sourcePath, item.objectPath, generatedDependencies, rebuild));
    for (const sourcePath of allSources.filter((entry) => !compileItems.some((item) => item.sourcePath === entry))) {
      this.output.appendLine(`[Qt Direct] Up to date: ${path.basename(sourcePath)}`);
    }
    const jobs = plan.buildProfile.parallelJobs > 0 ? plan.buildProfile.parallelJobs : Math.max(1, os.cpus().length);
    const compiled = await runWithConcurrency(compileItems, jobs, async (item) => {
      const args = qtCompileArguments(plan, item.sourcePath, item.objectPath);
      const ok = await this.spawnTool(installation.toolchain.cppCompilerPath!, args, plan.projectDirectory, `Compile ${path.basename(item.sourcePath)}`);
      return ok && this.validateProducedFile(item.objectPath, 'compiler output');
    });
    if (!compiled) return false;

    const objectFiles = [...sourceObjectFiles, ...plan.additionalObjectFiles];

    if (manifest.kind === 'static-library') {
      const archiver = installation.toolchain.archiverPath || 'ar';
      const archived = await this.spawnTool(archiver, ['rcs', plan.targetPath, ...objectFiles], plan.projectDirectory, `Archive ${path.basename(plan.targetPath)}`);
      return archived && this.validateProducedFile(plan.targetPath, 'archive output');
    }

    const rawLinkArguments = qtLinkArguments(plan, objectFiles);
    const responseFilePath = path.join(plan.objectDirectory, 'qpm_link.rsp');
    const useResponseFile = plan.buildProfile.useResponseFiles && shouldUseGnuResponseFile(rawLinkArguments);
    let linkArguments = rawLinkArguments;
    if (useResponseFile) {
      linkArguments = createGnuResponseFileArguments(rawLinkArguments, responseFilePath);
      this.output.appendLine(`[Qt Direct] Link response file: ${responseFilePath} (${estimateGnuArgumentLength(rawLinkArguments)} characters)`);
    } else if (fs.existsSync(responseFilePath)) {
      // Remove stale response files from previous builds so the build directory
      // reflects the command line that was actually used.
      try { fs.rmSync(responseFilePath, { force: true }); } catch { /* best effort */ }
    }
    const linked = await this.spawnTool(installation.toolchain.cppCompilerPath!, linkArguments, plan.projectDirectory, `Link ${path.basename(plan.targetPath)}`);
    if (!linked || !this.validateProducedFile(plan.targetPath, 'linker output')) return false;
    if (plan.importLibraryPath && !this.validateProducedFile(plan.importLibraryPath, 'import library output')) return false;
    if (getActiveQtDeployProfile(manifest).enabled) {
      this.output.appendLine('[Qt Direct] Automatic Qt runtime deployment enabled.');
      if (!await this.deployNativeQtTarget(ref, manifest, installation, false)) return false;
    }
    return true;
  }

  private async linkArtifacts(ref: QpmWorkspaceProjectRef, targetType: string, artifacts: BuildArtifacts, files: QpmProjectFile[], config: GenericCompilerConfiguration): Promise<boolean> {
    if (targetType === 'Static Library') {
      const args = ['rcs', artifacts.targetPath, ...artifacts.objectFiles];
      return await this.spawnTool(config.archiverPath || 'ar', args, path.dirname(ref.absolutePath), `Archive ${path.basename(artifacts.targetPath)}`);
    }

    const fileLibraries = files.filter((file) => !file.excluded && isLibrary(file.absolutePath)).map((file) => file.absolutePath);
    const diagnostics = this.diagnoseLinkedLibraries(fileLibraries, artifacts.objectFiles, config);
    if (!diagnostics.compatible) {
      diagnostics.messages.forEach((message) => this.output.appendLine(message));
      this.output.appendLine('');
      vscode.window.showErrorMessage('Linked library architecture mismatch detected. Open the Qt Project Manager output channel for details.');
      return false;
    }
    diagnostics.messages.forEach((message) => this.output.appendLine(message));
    if (diagnostics.messages.length > 0) {
      this.output.appendLine('');
    }

    const sdlPlan = this.resolveSdlPlan(ref, files, targetType);
    if (sdlPlan) {
      this.output.appendLine(`[Qt/C++ SDL] SDK: ${sdlPlan.rootPath}`);
      this.output.appendLine(`[Qt/C++ SDL] Version: ${sdlPlan.version} · Packages: ${sdlPlan.packages.join(', ')} · runtime: ${sdlPlan.runtimeMode}`);
      if (sdlPlan.architecture) {
        this.output.appendLine(`[Qt/C++ SDL] SDK architecture: ${sdlPlan.architecture}`);
      }
      this.output.appendLine('');
    }

    const args = [
      ...this.modeFlags(config),
      ...this.runtimeLinkFlags(config, targetType, sdlPlan),
      ...(targetType === 'Dynamic Link Library' ? ['-shared'] : []),
      ...artifacts.objectFiles,
      ...fileLibraries,
      ...config.libraryPaths.flatMap((value) => ['-L', resolveAgainstProject(value, ref.absolutePath)]),
      ...(sdlPlan?.linkArgs ?? []),
      ...config.libraries.map((name) => name.startsWith('-l') ? name : `-l${name}`),
      ...config.linkerFlags,
      '-o', artifacts.targetPath
    ];
    const success = await this.spawnTool(config.cppCompilerPath || 'g++', args, path.dirname(ref.absolutePath), `Link ${path.basename(artifacts.targetPath)}`);
    if (success) {
      this.deployToolchainRuntimeDlls(artifacts.targetPath, config);
      this.deploySdlRuntimeDlls(artifacts.targetPath, sdlPlan);
    }
    return success;
  }

  private diagnoseLinkedLibraries(libraryPaths: string[], objectPaths: string[], config: GenericCompilerConfiguration): { compatible: boolean; messages: string[] } {
    const messages: string[] = [];
    const objectArch = objectPaths.map((value) => inspectBinaryArchitecture(value).arch).find(Boolean);
    let expectedArch = objectArch
      ? { ...objectArch, reason: 'compiled object file architecture' }
      : inferRequestedArchitecture(config.cppCompilerPath || 'g++', this.modeFlags(config));
    if (expectedArch) {
      messages.push(`[Qt/C++] Link target architecture: ${expectedArch.label} (${expectedArch.reason}).`);
    }

    let compatible = true;
    for (const libraryPath of libraryPaths) {
      const libraryInfo = inspectBinaryArchitecture(libraryPath);
      if (!libraryInfo.arch) {
        if (path.extname(libraryPath).toLowerCase() === '.lib') {
          messages.push(`[Qt/C++] Note: ${path.basename(libraryPath)} is a .lib file. If it is an MSVC import library, MinGW may require a matching architecture or a MinGW import library generated with dlltool.`);
        }
        continue;
      }

      messages.push(`[Qt/C++] Linked library: ${path.basename(libraryPath)} -> ${libraryInfo.arch.label}${libraryInfo.kind ? ` ${libraryInfo.kind}` : ''}.`);
      if (expectedArch && libraryInfo.arch.id !== expectedArch.id) {
        compatible = false;
        messages.push(`[Qt/C++] ERROR: ${path.basename(libraryPath)} is ${libraryInfo.arch.label}, but the active linker/toolchain targets ${expectedArch.label}.`);
        messages.push(`[Qt/C++]        Use a ${libraryInfo.arch.label} compiler/toolchain and build mode, or rebuild the DLL/import library for ${expectedArch.label}.`);
      }
    }

    if (compatible && expectedArch?.id === 'x86') {
      const hasLib = libraryPaths.some((value) => path.extname(value).toLowerCase() === '.lib');
      if (hasLib) {
        messages.push('[Qt/C++] Note: 32-bit MinGW expects 32-bit import symbols. A 64-bit or MSVC-only .lib can produce undefined references such as _imp__FunctionName.');
      }
    }
    return { compatible, messages };
  }

  private compileArguments(sourcePath: string, objectPath: string, ref: QpmWorkspaceProjectRef, projectFiles: QpmProjectFile[], config: GenericCompilerConfiguration): string[] {
    const sdlPlan = this.resolveSdlPlan(ref, projectFiles, 'Executable');
    const includePaths = unique([
      path.dirname(ref.absolutePath),
      ...projectFiles.filter((file) => isHeader(file.absolutePath)).map((file) => path.dirname(file.absolutePath)),
      ...config.includePaths.map((value) => resolveAgainstProject(value, ref.absolutePath)),
      ...(sdlPlan?.includeDirectories ?? [])
    ]);
    const standard = isCSource(sourcePath) ? config.cStandard : config.cppStandard;
    return [
      '-c', sourcePath,
      ...this.modeFlags(config),
      ...this.warningFlags(config),
      ...(standard && standard !== 'auto' ? [`-std=${standard}`] : []),
      ...config.defineSymbols.map((name) => `-D${name}`),
      ...includePaths.flatMap((value) => ['-I', value]),
      ...(sdlPlan?.compileFlags ?? []),
      ...config.compilerFlags,
      ...(isCSource(sourcePath) ? config.cCompilerFlags : config.cppCompilerFlags),
      '-o', objectPath
    ];
  }

  private modeFlags(config: GenericCompilerConfiguration): string[] {
    const flags: string[] = [];
    const debugMode = this.buildMode === 'debug' || this.buildMode === 'debug64';

    if (config.debugInformation === 'mode-default') {
      if (debugMode) {
        flags.push('-g');
      }
    } else if (config.debugInformation === 'g') {
      flags.push('-g');
    } else if (config.debugInformation === 'g3') {
      flags.push('-g3');
    }

    if (config.optimizationLevel === 'mode-default') {
      flags.push(debugMode ? '-O0' : '-O2');
    } else if (config.optimizationLevel && config.optimizationLevel !== 'none') {
      flags.push(`-${config.optimizationLevel}`);
    }

    const architecture = config.architectureMode || (config.useBuildModeArchitectureFlags ? 'from-build-mode' : 'auto');
    const isExplicit64Mode = this.buildMode === 'debug64' || this.buildMode === 'release64';
    if (architecture === 'from-build-mode') {
      flags.push(isExplicit64Mode ? '-m64' : '-m32');
    } else if (architecture === 'm32' || architecture === 'm64') {
      flags.push(`-${architecture}`);
    } else if (architecture === 'auto' && isExplicit64Mode) {
      // A build mode named Debug x64 / Release x64 must produce a 64-bit target
      // even when the compiler path is entered as a plain command such as gcc/g++.
      // Without this, VS Code can still resolve gcc/g++ from an older 32-bit PATH.
      flags.push('-m64');
    }
    return flags;
  }

  private warningFlags(config: GenericCompilerConfiguration): string[] {
    switch (config.warningLevel) {
      case 'wall':
        return ['-Wall'];
      case 'wall-extra':
        return ['-Wall', '-Wextra'];
      case 'wall-extra-pedantic':
        return ['-Wall', '-Wextra', '-Wpedantic'];
      case 'all':
        return ['-Wall', '-Wextra', '-Wpedantic', '-Wconversion'];
      default:
        return [];
    }
  }

  private compilerForSource(sourcePath: string, config: GenericCompilerConfiguration): string {
    return isCSource(sourcePath) ? config.cCompilerPath || 'gcc' : config.cppCompilerPath || 'g++';
  }

  private resolveArtifacts(ref: QpmWorkspaceProjectRef, targetType?: string): BuildArtifacts {
    if (isQtProjectManifestPath(ref.absolutePath)) {
      return { targetPath: qtTargetPath(ref.absolutePath, this.buildMode), objectDirectory: qtObjectDirectory(ref.absolutePath, this.buildMode), objectFiles: [] };
    }
    const objectDirectory = path.join(path.dirname(ref.absolutePath), this.getCompilerConfiguration().outputDirectory || 'build', ref.name, this.buildMode, 'obj');
    return { targetPath: this.resolveTargetPath(ref, targetType), objectDirectory, objectFiles: [] };
  }

  private resolveTargetPath(ref: QpmWorkspaceProjectRef, targetType?: string): string {
    if (isQtProjectManifestPath(ref.absolutePath)) return qtTargetPath(ref.absolutePath, this.buildMode);
    const configured = this.parser.getTargetPath(ref.absolutePath, this.buildMode);
    if (configured) {
      return normalizeRuntimePath(configured);
    }
    const extension = targetType === 'Dynamic Link Library' ? '.dll' : targetType === 'Static Library' ? '.a' : '.exe';
    return path.join(path.dirname(ref.absolutePath), this.getCompilerConfiguration().outputDirectory || 'build', `${ref.name}${extension}`);
  }

  private objectPathForSource(sourcePath: string, projectPath: string, objectDirectory: string): string {
    const relative = path.relative(path.dirname(projectPath), sourcePath).replace(/[^A-Za-z0-9_.-]+/g, '_');
    const hash = crypto.createHash('sha1').update(path.resolve(sourcePath).toLowerCase()).digest('hex').slice(0, 8);
    return path.join(objectDirectory, `${relative}.${hash}.o`);
  }

  private beginOutput(label: string): void {
    this.output.clear();
    this.output.show(true);
    this.output.appendLine(`[Qt/C++] ${label} started`);
    this.output.appendLine(`[Qt/C++] Build mode: ${this.buildMode}`);
    this.output.appendLine('');
  }

  private validateProducedFile(filePath: string, label: string): boolean {
    if (fs.existsSync(filePath)) return true;
    const message = `${label} was not created: ${filePath}`;
    this.output.appendLine(`[Qt Direct] ERROR: ${message}`);
    vscode.window.showErrorMessage(`${message}. Open the Qt Project Manager output channel for details.`);
    return false;
  }

  private async spawnTool(executable: string, args: string[], cwd: string, label: string): Promise<boolean> {
    const launch = resolveToolLaunch(executable);
    this.output.appendLine(`[Qt/C++] ${label}`);
    this.output.appendLine(`[Qt/C++] Tool: ${executable}`);
    if (launch.note) {
      this.output.appendLine(`[Qt/C++] ${launch.note}`);
    }
    if (launch.warning) {
      this.output.appendLine(`[Qt/C++] ${launch.warning}`);
    }
    this.output.appendLine(`[Qt/C++] Arguments: ${args.map(renderArgument).join(' ')}`);
    this.output.appendLine('');
    return await new Promise<boolean>((resolve) => {
      const child = spawn(launch.executable, args, { cwd, windowsHide: true, shell: false, env: launch.env });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => {
        this.output.appendLine(`\n[Qt/C++] Unable to start ${executable}: ${error.message}`);
        vscode.window.showErrorMessage(`Unable to start ${executable}: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        this.output.appendLine('');
        this.output.appendLine(`[Qt/C++] ${path.basename(executable)} exited with code ${String(code)}.`);
        if (code !== 0) {
          vscode.window.showErrorMessage(`${label} failed. Open the Qt Project Manager output channel for details.`);
        }
        resolve(code === 0);
      });
    });
  }


  private async ensureDirectory(directoryPath: string, label: string, showUserMessage = true): Promise<boolean> {
    const normalized = normalizeRuntimePath(directoryPath);
    const blockingPath = findBlockingPathSegment(normalized);
    if (blockingPath) {
      const message = `Cannot create ${label}: a file already exists in the directory path: ${blockingPath}`;
      this.output.appendLine(`[Qt/C++] ERROR: ${message}`);
      if (showUserMessage) {
        vscode.window.showErrorMessage(message);
      }
      return false;
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        fs.mkdirSync(normalized, { recursive: true });
        return true;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        const code = nodeError.code || 'ERROR';
        const message = nodeError.message || String(error);
        if (attempt < 5 && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
          this.output.appendLine(`[Qt/C++] ${code} while creating ${label}; retry ${attempt}/5: ${normalized}`);
          await delay(180 * attempt);
          continue;
        }
        this.output.appendLine(`[Qt/C++] ERROR: unable to create ${label}: ${normalized}`);
        this.output.appendLine(`[Qt/C++] ${code}: ${message}`);
        if (/\\OneDrive\\|\/OneDrive\//i.test(normalized)) {
          this.output.appendLine('[Qt/C++] Hint: the build directory is inside OneDrive. If Windows locks the directory, move the project/build output to a local non-synchronized folder or pause OneDrive synchronization during the build.');
        }
        if (showUserMessage) {
          vscode.window.showErrorMessage(`Unable to create ${label}. Open the Qt Project Manager output channel for details.`);
        }
        return false;
      }
    }
    return false;
  }

  private resolveLocalObjectDirectory(ref: QpmWorkspaceProjectRef, config: GenericCompilerConfiguration): string | undefined {
    if (!config.useLocalBuildCacheForOneDrive && !isInsideOneDrive(path.dirname(ref.absolutePath))) {
      return undefined;
    }
    const base = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'QpmProjectManager', 'BuildCache')
      : path.join(os.tmpdir(), 'qpm-build-cache');
    const projectHash = crypto.createHash('sha1').update(path.resolve(ref.absolutePath).toLowerCase()).digest('hex').slice(0, 16);
    return path.join(base, projectHash, ref.name.replace(/[^A-Za-z0-9_.-]+/g, '_'), this.buildMode, 'obj');
  }

  private getProjectRunSettings(ref: QpmWorkspaceProjectRef): { arguments: string; workingDirectory: string; environmentOptions: string; externalProcessPath: string } {
    const legacy = this.projectSettings.getSettings(ref).run;
    if (!isQtProjectManifestPath(ref.absolutePath)) return legacy;
    try {
      const profile = getActiveQtRunProfile(readQtProjectManifest(ref.absolutePath));
      const environmentOptions = Object.entries(profile.environment).map(([key, value]) => `${key}=${value}`).join(';');
      return {
        arguments: profile.arguments || legacy.arguments,
        workingDirectory: profile.workingDirectory || legacy.workingDirectory,
        environmentOptions: environmentOptions || legacy.environmentOptions,
        externalProcessPath: legacy.externalProcessPath
      };
    } catch {
      return legacy;
    }
  }

  private resolveQtInstallation(manifest: QtProjectManifest): QpmQtInstallation | undefined {
    const installation = this.qtInstallations.getActive(getQtInstallationPreference(manifest, this.buildMode));
    if (!installation) {
      return undefined;
    }
    const kit = getQtKitProfileForBuild(manifest, this.buildMode);
    const family = kit.compilerFamily === 'mingw' || kit.compilerFamily === 'msvc' || kit.compilerFamily === 'clang' || kit.compilerFamily === 'gcc'
      ? kit.compilerFamily
      : installation.compilerFamily;
    const architecture = kit.architecture === 'x86' || kit.architecture === 'x64'
      ? kit.architecture
      : installation.architecture;
    return {
      ...installation,
      compilerFamily: family,
      architecture,
      qmakePath: kit.qmakePath || installation.qmakePath,
      cmakePath: kit.cmakePath || installation.cmakePath,
      vcVarsPath: kit.environmentScript || installation.vcVarsPath,
      toolchain: {
        ...installation.toolchain,
        family,
        architecture,
        detectedArchitecture: kit.architecture === 'x86' || kit.architecture === 'x64' ? kit.architecture : installation.toolchain.detectedArchitecture,
        targetTriple: kit.compilerTargetTriple || installation.toolchain.targetTriple,
        compilerVersion: kit.compilerVersion || installation.toolchain.compilerVersion,
        compatibility: kit.compatibility || installation.toolchain.compatibility,
        diagnostic: kit.diagnostic || installation.toolchain.diagnostic,
        cCompilerPath: kit.cCompilerPath || installation.toolchain.cCompilerPath,
        cppCompilerPath: kit.compilerPath || installation.toolchain.cppCompilerPath,
        debuggerPath: kit.debuggerPath || installation.toolchain.debuggerPath,
        makePath: kit.buildToolPath || installation.toolchain.makePath,
        environmentScript: kit.environmentScript || installation.toolchain.environmentScript,
        binDir: kit.compilerPath ? path.dirname(kit.compilerPath) : installation.toolchain.binDir,
        source: kit.compilerPath ? 'configured' : installation.toolchain.source
      }
    };
  }

  private getRuntimeCompilerConfiguration(ref: QpmWorkspaceProjectRef): GenericCompilerConfiguration {
    const config = this.getCompilerConfiguration();
    if (!isQtProjectManifestPath(ref.absolutePath)) return config;
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const installation = this.resolveQtInstallation(manifest);
      if (!installation) return config;
      const kit = getQtKitProfileForBuild(manifest, this.buildMode);
      return {
        ...config,
        cCompilerPath: kit.cCompilerPath || installation.toolchain.cCompilerPath || config.cCompilerPath,
        cppCompilerPath: kit.compilerPath || installation.toolchain.cppCompilerPath || config.cppCompilerPath,
        archiverPath: installation.toolchain.archiverPath || config.archiverPath,
        debuggerPath: kit.debuggerPath || installation.toolchain.debuggerPath || config.debuggerPath,
        architectureMode: 'auto',
        useBuildModeArchitectureFlags: false,
        sdl: { ...config.sdl, enabled: 'off' }
      };
    } catch (error) {
      this.output.appendLine(`[Qt Direct] Unable to resolve runtime toolchain: ${error instanceof Error ? error.message : String(error)}`);
      return config;
    }
  }

  private createRuntimeEnvironment(base: NodeJS.ProcessEnv, config: GenericCompilerConfiguration, executablePath: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...base };
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    const existing = env[pathKey] ?? '';
    const directories = this.runtimeSearchDirectories(config, executablePath);
    if (directories.length > 0) {
      env[pathKey] = `${directories.join(path.delimiter)}${path.delimiter}${existing}`;
    }
    return env;
  }

  private debugEnvironmentFromProcessEnv(env: NodeJS.ProcessEnv): Array<{ name: string; value: string }> {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    return [{ name: pathKey, value: env[pathKey] ?? '' }];
  }

  private runtimeSearchDirectories(config: GenericCompilerConfiguration, executablePath: string): string[] {
    const ref = this.workspaces.activeProjectRef;
    const project = ref?.exists ? this.workspaces.getProject(ref) : undefined;
    const sdlPlan = ref?.exists && project ? this.resolveSdlPlan(ref, project.files, project.targetType) : undefined;
    let qtBinDirectory: string | undefined;
    if (ref?.exists && isQtProjectManifestPath(ref.absolutePath)) {
      try {
        const manifest = readQtProjectManifest(ref.absolutePath);
        qtBinDirectory = this.resolveQtInstallation(manifest)?.binDir;
      } catch { /* ignored */ }
    }
    return unique([
      path.dirname(executablePath),
      ...(qtBinDirectory ? [qtBinDirectory] : []),
      ...this.toolchainBinDirectories(config),
      ...(sdlPlan?.binaryDirectory ? [sdlPlan.binaryDirectory] : []),
      ...this.linkedDllDirectories(path.dirname(executablePath))
    ]);
  }

  private linkedDllDirectories(projectDirectory: string): string[] {
    try {
      return fs.readdirSync(projectDirectory)
        .filter((name) => /\.dll$/i.test(name))
        .map(() => projectDirectory);
    } catch {
      return [];
    }
  }

  private runtimeLinkFlags(config: GenericCompilerConfiguration, targetType: string, sdlPlan?: ReturnType<typeof createSdlBuildPlan>): string[] {
    if (config.runtimeDependencyMode !== 'static-link' || targetType === 'Static Library') {
      return [];
    }

    const flags = ['-static-libgcc', '-static-libstdc++'];
    if (!sdlPlan || sdlPlan.runtimeMode === 'static-link') {
      flags.push('-static');
    } else {
      const winpthreadStatic = this.findToolchainStaticLibrary(config, 'libwinpthread.a');
      if (winpthreadStatic) {
        flags.push('-Wl,-Bstatic', '-lwinpthread', '-Wl,-Bdynamic');
      }
    }
    this.output.appendLine(`[Qt/C++] Toolchain runtime handling: static-link flags ${flags.join(' ')}.`);
    return flags;
  }

  private findToolchainStaticLibrary(config: GenericCompilerConfiguration, libraryName: string): string | undefined {
    for (const binDirectory of this.toolchainBinDirectories(config)) {
      const rootDirectory = path.basename(binDirectory).toLowerCase() === 'bin' ? path.dirname(binDirectory) : binDirectory;
      const candidates = [
        path.join(rootDirectory, 'lib', libraryName),
        path.join(rootDirectory, 'x86_64-w64-mingw32', 'lib', libraryName),
        path.join(rootDirectory, 'i686-w64-mingw32', 'lib', libraryName)
      ];
      const found = candidates.find((candidate) => fs.existsSync(candidate));
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private toolchainBinDirectories(config: GenericCompilerConfiguration): string[] {
    const candidates = [config.cppCompilerPath, config.cCompilerPath, config.debuggerPath]
      .map((value) => resolveExecutableFromPath(value || ''))
      .filter(Boolean)
      .map((value) => path.dirname(normalizeRuntimePath(value)))
      .filter((value) => fs.existsSync(value));
    return unique(candidates);
  }

  private deployToolchainRuntimeDlls(targetPath: string, config: GenericCompilerConfiguration): void {
    if (process.platform !== 'win32') {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    if (!fs.existsSync(targetDirectory)) {
      return;
    }

    const runtimeSources = this.collectToolchainRuntimeDlls(targetPath, config);

    if (config.runtimeDependencyMode !== 'copy-dlls') {
      if (config.cleanRuntimeDllsOnDeploy) {
        this.cleanStaleRuntimeDlls(targetDirectory, new Map());
      }
      this.output.appendLine(`[Qt/C++] Toolchain runtime DLL deployment: disabled (${config.runtimeDependencyMode}).`);
      return;
    }

    if (config.cleanRuntimeDllsOnDeploy) {
      this.cleanStaleRuntimeDlls(targetDirectory, runtimeSources);
    }

    let copied = 0;
    let unchanged = 0;
    const deployedNames: string[] = [];
    for (const sourcePath of runtimeSources.values()) {
      const destinationPath = path.join(targetDirectory, path.basename(sourcePath));
      try {
        if (shouldCopyRuntimeDll(sourcePath, destinationPath)) {
          fs.copyFileSync(sourcePath, destinationPath);
          copied++;
        } else {
          unchanged++;
        }
        deployedNames.push(path.basename(sourcePath));
      } catch (error) {
        this.output.appendLine(`[Qt/C++] Warning: unable to deploy toolchain runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    writeRuntimeDeployManifest(targetDirectory, deployedNames);
    if (runtimeSources.size > 0) {
      this.output.appendLine(`[Qt/C++] Toolchain runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
      this.output.appendLine(`[Qt/C++] Toolchain runtime DLLs: ${[...runtimeSources.values()].map((value) => path.basename(value)).join(', ')}`);
    } else {
      this.output.appendLine('[Qt/C++] Toolchain runtime DLL deployment: no compiler/runtime DLL detected beside the selected toolchain.');
    }
  }

  private collectToolchainRuntimeDlls(targetPath: string, config: GenericCompilerConfiguration): Map<string, string> {
    const binDirectories = this.toolchainBinDirectories(config);
    const availableDlls = indexToolchainDlls(binDirectories);
    const runtimeSources = new Map<string, string>();

    const addRuntimeSource = (dllName: string): boolean => {
      const key = dllName.toLowerCase();
      if (runtimeSources.has(key) || !isToolchainRuntimeImportCandidate(dllName)) {
        return false;
      }
      const sourcePath = availableDlls.get(key);
      if (!sourcePath) {
        return false;
      }
      runtimeSources.set(key, sourcePath);
      return true;
    };

    for (const [name, sourcePath] of availableDlls) {
      if (isKnownToolchainRuntimeDllName(name)) {
        runtimeSources.set(name, sourcePath);
      }
    }

    const queue = fs.existsSync(targetPath) ? [targetPath] : [];
    const visited = new Set<string>();
    while (queue.length > 0 && visited.size < 96) {
      const current = queue.shift()!;
      const normalized = normalizeRuntimePath(current).toLowerCase();
      if (visited.has(normalized)) {
        continue;
      }
      visited.add(normalized);
      for (const importedName of readImportedDllNames(current)) {
        if (addRuntimeSource(importedName)) {
          const dependencySource = runtimeSources.get(importedName.toLowerCase());
          if (dependencySource) {
            queue.push(dependencySource);
          }
        }
      }
    }

    return runtimeSources;
  }

  private deploySdlRuntimeDlls(targetPath: string, sdlPlan: ReturnType<typeof createSdlBuildPlan> | undefined): void {
    if (!sdlPlan || sdlPlan.runtimeMode !== 'copy-dlls' || sdlPlan.runtimeDlls.length === 0) {
      return;
    }
    const targetDirectory = path.dirname(targetPath);
    let copied = 0;
    let unchanged = 0;
    for (const sourcePath of sdlPlan.runtimeDlls) {
      const destinationPath = path.join(targetDirectory, path.basename(sourcePath));
      try {
        if (shouldCopyRuntimeDll(sourcePath, destinationPath)) {
          fs.copyFileSync(sourcePath, destinationPath);
          copied++;
        } else {
          unchanged++;
        }
      } catch (error) {
        this.output.appendLine(`[Qt/C++ SDL] Warning: unable to deploy SDL runtime DLL ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.output.appendLine(`[Qt/C++ SDL] Runtime DLL deployment: ${copied} copied, ${unchanged} already up to date.`);
  }

  private resolveSdlPlan(ref: QpmWorkspaceProjectRef, files: QpmProjectFile[], targetType: string): ReturnType<typeof createSdlBuildPlan> | undefined {
    const config = this.getCompilerConfiguration();
    const preferredArchitecture = inferRequestedArchitecture(config.cppCompilerPath || config.cCompilerPath || 'g++', this.modeFlags(config))?.id;
    return createSdlBuildPlan(config.sdl, path.dirname(ref.absolutePath), files.map((file) => file.absolutePath), targetType, preferredArchitecture);
  }

  private cleanStaleRuntimeDlls(targetDirectory: string, runtimeSources: Map<string, string>): void {
    let removed = 0;
    let refreshed = 0;
    try {
      const manifestNames = readRuntimeDeployManifest(targetDirectory);
      for (const name of fs.readdirSync(targetDirectory)) {
        const lower = name.toLowerCase();
        const wasManaged = manifestNames.has(lower) || isKnownToolchainRuntimeDllName(name);
        if (!wasManaged) {
          continue;
        }
        const destinationPath = path.join(targetDirectory, name);
        const sourcePath = runtimeSources.get(lower);
        if (!sourcePath) {
          fs.rmSync(destinationPath, { force: true });
          removed++;
          continue;
        }
        const sourceArch = inspectBinaryArchitecture(sourcePath).arch;
        const destinationArch = inspectBinaryArchitecture(destinationPath).arch;
        if (sourceArch && destinationArch && sourceArch.id !== destinationArch.id) {
          fs.rmSync(destinationPath, { force: true });
          refreshed++;
        }
      }
    } catch (error) {
      this.output.appendLine(`[Qt/C++] Warning: unable to clean deployed toolchain runtime DLLs: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (removed > 0 || refreshed > 0) {
      this.output.appendLine(`[Qt/C++] Toolchain runtime DLL cleanup: ${removed} stale removed, ${refreshed} architecture-mismatched removed before redeploy.`);
    }
  }

  private getCompilerConfiguration(): GenericCompilerConfiguration {
    const config = vscode.workspace.getConfiguration('qpm');
    return {
      cCompilerPath: config.get<string>('cCompilerPath', 'gcc'),
      cppCompilerPath: config.get<string>('cppCompilerPath', 'g++'),
      archiverPath: config.get<string>('archiverPath', 'ar'),
      debuggerPath: config.get<string>('debuggerPath', 'gdb'),
      outputDirectory: config.get<string>('outputDirectory', 'build'),
      cStandard: config.get<string>('cStandard', 'auto'),
      cppStandard: config.get<string>('cppStandard', 'c++17'),
      warningLevel: config.get<string>('warningLevel', 'wall-extra'),
      optimizationLevel: config.get<string>('optimizationLevel', 'mode-default'),
      debugInformation: config.get<string>('debugInformation', 'mode-default'),
      architectureMode: config.get<string>('architectureMode', config.get<boolean>('useBuildModeArchitectureFlags', false) ? 'from-build-mode' : 'auto'),
      compilerFlags: config.get<string[]>('compilerFlags', []),
      cCompilerFlags: config.get<string[]>('cCompilerFlags', []),
      cppCompilerFlags: config.get<string[]>('cppCompilerFlags', []),
      linkerFlags: config.get<string[]>('linkerFlags', []),
      includePaths: config.get<string[]>('includePaths', []),
      libraryPaths: config.get<string[]>('libraryPaths', []),
      libraries: config.get<string[]>('libraries', []),
      defineSymbols: config.get<string[]>('defineSymbols', []),
      useBuildModeArchitectureFlags: config.get<boolean>('useBuildModeArchitectureFlags', false),
      deployRuntimeDlls: config.get<string>('deployRuntimeDlls', 'auto'),
      runtimeDependencyMode: normalizeRuntimeDependencyMode(config.get<string>('runtimeDependencyMode', ''), config.get<string>('deployRuntimeDlls', 'auto')),
      cleanRuntimeDllsOnDeploy: config.get<boolean>('cleanRuntimeDllsOnDeploy', true),
      useLocalBuildCacheForOneDrive: config.get<boolean>('useLocalBuildCacheForOneDrive', true),
      sdl: {
        enabled: normalizeSdlEnabled(config.get<string>('sdlEnabled', 'auto')),
        version: normalizeSdlVersion(config.get<string>('sdlVersion', 'auto')),
        rootPath: config.get<string>('sdlRootPath', '').trim(),
        packages: config.get<string[]>('sdlPackages', ['SDL2']),
        runtimeMode: normalizeSdlRuntimeMode(config.get<string>('sdlRuntimeMode', 'copy-dlls')),
        subsystem: normalizeSdlSubsystem(config.get<string>('sdlSubsystem', 'windows')),
        copyAllRuntimeDlls: config.get<boolean>('sdlCopyAllRuntimeDlls', true)
      }
    };
  }
}


function normalizeRuntimeDependencyMode(value: string | undefined, legacyValue: string | undefined): QpmRuntimeDependencyMode {
  if (value === 'copy-dlls' || value === 'path-only' || value === 'static-link') {
    return value;
  }
  if (legacyValue === 'never') {
    return 'path-only';
  }
  if (legacyValue === 'static-link') {
    return 'static-link';
  }
  return 'copy-dlls';
}

function normalizeSdlEnabled(value: string | undefined): QpmSdlConfiguration['enabled'] {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function normalizeSdlVersion(value: string | undefined): QpmSdlConfiguration['version'] {
  return value === 'SDL2' || value === 'SDL3' || value === 'auto' ? value : 'auto';
}

function normalizeSdlRuntimeMode(value: string | undefined): QpmSdlConfiguration['runtimeMode'] {
  return value === 'copy-dlls' || value === 'path-only' || value === 'static-link' ? value : 'copy-dlls';
}

function normalizeSdlSubsystem(value: string | undefined): QpmSdlConfiguration['subsystem'] {
  return value === 'console' || value === 'windows' ? value : 'windows';
}


interface ToolLaunch {
  executable: string;
  env?: NodeJS.ProcessEnv;
  note?: string;
  warning?: string;
}

const toolLaunchCache = new Map<string, ToolLaunch>();

function resolveToolLaunch(executable: string): ToolLaunch {
  if (process.platform !== 'win32' || !/\s/.test(executable) || !isGccLikeTool(executable)) {
    return { executable };
  }

  const normalized = normalizeRuntimePath(executable);
  if (toolLaunchCache.has(normalized)) {
    return toolLaunchCache.get(normalized) ?? { executable };
  }

  const shortened = getWindowsShortPath(normalized);
  if (shortened && shortened !== normalized && !/\s/.test(shortened) && fs.existsSync(shortened)) {
    const launch = { executable: shortened, note: `Windows no-space tool path: ${shortened}` };
    toolLaunchCache.set(normalized, launch);
    return launch;
  }

  const aliased = createNoSpaceToolchainAlias(normalized);
  if (aliased && !/\s/.test(aliased) && fs.existsSync(aliased)) {
    const launch = { executable: aliased, note: `Windows no-space toolchain alias: ${aliased}` };
    toolLaunchCache.set(normalized, launch);
    return launch;
  }

  const binDirectory = path.dirname(normalized);
  const basename = path.basename(normalized);
  const env = makePathPrependedEnvironment(binDirectory);
  const launch = {
    executable: basename,
    env,
    note: `Windows PATH launch for space-containing GCC path: ${basename} with ${binDirectory} prepended to PATH.`,
    warning: 'Warning: no short path or junction alias could be created for this MinGW/GCC installation. If ld still reports C:/Program Files split into two paths, move or reinstall the toolchain to a path without spaces such as C:\\mingw64 or C:\\msys64\\mingw64.'
  };
  toolLaunchCache.set(normalized, launch);
  return launch;
}

function makePathPrependedEnvironment(directory: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  env[pathKey] = `${directory}${path.delimiter}${env[pathKey] ?? ''}`;
  return env;
}

function getWindowsShortPath(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    const command = `for %I in ("${filePath.replace(/"/g, '""')}") do @echo %~sI`;
    const output = execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 2000
    }).trim();
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop();
  } catch {
    return undefined;
  }
}


function createNoSpaceToolchainAlias(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const binDirectory = path.dirname(filePath);
  const rootDirectory = path.basename(binDirectory).toLowerCase() === 'bin' ? path.dirname(binDirectory) : binDirectory;
  if (!/\s/.test(rootDirectory)) {
    return undefined;
  }

  const aliasBase = path.join(os.tmpdir(), 'qpm-toolchain-aliases');
  if (/\s/.test(aliasBase)) {
    return undefined;
  }

  const safeName = path.basename(rootDirectory).replace(/[^A-Za-z0-9_.-]+/g, '_') || 'toolchain';
  const hash = crypto.createHash('sha1').update(rootDirectory.toLowerCase()).digest('hex').slice(0, 12);
  const aliasRoot = path.join(aliasBase, `${safeName}_${hash}`);
  const relativeToolPath = path.relative(rootDirectory, filePath);
  const aliasToolPath = path.join(aliasRoot, relativeToolPath);

  try {
    fs.mkdirSync(aliasBase, { recursive: true });
    if (!fs.existsSync(aliasRoot)) {
      try {
        fs.symlinkSync(rootDirectory, aliasRoot, 'junction');
      } catch {
        const command = `mklink /J "${aliasRoot.replace(/"/g, '""')}" "${rootDirectory.replace(/"/g, '""')}"`;
        execFileSync('cmd.exe', ['/d', '/c', command], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000
        });
      }
    }
    if (fs.existsSync(aliasToolPath)) {
      return aliasToolPath;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isGccLikeTool(executable: string): boolean {
  const name = path.basename(executable).toLowerCase();
  return /^(?:gcc|g\+\+|c\+\+|cc|clang|clang\+\+)(?:\.exe)?$/.test(name);
}


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBlockingPathSegment(directoryPath: string): string | undefined {
  const parsed = path.parse(directoryPath);
  const parts = path.resolve(directoryPath).slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      try {
        if (!fs.statSync(current).isDirectory()) {
          return current;
        }
      } catch {
        return current;
      }
    }
  }
  return undefined;
}

interface ArchitectureInfo {
  id: 'x86' | 'x64' | 'arm64';
  label: string;
  reason?: string;
}

function inferRequestedArchitecture(compilerPath: string, flags: string[]): ArchitectureInfo | undefined {
  if (flags.includes('-m32')) {
    return { id: 'x86', label: 'x86 / 32-bit', reason: '-m32' };
  }
  if (flags.includes('-m64')) {
    return { id: 'x64', label: 'x64 / 64-bit', reason: '-m64' };
  }
  const resolved = resolveExecutableFromPath(compilerPath);
  const lower = resolved.toLowerCase().replace(/\\/g, '/');
  if (/(^|[/_-])(x86_64|amd64|mingw64|ucrt64|clang64|msvc[^/]*_64|win64)([/_.-]|$)/.test(lower)) {
    return { id: 'x64', label: 'x64 / 64-bit', reason: `compiler path ${resolved}` };
  }
  if (/(^|[/_-])(i686|mingw32|win32)([/_.-]|$)/.test(lower)) {
    return { id: 'x86', label: 'x86 / 32-bit', reason: `compiler path ${resolved}` };
  }
  if (/(^|[/_-])(aarch64|arm64)([/_.-]|$)/.test(lower)) {
    return { id: 'arm64', label: 'ARM64', reason: `compiler path ${resolved}` };
  }
  return undefined;
}

function resolveExecutableFromPath(executable: string): string {
  if (executable.includes('/') || executable.includes('\\')) {
    return normalizeRuntimePath(executable);
  }
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const names = process.platform === 'win32' && !path.extname(executable)
    ? extensions.map((extension) => `${executable}${extension.toLowerCase()}`)
    : [executable];
  for (const entry of pathEntries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return executable;
}

function inspectBinaryArchitecture(filePath: string): { arch?: ArchitectureInfo; kind?: string } {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 0x40 && buffer.toString('ascii', 0, 2) === 'MZ') {
      const peOffset = buffer.readUInt32LE(0x3c);
      if (peOffset > 0 && peOffset + 6 <= buffer.length && buffer.toString('ascii', peOffset, peOffset + 4) === 'PE\u0000\u0000') {
        return { arch: machineToArchitecture(buffer.readUInt16LE(peOffset + 4)), kind: 'PE/DLL' };
      }
    }
    if (buffer.length >= 8 && buffer.toString('ascii', 0, 8) === '!<arch>\n') {
      return inspectArchiveArchitecture(buffer);
    }
    if (buffer.length >= 20) {
      const arch = machineToArchitecture(buffer.readUInt16LE(0));
      if (arch) {
        return { arch, kind: 'COFF object' };
      }
    }
  } catch {
    // Best-effort diagnostics only.
  }
  return {};
}

function inspectArchiveArchitecture(buffer: Buffer): { arch?: ArchitectureInfo; kind?: string } {
  let offset = 8;
  while (offset + 60 <= buffer.length) {
    const header = buffer.toString('ascii', offset, offset + 60);
    const sizeText = header.slice(48, 58).trim();
    const size = Number.parseInt(sizeText, 10);
    if (!Number.isFinite(size) || size < 0) {
      break;
    }
    const dataStart = offset + 60;
    const dataEnd = Math.min(dataStart + size, buffer.length);
    const data = buffer.subarray(dataStart, dataEnd);
    if (data.length >= 20) {
      const importArch = inspectCoffImportObject(data);
      if (importArch) {
        return { arch: importArch, kind: 'import library' };
      }
      const objectArch = machineToArchitecture(data.readUInt16LE(0));
      if (objectArch) {
        return { arch: objectArch, kind: 'archive object library' };
      }
    }
    offset = dataEnd + (size % 2);
  }
  return { kind: 'archive library' };
}

function inspectCoffImportObject(data: Buffer): ArchitectureInfo | undefined {
  if (data.length < 20) {
    return undefined;
  }
  const sig1 = data.readUInt16LE(0);
  const sig2 = data.readUInt16LE(2);
  if (sig1 === 0x0000 && sig2 === 0xffff) {
    return machineToArchitecture(data.readUInt16LE(6));
  }
  return undefined;
}

function machineToArchitecture(machine: number): ArchitectureInfo | undefined {
  switch (machine) {
    case 0x014c:
      return { id: 'x86', label: 'x86 / 32-bit' };
    case 0x8664:
      return { id: 'x64', label: 'x64 / 64-bit' };
    case 0xaa64:
      return { id: 'arm64', label: 'ARM64' };
    default:
      return undefined;
  }
}


function isInsideOneDrive(value: string): boolean {
  const normalized = path.resolve(value).replace(/\\/g, '/').toLowerCase();
  return /(^|\/)onedrive(\/|$)/i.test(normalized) || /\/onedrive[ -]/i.test(normalized);
}

const RUNTIME_DEPLOY_MANIFEST = '.qpm-runtime-dlls.json';

function indexToolchainDlls(binDirectories: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const binDirectory of binDirectories) {
    try {
      for (const name of fs.readdirSync(binDirectory)) {
        if (!/\.dll$/i.test(name)) {
          continue;
        }
        const key = name.toLowerCase();
        if (!result.has(key)) {
          result.set(key, path.join(binDirectory, name));
        }
      }
    } catch {
      // Ignore unreadable toolchain directories.
    }
  }
  return result;
}

function isKnownToolchainRuntimeDllName(name: string): boolean {
  const lower = name.toLowerCase();
  return /^libgcc_s_.*\.dll$/.test(lower)
    || lower === 'libstdc++-6.dll'
    || lower === 'libwinpthread-1.dll'
    || lower === 'libgomp-1.dll'
    || lower === 'libquadmath-0.dll'
    || lower === 'libssp-0.dll'
    || lower === 'libatomic-1.dll'
    || /^libgfortran-.*\.dll$/.test(lower)
    || lower === 'libc++.dll'
    || lower === 'libc++abi.dll'
    || lower === 'libunwind.dll'
    || lower === 'libomp.dll'
    || lower === 'libiomp5md.dll'
    || /^clang_rt\..*\.dll$/.test(lower)
    || lower === 'msys-2.0.dll'
    || /^msys-gcc_s_.*\.dll$/.test(lower)
    || lower === 'msys-stdc++-6.dll'
    || lower === 'msys-winpthread-1.dll';
}

function isToolchainRuntimeImportCandidate(name: string): boolean {
  const lower = path.basename(name).toLowerCase();
  if (!/\.dll$/.test(lower)) {
    return false;
  }
  if (/^(?:api-ms-win-|ext-ms-)/.test(lower)) {
    return false;
  }
  return !WINDOWS_SYSTEM_DLLS.has(lower);
}

const WINDOWS_SYSTEM_DLLS = new Set([
  'advapi32.dll', 'bcrypt.dll', 'cfgmgr32.dll', 'combase.dll', 'comctl32.dll', 'comdlg32.dll',
  'crypt32.dll', 'dwmapi.dll', 'gdi32.dll', 'gdi32full.dll', 'imm32.dll', 'iphlpapi.dll',
  'kernel32.dll', 'msvcrt.dll', 'netapi32.dll', 'ntdll.dll', 'ole32.dll', 'oleaut32.dll',
  'rpcrt4.dll', 'secur32.dll', 'setupapi.dll', 'shell32.dll', 'shlwapi.dll', 'ucrtbase.dll',
  'user32.dll', 'userenv.dll', 'version.dll', 'winhttp.dll', 'wininet.dll', 'winmm.dll',
  'winspool.drv', 'ws2_32.dll'
]);

function readRuntimeDeployManifest(targetDirectory: string): Set<string> {
  const manifestPath = path.join(targetDirectory, RUNTIME_DEPLOY_MANIFEST);
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { dlls?: string[] };
    return new Set((parsed.dlls ?? []).map((name) => path.basename(name).toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeRuntimeDeployManifest(targetDirectory: string, dllNames: string[]): void {
  const manifestPath = path.join(targetDirectory, RUNTIME_DEPLOY_MANIFEST);
  const normalized = unique(dllNames.map((name) => path.basename(name))).sort((a, b) => a.localeCompare(b));
  try {
    if (normalized.length === 0) {
      fs.rmSync(manifestPath, { force: true });
      return;
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify({ generatedBy: 'qpm', dlls: normalized }, null, 2)}
`, 'utf8');
  } catch {
    // Manifest is a cleanup aid only. Runtime deployment must not fail because of it.
  }
}

function readImportedDllNames(filePath: string): string[] {
  const fromPe = readPeImportedDllNames(filePath);
  if (fromPe.length > 0) {
    return fromPe;
  }
  return readImportedDllNamesWithObjdump(filePath);
}

function readPeImportedDllNames(filePath: string): string[] {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 0x100 || buffer.toString('ascii', 0, 2) !== 'MZ') {
      return [];
    }
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset <= 0 || peOffset + 24 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') {
      return [];
    }
    const sectionCount = buffer.readUInt16LE(peOffset + 6);
    const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
    const optionalHeaderOffset = peOffset + 24;
    if (optionalHeaderOffset + optionalHeaderSize > buffer.length) {
      return [];
    }
    const magic = buffer.readUInt16LE(optionalHeaderOffset);
    const dataDirectoryOffset = magic === 0x20b ? optionalHeaderOffset + 0x70 : optionalHeaderOffset + 0x60;
    if (dataDirectoryOffset + 16 > optionalHeaderOffset + optionalHeaderSize) {
      return [];
    }
    const importRva = buffer.readUInt32LE(dataDirectoryOffset + 8);
    if (importRva === 0) {
      return [];
    }
    const sections = [] as Array<{ virtualAddress: number; virtualSize: number; rawSize: number; rawPointer: number }>;
    const sectionOffset = optionalHeaderOffset + optionalHeaderSize;
    for (let index = 0; index < sectionCount; index++) {
      const offset = sectionOffset + index * 40;
      if (offset + 40 > buffer.length) {
        break;
      }
      sections.push({
        virtualSize: buffer.readUInt32LE(offset + 8),
        virtualAddress: buffer.readUInt32LE(offset + 12),
        rawSize: buffer.readUInt32LE(offset + 16),
        rawPointer: buffer.readUInt32LE(offset + 20)
      });
    }
    const rvaToOffset = (rva: number): number | undefined => {
      for (const section of sections) {
        const size = Math.max(section.virtualSize, section.rawSize);
        if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
          return section.rawPointer + (rva - section.virtualAddress);
        }
      }
      return undefined;
    };
    const readCString = (offset: number): string => {
      let end = offset;
      while (end < buffer.length && buffer[end] !== 0) {
        end++;
      }
      return buffer.toString('ascii', offset, end).trim();
    };
    const importOffset = rvaToOffset(importRva);
    if (importOffset === undefined) {
      return [];
    }
    const names: string[] = [];
    for (let offset = importOffset; offset + 20 <= buffer.length; offset += 20) {
      const originalFirstThunk = buffer.readUInt32LE(offset);
      const nameRva = buffer.readUInt32LE(offset + 12);
      const firstThunk = buffer.readUInt32LE(offset + 16);
      if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) {
        break;
      }
      const nameOffset = rvaToOffset(nameRva);
      if (nameOffset !== undefined) {
        const name = readCString(nameOffset);
        if (name) {
          names.push(name);
        }
      }
    }
    return unique(names);
  } catch {
    return [];
  }
}

function readImportedDllNamesWithObjdump(filePath: string): string[] {
  const tools = unique([
    path.join(path.dirname(filePath), 'objdump.exe'),
    path.join(path.dirname(filePath), 'llvm-objdump.exe'),
    resolveExecutableFromPath('objdump'),
    resolveExecutableFromPath('llvm-objdump')
  ]).filter((candidate) => fs.existsSync(candidate));
  for (const tool of tools) {
    try {
      const output = execFileSync(tool, ['-p', filePath], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const matches = [...output.matchAll(/DLL Name:\s*([^\r\n]+)/gi)].map((match) => match[1].trim()).filter(Boolean);
      if (matches.length > 0) {
        return unique(matches);
      }
    } catch {
      // Try the next tool.
    }
  }
  return [];
}

function shouldCopyRuntimeDll(sourcePath: string, destinationPath: string): boolean {
  if (!fs.existsSync(destinationPath)) {
    return true;
  }
  try {
    const sourceArch = inspectBinaryArchitecture(sourcePath).arch;
    const destinationArch = inspectBinaryArchitecture(destinationPath).arch;
    if (sourceArch && destinationArch && sourceArch.id !== destinationArch.id) {
      return true;
    }
    const sourceStat = fs.statSync(sourcePath);
    const destinationStat = fs.statSync(destinationPath);
    return sourceStat.size !== destinationStat.size || Math.abs(sourceStat.mtimeMs - destinationStat.mtimeMs) > 2000;
  } catch {
    return true;
  }
}

function isCSource(filePath: string): boolean { return path.extname(filePath).toLowerCase() === '.c'; }
function isSource(filePath: string): boolean { return /\.(?:c|cc|cpp|cxx)$/i.test(filePath); }
function isHeader(filePath: string): boolean { return /\.(?:h|hh|hpp|hxx)$/i.test(filePath); }
function isLibrary(filePath: string): boolean { return /\.(?:a|lib)$/i.test(filePath); }
function applicationTranslationRelativePath(entry: string): string {
  const normalized = entry.replace(/\\/g, '/').replace(/^\/+/, '');
  const configuredDirectory = vscode.workspace.getConfiguration('qpm')
    .get<string>('translationOutputDirectory', 'translations')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const withoutConfiguredRoot = configuredDirectory && normalized.toLowerCase().startsWith(`${configuredDirectory.toLowerCase()}/`)
    ? normalized.slice(configuredDirectory.length + 1)
    : normalized;
  const safe = withoutConfiguredRoot.split('/').filter((part) => part && part !== '.' && part !== '..').join('/');
  const parsed = path.posix.parse(safe || path.basename(entry));
  return path.join(parsed.dir, `${parsed.name}.qm`);
}

function renderArgument(value: string): string { return /\s/.test(value) ? `"${value}"` : value; }
function replaceExtension(filePath: string, extension: string): string { return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function resolveAgainstProject(value: string, projectPath: string): string { return path.isAbsolute(value) ? value : path.resolve(path.dirname(projectPath), value); }

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<boolean>
): Promise<boolean> {
  if (items.length === 0) {
    return true;
  }
  const limit = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  let nextIndex = 0;
  let failed = false;
  const runners = Array.from({ length: limit }, async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      try {
        if (!await worker(items[index], index)) {
          failed = true;
          return;
        }
      } catch {
        failed = true;
        return;
      }
    }
  });
  await Promise.all(runners);
  return !failed;
}
