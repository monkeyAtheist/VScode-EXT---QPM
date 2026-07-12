import * as fs from 'fs';
import * as path from 'path';
import { QpmBuildMode, QpmProject, QpmProjectFile, QpmWorkspace } from './types';

export const QT_PROJECT_SUFFIX = '.qtproject.json';
export const QT_PROJECT_SCHEMA_VERSION = 11;

export type QtProjectKind = 'widgets-application' | 'console-application' | 'quick-application' | 'test-application' | 'quick-test-application' | 'shared-library' | 'static-library';
export type QtTestFramework = 'auto' | 'qttest' | 'qtquicktest' | 'gtest' | 'catch2' | 'boost' | 'ctest';
export type QtTestRepeatMode = 'never' | 'until-fail' | 'after-timeout';
export type QtBuildSystem = 'direct' | 'qmake' | 'cmake';
export type QtProfileArchitecture = 'auto' | 'x86' | 'x64';
export type QtBuildVariantName = 'debug' | 'release';
export type QtDebuggerType = 'auto' | 'gdb' | 'lldb' | 'cdb' | 'cppvsdbg';
export type QtDeviceType = 'desktop' | 'linux-local' | 'remote-linux' | 'docker' | 'webassembly' | 'android';
export type QtPlatformType = QtDeviceType;
export type QtPlatformBuildLocation = 'local' | 'remote' | 'container';
export type QtDebugRequest = 'launch' | 'attach' | 'remote-gdb' | 'core-dump' | 'qml-attach';

export interface QtProjectFiles {
  sources: string[];
  headers: string[];
  forms: string[];
  resources: string[];
  qml: string[];
  translations: string[];
  other: string[];
}

export interface QtKitProfile {
  id: string;
  name: string;
  qtInstallation?: string;
  cCompilerPath?: string;
  compilerPath?: string;
  debuggerPath?: string;
  debuggerType: QtDebuggerType;
  compilerFamily?: 'mingw' | 'msvc' | 'clang' | 'gcc' | 'emscripten' | 'unknown';
  compilerTargetTriple?: string;
  compilerVersion?: string;
  compatibility?: 'compatible' | 'incompatible' | 'unknown';
  diagnostic?: string;
  architecture: QtProfileArchitecture;
  deviceType: QtDeviceType;
  environmentScript?: string;
  qmakePath?: string;
  cmakePath?: string;
  buildToolPath?: string;
  generator?: string;
}

export interface QtBuildProfile {
  id: string;
  name: string;
  variant: QtBuildVariantName;
  kitId: string;
  system: QtBuildSystem;
  cppStandard: string;
  outputDirectory: string;
  generatedDirectory: string;
  defines: string[];
  compilerFlags: string[];
  linkerFlags: string[];
  autoMoc: boolean;
  autoUic: boolean;
  autoRcc: boolean;
  parallelJobs: number;
  configureArguments: string[];
  buildArguments: string[];
  cleanArguments: string[];
  sourceDirectory: string;
  projectFile: string;
  cmakeConfigurePreset: string;
  cmakeBuildPreset: string;
  generateProjectFiles: boolean;
  precompiledHeader: string;
  unityBuild: boolean;
  useResponseFiles: boolean;
}

export interface QtRunProfile {
  id: string;
  name: string;
  buildProfileId: string;
  arguments: string;
  workingDirectory: string;
  environment: Record<string, string>;
}


export interface QtDebugProfile {
  id: string;
  name: string;
  request: QtDebugRequest;
  buildProfileId: string;
  runProfileId: string;
  debuggerType: QtDebuggerType;
  program: string;
  arguments: string;
  workingDirectory: string;
  environment: Record<string, string>;
  stopAtEntry: boolean;
  externalConsole: boolean;
  processId: string;
  coreDumpPath: string;
  remoteHost: string;
  remotePort: number;
  remoteProgram: string;
  remoteWorkingDirectory: string;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  sshExecutable: string;
  startGdbServerViaSsh: boolean;
  sourceFileMap: Record<string, string>;
  additionalSolibSearchPath: string[];
  symbolSearchPath: string;
  setupCommands: string[];
  enableQtPrettyPrinters: boolean;
  breakOnQtWarnings: boolean;
  qmlDebug: boolean;
  qmlHost: string;
  qmlPort: number;
  qmlBlock: boolean;
  qmlServices: string;
}

export interface QtDeployProfile {
  id: string;
  name: string;
  buildProfileId: string;
  enabled: boolean;
  translations: boolean;
}

export interface QtPlatformProfile {
  id: string;
  name: string;
  type: QtPlatformType;
  kitId: string;
  buildProfileId: string;
  runProfileId: string;
  deployProfileId: string;
  debugProfileId: string;
  buildLocation: QtPlatformBuildLocation;
  environment: Record<string, string>;
  sysroot: string;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  sshExecutable: string;
  scpExecutable: string;
  rsyncExecutable: string;
  remoteProjectDirectory: string;
  remoteDeployDirectory: string;
  remoteBuildCommand: string;
  remoteRunCommand: string;
  useRsync: boolean;
  startGdbServer: boolean;
  gdbServerPort: number;
  dockerExecutable: string;
  dockerImage: string;
  dockerContainerName: string;
  dockerWorkspace: string;
  dockerBuildCommand: string;
  dockerRunCommand: string;
  dockerArguments: string[];
  dockerKeepContainer: boolean;
  dockerForwardDisplay: boolean;
  dockerHostNetwork: boolean;
  emsdkRoot: string;
  emsdkEnvironmentScript: string;
  wasmServerExecutable: string;
  wasmServerPort: number;
  wasmHtmlEntry: string;
  wasmOpenBrowser: boolean;
  wasmServerArguments: string[];
  androidSdkRoot: string;
  androidNdkRoot: string;
  androidJdkRoot: string;
  androidDeployQtPath: string;
  androidAdbPath: string;
  androidEmulatorPath: string;
  androidAvdManagerPath: string;
  androidSdkManagerPath: string;
  androidAbis: string[];
  androidBuildAllAbis: boolean;
  androidCompileSdk: number;
  androidTargetSdk: number;
  androidMinSdk: number;
  androidBuildToolsVersion: string;
  androidPackageName: string;
  androidAppName: string;
  androidVersionCode: number;
  androidVersionName: string;
  androidPackageFormat: 'apk' | 'aab' | 'aar';
  androidDeviceSerial: string;
  androidAvdName: string;
  androidLogcatFilter: string;
  androidInstallReplace: boolean;
  androidUninstallBeforeInstall: boolean;
  androidOpenLogcatAfterRun: boolean;
  androidGradleArguments: string[];
  androidCMakeArguments: string[];
  androidKeystore: string;
  androidKeystoreAlias: string;
  androidStorePasswordEnvironment: string;
  androidKeyPasswordEnvironment: string;
}



export type QtPackageArchiveFormat = 'folder' | 'zip' | 'tar-gz';
export type QtWindowsExecutionLevel = 'asInvoker' | 'highestAvailable' | 'requireAdministrator';
export type QtWindowsDpiAwareness = 'unaware' | 'system' | 'per-monitor' | 'per-monitor-v2';

export interface QtPackagingConfiguration {
  enabled: boolean;
  productName: string;
  productVersion: string;
  companyName: string;
  description: string;
  copyright: string;
  identifier: string;
  icon: string;
  licenseFile: string;
  readmeFile: string;
  outputDirectory: string;
  packageNamePattern: string;
  archiveFormat: QtPackageArchiveFormat;
  cleanOutput: boolean;
  buildBeforePackaging: boolean;
  includeQtRuntime: boolean;
  includeTranslations: boolean;
  includeDebugSymbols: boolean;
  extraFiles: string[];
  windows: {
    embedVersionResource: boolean;
    fileDescription: string;
    internalName: string;
    originalFilename: string;
    executionLevel: QtWindowsExecutionLevel;
    dpiAwareness: QtWindowsDpiAwareness;
    manifestFile: string;
    resourceCompilerPath: string;
  };
  linux: {
    generateDesktopEntry: boolean;
    appId: string;
    categories: string[];
    comment: string;
    installPrefix: string;
  };
}

export interface QtTestingConfiguration {
  framework: QtTestFramework;
  buildBeforeRun: boolean;
  timeoutMs: number;
  arguments: string[];
  environment: Record<string, string>;
  useOffscreenPlatform: boolean;
  parallelJobs: number;
  stopOnFailure: boolean;
  repeatMode: QtTestRepeatMode;
  repeatCount: number;
  historyLimit: number;
  ctest: {
    executable: string;
    buildDirectory: string;
    preset: string;
    configuration: string;
    labelRegex: string;
    nameRegex: string;
    excludeRegex: string;
    outputOnFailure: boolean;
  };
  boost: {
    logLevel: string;
    reportLevel: string;
    randomSeed: number;
    catchSystemErrors: boolean;
  };
}

export interface QtQualityConfiguration {
  clangTidyChecks: string;
  clazyChecks: string;
  headerFilter: string;
  coverageBuildProfileId?: string;
}

export type QtCpuProfilerTool = 'auto' | 'perf' | 'callgrind';
export type QtMemoryProfilerTool = 'auto' | 'valgrind-memcheck' | 'heob';
export type QtTraceTool = 'auto' | 'strace' | 'none';

export interface QtProfilingConfiguration {
  outputDirectory: string;
  buildBeforeRun: boolean;
  timeoutMs: number;
  arguments: string[];
  environment: Record<string, string>;
  qml: {
    enabled: boolean;
    host: string;
    port: number;
    services: string;
    outputFile: string;
    profilerPath: string;
  };
  cpu: {
    tool: QtCpuProfilerTool;
    samplingFrequency: number;
    callgrindCacheSimulation: boolean;
    callgrindBranchSimulation: boolean;
    outputFile: string;
  };
  memory: {
    tool: QtMemoryProfilerTool;
    leakCheck: 'summary' | 'full';
    trackOrigins: boolean;
    showReachable: boolean;
    outputFile: string;
  };
  cppcheck: {
    enabled: boolean;
    checks: string;
    inconclusive: boolean;
    suppressionsFile: string;
    additionalArguments: string[];
  };
  tracing: {
    tool: QtTraceTool;
    followForks: boolean;
    timestamps: boolean;
    outputFile: string;
  };
}

