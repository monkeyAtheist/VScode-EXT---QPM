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
exports.QpmQtBuildBackendService = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtPackagingModel_1 = require("./qpmQtPackagingModel");
const qpmQtModuleInference_1 = require("./qpmQtModuleInference");
const qpmQtDependencyModel_1 = require("./qpmQtDependencyModel");
class QpmQtBuildBackendService {
    output;
    constructor(output) {
        this.output = output;
    }
    async build(manifestPath, mode, installation, rebuild) {
        const context = this.createContext(manifestPath, mode, installation);
        if (context.profile.system === 'direct')
            throw new Error('The direct backend is handled by the native direct-build engine.');
        if (rebuild && fs.existsSync(context.buildDirectory)) {
            fs.rmSync(context.buildDirectory, { recursive: true, force: true });
            this.output.appendLine(`[Qt ${backendLabel(context.profile.system)}] Removed ${context.buildDirectory}`);
        }
        fs.mkdirSync(context.buildDirectory, { recursive: true });
        return context.profile.system === 'qmake' ? this.buildQmake(context) : this.buildCMake(context);
    }
    async clean(manifestPath, mode, installation) {
        const context = this.createContext(manifestPath, mode, installation);
        if (context.profile.system === 'direct')
            return false;
        if (!fs.existsSync(context.buildDirectory))
            return true;
        if (context.profile.system === 'qmake') {
            const tool = this.resolveQmakeBuildTool(context);
            const args = [...makeParallelArguments(tool, context.jobs), 'clean', ...context.profile.cleanArguments];
            return this.run(tool, args, context.buildDirectory, context.environment, 'qmake clean');
        }
        const cmake = this.resolveCMake(context);
        const args = context.profile.cmakeBuildPreset
            ? ['--build', '--preset', context.profile.cmakeBuildPreset, '--target', 'clean', ...context.profile.cleanArguments]
            : ['--build', context.buildDirectory, '--config', cmakeConfiguration(context), '--target', 'clean', ...(context.jobs > 0 ? ['--parallel', String(context.jobs)] : []), ...context.profile.cleanArguments];
        return this.run(cmake, args, context.profile.cmakeBuildPreset ? path.dirname(this.resolveOrGenerateCMakeProject(context)) : context.root, context.environment, 'CMake clean');
    }
    async configureOnly(manifestPath, mode, installation) {
        const context = this.createContext(manifestPath, mode, installation);
        if (context.profile.system === 'direct')
            throw new Error('Direct Qt projects do not require a separate configure step.');
        fs.mkdirSync(context.buildDirectory, { recursive: true });
        if (context.profile.system === 'qmake') {
            const projectFile = this.resolveOrGenerateQmakeProject(context);
            const ok = await this.configureQmake(context, projectFile);
            return { success: ok, backend: 'qmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile };
        }
        const projectFile = this.resolveOrGenerateCMakeProject(context);
        const ok = await this.configureCMake(context, projectFile);
        const compileCommandsPath = this.publishCompileCommands(context);
        return { success: ok, backend: 'cmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile, compileCommandsPath };
    }
    async openGeneratedProject(manifestPath, mode, installation) {
        const result = await this.configureOnly(manifestPath, mode, installation);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(result.projectFile));
        await vscode.window.showTextDocument(document, { preview: false });
    }
    describe(manifestPath, mode, installation) {
        const context = this.createContext(manifestPath, mode, installation);
        return {
            backend: context.profile.system,
            project: context.manifest.name,
            profile: context.profile,
            kit: context.kit,
            qt: installation.label,
            buildDirectory: context.buildDirectory,
            targetPath: context.targetPath,
            qmake: context.kit.qmakePath || installation.qmakePath,
            cmake: context.kit.cmakePath || installation.cmakePath,
            buildTool: context.kit.buildToolPath || installation.ninjaPath || installation.jomPath || installation.nmakePath || installation.toolchain.makePath,
            generator: context.kit.generator || defaultGenerator(installation),
            jobs: context.jobs
        };
    }
    async buildQmake(context) {
        const projectFile = this.resolveOrGenerateQmakeProject(context);
        if (!await this.configureQmake(context, projectFile))
            return { success: false, backend: 'qmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile };
        const tool = this.resolveQmakeBuildTool(context);
        const args = [...makeParallelArguments(tool, context.jobs), ...context.profile.buildArguments];
        const success = await this.run(tool, args, context.buildDirectory, context.environment, `Build ${context.manifest.name} with qmake`);
        return { success: success && validateTarget(context.targetPath, this.output), backend: 'qmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile };
    }
    async configureQmake(context, projectFile) {
        const qmake = context.kit.qmakePath || context.installation.qmakePath;
        if (!qmake || (!fs.existsSync(qmake) && path.isAbsolute(qmake)))
            throw new Error('qmake was not found for the selected kit.');
        const makefile = path.join(context.buildDirectory, process.platform === 'win32' ? 'Makefile' : 'Makefile');
        const opposite = context.profile.variant === 'release' ? 'debug' : 'release';
        const args = [projectFile, '-o', makefile, `CONFIG-=${opposite}`, `CONFIG+=${context.profile.variant}`, `DESTDIR=${path.dirname(context.targetPath).replace(/\\/g, '/')}`, `TARGET=${context.manifest.targetName}`, ...context.profile.configureArguments];
        this.output.appendLine(`[Qt qmake] Project file: ${projectFile}`);
        this.output.appendLine(`[Qt qmake] Build directory: ${context.buildDirectory}`);
        return this.run(qmake, args, context.buildDirectory, context.environment, `Configure ${context.manifest.name} with qmake`);
    }
    resolveOrGenerateQmakeProject(context) {
        if (context.profile.projectFile) {
            const existing = path.resolve(context.root, context.profile.projectFile);
            if (!fs.existsSync(existing))
                throw new Error(`qmake project file not found: ${existing}`);
            return existing;
        }
        if (!context.profile.generateProjectFiles) {
            const candidates = fs.readdirSync(context.root).filter((entry) => entry.toLowerCase().endsWith('.pro'));
            if (candidates.length === 1)
                return path.join(context.root, candidates[0]);
            throw new Error('No qmake .pro file is configured. Set projectFile or enable generated backend files.');
        }
        const directory = path.join(context.root, '.qpm', 'qmake', context.profile.id);
        fs.mkdirSync(directory, { recursive: true });
        const projectFile = path.join(directory, `${context.manifest.name}.pro`);
        fs.writeFileSync(projectFile, generateQmakeProject(context), 'utf8');
        return projectFile;
    }
    resolveQmakeBuildTool(context) {
        const configured = context.kit.buildToolPath;
        const candidates = [configured, context.installation.jomPath, context.installation.nmakePath, context.installation.toolchain.makePath]
            .filter((entry) => !!entry)
            .filter((entry) => !/ninja(?:\.exe)?$/i.test(path.basename(entry)));
        if (context.installation.compilerFamily === 'mingw') {
            candidates.sort((a, b) => buildToolPriority(a, 'mingw') - buildToolPriority(b, 'mingw'));
        }
        else if (context.installation.compilerFamily === 'msvc') {
            candidates.sort((a, b) => buildToolPriority(a, 'msvc') - buildToolPriority(b, 'msvc'));
        }
        const tool = candidates[0];
        if (!tool)
            throw new Error('No qmake-compatible build tool was found. Select mingw32-make, jom or nmake in the kit. Ninja is reserved for the CMake backend.');
        return tool;
    }
    async buildCMake(context) {
        const projectFile = this.resolveOrGenerateCMakeProject(context);
        if (!await this.configureCMake(context, projectFile))
            return { success: false, backend: 'cmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile };
        const cmake = this.resolveCMake(context);
        const args = context.profile.cmakeBuildPreset
            ? ['--build', '--preset', context.profile.cmakeBuildPreset, ...context.profile.buildArguments]
            : ['--build', context.buildDirectory, '--config', cmakeConfiguration(context), ...(context.jobs > 0 ? ['--parallel', String(context.jobs)] : []), ...context.profile.buildArguments];
        const success = await this.run(cmake, args, context.profile.cmakeBuildPreset ? path.dirname(projectFile) : context.root, context.environment, `Build ${context.manifest.name} with CMake`);
        const compileCommandsPath = this.publishCompileCommands(context);
        return { success: success && validateTarget(context.targetPath, this.output), backend: 'cmake', targetPath: context.targetPath, buildDirectory: context.buildDirectory, projectFile, compileCommandsPath };
    }
    async configureCMake(context, projectFile) {
        const cmake = this.resolveCMake(context);
        let args;
        let cwd;
        if (context.profile.cmakeConfigurePreset) {
            args = ['--preset', context.profile.cmakeConfigurePreset, ...context.profile.configureArguments];
            cwd = path.dirname(projectFile);
        }
        else {
            const sourceDirectory = path.dirname(projectFile);
            const generator = context.kit.generator || defaultGenerator(context.installation);
            args = ['-S', sourceDirectory, '-B', context.buildDirectory, '-G', generator,
                `-DCMAKE_PREFIX_PATH=${context.installation.root}`,
                `-DCMAKE_BUILD_TYPE=${cmakeConfiguration(context)}`,
                '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON',
                `-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=${path.dirname(context.targetPath)}`,
                `-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=${path.dirname(context.targetPath)}`,
                `-DCMAKE_ARCHIVE_OUTPUT_DIRECTORY=${path.dirname(context.targetPath)}`,
                `-DCMAKE_RUNTIME_OUTPUT_DIRECTORY_${cmakeConfiguration(context).toUpperCase()}=${path.dirname(context.targetPath)}`,
                `-DCMAKE_LIBRARY_OUTPUT_DIRECTORY_${cmakeConfiguration(context).toUpperCase()}=${path.dirname(context.targetPath)}`,
                `-DCMAKE_ARCHIVE_OUTPUT_DIRECTORY_${cmakeConfiguration(context).toUpperCase()}=${path.dirname(context.targetPath)}`,
                ...cmakeCompilerArguments(context, generator),
                ...context.dependencyIntegration.cmakeConfigureArguments,
                ...context.profile.configureArguments];
            cwd = context.root;
        }
        this.output.appendLine(`[Qt CMake] Source: ${path.dirname(projectFile)}`);
        this.output.appendLine(`[Qt CMake] Build directory: ${context.buildDirectory}`);
        return this.run(cmake, args, cwd, context.environment, `Configure ${context.manifest.name} with CMake`);
    }
    resolveOrGenerateCMakeProject(context) {
        if (context.profile.projectFile) {
            const configured = path.resolve(context.root, context.profile.projectFile);
            if (!fs.existsSync(configured))
                throw new Error(`CMake project path not found: ${configured}`);
            const file = fs.statSync(configured).isDirectory() ? path.join(configured, 'CMakeLists.txt') : configured;
            if (!fs.existsSync(file))
                throw new Error(`CMake project file not found: ${file}`);
            return file;
        }
        const sourceRoot = path.resolve(context.root, context.profile.sourceDirectory || '.');
        const existing = path.join(sourceRoot, 'CMakeLists.txt');
        if (!context.profile.generateProjectFiles && fs.existsSync(existing))
            return existing;
        if (!context.profile.generateProjectFiles)
            throw new Error(`CMakeLists.txt not found: ${existing}`);
        const directory = path.join(context.root, '.qpm', 'cmake', context.profile.id);
        fs.mkdirSync(directory, { recursive: true });
        const projectFile = path.join(directory, 'CMakeLists.txt');
        fs.writeFileSync(projectFile, generateCMakeProject(context), 'utf8');
        writeCMakePresets(context, directory);
        return projectFile;
    }
    resolveCMake(context) {
        const cmake = context.kit.cmakePath || context.installation.cmakePath || findOnPath('cmake');
        if (!cmake)
            throw new Error('CMake was not found. Install CMake or select its executable in the Qt kit.');
        return cmake;
    }
    publishCompileCommands(context) {
        const source = path.join(context.buildDirectory, 'compile_commands.json');
        if (!fs.existsSync(source))
            return undefined;
        const target = path.join(context.root, 'compile_commands.json');
        try {
            fs.copyFileSync(source, target);
            this.output.appendLine(`[Qt CMake] Published compilation database: ${target}`);
            return target;
        }
        catch (error) {
            this.output.appendLine(`[Qt CMake] Unable to publish compile_commands.json: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    createContext(manifestPath, mode, installation) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
        const profile = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, mode);
        const kit = (0, qtProjectManifest_1.getQtKitProfileForBuild)(manifest, mode);
        const root = path.dirname(manifestPath);
        const modeFolder = (0, qtProjectManifest_1.isReleaseBuildMode)(mode) ? 'release' : 'debug';
        const buildDirectory = path.resolve(root, profile.outputDirectory, modeFolder, profile.system);
        const dependencyIntegration = manifest.dependencies.enabled ? (0, qpmQtDependencyModel_1.readDependencyIntegration)(root, manifest.dependencies.outputDirectory) : (0, qpmQtDependencyModel_1.emptyDependencyIntegration)();
        const environment = { ...createKitEnvironment(kit, installation), ...dependencyIntegration.environment };
        return {
            manifestPath, manifest, profile, kit, installation, mode, root, buildDirectory,
            targetPath: backendTargetPath(manifestPath, mode, manifest, installation),
            environment,
            jobs: profile.parallelJobs > 0 ? profile.parallelJobs : Math.max(1, os.cpus().length),
            dependencyIntegration
        };
    }
    run(executable, args, cwd, env, label) {
        this.output.appendLine(`[Qt Backend] ${label}`);
        this.output.appendLine(`[Qt Backend] Tool: ${executable}`);
        this.output.appendLine(`[Qt Backend] Arguments: ${args.map(quoteForLog).join(' ')}`);
        return new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(executable, args, { cwd, env, windowsHide: true, shell: false });
            child.stdout.on('data', (data) => this.output.append(data.toString()));
            child.stderr.on('data', (data) => this.output.append(data.toString()));
            child.on('error', (error) => {
                this.output.appendLine(`[Qt Backend] Unable to start ${executable}: ${error.message}`);
                resolve(false);
            });
            child.on('close', (code) => {
                this.output.appendLine(`[Qt Backend] ${path.basename(executable)} exited with code ${String(code)}.`);
                resolve(code === 0);
            });
        });
    }
}
exports.QpmQtBuildBackendService = QpmQtBuildBackendService;
function createKitEnvironment(kit, installation) {
    let env = { ...process.env };
    const script = kit.environmentScript || installation.toolchain.environmentScript || installation.vcVarsPath;
    if (script && process.platform === 'win32' && fs.existsSync(script)) {
        env = { ...env, ...captureWindowsEnvironment(script, kit.architecture === 'x86' ? 'x86' : 'x64') };
    }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
    const dirs = [installation.binDir, installation.toolchain.binDir, kit.compilerPath ? path.dirname(kit.compilerPath) : undefined, kit.buildToolPath ? path.dirname(kit.buildToolPath) : undefined, kit.cmakePath ? path.dirname(kit.cmakePath) : undefined].filter((entry) => !!entry);
    env[pathKey] = [...new Set(dirs), env[pathKey] || ''].join(path.delimiter);
    env.QTDIR = installation.root;
    if (installation.pluginsDir)
        env.QT_PLUGIN_PATH = installation.pluginsDir;
    if (installation.qmlDir)
        env.QML2_IMPORT_PATH = installation.qmlDir;
    return env;
}
function captureWindowsEnvironment(script, architecture) {
    try {
        const command = `"${script}" ${architecture} >nul && set`;
        const output = (0, child_process_1.execFileSync)(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
        const env = {};
        for (const line of output.split(/\r?\n/)) {
            const separator = line.indexOf('=');
            if (separator > 0)
                env[line.slice(0, separator)] = line.slice(separator + 1);
        }
        return env;
    }
    catch {
        return {};
    }
}
function generateQmakeProject(context) {
    const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(context.manifestPath, context.manifest);
    const kind = context.manifest.kind;
    const template = kind === 'static-library' || kind === 'shared-library' ? 'lib' : 'app';
    const config = [context.profile.variant, cppStandardQmake(context.profile.cppStandard)];
    if (kind === 'static-library')
        config.push('staticlib');
    if (kind === 'shared-library')
        config.push('dll');
    if (kind === 'console-application' || kind === 'test-application')
        config.push('console');
    else
        config.push('windows');
    if (context.profile.precompiledHeader)
        config.push('precompile_header');
    const targetDirectory = path.dirname(context.targetPath);
    const packagingMetadata = context.manifest.packaging.enabled && context.manifest.packaging.windows.embedVersionResource
        ? (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(context.manifestPath, context.manifest, context.mode)
        : undefined;
    const effectiveModules = (0, qpmQtModuleInference_1.effectiveQtModules)(context.manifestPath, context.manifest).modules;
    const lines = [
        '# Generated by Qt Project Manager',
        `QT += ${effectiveModules.map((module) => qmakeModuleName(module)).join(' ')}`,
        `TEMPLATE = ${template}`,
        `TARGET = ${qmakeQuote(context.manifest.targetName)}`,
        `CONFIG += ${config.join(' ')}`,
        `DESTDIR = ${qmakeQuote(targetDirectory)}`,
        // qmake runs with context.buildDirectory as cwd; relative intermediate dirs avoid
        // MinGW response-file corruption when the absolute Windows path contains spaces.
        'OBJECTS_DIR = obj',
        'MOC_DIR = moc',
        'UI_DIR = ui',
        'RCC_DIR = rcc',
        qmakeList('SOURCES', files.sources),
        qmakeList('HEADERS', files.headers),
        qmakeList('FORMS', files.forms),
        qmakeList('RESOURCES', files.resources),
        qmakeList('TRANSLATIONS', files.translations),
        qmakeList('QML_FILES', files.qml),
        qmakeList('INCLUDEPATH', [...context.manifest.includeDirectories.map((entry) => path.resolve(context.root, entry)), ...context.dependencyIntegration.includeDirectories]),
        qmakeList('DEFINES', [...context.manifest.defines, ...context.profile.defines]),
        (context.manifest.libraryDirectories.length || context.dependencyIntegration.libraryDirectories.length) ? `LIBS += ${[...context.manifest.libraryDirectories.map((entry) => path.resolve(context.root, entry)), ...context.dependencyIntegration.libraryDirectories].map((entry) => `-L${qmakeQuote(entry)}`).join(' ')}` : '',
        (context.manifest.libraries.length || context.dependencyIntegration.libraries.length) ? `LIBS += ${[...context.manifest.libraries, ...context.dependencyIntegration.libraries].map((entry) => entry.startsWith('-l') || path.isAbsolute(entry) ? qmakeQuote(entry) : `-l${entry}`).join(' ')}` : '',
        [...backendCompilerFlags(context), ...context.dependencyIntegration.compilerFlags].length ? `QMAKE_CXXFLAGS += ${[...backendCompilerFlags(context), ...context.dependencyIntegration.compilerFlags].join(' ')}` : '',
        [...backendLinkerFlags(context), ...context.dependencyIntegration.linkerFlags].length ? `QMAKE_LFLAGS += ${[...backendLinkerFlags(context), ...context.dependencyIntegration.linkerFlags].join(' ')}` : '',
        context.profile.precompiledHeader ? `PRECOMPILED_HEADER = ${qmakeQuote(path.resolve(context.root, context.profile.precompiledHeader))}` : '',
        packagingMetadata && process.platform === 'win32' ? `RC_FILE = ${qmakeQuote(packagingMetadata.windowsResource)}` : ''
    ].filter(Boolean);
    return `${lines.join('\n')}\n`;
}
function generateCMakeProject(context) {
    const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(context.manifestPath, context.manifest);
    const major = context.installation.majorVersion || 6;
    const target = cmakeQuote(context.manifest.targetName);
    const packagingMetadata = context.manifest.packaging.enabled && context.manifest.packaging.windows.embedVersionResource
        ? (0, qpmQtPackagingModel_1.writeQtPackagingMetadata)(context.manifestPath, context.manifest, context.mode)
        : undefined;
    const sourceEntries = [...files.sources, ...files.headers, ...files.forms, ...files.resources, ...files.qml, ...(packagingMetadata && process.platform === 'win32' ? [packagingMetadata.windowsResource] : [])];
    const sourceList = sourceEntries.map(cmakeQuote).join('\n  ');
    const effectiveModules = (0, qpmQtModuleInference_1.effectiveQtModules)(context.manifestPath, context.manifest).modules;
    const modules = effectiveModules.join(' ');
    const qtTargets = effectiveModules.map((module) => `Qt${major}::${module}`).join(' ');
    const kind = context.manifest.kind;
    const addTarget = kind === 'static-library' ? `add_library(${target} STATIC` : kind === 'shared-library' ? `add_library(${target} SHARED` : `add_executable(${target}${isGuiKind(kind) && process.platform === 'win32' ? ' WIN32' : ''}`;
    const closeTarget = `  ${sourceList}\n)`;
    const outputDir = cmakeQuote(path.dirname(context.targetPath));
    const includeDirs = [...context.manifest.includeDirectories.map((entry) => path.resolve(context.root, entry)), ...context.dependencyIntegration.includeDirectories].map(cmakeQuote).join('\n  ');
    const definitions = [...context.manifest.defines, ...context.profile.defines].map(cmakeQuote).join(' ');
    const libraries = [...context.manifest.libraries, ...context.dependencyIntegration.libraries, ...context.dependencyIntegration.cmakeLinkTargets].map(cmakeQuote).join(' ');
    const libraryDirs = [...context.manifest.libraryDirectories.map((entry) => path.resolve(context.root, entry)), ...context.dependencyIntegration.libraryDirectories].map(cmakeQuote).join('\n  ');
    const lines = [
        '# Generated by Qt Project Manager',
        'cmake_minimum_required(VERSION 3.21)',
        `project(${cmakeIdentifier(context.manifest.name)} LANGUAGES CXX${packagingMetadata && process.platform === 'win32' ? ' RC' : ''})`,
        `set(CMAKE_CXX_STANDARD ${context.profile.cppStandard.replace(/\D/g, '') || '17'})`,
        'set(CMAKE_CXX_STANDARD_REQUIRED ON)',
        `set(CMAKE_AUTOMOC ${context.profile.autoMoc ? 'ON' : 'OFF'})`,
        `set(CMAKE_AUTOUIC ${context.profile.autoUic ? 'ON' : 'OFF'})`,
        `set(CMAKE_AUTORCC ${context.profile.autoRcc ? 'ON' : 'OFF'})`,
        `set(CMAKE_UNITY_BUILD ${context.profile.unityBuild ? 'ON' : 'OFF'})`,
        `find_package(Qt${major} REQUIRED COMPONENTS ${modules})`,
        ...context.dependencyIntegration.cmakeFindPackages.map((entry) => `find_package(${entry})`),
        `${addTarget}\n${closeTarget}`,
        `target_link_libraries(${target} PRIVATE ${qtTargets}${libraries ? ` ${libraries}` : ''})`,
        includeDirs ? `target_include_directories(${target} PRIVATE\n  ${includeDirs}\n)` : '',
        libraryDirs ? `target_link_directories(${target} PRIVATE\n  ${libraryDirs}\n)` : '',
        definitions ? `target_compile_definitions(${target} PRIVATE ${definitions})` : '',
        [...backendCompilerFlags(context), ...context.dependencyIntegration.compilerFlags].length ? `target_compile_options(${target} PRIVATE ${[...backendCompilerFlags(context), ...context.dependencyIntegration.compilerFlags].map(cmakeQuote).join(' ')})` : '',
        [...backendLinkerFlags(context), ...context.dependencyIntegration.linkerFlags].length ? `target_link_options(${target} PRIVATE ${[...backendLinkerFlags(context), ...context.dependencyIntegration.linkerFlags].map(cmakeQuote).join(' ')})` : '',
        context.profile.precompiledHeader ? `target_precompile_headers(${target} PRIVATE ${cmakeQuote(path.resolve(context.root, context.profile.precompiledHeader))})` : '',
        `set_target_properties(${target} PROPERTIES\n  RUNTIME_OUTPUT_DIRECTORY ${outputDir}\n  LIBRARY_OUTPUT_DIRECTORY ${outputDir}\n  ARCHIVE_OUTPUT_DIRECTORY ${outputDir}\n  RUNTIME_OUTPUT_DIRECTORY_DEBUG ${outputDir}\n  RUNTIME_OUTPUT_DIRECTORY_RELEASE ${outputDir}\n  LIBRARY_OUTPUT_DIRECTORY_DEBUG ${outputDir}\n  LIBRARY_OUTPUT_DIRECTORY_RELEASE ${outputDir}\n  ARCHIVE_OUTPUT_DIRECTORY_DEBUG ${outputDir}\n  ARCHIVE_OUTPUT_DIRECTORY_RELEASE ${outputDir}\n)`
    ].filter(Boolean);
    return `${lines.join('\n\n')}\n`;
}
function writeCMakePresets(context, directory) {
    const generator = context.kit.generator || defaultGenerator(context.installation);
    const configureName = `${context.profile.id}-configure`;
    const buildName = `${context.profile.id}-build`;
    const document = {
        version: 6,
        configurePresets: [{
                name: configureName,
                displayName: `${context.profile.name} (${context.kit.name})`,
                generator,
                binaryDir: context.buildDirectory,
                cacheVariables: {
                    CMAKE_PREFIX_PATH: context.installation.root,
                    CMAKE_BUILD_TYPE: cmakeConfiguration(context),
                    CMAKE_EXPORT_COMPILE_COMMANDS: true
                }
            }],
        buildPresets: [{ name: buildName, configurePreset: configureName, configuration: cmakeConfiguration(context), jobs: context.jobs }]
    };
    fs.writeFileSync(path.join(directory, 'CMakePresets.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}
function cmakeCompilerArguments(context, generator) {
    if (/visual studio/i.test(generator))
        return [];
    const cpp = context.kit.compilerPath || context.installation.toolchain.cppCompilerPath;
    const c = context.kit.cCompilerPath || context.installation.toolchain.cCompilerPath;
    return [...(cpp ? [`-DCMAKE_CXX_COMPILER=${cpp}`] : []), ...(c ? [`-DCMAKE_C_COMPILER=${c}`] : [])];
}
function defaultGenerator(installation) {
    if (installation.ninjaPath)
        return 'Ninja';
    if (installation.compilerFamily === 'msvc')
        return installation.ninjaPath ? 'Ninja' : 'NMake Makefiles';
    return process.platform === 'win32' ? 'MinGW Makefiles' : 'Unix Makefiles';
}
function backendTargetPath(manifestPath, mode, manifest, installation) {
    const standard = (0, qtProjectManifest_1.qtTargetPath)(manifestPath, mode, manifest);
    if (manifest.kind === 'static-library' && installation.compilerFamily === 'msvc') {
        const base = path.dirname(standard);
        const name = manifest.targetName.toLowerCase().startsWith('lib') ? manifest.targetName.slice(3) : manifest.targetName;
        return path.join(base, `${name}.lib`);
    }
    return standard;
}
function backendCompilerFlags(context) {
    if (context.installation.compilerFamily !== 'msvc')
        return [...context.profile.compilerFlags];
    const translated = [];
    for (const flag of context.profile.compilerFlags) {
        if (flag.startsWith('/'))
            translated.push(flag);
        else if (flag === '-O0')
            translated.push('/Od');
        else if (flag === '-O1')
            translated.push('/O1');
        else if (flag === '-O2' || flag === '-O3')
            translated.push('/O2');
        else if (flag === '-g')
            translated.push('/Zi');
        else if (flag === '-Wall' || flag === '-Wextra')
            translated.push('/W4');
        else if (flag === '-fno-omit-frame-pointer')
            translated.push('/Oy-');
        else if (!flag.startsWith('-'))
            translated.push(flag);
    }
    return [...new Set(translated)];
}
function backendLinkerFlags(context) {
    if (context.installation.compilerFamily !== 'msvc')
        return [...context.profile.linkerFlags];
    return context.profile.linkerFlags.filter((flag) => flag.startsWith('/') || !flag.startsWith('-'));
}
function cmakeConfiguration(context) { return context.profile.variant === 'release' ? 'Release' : 'Debug'; }
function backendLabel(value) { return value === 'qmake' ? 'qmake' : 'CMake'; }
function cppStandardQmake(value) { return value === 'c++23' ? 'c++2b' : value; }
function qmakeModuleName(value) { return value.toLowerCase(); }
function qmakeQuote(value) { return `$$quote(${value.replace(/\\/g, '/')})`; }
function qmakeList(name, values) { return values.length ? `${name} += ${values.map(qmakeQuote).join(' \\\n  ')}` : ''; }
function cmakeQuote(value) { return `"${value.replace(/\\/g, '/').replace(/"/g, '\\"')}"`; }
function cmakeIdentifier(value) { return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^\d/, '_$&') || 'QpmProject'; }
function isGuiKind(kind) { return kind === 'widgets-application' || kind === 'quick-application' || kind === 'quick-test-application'; }
function buildToolPriority(tool, family) {
    const name = path.basename(tool).toLowerCase();
    if (family === 'mingw') {
        if (name.includes('mingw32-make'))
            return 0;
        if (name.includes('ninja'))
            return 1;
        return 5;
    }
    if (name.startsWith('jom'))
        return 0;
    if (name.startsWith('nmake'))
        return 1;
    if (name.includes('ninja'))
        return 2;
    return 5;
}
function makeParallelArguments(tool, jobs) {
    const name = path.basename(tool).toLowerCase();
    if (jobs <= 0 || name.startsWith('nmake'))
        return [];
    if (name.startsWith('jom'))
        return ['-j', String(jobs)];
    if (name.includes('ninja'))
        return ['-j', String(jobs)];
    return [`-j${jobs}`];
}
function validateTarget(targetPath, output) {
    if (fs.existsSync(targetPath))
        return true;
    output.appendLine(`[Qt Backend] Expected target was not created: ${targetPath}`);
    return false;
}
function quoteForLog(value) { return /\s/.test(value) ? JSON.stringify(value) : value; }
function findOnPath(name) {
    const executable = process.platform === 'win32' ? `${name}.exe` : name;
    for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
        const candidate = path.join(directory.replace(/^"|"$/g, ''), executable);
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
