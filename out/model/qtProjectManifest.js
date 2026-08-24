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
exports.QT_PROJECT_SCHEMA_VERSION = exports.QT_PROJECT_SUFFIX = void 0;
exports.isQtProjectManifestPath = isQtProjectManifestPath;
exports.createDefaultQtProjectManifest = createDefaultQtProjectManifest;
exports.readQtProjectManifest = readQtProjectManifest;
exports.writeQtProjectManifest = writeQtProjectManifest;
exports.migrateQtProjectManifestFile = migrateQtProjectManifestFile;
exports.validateAndNormalizeManifest = validateAndNormalizeManifest;
exports.getPersistedQtBuildMode = getPersistedQtBuildMode;
exports.setPersistedQtBuildMode = setPersistedQtBuildMode;
exports.inferQtKitArchitecture = inferQtKitArchitecture;
exports.modeForVariantAndKit = modeForVariantAndKit;
exports.getActiveQtKitProfile = getActiveQtKitProfile;
exports.getActiveQtBuildProfile = getActiveQtBuildProfile;
exports.getQtKitProfileForBuild = getQtKitProfileForBuild;
exports.getActiveQtRunProfile = getActiveQtRunProfile;
exports.getActiveQtDeployProfile = getActiveQtDeployProfile;
exports.getActiveQtDebugProfile = getActiveQtDebugProfile;
exports.getActiveQtPlatformProfile = getActiveQtPlatformProfile;
exports.getQtInstallationPreference = getQtInstallationPreference;
exports.setQtInstallationPreference = setQtInstallationPreference;
exports.synchronizeLegacyProfileMirrors = synchronizeLegacyProfileMirrors;
exports.resolveQtProjectFiles = resolveQtProjectFiles;
exports.qtManifestToQpmProject = qtManifestToQpmProject;
exports.qtManifestToStandaloneWorkspace = qtManifestToStandaloneWorkspace;
exports.qtTargetPath = qtTargetPath;
exports.qtImportLibraryPath = qtImportLibraryPath;
exports.qtGeneratedDirectory = qtGeneratedDirectory;
exports.qtObjectDirectory = qtObjectDirectory;
exports.addFilesToQtManifest = addFilesToQtManifest;
exports.removeFileFromQtManifest = removeFileFromQtManifest;
exports.fileCategoryForPath = fileCategoryForPath;
exports.targetTypeForKind = targetTypeForKind;
exports.targetExtensionForKind = targetExtensionForKind;
exports.isReleaseBuildMode = isReleaseBuildMode;
exports.defaultModulesForKind = defaultModulesForKind;
exports.isQtPythonProject = isQtPythonProject;
exports.qtProjectLanguage = qtProjectLanguage;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.QT_PROJECT_SUFFIX = '.qtproject.json';
exports.QT_PROJECT_SCHEMA_VERSION = 17;
const FILE_KEYS = ['sources', 'headers', 'forms', 'resources', 'qml', 'python', 'translations', 'other'];
function isQtProjectManifestPath(filePath) {
    return filePath.toLowerCase().endsWith(exports.QT_PROJECT_SUFFIX);
}
function createDefaultQtProjectManifest(name, kind, modules) {
    const normalizedModules = normalizeModules(modules ?? defaultModulesForKind(kind));
    const profiles = createDefaultProfiles(undefined);
    return synchronizeLegacyProfileMirrors({
        schemaVersion: exports.QT_PROJECT_SCHEMA_VERSION,
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
        qml: defaultQmlConfiguration(name, kind),
        python: defaultPythonConfiguration(kind),
        dependencies: defaultDependenciesConfiguration(),
        packaging: defaultPackagingConfiguration(name),
        publication: defaultPublicationConfiguration(name),
        files: {
            sources: [], headers: [], forms: [], resources: [], qml: [], python: [], translations: [], other: []
        },
        includeDirectories: ['include'],
        libraryDirectories: [],
        libraries: [],
        defines: []
    });
}
function readQtProjectManifest(manifestPath) {
    if (!isQtProjectManifestPath(manifestPath)) {
        throw new Error(`Not a Qt Project Manager manifest: ${manifestPath}`);
    }
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return validateAndNormalizeManifest(raw, manifestPath);
}
function writeQtProjectManifest(manifestPath, manifest) {
    const normalized = validateAndNormalizeManifest(manifest, manifestPath);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}