export interface QtProjectProfiles {
  kits: QtKitProfile[];
  builds: QtBuildProfile[];
  runs: QtRunProfile[];
  deploys: QtDeployProfile[];
  debugs: QtDebugProfile[];
  platforms: QtPlatformProfile[];
  active: {
    kitProfileId: string;
    debugBuildProfileId: string;
    releaseBuildProfileId: string;
    runProfileId: string;
    deployProfileId: string;
    debugProfileId: string;
    platformProfileId: string;
    buildMode: QpmBuildMode;
  };
}

export interface QtProjectManifest {
  schemaVersion: number;
  name: string;
  kind: QtProjectKind;
  targetName: string;
  qt: {
    installation?: string;
    majorVersion: 5 | 6 | 'auto';
    modules: string[];
    autoMoc: boolean;
    autoUic: boolean;
    autoRcc: boolean;
    autoDeploy: boolean;
  };
  build: {
    system: QtBuildSystem;
    cppStandard: string;
    outputDirectory: string;
    generatedDirectory: string;
    debug: { defines: string[]; compilerFlags: string[]; linkerFlags: string[] };
    release: { defines: string[]; compilerFlags: string[]; linkerFlags: string[] };
  };
  profiles: QtProjectProfiles;
  testing: QtTestingConfiguration;
  quality: QtQualityConfiguration;
  profiling: QtProfilingConfiguration;
  packaging: QtPackagingConfiguration;
  files: QtProjectFiles;
  includeDirectories: string[];
  libraryDirectories: string[];
  libraries: string[];
  defines: string[];
}

export interface ResolvedQtProjectFiles {
  sources: string[];
  headers: string[];
  forms: string[];
  resources: string[];
  qml: string[];
  translations: string[];
  other: string[];
}

const FILE_KEYS: Array<keyof QtProjectFiles> = ['sources', 'headers', 'forms', 'resources', 'qml', 'translations', 'other'];

export function isQtProjectManifestPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(QT_PROJECT_SUFFIX);
}

export function createDefaultQtProjectManifest(name: string, kind: QtProjectKind, modules?: string[]): QtProjectManifest {
  const normalizedModules = normalizeModules(modules ?? defaultModulesForKind(kind));
  const profiles = createDefaultProfiles(undefined);
  return synchronizeLegacyProfileMirrors({
    schemaVersion: QT_PROJECT_SCHEMA_VERSION,
    name,
    kind,
    targetName: name,
    qt: {
      majorVersion: 'auto',
      modules: normalizedModules,
      autoMoc: true,
      autoUic: true,
      autoRcc: true,
      autoDeploy: false
    },
    build: {
      system: 'direct',
      cppStandard: 'c++17',
      outputDirectory: 'build',
      generatedDirectory: 'generated',
      debug: { defines: [], compilerFlags: ['-O0', '-g'], linkerFlags: [] },
      release: { defines: ['QT_NO_DEBUG'], compilerFlags: ['-O2'], linkerFlags: [] }
    },
    profiles,
    testing: defaultTestingConfiguration(kind),
    quality: defaultQualityConfiguration(),
    profiling: defaultProfilingConfiguration(),
    packaging: defaultPackagingConfiguration(name),
    files: {
      sources: [], headers: [], forms: [], resources: [], qml: [], translations: [], other: []
    },
    includeDirectories: ['include'],
    libraryDirectories: [],
    libraries: [],
    defines: []
  });
}

