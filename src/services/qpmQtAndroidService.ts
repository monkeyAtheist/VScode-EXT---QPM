import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChildProcess, execFileSync, spawn, spawnSync } from 'child_process';
import * as vscode from 'vscode';
import {
  QtBuildProfile,
  QtPlatformProfile,
  QtProjectManifest,
  getActiveQtBuildProfile,
  getActiveQtPlatformProfile,
  getQtKitProfileForBuild,
  isQtProjectManifestPath,
  isReleaseBuildMode,
  readQtProjectManifest,
  resolveQtProjectFiles,
  writeQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmBuildMode } from '../model/types';
import { QpmQtInstallation, QpmQtInstallationService } from './qpmQtInstallationService';
import { QpmWorkspaceService } from './qpmWorkspaceService';

export type QtAndroidPackageFormat = 'apk' | 'aab' | 'aar';

export interface QtAndroidDevice {
  serial: string;
  state: string;
  model?: string;
  product?: string;
  device?: string;
  transportId?: string;
  isEmulator: boolean;
  description: string;
}

export interface QtAndroidEnvironmentReport {
  ready: boolean;
  summary: string;
  details: string[];
  tools: Record<string, string | undefined>;
  sdkRoot?: string;
  ndkRoot?: string;
  jdkRoot?: string;
  qtRoot?: string;
  qtAbi?: string;
  installedPlatforms: string[];
  installedBuildTools: string[];
  devices: QtAndroidDevice[];
  avds: string[];
}

export interface QtAndroidBuildResult {
  success: boolean;
  format: QtAndroidPackageFormat;
  buildDirectory: string;
  projectFile: string;
  packagePath?: string;
}

interface AndroidContext {
  manifestPath: string;
  manifest: QtProjectManifest;
  platform: QtPlatformProfile;
  buildProfile: QtBuildProfile;
  mode: QpmBuildMode;
  root: string;
  qt: QpmQtInstallation;
  sdkRoot: string;
  ndkRoot: string;
  jdkRoot: string;
  qtCMake: string;
  cmake: string;
  ninja?: string;
  adb?: string;
  emulator?: string;
  avdManager?: string;
  sdkManager?: string;
  androidDeployQt?: string;
  buildDirectory: string;
  generatedProjectDirectory: string;
  environment: NodeJS.ProcessEnv;
}

