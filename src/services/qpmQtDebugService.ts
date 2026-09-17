import * as fs from 'fs';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as vscode from 'vscode';
import {
  getActiveQtDebugProfile,
  getActiveQtRunProfile,
  getQtInstallationPreference,
  getQtKitProfileForBuild,
  getPersistedQtBuildMode,
  modeForVariantAndKit,
  isQtProjectManifestPath,
  QtDebugProfile,
  QtDebuggerType,
  QtKitProfile,
  QtProjectManifest,
  QtRunProfile,
  qtTargetPath,
  readQtProjectManifest,
  synchronizeLegacyProfileMirrors,
  writeQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmBuildMode, QpmWorkspaceProjectRef } from '../model/types';
import { QpmWorkspaceService } from './qpmWorkspaceService';
import { QpmBuildService } from './qpmBuildService';
import { QpmQtInstallation, QpmQtInstallationService } from './qpmQtInstallationService';

export interface QtDebugConfigurationContext {
  projectRoot: string;
  targetPath: string;
  mode: QpmBuildMode;
  manifest: QtProjectManifest;
  profile: QtDebugProfile;
  runProfile: QtRunProfile;
  kit: QtKitProfile;
  installation?: QpmQtInstallation;
}

export interface QpmLaunchJsonDocument {
  version: string;
  configurations: Array<Record<string, unknown>>;
  compounds?: Array<Record<string, unknown>>;
}