function migrateQtProjectManifestFile(manifestPath) {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const raw = JSON.parse(content);
    if (raw.schemaVersion === exports.QT_PROJECT_SCHEMA_VERSION && raw.profiles && typeof raw.profiles === 'object')
        return false;
    const normalized = validateAndNormalizeManifest(raw, manifestPath);
    const backupPath = `${manifestPath}.schema-v${String(raw.schemaVersion ?? 1)}.backup`;
    if (!fs.existsSync(backupPath))
        fs.writeFileSync(backupPath, content, 'utf8');
    fs.writeFileSync(manifestPath, `${JSON.stringify(normalized, null, 2)}
`, 'utf8');
    return true;
}
function validateAndNormalizeManifest(raw, manifestPath = '<memory>') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Invalid Qt project manifest ${manifestPath}: the root value must be an object.`);
    }
    const value = raw;
    const name = requireNonEmptyString(value.name, 'name', manifestPath);
    const kind = normalizeKind(value.kind, manifestPath);
    const qtValue = objectValue(value.qt);
    const buildValue = objectValue(value.build);
    const filesValue = objectValue(value.files);
    const debugValue = objectValue(buildValue.debug);
    const releaseValue = objectValue(buildValue.release);
    const files = {};
    for (const key of FILE_KEYS)
        files[key] = normalizeStringArray(filesValue[key]);
    const majorVersion = qtValue.majorVersion === 5 || qtValue.majorVersion === 6 ? qtValue.majorVersion : 'auto';
    const system = normalizeBuildSystem(buildValue.system);
    const legacyQt = {
        ...(optionalString(qtValue.installation) ? { installation: optionalString(qtValue.installation) } : {}),
        majorVersion,
        modules: normalizeModules(normalizeStringArray(qtValue.modules).length ? normalizeStringArray(qtValue.modules) : defaultModulesForKind(kind)),
        autoMoc: booleanValue(qtValue.autoMoc, true),
        autoUic: booleanValue(qtValue.autoUic, true),
        autoRcc: booleanValue(qtValue.autoRcc, true),
        autoDeploy: booleanValue(qtValue.autoDeploy, false)
    };
    const legacyBuild = {
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
    const normalized = {
        schemaVersion: exports.QT_PROJECT_SCHEMA_VERSION,
        name,
        kind,
        targetName: normalizeTargetName(typeof value.targetName === 'string' ? value.targetName : name, manifestPath),
        qt: legacyQt,
        build: legacyBuild,
        profiles: normalizeProfiles(value.profiles, legacyQt, legacyBuild),
        testing: normalizeTestingConfiguration(value.testing, kind),
        quality: normalizeQualityConfiguration(value.quality),
        profiling: normalizeProfilingConfiguration(value.profiling),
        qml: normalizeQmlConfiguration(value.qml, name, kind),
        python: normalizePythonConfiguration(value.python, kind),
        dependencies: normalizeDependenciesConfiguration(value.dependencies),
        packaging: normalizePackagingConfiguration(value.packaging, name, typeof value.targetName === 'string' ? value.targetName : name),
        publication: normalizePublicationConfiguration(value.publication, name, typeof value.targetName === 'string' ? value.targetName : name, normalizePackagingConfiguration(value.packaging, name, typeof value.targetName === 'string' ? value.targetName : name)),
        files,
        includeDirectories: normalizeStringArray(value.includeDirectories),
        libraryDirectories: normalizeStringArray(value.libraryDirectories),
        libraries: normalizeStringArray(value.libraries),
        defines: normalizeStringArray(value.defines)
    };
    return synchronizeLegacyProfileMirrors(normalized);
}
function getPersistedQtBuildMode(manifest, fallback = 'debug64') {
    const value = manifest.profiles.active.buildMode;
    return isQpmBuildMode(value) ? value : fallback;
}
function setPersistedQtBuildMode(manifest, mode) {
    manifest.profiles.active.buildMode = mode;
}
function inferQtKitArchitecture(kit) {
    if (!kit)
        return 'auto';
    if (kit.architecture === 'x64' || kit.architecture === 'x86')
        return kit.architecture;
    const evidence = [kit.compilerTargetTriple, kit.compilerPath, kit.qtInstallation, kit.name].filter(Boolean).join(' ').toLowerCase();
    if (/x86_64|amd64|mingw_64|msvc[^\s]*_64|\b64[-_ ]?bit\b/.test(evidence))
        return 'x64';
    if (/i[3-6]86|mingw32|msvc[^\s]*_32|\b32[-_ ]?bit\b/.test(evidence))
        return 'x86';
    return 'auto';
}
function modeForVariantAndKit(variant, kit, preferredMode) {
    const inferred = inferQtKitArchitecture(kit);
    const preferred64 = preferredMode === 'debug64' || preferredMode === 'release64';
    const x64 = inferred === 'x64' || (inferred === 'auto' && preferred64);
    return variant === 'release' ? (x64 ? 'release64' : 'release') : (x64 ? 'debug64' : 'debug');
}
function normalizePersistedBuildMode(value, kit) {
    if (isQpmBuildMode(value))
        return value;
    return modeForVariantAndKit('debug', kit, 'debug64');
}
function isQpmBuildMode(value) {
    return value === 'debug' || value === 'release' || value === 'debug64' || value === 'release64';
}
function getActiveQtKitProfile(manifest) {
    return manifest.profiles.kits.find((entry) => entry.id === manifest.profiles.active.kitProfileId)
        ?? manifest.profiles.kits[0];
}
function getActiveQtBuildProfile(manifest, mode) {
    const id = isReleaseBuildMode(mode) ? manifest.profiles.active.releaseBuildProfileId : manifest.profiles.active.debugBuildProfileId;
    return manifest.profiles.builds.find((entry) => entry.id === id)
        ?? manifest.profiles.builds.find((entry) => entry.variant === (isReleaseBuildMode(mode) ? 'release' : 'debug'))
        ?? manifest.profiles.builds[0];
}
function getQtKitProfileForBuild(manifest, mode) {
    const buildProfile = getActiveQtBuildProfile(manifest, mode);
    return manifest.profiles.kits.find((entry) => entry.id === buildProfile.kitId)
        ?? getActiveQtKitProfile(manifest);
}
function getActiveQtRunProfile(manifest) {
    return manifest.profiles.runs.find((entry) => entry.id === manifest.profiles.active.runProfileId)
        ?? manifest.profiles.runs[0];
}
function getActiveQtDeployProfile(manifest) {
    return manifest.profiles.deploys.find((entry) => entry.id === manifest.profiles.active.deployProfileId)
        ?? manifest.profiles.deploys[0];
}
function getActiveQtDebugProfile(manifest) {
    return manifest.profiles.debugs.find((entry) => entry.id === manifest.profiles.active.debugProfileId)
        ?? manifest.profiles.debugs[0];
}
function getActiveQtPlatformProfile(manifest) {
    return manifest.profiles.platforms.find((entry) => entry.id === manifest.profiles.active.platformProfileId)
        ?? manifest.profiles.platforms[0];
}
function getQtInstallationPreference(manifest, mode) {
    const kit = mode ? getQtKitProfileForBuild(manifest, mode) : getActiveQtKitProfile(manifest);
    return kit?.qtInstallation || manifest.qt.installation;
}
function setQtInstallationPreference(manifest, installation) {
    const kit = getActiveQtKitProfile(manifest);
    const normalized = installation?.trim();
    if (normalized) {
        kit.qtInstallation = normalized;
        manifest.qt.installation = normalized;
    }
    else {
        delete kit.qtInstallation;
        delete manifest.qt.installation;
    }
}
function synchronizeLegacyProfileMirrors(manifest) {
    const kit = getActiveQtKitProfile(manifest);
    const debug = getActiveQtBuildProfile(manifest, 'debug64');
    const release = getActiveQtBuildProfile(manifest, 'release64');
    const deploy = getActiveQtDeployProfile(manifest);
    manifest.schemaVersion = exports.QT_PROJECT_SCHEMA_VERSION;
    if (kit?.qtInstallation)
        manifest.qt.installation = kit.qtInstallation;
    else
        delete manifest.qt.installation;
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
function createDefaultProfiles(qtInstallation) {
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
function normalizeProfiles(raw, legacyQt, legacyBuild) {
    const fallback = createDefaultProfiles(legacyQt.installation);
    fallback.builds[0] = { ...fallback.builds[0], system: legacyBuild.system, cppStandard: legacyBuild.cppStandard, outputDirectory: legacyBuild.outputDirectory, generatedDirectory: legacyBuild.generatedDirectory, defines: legacyBuild.debug.defines, compilerFlags: legacyBuild.debug.compilerFlags, linkerFlags: legacyBuild.debug.linkerFlags, autoMoc: legacyQt.autoMoc, autoUic: legacyQt.autoUic, autoRcc: legacyQt.autoRcc };
    fallback.builds[1] = { ...fallback.builds[1], system: legacyBuild.system, cppStandard: legacyBuild.cppStandard, outputDirectory: legacyBuild.outputDirectory, generatedDirectory: legacyBuild.generatedDirectory, defines: legacyBuild.release.defines, compilerFlags: legacyBuild.release.compilerFlags, linkerFlags: legacyBuild.release.linkerFlags, autoMoc: legacyQt.autoMoc, autoUic: legacyQt.autoUic, autoRcc: legacyQt.autoRcc };
    fallback.deploys[0].enabled = legacyQt.autoDeploy;
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return fallback;
    const kits = Array.isArray(value.kits) ? value.kits.map((entry, index) => normalizeKitProfile(entry, `kit-${index + 1}`)).filter((entry) => !!entry) : [];
    if (!kits.length)
        kits.push(...fallback.kits);
    const defaultKitId = kits[0].id;
    const builds = Array.isArray(value.builds) ? value.builds.map((entry, index) => normalizeBuildProfile(entry, index === 1 ? 'release' : 'debug', defaultKitId, fallback.builds[Math.min(index, 1)])).filter((entry) => !!entry) : [];
    if (!builds.some((entry) => entry.variant === 'debug'))
        builds.push({ ...fallback.builds[0], kitId: defaultKitId });
    if (!builds.some((entry) => entry.variant === 'release'))
        builds.push({ ...fallback.builds[1], kitId: defaultKitId });
    const debugBuild = builds.find((entry) => entry.variant === 'debug');
    const releaseBuild = builds.find((entry) => entry.variant === 'release');
    const runs = Array.isArray(value.runs) ? value.runs.map((entry, index) => normalizeRunProfile(entry, `run-${index + 1}`, debugBuild.id)).filter((entry) => !!entry) : [];
    if (!runs.length)
        runs.push({ ...fallback.runs[0], buildProfileId: debugBuild.id });
    const deploys = Array.isArray(value.deploys) ? value.deploys.map((entry, index) => normalizeDeployProfile(entry, `deploy-${index + 1}`, releaseBuild.id)).filter((entry) => !!entry) : [];
    if (!deploys.length)
        deploys.push({ ...fallback.deploys[0], buildProfileId: releaseBuild.id });
    const debugs = Array.isArray(value.debugs) ? value.debugs.map((entry, index) => normalizeDebugProfile(entry, `debug-${index + 1}`, debugBuild.id, runs[0].id)).filter((entry) => !!entry) : [];
    if (!debugs.length)
        debugs.push(createDefaultDebugProfile(debugBuild.id, runs[0].id));
    const platforms = Array.isArray(value.platforms) ? value.platforms.map((entry, index) => normalizePlatformProfile(entry, `platform-${index + 1}`, defaultKitId, debugBuild.id, runs[0].id, deploys[0].id, debugs[0].id)).filter((entry) => !!entry) : [];
    if (!platforms.length)
        platforms.push(createDefaultPlatformProfile(defaultKitId, debugBuild.id, runs[0].id, deploys[0].id, debugs[0].id));
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
function createDefaultDebugProfile(buildProfileId, runProfileId) {
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
function normalizeDebugProfile(raw, fallbackId, buildProfileId, runProfileId) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const fallback = createDefaultDebugProfile(buildProfileId, runProfileId);
    const requestValues = ['launch', 'attach', 'remote-gdb', 'core-dump', 'qml-attach'];
    const debuggerValues = ['auto', 'gdb', 'lldb', 'cdb', 'cppvsdbg'];
    const environmentValue = objectValue(value.environment);
    const sourceMapValue = objectValue(value.sourceFileMap);
    const environment = {};
    const sourceFileMap = {};
    for (const [key, entry] of Object.entries(environmentValue))
        if (key.trim() && typeof entry === 'string')
            environment[key.trim()] = entry;
    for (const [key, entry] of Object.entries(sourceMapValue))
        if (key.trim() && typeof entry === 'string' && entry.trim())
            sourceFileMap[key.trim()] = entry.trim();
    return {
        ...fallback,
        id: normalizeProfileId(optionalString(value.id) || fallbackId),
        name: optionalString(value.name) || optionalString(value.id) || fallbackId,
        request: requestValues.includes(value.request) ? value.request : fallback.request,
        buildProfileId: optionalString(value.buildProfileId) || buildProfileId,
        runProfileId: optionalString(value.runProfileId) || runProfileId,
        debuggerType: debuggerValues.includes(value.debuggerType) ? value.debuggerType : 'auto',
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
function createDefaultPlatformProfile(kitId, buildProfileId, runProfileId, deployProfileId, debugProfileId) {
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
        androidKeyPasswordEnvironment: 'QPM_ANDROID_KEY_PASSWORD',
        appleDeveloperDirectory: '',
        appleXcodebuildPath: '',
        appleXcrunPath: '',
        appleMacDeployQtPath: '',
        appleBundleIdentifier: '',
        appleDeploymentTarget: '',
        appleArchitectures: ['arm64'],
        appleDevelopmentTeam: '',
        appleCodeSignIdentity: '',
        appleProvisioningProfile: '',
        appleEntitlementsFile: '',
        appleAutomaticSigning: true,
        appleAllowProvisioningUpdates: true,
        appleScheme: '',
        appleConfiguration: 'Debug',
        appleSimulatorId: '',
        appleDeviceId: '',
        appleCreateDmg: true,
        appleDmgFileSystem: 'HFS+',
        appleNotaryProfile: '',
        appleStapleAfterNotarization: true,
        appleAppStoreCompliant: false,
        appleHardenedRuntime: true,
        appleTimestamp: true,
        appleAdditionalCMakeArguments: [],
        appleAdditionalXcodebuildArguments: [],
        appleAdditionalMacDeployQtArguments: []
    };
}
function normalizePlatformProfile(raw, fallbackId, kitId, buildProfileId, runProfileId, deployProfileId, debugProfileId) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const fallback = createDefaultPlatformProfile(kitId, buildProfileId, runProfileId, deployProfileId, debugProfileId);
    const typeValues = ['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android', 'macos', 'ios-simulator', 'ios-device'];
    const buildLocationValues = ['local', 'remote', 'container'];
    const environmentValue = objectValue(value.environment);
    const environment = {};
    for (const [key, entry] of Object.entries(environmentValue))
        if (key.trim() && typeof entry === 'string')
            environment[key.trim()] = entry;
    return {
        ...fallback,
        id: normalizeProfileId(optionalString(value.id) || fallbackId),
        name: optionalString(value.name) || optionalString(value.id) || fallbackId,
        type: typeValues.includes(value.type) ? value.type : fallback.type,
        kitId: normalizeProfileId(optionalString(value.kitId) || kitId),
        buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId),
        runProfileId: normalizeProfileId(optionalString(value.runProfileId) || runProfileId),
        deployProfileId: normalizeProfileId(optionalString(value.deployProfileId) || deployProfileId),
        debugProfileId: normalizeProfileId(optionalString(value.debugProfileId) || debugProfileId),
        buildLocation: buildLocationValues.includes(value.buildLocation) ? value.buildLocation : fallback.buildLocation,
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
        androidKeyPasswordEnvironment: optionalString(value.androidKeyPasswordEnvironment) || fallback.androidKeyPasswordEnvironment,
        appleDeveloperDirectory: optionalString(value.appleDeveloperDirectory),
        appleXcodebuildPath: optionalString(value.appleXcodebuildPath),
        appleXcrunPath: optionalString(value.appleXcrunPath),
        appleMacDeployQtPath: optionalString(value.appleMacDeployQtPath),
        appleBundleIdentifier: normalizeAppleBundleIdentifier(optionalString(value.appleBundleIdentifier)),
        appleDeploymentTarget: optionalString(value.appleDeploymentTarget),
        appleArchitectures: normalizeAppleArchitectures(value.appleArchitectures, fallback.appleArchitectures),
        appleDevelopmentTeam: optionalString(value.appleDevelopmentTeam),
        appleCodeSignIdentity: optionalString(value.appleCodeSignIdentity),
        appleProvisioningProfile: optionalString(value.appleProvisioningProfile),
        appleEntitlementsFile: optionalString(value.appleEntitlementsFile),
        appleAutomaticSigning: booleanValue(value.appleAutomaticSigning, fallback.appleAutomaticSigning),
        appleAllowProvisioningUpdates: booleanValue(value.appleAllowProvisioningUpdates, fallback.appleAllowProvisioningUpdates),
        appleScheme: optionalString(value.appleScheme),
        appleConfiguration: value.appleConfiguration === 'Release' ? 'Release' : 'Debug',
        appleSimulatorId: optionalString(value.appleSimulatorId),
        appleDeviceId: optionalString(value.appleDeviceId),
        appleCreateDmg: booleanValue(value.appleCreateDmg, fallback.appleCreateDmg),
        appleDmgFileSystem: value.appleDmgFileSystem === 'APFS' ? 'APFS' : 'HFS+',
        appleNotaryProfile: optionalString(value.appleNotaryProfile),
        appleStapleAfterNotarization: booleanValue(value.appleStapleAfterNotarization, fallback.appleStapleAfterNotarization),
        appleAppStoreCompliant: booleanValue(value.appleAppStoreCompliant, fallback.appleAppStoreCompliant),
        appleHardenedRuntime: booleanValue(value.appleHardenedRuntime, fallback.appleHardenedRuntime),
        appleTimestamp: booleanValue(value.appleTimestamp, fallback.appleTimestamp),
        appleAdditionalCMakeArguments: normalizeStringArray(value.appleAdditionalCMakeArguments),
        appleAdditionalXcodebuildArguments: normalizeStringArray(value.appleAdditionalXcodebuildArguments),
        appleAdditionalMacDeployQtArguments: normalizeStringArray(value.appleAdditionalMacDeployQtArguments)
    };
}
const APPLE_ARCHITECTURES = ['arm64', 'x86_64'];
function normalizeAppleArchitectures(value, fallback) {
    const requested = normalizeStringArray(value);
    const result = requested.filter((entry) => APPLE_ARCHITECTURES.includes(entry));
    return result.length ? [...new Set(result)] : [...fallback];
}
function normalizeAppleBundleIdentifier(value) {
    return value.trim().replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^\.+|\.+$/g, '');
}
const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];
function normalizeAndroidAbis(value, fallback) {
    const requested = normalizeStringArray(value);
    const result = requested.filter((entry) => ANDROID_ABIS.includes(entry));
    return result.length ? [...new Set(result)] : [...fallback];
}
function normalizeAndroidApi(value, fallback) {
    const parsed = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed >= 21 && parsed <= 99 ? parsed : fallback;
}
function normalizePositiveInteger(value, fallback) {
    const parsed = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizeAndroidPackageName(value) {
    return value.trim().replace(/[^A-Za-z0-9_.]+/g, '_').replace(/^\.+|\.+$/g, '');
}
function normalizePort(value, fallback) {
    const candidate = typeof value === 'number' ? Math.floor(value) : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(candidate) && candidate > 0 && candidate <= 65535 ? candidate : fallback;
}
function normalizeKitProfile(raw, fallbackId) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const id = normalizeProfileId(optionalString(value.id) || fallbackId);
    const architecture = value.architecture === 'x86' || value.architecture === 'x64' ? value.architecture : 'auto';
    const debuggerType = value.debuggerType === 'gdb' || value.debuggerType === 'lldb' || value.debuggerType === 'cdb' || value.debuggerType === 'cppvsdbg' ? value.debuggerType : 'auto';
    const compilerFamily = value.compilerFamily === 'mingw' || value.compilerFamily === 'msvc' || value.compilerFamily === 'clang' || value.compilerFamily === 'gcc' || value.compilerFamily === 'emscripten' || value.compilerFamily === 'unknown' ? value.compilerFamily : undefined;
    const deviceValues = ['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android', 'macos', 'ios-simulator', 'ios-device'];
    const deviceType = deviceValues.includes(value.deviceType) ? value.deviceType : 'desktop';
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
function normalizeBuildProfile(raw, fallbackVariant, defaultKitId, fallback) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const variant = value.variant === 'release' ? 'release' : fallbackVariant;
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
function normalizeRunProfile(raw, fallbackId, buildProfileId) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const environmentValue = objectValue(value.environment);
    const environment = {};
    for (const [key, entry] of Object.entries(environmentValue))
        if (typeof entry === 'string' && key.trim())
            environment[key.trim()] = entry;
    const id = normalizeProfileId(optionalString(value.id) || fallbackId);
    return { id, name: optionalString(value.name) || id, buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId), arguments: optionalString(value.arguments), workingDirectory: optionalString(value.workingDirectory), environment };
}
function normalizeDeployProfile(raw, fallbackId, buildProfileId) {
    const value = objectValue(raw);
    if (!Object.keys(value).length)
        return undefined;
    const id = normalizeProfileId(optionalString(value.id) || fallbackId);
    return { id, name: optionalString(value.name) || id, buildProfileId: normalizeProfileId(optionalString(value.buildProfileId) || buildProfileId), enabled: booleanValue(value.enabled, false), translations: booleanValue(value.translations, false) };
}
function normalizeNonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
function normalizeBoundedInteger(value, fallback, minimum, maximum) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}
function normalizeRelativeDirectoryAllowDot(value) {
    const text = value.trim();
    return text === '.' || text === '' ? '.' : normalizeRelativeDirectory(text);
}
function normalizeOptionalRelativePath(value) {
    const text = value.trim();
    if (!text)
        return '';
    if (path.isAbsolute(text) || text.split(/[\/]+/).includes('..')) {
        throw new Error(`Qt project paths must stay inside the project directory: ${text}`);
    }
    return normalizeManifestPath(text);
}
function normalizeProfileId(value) {
    const normalized = value.trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'default';
}
function selectExistingId(requested, entries, fallback) {
    return entries.some((entry) => entry.id === requested) ? requested : fallback;
}
function normalizeBuildSystem(value) {
    return value === 'qmake' || value === 'cmake' ? value : 'direct';
}
function resolveQtProjectFiles(manifestPath, manifest = readQtProjectManifest(manifestPath)) {
    const root = path.dirname(manifestPath);
    const resolved = {};
    for (const key of FILE_KEYS) {
        resolved[key] = manifest.files[key].map((entry) => path.resolve(root, entry));
    }
    return resolved;
}
function qtManifestToQpmProject(manifestPath, manifest = readQtProjectManifest(manifestPath)) {
    const resolved = resolveQtProjectFiles(manifestPath, manifest);
    const files = [];
    let id = 1;
    const add = (entries, type, folder) => {
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
    add(resolved.python, 'Python', 'Python Files');
    add(resolved.translations, 'Qt Translation', 'Translations');
    add(resolved.other, 'Other', 'Other Files');
    return {
        path: manifestPath,
        name: manifest.name,
        targetType: targetTypeForKind(manifest.kind),
        folders: ['Source Files', 'Header Files', 'Python Files', 'Forms', 'Resources', 'QML Files', 'Translations', 'Other Files'],
        files
    };
}
function qtManifestToStandaloneWorkspace(manifestPath, manifest = readQtProjectManifest(manifestPath)) {
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
function qtTargetPath(manifestPath, mode, manifest = readQtProjectManifest(manifestPath)) {
    const root = path.dirname(manifestPath);
    const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
    const profile = getActiveQtBuildProfile(manifest, mode);
    return path.resolve(root, profile.outputDirectory, modeFolder, targetFileName(manifest));
}
function qtImportLibraryPath(manifestPath, mode, manifest = readQtProjectManifest(manifestPath)) {
    if (manifest.kind !== 'shared-library' || process.platform !== 'win32')
        return undefined;
    const root = path.dirname(manifestPath);
    const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
    const baseName = manifest.targetName.toLowerCase().startsWith('lib') ? manifest.targetName : `lib${manifest.targetName}`;
    const profile = getActiveQtBuildProfile(manifest, mode);
    return path.resolve(root, profile.outputDirectory, modeFolder, `${baseName}.dll.a`);
}
function qtGeneratedDirectory(manifestPath, mode, manifest = readQtProjectManifest(manifestPath)) {
    const root = path.dirname(manifestPath);
    const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
    const profile = getActiveQtBuildProfile(manifest, mode);
    return path.resolve(root, profile.outputDirectory, modeFolder, profile.generatedDirectory);
}
function qtObjectDirectory(manifestPath, mode, manifest = readQtProjectManifest(manifestPath)) {
    const root = path.dirname(manifestPath);
    const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
    const profile = getActiveQtBuildProfile(manifest, mode);
    return path.resolve(root, profile.outputDirectory, modeFolder, 'obj');
}
function addFilesToQtManifest(manifestPath, filePaths) {
    const manifest = readQtProjectManifest(manifestPath);
    const root = path.dirname(manifestPath);
    let added = 0;
    for (const filePath of filePaths) {
        const key = fileCategoryForPath(filePath);
        const relative = normalizeManifestPath(path.relative(root, path.resolve(filePath)));
        const allExisting = FILE_KEYS.flatMap((candidate) => manifest.files[candidate].map((entry) => entry.toLowerCase()));
        if (allExisting.includes(relative.toLowerCase()))
            continue;
        manifest.files[key].push(relative);
        added++;
    }
    for (const key of FILE_KEYS)
        manifest.files[key].sort((a, b) => a.localeCompare(b));
    if (added > 0)
        writeQtProjectManifest(manifestPath, manifest);
    return added;
}
function removeFileFromQtManifest(manifestPath, filePath) {
    const manifest = readQtProjectManifest(manifestPath);
    const relative = normalizeManifestPath(path.relative(path.dirname(manifestPath), path.resolve(filePath))).toLowerCase();
    let changed = false;
    for (const key of FILE_KEYS) {
        const before = manifest.files[key].length;
        manifest.files[key] = manifest.files[key].filter((entry) => normalizeManifestPath(entry).toLowerCase() !== relative);
        changed ||= manifest.files[key].length !== before;
    }
    if (changed)
        writeQtProjectManifest(manifestPath, manifest);
    return changed;
}
function fileCategoryForPath(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.c':
        case '.cc':
        case '.cpp':
        case '.cxx': return 'sources';
        case '.h':
        case '.hh':
        case '.hpp':
        case '.hxx': return 'headers';
        case '.ui': return 'forms';
        case '.qrc': return 'resources';
        case '.qml':
        case '.js':
        case '.mjs': return 'qml';
        case '.py':
        case '.pyi': return 'python';
        case '.ts':
        case '.qm': return 'translations';
        default: return 'other';
    }
}
function targetTypeForKind(kind) {
    if (kind === 'shared-library')
        return 'Dynamic Link Library';
    if (kind === 'static-library')
        return 'Static Library';
    return 'Executable';
}
function targetExtensionForKind(kind, deviceType) {
    const device = deviceType ?? 'desktop';
    if (kind === 'static-library')
        return '.a';
    if (kind === 'shared-library') {
        if (device === 'webassembly')
            return '.wasm';
        if (device === 'linux-local' || device === 'remote-linux' || device === 'docker')
            return '.so';
        return process.platform === 'win32' ? '.dll' : process.platform === 'darwin' ? '.dylib' : '.so';
    }
    if (device === 'webassembly')
        return '.html';
    if (device === 'android')
        return '.apk';
    if (device === 'linux-local' || device === 'remote-linux' || device === 'docker')
        return '';
    return process.platform === 'win32' ? '.exe' : '';
}
function targetFileName(manifest) {
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
function isReleaseBuildMode(mode) {
    return mode === 'release' || mode === 'release64';
}
function defaultModulesForKind(kind) {
    switch (kind) {
        case 'widgets-application': return ['Core', 'Gui', 'Widgets'];
        case 'quick-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickControls2'];
        case 'test-application': return ['Core', 'Test'];
        case 'quick-test-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickTest', 'Test'];
        case 'console-application': return ['Core'];
        case 'python-widgets-application': return ['Core', 'Gui', 'Widgets'];
        case 'python-quick-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickControls2'];
        case 'shared-library':
        case 'static-library': return ['Core'];
    }
}
function normalizeKind(value, manifestPath) {
    const allowed = ['widgets-application', 'console-application', 'quick-application', 'test-application', 'quick-test-application', 'shared-library', 'static-library', 'python-widgets-application', 'python-quick-application'];
    if (typeof value === 'string' && allowed.includes(value))
        return value;
    throw new Error(`Invalid Qt project manifest ${manifestPath}: unsupported kind ${String(value)}.`);
}
function defaultTestingConfiguration(kind) {
    const framework = kind === 'test-application'
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
function defaultQualityConfiguration() {
    return {
        clangTidyChecks: 'bugprone-*,performance-*,portability-*,readability-*,-readability-magic-numbers',
        clazyChecks: 'level0,level1',
        headerFilter: '.*'
    };
}
function defaultProfilingConfiguration() {
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
function defaultQmlConfiguration(name, kind) {
    const quickProject = kind === 'quick-application' || kind === 'quick-test-application' || kind === 'python-quick-application';
    return {
        languageServer: {
            enabled: quickProject,
            autoStart: quickProject,
            executable: '',
            buildDirectories: [],
            importPaths: [],
            useQmlImportPathEnvironment: true,
            noCmakeCalls: true,
            cmakeJobs: 0,
            maxFilesToSearch: 20000,
            trace: 'off',
            verboseOutput: false,
            conflictPolicy: 'avoid-duplicate',
            generateConfigurationFile: true,
            additionalArguments: []
        },
        module: {
            uri: normalizeQmlModuleUri(name),
            version: '1.0',
            importRoot: 'qml',
            resourcePrefix: '/qt/qml'
        }
    };
}
function normalizeQmlConfiguration(raw, name, kind) {
    const fallback = defaultQmlConfiguration(name, kind);
    const value = objectValue(raw);
    const languageServer = objectValue(value.languageServer);
    const moduleValue = objectValue(value.module);
    const trace = languageServer.trace === 'messages' || languageServer.trace === 'verbose' ? languageServer.trace : 'off';
    const conflictPolicy = languageServer.conflictPolicy === 'allow-parallel' ? 'allow-parallel' : 'avoid-duplicate';
    const jobs = typeof languageServer.cmakeJobs === 'number' && Number.isFinite(languageServer.cmakeJobs) ? Math.max(0, Math.floor(languageServer.cmakeJobs)) : fallback.languageServer.cmakeJobs;
    const maxFiles = typeof languageServer.maxFilesToSearch === 'number' && Number.isFinite(languageServer.maxFilesToSearch) ? Math.max(0, Math.floor(languageServer.maxFilesToSearch)) : fallback.languageServer.maxFilesToSearch;
    return {
        languageServer: {
            enabled: booleanValue(languageServer.enabled, fallback.languageServer.enabled),
            autoStart: booleanValue(languageServer.autoStart, fallback.languageServer.autoStart),
            executable: optionalString(languageServer.executable),
            buildDirectories: normalizeStringArray(languageServer.buildDirectories),
            importPaths: normalizeStringArray(languageServer.importPaths),
            useQmlImportPathEnvironment: booleanValue(languageServer.useQmlImportPathEnvironment, fallback.languageServer.useQmlImportPathEnvironment),
            noCmakeCalls: booleanValue(languageServer.noCmakeCalls, fallback.languageServer.noCmakeCalls),
            cmakeJobs: jobs,
            maxFilesToSearch: maxFiles,
            trace,
            verboseOutput: booleanValue(languageServer.verboseOutput, fallback.languageServer.verboseOutput),
            conflictPolicy,
            generateConfigurationFile: booleanValue(languageServer.generateConfigurationFile, fallback.languageServer.generateConfigurationFile),
            additionalArguments: normalizeStringArray(languageServer.additionalArguments)
        },
        module: {
            uri: normalizeQmlModuleUri(optionalString(moduleValue.uri) || fallback.module.uri),
            version: normalizeQmlModuleVersion(optionalString(moduleValue.version) || fallback.module.version),
            importRoot: normalizeRelativeDirectory(optionalString(moduleValue.importRoot) || fallback.module.importRoot),
            resourcePrefix: normalizeQmlResourcePrefix(optionalString(moduleValue.resourcePrefix) || fallback.module.resourcePrefix)
        }
    };
}
function defaultDependenciesConfiguration() {
    return {
        enabled: false,
        autoInstallBeforeBuild: false,
        outputDirectory: '.qpm/dependencies',
        cmakeFindPackages: [],
        cmakeLinkTargets: [],
        additionalIncludeDirectories: [],
        additionalLibraryDirectories: [],
        additionalLibraries: [],
        vcpkg: { enabled: false, executable: '', root: '', manifestFile: 'vcpkg.json', installRoot: '.qpm/dependencies/vcpkg_installed', triplet: '', hostTriplet: '', baseline: '', dependencies: [], features: [], overlayPorts: [], overlayTriplets: [], additionalArguments: [] },
        conan: { enabled: false, executable: '', manifestFile: 'conanfile.txt', outputDirectory: '.qpm/dependencies/conan', requires: [], toolRequires: [], options: [], profileHost: 'default', profileBuild: 'default', buildMissing: true, lockfile: '', additionalArguments: [] },
        pkgConfig: { enabled: false, executable: '', packages: [], searchPaths: [], staticLink: false, additionalArguments: [] }
    };
}
function normalizeDependenciesConfiguration(raw) {
    const fallback = defaultDependenciesConfiguration();
    const value = objectValue(raw);
    const vcpkg = objectValue(value.vcpkg);
    const conan = objectValue(value.conan);
    const pkg = objectValue(value.pkgConfig);
    return {
        enabled: booleanValue(value.enabled, fallback.enabled),
        autoInstallBeforeBuild: booleanValue(value.autoInstallBeforeBuild, fallback.autoInstallBeforeBuild),
        outputDirectory: normalizeRelativeDirectoryAllowDot(optionalString(value.outputDirectory) || fallback.outputDirectory),
        cmakeFindPackages: normalizeStringArray(value.cmakeFindPackages),
        cmakeLinkTargets: normalizeStringArray(value.cmakeLinkTargets),
        additionalIncludeDirectories: normalizeStringArray(value.additionalIncludeDirectories),
        additionalLibraryDirectories: normalizeStringArray(value.additionalLibraryDirectories),
        additionalLibraries: normalizeStringArray(value.additionalLibraries),
        vcpkg: {
            enabled: booleanValue(vcpkg.enabled, false), executable: optionalString(vcpkg.executable), root: optionalString(vcpkg.root),
            manifestFile: normalizeOptionalRelativePath(optionalString(vcpkg.manifestFile) || fallback.vcpkg.manifestFile),
            installRoot: normalizeRelativeDirectoryAllowDot(optionalString(vcpkg.installRoot) || fallback.vcpkg.installRoot),
            triplet: optionalString(vcpkg.triplet), hostTriplet: optionalString(vcpkg.hostTriplet), baseline: optionalString(vcpkg.baseline),
            dependencies: normalizeStringArray(vcpkg.dependencies), features: normalizeStringArray(vcpkg.features), overlayPorts: normalizeStringArray(vcpkg.overlayPorts), overlayTriplets: normalizeStringArray(vcpkg.overlayTriplets), additionalArguments: normalizeStringArray(vcpkg.additionalArguments)
        },
        conan: {
            enabled: booleanValue(conan.enabled, false), executable: optionalString(conan.executable),
            manifestFile: normalizeOptionalRelativePath(optionalString(conan.manifestFile) || fallback.conan.manifestFile),
            outputDirectory: normalizeRelativeDirectoryAllowDot(optionalString(conan.outputDirectory) || fallback.conan.outputDirectory),
            requires: normalizeStringArray(conan.requires), toolRequires: normalizeStringArray(conan.toolRequires), options: normalizeStringArray(conan.options),
            profileHost: optionalString(conan.profileHost) || fallback.conan.profileHost, profileBuild: optionalString(conan.profileBuild) || fallback.conan.profileBuild,
            buildMissing: booleanValue(conan.buildMissing, true), lockfile: normalizeOptionalRelativePath(optionalString(conan.lockfile)), additionalArguments: normalizeStringArray(conan.additionalArguments)
        },
        pkgConfig: {
            enabled: booleanValue(pkg.enabled, false), executable: optionalString(pkg.executable), packages: normalizeStringArray(pkg.packages), searchPaths: normalizeStringArray(pkg.searchPaths), staticLink: booleanValue(pkg.staticLink, false), additionalArguments: normalizeStringArray(pkg.additionalArguments)
        }
    };
}
function defaultPythonConfiguration(kind) {
    const enabled = kind === 'python-widgets-application' || kind === 'python-quick-application';
    return {
        enabled,
        binding: 'pyside6',
        interpreter: '',
        virtualEnvironment: '.venv',
        autoCreateVirtualEnvironment: enabled,
        autoInstallPySide6: false,
        pySideVersion: '',
        projectFile: 'pyproject.toml',
        entryPoint: 'main.py',
        uiMode: 'compiled',
        buildBeforeRun: true,
        deployEnabled: true,
        deploySpecFile: 'pysidedeploy.spec',
        androidDeployEnabled: false,
        toolOverrides: {
            project: '', designer: '', uic: '', rcc: '', deploy: '', androidDeploy: '', linguist: '', lupdate: '', lrelease: '', qmllint: ''
        },
        additionalProjectArguments: [],
        additionalDeployArguments: [],
        environment: {}
    };
}
function normalizePythonConfiguration(raw, kind) {
    const fallback = defaultPythonConfiguration(kind);
    const value = objectValue(raw);
    const tools = objectValue(value.toolOverrides);
    const uiMode = value.uiMode === 'runtime' ? 'runtime' : 'compiled';
    return {
        enabled: booleanValue(value.enabled, fallback.enabled),
        binding: 'pyside6',
        interpreter: optionalString(value.interpreter),
        virtualEnvironment: normalizeRelativeDirectoryAllowDot(optionalString(value.virtualEnvironment) || fallback.virtualEnvironment),
        autoCreateVirtualEnvironment: booleanValue(value.autoCreateVirtualEnvironment, fallback.autoCreateVirtualEnvironment),
        autoInstallPySide6: booleanValue(value.autoInstallPySide6, fallback.autoInstallPySide6),
        pySideVersion: optionalString(value.pySideVersion),
        projectFile: normalizeOptionalRelativePath(optionalString(value.projectFile) || fallback.projectFile),
        entryPoint: normalizeOptionalRelativePath(optionalString(value.entryPoint) || fallback.entryPoint),
        uiMode,
        buildBeforeRun: booleanValue(value.buildBeforeRun, fallback.buildBeforeRun),
        deployEnabled: booleanValue(value.deployEnabled, fallback.deployEnabled),
        deploySpecFile: normalizeOptionalRelativePath(optionalString(value.deploySpecFile) || fallback.deploySpecFile),
        androidDeployEnabled: booleanValue(value.androidDeployEnabled, fallback.androidDeployEnabled),
        toolOverrides: {
            project: optionalString(tools.project),
            designer: optionalString(tools.designer),
            uic: optionalString(tools.uic),
            rcc: optionalString(tools.rcc),
            deploy: optionalString(tools.deploy),
            androidDeploy: optionalString(tools.androidDeploy),
            linguist: optionalString(tools.linguist),
            lupdate: optionalString(tools.lupdate),
            lrelease: optionalString(tools.lrelease),
            qmllint: optionalString(tools.qmllint)
        },
        additionalProjectArguments: normalizeStringArray(value.additionalProjectArguments),
        additionalDeployArguments: normalizeStringArray(value.additionalDeployArguments),
        environment: normalizeStringRecord(value.environment)
    };
}
function isQtPythonProject(manifest) {
    return manifest.python.enabled || manifest.kind === 'python-widgets-application' || manifest.kind === 'python-quick-application';
}
function qtProjectLanguage(manifest) {
    return isQtPythonProject(manifest) ? 'python' : 'cpp';
}
function normalizeQmlModuleUri(value) {
    const parts = value.trim().split('.').map((entry) => entry.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
    const normalized = parts.map((entry) => /^\d/.test(entry) ? `_${entry}` : entry).join('.');
    return normalized || 'QpmApplication';
}
function normalizeQmlModuleVersion(value) {
    const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
    return match ? `${match[1]}.${match[2] ?? '0'}` : '1.0';
}
function normalizeQmlResourcePrefix(value) {
    const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
    return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}
function defaultPackagingConfiguration(name) {
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
        },
        installer: {
            enabled: true,
            backend: 'qt-ifw',
            buildPortablePackage: true,
            outputDirectory: 'dist/installers',
            fileNamePattern: '${productName}-${version}-${arch}-setup',
            installDirectoryName: name,
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
            runAfterInstall: false,
            qtIfw: {
                mode: 'offline',
                binaryCreatorPath: '',
                repogenPath: '',
                installerBasePath: '',
                componentId: `com.example.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                componentDisplayName: name,
                componentDescription: `${name} application files`,
                releaseDate: '',
                repositoryUrl: '',
                repositoryOutputDirectory: 'dist/repository',
                maintenanceToolName: `${name}MaintenanceTool`,
                wizardStyle: 'Modern',
                controlScript: '',
                componentScript: '',
                archiveFormat: '7z',
                compression: 5,
                additionalArguments: []
            },
            inno: {
                isccPath: '',
                scriptFile: '',
                languages: ['english'],
                privilegesRequired: 'admin',
                architecture: 'x64',
                compression: 'lzma2/max',
                solidCompression: true,
                additionalDirectives: []
            },
            nsis: {
                makensisPath: '',
                scriptFile: '',
                requestExecutionLevel: 'admin',
                compressor: 'lzma',
                additionalDefines: []
            },
            signing: {
                enabled: false,
                signToolPath: '',
                certificateFile: '',
                certificateThumbprint: '',
                certificateSubject: '',
                certificatePasswordEnvironment: 'QPM_SIGN_CERT_PASSWORD',
                timestampUrl: 'http://timestamp.digicert.com',
                fileDigest: 'sha256',
                timestampDigest: 'sha256',
                signTargetBinary: true,
                signInstaller: true,
                verifyAfterSigning: true,
                additionalArguments: []
            }
        }
    };
}
function normalizeTestingConfiguration(raw, kind) {
    const fallback = defaultTestingConfiguration(kind);
    const value = objectValue(raw);
    const frameworkValues = ['auto', 'qttest', 'qtquicktest', 'gtest', 'catch2', 'boost', 'ctest'];
    const framework = frameworkValues.includes(value.framework) ? value.framework : fallback.framework;
    const timeoutCandidate = typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs) ? Math.floor(value.timeoutMs) : fallback.timeoutMs;
    const environmentValue = objectValue(value.environment);
    const environment = {};
    for (const [key, entry] of Object.entries(environmentValue)) {
        if (key.trim() && typeof entry === 'string')
            environment[key.trim()] = entry;
    }
    const repeatModes = ['never', 'until-fail', 'after-timeout'];
    const repeatMode = repeatModes.includes(value.repeatMode) ? value.repeatMode : fallback.repeatMode;
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
function normalizeQualityConfiguration(raw) {
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
function normalizeProfilingConfiguration(raw) {
    const fallback = defaultProfilingConfiguration();
    const value = objectValue(raw);
    const qml = objectValue(value.qml);
    const cpu = objectValue(value.cpu);
    const memory = objectValue(value.memory);
    const cppcheck = objectValue(value.cppcheck);
    const tracing = objectValue(value.tracing);
    const environmentValue = objectValue(value.environment);
    const environment = {};
    for (const [key, entry] of Object.entries(environmentValue)) {
        if (key.trim() && typeof entry === 'string')
            environment[key.trim()] = entry;
    }
    const cpuTools = ['auto', 'perf', 'callgrind'];
    const memoryTools = ['auto', 'valgrind-memcheck', 'heob'];
    const traceTools = ['auto', 'strace', 'none'];
    const leakChecks = ['summary', 'full'];
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
            tool: cpuTools.includes(cpu.tool) ? cpu.tool : fallback.cpu.tool,
            samplingFrequency: normalizeBoundedInteger(cpu.samplingFrequency, fallback.cpu.samplingFrequency, 1, 100000),
            callgrindCacheSimulation: booleanValue(cpu.callgrindCacheSimulation, fallback.cpu.callgrindCacheSimulation),
            callgrindBranchSimulation: booleanValue(cpu.callgrindBranchSimulation, fallback.cpu.callgrindBranchSimulation),
            outputFile: optionalString(cpu.outputFile) || fallback.cpu.outputFile
        },
        memory: {
            tool: memoryTools.includes(memory.tool) ? memory.tool : fallback.memory.tool,
            leakCheck: leakChecks.includes(memory.leakCheck) ? memory.leakCheck : fallback.memory.leakCheck,
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
            tool: traceTools.includes(tracing.tool) ? tracing.tool : fallback.tracing.tool,
            followForks: booleanValue(tracing.followForks, fallback.tracing.followForks),
            timestamps: booleanValue(tracing.timestamps, fallback.tracing.timestamps),
            outputFile: optionalString(tracing.outputFile) || fallback.tracing.outputFile
        }
    };
}
function normalizePackagingConfiguration(raw, name, targetName) {
    const fallback = defaultPackagingConfiguration(name);
    const value = objectValue(raw);
    const windows = objectValue(value.windows);
    const linux = objectValue(value.linux);
    const installer = objectValue(value.installer);
    const qtIfw = objectValue(installer.qtIfw);
    const inno = objectValue(installer.inno);
    const nsis = objectValue(installer.nsis);
    const signing = objectValue(installer.signing);
    const archiveFormat = value.archiveFormat === 'folder' || value.archiveFormat === 'tar-gz' ? value.archiveFormat : 'zip';
    const executionLevel = windows.executionLevel === 'highestAvailable' || windows.executionLevel === 'requireAdministrator' ? windows.executionLevel : 'asInvoker';
    const dpiAwareness = windows.dpiAwareness === 'unaware' || windows.dpiAwareness === 'system' || windows.dpiAwareness === 'per-monitor' ? windows.dpiAwareness : 'per-monitor-v2';
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
        },
        installer: {
            enabled: booleanValue(installer.enabled, fallback.installer.enabled),
            backend: normalizeInstallerBackend(installer.backend),
            buildPortablePackage: booleanValue(installer.buildPortablePackage, fallback.installer.buildPortablePackage),
            outputDirectory: normalizeRelativeDirectory(optionalString(installer.outputDirectory) || fallback.installer.outputDirectory),
            fileNamePattern: optionalString(installer.fileNamePattern) || fallback.installer.fileNamePattern,
            installDirectoryName: optionalString(installer.installDirectoryName) || productName,
            createDesktopShortcut: booleanValue(installer.createDesktopShortcut, fallback.installer.createDesktopShortcut),
            createStartMenuShortcut: booleanValue(installer.createStartMenuShortcut, fallback.installer.createStartMenuShortcut),
            runAfterInstall: booleanValue(installer.runAfterInstall, fallback.installer.runAfterInstall),
            qtIfw: {
                mode: normalizeQtIfwMode(qtIfw.mode),
                binaryCreatorPath: optionalString(qtIfw.binaryCreatorPath),
                repogenPath: optionalString(qtIfw.repogenPath),
                installerBasePath: optionalString(qtIfw.installerBasePath),
                componentId: optionalString(qtIfw.componentId) || identifier,
                componentDisplayName: optionalString(qtIfw.componentDisplayName) || productName,
                componentDescription: optionalString(qtIfw.componentDescription) || `${productName} application files`,
                releaseDate: normalizeOptionalIsoDate(optionalString(qtIfw.releaseDate)),
                repositoryUrl: optionalString(qtIfw.repositoryUrl),
                repositoryOutputDirectory: normalizeRelativeDirectory(optionalString(qtIfw.repositoryOutputDirectory) || fallback.installer.qtIfw.repositoryOutputDirectory),
                maintenanceToolName: optionalString(qtIfw.maintenanceToolName) || `${targetName}MaintenanceTool`,
                wizardStyle: normalizeQtIfwWizardStyle(qtIfw.wizardStyle),
                controlScript: optionalString(qtIfw.controlScript),
                componentScript: optionalString(qtIfw.componentScript),
                archiveFormat: normalizeQtIfwArchiveFormat(qtIfw.archiveFormat),
                compression: normalizeBoundedInteger(qtIfw.compression, fallback.installer.qtIfw.compression, 0, 9),
                additionalArguments: normalizeStringArray(qtIfw.additionalArguments)
            },
            inno: {
                isccPath: optionalString(inno.isccPath),
                scriptFile: optionalString(inno.scriptFile),
                languages: normalizeStringArray(inno.languages).length ? normalizeStringArray(inno.languages) : fallback.installer.inno.languages,
                privilegesRequired: inno.privilegesRequired === 'lowest' ? 'lowest' : 'admin',
                architecture: inno.architecture === 'x86' || inno.architecture === 'x86-x64' ? inno.architecture : 'x64',
                compression: optionalString(inno.compression) || fallback.installer.inno.compression,
                solidCompression: booleanValue(inno.solidCompression, fallback.installer.inno.solidCompression),
                additionalDirectives: normalizeStringArray(inno.additionalDirectives)
            },
            nsis: {
                makensisPath: optionalString(nsis.makensisPath),
                scriptFile: optionalString(nsis.scriptFile),
                requestExecutionLevel: nsis.requestExecutionLevel === 'user' || nsis.requestExecutionLevel === 'highest' ? nsis.requestExecutionLevel : 'admin',
                compressor: nsis.compressor === 'zlib' || nsis.compressor === 'bzip2' ? nsis.compressor : 'lzma',
                additionalDefines: normalizeStringArray(nsis.additionalDefines)
            },
            signing: {
                enabled: booleanValue(signing.enabled, fallback.installer.signing.enabled),
                signToolPath: optionalString(signing.signToolPath),
                certificateFile: optionalString(signing.certificateFile),
                certificateThumbprint: optionalString(signing.certificateThumbprint).replace(/\s+/g, ''),
                certificateSubject: optionalString(signing.certificateSubject),
                certificatePasswordEnvironment: optionalString(signing.certificatePasswordEnvironment) || fallback.installer.signing.certificatePasswordEnvironment,
                timestampUrl: optionalString(signing.timestampUrl) || fallback.installer.signing.timestampUrl,
                fileDigest: normalizeSigningDigest(signing.fileDigest),
                timestampDigest: normalizeSigningDigest(signing.timestampDigest),
                signTargetBinary: booleanValue(signing.signTargetBinary, fallback.installer.signing.signTargetBinary),
                signInstaller: booleanValue(signing.signInstaller, fallback.installer.signing.signInstaller),
                verifyAfterSigning: booleanValue(signing.verifyAfterSigning, fallback.installer.signing.verifyAfterSigning),
                additionalArguments: normalizeStringArray(signing.additionalArguments)
            }
        }
    };
}
function defaultPublicationConfiguration(name) {
    const identifier = `com.example.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return {
        enabled: false,
        outputDirectory: 'dist/publication',
        channel: 'stable',
        baseUrl: '',
        releaseNotesFile: '',
        includePortablePackage: true,
        includeInstaller: true,
        includeQtIfwRepository: false,
        generateChecksums: true,
        generateLatestManifest: true,
        msix: {
            enabled: false,
            makeAppxPath: '',
            packageIdentityName: identifier.replace(/[^A-Za-z0-9.-]/g, '.'),
            publisher: 'CN=QPM Development',
            publisherDisplayName: '',
            displayName: name,
            description: `${name} Qt application`,
            version: '1.0.0.0',
            architecture: 'auto',
            minimumOsVersion: '10.0.19041.0',
            targetOsVersion: '10.0.26100.0',
            logo44: '',
            logo150: '',
            storeLogo: '',
            signPackage: false,
            generateAppInstaller: true,
            packageUri: '',
            appInstallerUri: '',
            updateOnLaunch: true,
            hoursBetweenUpdateChecks: 0,
            showPrompt: true,
            updateBlocksActivation: false,
            forceUpdateFromAnyVersion: false,
            automaticBackgroundTask: false
        },
        winget: {
            enabled: false,
            wingetPath: '',
            wingetCreatePath: '',
            packageIdentifier: identifier,
            publisher: '',
            packageName: name,
            shortDescription: `${name} Qt application`,
            license: 'Proprietary',
            licenseUrl: '',
            publisherUrl: '',
            packageUrl: '',
            installerUrl: '',
            installerType: 'exe',
            scope: 'machine',
            locale: 'en-US',
            tags: ['qt'],
            releaseNotesUrl: '',
            minimumOsVersion: '10.0.0.0'
        },
        github: {
            enabled: false,
            ghPath: '',
            repository: '',
            tagPattern: 'v${version}',
            releaseNamePattern: '${productName} ${version}',
            draft: true,
            prerelease: false,
            generateNotes: false,
            clobberAssets: false
        },
        publish: {
            target: 'none',
            localDirectory: '',
            sshHost: '',
            sshUser: '',
            sshPort: 22,
            sshDirectory: '',
            scpPath: '',
            rsyncPath: '',
            useRsync: true,
            deleteRemote: false
        }
    };
}
function normalizePublicationConfiguration(raw, name, targetName, packaging) {
    const fallback = defaultPublicationConfiguration(name);
    const value = objectValue(raw);
    const msix = objectValue(value.msix);
    const winget = objectValue(value.winget);
    const github = objectValue(value.github);
    const publish = objectValue(value.publish);
    const channel = value.channel === 'beta' || value.channel === 'nightly' ? value.channel : 'stable';
    const architecture = msix.architecture === 'x86' || msix.architecture === 'x64' || msix.architecture === 'arm64' ? msix.architecture : 'auto';
    const installerType = ['msix', 'inno', 'nullsoft', 'zip'].includes(String(winget.installerType)) ? winget.installerType : 'exe';
    const scope = winget.scope === 'user' ? 'user' : 'machine';
    const target = publish.target === 'local' || publish.target === 'ssh' || publish.target === 'github' ? publish.target : 'none';
    const identity = optionalString(msix.packageIdentityName) || packaging.identifier || fallback.msix.packageIdentityName;
    const productName = packaging.productName || name;
    return {
        enabled: booleanValue(value.enabled, fallback.enabled),
        outputDirectory: normalizeRelativeDirectory(optionalString(value.outputDirectory) || fallback.outputDirectory),
        channel,
        baseUrl: optionalString(value.baseUrl),
        releaseNotesFile: optionalString(value.releaseNotesFile),
        includePortablePackage: booleanValue(value.includePortablePackage, fallback.includePortablePackage),
        includeInstaller: booleanValue(value.includeInstaller, fallback.includeInstaller),
        includeQtIfwRepository: booleanValue(value.includeQtIfwRepository, fallback.includeQtIfwRepository),
        generateChecksums: booleanValue(value.generateChecksums, fallback.generateChecksums),
        generateLatestManifest: booleanValue(value.generateLatestManifest, fallback.generateLatestManifest),
        msix: {
            enabled: booleanValue(msix.enabled, fallback.msix.enabled),
            makeAppxPath: optionalString(msix.makeAppxPath),
            packageIdentityName: normalizeMsixIdentityName(identity),
            publisher: optionalString(msix.publisher) || fallback.msix.publisher,
            publisherDisplayName: optionalString(msix.publisherDisplayName) || packaging.companyName || productName,
            displayName: optionalString(msix.displayName) || productName,
            description: optionalString(msix.description) || packaging.description || `${productName} Qt application`,
            version: normalizeFourPartVersion(optionalString(msix.version) || packaging.productVersion),
            architecture,
            minimumOsVersion: normalizeFourPartVersion(optionalString(msix.minimumOsVersion) || fallback.msix.minimumOsVersion),
            targetOsVersion: normalizeFourPartVersion(optionalString(msix.targetOsVersion) || fallback.msix.targetOsVersion),
            logo44: optionalString(msix.logo44),
            logo150: optionalString(msix.logo150),
            storeLogo: optionalString(msix.storeLogo),
            signPackage: booleanValue(msix.signPackage, fallback.msix.signPackage),
            generateAppInstaller: booleanValue(msix.generateAppInstaller, fallback.msix.generateAppInstaller),
            packageUri: optionalString(msix.packageUri),
            appInstallerUri: optionalString(msix.appInstallerUri),
            updateOnLaunch: booleanValue(msix.updateOnLaunch, fallback.msix.updateOnLaunch),
            hoursBetweenUpdateChecks: normalizeBoundedInteger(msix.hoursBetweenUpdateChecks, fallback.msix.hoursBetweenUpdateChecks, 0, 255),
            showPrompt: booleanValue(msix.showPrompt, fallback.msix.showPrompt),
            updateBlocksActivation: booleanValue(msix.updateBlocksActivation, fallback.msix.updateBlocksActivation),
            forceUpdateFromAnyVersion: booleanValue(msix.forceUpdateFromAnyVersion, fallback.msix.forceUpdateFromAnyVersion),
            automaticBackgroundTask: booleanValue(msix.automaticBackgroundTask, fallback.msix.automaticBackgroundTask)
        },
        winget: {
            enabled: booleanValue(winget.enabled, fallback.winget.enabled),
            wingetPath: optionalString(winget.wingetPath),
            wingetCreatePath: optionalString(winget.wingetCreatePath),
            packageIdentifier: normalizeWingetIdentifier(optionalString(winget.packageIdentifier) || packaging.identifier || identity),
            publisher: optionalString(winget.publisher) || packaging.companyName || productName,
            packageName: optionalString(winget.packageName) || productName,
            shortDescription: optionalString(winget.shortDescription) || packaging.description || `${productName} Qt application`,
            license: optionalString(winget.license) || fallback.winget.license,
            licenseUrl: optionalString(winget.licenseUrl),
            publisherUrl: optionalString(winget.publisherUrl),
            packageUrl: optionalString(winget.packageUrl),
            installerUrl: optionalString(winget.installerUrl),
            installerType,
            scope,
            locale: normalizeLocale(optionalString(winget.locale) || fallback.winget.locale),
            tags: normalizeStringArray(winget.tags),
            releaseNotesUrl: optionalString(winget.releaseNotesUrl),
            minimumOsVersion: normalizeFourPartVersion(optionalString(winget.minimumOsVersion) || fallback.winget.minimumOsVersion)
        },
        github: {
            enabled: booleanValue(github.enabled, fallback.github.enabled),
            ghPath: optionalString(github.ghPath),
            repository: optionalString(github.repository),
            tagPattern: optionalString(github.tagPattern) || fallback.github.tagPattern,
            releaseNamePattern: optionalString(github.releaseNamePattern) || fallback.github.releaseNamePattern,
            draft: booleanValue(github.draft, fallback.github.draft),
            prerelease: booleanValue(github.prerelease, fallback.github.prerelease),
            generateNotes: booleanValue(github.generateNotes, fallback.github.generateNotes),
            clobberAssets: booleanValue(github.clobberAssets, fallback.github.clobberAssets)
        },
        publish: {
            target,
            localDirectory: optionalString(publish.localDirectory),
            sshHost: optionalString(publish.sshHost),
            sshUser: optionalString(publish.sshUser),
            sshPort: normalizePort(publish.sshPort, fallback.publish.sshPort),
            sshDirectory: optionalString(publish.sshDirectory),
            scpPath: optionalString(publish.scpPath),
            rsyncPath: optionalString(publish.rsyncPath),
            useRsync: booleanValue(publish.useRsync, fallback.publish.useRsync),
            deleteRemote: booleanValue(publish.deleteRemote, fallback.publish.deleteRemote)
        }
    };
}
function normalizeMsixIdentityName(value) {
    return value.trim().replace(/[^A-Za-z0-9.-]/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 50) || 'Qpm.Application';
}
function normalizeWingetIdentifier(value) {
    const normalized = value.trim().replace(/[^A-Za-z0-9.-]/g, '.').replace(/^\.+|\.+$/g, '');
    return normalized || 'Qpm.Application';
}
function normalizeLocale(value) {
    return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(value.trim()) ? value.trim() : 'en-US';
}
function normalizeFourPartVersion(value) {
    const numeric = value.trim().split(/[.-]/).map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isFinite(entry) && entry >= 0);
    while (numeric.length < 4)
        numeric.push(0);
    return numeric.slice(0, 4).map((entry) => Math.min(65535, entry)).join('.');
}
function normalizeInstallerBackend(value) {
    return value === 'inno-setup' || value === 'nsis' ? value : 'qt-ifw';
}
function normalizeQtIfwMode(value) {
    return value === 'online' || value === 'hybrid' ? value : 'offline';
}
function normalizeQtIfwWizardStyle(value) {
    return value === 'Aero' || value === 'Classic' || value === 'Mac' ? value : 'Modern';
}
function normalizeQtIfwArchiveFormat(value) {
    return value === 'zip' || value === 'tar' || value === 'tar.gz' || value === 'tar.bz2' || value === 'tar.xz' ? value : '7z';
}
function normalizeSigningDigest(value) {
    return value === 'sha384' || value === 'sha512' ? value : 'sha256';
}
function normalizeOptionalIsoDate(value) {
    if (!value)
        return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}
function normalizeProductVersion(value) {
    const match = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[.-]([0-9A-Za-z.-]+))?$/);
    if (!match)
        return '1.0.0';
    return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}${match[4] ? `-${match[4]}` : ''}`;
}
function normalizeModules(values) {
    const normalized = values.map((entry) => entry.trim().replace(/^Qt\d*::/i, '').replace(/^Qt\d*/i, '')).filter(Boolean);
    if (!normalized.some((entry) => entry.toLowerCase() === 'core'))
        normalized.unshift('Core');
    return [...new Map(normalized.map((entry) => [entry.toLowerCase(), entry])).values()];
}
function normalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))];
}
function normalizeStringRecord(value) {
    const source = objectValue(value);
    const result = {};
    for (const [key, entry] of Object.entries(source)) {
        if (typeof entry === 'string' && key.trim())
            result[key.trim()] = entry;
    }
    return result;
}
function optionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function requireNonEmptyString(value, key, manifestPath) {
    const result = optionalString(value);
    if (!result)
        throw new Error(`Invalid Qt project manifest ${manifestPath}: ${key} must be a non-empty string.`);
    return result;
}
function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function booleanValue(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
function normalizeRelativeDirectory(value) {
    const normalized = normalizeManifestPath(value).replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized)
        return 'build';
    if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) {
        throw new Error(`Qt project output directories must stay inside the project: ${value}`);
    }
    return normalized;
}
function normalizeTargetName(value, manifestPath) {
    const normalized = value.trim();
    const reservedStem = normalized.split('.')[0].toUpperCase();
    const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(reservedStem);
    if (!normalized || normalized !== value || normalized === '.' || normalized === '..' || /[. ]$/.test(normalized) || reserved || /[<>:"/\|?*\x00-\x1f]/.test(normalized)) {
        throw new Error(`Invalid Qt project manifest ${manifestPath}: targetName must be a valid file name.`);
    }
    return normalized;
}
function normalizeManifestPath(value) {
    return value.replace(/\\/g, '/').replace(/\/+/g, '/');
}
function toProjectRelativePath(manifestPath, absolutePath) {
    return normalizeManifestPath(path.relative(path.dirname(manifestPath), absolutePath));
}
function isSourcePath(filePath) {
    return ['.c', '.cc', '.cpp', '.cxx'].includes(path.extname(filePath).toLowerCase());
}