export class QpmQtAndroidService implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [];
  private logcatProcess?: ChildProcess;
  private logcatDescription = '';
  private emulatorProcess?: ChildProcess;
  private latestPackage?: string;

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly qtInstallations: QpmQtInstallationService,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(workspaces.onDidChange(() => this.changed.fire()));
  }

  dispose(): void {
    this.stopLogcat(false);
    if (this.emulatorProcess && !this.emulatorProcess.killed) this.emulatorProcess.unref();
    for (const disposable of this.disposables) disposable.dispose();
    this.changed.dispose();
  }

  get activeProfile(): QtPlatformProfile | undefined {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) return undefined;
    try {
      const profile = getActiveQtPlatformProfile(readQtProjectManifest(ref.absolutePath));
      return profile.type === 'android' ? profile : undefined;
    } catch {
      return undefined;
    }
  }

  get activeLogcatDescription(): string { return this.logcatDescription; }
  get latestPackagePath(): string | undefined { return this.latestPackage; }

  async configureEnvironment(): Promise<void> {
    const context = this.readManifestContext();
    if (!context) return;
    const profile = context.platform;
    while (true) {
      const report = this.detectEnvironment(profile);
      const action = await vscode.window.showQuickPick([
        { id: 'sdk', label: '$(folder) Android SDK root', description: profile.androidSdkRoot || report.sdkRoot || 'not configured' },
        { id: 'ndk', label: '$(folder) Android NDK root', description: profile.androidNdkRoot || report.ndkRoot || 'automatic' },
        { id: 'jdk', label: '$(folder) Java JDK root', description: profile.androidJdkRoot || report.jdkRoot || 'automatic' },
        { id: 'qt', label: '$(versions) Qt for Android kit', description: report.qtRoot || 'select through Qt kit manager' },
        { id: 'abi', label: '$(symbol-enum) Android ABIs', description: profile.androidBuildAllAbis ? 'All installed ABIs' : profile.androidAbis.join(', ') },
        { id: 'sdk-packages', label: '$(cloud-download) Install required SDK packages', description: `platform-${profile.androidCompileSdk}, build-tools ${profile.androidBuildToolsVersion}` },
        { id: 'device', label: '$(device-mobile) Select device', description: profile.androidDeviceSerial || 'automatic' },
        { id: 'avd', label: '$(device-mobile) Select Android Virtual Device', description: profile.androidAvdName || 'not selected' },
        { id: 'report', label: '$(report) Open Android environment report', description: report.summary },
        { id: 'save', label: '$(save) Save and close', description: report.ready ? 'Android environment is ready' : 'Save current configuration' }
      ], { title: 'Qt Android environment', placeHolder: 'Configure Android SDK, NDK, JDK, device and ABIs' });
      if (!action || action.id === 'save') return;
      if (action.id === 'sdk' || action.id === 'ndk' || action.id === 'jdk') {
        const selected = await vscode.window.showOpenDialog({
          title: action.id === 'sdk' ? 'Select Android SDK root' : action.id === 'ndk' ? 'Select Android NDK root' : 'Select JDK root',
          canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
          defaultUri: vscode.Uri.file(action.id === 'sdk' ? profile.androidSdkRoot || report.sdkRoot || os.homedir() : action.id === 'ndk' ? profile.androidNdkRoot || report.ndkRoot || os.homedir() : profile.androidJdkRoot || report.jdkRoot || os.homedir())
        });
        if (!selected?.[0]) continue;
        if (action.id === 'sdk') profile.androidSdkRoot = selected[0].fsPath;
        if (action.id === 'ndk') profile.androidNdkRoot = selected[0].fsPath;
        if (action.id === 'jdk') profile.androidJdkRoot = selected[0].fsPath;
        writeQtProjectManifest(context.manifestPath, context.manifest);
      } else if (action.id === 'abi') {
        const selected = await vscode.window.showQuickPick([
          { label: 'Build all installed Qt Android ABIs', value: 'all', picked: profile.androidBuildAllAbis },
          ...ANDROID_ABIS.map((abi) => ({ label: abi, value: abi, picked: !profile.androidBuildAllAbis && profile.androidAbis.includes(abi) }))
        ], { title: 'Android ABIs', canPickMany: true });
        if (!selected?.length) continue;
        profile.androidBuildAllAbis = selected.some((entry) => entry.value === 'all');
        profile.androidAbis = profile.androidBuildAllAbis ? profile.androidAbis : selected.map((entry) => entry.value).filter((entry) => entry !== 'all');
        if (!profile.androidAbis.length) profile.androidAbis = ['arm64-v8a'];
        writeQtProjectManifest(context.manifestPath, context.manifest);
      } else if (action.id === 'sdk-packages') {
        await this.installRequiredSdkPackages();
      } else if (action.id === 'device') {
        await this.selectDevice();
        context.manifest = readQtProjectManifest(context.manifestPath);
        context.platform = getActiveQtPlatformProfile(context.manifest);
      } else if (action.id === 'avd') {
        await this.selectAvd();
        context.manifest = readQtProjectManifest(context.manifestPath);
        context.platform = getActiveQtPlatformProfile(context.manifest);
      } else if (action.id === 'report') {
        await this.openReport();
      } else if (action.id === 'qt') {
        await vscode.commands.executeCommand('qpm.assignQtKit');
        context.manifest = readQtProjectManifest(context.manifestPath);
        context.platform = getActiveQtPlatformProfile(context.manifest);
      }
      this.changed.fire();
    }
  }

  detectEnvironment(profile?: QtPlatformProfile): QtAndroidEnvironmentReport {
    const context = this.readManifestContext(false);
    const active = profile ?? context?.platform;
    if (!active || active.type !== 'android') {
      return { ready: false, summary: 'No Android platform profile is active', details: ['Select or create an Android platform profile.'], tools: {}, installedPlatforms: [], installedBuildTools: [], devices: [], avds: [] };
    }
    const qt = context ? this.resolveQtInstallation(context.manifest, context.manifestPath) : undefined;
    const sdkRoot = resolveAndroidSdkRoot(active);
    const ndkRoot = resolveAndroidNdkRoot(active, sdkRoot);
    const jdkRoot = resolveAndroidJdkRoot(active);
    const tools = resolveAndroidTools(active, sdkRoot, qt);
    const details: string[] = [];
    let ready = true;
    if (!qt || !isAndroidQtRoot(qt.root)) { ready = false; details.push('The selected Qt kit is not a Qt for Android kit (android_arm64_v8a, android_armv7, android_x86 or android_x86_64).'); }
    if (!sdkRoot || !isDirectory(sdkRoot)) { ready = false; details.push('Android SDK root was not found.'); }
    if (!ndkRoot || !isDirectory(ndkRoot)) { ready = false; details.push('Android NDK root was not found.'); }
    if (!jdkRoot || !isDirectory(jdkRoot)) { ready = false; details.push('Java JDK root was not found.'); }
    if (!tools.adb) { ready = false; details.push('adb was not found in Android SDK platform-tools.'); }
    if (!tools.cmake) { ready = false; details.push('CMake was not found.'); }
    if (!tools.qtCMake) { ready = false; details.push('qt-cmake was not found in the Qt for Android kit.'); }
    if (!tools.ninja) { ready = false; details.push('Ninja was not found.'); }
    if (!tools.java) { ready = false; details.push('java was not found in the configured JDK.'); }
    const installedPlatforms = sdkRoot ? listDirectoryNames(path.join(sdkRoot, 'platforms')).filter((name) => /^android-\d+$/.test(name)).sort(versionSort) : [];
    const installedBuildTools = sdkRoot ? listDirectoryNames(path.join(sdkRoot, 'build-tools')).sort(versionSort) : [];
    if (sdkRoot && !installedPlatforms.includes(`android-${active.androidCompileSdk}`)) { ready = false; details.push(`Android platform android-${active.androidCompileSdk} is not installed.`); }
    if (sdkRoot && active.androidBuildToolsVersion && !installedBuildTools.includes(active.androidBuildToolsVersion)) { ready = false; details.push(`Android build-tools ${active.androidBuildToolsVersion} is not installed.`); }
    const javaVersion = tools.java ? probeJavaVersion(tools.java) : undefined;
    if (javaVersion) details.push(`Java: ${javaVersion}`);
    if (javaVersion && qt?.majorVersion === 6 && compareMajor(javaVersion, 21) < 0 && Number(qt.version.split('.')[1] || 0) >= 11) {
      ready = false; details.push('Qt 6.11 requires JDK 21 or newer.');
    }
    const devices = tools.adb ? this.listDevicesWithTool(tools.adb) : [];
    const avds = tools.emulator ? this.listAvdsWithTool(tools.emulator) : [];
    details.push(`ABIs: ${active.androidBuildAllAbis ? 'all installed Qt Android ABIs' : active.androidAbis.join(', ')}`);
    details.push(`Package: ${androidPackageName(active, context?.manifest)}`);
    details.push(`Package format: ${active.androidPackageFormat.toUpperCase()}`);
    return {
      ready,
      summary: ready ? 'Qt Android environment is ready' : 'Qt Android environment needs configuration',
      details,
      tools,
      sdkRoot, ndkRoot, jdkRoot,
      qtRoot: qt?.root,
      qtAbi: qt?.androidAbi ?? androidAbiFromQtRoot(qt?.root || ''),
      installedPlatforms,
      installedBuildTools,
      devices,
      avds
    };
  }

  listDevices(): QtAndroidDevice[] {
    const report = this.detectEnvironment();
    return report.tools.adb ? this.listDevicesWithTool(report.tools.adb) : [];
  }

  listAvds(): string[] {
    const report = this.detectEnvironment();
    return report.tools.emulator ? this.listAvdsWithTool(report.tools.emulator) : [];
  }

  async selectDevice(): Promise<QtAndroidDevice | undefined> {
    const context = this.readManifestContext();
    if (!context) return undefined;
    const report = this.detectEnvironment(context.platform);
    const devices = report.devices;
    if (!devices.length) {
      vscode.window.showWarningMessage('No Android device or emulator is connected. Enable USB debugging or start an AVD.');
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(devices.map((device) => ({ label: device.description, description: `${device.serial} · ${device.state}`, device })), { title: 'Select Android device' });
    if (!selected) return undefined;
    context.platform.androidDeviceSerial = selected.device.serial;
    writeQtProjectManifest(context.manifestPath, context.manifest);
    this.changed.fire();
    return selected.device;
  }

  async selectAvd(): Promise<string | undefined> {
    const context = this.readManifestContext();
    if (!context) return undefined;
    const report = this.detectEnvironment(context.platform);
    if (!report.avds.length) {
      vscode.window.showWarningMessage('No Android Virtual Device was found. Create one with avdmanager or Android Studio.');
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(report.avds.map((name) => ({ label: name, name })), { title: 'Select Android Virtual Device' });
    if (!selected) return undefined;
    context.platform.androidAvdName = selected.name;
    writeQtProjectManifest(context.manifestPath, context.manifest);
    this.changed.fire();
    return selected.name;
  }

  async startAvd(): Promise<boolean> {
    const context = this.readManifestContext();
    if (!context) return false;
    const report = this.detectEnvironment(context.platform);
    if (!report.tools.emulator) throw new Error('Android emulator executable was not found.');
    let avd = context.platform.androidAvdName;
    if (!avd) avd = await this.selectAvd() || '';
    if (!avd) return false;
    this.output.show(true);
    this.output.appendLine(`[Qt Android] Starting AVD ${avd}`);
    const processHandle = spawn(report.tools.emulator, ['-avd', avd], { cwd: context.root, env: createAndroidEnvironment(context.platform, report), detached: true, windowsHide: false, stdio: 'ignore' });
    processHandle.unref();
    this.emulatorProcess = processHandle;
    vscode.window.showInformationMessage(`Android emulator ${avd} started. Wait until it appears in adb devices.`);
    return true;
  }

  async installRequiredSdkPackages(): Promise<boolean> {
    const context = this.readManifestContext();
    if (!context) return false;
    const report = this.detectEnvironment(context.platform);
    const sdkManager = report.tools.sdkmanager;
    if (!sdkManager) throw new Error('sdkmanager was not found. Install Android command-line tools or configure the SDK root.');
    const packages = ['platform-tools', `platforms;android-${context.platform.androidCompileSdk}`, `build-tools;${context.platform.androidBuildToolsVersion}`];
    const ndkRevision = path.basename(report.ndkRoot || '');
    if (ndkRevision && /^\d+(?:\.\d+)+$/.test(ndkRevision)) packages.push(`ndk;${ndkRevision}`);
    this.begin('Install Android SDK packages');
    return this.run(sdkManager, packages, report.sdkRoot || context.root, createAndroidEnvironment(context.platform, report), 'sdkmanager');
  }

  async buildPackage(format?: QtAndroidPackageFormat): Promise<QtAndroidBuildResult> {
    const context = this.createContext();
    const packageFormat = format ?? context.platform.androidPackageFormat;
    this.begin(`Build Android ${packageFormat.toUpperCase()} — ${context.manifest.name}`);
    fs.mkdirSync(context.generatedProjectDirectory, { recursive: true });
    fs.mkdirSync(context.buildDirectory, { recursive: true });
    const projectFile = path.join(context.generatedProjectDirectory, 'CMakeLists.txt');
    fs.writeFileSync(projectFile, generateAndroidCMakeProject(context), 'utf8');
    const configureArgs = buildAndroidConfigureArguments(context, projectFile, packageFormat);
    if (!await this.run(context.qtCMake, configureArgs, context.root, context.environment, 'Configure Qt Android project')) {
      return { success: false, format: packageFormat, buildDirectory: context.buildDirectory, projectFile };
    }
    const target = packageFormat;
    const buildArgs = ['--build', context.buildDirectory, '--target', target, '--parallel', String(Math.max(1, context.buildProfile.parallelJobs || os.cpus().length)), ...context.buildProfile.buildArguments];
    if (!await this.run(context.cmake, buildArgs, context.root, context.environment, `Build Android ${target}`)) {
      return { success: false, format: packageFormat, buildDirectory: context.buildDirectory, projectFile };
    }
    const packagePath = findLatestAndroidPackage(context.buildDirectory, packageFormat);
    if (!packagePath) {
      this.output.appendLine(`[Qt Android] The ${packageFormat.toUpperCase()} build completed but no package was found under ${context.buildDirectory}.`);
      return { success: false, format: packageFormat, buildDirectory: context.buildDirectory, projectFile };
    }
    this.latestPackage = packagePath;
    this.output.appendLine(`[Qt Android] Package: ${packagePath}`);
    vscode.window.showInformationMessage(`Android ${packageFormat.toUpperCase()} created: ${path.basename(packagePath)}`);
    this.changed.fire();
    return { success: true, format: packageFormat, buildDirectory: context.buildDirectory, projectFile, packagePath };
  }

  async installPackage(packagePath?: string): Promise<boolean> {
    const context = this.createContext(false);
    const target = packagePath || this.latestPackage || findLatestAndroidPackage(context.buildDirectory, 'apk');
    if (!target || path.extname(target).toLowerCase() !== '.apk') throw new Error('No APK is available. Build an APK before installing it.');
    const adb = context.adb;
    if (!adb) throw new Error('adb was not found.');
    const serial = await this.ensureDeviceSerial(context);
    if (!serial) return false;
    if (context.platform.androidUninstallBeforeInstall) {
      await this.run(adb, ['-s', serial, 'uninstall', androidPackageName(context.platform, context.manifest)], context.root, context.environment, 'Uninstall previous Android package', true);
    }
    const args = ['-s', serial, 'install', ...(context.platform.androidInstallReplace ? ['-r'] : []), target];
    const success = await this.run(adb, args, context.root, context.environment, 'Install Android APK');
    if (success) vscode.window.showInformationMessage(`Installed ${path.basename(target)} on ${serial}.`);
    return success;
  }

  async runApplication(): Promise<boolean> {
    const context = this.createContext(false);
    const adb = context.adb;
    if (!adb) throw new Error('adb was not found.');
    const serial = await this.ensureDeviceSerial(context);
    if (!serial) return false;
    const packageName = androidPackageName(context.platform, context.manifest);
    const args = ['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'];
    const success = await this.run(adb, args, context.root, context.environment, `Launch ${packageName}`);
    if (success && context.platform.androidOpenLogcatAfterRun) await this.startLogcat();
    return success;
  }

  async buildInstallRun(): Promise<boolean> {
    const result = await this.buildPackage('apk');
    if (!result.success || !result.packagePath) return false;
    if (!await this.installPackage(result.packagePath)) return false;
    return this.runApplication();
  }

  async uninstallApplication(): Promise<boolean> {
    const context = this.createContext(false);
    if (!context.adb) throw new Error('adb was not found.');
    const serial = await this.ensureDeviceSerial(context);
    if (!serial) return false;
    return this.run(context.adb, ['-s', serial, 'uninstall', androidPackageName(context.platform, context.manifest)], context.root, context.environment, 'Uninstall Android application');
  }

  async prepareDebugApplication(): Promise<boolean> {
    const context = this.createContext(false);
    if (!context.adb) throw new Error('adb was not found.');
    const serial = await this.ensureDeviceSerial(context);
    if (!serial) return false;
    const packageName = androidPackageName(context.platform, context.manifest);
    const success = await this.run(context.adb, ['-s', serial, 'shell', 'am', 'set-debug-app', '-w', '--persistent', packageName], context.root, context.environment, 'Enable Android wait-for-debugger mode');
    if (success) {
      await this.runApplication();
      vscode.window.showInformationMessage(`${packageName} is waiting for a debugger. Use Qt Creator/Android Studio or an LLDB Android adapter to attach.`);
    }
    return success;
  }

  async startLogcat(): Promise<boolean> {
    const context = this.createContext(false);
    if (!context.adb) throw new Error('adb was not found.');
    const serial = await this.ensureDeviceSerial(context);
    if (!serial) return false;
    this.stopLogcat(false);
    const packageName = androidPackageName(context.platform, context.manifest);
    const pidResult = spawnSync(context.adb, ['-s', serial, 'shell', 'pidof', packageName], { encoding: 'utf8', windowsHide: true, env: context.environment });
    const pid = String(pidResult.stdout || '').trim().split(/\s+/)[0];
    const filter = splitCommandLine(context.platform.androidLogcatFilter || '*:V');
    const args = ['-s', serial, 'logcat', '-v', 'threadtime', ...(pid ? ['--pid', pid] : []), ...filter];
    this.output.show(true);
    this.output.appendLine(`[Qt Android] Logcat ${serial}${pid ? ` · PID ${pid}` : ''}`);
    const child = spawn(context.adb, args, { cwd: context.root, env: context.environment, windowsHide: true, shell: false });
    child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
    child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
    child.on('close', (code) => {
      this.output.appendLine(`[Qt Android] logcat exited with code ${String(code)}.`);
      if (this.logcatProcess === child) { this.logcatProcess = undefined; this.logcatDescription = ''; this.changed.fire(); }
    });
    child.on('error', (error) => this.output.appendLine(`[Qt Android] Unable to start logcat: ${error.message}`));
    this.logcatProcess = child;
    this.logcatDescription = `${serial}${pid ? ` · PID ${pid}` : ''}`;
    this.changed.fire();
    return true;
  }

  stopLogcat(notify = true): void {
    const child = this.logcatProcess;
    if (child && !child.killed) child.kill();
    this.logcatProcess = undefined;
    this.logcatDescription = '';
    this.changed.fire();
    if (notify) vscode.window.showInformationMessage('Android logcat stopped.');
  }

  async revealLatestPackage(): Promise<void> {
    const context = this.readManifestContext();
    if (!context) return;
    const build = this.androidBuildDirectory(context.manifestPath, context.manifest, context.platform);
    const packagePath = this.latestPackage || findLatestAndroidPackage(build, context.platform.androidPackageFormat);
    if (packagePath) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(packagePath));
    else if (fs.existsSync(build)) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(build));
    else vscode.window.showWarningMessage('No Android package output exists yet.');
  }

  async openReport(): Promise<void> {
    const context = this.readManifestContext(false);
    const report = this.detectEnvironment(context?.platform);
    const lines = [
      '# Qt Android Environment Report', '',
      `- Status: ${report.ready ? 'Ready' : 'Needs configuration'}`,
      `- Qt: ${report.qtRoot || 'not found'}`,
      `- Qt ABI: ${report.qtAbi || 'unknown'}`,
      `- SDK: ${report.sdkRoot || 'not found'}`,
      `- NDK: ${report.ndkRoot || 'not found'}`,
      `- JDK: ${report.jdkRoot || 'not found'}`, '',
      '## Tools', '',
      ...Object.entries(report.tools).map(([name, value]) => `- ${name}: ${value || 'not found'}`), '',
      '## Installed SDK Components', '',
      `- Platforms: ${report.installedPlatforms.join(', ') || 'none detected'}`,
      `- Build tools: ${report.installedBuildTools.join(', ') || 'none detected'}`, '',
      '## Devices', '',
      ...(report.devices.length ? report.devices.map((device) => `- ${device.description} — ${device.serial} — ${device.state}`) : ['- No connected devices']), '',
      '## Android Virtual Devices', '',
      ...(report.avds.length ? report.avds.map((avd) => `- ${avd}`) : ['- No AVD detected']), '',
      '## Diagnostics', '',
      ...report.details.map((detail) => `- ${detail}`)
    ];
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private readManifestContext(notify = true): { manifestPath: string; manifest: QtProjectManifest; platform: QtPlatformProfile; root: string } | undefined {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      if (notify) vscode.window.showErrorMessage('Open a native Qt project first.');
      return undefined;
    }
    const manifest = readQtProjectManifest(ref.absolutePath);
    const platform = getActiveQtPlatformProfile(manifest);
    if (platform.type !== 'android') {
      if (notify) vscode.window.showErrorMessage('Select an Android platform profile first.');
      return undefined;
    }
    return { manifestPath: ref.absolutePath, manifest, platform, root: path.dirname(ref.absolutePath) };
  }

  private createContext(validate = true): AndroidContext {
    const current = this.readManifestContext();
    if (!current) throw new Error('No active Android Qt project.');
    const mode = getPersistedMode(current.manifest);
    const buildProfile = getActiveQtBuildProfile(current.manifest, mode);
    const qt = this.resolveQtInstallation(current.manifest, current.manifestPath);
    if (!qt) throw new Error('The Android Qt kit is not available. Assign a Qt for Android named kit to the project.');
    const report = this.detectEnvironment(current.platform);
    if (validate && !report.ready) throw new Error(`Android environment is not ready: ${report.details.filter((entry) => /not found|not installed|requires|not a Qt/i.test(entry)).join(' ')}`);
    const sdkRoot = report.sdkRoot || resolveAndroidSdkRoot(current.platform) || '';
    const ndkRoot = report.ndkRoot || resolveAndroidNdkRoot(current.platform, sdkRoot) || '';
    const jdkRoot = report.jdkRoot || resolveAndroidJdkRoot(current.platform) || '';
    const qtCMake = report.tools.qtCMake || resolveQtCMake(qt.root) || '';
    const cmake = report.tools.cmake || qt.cmakePath || findOnPath('cmake') || '';
    if (!qtCMake) throw new Error('qt-cmake was not found in the selected Qt for Android kit.');
    if (!cmake) throw new Error('CMake was not found.');
    const buildDirectory = this.androidBuildDirectory(current.manifestPath, current.manifest, current.platform);
    const generatedProjectDirectory = path.join(current.root, '.qpm', 'android', buildProfile.id);
    const environment = createAndroidEnvironment(current.platform, report);
    if (isReleaseBuildMode(mode) && current.platform.androidKeystore && current.platform.androidKeystoreAlias) {
      const storePassword = process.env[current.platform.androidStorePasswordEnvironment];
      const keyPassword = process.env[current.platform.androidKeyPasswordEnvironment];
      environment.QT_ANDROID_KEYSTORE_PATH = path.resolve(current.root, current.platform.androidKeystore);
      environment.QT_ANDROID_KEYSTORE_ALIAS = current.platform.androidKeystoreAlias;
      if (storePassword) environment.QT_ANDROID_KEYSTORE_STORE_PASS = storePassword;
      if (keyPassword || storePassword) environment.QT_ANDROID_KEYSTORE_KEY_PASS = keyPassword || storePassword;
    }
    return {
      ...current,
      buildProfile,
      mode,
      qt,
      sdkRoot,
      ndkRoot,
      jdkRoot,
      qtCMake,
      cmake,
      ninja: report.tools.ninja,
      adb: report.tools.adb,
      emulator: report.tools.emulator,
      avdManager: report.tools.avdmanager,
      sdkManager: report.tools.sdkmanager,
      androidDeployQt: report.tools.androiddeployqt,
      buildDirectory,
      generatedProjectDirectory,
      environment
    };
  }

  private resolveQtInstallation(manifest: QtProjectManifest, manifestPath: string): QpmQtInstallation | undefined {
    const mode = getPersistedMode(manifest);
    const kit = getQtKitProfileForBuild(manifest, mode);
    return this.qtInstallations.getActive(kit.qtInstallation || manifest.qt.installation);
  }

  private androidBuildDirectory(manifestPath: string, manifest: QtProjectManifest, platform: QtPlatformProfile): string {
    const mode = getPersistedMode(manifest);
    const profile = getActiveQtBuildProfile(manifest, mode);
    const variant = isReleaseBuildMode(mode) ? 'release' : 'debug';
    const abiKey = platform.androidBuildAllAbis ? 'all-abis' : platform.androidAbis.join('_') || 'arm64-v8a';
    return path.resolve(path.dirname(manifestPath), profile.outputDirectory, variant, 'android', abiKey);
  }

  private listDevicesWithTool(adb: string): QtAndroidDevice[] {
    try {
      const output = execFileSync(adb, ['devices', '-l'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      return parseAdbDevices(output);
    } catch {
      return [];
    }
  }

  private listAvdsWithTool(emulator: string): string[] {
    try {
      const output = execFileSync(emulator, ['-list-avds'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      return output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async ensureDeviceSerial(context: AndroidContext): Promise<string | undefined> {
    const available = context.adb ? this.listDevicesWithTool(context.adb).filter((device) => device.state === 'device') : [];
    const configured = context.platform.androidDeviceSerial;
    if (configured && available.some((device) => device.serial === configured)) return configured;
    if (available.length === 1) {
      context.platform.androidDeviceSerial = available[0].serial;
      writeQtProjectManifest(context.manifestPath, context.manifest);
      return available[0].serial;
    }
    return (await this.selectDevice())?.serial;
  }

  private begin(label: string): void {
    this.output.clear();
    this.output.show(true);
    this.output.appendLine(`[Qt Android] ${label}`);
    this.output.appendLine('');
  }

  private run(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string, allowFailure = false): Promise<boolean> {
    this.output.appendLine(`[Qt Android] ${label}`);
    this.output.appendLine(`[Qt Android] Tool: ${executable}`);
    this.output.appendLine(`[Qt Android] Arguments: ${args.map(quoteForLog).join(' ')}`);
    return new Promise((resolve) => {
      const isBatch = process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(executable);
      const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: isBatch });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => { this.output.appendLine(`[Qt Android] Unable to start ${executable}: ${error.message}`); resolve(false); });
      child.on('close', (code) => {
        this.output.appendLine(`[Qt Android] ${path.basename(executable)} exited with code ${String(code)}.`);
        resolve(code === 0 || allowFailure);
      });
    });
  }
}

const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'] as const;

export function parseAdbDevices(output: string): QtAndroidDevice[] {
  const result: QtAndroidDevice[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^List of devices attached/i.test(line) || line.startsWith('*')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const serial = parts[0];
    const state = parts[1];
    const properties: Record<string, string> = {};
    for (const part of parts.slice(2)) {
      const separator = part.indexOf(':');
      if (separator > 0) properties[part.slice(0, separator)] = part.slice(separator + 1);
    }
    const isEmulator = serial.startsWith('emulator-');
    const model = properties.model?.replace(/_/g, ' ');
    const description = model || properties.device || properties.product || (isEmulator ? 'Android Emulator' : 'Android Device');
    result.push({ serial, state, model, product: properties.product, device: properties.device, transportId: properties.transport_id, isEmulator, description });
  }
  return result;
}

export function findLatestAndroidPackage(buildDirectory: string, format: QtAndroidPackageFormat): string | undefined {
  if (!isDirectory(buildDirectory)) return undefined;
  const extension = `.${format}`;
  const candidates: Array<{ file: string; mtime: number }> = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > 7) return;
    for (const entry of safeReadDir(directory)) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) {
        try { candidates.push({ file: absolute, mtime: fs.statSync(absolute).mtimeMs }); } catch { /* ignored */ }
      }
    }
  };
  visit(buildDirectory, 0);
  return candidates.sort((a, b) => b.mtime - a.mtime)[0]?.file;
}