export class QpmQtDebugService implements vscode.Disposable {
  private readonly sshProcesses = new Set<ChildProcessWithoutNullStreams>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly builds: QpmBuildService,
    private readonly installations: QpmQtInstallationService,
    private readonly output: vscode.OutputChannel
  ) {}

  dispose(): void {
    for (const child of this.sshProcesses) {
      try { child.kill(); } catch { /* best effort */ }
    }
    this.sshProcesses.clear();
    this.emitter.dispose();
  }

  get activeProfile(): QtDebugProfile | undefined {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return undefined;
    try { return getActiveQtDebugProfile(readQtProjectManifest(ref.absolutePath)); } catch { return undefined; }
  }

  provideDebugConfigurationsForType(type: 'cppdbg' | 'cppvsdbg' | 'qml'): vscode.DebugConfiguration[] {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return [];
    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const result: vscode.DebugConfiguration[] = [];
      for (const profile of manifest.profiles.debugs) {
        if (profile.request === 'qml-attach') {
          result.push({ ...buildQmlAttachConfiguration(profile), qpmProfileId: profile.id });
          continue;
        }
        const context = this.resolveContext(ref, manifest, profile, modeForDebugProfile(manifest, profile));
        result.push({ ...buildQtCppDebugConfiguration(context), qpmProfileId: profile.id });
        if (profile.qmlDebug) result.push({ ...buildQmlAttachConfiguration(profile), qpmProfileId: `${profile.id}:qml` });
      }
      return result.filter((entry) => entry.type === type);
    } catch {
      return [];
    }
  }

  async launchActiveProfile(options: { build?: boolean; profileId?: string } = {}): Promise<boolean> {
    const ref = this.requireActiveQtProject();
    if (!ref) return false;
    let manifest = readQtProjectManifest(ref.absolutePath);
    const profile = options.profileId
      ? manifest.profiles.debugs.find((entry) => entry.id === options.profileId)
      : getActiveQtDebugProfile(manifest);
    if (!profile) throw new Error('The selected Qt debug profile no longer exists.');
    if (profile.qmlDebug && profile.request === 'launch') {
      const buildProfile = manifest.profiles.builds.find((entry) => entry.id === profile.buildProfileId);
      if (buildProfile && !buildProfile.defines.some((entry) => entry === 'QT_QML_DEBUG')) {
        buildProfile.defines.push('QT_QML_DEBUG');
        writeQtProjectManifest(ref.absolutePath, manifest);
        manifest = readQtProjectManifest(ref.absolutePath);
        this.output.appendLine(`[Qt Debug] Added QT_QML_DEBUG to build profile ${buildProfile.name}.`);
      }
    }

    const mode = await this.selectBuildModeForProfile(manifest, profile);
    if (options.build !== false && profile.request !== 'qml-attach') {
      const built = await this.builds.build(false, ref);
      if (!built) return false;
    }

    const context = this.resolveContext(ref, manifest, profile, mode);
    if (profile.request === 'qml-attach') return this.startQmlAttach(profile, ref);
    if (profile.request === 'remote-gdb' && profile.startGdbServerViaSsh) await this.startRemoteGdbServer(profile, context);

    const configuration = buildQtCppDebugConfiguration(context);
    this.output.appendLine(`[Qt Debug] Starting ${profile.name} (${profile.request}) with ${String(configuration.type)}.`);
    this.output.appendLine(`[Qt Debug] Program: ${String(configuration.program ?? 'not applicable')}`);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath));
    const started = await vscode.debug.startDebugging(folder, configuration);
    if (!started) {
      vscode.window.showErrorMessage('Unable to start the Qt debug session. Verify the debugger selected by the active kit and the Microsoft C/C++ extension.');
      return false;
    }

    if (profile.qmlDebug) {
      await delay(350);
      const qmlStarted = await vscode.debug.startDebugging(folder, buildQmlAttachConfiguration(profile));
      if (!qmlStarted) {
        vscode.window.showWarningMessage('The native debugger started, but the QML debugger could not attach. Install or enable the official Qt extension for VS Code.');
      }
    }
    return true;
  }

  async attachToLocalProcess(): Promise<boolean> {
    return this.launchTemporary('attach', 'Attach to local Qt process');
  }

  async debugCoreDump(): Promise<boolean> {
    const ref = this.requireActiveQtProject();
    if (!ref) return false;
    const picked = await vscode.window.showOpenDialog({ title: 'Select a core dump or Windows dump', canSelectMany: false, filters: { 'Core and dump files': ['core', 'dmp', 'mdmp', '*'] } });
    if (!picked?.[0]) return false;
    const manifest = readQtProjectManifest(ref.absolutePath);
    const base = getActiveQtDebugProfile(manifest);
    const temporary: QtDebugProfile = { ...base, id: 'temporary-core-dump', name: `Core dump — ${path.basename(picked[0].fsPath)}`, request: 'core-dump', coreDumpPath: picked[0].fsPath };
    return this.launchResolvedTemporary(ref, manifest, temporary, false);
  }

  async attachQmlDebugger(): Promise<boolean> {
    const ref = this.requireActiveQtProject();
    if (!ref) return false;
    const manifest = readQtProjectManifest(ref.absolutePath);
    const profile = getActiveQtDebugProfile(manifest);
    return this.startQmlAttach(profile, ref);
  }

  async manageProfiles(): Promise<void> {
    const ref = this.requireActiveQtProject();
    if (!ref) return;
    while (true) {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const activeId = manifest.profiles.active.debugProfileId;
      const choice = await vscode.window.showQuickPick([
        { id: 'create', label: '$(add) Create debug profile', description: 'Local, attach, remote GDB, core dump or QML' },
        { id: 'generate', label: '$(json) Generate .vscode/launch.json', description: 'Export QPM debug profiles for the VS Code Run and Debug view' },
        ...manifest.profiles.debugs.map((profile) => ({ id: `profile:${profile.id}`, label: `${profile.id === activeId ? '$(check) ' : '$(debug-alt) '}${profile.name}`, description: `${profile.request} · ${profile.debuggerType}`, detail: profile.id }))
      ], { title: 'Qt Debug Profiles', placeHolder: 'Select a profile or action' });
      if (!choice) return;
      if (choice.id === 'create') {
        await this.createProfile(ref, manifest);
        continue;
      }
      if (choice.id === 'generate') {
        await this.generateLaunchJson();
        continue;
      }
      const id = choice.id.slice('profile:'.length);
      const profile = manifest.profiles.debugs.find((entry) => entry.id === id);
      if (!profile) continue;
      const action = await vscode.window.showQuickPick([
        { id: 'activate', label: '$(check) Set active' },
        { id: 'launch', label: '$(debug-alt) Start profile' },
        { id: 'edit', label: '$(edit) Edit profile' },
        { id: 'duplicate', label: '$(copy) Duplicate profile' },
        { id: 'delete', label: '$(trash) Delete profile' },
        { id: 'show', label: '$(json) Show profile JSON' }
      ], { title: profile.name });
      if (!action) continue;
      if (action.id === 'activate') {
        manifest.profiles.active.debugProfileId = profile.id;
        writeQtProjectManifest(ref.absolutePath, synchronizeLegacyProfileMirrors(manifest));
        this.emitter.fire();
      } else if (action.id === 'launch') {
        await this.launchActiveProfile({ profileId: profile.id });
      } else if (action.id === 'edit') {
        await this.editProfile(ref, manifest, profile.id);
      } else if (action.id === 'duplicate') {
        const name = await vscode.window.showInputBox({ title: 'Duplicated debug profile name', value: `${profile.name} Copy` });
        if (!name?.trim()) continue;
        const copy = { ...profile, id: uniqueProfileId(manifest, `${profile.id}-copy`), name: name.trim(), environment: { ...profile.environment }, sourceFileMap: { ...profile.sourceFileMap }, setupCommands: [...profile.setupCommands], additionalSolibSearchPath: [...profile.additionalSolibSearchPath] };
        manifest.profiles.debugs.push(copy);
        manifest.profiles.active.debugProfileId = copy.id;
        writeQtProjectManifest(ref.absolutePath, manifest);
        this.emitter.fire();
      } else if (action.id === 'delete') {
        if (manifest.profiles.debugs.length <= 1) {
          vscode.window.showWarningMessage('A Qt project must keep at least one debug profile.');
          continue;
        }
        const confirm = await vscode.window.showWarningMessage(`Delete debug profile “${profile.name}”?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete') continue;
        manifest.profiles.debugs = manifest.profiles.debugs.filter((entry) => entry.id !== profile.id);
        if (manifest.profiles.active.debugProfileId === profile.id) manifest.profiles.active.debugProfileId = manifest.profiles.debugs[0].id;
        writeQtProjectManifest(ref.absolutePath, manifest);
        this.emitter.fire();
      } else {
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(profile, null, 2) });
        await vscode.window.showTextDocument(document, { preview: true });
      }
    }
  }

  async generateLaunchJson(): Promise<void> {
    const ref = this.requireActiveQtProject();
    if (!ref) return;
    const manifest = readQtProjectManifest(ref.absolutePath);
    const root = path.dirname(ref.absolutePath);
    const configurations: Array<Record<string, unknown>> = [];
    const compounds: Array<Record<string, unknown>> = [];
    for (const profile of manifest.profiles.debugs) {
      if (profile.request === 'qml-attach') {
        configurations.push({ ...buildQmlAttachConfiguration(profile), qpmProfileId: profile.id });
        continue;
      }
      const context = this.resolveContext(ref, manifest, profile, modeForDebugProfile(manifest, profile));
      const cpp = { ...buildQtCppDebugConfiguration(context), qpmProfileId: profile.id } as Record<string, unknown>;
      configurations.push(cpp);
      if (profile.qmlDebug) {
        const qmlName = `${profile.name} — QML attach`;
        configurations.push({ ...buildQmlAttachConfiguration(profile, qmlName), qpmProfileId: `${profile.id}:qml` });
        compounds.push({ name: `${profile.name} — C++ and QML`, configurations: [cpp.name, qmlName], stopAll: true, qpmProfileId: `${profile.id}:compound` });
      }
    }
    const vscodeDir = path.join(root, '.vscode');
    const launchPath = path.join(vscodeDir, 'launch.json');
    fs.mkdirSync(vscodeDir, { recursive: true });
    let existing: QpmLaunchJsonDocument = { version: '0.2.0', configurations: [] };
    if (fs.existsSync(launchPath)) {
      try { existing = parseJsonc(fs.readFileSync(launchPath, 'utf8')) as QpmLaunchJsonDocument; } catch { /* replace invalid QPM launch document only after backup */ }
      if (fs.existsSync(launchPath) && !fs.existsSync(`${launchPath}.qpm-backup`)) fs.copyFileSync(launchPath, `${launchPath}.qpm-backup`);
    }
    const preservedConfigurations = (existing.configurations ?? []).filter((entry) => !('qpmProfileId' in entry));
    const preservedCompounds = (existing.compounds ?? []).filter((entry) => !('qpmProfileId' in entry));
    const document: QpmLaunchJsonDocument = {
      version: existing.version || '0.2.0',
      configurations: [...preservedConfigurations, ...configurations],
      ...(preservedCompounds.length || compounds.length ? { compounds: [...preservedCompounds, ...compounds] } : {})
    };
    fs.writeFileSync(launchPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(launchPath));
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(`Generated ${configurations.length} Qt debug configuration(s) in .vscode/launch.json.`);
  }

  private async launchTemporary(request: QtDebugProfile['request'], name: string): Promise<boolean> {
    const ref = this.requireActiveQtProject();
    if (!ref) return false;
    const manifest = readQtProjectManifest(ref.absolutePath);
    const base = getActiveQtDebugProfile(manifest);
    const temporary = { ...base, id: `temporary-${request}`, name, request };
    return this.launchResolvedTemporary(ref, manifest, temporary, false);
  }

  private async launchResolvedTemporary(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, profile: QtDebugProfile, build: boolean): Promise<boolean> {
    const mode = await this.selectBuildModeForProfile(manifest, profile);
    if (build && !await this.builds.build(false, ref)) return false;
    const context = this.resolveContext(ref, manifest, profile, mode);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath));
    return vscode.debug.startDebugging(folder, buildQtCppDebugConfiguration(context));
  }

  private resolveContext(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, profile: QtDebugProfile, mode: QpmBuildMode): QtDebugConfigurationContext {
    const root = path.dirname(ref.absolutePath);
    const runProfile = manifest.profiles.runs.find((entry) => entry.id === profile.runProfileId) ?? getActiveQtRunProfile(manifest);
    const kit = manifest.profiles.kits.find((entry) => entry.id === manifest.profiles.builds.find((entry) => entry.id === profile.buildProfileId)?.kitId)
      ?? getQtKitProfileForBuild(manifest, mode);
    const installation = this.installations.getActive(kit.qtInstallation || getQtInstallationPreference(manifest, mode));
    const targetPath = resolveProjectPath(root, profile.program) || qtTargetPath(ref.absolutePath, mode, manifest);
    return { projectRoot: root, targetPath, mode, manifest, profile, runProfile, kit, installation };
  }

  private async selectBuildModeForProfile(manifest: QtProjectManifest, profile: QtDebugProfile): Promise<QpmBuildMode> {
    const mode = modeForDebugProfile(manifest, profile);
    if (this.builds.buildMode !== mode) await this.builds.setBuildMode(mode);
    return mode;
  }

  private async startQmlAttach(profile: QtDebugProfile, ref: QpmWorkspaceProjectRef): Promise<boolean> {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(ref.absolutePath));
    const started = await vscode.debug.startDebugging(folder, buildQmlAttachConfiguration(profile));
    if (!started) vscode.window.showErrorMessage('Unable to attach the QML debugger. Install or enable the official Qt extension for VS Code and verify the host/port.');
    return started;
  }

  private async startRemoteGdbServer(profile: QtDebugProfile, context: QtDebugConfigurationContext): Promise<void> {
    if (!profile.sshHost.trim()) throw new Error('The remote debug profile must define an SSH host before QPM can start gdbserver.');
    if (!profile.remoteProgram.trim()) throw new Error('The remote debug profile must define the executable path on the target.');
    const destination = `${profile.sshUser.trim() ? `${profile.sshUser.trim()}@` : ''}${profile.sshHost.trim()}`;
    const command = buildRemoteGdbServerCommand(profile, [...parseCommandLine(context.runProfile.arguments), ...parseCommandLine(profile.arguments)]);
    const ssh = profile.sshExecutable.trim() || 'ssh';
    const args = ['-p', String(profile.sshPort), destination, command];
    this.output.appendLine(`[Qt Debug] Starting remote gdbserver: ${ssh} ${args.map(renderArgument).join(' ')}`);
    const child = spawn(ssh, args, { cwd: context.projectRoot, env: process.env, windowsHide: true });
    this.sshProcesses.add(child);
    child.stdout.on('data', (data) => this.output.append(`[gdbserver] ${String(data)}`));
    child.stderr.on('data', (data) => this.output.append(`[gdbserver] ${String(data)}`));
    child.once('exit', () => this.sshProcesses.delete(child));
    await waitForRemoteServer(child, 8000);
  }

  private async createProfile(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest): Promise<void> {
    const template = await vscode.window.showQuickPick([
      { value: 'launch' as const, label: 'Local C++ launch', description: 'Build and start the application under GDB, LLDB or Visual Studio' },
      { value: 'attach' as const, label: 'Attach to local process', description: 'Select a running Qt process' },
      { value: 'remote-gdb' as const, label: 'Remote GDB Server', description: 'Connect to host:port, optionally start gdbserver over SSH' },
      { value: 'core-dump' as const, label: 'Core or dump file', description: 'Open a GDB/LLDB core or Visual Studio dump' },
      { value: 'qml-attach' as const, label: 'QML attach', description: 'Attach the official Qt QML debugger by port' },
      { value: 'mixed' as const, label: 'Mixed C++ and QML', description: 'Launch the native debugger and attach the QML debugger' }
    ], { title: 'Create Qt debug profile' });
    if (!template) return;
    const name = await vscode.window.showInputBox({ title: 'Debug profile name', value: template.value === 'mixed' ? 'Local C++ and QML Debug' : template.label });
    if (!name?.trim()) return;
    const base = getActiveQtDebugProfile(manifest);
    const profile: QtDebugProfile = {
      ...base,
      id: uniqueProfileId(manifest, name),
      name: name.trim(),
      request: template.value === 'mixed' ? 'launch' : template.value,
      qmlDebug: template.value === 'mixed',
      environment: { ...base.environment },
      sourceFileMap: { ...base.sourceFileMap },
      setupCommands: [...base.setupCommands],
      additionalSolibSearchPath: [...base.additionalSolibSearchPath]
    };
    if (profile.request === 'remote-gdb') {
      profile.remoteHost = await vscode.window.showInputBox({ title: 'GDB Server host', value: profile.remoteHost }) || profile.remoteHost;
      profile.remotePort = Number.parseInt(await vscode.window.showInputBox({ title: 'GDB Server port', value: String(profile.remotePort) }) || String(profile.remotePort), 10);
      profile.remoteProgram = await vscode.window.showInputBox({ title: 'Executable path on remote target', value: profile.remoteProgram }) || '';
    }
    manifest.profiles.debugs.push(profile);
    manifest.profiles.active.debugProfileId = profile.id;
    writeQtProjectManifest(ref.absolutePath, manifest);
    this.emitter.fire();
  }

  private async editProfile(ref: QpmWorkspaceProjectRef, manifest: QtProjectManifest, profileId: string): Promise<void> {
    const profile = manifest.profiles.debugs.find((entry) => entry.id === profileId);
    if (!profile) return;
    while (true) {
      const action = await vscode.window.showQuickPick([
        { id: 'request', label: 'Request', description: profile.request },
        { id: 'debugger', label: 'Debugger', description: profile.debuggerType },
        { id: 'program', label: 'Program override', description: profile.program || 'project target' },
        { id: 'args', label: 'Additional arguments', description: profile.arguments || 'run profile arguments' },
        { id: 'cwd', label: 'Working directory', description: profile.workingDirectory || 'run profile / target directory' },
        { id: 'entry', label: 'Stop at entry', description: profile.stopAtEntry ? 'yes' : 'no' },
        { id: 'console', label: 'External console', description: profile.externalConsole ? 'yes' : 'no' },
        { id: 'pretty', label: 'Qt pretty printers', description: profile.enableQtPrettyPrinters ? 'enabled' : 'disabled' },
        { id: 'warnings', label: 'Break on Qt fatal/warning helpers', description: profile.breakOnQtWarnings ? 'enabled' : 'disabled' },
        { id: 'remote', label: 'Remote GDB settings', description: `${profile.remoteHost}:${profile.remotePort}` },
        { id: 'source-map', label: 'Source file map', description: `${Object.keys(profile.sourceFileMap).length} mapping(s)` },
        { id: 'core', label: 'Core/dump path', description: profile.coreDumpPath || 'not set' },
        { id: 'qml', label: 'QML debugger', description: profile.qmlDebug || profile.request === 'qml-attach' ? `${profile.qmlHost}:${profile.qmlPort}` : 'disabled' },
        { id: 'save', label: '$(save) Save profile' }
      ], { title: `Edit Qt debug profile — ${profile.name}` });
      if (!action) return;
      if (action.id === 'save') {
        writeQtProjectManifest(ref.absolutePath, manifest);
        this.emitter.fire();
        return;
      }
      if (action.id === 'request') {
        const picked = await vscode.window.showQuickPick(['launch', 'attach', 'remote-gdb', 'core-dump', 'qml-attach'], { title: 'Debug request' });
        if (picked) profile.request = picked as QtDebugProfile['request'];
      } else if (action.id === 'debugger') {
        const picked = await vscode.window.showQuickPick(['auto', 'gdb', 'lldb', 'cdb', 'cppvsdbg'], { title: 'Debugger type' });
        if (picked) profile.debuggerType = picked as QtDebuggerType;
      } else if (action.id === 'program' || action.id === 'args' || action.id === 'cwd' || action.id === 'core') {
        const key = action.id === 'program' ? 'program' : action.id === 'args' ? 'arguments' : action.id === 'cwd' ? 'workingDirectory' : 'coreDumpPath';
        const value = await vscode.window.showInputBox({ title: action.label, value: profile[key] });
        if (value !== undefined) profile[key] = value.trim();
      } else if (action.id === 'entry') profile.stopAtEntry = !profile.stopAtEntry;
      else if (action.id === 'console') profile.externalConsole = !profile.externalConsole;
      else if (action.id === 'pretty') profile.enableQtPrettyPrinters = !profile.enableQtPrettyPrinters;
      else if (action.id === 'warnings') profile.breakOnQtWarnings = !profile.breakOnQtWarnings;
      else if (action.id === 'remote') await editRemoteProfile(profile);
      else if (action.id === 'source-map') await editSourceFileMap(profile);
      else if (action.id === 'qml') await editQmlProfile(profile);
    }
  }

  private requireActiveQtProject(): QpmWorkspaceProjectRef | undefined {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Open a native .qtproject.json project to use Qt advanced debugging.');
      return undefined;
    }
    return ref;
  }
}

export function buildQtCppDebugConfiguration(context: QtDebugConfigurationContext): vscode.DebugConfiguration {
  const { profile, runProfile, kit, installation, projectRoot, targetPath } = context;
  const debuggerType = resolveDebuggerType(profile, kit);
  const useVisualStudio = debuggerType === 'cppvsdbg' || debuggerType === 'cdb' || kit.compilerFamily === 'msvc';
  const args = [...parseCommandLine(runProfile.arguments), ...parseCommandLine(profile.arguments)];
  if (profile.qmlDebug && profile.request === 'launch') args.push(qmlDebuggerArgument(profile));
  const cwd = resolveProjectPath(projectRoot, profile.workingDirectory || runProfile.workingDirectory) || path.dirname(targetPath);
  const environment = createDebugEnvironment(profile, runProfile, installation, targetPath);
  const common: Record<string, unknown> = {
    name: profile.name,
    request: profile.request === 'attach' ? 'attach' : 'launch',
    program: targetPath,
    cwd,
    stopAtEntry: profile.stopAtEntry,
    externalConsole: profile.externalConsole,
    internalConsoleOptions: 'neverOpen',
    environment
  };

  if (useVisualStudio) {
    const config: Record<string, unknown> = { ...common, type: 'cppvsdbg' };
    if (profile.request === 'attach') config.processId = profile.processId || '${command:pickProcess}';
    if (profile.request === 'core-dump') config.dumpPath = resolveProjectPath(projectRoot, profile.coreDumpPath) || profile.coreDumpPath;
    if (profile.symbolSearchPath) config.symbolSearchPath = profile.symbolSearchPath;
    const natvis = profile.enableQtPrettyPrinters ? findQtNatvis(installation) : undefined;
    if (natvis) config.visualizerFile = natvis;
    if (profile.request === 'launch') config.args = args;
    return config as vscode.DebugConfiguration;
  }

  const miMode = debuggerType === 'lldb' ? 'lldb' : 'gdb';
  const setupCommands = createSetupCommands(profile, installation);
  const config: Record<string, unknown> = {
    ...common,
    type: 'cppdbg',
    avoidWindowsConsoleRedirection: false,
    MIMode: miMode,
    miDebuggerPath: kit.debuggerPath || installation?.toolchain.debuggerPath || (miMode === 'lldb' ? 'lldb-mi' : 'gdb'),
    setupCommands,
    sourceFileMap: Object.fromEntries(Object.entries(profile.sourceFileMap).map(([remote, local]) => [remote, resolveProjectPath(projectRoot, local) || local]))
  };
  if (profile.additionalSolibSearchPath.length) config.additionalSOLibSearchPath = profile.additionalSolibSearchPath.map((entry) => resolveProjectPath(projectRoot, entry) || entry).join(';');
  if (profile.request === 'launch') config.args = args;
  if (profile.request === 'attach') config.processId = profile.processId || '${command:pickProcess}';
  if (profile.request === 'remote-gdb') {
    config.request = 'launch';
    config.miDebuggerServerAddress = `${profile.remoteHost}:${profile.remotePort}`;
    config.cwd = resolveProjectPath(projectRoot, profile.remoteWorkingDirectory) || cwd;
  }
  if (profile.request === 'core-dump') config.coreDumpPath = resolveProjectPath(projectRoot, profile.coreDumpPath) || profile.coreDumpPath;
  return config as vscode.DebugConfiguration;
}

export function buildQmlAttachConfiguration(profile: QtDebugProfile, name = `${profile.name} — QML attach`): vscode.DebugConfiguration {
  return {
    name,
    type: 'qml',
    request: 'attach',
    host: profile.qmlHost || '127.0.0.1',
    port: profile.qmlPort
  };
}

export function buildRemoteGdbServerCommand(profile: QtDebugProfile, args: string[]): string {
  const program = profile.remoteProgram.trim();
  const command = ['gdbserver', `:${profile.remotePort}`, shellQuote(program), ...args.map(shellQuote)].join(' ');
  return profile.remoteWorkingDirectory.trim() ? `cd ${shellQuote(profile.remoteWorkingDirectory.trim())} && ${command}` : command;
}

export function qmlDebuggerArgument(profile: QtDebugProfile): string {
  const parts = [`port:${profile.qmlPort}`];
  if (profile.qmlBlock) parts.push('block');
  if (profile.qmlServices.trim()) parts.push(`services:${profile.qmlServices.trim()}`);
  return `-qmljsdebugger=${parts.join(',')}`;
}

export function parseCommandLine(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  const input = value.trim();
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote !== "'" && (next === '"' || next === '\\' || /\s/.test(next ?? ''))) { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { result.push(current); current = ''; }
      continue;
    }
    current += char;
  }
  if (escaped) current += '\\';
  if (current) result.push(current);
  return result;
}

export function modeForDebugProfile(manifest: QtProjectManifest, profile: QtDebugProfile): QpmBuildMode {
  const buildProfile = manifest.profiles.builds.find((entry) => entry.id === profile.buildProfileId)
    ?? manifest.profiles.builds.find((entry) => entry.variant === 'debug')
    ?? manifest.profiles.builds[0];
  const kit = manifest.profiles.kits.find((entry) => entry.id === buildProfile.kitId) ?? manifest.profiles.kits[0];
  // Preserve the architecture selected for this project. A default kit can keep
  // architecture=auto even when its resolved compiler is x86_64; treating auto
  // as x86 was the reason debug launch reverted valid D64 projects to D32.
  return modeForVariantAndKit(buildProfile.variant, kit, getPersistedQtBuildMode(manifest));
}

function resolveDebuggerType(profile: QtDebugProfile, kit: QtKitProfile): QtDebuggerType {
  if (profile.debuggerType !== 'auto') return profile.debuggerType;
  if (kit.debuggerType !== 'auto') return kit.debuggerType;
  if (kit.compilerFamily === 'msvc') return 'cppvsdbg';
  if (kit.compilerFamily === 'clang') return 'lldb';
  return 'gdb';
}

function createSetupCommands(profile: QtDebugProfile, installation?: QpmQtInstallation): Array<Record<string, unknown>> {
  const commands: Array<Record<string, unknown>> = [];
  if (profile.enableQtPrettyPrinters) {
    commands.push({ description: 'Enable GDB/LLDB pretty printing', text: '-enable-pretty-printing', ignoreFailures: true });
    commands.push({ description: 'Use structured value formatting', text: '-gdb-set print pretty on', ignoreFailures: true });
  }
  if (profile.breakOnQtWarnings) {
    for (const symbol of ['qFatal', 'qt_message_fatal', 'qt_assert', 'qt_assert_x']) commands.push({ description: `Break on ${symbol}`, text: `-break-insert ${symbol}`, ignoreFailures: true });
  }
  const qtSources = findQtSourceDirectory(installation);
  if (qtSources) commands.push({ description: 'Add installed Qt sources to debugger lookup path', text: `-interpreter-exec console "directory ${qtSources.replace(/\\/g, '/')}"`, ignoreFailures: true });
  for (const text of profile.setupCommands) commands.push({ description: 'Custom QPM debugger command', text, ignoreFailures: true });
  return commands;
}

function createDebugEnvironment(profile: QtDebugProfile, runProfile: QtRunProfile, installation: QpmQtInstallation | undefined, targetPath: string): Array<{ name: string; value: string }> {
  const environment: Record<string, string> = { ...runProfile.environment, ...profile.environment };
  const search = [path.dirname(targetPath), installation?.binDir, installation?.toolchain.binDir].filter((entry): entry is string => Boolean(entry));
  environment.PATH = [...search, process.env.PATH ?? ''].join(path.delimiter);
  if (installation?.pluginsDir) environment.QT_PLUGIN_PATH = installation.pluginsDir;
  if (installation?.qmlDir) {
    environment.QML2_IMPORT_PATH = installation.qmlDir;
    environment.QML_IMPORT_PATH = installation.qmlDir;
  }
  if (profile.qmlDebug) environment.QML_DISABLE_DISK_CACHE = '1';
  return Object.entries(environment).map(([name, value]) => ({ name, value }));
}

function findQtSourceDirectory(installation: QpmQtInstallation | undefined): string | undefined {
  if (!installation) return undefined;
  const root = installation.root;
  const candidates = [
    path.join(path.dirname(root), 'Src'),
    path.join(path.dirname(path.dirname(root)), 'Src'),
    path.join(root, 'Src'),
    path.join(path.dirname(root), 'src'),
    path.join(path.dirname(path.dirname(root)), 'src')
  ];
  return candidates.find((entry) => fs.existsSync(entry) && fs.statSync(entry).isDirectory());
}

function findQtNatvis(installation: QpmQtInstallation | undefined): string | undefined {
  if (!installation) return undefined;
  const candidates = [
    path.join(installation.root, 'mkspecs', 'features', 'data', 'qt6.natvis'),
    path.join(installation.root, 'mkspecs', 'features', 'data', 'qt5.natvis'),
    path.join(installation.root, 'lib', 'qt6.natvis'),
    path.join(installation.root, 'lib', 'qt5.natvis')
  ];
  return candidates.find((entry) => fs.existsSync(entry));
}

function resolveProjectPath(root: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(root, trimmed);
}

function uniqueProfileId(manifest: QtProjectManifest, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'debug-profile';
  let id = base;
  let counter = 2;
  while (manifest.profiles.debugs.some((entry) => entry.id === id)) id = `${base}-${counter++}`;
  return id;
}

async function editRemoteProfile(profile: QtDebugProfile): Promise<void> {
  const host = await vscode.window.showInputBox({ title: 'GDB Server host', value: profile.remoteHost });
  if (host !== undefined) profile.remoteHost = host.trim() || '127.0.0.1';
  const port = await vscode.window.showInputBox({ title: 'GDB Server port', value: String(profile.remotePort) });
  if (port !== undefined) profile.remotePort = validPort(port, profile.remotePort);
  const remoteProgram = await vscode.window.showInputBox({ title: 'Executable path on remote target', value: profile.remoteProgram });
  if (remoteProgram !== undefined) profile.remoteProgram = remoteProgram.trim();
  const start = await vscode.window.showQuickPick([{ label: 'Connect to existing gdbserver', value: false }, { label: 'Start gdbserver through SSH', value: true }], { title: 'Remote server startup' });
  if (start) profile.startGdbServerViaSsh = start.value;
  if (profile.startGdbServerViaSsh) {
    profile.sshHost = (await vscode.window.showInputBox({ title: 'SSH host', value: profile.sshHost || profile.remoteHost }))?.trim() || profile.sshHost || profile.remoteHost;
    profile.sshUser = (await vscode.window.showInputBox({ title: 'SSH user', value: profile.sshUser }))?.trim() ?? profile.sshUser;
    const sshPort = await vscode.window.showInputBox({ title: 'SSH port', value: String(profile.sshPort) });
    if (sshPort !== undefined) profile.sshPort = validPort(sshPort, profile.sshPort);
    profile.remoteWorkingDirectory = (await vscode.window.showInputBox({ title: 'Remote working directory', value: profile.remoteWorkingDirectory }))?.trim() ?? profile.remoteWorkingDirectory;
  }
}

async function editQmlProfile(profile: QtDebugProfile): Promise<void> {
  const enabled = await vscode.window.showQuickPick([{ label: 'Enable QML debugger', value: true }, { label: 'Disable QML debugger', value: false }], { title: 'QML debugger' });
  if (enabled) profile.qmlDebug = enabled.value;
  profile.qmlHost = (await vscode.window.showInputBox({ title: 'QML debugger host', value: profile.qmlHost }))?.trim() || profile.qmlHost;
  const port = await vscode.window.showInputBox({ title: 'QML debugger port', value: String(profile.qmlPort) });
  if (port !== undefined) profile.qmlPort = validPort(port, profile.qmlPort);
  const block = await vscode.window.showQuickPick([{ label: 'Block application until QML debugger attaches', value: true }, { label: 'Do not block application', value: false }], { title: 'QML startup behavior' });
  if (block) profile.qmlBlock = block.value;
}

async function editSourceFileMap(profile: QtDebugProfile): Promise<void> {
  while (true) {
    const entries = Object.entries(profile.sourceFileMap);
    const choice = await vscode.window.showQuickPick([
      { id: 'add', label: '$(add) Add source mapping', description: 'Map a compile-time/remote source root to a local directory' },
      ...entries.map(([remote, local]) => ({ id: `entry:${remote}`, label: remote, description: local }))
    ], { title: 'Source file map' });
    if (!choice) return;
    if (choice.id === 'add') {
      const remote = await vscode.window.showInputBox({ title: 'Remote or compile-time source root' });
      if (!remote?.trim()) continue;
      const local = await vscode.window.showOpenDialog({ title: 'Select local source root', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
      if (local?.[0]) profile.sourceFileMap[remote.trim()] = local[0].fsPath;
    } else {
      const remote = choice.id.slice('entry:'.length);
      const action = await vscode.window.showQuickPick(['Change local directory', 'Remove mapping']);
      if (action === 'Remove mapping') delete profile.sourceFileMap[remote];
      else if (action) {
        const local = await vscode.window.showOpenDialog({ title: 'Select local source root', canSelectFiles: false, canSelectFolders: true, canSelectMany: false });
        if (local?.[0]) profile.sourceFileMap[remote] = local[0].fsPath;
      }
    }
  }
}

function validPort(value: string, fallback: number): number {
  const candidate = Number.parseInt(value, 10);
  return Number.isFinite(candidate) && candidate > 0 && candidate <= 65535 ? candidate : fallback;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function renderArgument(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function waitForRemoteServer(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const done = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) reject(error); else resolve();
    };
    const onData = (data: Buffer): void => {
      buffer += data.toString();
      if (/listening on port|process .* created|remote debugging from host/i.test(buffer)) done();
    };
    const onExit = (code: number | null): void => done(new Error(`SSH/gdbserver exited before the debugger connected (code ${String(code)}).`));
    const onError = (error: Error): void => done(new Error(`Unable to start SSH/gdbserver: ${error.message}`));
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
    const timer = setTimeout(() => done(new Error(`Timed out after ${timeoutMs} ms while waiting for remote gdbserver.`)), timeoutMs);
  });
}

export function parseJsonc(content: string): unknown {
  let result = '';
  let inString = false;
  let quote = '"';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    const next = content[index + 1];
    if (lineComment) {
      if (char === '\n' || char === '\r') { lineComment = false; result += char; }
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index++; }
      else if (char === '\n' || char === '\r') result += char;
      continue;
    }
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") { inString = true; quote = char; result += char; continue; }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    result += char;
  }
  // launch.json is JSONC and commonly contains trailing commas.
  result = result.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(result.replace(/^\uFEFF/, ''));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
