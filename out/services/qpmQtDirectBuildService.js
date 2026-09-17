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
exports.qtGenerationOutputDirectories = qtGenerationOutputDirectories;
exports.createQtDirectBuildPlan = createQtDirectBuildPlan;
exports.qtCompileArguments = qtCompileArguments;
exports.qtPrecompiledHeaderArguments = qtPrecompiledHeaderArguments;
exports.qtLinkArguments = qtLinkArguments;
exports.qtDependencyPathForObject = qtDependencyPathForObject;
exports.qtObjectPathForSource = qtObjectPathForSource;
exports.generationStepIsOutdated = generationStepIsOutdated;
exports.sourceNeedsCompilation = sourceNeedsCompilation;
exports.readGnuDependencyFile = readGnuDependencyFile;
exports.resolveQtModuleOrder = resolveQtModuleOrder;
exports.resolveQtMkspecDirectory = resolveQtMkspecDirectory;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmQtPackagingModel_1 = require("./qpmQtPackagingModel");
const qpmQtBrandingService_1 = require("./qpmQtBrandingService");
const qpmQtModuleInference_1 = require("./qpmQtModuleInference");
const qpmQtDependencyModel_1 = require("./qpmQtDependencyModel");
const qpmQtLinkage_1 = require("./qpmQtLinkage");
/**
 * Direct Qt code generation can write outside the generic generated folder.
 * In particular, windres writes the product metadata object into the object
 * directory. Every output parent must therefore exist before any tool starts.
 */