export function androidPackageName(profile: QtPlatformProfile, manifest?: QtProjectManifest): string {
  const configured = profile.androidPackageName.trim();
  if (configured) return configured;
  const target = (manifest?.targetName || manifest?.name || 'application').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^\d/, '_$&');
  return `org.qtproject.example.${target}`;
}

function generateAndroidCMakeProject(context: AndroidContext): string {
  const files = resolveQtProjectFiles(context.manifestPath, context.manifest);
  const sources = [...files.sources, ...files.headers, ...files.forms, ...files.resources, ...files.qml];
  const sourceList = sources.map(cmakeQuote).join('\n  ');
  const modules = context.manifest.qt.modules.join(' ');
  const qtTargets = context.manifest.qt.modules.map((module) => `Qt6::${module}`).join(' ');
  const target = cmakeIdentifier(context.manifest.targetName);
  const includeDirs = context.manifest.includeDirectories.map((entry) => cmakeQuote(path.resolve(context.root, entry))).join('\n  ');
  const definitions = [...context.manifest.defines, ...context.buildProfile.defines].map(cmakeQuote).join(' ');
  const extraLibraries = context.manifest.libraries.map(cmakeQuote).join(' ');
  const packageName = androidPackageName(context.platform, context.manifest);
  const appName = context.platform.androidAppName || context.manifest.packaging.productName || context.manifest.name;
  const abis = context.platform.androidAbis.join(';');
  const properties = [
    `QT_ANDROID_PACKAGE_NAME ${cmakeQuote(packageName)}`,
    `QT_ANDROID_APP_NAME ${cmakeQuote(appName)}`,
    `QT_ANDROID_MIN_SDK_VERSION ${context.platform.androidMinSdk}`,
    `QT_ANDROID_TARGET_SDK_VERSION ${context.platform.androidTargetSdk}`,
    `QT_ANDROID_COMPILE_SDK_VERSION ${context.platform.androidCompileSdk}`,
    `QT_ANDROID_SDK_BUILD_TOOLS_REVISION ${cmakeQuote(context.platform.androidBuildToolsVersion)}`,
    `QT_ANDROID_VERSION_CODE ${context.platform.androidVersionCode}`,
    `QT_ANDROID_VERSION_NAME ${cmakeQuote(context.platform.androidVersionName)}`,
    ...(!context.platform.androidBuildAllAbis && abis ? [`QT_ANDROID_ABIS ${cmakeQuote(abis)}`] : [])
  ];
  const lines = [
    '# Generated by Qt Project Manager 0.11.0',
    'cmake_minimum_required(VERSION 3.21)',
    `project(${cmakeIdentifier(context.manifest.name)} LANGUAGES CXX)`,
    `set(CMAKE_CXX_STANDARD ${context.buildProfile.cppStandard.replace(/\D/g, '') || '17'})`,
    'set(CMAKE_CXX_STANDARD_REQUIRED ON)',
    `set(CMAKE_AUTOMOC ${context.buildProfile.autoMoc ? 'ON' : 'OFF'})`,
    `set(CMAKE_AUTOUIC ${context.buildProfile.autoUic ? 'ON' : 'OFF'})`,
    `set(CMAKE_AUTORCC ${context.buildProfile.autoRcc ? 'ON' : 'OFF'})`,
    `find_package(Qt6 REQUIRED COMPONENTS ${modules})`,
    `qt_add_executable(${target}\n  ${sourceList}\n)`,
    `target_link_libraries(${target} PRIVATE ${qtTargets}${extraLibraries ? ` ${extraLibraries}` : ''})`,
    includeDirs ? `target_include_directories(${target} PRIVATE\n  ${includeDirs}\n)` : '',
    definitions ? `target_compile_definitions(${target} PRIVATE ${definitions})` : '',
    context.buildProfile.compilerFlags.length ? `target_compile_options(${target} PRIVATE ${context.buildProfile.compilerFlags.map(cmakeQuote).join(' ')})` : '',
    context.buildProfile.linkerFlags.length ? `target_link_options(${target} PRIVATE ${context.buildProfile.linkerFlags.map(cmakeQuote).join(' ')})` : '',
    `set_target_properties(${target} PROPERTIES\n  ${properties.join('\n  ')}\n)`,
    'qt_finalize_executable(' + target + ')'
  ].filter(Boolean);
  return `${lines.join('\n\n')}\n`;
}