export function readQtProjectManifest(manifestPath: string): QtProjectManifest {
  if (!isQtProjectManifestPath(manifestPath)) {
    throw new Error(`Not a Qt Project Manager manifest: ${manifestPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  return validateAndNormalizeManifest(raw, manifestPath);
}

export function writeQtProjectManifest(manifestPath: string, manifest: QtProjectManifest): void {
  const normalized = validateAndNormalizeManifest(manifest, manifestPath);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

export function migrateQtProjectManifestFile(manifestPath: string): boolean {
  const content = fs.readFileSync(manifestPath, 'utf8');
  const raw = JSON.parse(content) as Record<string, unknown>;
  if (raw.schemaVersion === QT_PROJECT_SCHEMA_VERSION && raw.profiles && typeof raw.profiles === 'object') return false;
  const normalized = validateAndNormalizeManifest(raw, manifestPath);
  const backupPath = `${manifestPath}.schema-v${String(raw.schemaVersion ?? 1)}.backup`;
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, content, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify(normalized, null, 2)}
`, 'utf8');
  return true;
}

export function validateAndNormalizeManifest(raw: unknown, manifestPath = '<memory>'): QtProjectManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid Qt project manifest ${manifestPath}: the root value must be an object.`);
  }
  const value = raw as Partial<QtProjectManifest> & Record<string, unknown>;
  const name = requireNonEmptyString(value.name, 'name', manifestPath);
  const kind = normalizeKind(value.kind, manifestPath);
  const qtValue = objectValue(value.qt);
  const buildValue = objectValue(value.build);
  const filesValue = objectValue(value.files);
  const debugValue = objectValue(buildValue.debug);
  const releaseValue = objectValue(buildValue.release);

  const files = {} as QtProjectFiles;
  for (const key of FILE_KEYS) files[key] = normalizeStringArray(filesValue[key]);

  const majorVersion: 5 | 6 | 'auto' = qtValue.majorVersion === 5 || qtValue.majorVersion === 6 ? qtValue.majorVersion : 'auto';
  const system = normalizeBuildSystem(buildValue.system);
  const legacyQt: QtProjectManifest['qt'] = {
    ...(optionalString(qtValue.installation) ? { installation: optionalString(qtValue.installation) } : {}),
    majorVersion,
    modules: normalizeModules(normalizeStringArray(qtValue.modules).length ? normalizeStringArray(qtValue.modules) : defaultModulesForKind(kind)),
    autoMoc: booleanValue(qtValue.autoMoc, true),
    autoUic: booleanValue(qtValue.autoUic, true),
    autoRcc: booleanValue(qtValue.autoRcc, true),
    autoDeploy: booleanValue(qtValue.autoDeploy, false)
  };
  const legacyBuild: QtProjectManifest['build'] = {
    system,
    cppStandard: optionalString(buildValue.cppStandard) || 'c++17',
    outputDirectory: normalizeRelativeDirectory(optionalString(buildValue.outputDirectory) || 'build'),
    generatedDirectory: normalizeRelativeDirectory(optionalString(buildValue.generatedDirectory) || 'generated'),
    debug: {
      defines: normalizeStringArray(debugValue.defines),
      compilerFlags: normalizeStringArray(debugValue.compilerFlags),
      linkerFlags: normalizeStringArray(debugValue.linkerFlags)
    },
    release: {
      defines: normalizeStringArray(releaseValue.defines),
      compilerFlags: normalizeStringArray(releaseValue.compilerFlags),
      linkerFlags: normalizeStringArray(releaseValue.linkerFlags)
    }
  };
  const normalized: QtProjectManifest = {
    schemaVersion: QT_PROJECT_SCHEMA_VERSION,
    name,
    kind,
    targetName: normalizeTargetName(typeof value.targetName === 'string' ? value.targetName : name, manifestPath),
    qt: legacyQt,
    build: legacyBuild,
    profiles: normalizeProfiles(value.profiles, legacyQt, legacyBuild),
    testing: normalizeTestingConfiguration(value.testing, kind),
    quality: normalizeQualityConfiguration(value.quality),
    profiling: normalizeProfilingConfiguration(value.profiling),
    packaging: normalizePackagingConfiguration(value.packaging, name, typeof value.targetName === 'string' ? value.targetName : name),
    files,
    includeDirectories: normalizeStringArray(value.includeDirectories),
    libraryDirectories: normalizeStringArray(value.libraryDirectories),
    libraries: normalizeStringArray(value.libraries),
    defines: normalizeStringArray(value.defines)
  };
  return synchronizeLegacyProfileMirrors(normalized);
}


export function getPersistedQtBuildMode(manifest: QtProjectManifest, fallback: QpmBuildMode = 'debug64'): QpmBuildMode {
  const value = manifest.profiles.active.buildMode;
  return isQpmBuildMode(value) ? value : fallback;
}

export function setPersistedQtBuildMode(manifest: QtProjectManifest, mode: QpmBuildMode): void {
  manifest.profiles.active.buildMode = mode;
}

export function inferQtKitArchitecture(kit: QtKitProfile | undefined): 'x64' | 'x86' | 'auto' {
  if (!kit) return 'auto';
  if (kit.architecture === 'x64' || kit.architecture === 'x86') return kit.architecture;
  const evidence = [kit.compilerTargetTriple, kit.compilerPath, kit.qtInstallation, kit.name].filter(Boolean).join(' ').toLowerCase();
  if (/x86_64|amd64|mingw_64|msvc[^\s]*_64|\b64[-_ ]?bit\b/.test(evidence)) return 'x64';
  if (/i[3-6]86|mingw32|msvc[^\s]*_32|\b32[-_ ]?bit\b/.test(evidence)) return 'x86';
  return 'auto';
}

export function modeForVariantAndKit(variant: QtBuildVariantName, kit: QtKitProfile | undefined, preferredMode?: QpmBuildMode): QpmBuildMode {
  const inferred = inferQtKitArchitecture(kit);
  const preferred64 = preferredMode === 'debug64' || preferredMode === 'release64';
  const x64 = inferred === 'x64' || (inferred === 'auto' && preferred64);
  return variant === 'release' ? (x64 ? 'release64' : 'release') : (x64 ? 'debug64' : 'debug');
}

function normalizePersistedBuildMode(value: unknown, kit: QtKitProfile | undefined): QpmBuildMode {
  if (isQpmBuildMode(value)) return value;
  return modeForVariantAndKit('debug', kit, 'debug64');
}

function isQpmBuildMode(value: unknown): value is QpmBuildMode {
  return value === 'debug' || value === 'release' || value === 'debug64' || value === 'release64';
}

export function getActiveQtKitProfile(manifest: QtProjectManifest): QtKitProfile {
  return manifest.profiles.kits.find((entry) => entry.id === manifest.profiles.active.kitProfileId)
    ?? manifest.profiles.kits[0];
}

export function getActiveQtBuildProfile(manifest: QtProjectManifest, mode: QpmBuildMode): QtBuildProfile {
  const id = isReleaseBuildMode(mode) ? manifest.profiles.active.releaseBuildProfileId : manifest.profiles.active.debugBuildProfileId;
  return manifest.profiles.builds.find((entry) => entry.id === id)
    ?? manifest.profiles.builds.find((entry) => entry.variant === (isReleaseBuildMode(mode) ? 'release' : 'debug'))
    ?? manifest.profiles.builds[0];
}

export function getQtKitProfileForBuild(manifest: QtProjectManifest, mode: QpmBuildMode): QtKitProfile {
  const buildProfile = getActiveQtBuildProfile(manifest, mode);
  return manifest.profiles.kits.find((entry) => entry.id === buildProfile.kitId)
    ?? getActiveQtKitProfile(manifest);
}

export function getActiveQtRunProfile(manifest: QtProjectManifest): QtRunProfile {
  return manifest.profiles.runs.find((entry) => entry.id === manifest.profiles.active.runProfileId)
    ?? manifest.profiles.runs[0];
}

export function getActiveQtDeployProfile(manifest: QtProjectManifest): QtDeployProfile {
  return manifest.profiles.deploys.find((entry) => entry.id === manifest.profiles.active.deployProfileId)
    ?? manifest.profiles.deploys[0];
}

export function getActiveQtDebugProfile(manifest: QtProjectManifest): QtDebugProfile {
  return manifest.profiles.debugs.find((entry) => entry.id === manifest.profiles.active.debugProfileId)
    ?? manifest.profiles.debugs[0];
}

export function getActiveQtPlatformProfile(manifest: QtProjectManifest): QtPlatformProfile {
  return manifest.profiles.platforms.find((entry) => entry.id === manifest.profiles.active.platformProfileId)
    ?? manifest.profiles.platforms[0];
}

export function getQtInstallationPreference(manifest: QtProjectManifest, mode?: QpmBuildMode): string | undefined {
  const kit = mode ? getQtKitProfileForBuild(manifest, mode) : getActiveQtKitProfile(manifest);
  return kit?.qtInstallation || manifest.qt.installation;
}

export function setQtInstallationPreference(manifest: QtProjectManifest, installation: string | undefined): void {
  const kit = getActiveQtKitProfile(manifest);
  const normalized = installation?.trim();
  if (normalized) {
    kit.qtInstallation = normalized;
    manifest.qt.installation = normalized;
  } else {
    delete kit.qtInstallation;
    delete manifest.qt.installation;
  }
}

export function synchronizeLegacyProfileMirrors(manifest: QtProjectManifest): QtProjectManifest {
  const kit = getActiveQtKitProfile(manifest);
  const debug = getActiveQtBuildProfile(manifest, 'debug64');
  const release = getActiveQtBuildProfile(manifest, 'release64');
  const deploy = getActiveQtDeployProfile(manifest);
  manifest.schemaVersion = QT_PROJECT_SCHEMA_VERSION;
  if (kit?.qtInstallation) manifest.qt.installation = kit.qtInstallation;
  else delete manifest.qt.installation;
  manifest.qt.autoMoc = debug?.autoMoc ?? manifest.qt.autoMoc;
  manifest.qt.autoUic = debug?.autoUic ?? manifest.qt.autoUic;
  manifest.qt.autoRcc = debug?.autoRcc ?? manifest.qt.autoRcc;
  manifest.qt.autoDeploy = deploy?.enabled ?? manifest.qt.autoDeploy;
  if (debug) {
    manifest.build.system = debug.system;
    manifest.build.cppStandard = debug.cppStandard;
    manifest.build.outputDirectory = debug.outputDirectory;
    manifest.build.generatedDirectory = debug.generatedDirectory;
    manifest.build.debug = { defines: [...debug.defines], compilerFlags: [...debug.compilerFlags], linkerFlags: [...debug.linkerFlags] };
  }
  if (release) {
    manifest.build.release = { defines: [...release.defines], compilerFlags: [...release.compilerFlags], linkerFlags: [...release.linkerFlags] };
  }
  return manifest;
}

function createDefaultProfiles(qtInstallation?: string): QtProjectProfiles {
  const kitId = 'desktop-qt';
  const debugId = 'debug';
  const releaseId = 'release';
  return {
    kits: [{ id: kitId, name: 'Desktop Qt', ...(qtInstallation ? { qtInstallation } : {}), architecture: 'auto', debuggerType: 'auto', deviceType: 'desktop' }],
    builds: [
      { id: debugId, name: 'Debug', variant: 'debug', kitId, system: 'direct', cppStandard: 'c++17', outputDirectory: 'build', generatedDirectory: 'generated', defines: [], compilerFlags: ['-O0', '-g'], linkerFlags: [], autoMoc: true, autoUic: true, autoRcc: true, parallelJobs: 0, configureArguments: [], buildArguments: [], cleanArguments: [], sourceDirectory: '.', projectFile: '', cmakeConfigurePreset: '', cmakeBuildPreset: '', generateProjectFiles: true, precompiledHeader: '', unityBuild: false, useResponseFiles: true },
      { id: releaseId, name: 'Release', variant: 'release', kitId, system: 'direct', cppStandard: 'c++17', outputDirectory: 'build', generatedDirectory: 'generated', defines: ['QT_NO_DEBUG'], compilerFlags: ['-O2'], linkerFlags: [], autoMoc: true, autoUic: true, autoRcc: true, parallelJobs: 0, configureArguments: [], buildArguments: [], cleanArguments: [], sourceDirectory: '.', projectFile: '', cmakeConfigurePreset: '', cmakeBuildPreset: '', generateProjectFiles: true, precompiledHeader: '', unityBuild: false, useResponseFiles: true }
    ],
    runs: [{ id: 'default-run', name: 'Desktop Run', buildProfileId: debugId, arguments: '', workingDirectory: '', environment: {} }],
    deploys: [{ id: 'desktop-deploy', name: 'Desktop Deploy', buildProfileId: releaseId, enabled: false, translations: false }],
    debugs: [createDefaultDebugProfile(debugId, 'default-run')],
    platforms: [createDefaultPlatformProfile(kitId, debugId, 'default-run', 'desktop-deploy', 'local-debug')],
    active: { kitProfileId: kitId, debugBuildProfileId: debugId, releaseBuildProfileId: releaseId, runProfileId: 'default-run', deployProfileId: 'desktop-deploy', debugProfileId: 'local-debug', platformProfileId: 'desktop-platform', buildMode: 'debug64' }
  };
}

function normalizeProfiles(raw: unknown, legacyQt: QtProjectManifest['qt'], legacyBuild: QtProjectManifest['build']): QtProjectProfiles {
  const fallback = createDefaultProfiles(legacyQt.installation);
  fallback.builds[0] = { ...fallback.builds[0], system: legacyBuild.system, cppStandard: legacyBuild.cppStandard, outputDirectory: legacyBuild.outputDirectory, generatedDirectory: legacyBuild.generatedDirectory, defines: legacyBuild.debug.defines, compilerFlags: legacyBuild.debug.compilerFlags, linkerFlags: legacyBuild.debug.linkerFlags, autoMoc: legacyQt.autoMoc, autoUic: legacyQt.autoUic, autoRcc: legacyQt.autoRcc };
  fallback.builds[1] = { ...fallback.builds[1], system: legacyBuild.system, cppStandard: legacyBuild.cppStandard, outputDirectory: legacyBuild.outputDirectory, generatedDirectory: legacyBuild.generatedDirectory, defines: legacyBuild.release.defines, compilerFlags: legacyBuild.release.compilerFlags, linkerFlags: legacyBuild.release.linkerFlags, autoMoc: legacyQt.autoMoc, autoUic: legacyQt.autoUic, autoRcc: legacyQt.autoRcc };
  fallback.deploys[0].enabled = legacyQt.autoDeploy;
  const value = objectValue(raw);
  if (!Object.keys(value).length) return fallback;

  const kits = Array.isArray(value.kits) ? value.kits.map((entry, index) => normalizeKitProfile(entry, `kit-${index + 1}`)).filter((entry): entry is QtKitProfile => !!entry) : [];
  if (!kits.length) kits.push(...fallback.kits);
  const defaultKitId = kits[0].id;
  const builds = Array.isArray(value.builds) ? value.builds.map((entry, index) => normalizeBuildProfile(entry, index === 1 ? 'release' : 'debug', defaultKitId, fallback.builds[Math.min(index, 1)])).filter((entry): entry is QtBuildProfile => !!entry) : [];
  if (!builds.some((entry) => entry.variant === 'debug')) builds.push({ ...fallback.builds[0], kitId: defaultKitId });
  if (!builds.some((entry) => entry.variant === 'release')) builds.push({ ...fallback.builds[1], kitId: defaultKitId });
  const debugBuild = builds.find((entry) => entry.variant === 'debug')!;
  const releaseBuild = builds.find((entry) => entry.variant === 'release')!;
  const runs = Array.isArray(value.runs) ? value.runs.map((entry, index) => normalizeRunProfile(entry, `run-${index + 1}`, debugBuild.id)).filter((entry): entry is QtRunProfile => !!entry) : [];
  if (!runs.length) runs.push({ ...fallback.runs[0], buildProfileId: debugBuild.id });
  const deploys = Array.isArray(value.deploys) ? value.deploys.map((entry, index) => normalizeDeployProfile(entry, `deploy-${index + 1}`, releaseBuild.id)).filter((entry): entry is QtDeployProfile => !!entry) : [];
  if (!deploys.length) deploys.push({ ...fallback.deploys[0], buildProfileId: releaseBuild.id });
  const debugs = Array.isArray(value.debugs) ? value.debugs.map((entry, index) => normalizeDebugProfile(entry, `debug-${index + 1}`, debugBuild.id, runs[0].id)).filter((entry): entry is QtDebugProfile => !!entry) : [];
  if (!debugs.length) debugs.push(createDefaultDebugProfile(debugBuild.id, runs[0].id));
  const platforms = Array.isArray(value.platforms) ? value.platforms.map((entry, index) => normalizePlatformProfile(entry, `platform-${index + 1}`, defaultKitId, debugBuild.id, runs[0].id, deploys[0].id, debugs[0].id)).filter((entry): entry is QtPlatformProfile => !!entry) : [];
  if (!platforms.length) platforms.push(createDefaultPlatformProfile(defaultKitId, debugBuild.id, runs[0].id, deploys[0].id, debugs[0].id));
  const activeValue = objectValue(value.active);
  return {
    kits,
    builds,
    runs,
    deploys,
    debugs,
    platforms,
    active: {
      kitProfileId: selectExistingId(optionalString(activeValue.kitProfileId), kits, defaultKitId),
      debugBuildProfileId: selectExistingId(optionalString(activeValue.debugBuildProfileId), builds, debugBuild.id),
      releaseBuildProfileId: selectExistingId(optionalString(activeValue.releaseBuildProfileId), builds, releaseBuild.id),
      runProfileId: selectExistingId(optionalString(activeValue.runProfileId), runs, runs[0].id),
      deployProfileId: selectExistingId(optionalString(activeValue.deployProfileId), deploys, deploys[0].id),
      debugProfileId: selectExistingId(optionalString(activeValue.debugProfileId), debugs, debugs[0].id),
      platformProfileId: selectExistingId(optionalString(activeValue.platformProfileId), platforms, platforms[0].id),
      buildMode: normalizePersistedBuildMode(activeValue.buildMode, kits.find((entry) => entry.id === selectExistingId(optionalString(activeValue.kitProfileId), kits, defaultKitId)) ?? kits[0])
    }
  };
}

function createDefaultDebugProfile(buildProfileId: string, runProfileId: string): QtDebugProfile {
  return {
    id: 'local-debug',
    name: 'Local C++ Debug',
    request: 'launch',
    buildProfileId,
    runProfileId,
    debuggerType: 'auto',
    program: '',
    arguments: '',
    workingDirectory: '',
    environment: {},
    stopAtEntry: false,
    externalConsole: false,
    processId: '',
    coreDumpPath: '',
    remoteHost: '127.0.0.1',
    remotePort: 2345,
    remoteProgram: '',
    remoteWorkingDirectory: '',
    sshHost: '',
    sshUser: '',
    sshPort: 22,
    sshExecutable: 'ssh',
    startGdbServerViaSsh: false,
    sourceFileMap: {},
    additionalSolibSearchPath: [],
    symbolSearchPath: '',
    setupCommands: [],
    enableQtPrettyPrinters: true,
    breakOnQtWarnings: false,
    qmlDebug: false,
    qmlHost: '127.0.0.1',
    qmlPort: 3768,
    qmlBlock: true,
    qmlServices: 'DebugMessages,QmlDebugger,V8Debugger'
  };
}

function normalizeDebugProfile(raw: unknown, fallbackId: string, buildProfileId: string, runProfileId: string): QtDebugProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const fallback = createDefaultDebugProfile(buildProfileId, runProfileId);
  const requestValues: QtDebugRequest[] = ['launch', 'attach', 'remote-gdb', 'core-dump', 'qml-attach'];
  const debuggerValues: QtDebuggerType[] = ['auto', 'gdb', 'lldb', 'cdb', 'cppvsdbg'];
  const environmentValue = objectValue(value.environment);
  const sourceMapValue = objectValue(value.sourceFileMap);
  const environment: Record<string, string> = {};
  const sourceFileMap: Record<string, string> = {};
  for (const [key, entry] of Object.entries(environmentValue)) if (key.trim() && typeof entry === 'string') environment[key.trim()] = entry;
  for (const [key, entry] of Object.entries(sourceMapValue)) if (key.trim() && typeof entry === 'string' && entry.trim()) sourceFileMap[key.trim()] = entry.trim();
  return {
    ...fallback,
    id: normalizeProfileId(optionalString(value.id) || fallbackId),
    name: optionalString(value.name) || optionalString(value.id) || fallbackId,
    request: requestValues.includes(value.request as QtDebugRequest) ? value.request as QtDebugRequest : fallback.request,
    buildProfileId: optionalString(value.buildProfileId) || buildProfileId,
    runProfileId: optionalString(value.runProfileId) || runProfileId,
    debuggerType: debuggerValues.includes(value.debuggerType as QtDebuggerType) ? value.debuggerType as QtDebuggerType : 'auto',
    program: optionalString(value.program),
    arguments: optionalString(value.arguments),
    workingDirectory: optionalString(value.workingDirectory),
    environment,
    stopAtEntry: booleanValue(value.stopAtEntry, false),
    externalConsole: booleanValue(value.externalConsole, false),
    processId: optionalString(value.processId),
    coreDumpPath: optionalString(value.coreDumpPath),
    remoteHost: optionalString(value.remoteHost) || fallback.remoteHost,
    remotePort: normalizePort(value.remotePort, fallback.remotePort),
    remoteProgram: optionalString(value.remoteProgram),
    remoteWorkingDirectory: optionalString(value.remoteWorkingDirectory),
    sshHost: optionalString(value.sshHost),
    sshUser: optionalString(value.sshUser),
    sshPort: normalizePort(value.sshPort, fallback.sshPort),
    sshExecutable: optionalString(value.sshExecutable) || fallback.sshExecutable,
    startGdbServerViaSsh: booleanValue(value.startGdbServerViaSsh, false),
    sourceFileMap,
    additionalSolibSearchPath: normalizeStringArray(value.additionalSolibSearchPath),
    symbolSearchPath: optionalString(value.symbolSearchPath),
    setupCommands: normalizeStringArray(value.setupCommands),
    enableQtPrettyPrinters: booleanValue(value.enableQtPrettyPrinters, true),
    breakOnQtWarnings: booleanValue(value.breakOnQtWarnings, false),
    qmlDebug: booleanValue(value.qmlDebug, false),
    qmlHost: optionalString(value.qmlHost) || fallback.qmlHost,
    qmlPort: normalizePort(value.qmlPort, fallback.qmlPort),
    qmlBlock: booleanValue(value.qmlBlock, true),
    qmlServices: optionalString(value.qmlServices) || fallback.qmlServices
  };
}

function createDefaultPlatformProfile(kitId: string, buildProfileId: string, runProfileId: string, deployProfileId: string, debugProfileId: string): QtPlatformProfile {
  return {
    id: 'desktop-platform',
    name: 'Desktop',
    type: 'desktop',
    kitId,
    buildProfileId,
    runProfileId,
    deployProfileId,
    debugProfileId,
    buildLocation: 'local',
    environment: {},
    sysroot: '',
    sshHost: '',
    sshUser: '',
    sshPort: 22,
    sshExecutable: 'ssh',
    scpExecutable: 'scp',
    rsyncExecutable: 'rsync',
    remoteProjectDirectory: '~/qpm-project',
    remoteDeployDirectory: '~/qpm-deploy',
    remoteBuildCommand: '',
    remoteRunCommand: '',
    useRsync: true,
    startGdbServer: false,
    gdbServerPort: 2345,
    dockerExecutable: 'docker',
    dockerImage: '',
    dockerContainerName: '',
    dockerWorkspace: '/workspace',
    dockerBuildCommand: '',
    dockerRunCommand: '',
    dockerArguments: [],
    dockerKeepContainer: false,
    dockerForwardDisplay: false,
    dockerHostNetwork: false,
    emsdkRoot: '',
    emsdkEnvironmentScript: '',
    wasmServerExecutable: '',
    wasmServerPort: 8000,
    wasmHtmlEntry: '',
    wasmOpenBrowser: true,
    wasmServerArguments: [],
    androidSdkRoot: '',
    androidNdkRoot: '',
    androidJdkRoot: '',
    androidDeployQtPath: '',
    androidAdbPath: '',
    androidEmulatorPath: '',
    androidAvdManagerPath: '',
    androidSdkManagerPath: '',
    androidAbis: ['arm64-v8a'],
    androidBuildAllAbis: false,
    androidCompileSdk: 36,
    androidTargetSdk: 36,
    androidMinSdk: 28,
    androidBuildToolsVersion: '36.0.0',
    androidPackageName: '',
    androidAppName: '',
    androidVersionCode: 1,
    androidVersionName: '1.0.0',
    androidPackageFormat: 'apk',
    androidDeviceSerial: '',
    androidAvdName: '',
    androidLogcatFilter: '*:V',
    androidInstallReplace: true,
    androidUninstallBeforeInstall: false,
    androidOpenLogcatAfterRun: false,
    androidGradleArguments: [],
    androidCMakeArguments: [],
    androidKeystore: '',
    androidKeystoreAlias: '',
    androidStorePasswordEnvironment: 'QPM_ANDROID_STORE_PASSWORD',
    androidKeyPasswordEnvironment: 'QPM_ANDROID_KEY_PASSWORD'
  };
}

function normalizePlatformProfile(raw: unknown, fallbackId: string, kitId: string, buildProfileId: string, runProfileId: string, deployProfileId: string, debugProfileId: string): QtPlatformProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const fallback = createDefaultPlatformProfile(kitId, buildProfileId, runProfileId, deployProfileId, debugProfileId);
  const typeValues: QtPlatformType[] = ['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android'];
  const buildLocationValues: QtPlatformBuildLocation[] = ['local', 'remote', 'container'];
  const environmentValue = objectValue(value.environment);
  const environment: Record<string, string> = {};
  for (const [key, entry] of Object.entries(environmentValue)) if (key.trim() && typeof entry === 'string') environment[key.trim()] = entry;
  return {
    ...fallback,
    id: normalizeProfileId(optionalString(value.id) || fallbackId),
    name: optionalString(value.name) || optionalString(value.id) || fallbackId,
    type: typeValues.includes(value.type as QtPlatformType) ? value.type as QtPlatformType : fallback.type,
    kitId: normalizeProfileId(optionalString(value.kitId) || kitId),
    buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId),
    runProfileId: normalizeProfileId(optionalString(value.runProfileId) || runProfileId),
    deployProfileId: normalizeProfileId(optionalString(value.deployProfileId) || deployProfileId),
    debugProfileId: normalizeProfileId(optionalString(value.debugProfileId) || debugProfileId),
    buildLocation: buildLocationValues.includes(value.buildLocation as QtPlatformBuildLocation) ? value.buildLocation as QtPlatformBuildLocation : fallback.buildLocation,
    environment,
    sysroot: optionalString(value.sysroot),
    sshHost: optionalString(value.sshHost),
    sshUser: optionalString(value.sshUser),
    sshPort: normalizePort(value.sshPort, fallback.sshPort),
    sshExecutable: optionalString(value.sshExecutable) || fallback.sshExecutable,
    scpExecutable: optionalString(value.scpExecutable) || fallback.scpExecutable,
    rsyncExecutable: optionalString(value.rsyncExecutable) || fallback.rsyncExecutable,
    remoteProjectDirectory: optionalString(value.remoteProjectDirectory) || fallback.remoteProjectDirectory,
    remoteDeployDirectory: optionalString(value.remoteDeployDirectory) || fallback.remoteDeployDirectory,
    remoteBuildCommand: optionalString(value.remoteBuildCommand),
    remoteRunCommand: optionalString(value.remoteRunCommand),
    useRsync: booleanValue(value.useRsync, fallback.useRsync),
    startGdbServer: booleanValue(value.startGdbServer, fallback.startGdbServer),
    gdbServerPort: normalizePort(value.gdbServerPort, fallback.gdbServerPort),
    dockerExecutable: optionalString(value.dockerExecutable) || fallback.dockerExecutable,
    dockerImage: optionalString(value.dockerImage),
    dockerContainerName: optionalString(value.dockerContainerName),
    dockerWorkspace: optionalString(value.dockerWorkspace) || fallback.dockerWorkspace,
    dockerBuildCommand: optionalString(value.dockerBuildCommand),
    dockerRunCommand: optionalString(value.dockerRunCommand),
    dockerArguments: normalizeStringArray(value.dockerArguments),
    dockerKeepContainer: booleanValue(value.dockerKeepContainer, fallback.dockerKeepContainer),
    dockerForwardDisplay: booleanValue(value.dockerForwardDisplay, fallback.dockerForwardDisplay),
    dockerHostNetwork: booleanValue(value.dockerHostNetwork, fallback.dockerHostNetwork),
    emsdkRoot: optionalString(value.emsdkRoot),
    emsdkEnvironmentScript: optionalString(value.emsdkEnvironmentScript),
    wasmServerExecutable: optionalString(value.wasmServerExecutable),
    wasmServerPort: normalizePort(value.wasmServerPort, fallback.wasmServerPort),
    wasmHtmlEntry: optionalString(value.wasmHtmlEntry),
    wasmOpenBrowser: booleanValue(value.wasmOpenBrowser, fallback.wasmOpenBrowser),
    wasmServerArguments: normalizeStringArray(value.wasmServerArguments),
    androidSdkRoot: optionalString(value.androidSdkRoot),
    androidNdkRoot: optionalString(value.androidNdkRoot),
    androidJdkRoot: optionalString(value.androidJdkRoot),
    androidDeployQtPath: optionalString(value.androidDeployQtPath),
    androidAdbPath: optionalString(value.androidAdbPath),
    androidEmulatorPath: optionalString(value.androidEmulatorPath),
    androidAvdManagerPath: optionalString(value.androidAvdManagerPath),
    androidSdkManagerPath: optionalString(value.androidSdkManagerPath),
    androidAbis: normalizeAndroidAbis(value.androidAbis, fallback.androidAbis),
    androidBuildAllAbis: booleanValue(value.androidBuildAllAbis, fallback.androidBuildAllAbis),
    androidCompileSdk: normalizeAndroidApi(value.androidCompileSdk, fallback.androidCompileSdk),
    androidTargetSdk: normalizeAndroidApi(value.androidTargetSdk, fallback.androidTargetSdk),
    androidMinSdk: normalizeAndroidApi(value.androidMinSdk, fallback.androidMinSdk),
    androidBuildToolsVersion: optionalString(value.androidBuildToolsVersion) || fallback.androidBuildToolsVersion,
    androidPackageName: normalizeAndroidPackageName(optionalString(value.androidPackageName)),
    androidAppName: optionalString(value.androidAppName),
    androidVersionCode: normalizePositiveInteger(value.androidVersionCode, fallback.androidVersionCode),
    androidVersionName: optionalString(value.androidVersionName) || fallback.androidVersionName,
    androidPackageFormat: value.androidPackageFormat === 'aab' || value.androidPackageFormat === 'aar' ? value.androidPackageFormat : 'apk',
    androidDeviceSerial: optionalString(value.androidDeviceSerial),
    androidAvdName: optionalString(value.androidAvdName),
    androidLogcatFilter: optionalString(value.androidLogcatFilter) || fallback.androidLogcatFilter,
    androidInstallReplace: booleanValue(value.androidInstallReplace, fallback.androidInstallReplace),
    androidUninstallBeforeInstall: booleanValue(value.androidUninstallBeforeInstall, fallback.androidUninstallBeforeInstall),
    androidOpenLogcatAfterRun: booleanValue(value.androidOpenLogcatAfterRun, fallback.androidOpenLogcatAfterRun),
    androidGradleArguments: normalizeStringArray(value.androidGradleArguments),
    androidCMakeArguments: normalizeStringArray(value.androidCMakeArguments),
    androidKeystore: optionalString(value.androidKeystore),
    androidKeystoreAlias: optionalString(value.androidKeystoreAlias),
    androidStorePasswordEnvironment: optionalString(value.androidStorePasswordEnvironment) || fallback.androidStorePasswordEnvironment,
    androidKeyPasswordEnvironment: optionalString(value.androidKeyPasswordEnvironment) || fallback.androidKeyPasswordEnvironment
  };
}

const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'] as const;

function normalizeAndroidAbis(value: unknown, fallback: string[]): string[] {
  const requested = normalizeStringArray(value);
  const result = requested.filter((entry) => (ANDROID_ABIS as readonly string[]).includes(entry));
  return result.length ? [...new Set(result)] : [...fallback];
}

function normalizeAndroidApi(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 21 && parsed <= 99 ? parsed : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAndroidPackageName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_.]+/g, '_').replace(/^\.+|\.+$/g, '');
}

function normalizePort(value: unknown, fallback: number): number {
  const candidate = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(candidate) && candidate > 0 && candidate <= 65535 ? candidate : fallback;
}

function normalizeKitProfile(raw: unknown, fallbackId: string): QtKitProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const id = normalizeProfileId(optionalString(value.id) || fallbackId);
  const architecture = value.architecture === 'x86' || value.architecture === 'x64' ? value.architecture : 'auto';
  const debuggerType: QtDebuggerType = value.debuggerType === 'gdb' || value.debuggerType === 'lldb' || value.debuggerType === 'cdb' || value.debuggerType === 'cppvsdbg' ? value.debuggerType : 'auto';
  const compilerFamily = value.compilerFamily === 'mingw' || value.compilerFamily === 'msvc' || value.compilerFamily === 'clang' || value.compilerFamily === 'gcc' || value.compilerFamily === 'emscripten' || value.compilerFamily === 'unknown' ? value.compilerFamily : undefined;
  const deviceValues: QtDeviceType[] = ['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android'];
  const deviceType = deviceValues.includes(value.deviceType as QtDeviceType) ? value.deviceType as QtDeviceType : 'desktop';
  return {
    id,
    name: optionalString(value.name) || id,
    ...(optionalString(value.qtInstallation) ? { qtInstallation: optionalString(value.qtInstallation) } : {}),
    ...(optionalString(value.cCompilerPath) ? { cCompilerPath: optionalString(value.cCompilerPath) } : {}),
    ...(optionalString(value.compilerPath) ? { compilerPath: optionalString(value.compilerPath) } : {}),
    ...(optionalString(value.debuggerPath) ? { debuggerPath: optionalString(value.debuggerPath) } : {}),
    ...(compilerFamily ? { compilerFamily } : {}),
    ...(optionalString(value.compilerTargetTriple) ? { compilerTargetTriple: optionalString(value.compilerTargetTriple) } : {}),
    ...(optionalString(value.compilerVersion) ? { compilerVersion: optionalString(value.compilerVersion) } : {}),
    ...(value.compatibility === 'compatible' || value.compatibility === 'incompatible' || value.compatibility === 'unknown' ? { compatibility: value.compatibility } : {}),
    ...(optionalString(value.diagnostic) ? { diagnostic: optionalString(value.diagnostic) } : {}),
    ...(optionalString(value.environmentScript) ? { environmentScript: optionalString(value.environmentScript) } : {}),
    ...(optionalString(value.qmakePath) ? { qmakePath: optionalString(value.qmakePath) } : {}),
    ...(optionalString(value.cmakePath) ? { cmakePath: optionalString(value.cmakePath) } : {}),
    ...(optionalString(value.buildToolPath) ? { buildToolPath: optionalString(value.buildToolPath) } : {}),
    ...(optionalString(value.generator) ? { generator: optionalString(value.generator) } : {}),
    architecture,
    debuggerType,
    deviceType
  };
}

function normalizeBuildProfile(raw: unknown, fallbackVariant: QtBuildVariantName, defaultKitId: string, fallback: QtBuildProfile): QtBuildProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const variant: QtBuildVariantName = value.variant === 'release' ? 'release' : fallbackVariant;
  const id = normalizeProfileId(optionalString(value.id) || variant);
  return {
    id,
    name: optionalString(value.name) || (variant === 'release' ? 'Release' : 'Debug'),
    variant,
    kitId: normalizeProfileId(optionalString(value.kitId) || defaultKitId),
    system: normalizeBuildSystem(value.system),
    cppStandard: optionalString(value.cppStandard) || fallback.cppStandard,
    outputDirectory: normalizeRelativeDirectory(optionalString(value.outputDirectory) || fallback.outputDirectory),
    generatedDirectory: normalizeRelativeDirectory(optionalString(value.generatedDirectory) || fallback.generatedDirectory),
    defines: normalizeStringArray(value.defines),
    compilerFlags: normalizeStringArray(value.compilerFlags),
    linkerFlags: normalizeStringArray(value.linkerFlags),
    autoMoc: booleanValue(value.autoMoc, fallback.autoMoc),
    autoUic: booleanValue(value.autoUic, fallback.autoUic),
    autoRcc: booleanValue(value.autoRcc, fallback.autoRcc),
    parallelJobs: normalizeNonNegativeInteger(value.parallelJobs, fallback.parallelJobs),
    configureArguments: normalizeStringArray(value.configureArguments),
    buildArguments: normalizeStringArray(value.buildArguments),
    cleanArguments: normalizeStringArray(value.cleanArguments),
    sourceDirectory: normalizeRelativeDirectoryAllowDot(optionalString(value.sourceDirectory) || fallback.sourceDirectory),
    projectFile: normalizeOptionalRelativePath(optionalString(value.projectFile)),
    cmakeConfigurePreset: optionalString(value.cmakeConfigurePreset),
    cmakeBuildPreset: optionalString(value.cmakeBuildPreset),
    generateProjectFiles: booleanValue(value.generateProjectFiles, fallback.generateProjectFiles),
    precompiledHeader: normalizeOptionalRelativePath(optionalString(value.precompiledHeader)),
    unityBuild: booleanValue(value.unityBuild, fallback.unityBuild),
    useResponseFiles: booleanValue(value.useResponseFiles, fallback.useResponseFiles)
  };
}

function normalizeRunProfile(raw: unknown, fallbackId: string, buildProfileId: string): QtRunProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const environmentValue = objectValue(value.environment);
  const environment: Record<string, string> = {};
  for (const [key, entry] of Object.entries(environmentValue)) if (typeof entry === 'string' && key.trim()) environment[key.trim()] = entry;
  const id = normalizeProfileId(optionalString(value.id) || fallbackId);
  return { id, name: optionalString(value.name) || id, buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId), arguments: optionalString(value.arguments), workingDirectory: optionalString(value.workingDirectory), environment };
}

function normalizeDeployProfile(raw: unknown, fallbackId: string, buildProfileId: string): QtDeployProfile | undefined {
  const value = objectValue(raw);
  if (!Object.keys(value).length) return undefined;
  const id = normalizeProfileId(optionalString(value.id) || fallbackId);
  return { id, name: optionalString(value.name) || id, buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId), enabled: booleanValue(value.enabled, false), translations: booleanValue(value.translations, false) };
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}


function normalizeBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}
function normalizeRelativeDirectoryAllowDot(value: string): string {
  const text = value.trim();
  return text === '.' || text === '' ? '.' : normalizeRelativeDirectory(text);
}

function normalizeOptionalRelativePath(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (path.isAbsolute(text) || text.split(/[\/]+/).includes('..')) {
    throw new Error(`Qt project paths must stay inside the project directory: ${text}`);
  }
  return normalizeManifestPath(text);
}

function normalizeProfileId(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

function selectExistingId<T extends { id: string }>(requested: string, entries: T[], fallback: string): string {
  return entries.some((entry) => entry.id === requested) ? requested : fallback;
}

function normalizeBuildSystem(value: unknown): QtBuildSystem {
  return value === 'qmake' || value === 'cmake' ? value : 'direct';
}

export function resolveQtProjectFiles(manifestPath: string, manifest = readQtProjectManifest(manifestPath)): ResolvedQtProjectFiles {
  const root = path.dirname(manifestPath);
  const resolved = {} as ResolvedQtProjectFiles;
  for (const key of FILE_KEYS) {
    resolved[key] = manifest.files[key].map((entry) => path.resolve(root, entry));
  }
  return resolved;
}

export function qtManifestToQpmProject(manifestPath: string, manifest = readQtProjectManifest(manifestPath)): QpmProject {
  const resolved = resolveQtProjectFiles(manifestPath, manifest);
  const files: QpmProjectFile[] = [];
  let id = 1;
  const add = (entries: string[], type: string, folder: string): void => {
    for (const absolutePath of entries) {
      files.push({
        sectionName: `qt:${folder}:${id}`,
        id: id++,
        type,
        folder,
        relativePath: toProjectRelativePath(manifestPath, absolutePath),
        absolutePath,
        excluded: false,
        compileIntoObjectFile: isSourcePath(absolutePath),
        exists: fs.existsSync(absolutePath)
      });
    }
  };
  add(resolved.sources, 'CSource', 'Source Files');
  add(resolved.headers, 'Include', 'Header Files');
  add(resolved.forms, 'Qt Form', 'Forms');
  add(resolved.resources, 'Qt Resource', 'Resources');
  add(resolved.qml, 'QML', 'QML Files');
  add(resolved.translations, 'Qt Translation', 'Translations');
  add(resolved.other, 'Other', 'Other Files');
  return {
    path: manifestPath,
    name: manifest.name,
    targetType: targetTypeForKind(manifest.kind),
    folders: ['Source Files', 'Header Files', 'Forms', 'Resources', 'QML Files', 'Translations', 'Other Files'],
    files
  };
}

export function qtManifestToStandaloneWorkspace(manifestPath: string, manifest = readQtProjectManifest(manifestPath)): QpmWorkspace {
  return {
    path: manifestPath,
    name: manifest.name,
    activeProjectIndex: 1,
    projects: [{
      index: 1,
      relativePath: path.basename(manifestPath),
      absolutePath: manifestPath,
      name: manifest.name,
      exists: fs.existsSync(manifestPath)
    }]
  };
}

export function qtTargetPath(manifestPath: string, mode: QpmBuildMode, manifest = readQtProjectManifest(manifestPath)): string {
  const root = path.dirname(manifestPath);
  const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
  const profile = getActiveQtBuildProfile(manifest, mode);
  return path.resolve(root, profile.outputDirectory, modeFolder, targetFileName(manifest));
}

export function qtImportLibraryPath(manifestPath: string, mode: QpmBuildMode, manifest = readQtProjectManifest(manifestPath)): string | undefined {
  if (manifest.kind !== 'shared-library' || process.platform !== 'win32') return undefined;
  const root = path.dirname(manifestPath);
  const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
  const baseName = manifest.targetName.toLowerCase().startsWith('lib') ? manifest.targetName : `lib${manifest.targetName}`;
  const profile = getActiveQtBuildProfile(manifest, mode);
  return path.resolve(root, profile.outputDirectory, modeFolder, `${baseName}.dll.a`);
}

export function qtGeneratedDirectory(manifestPath: string, mode: QpmBuildMode, manifest = readQtProjectManifest(manifestPath)): string {
  const root = path.dirname(manifestPath);
  const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
  const profile = getActiveQtBuildProfile(manifest, mode);
  return path.resolve(root, profile.outputDirectory, modeFolder, profile.generatedDirectory);
}

export function qtObjectDirectory(manifestPath: string, mode: QpmBuildMode, manifest = readQtProjectManifest(manifestPath)): string {
  const root = path.dirname(manifestPath);
  const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
  const profile = getActiveQtBuildProfile(manifest, mode);
  return path.resolve(root, profile.outputDirectory, modeFolder, 'obj');
}

export function addFilesToQtManifest(manifestPath: string, filePaths: string[]): number {
  const manifest = readQtProjectManifest(manifestPath);
  const root = path.dirname(manifestPath);
  let added = 0;
  for (const filePath of filePaths) {
    const key = fileCategoryForPath(filePath);
    const relative = normalizeManifestPath(path.relative(root, path.resolve(filePath)));
    const allExisting = FILE_KEYS.flatMap((candidate) => manifest.files[candidate].map((entry) => entry.toLowerCase()));
    if (allExisting.includes(relative.toLowerCase())) continue;
    manifest.files[key].push(relative);
    added++;
  }
  for (const key of FILE_KEYS) manifest.files[key].sort((a, b) => a.localeCompare(b));
  if (added > 0) writeQtProjectManifest(manifestPath, manifest);
  return added;
}

export function removeFileFromQtManifest(manifestPath: string, filePath: string): boolean {
  const manifest = readQtProjectManifest(manifestPath);
  const relative = normalizeManifestPath(path.relative(path.dirname(manifestPath), path.resolve(filePath))).toLowerCase();
  let changed = false;
  for (const key of FILE_KEYS) {
    const before = manifest.files[key].length;
    manifest.files[key] = manifest.files[key].filter((entry) => normalizeManifestPath(entry).toLowerCase() !== relative);
    changed ||= manifest.files[key].length !== before;
  }
  if (changed) writeQtProjectManifest(manifestPath, manifest);
  return changed;
}

export function fileCategoryForPath(filePath: string): keyof QtProjectFiles {
  switch (path.extname(filePath).toLowerCase()) {
    case '.c': case '.cc': case '.cpp': case '.cxx': return 'sources';
    case '.h': case '.hh': case '.hpp': case '.hxx': return 'headers';
    case '.ui': return 'forms';
    case '.qrc': return 'resources';
    case '.qml': case '.js': case '.mjs': return 'qml';
    case '.ts': case '.qm': return 'translations';
    default: return 'other';
  }
}

export function targetTypeForKind(kind: QtProjectKind): string {
  if (kind === 'shared-library') return 'Dynamic Link Library';
  if (kind === 'static-library') return 'Static Library';
  return 'Executable';
}

export function targetExtensionForKind(kind: QtProjectKind, deviceType?: QtDeviceType): string {
  const device = deviceType ?? 'desktop';
  if (kind === 'static-library') return '.a';
  if (kind === 'shared-library') {
    if (device === 'webassembly') return '.wasm';
    if (device === 'linux-local' || device === 'remote-linux' || device === 'docker') return '.so';
    return process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
  }
  if (device === 'webassembly') return '.html';
  if (device === 'android') return '.apk';
  if (device === 'linux-local' || device === 'remote-linux' || device === 'docker') return '';
  return process.platform === 'win32' ? '.exe' : '';
}

function targetFileName(manifest: QtProjectManifest): string {
  const device = getActiveQtPlatformProfile(manifest)?.type ?? getActiveQtKitProfile(manifest)?.deviceType ?? 'desktop';
  const extension = targetExtensionForKind(manifest.kind, device);
  if (manifest.kind === 'static-library') {
    const baseName = manifest.targetName.toLowerCase().startsWith('lib') ? manifest.targetName : `lib${manifest.targetName}`;
    return `${baseName}${extension}`;
  }
  if (manifest.kind === 'shared-library' && extension !== '.dll') {
    const baseName = manifest.targetName.toLowerCase().startsWith('lib') ? manifest.targetName : `lib${manifest.targetName}`;
    return `${baseName}${extension}`;
  }
  return `${manifest.targetName}${extension}`;
}

export function isReleaseBuildMode(mode: QpmBuildMode): boolean {
  return mode === 'release' || mode === 'release64';
}

export function defaultModulesForKind(kind: QtProjectKind): string[] {
  switch (kind) {
    case 'widgets-application': return ['Core', 'Gui', 'Widgets'];
    case 'quick-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickControls2'];
    case 'test-application': return ['Core', 'Test'];
    case 'quick-test-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickTest', 'Test'];
    case 'console-application': return ['Core'];
    case 'shared-library':
    case 'static-library': return ['Core'];
  }
}

function normalizeKind(value: unknown, manifestPath: string): QtProjectKind {
  const allowed: QtProjectKind[] = ['widgets-application', 'console-application', 'quick-application', 'test-application', 'quick-test-application', 'shared-library', 'static-library'];
  if (typeof value === 'string' && allowed.includes(value as QtProjectKind)) return value as QtProjectKind;
  throw new Error(`Invalid Qt project manifest ${manifestPath}: unsupported kind ${String(value)}.`);
}


function defaultTestingConfiguration(kind: QtProjectKind): QtTestingConfiguration {
  const framework: QtTestFramework = kind === 'test-application'
    ? 'qttest'
    : kind === 'quick-test-application'
      ? 'qtquicktest'
      : 'auto';
  return {
    framework,
    buildBeforeRun: true,
    timeoutMs: 120000,
    arguments: [],
    environment: {},
    useOffscreenPlatform: false,
    parallelJobs: 0,
    stopOnFailure: false,
    repeatMode: 'never',
    repeatCount: 1,
    historyLimit: 100,
    ctest: {
      executable: '',
      buildDirectory: '',
      preset: '',
      configuration: '',
      labelRegex: '',
      nameRegex: '',
      excludeRegex: '',
      outputOnFailure: true
    },
    boost: {
      logLevel: 'test_suite',
      reportLevel: 'short',
      randomSeed: 0,
      catchSystemErrors: true
    }
  };
}

function defaultQualityConfiguration(): QtQualityConfiguration {
  return {
    clangTidyChecks: 'bugprone-*,performance-*,portability-*,readability-*,-readability-magic-numbers',
    clazyChecks: 'level0,level1',
    headerFilter: '.*'
  };
}

function defaultProfilingConfiguration(): QtProfilingConfiguration {
  return {
    outputDirectory: '.qpm/profiling',
    buildBeforeRun: true,
    timeoutMs: 300000,
    arguments: [],
    environment: {},
    qml: {
      enabled: true,
      host: '127.0.0.1',
      port: 3769,
      services: 'CanvasFrameRate,EngineControl,DebugMessages',
      outputFile: '${target}-qml.qtd',
      profilerPath: ''
    },
    cpu: {
      tool: 'auto',
      samplingFrequency: 99,
      callgrindCacheSimulation: false,
      callgrindBranchSimulation: false,
      outputFile: '${target}-cpu'
    },
    memory: {
      tool: 'auto',
      leakCheck: 'full',
      trackOrigins: true,
      showReachable: false,
      outputFile: '${target}-memcheck.xml'
    },
    cppcheck: {
      enabled: true,
      checks: 'warning,style,performance,portability',
      inconclusive: false,
      suppressionsFile: '',
      additionalArguments: []
    },
    tracing: {
      tool: 'auto',
      followForks: false,
      timestamps: true,
      outputFile: '${target}-trace.log'
    }
  };
}

function defaultPackagingConfiguration(name: string): QtPackagingConfiguration {
  return {
    enabled: true,
    productName: name,
    productVersion: '1.0.0',
    companyName: '',
    description: `${name} Qt application`,
    copyright: '',
    identifier: `com.example.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    icon: '',
    licenseFile: '',
    readmeFile: '',
    outputDirectory: 'dist',
    packageNamePattern: '${productName}-${version}-${platform}-${arch}',
    archiveFormat: 'zip',
    cleanOutput: true,
    buildBeforePackaging: true,
    includeQtRuntime: true,
    includeTranslations: true,
    includeDebugSymbols: false,
    extraFiles: [],
    windows: {
      embedVersionResource: true,
      fileDescription: `${name} Qt application`,
      internalName: name,
      originalFilename: `${name}.exe`,
      executionLevel: 'asInvoker',
      dpiAwareness: 'per-monitor-v2',
      manifestFile: '',
      resourceCompilerPath: ''
    },
    linux: {
      generateDesktopEntry: true,
      appId: `com.example.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      categories: ['Utility'],
      comment: `${name} Qt application`,
      installPrefix: '/usr/local'
    }
  };
}

function normalizeTestingConfiguration(raw: unknown, kind: QtProjectKind): QtTestingConfiguration {
  const fallback = defaultTestingConfiguration(kind);
  const value = objectValue(raw);
  const frameworkValues: QtTestFramework[] = ['auto', 'qttest', 'qtquicktest', 'gtest', 'catch2', 'boost', 'ctest'];
  const framework = frameworkValues.includes(value.framework as QtTestFramework) ? value.framework as QtTestFramework : fallback.framework;
  const timeoutCandidate = typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs) ? Math.floor(value.timeoutMs) : fallback.timeoutMs;
  const environmentValue = objectValue(value.environment);
  const environment: Record<string, string> = {};
  for (const [key, entry] of Object.entries(environmentValue)) {
    if (key.trim() && typeof entry === 'string') environment[key.trim()] = entry;
  }
  const repeatModes: QtTestRepeatMode[] = ['never', 'until-fail', 'after-timeout'];
  const repeatMode = repeatModes.includes(value.repeatMode as QtTestRepeatMode) ? value.repeatMode as QtTestRepeatMode : fallback.repeatMode;
  const ctestValue = objectValue(value.ctest);
  const boostValue = objectValue(value.boost);
  const parallelCandidate = typeof value.parallelJobs === 'number' && Number.isFinite(value.parallelJobs) ? Math.floor(value.parallelJobs) : fallback.parallelJobs;
  const repeatCandidate = typeof value.repeatCount === 'number' && Number.isFinite(value.repeatCount) ? Math.floor(value.repeatCount) : fallback.repeatCount;
  const historyCandidate = typeof value.historyLimit === 'number' && Number.isFinite(value.historyLimit) ? Math.floor(value.historyLimit) : fallback.historyLimit;
  const boostSeedCandidate = typeof boostValue.randomSeed === 'number' && Number.isFinite(boostValue.randomSeed) ? Math.floor(boostValue.randomSeed) : fallback.boost.randomSeed;
  return {
    framework,
    buildBeforeRun: booleanValue(value.buildBeforeRun, fallback.buildBeforeRun),
    timeoutMs: Math.max(1000, Math.min(timeoutCandidate, 3_600_000)),
    arguments: normalizeStringArray(value.arguments),
    environment,
    useOffscreenPlatform: booleanValue(value.useOffscreenPlatform, fallback.useOffscreenPlatform),
    parallelJobs: Math.max(0, Math.min(parallelCandidate, 256)),
    stopOnFailure: booleanValue(value.stopOnFailure, fallback.stopOnFailure),
    repeatMode,
    repeatCount: Math.max(1, Math.min(repeatCandidate, 10_000)),
    historyLimit: Math.max(0, Math.min(historyCandidate, 5_000)),
    ctest: {
      executable: optionalString(ctestValue.executable),
      buildDirectory: optionalString(ctestValue.buildDirectory),
      preset: optionalString(ctestValue.preset),
      configuration: optionalString(ctestValue.configuration),
      labelRegex: optionalString(ctestValue.labelRegex),
      nameRegex: optionalString(ctestValue.nameRegex),
      excludeRegex: optionalString(ctestValue.excludeRegex),
      outputOnFailure: booleanValue(ctestValue.outputOnFailure, fallback.ctest.outputOnFailure)
    },
    boost: {
      logLevel: optionalString(boostValue.logLevel) || fallback.boost.logLevel,
      reportLevel: optionalString(boostValue.reportLevel) || fallback.boost.reportLevel,
      randomSeed: Math.max(0, boostSeedCandidate),
      catchSystemErrors: booleanValue(boostValue.catchSystemErrors, fallback.boost.catchSystemErrors)
    }
  };
}

function normalizeQualityConfiguration(raw: unknown): QtQualityConfiguration {
  const fallback = defaultQualityConfiguration();
  const value = objectValue(raw);
  const coverageBuildProfileId = optionalString(value.coverageBuildProfileId);
  return {
    clangTidyChecks: optionalString(value.clangTidyChecks) || fallback.clangTidyChecks,
    clazyChecks: optionalString(value.clazyChecks) || fallback.clazyChecks,
    headerFilter: optionalString(value.headerFilter) || fallback.headerFilter,
    ...(coverageBuildProfileId ? { coverageBuildProfileId } : {})
  };
}

function normalizeProfilingConfiguration(raw: unknown): QtProfilingConfiguration {
  const fallback = defaultProfilingConfiguration();
  const value = objectValue(raw);
  const qml = objectValue(value.qml);
  const cpu = objectValue(value.cpu);
  const memory = objectValue(value.memory);
  const cppcheck = objectValue(value.cppcheck);
  const tracing = objectValue(value.tracing);
  const environmentValue = objectValue(value.environment);
  const environment: Record<string, string> = {};
  for (const [key, entry] of Object.entries(environmentValue)) {
    if (key.trim() && typeof entry === 'string') environment[key.trim()] = entry;
  }
  const cpuTools: QtCpuProfilerTool[] = ['auto', 'perf', 'callgrind'];
  const memoryTools: QtMemoryProfilerTool[] = ['auto', 'valgrind-memcheck', 'heob'];
  const traceTools: QtTraceTool[] = ['auto', 'strace', 'none'];
  const leakChecks = ['summary', 'full'] as const;
  return {
    outputDirectory: normalizeRelativeDirectory(optionalString(value.outputDirectory) || fallback.outputDirectory),
    buildBeforeRun: booleanValue(value.buildBeforeRun, fallback.buildBeforeRun),
    timeoutMs: normalizeBoundedInteger(value.timeoutMs, fallback.timeoutMs, 1000, 3_600_000),
    arguments: normalizeStringArray(value.arguments),
    environment,
    qml: {
      enabled: booleanValue(qml.enabled, fallback.qml.enabled),
      host: optionalString(qml.host) || fallback.qml.host,
      port: normalizePort(qml.port, fallback.qml.port),
      services: optionalString(qml.services) || fallback.qml.services,
      outputFile: optionalString(qml.outputFile) || fallback.qml.outputFile,
      profilerPath: optionalString(qml.profilerPath)
    },
    cpu: {
      tool: cpuTools.includes(cpu.tool as QtCpuProfilerTool) ? cpu.tool as QtCpuProfilerTool : fallback.cpu.tool,
      samplingFrequency: normalizeBoundedInteger(cpu.samplingFrequency, fallback.cpu.samplingFrequency, 1, 100000),
      callgrindCacheSimulation: booleanValue(cpu.callgrindCacheSimulation, fallback.cpu.callgrindCacheSimulation),
      callgrindBranchSimulation: booleanValue(cpu.callgrindBranchSimulation, fallback.cpu.callgrindBranchSimulation),
      outputFile: optionalString(cpu.outputFile) || fallback.cpu.outputFile
    },
    memory: {
      tool: memoryTools.includes(memory.tool as QtMemoryProfilerTool) ? memory.tool as QtMemoryProfilerTool : fallback.memory.tool,
      leakCheck: leakChecks.includes(memory.leakCheck as typeof leakChecks[number]) ? memory.leakCheck as typeof leakChecks[number] : fallback.memory.leakCheck,
      trackOrigins: booleanValue(memory.trackOrigins, fallback.memory.trackOrigins),
      showReachable: booleanValue(memory.showReachable, fallback.memory.showReachable),
      outputFile: optionalString(memory.outputFile) || fallback.memory.outputFile
    },
    cppcheck: {
      enabled: booleanValue(cppcheck.enabled, fallback.cppcheck.enabled),
      checks: optionalString(cppcheck.checks) || fallback.cppcheck.checks,
      inconclusive: booleanValue(cppcheck.inconclusive, fallback.cppcheck.inconclusive),
      suppressionsFile: optionalString(cppcheck.suppressionsFile),
      additionalArguments: normalizeStringArray(cppcheck.additionalArguments)
    },
    tracing: {
      tool: traceTools.includes(tracing.tool as QtTraceTool) ? tracing.tool as QtTraceTool : fallback.tracing.tool,
      followForks: booleanValue(tracing.followForks, fallback.tracing.followForks),
      timestamps: booleanValue(tracing.timestamps, fallback.tracing.timestamps),
      outputFile: optionalString(tracing.outputFile) || fallback.tracing.outputFile
    }
  };
}

function normalizePackagingConfiguration(raw: unknown, name: string, targetName: string): QtPackagingConfiguration {
  const fallback = defaultPackagingConfiguration(name);
  const value = objectValue(raw);
  const windows = objectValue(value.windows);
  const linux = objectValue(value.linux);
  const archiveFormat: QtPackageArchiveFormat = value.archiveFormat === 'folder' || value.archiveFormat === 'tar-gz' ? value.archiveFormat : 'zip';
  const executionLevel: QtWindowsExecutionLevel = windows.executionLevel === 'highestAvailable' || windows.executionLevel === 'requireAdministrator' ? windows.executionLevel : 'asInvoker';
  const dpiAwareness: QtWindowsDpiAwareness = windows.dpiAwareness === 'unaware' || windows.dpiAwareness === 'system' || windows.dpiAwareness === 'per-monitor' ? windows.dpiAwareness : 'per-monitor-v2';
  const productName = optionalString(value.productName) || name;
  const identifier = optionalString(value.identifier) || fallback.identifier;
  return {
    enabled: booleanValue(value.enabled, fallback.enabled),
    productName,
    productVersion: normalizeProductVersion(optionalString(value.productVersion) || fallback.productVersion),
    companyName: optionalString(value.companyName),
    description: optionalString(value.description) || `${productName} Qt application`,
    copyright: optionalString(value.copyright),
    identifier,
    icon: optionalString(value.icon),
    licenseFile: optionalString(value.licenseFile),
    readmeFile: optionalString(value.readmeFile),
    outputDirectory: normalizeRelativeDirectory(optionalString(value.outputDirectory) || fallback.outputDirectory),
    packageNamePattern: optionalString(value.packageNamePattern) || fallback.packageNamePattern,
    archiveFormat,
    cleanOutput: booleanValue(value.cleanOutput, fallback.cleanOutput),
    buildBeforePackaging: booleanValue(value.buildBeforePackaging, fallback.buildBeforePackaging),
    includeQtRuntime: booleanValue(value.includeQtRuntime, fallback.includeQtRuntime),
    includeTranslations: booleanValue(value.includeTranslations, fallback.includeTranslations),
    includeDebugSymbols: booleanValue(value.includeDebugSymbols, fallback.includeDebugSymbols),
    extraFiles: normalizeStringArray(value.extraFiles),
    windows: {
      embedVersionResource: booleanValue(windows.embedVersionResource, fallback.windows.embedVersionResource),
      fileDescription: optionalString(windows.fileDescription) || optionalString(value.description) || `${productName} Qt application`,
      internalName: optionalString(windows.internalName) || targetName,
      originalFilename: optionalString(windows.originalFilename) || `${targetName}.exe`,
      executionLevel,
      dpiAwareness,
      manifestFile: optionalString(windows.manifestFile),
      resourceCompilerPath: optionalString(windows.resourceCompilerPath)
    },
    linux: {
      generateDesktopEntry: booleanValue(linux.generateDesktopEntry, fallback.linux.generateDesktopEntry),
      appId: optionalString(linux.appId) || identifier,
      categories: normalizeStringArray(linux.categories).length ? normalizeStringArray(linux.categories) : fallback.linux.categories,
      comment: optionalString(linux.comment) || optionalString(value.description) || `${productName} Qt application`,
      installPrefix: optionalString(linux.installPrefix) || fallback.linux.installPrefix
    }
  };
}

function normalizeProductVersion(value: string): string {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[.-]([0-9A-Za-z.-]+))?$/);
  if (!match) return '1.0.0';
  return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}${match[4] ? `-${match[4]}` : ''}`;
}

function normalizeModules(values: string[]): string[] {
  const normalized = values.map((entry) => entry.trim().replace(/^Qt\d*::/i, '').replace(/^Qt\d*/i, '')).filter(Boolean);
  if (!normalized.some((entry) => entry.toLowerCase() === 'core')) normalized.unshift('Core');
  return [...new Map(normalized.map((entry) => [entry.toLowerCase(), entry])).values()];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))];
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requireNonEmptyString(value: unknown, key: string, manifestPath: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`Invalid Qt project manifest ${manifestPath}: ${key} must be a non-empty string.`);
  return result;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeRelativeDirectory(value: string): string {
  const normalized = normalizeManifestPath(value).replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized) return 'build';
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Qt project output directories must stay inside the project: ${value}`);
  }
  return normalized;
}

function normalizeTargetName(value: string, manifestPath: string): string {
  const normalized = value.trim();
  const reservedStem = normalized.split('.')[0].toUpperCase();
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(reservedStem);
  if (!normalized || normalized !== value || normalized === '.' || normalized === '..' || /[. ]$/.test(normalized) || reserved || /[<>:"/\|?*\x00-\x1f]/.test(normalized)) {
    throw new Error(`Invalid Qt project manifest ${manifestPath}: targetName must be a valid file name.`);
  }
  return normalized;
}

function normalizeManifestPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function toProjectRelativePath(manifestPath: string, absolutePath: string): string {
  return normalizeManifestPath(path.relative(path.dirname(manifestPath), absolutePath));
}

function isSourcePath(filePath: string): boolean {
  return ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(filePath).toLowerCase());
}