function qtGenerationOutputDirectories(plan) {
    return unique([
        plan.generatedDirectory,
        ...plan.generationSteps.map((step) => path.dirname(step.outputPath))
    ]);
}
const META_OBJECT_PATTERN = /\b(Q_OBJECT|Q_GADGET|Q_GADGET_EXPORT|Q_NAMESPACE|Q_NAMESPACE_EXPORT)\b/;
function createQtDirectBuildPlan(manifestPath, mode, installation) {
    const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(manifestPath);
    const buildProfile = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, mode);
    if (buildProfile.system !== 'direct') {
        throw new Error(`Project ${manifest.name} uses the ${buildProfile.system} backend in profile ${buildProfile.name}. Select the direct backend before using the direct Qt build engine.`);
    }
    if (!installation.mocPath || !installation.uicPath || !installation.rccPath) {
        throw new Error('The selected Qt installation does not provide moc, uic and rcc.');
    }
    if (!installation.toolchain.cppCompilerPath) {
        throw new Error(`No C++ compiler compatible with ${installation.label} was detected. Select the compiler installed with this Qt kit.`);
    }
    if (installation.toolchain.compatibility === 'incompatible') {
        throw new Error(installation.toolchain.diagnostic ?? `The selected compiler is incompatible with ${installation.label}.`);
    }
    if (installation.architecture !== 'unknown' && installation.toolchain.detectedArchitecture && installation.toolchain.detectedArchitecture !== 'unknown' && installation.architecture !== installation.toolchain.detectedArchitecture) {
        throw new Error(`Qt kit/compiler architecture mismatch: the kit is ${installation.architecture}, but ${installation.toolchain.cppCompilerPath} targets ${installation.toolchain.detectedArchitecture}.`);
    }
    if (installation.toolchain.family === 'msvc') {
        throw new Error('The direct build backend supports GCC/MinGW and Clang command-line toolchains. Use the qmake or CMake backend with an MSVC kit.');
    }
    if (process.platform === 'darwin') {
        throw new Error('The direct Qt backend does not yet support macOS framework linking. Use the CMake backend for macOS projects.');
    }
    if (manifest.qt.majorVersion !== 'auto' && installation.majorVersion > 0 && manifest.qt.majorVersion !== installation.majorVersion) {
        throw new Error(`Project ${manifest.name} requires Qt ${manifest.qt.majorVersion}, but the selected kit is Qt ${installation.majorVersion}.`);
    }
    const linkageDiagnostic = (0, qpmQtLinkage_1.validateQtLinkageSelection)(installation, buildProfile.linkage, 'direct');
    if (linkageDiagnostic)
        throw new Error(linkageDiagnostic);
    const modeIs64Bit = mode === 'debug64' || mode === 'release64';
    if (installation.architecture === 'x64' && !modeIs64Bit) {
        throw new Error(`Build mode ${mode} is 32-bit, but the selected Qt kit is x64. Select Debug x64 or Release x64.`);
    }
    if (installation.architecture === 'x86' && modeIs64Bit) {
        throw new Error(`Build mode ${mode} is 64-bit, but the selected Qt kit is x86. Select Debug x86 or Release x86.`);
    }
    const projectDirectory = path.dirname(manifestPath);
    const dependencyIntegration = manifest.dependencies.enabled ? (0, qpmQtDependencyModel_1.readDependencyIntegration)(projectDirectory, manifest.dependencies.outputDirectory) : undefined;
    const files = (0, qtProjectManifest_1.resolveQtProjectFiles)(manifestPath, manifest);
    const generatedDirectory = (0, qtProjectManifest_1.qtGeneratedDirectory)(manifestPath, mode, manifest);
    const objectDirectory = (0, qtProjectManifest_1.qtObjectDirectory)(manifestPath, mode, manifest);
    const warnings = [];
    const generationSteps = [];
    const generatedSourceFiles = [];
    const generatedHeaderFiles = [];
    const additionalObjectFiles = [];
    const usedGeneratedNames = new Map();
    const moduleInference = (0, qpmQtModuleInference_1.effectiveQtModules)(manifestPath, manifest);
    const autoDetectedModules = (0, qpmQtModuleInference_1.describeAutoDetectedQtModules)(manifest, moduleInference);
    if (autoDetectedModules.length > 0) {
        warnings.push(`Automatically detected Qt module requirements: ${autoDetectedModules.join('; ')}.`);
    }
    const moduleOrder = resolveQtModuleOrder(moduleInference.modules);
    for (const module of moduleOrder) {
        const moduleInclude = path.join(installation.includeDir, `Qt${module}`);
        if (!fs.existsSync(moduleInclude)) {
            throw new Error(`Qt module ${module} is not installed in the selected kit: ${moduleInclude}`);
        }
    }
    const includeDirectories = unique([
        projectDirectory,
        ...manifest.includeDirectories.map((entry) => path.resolve(projectDirectory, entry)),
        ...files.headers.map((entry) => path.dirname(entry)),
        generatedDirectory,
        installation.includeDir,
        ...moduleOrder.map((module) => path.join(installation.includeDir, `Qt${module}`)),
        ...(resolveQtMkspecDirectory(installation) ? [resolveQtMkspecDirectory(installation)] : []),
        ...(dependencyIntegration?.includeDirectories ?? [])
    ]);
    const modeSettings = buildProfile;
    const guiApplication = manifest.kind === 'widgets-application' || manifest.kind === 'quick-application' || manifest.kind === 'quick-test-application';
    const consoleSubsystem = process.platform === 'win32' && (0, qtProjectManifest_1.qtBuildUsesConsoleSubsystem)(manifest, buildProfile);
    const windowsGuiEntryPoint = guiApplication && !consoleSubsystem;
    const platformDefines = process.platform === 'win32'
        ? ['WIN32', '_WIN32', 'UNICODE', '_UNICODE', ...(installation.architecture === 'x64' ? ['WIN64', '_WIN64'] : []), ...(windowsGuiEntryPoint ? ['QT_NEEDS_QMAIN'] : [])]
        : [];
    const defines = unique([
        ...manifest.defines,
        ...modeSettings.defines,
        ...platformDefines,
        ...moduleOrder.map((module) => `QT_${moduleDefineName(module)}_LIB`)
    ]);
    const windowsEntryPoint = resolveWindowsEntryPointArguments(installation, manifest, (0, qtProjectManifest_1.isReleaseBuildMode)(mode), windowsGuiEntryPoint);
    if (buildProfile.autoUic) {
        for (const formPath of files.forms) {
            assertFileExists(formPath, 'Qt Designer form');
            const baseName = path.basename(formPath, path.extname(formPath));
            const outputPath = reserveGeneratedPath(generatedDirectory, `ui_${baseName}.h`, formPath, usedGeneratedNames);
            generationSteps.push({
                kind: 'uic', inputPath: formPath, outputPath, toolPath: installation.uicPath,
                arguments: ['-o', outputPath, formPath], compileOutput: false
            });
            generatedHeaderFiles.push(outputPath);
        }
    }
    if (buildProfile.autoRcc) {
        for (const resourcePath of files.resources) {
            assertFileExists(resourcePath, 'Qt resource collection');
            const baseName = path.basename(resourcePath, path.extname(resourcePath));
            const outputPath = reserveGeneratedPath(generatedDirectory, `qrc_${baseName}.cpp`, resourcePath, usedGeneratedNames, true);
            generationSteps.push({
                kind: 'rcc', inputPath: resourcePath, outputPath, toolPath: installation.rccPath,
                arguments: ['-name', sanitizeIdentifier(baseName), resourcePath, '-o', outputPath], compileOutput: true,
                dependencies: parseQrcDependencies(resourcePath)
            });
            generatedSourceFiles.push(outputPath);
        }
    }
    const brandingArtifacts = (0, qpmQtBrandingService_1.writeQtBrandingArtifacts)(manifestPath, manifest);
    if (brandingArtifacts.windowStartupSource && brandingArtifacts.windowResource) {
        generatedSourceFiles.push(brandingArtifacts.windowStartupSource);
        const outputPath = reserveGeneratedPath(generatedDirectory, 'qrc_qpm_branding.cpp', brandingArtifacts.windowResource, usedGeneratedNames, true);
        generationSteps.push({
            kind: 'rcc', inputPath: brandingArtifacts.windowResource, outputPath, toolPath: installation.rccPath,
            arguments: ['-name', 'qpm_branding', brandingArtifacts.windowResource, '-o', outputPath], compileOutput: true,
            dependencies: brandingArtifacts.windowIconCopy ? [brandingArtifacts.windowIconCopy] : []
        });
        generatedSourceFiles.push(outputPath);
    }
    const includeWindowsMetadata = manifest.packaging.enabled && manifest.packaging.windows.embedVersionResource;
    const needsWindowsResource = process.platform === 'win32' && manifest.kind !== 'static-library' && (includeWindowsMetadata || !!(0, qtProjectManifest_1.executableIconPath)(manifest));
    if (needsWindowsResource) {
        const metadata = (0, qpmQtPackagingModel_1.writeQtWindowsBuildResource)(manifestPath, manifest, includeWindowsMetadata);
        const configuredWindres = manifest.packaging.windows.resourceCompilerPath
            ? path.resolve(projectDirectory, manifest.packaging.windows.resourceCompilerPath)
            : undefined;
        const compilerBin = installation.toolchain.binDir || path.dirname(installation.toolchain.cppCompilerPath);
        const windresCandidates = [configuredWindres, path.join(compilerBin, 'windres.exe'), path.join(compilerBin, 'windres')].filter((entry) => !!entry);
        const windresPath = windresCandidates.find((candidate) => fs.existsSync(candidate));
        if (windresPath) {
            const outputPath = path.join(objectDirectory, 'qpm_product_metadata.o');
            const dependencies = [metadata.windowsManifest];
            const configuredExecutableIcon = (0, qtProjectManifest_1.executableIconPath)(manifest);
            if (configuredExecutableIcon)
                dependencies.push(path.resolve(projectDirectory, configuredExecutableIcon));
            if (manifest.packaging.windows.manifestFile)
                dependencies.push(path.resolve(projectDirectory, manifest.packaging.windows.manifestFile));
            generationSteps.push({
                kind: 'windres', inputPath: metadata.windowsResource, outputPath, toolPath: windresPath,
                arguments: ['-i', metadata.windowsResource, '-O', 'coff', '-o', outputPath], compileOutput: false, dependencies
            });
            additionalObjectFiles.push(outputPath);
        }
        else {
            warnings.push('Windows executable resources are enabled, but windres was not found beside the selected MinGW compiler. The generated icon/version resources will not be embedded in the executable.');
        }
    }
    if (buildProfile.autoMoc) {
        for (const headerPath of files.headers) {
            if (!fileContainsMetaObjectMacro(headerPath))
                continue;
            const baseName = path.basename(headerPath, path.extname(headerPath));
            const outputPath = reserveGeneratedPath(generatedDirectory, `moc_${baseName}.cpp`, headerPath, usedGeneratedNames, true);
            generationSteps.push({
                kind: 'moc-header', inputPath: headerPath, outputPath, toolPath: installation.mocPath,
                arguments: [...mocPreprocessorArguments(includeDirectories, defines), headerPath, '-o', outputPath], compileOutput: true
            });
            generatedSourceFiles.push(outputPath);
        }
        for (const sourcePath of files.sources) {
            if (!fileContainsMetaObjectMacro(sourcePath))
                continue;
            const source = fs.readFileSync(sourcePath, 'utf8');
            const expectedName = `${path.basename(sourcePath, path.extname(sourcePath))}.moc`;
            const includePattern = new RegExp(`#\\s*include\\s*[<\"](?:[^>\"]*[\\\\/])?${escapeRegExp(expectedName)}[>\"]`);
            if (!includePattern.test(source)) {
                throw new Error(`${path.basename(sourcePath)} contains a Qt meta-object macro but does not include \"${expectedName}\". Add the include at the end of the source file, or move the Q_OBJECT class declaration to a header.`);
            }
            const outputPath = reserveGeneratedPath(generatedDirectory, expectedName, sourcePath, usedGeneratedNames);
            generationSteps.push({
                kind: 'moc-source', inputPath: sourcePath, outputPath, toolPath: installation.mocPath,
                arguments: [...mocPreprocessorArguments(includeDirectories, defines), sourcePath, '-o', outputPath], compileOutput: false
            });
            generatedHeaderFiles.push(outputPath);
        }
    }
    for (const sourcePath of files.sources)
        assertFileExists(sourcePath, 'C++ source');
    for (const headerPath of files.headers)
        if (!fs.existsSync(headerPath))
            warnings.push(`Header not found: ${headerPath}`);
    const qtLibraries = moduleOrder.map((module) => resolveQtLibraryName(installation, module, (0, qtProjectManifest_1.isReleaseBuildMode)(mode)));
    for (const library of qtLibraries) {
        if (!qtLibraryCandidates(installation, library).some((candidate) => fs.existsSync(candidate))) {
            throw new Error(`Qt library ${library} was not found in the selected kit: ${installation.libDir}`);
        }
    }
    let precompiledHeaderPath;
    let precompiledHeaderCopyPath;
    let precompiledHeaderOutputPath;
    if (buildProfile.precompiledHeader) {
        precompiledHeaderPath = path.resolve(projectDirectory, buildProfile.precompiledHeader);
        assertFileExists(precompiledHeaderPath, 'precompiled header');
        precompiledHeaderCopyPath = path.join(generatedDirectory, 'qpm_precompiled_header.h');
        precompiledHeaderOutputPath = `${precompiledHeaderCopyPath}.gch`;
    }
    return {
        manifestPath,
        manifest,
        buildProfile,
        installation,
        mode,
        projectDirectory,
        targetPath: (0, qtProjectManifest_1.qtTargetPath)(manifestPath, mode, manifest),
        importLibraryPath: (0, qtProjectManifest_1.qtImportLibraryPath)(manifestPath, mode, manifest),
        objectDirectory,
        generatedDirectory,
        sourceFiles: files.sources,
        headerFiles: files.headers,
        generatedSourceFiles,
        generatedHeaderFiles,
        additionalObjectFiles,
        precompiledHeaderPath,
        precompiledHeaderCopyPath,
        precompiledHeaderOutputPath,
        includeDirectories,
        libraryDirectories: unique([installation.libDir, ...manifest.libraryDirectories.map((entry) => path.resolve(projectDirectory, entry)), ...(dependencyIntegration?.libraryDirectories ?? [])]),
        defines,
        compilerFlags: unique([...(modeSettings.compilerFlags ?? []), ...(dependencyIntegration?.compilerFlags ?? [])]),
        linkerFlags: unique([
            ...(0, qpmQtLinkage_1.compilerStaticRuntimeLinkerFlags)(installation, buildProfile.linkage),
            ...(modeSettings.linkerFlags ?? []),
            ...(dependencyIntegration?.linkerFlags ?? [])
        ]),
        entryPointArguments: windowsEntryPoint.arguments,
        qtLibraries,
        userLibraries: unique([...manifest.libraries, ...(dependencyIntegration?.libraries ?? [])]),
        platformLibraries: windowsEntryPoint.platformLibraries,
        generationSteps,
        warnings,
        autoDetectedModules
    };
}
function qtCompileArguments(plan, sourcePath, objectPath) {
    const dependencyPath = qtDependencyPathForObject(objectPath);
    return [
        '-c', sourcePath,
        '-MMD', '-MP', '-MF', dependencyPath,
        `-std=${plan.buildProfile.cppStandard || 'c++17'}`,
        ...(plan.precompiledHeaderCopyPath ? ['-include', plan.precompiledHeaderCopyPath] : []),
        ...plan.compilerFlags,
        ...plan.defines.map((define) => `-D${define}`),
        ...plan.includeDirectories.flatMap((directory) => ['-I', directory]),
        '-o', objectPath
    ];
}
function qtPrecompiledHeaderArguments(plan) {
    if (!plan.precompiledHeaderCopyPath || !plan.precompiledHeaderOutputPath)
        return [];
    return [
        '-x', 'c++-header', plan.precompiledHeaderCopyPath,
        `-std=${plan.buildProfile.cppStandard || 'c++17'}`,
        ...plan.compilerFlags,
        ...plan.defines.map((define) => `-D${define}`),
        ...plan.includeDirectories.flatMap((directory) => ['-I', directory]),
        '-o', plan.precompiledHeaderOutputPath
    ];
}
function qtLinkArguments(plan, objectFiles) {
    const args = [];
    if (plan.manifest.kind === 'shared-library')
        args.push('-shared');
    if (plan.importLibraryPath)
        args.push(`-Wl,--out-implib,${plan.importLibraryPath}`);
    if (process.platform === 'win32' && plan.manifest.kind !== 'static-library' && plan.manifest.kind !== 'shared-library') {
        if ((0, qtProjectManifest_1.qtBuildUsesConsoleSubsystem)(plan.manifest, plan.buildProfile))
            args.push('-mconsole');
        else if (plan.manifest.kind !== 'console-application' && plan.manifest.kind !== 'test-application')
            args.push('-mwindows');
    }
    args.push(...objectFiles, ...plan.libraryDirectories.flatMap((directory) => ['-L', directory]), ...plan.entryPointArguments, ...plan.qtLibraries.map((library) => library.startsWith('-l') || path.isAbsolute(library) ? library : `-l${library}`), ...plan.userLibraries.map(normalizeUserLibraryArgument), ...plan.platformLibraries, ...plan.linkerFlags, '-o', plan.targetPath);
    return args;
}
function qtDependencyPathForObject(objectPath) {
    return `${objectPath}.d`;
}
function qtObjectPathForSource(plan, sourcePath) {
    const relative = path.relative(plan.projectDirectory, sourcePath).replace(/[^A-Za-z0-9_.-]+/g, '_');
    const hash = shortHash(path.resolve(sourcePath).toLowerCase());
    return path.join(plan.objectDirectory, `${relative}.${hash}.o`);
}
function generationStepIsOutdated(step) {
    if (!fs.existsSync(step.outputPath))
        return true;
    const outputTime = fs.statSync(step.outputPath).mtimeMs;
    if (fs.statSync(step.inputPath).mtimeMs > outputTime)
        return true;
    return (step.dependencies ?? []).some((dependency) => !fs.existsSync(dependency) || fs.statSync(dependency).mtimeMs > outputTime);
}
function sourceNeedsCompilation(sourcePath, objectPath, generatedDependencies, rebuild) {
    if (rebuild || !fs.existsSync(objectPath))
        return true;
    const objectTime = fs.statSync(objectPath).mtimeMs;
    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).mtimeMs > objectTime)
        return true;
    const dependencyPath = qtDependencyPathForObject(objectPath);
    if (!fs.existsSync(dependencyPath))
        return true;
    const discoveredDependencies = readGnuDependencyFile(dependencyPath);
    if (discoveredDependencies.length === 0)
        return true;
    const dependencies = unique([...discoveredDependencies, ...generatedDependencies]);
    return dependencies.some((dependency) => !fs.existsSync(dependency) || fs.statSync(dependency).mtimeMs > objectTime);
}
/** Parse the GCC/Clang Makefile dependency output produced by -MMD/-MF. */
function readGnuDependencyFile(dependencyPath) {
    try {
        const content = fs.readFileSync(dependencyPath, 'utf8').replace(/\\\r?\n/g, ' ');
        const separator = content.search(/:\s/);
        if (separator < 0)
            return [];
        const body = content.slice(separator + 1).trim();
        const tokens = [];
        let current = '';
        let escaping = false;
        for (const char of body) {
            if (escaping) {
                if (/\s/.test(char) || char === '\\' || char === '#')
                    current += char;
                else
                    current += `\\${char}`;
                escaping = false;
            }
            else if (char === '\\') {
                escaping = true;
            }
            else if (/\s/.test(char)) {
                if (current) {
                    tokens.push(current);
                    current = '';
                }
            }
            else {
                current += char;
            }
        }
        if (escaping)
            current += '\\';
        if (current)
            tokens.push(current);
        const base = path.dirname(dependencyPath);
        return unique(tokens.filter(Boolean).map((entry) => path.isAbsolute(entry) || /^[A-Za-z]:[\\/]/.test(entry) ? path.normalize(entry) : path.resolve(base, entry)));
    }
    catch {
        return [];
    }
}
function resolveQtModuleOrder(requestedModules) {
    const dependencies = {
        Core5Compat: ['Core'],
        Widgets: ['Gui', 'Core'],
        Gui: ['Core'],
        Network: ['Core'],
        Concurrent: ['Core'],
        SerialPort: ['Core'],
        SerialBus: ['Core'],
        Bluetooth: ['Network', 'Core'],
        Sql: ['Core'],
        Xml: ['Core'],
        Multimedia: ['Gui', 'Network', 'Core'],
        MultimediaWidgets: ['Multimedia', 'Widgets', 'Gui', 'Core'],
        OpenGL: ['Gui', 'Core'],
        OpenGLWidgets: ['OpenGL', 'Widgets', 'Gui', 'Core'],
        PrintSupport: ['Widgets', 'Gui', 'Core'],
        Qml: ['Network', 'Core'],
        QmlModels: ['Qml', 'Network', 'Core'],
        Quick: ['QmlModels', 'Qml', 'Gui', 'Network', 'Core'],
        QuickControls2: ['Quick', 'QmlModels', 'Qml', 'Gui', 'Network', 'Core'],
        QuickWidgets: ['Quick', 'Widgets', 'QmlModels', 'Qml', 'Gui', 'Network', 'Core'],
        QuickTest: ['Quick', 'Test', 'QmlModels', 'Qml', 'Gui', 'Network', 'Core'],
        Svg: ['Gui', 'Core'],
        SvgWidgets: ['Svg', 'Widgets', 'Gui', 'Core'],
        Charts: ['Widgets', 'Gui', 'Core'],
        StateMachine: ['Core'],
        WebSockets: ['Network', 'Core'],
        HttpServer: ['Network', 'Core'],
        Positioning: ['Core'],
        Sensors: ['Core'],
        Test: ['Core'],
        WebEngineCore: ['Network', 'Gui', 'Core'],
        WebEngineQuick: ['WebEngineCore', 'Quick', 'Qml', 'Gui', 'Core'],
        WebEngineWidgets: ['WebEngineCore', 'Widgets', 'Gui', 'Core'],
        Pdf: ['Gui', 'Core'],
        PdfWidgets: ['Pdf', 'Widgets', 'Gui', 'Core']
    };
    const result = [];
    const visiting = new Set();
    const visit = (module) => {
        const normalized = normalizeModuleName(module);
        if (!normalized)
            return;
        const key = normalized.toLowerCase();
        if (visiting.has(key))
            throw new Error(`Cyclic Qt module dependency detected at ${normalized}.`);
        const previousIndex = result.findIndex((entry) => entry.toLowerCase() === key);
        if (previousIndex >= 0)
            result.splice(previousIndex, 1);
        result.push(normalized);
        visiting.add(key);
        for (const dependency of dependencies[normalized] ?? [])
            visit(dependency);
        visiting.delete(key);
    };
    for (const module of requestedModules)
        visit(module);
    visit('Core');
    return result;
}
function resolveWindowsEntryPointArguments(installation, manifest, release, useGuiEntryPoint) {
    if (process.platform !== 'win32' || !useGuiEntryPoint)
        return { arguments: [], platformLibraries: [] };
    const major = installation.majorVersion || Number(installation.version.split('.')[0]) || 6;
    const entryPointNames = major >= 6
        ? ['libQt6EntryPoint.a', 'Qt6EntryPoint.lib']
        : release
            ? ['libqtmain.a', 'qtmain.lib']
            : ['libqtmaind.a', 'qtmaind.lib', 'libqtmain.a', 'qtmain.lib'];
    const entryPointPath = entryPointNames.map((name) => path.join(installation.libDir, name)).find((candidate) => fs.existsSync(candidate));
    if (!entryPointPath) {
        throw new Error(`The selected Qt kit does not provide the Windows GUI entry-point library (${entryPointNames.join(' or ')}).`);
    }
    const prlNames = major >= 6 ? ['Qt6EntryPoint.prl'] : release ? ['qtmain.prl'] : ['qtmaind.prl', 'qtmain.prl'];
    const prlPath = prlNames.map((name) => path.join(installation.libDir, name)).find((candidate) => fs.existsSync(candidate));
    const platformLibraries = prlPath ? parsePrlLibraries(prlPath, installation) : [];
    if (!platformLibraries.some((value) => /(?:^|-)lshell32$/i.test(value) || /shell32\.lib$/i.test(value))) {
        platformLibraries.push('-lshell32');
    }
    return {
        arguments: ['-lmingw32', entryPointPath],
        platformLibraries: unique(platformLibraries)
    };
}
function parsePrlLibraries(prlPath, installation) {
    try {
        const content = fs.readFileSync(prlPath, 'utf8').replace(/\\\r?\n/g, ' ');
        const match = content.match(/^QMAKE_PRL_LIBS\s*=\s*(.*)$/m);
        if (!match)
            return [];
        const expanded = match[1]
            .replace(/\$\$\[QT_INSTALL_LIBS\]/g, installation.libDir)
            .replace(/\$\$\[QT_INSTALL_BINS\]/g, installation.binDir)
            .replace(/\$\$\[QT_INSTALL_PREFIX\]/g, installation.root);
        return tokenizePrlValue(expanded).filter((value) => value && value !== '\\');
    }
    catch {
        return [];
    }
}
function tokenizePrlValue(value) {
    const result = [];
    const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+)/g;
    let match;
    while ((match = pattern.exec(value)) !== null) {
        result.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\"/g, '"'));
    }
    return result;
}
function resolveQtLibraryName(installation, module, release) {
    const major = installation.majorVersion || Number(installation.version.split('.')[0]) || 6;
    const base = `Qt${major}${module}`;
    if (!release) {
        const debugName = `${base}d`;
        if (qtLibraryCandidates(installation, debugName).some((candidate) => fs.existsSync(candidate)))
            return debugName;
    }
    return base;
}
function qtLibraryCandidates(installation, libraryName) {
    return [
        path.join(installation.libDir, `lib${libraryName}.a`),
        path.join(installation.libDir, `${libraryName}.lib`),
        path.join(installation.libDir, `lib${libraryName}.so`),
        path.join(installation.libDir, `lib${libraryName}.dylib`)
    ];
}
function mocPreprocessorArguments(includeDirectories, defines) {
    return [
        ...defines.map((define) => `-D${define}`),
        ...includeDirectories.flatMap((directory) => ['-I', directory])
    ];
}
function fileContainsMetaObjectMacro(filePath) {
    if (!fs.existsSync(filePath))
        return false;
    return META_OBJECT_PATTERN.test(stripCommentsAndStrings(fs.readFileSync(filePath, 'utf8')));
}
function stripCommentsAndStrings(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, "''");
}
function reserveGeneratedPath(directory, name, inputPath, used, allowHash = false) {
    const key = name.toLowerCase();
    const previous = used.get(key);
    let effectiveName = name;
    if (previous && path.resolve(previous).toLowerCase() !== path.resolve(inputPath).toLowerCase()) {
        if (!allowHash) {
            throw new Error(`Generated Qt file name collision for ${name}: ${previous} and ${inputPath}. Rename one of the source files.`);
        }
        effectiveName = `${path.basename(name, path.extname(name))}_${shortHash(inputPath)}${path.extname(name)}`;
    }
    used.set(effectiveName.toLowerCase(), inputPath);
    return path.join(directory, effectiveName);
}
function defaultMkspecForInstallation(installation) {
    const family = installation.toolchain.family || installation.compilerFamily;
    if (process.platform === 'win32')
        return family === 'msvc' ? 'win32-msvc' : 'win32-g++';
    if (process.platform === 'darwin')
        return 'macx-clang';
    return family === 'clang' ? 'linux-clang' : 'linux-g++';
}
/**
 * Resolve the mkspec from the selected Qt kit rather than from the host that is
 * currently running tests or packaging the extension. A Windows MinGW kit can
 * therefore resolve win32-g++ even when the code is validated on another OS.
 */