function buildAndroidConfigureArguments(context: AndroidContext, projectFile: string, packageFormat: QtAndroidPackageFormat): string[] {
  const args = [
    '-S', path.dirname(projectFile),
    '-B', context.buildDirectory,
    '-GNinja',
    `-DANDROID_SDK_ROOT=${context.sdkRoot}`,
    `-DANDROID_NDK_ROOT=${context.ndkRoot}`,
    `-DCMAKE_BUILD_TYPE=${isReleaseBuildMode(context.mode) ? 'Release' : 'Debug'}`,
    `-DQT_ANDROID_COMPILE_SDK_VERSION=${context.platform.androidCompileSdk}`,
    `-DQT_ANDROID_TARGET_SDK_VERSION=${context.platform.androidTargetSdk}`,
    `-DQT_ANDROID_MIN_SDK_VERSION=${context.platform.androidMinSdk}`,
    `-DQT_ANDROID_SDK_BUILD_TOOLS_REVISION=${context.platform.androidBuildToolsVersion}`,
    ...(context.platform.androidBuildAllAbis ? ['-DQT_ANDROID_BUILD_ALL_ABIS=TRUE'] : [`-DQT_ANDROID_ABIS=${context.platform.androidAbis.join(';')}`]),
    ...context.platform.androidCMakeArguments,
    ...context.buildProfile.configureArguments
  ];
  if (context.ninja) args.push(`-DCMAKE_MAKE_PROGRAM=${context.ninja}`);
  if (isReleaseBuildMode(context.mode)) args.push('-DQT_ANDROID_DEPLOYMENT_TYPE=Release');
  const password = process.env[context.platform.androidStorePasswordEnvironment];
  if (isReleaseBuildMode(context.mode) && packageFormat !== 'aar' && context.platform.androidKeystore && context.platform.androidKeystoreAlias && password) {
    args.push(`-DQT_ANDROID_SIGN_${packageFormat === 'aab' ? 'AAB' : 'APK'}=ON`);
  }
  return args;
}

function resolveAndroidSdkRoot(profile: QtPlatformProfile): string | undefined {
  const candidates = [
    profile.androidSdkRoot,
    vscode.workspace.getConfiguration('qpm').get<string>('androidSdkRoot', ''),
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk') : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Android', 'sdk') : path.join(os.homedir(), 'Android', 'Sdk')
  ];
  return candidates.find(isDirectory);
}

function resolveAndroidNdkRoot(profile: QtPlatformProfile, sdkRoot?: string): string | undefined {
  if (isDirectory(profile.androidNdkRoot)) return profile.androidNdkRoot;
  const configured = vscode.workspace.getConfiguration('qpm').get<string>('androidNdkRoot', '');
  if (isDirectory(configured)) return configured;
  if (isDirectory(process.env.ANDROID_NDK_ROOT)) return process.env.ANDROID_NDK_ROOT;
  if (!sdkRoot) return undefined;
  const ndkRoot = path.join(sdkRoot, 'ndk');
  const versions = listDirectoryNames(ndkRoot).sort(versionSort).reverse();
  return versions.length ? path.join(ndkRoot, versions[0]) : undefined;
}

function resolveAndroidJdkRoot(profile: QtPlatformProfile): string | undefined {
  const candidates = [profile.androidJdkRoot, vscode.workspace.getConfiguration('qpm').get<string>('androidJdkRoot', ''), process.env.JAVA_HOME, process.env.JDK_HOME, process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr') : '', process.platform === 'darwin' ? '/Applications/Android Studio.app/Contents/jbr/Contents/Home' : '/opt/android-studio/jbr'];
  return candidates.find((candidate) => candidate && isFile(path.join(candidate, 'bin', executableName('java'))));
}

function scriptCandidates(directory: string, baseName: string): string[] {
  if (!directory) return [];
  return process.platform === 'win32'
    ? [path.join(directory, `${baseName}.bat`), path.join(directory, `${baseName}.cmd`), path.join(directory, `${baseName}.exe`)]
    : [path.join(directory, baseName), path.join(directory, `${baseName}.sh`)];
}

function resolveAndroidTools(profile: QtPlatformProfile, sdkRoot?: string, qt?: QpmQtInstallation): Record<string, string | undefined> {
  const commandLineLatest = sdkRoot ? path.join(sdkRoot, 'cmdline-tools', 'latest', 'bin') : '';
  const commandLineVersions = sdkRoot ? listDirectoryNames(path.join(sdkRoot, 'cmdline-tools')).filter((entry) => entry !== 'latest').sort(versionSort).reverse() : [];
  const commandLineFallback = sdkRoot && commandLineVersions.length ? path.join(sdkRoot, 'cmdline-tools', commandLineVersions[0], 'bin') : '';
  const jdkRoot = resolveAndroidJdkRoot(profile);
  return {
    adb: firstExisting([profile.androidAdbPath, vscode.workspace.getConfiguration('qpm').get<string>('androidAdbPath', ''), sdkRoot ? path.join(sdkRoot, 'platform-tools', executableName('adb')) : '', findOnPath('adb')]),
    emulator: firstExisting([profile.androidEmulatorPath, vscode.workspace.getConfiguration('qpm').get<string>('androidEmulatorPath', ''), sdkRoot ? path.join(sdkRoot, 'emulator', executableName('emulator')) : '', findOnPath('emulator')]),
    avdmanager: firstExisting([profile.androidAvdManagerPath, ...scriptCandidates(commandLineLatest, 'avdmanager'), ...scriptCandidates(commandLineFallback, 'avdmanager'), findOnPath('avdmanager')]),
    sdkmanager: firstExisting([profile.androidSdkManagerPath, ...scriptCandidates(commandLineLatest, 'sdkmanager'), ...scriptCandidates(commandLineFallback, 'sdkmanager'), findOnPath('sdkmanager')]),
    java: firstExisting([jdkRoot ? path.join(jdkRoot, 'bin', executableName('java')) : '', findOnPath('java')]),
    javac: firstExisting([jdkRoot ? path.join(jdkRoot, 'bin', executableName('javac')) : '', findOnPath('javac')]),
    qtCMake: qt ? resolveQtCMake(qt.root) : undefined,
    cmake: qt?.cmakePath || findOnPath('cmake'),
    ninja: qt?.ninjaPath || findOnPath('ninja'),
    androiddeployqt: firstExisting([profile.androidDeployQtPath, vscode.workspace.getConfiguration('qpm').get<string>('androidDeployQtPath', ''), qt?.androidDeployQtPath, qt ? path.join(qt.binDir, executableName('androiddeployqt')) : '', findOnPath('androiddeployqt')])
  };
}

function createAndroidEnvironment(profile: QtPlatformProfile, report: QtAndroidEnvironmentReport): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...profile.environment };
  if (report.sdkRoot) { env.ANDROID_HOME = report.sdkRoot; env.ANDROID_SDK_ROOT = report.sdkRoot; }
  if (report.ndkRoot) env.ANDROID_NDK_ROOT = report.ndkRoot;
  if (report.jdkRoot) { env.JAVA_HOME = report.jdkRoot; env.JDK_HOME = report.jdkRoot; }
  if (report.qtRoot) env.QTDIR = report.qtRoot;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const dirs = [report.qtRoot ? path.join(report.qtRoot, 'bin') : '', report.sdkRoot ? path.join(report.sdkRoot, 'platform-tools') : '', report.sdkRoot ? path.join(report.sdkRoot, 'emulator') : '', report.jdkRoot ? path.join(report.jdkRoot, 'bin') : '', ...Object.values(report.tools).filter((value): value is string => !!value).map((value) => path.dirname(value))].filter(Boolean);
  env[pathKey] = [...new Set(dirs), env[pathKey] || ''].join(path.delimiter);
  return env;
}