function resolveQtMkspecDirectory(installation) {
    if (!installation.mkspecsDir)
        return undefined;
    const family = installation.toolchain.family || installation.compilerFamily;
    const familyCandidates = family === 'msvc'
        ? ['win32-msvc']
        : family === 'mingw'
            ? ['win32-g++', 'linux-g++']
            : family === 'clang'
                ? ['win32-clang-g++', 'win32-clang-msvc', 'macx-clang', 'linux-clang']
                : ['linux-g++', 'win32-g++'];
    const candidates = unique([defaultMkspecForInstallation(installation), ...familyCandidates]);
    const existing = candidates.find((candidate) => fs.existsSync(path.join(installation.mkspecsDir, candidate)));
    return path.join(installation.mkspecsDir, existing ?? candidates[0]);
}
function moduleDefineName(module) {
    return module.replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
}
function parseQrcDependencies(resourcePath) {
    try {
        const content = fs.readFileSync(resourcePath, 'utf8');
        const root = path.dirname(resourcePath);
        const result = [];
        const pattern = /<file(?:\s+[^>]*)?>([^<]+)<\/file>/gi;
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const value = decodeXmlEntities(match[1].trim());
            if (value)
                result.push(path.resolve(root, value));
        }
        return unique(result);
    }
    catch {
        return [];
    }
}
function decodeXmlEntities(value) {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function normalizeModuleName(module) {
    const cleaned = module.trim().replace(/^Qt\d*::/i, '').replace(/^Qt\d*/i, '');
    if (!cleaned)
        return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
function normalizeUserLibraryArgument(library) {
    const value = library.trim();
    if (!value)
        return value;
    if (value.startsWith('-l') || value.startsWith('-Wl,') || path.isAbsolute(value) || /[\\/]/.test(value))
        return value;
    return `-l${value}`;
}
function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath))
        throw new Error(`${label} not found: ${filePath}`);
}
function sanitizeIdentifier(value) {
    const normalized = value.replace(/[^A-Za-z0-9_]/g, '_');
    return /^[A-Za-z_]/.test(normalized) ? normalized : `qpm_${normalized}`;
}
function shortHash(value) {
    return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
}
function unique(values) {
    const seen = new Set();
    const result = [];
    for (const value of values.filter(Boolean)) {
        const key = process.platform === 'win32' ? value.toLowerCase() : value;
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