function resolveQtCMake(qtRoot: string): string | undefined {
  const candidates = process.platform === 'win32'
    ? ['qt-cmake.bat', 'qt-cmake.cmd', 'qt-cmake.exe', 'qt-cmake']
    : ['qt-cmake', 'qt-cmake.sh'];
  return firstExisting(candidates.map((name) => path.join(qtRoot, 'bin', name)));
}

function androidAbiFromQtRoot(root: string): string | undefined {
  const lower = root.toLowerCase();
  if (lower.includes('android_arm64_v8a')) return 'arm64-v8a';
  if (lower.includes('android_armv7')) return 'armeabi-v7a';
  if (lower.includes('android_x86_64')) return 'x86_64';
  if (lower.includes('android_x86')) return 'x86';
  return undefined;
}

function isAndroidQtRoot(root: string): boolean { return !!androidAbiFromQtRoot(root); }
function getPersistedMode(manifest: QtProjectManifest): QpmBuildMode { return manifest.profiles.active.buildMode || 'debug64'; }
function executableName(name: string): string { return process.platform === 'win32' ? `${name}.exe` : name; }
function isDirectory(candidate: string | undefined): candidate is string { if (!candidate) return false; try { return fs.statSync(candidate).isDirectory(); } catch { return false; } }
function isFile(candidate: string | undefined): candidate is string { if (!candidate) return false; try { return fs.statSync(candidate).isFile(); } catch { return false; } }
function firstExisting(candidates: Array<string | undefined>): string | undefined { return candidates.find(isFile); }
function safeReadDir(directory: string): fs.Dirent[] { try { return fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; } }
function listDirectoryNames(directory: string): string[] { return safeReadDir(directory).filter((entry) => entry.isDirectory()).map((entry) => entry.name); }
function versionSort(a: string, b: string): number { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
function findOnPath(name: string): string | undefined { const executable = executableName(name); for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) { const candidate = path.join(directory.replace(/^"|"$/g, ''), executable); if (isFile(candidate)) return candidate; } return undefined; }
function cmakeQuote(value: string): string { return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`; }
function cmakeIdentifier(value: string): string { return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^\d/, '_$&') || 'QpmAndroidApp'; }
function quoteForLog(value: string): string { return /\s/.test(value) ? JSON.stringify(value) : value; }
function splitCommandLine(value: string): string[] { return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((entry) => entry.replace(/^"|"$/g, '')) ?? []; }
function probeJavaVersion(java: string): string | undefined { try { const result = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); return `${result.stderr || result.stdout}`.match(/version\s+"([^"]+)"/)?.[1]; } catch { return undefined; } }
function compareMajor(version: string, expected: number): number { const major = Number.parseInt(version.replace(/^1\./, '').split(/[._-]/)[0], 10); return Number.isFinite(major) ? major - expected : 0; }
