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
exports.QtProjectSettingsPanel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const QT_MODULES = [
    'Core', 'Core5Compat', 'Gui', 'Widgets', 'Network', 'Concurrent',
    'SerialPort', 'SerialBus', 'Bluetooth', 'Sql', 'Xml',
    'Multimedia', 'MultimediaWidgets', 'OpenGL', 'OpenGLWidgets', 'PrintSupport',
    'Qml', 'QmlModels', 'Quick', 'QuickControls2', 'QuickWidgets', 'QuickTest',
    'Svg', 'SvgWidgets', 'Charts', 'StateMachine', 'WebSockets', 'HttpServer',
    'Positioning', 'Sensors', 'Test'
];
const PATH_BROWSE_FIELDS = {
    outputDirectory: { kind: 'folder', relative: true },
    generatedDirectory: { kind: 'folder', relative: true },
    sourceDirectory: { kind: 'folder', relative: true },
    projectFile: { kind: 'file', relative: true },
    precompiledHeader: { kind: 'file', relative: true },
    workingDirectory: { kind: 'folder', relative: true },
    externalProcessPath: { kind: 'file' },
    platformSysroot: { kind: 'folder' },
    platformSshExecutable: { kind: 'file' },
    platformScpExecutable: { kind: 'file' },
    platformRsyncExecutable: { kind: 'file' },
    platformDockerExecutable: { kind: 'file' },
    platformEmsdkRoot: { kind: 'folder' },
    platformEmsdkEnvironmentScript: { kind: 'file' },
    platformWasmServerExecutable: { kind: 'file' },
    platformWasmHtmlEntry: { kind: 'file', relative: true },
    platformAndroidSdkRoot: { kind: 'folder' },
    platformAndroidNdkRoot: { kind: 'folder' },
    platformAndroidJdkRoot: { kind: 'folder' },
    platformAndroidDeployQtPath: { kind: 'file' },
    platformAndroidAdbPath: { kind: 'file' },
    platformAndroidEmulatorPath: { kind: 'file' },
    platformAndroidAvdManagerPath: { kind: 'file' },
    platformAndroidSdkManagerPath: { kind: 'file' },
    platformAndroidKeystore: { kind: 'file', relative: true },
    debugProgram: { kind: 'file', relative: true },
    debugWorkingDirectory: { kind: 'folder', relative: true },
    debugCoreDumpPath: { kind: 'file' },
    debugSshExecutable: { kind: 'file' },
    debugSymbolSearchPath: { kind: 'folder' },
    packagingIcon: { kind: 'file', relative: true },
    packagingLicenseFile: { kind: 'file', relative: true },
    packagingReadmeFile: { kind: 'file', relative: true },
    packagingOutputDirectory: { kind: 'folder', relative: true },
    packagingWindowsManifestFile: { kind: 'file', relative: true },
    packagingResourceCompilerPath: { kind: 'file' },
    installerOutputDirectory: { kind: 'folder', relative: true },
    installerQtIfwBinaryCreatorPath: { kind: 'file' },
    installerQtIfwRepogenPath: { kind: 'file' },
    installerQtIfwInstallerBasePath: { kind: 'file' },
    installerQtIfwRepositoryOutputDirectory: { kind: 'folder', relative: true },
    installerQtIfwControlScript: { kind: 'file', relative: true },
    installerQtIfwComponentScript: { kind: 'file', relative: true },
    installerInnoIsccPath: { kind: 'file' },
    installerInnoScriptFile: { kind: 'file', relative: true },
    installerNsisMakensisPath: { kind: 'file' },
    installerNsisScriptFile: { kind: 'file', relative: true },
    installerSignToolPath: { kind: 'file' },
    installerCertificateFile: { kind: 'file', relative: true },
    publicationOutputDirectory: { kind: 'folder', relative: true },
    publicationReleaseNotesFile: { kind: 'file', relative: true },
    publicationMsixMakeAppxPath: { kind: 'file' },
    publicationMsixLogo44: { kind: 'file', relative: true },
    publicationMsixLogo150: { kind: 'file', relative: true },
    publicationMsixStoreLogo: { kind: 'file', relative: true },
    publicationWingetPath: { kind: 'file' },
    publicationWingetCreatePath: { kind: 'file' },
    publicationGithubGhPath: { kind: 'file' },
    publicationLocalDirectory: { kind: 'folder' },
    publicationScpPath: { kind: 'file' },
    publicationRsyncPath: { kind: 'file' },
    profilingOutputDirectory: { kind: 'folder', relative: true },
    profilingQmlProfilerPath: { kind: 'file' },
    profilingCppcheckSuppressionsFile: { kind: 'file', relative: true },
    qmlLanguageServerExecutable: { kind: 'file' },
    qmlModuleImportRoot: { kind: 'folder', relative: true },
    pythonInterpreter: { kind: 'file' },
    pythonVirtualEnvironment: { kind: 'folder', relative: true },
    pythonProjectFile: { kind: 'file', relative: true },
    pythonEntryPoint: { kind: 'file', relative: true },
    pythonDeploySpecFile: { kind: 'file', relative: true },
    pythonToolProject: { kind: 'file' },
    pythonToolDesigner: { kind: 'file' },
    pythonToolUic: { kind: 'file' },
    pythonToolRcc: { kind: 'file' },
    pythonToolDeploy: { kind: 'file' },
    pythonToolAndroidDeploy: { kind: 'file' },
    pythonToolLinguist: { kind: 'file' },
    pythonToolLupdate: { kind: 'file' },
    pythonToolLrelease: { kind: 'file' },
    pythonToolQmllint: { kind: 'file' },
    testCtestExecutable: { kind: 'file' },
    testCtestBuildDirectory: { kind: 'folder', relative: true }
};
const FIELD_DATALISTS = {
    clangTidyChecks: [
        '-*,bugprone-*,performance-*,portability-*',
        '-*,bugprone-*,modernize-*,performance-*,readability-*',
        '*'
    ],
    clazyChecks: ['level0', 'level1', 'level2', 'level0,level1', 'manual'],
    qualityHeaderFilter: ['.*', '^(?!.*(?:third_party|external|vendor)).*$', '^${workspaceFolder}/.*'],
    debugQmlServices: [
        'DebugMessages,QmlDebugger,V8Debugger',
        'DebugMessages,QmlDebugger,V8Debugger,QmlProfiler',
        'QmlProfiler'
    ],
    platformDockerImage: ['qt:6.8', 'ubuntu:24.04', 'debian:bookworm'],
    platformWasmServerExecutable: ['qtwasmserver', 'python', 'python3'],
    platformAndroidAbis: ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86', 'arm64-v8a,x86_64'],
    platformAndroidLogcatFilter: ['*:S Qt:D', '*:S Qt:D AndroidRuntime:E', 'Qt:D *:S', '*:V'],
    platformAndroidBuildToolsVersion: ['36.0.0', '35.0.0'],
    packagingCategories: ['Utility', 'Development', 'Education', 'Graphics', 'AudioVideo', 'Network'],
    packagingNamePattern: ['${productName}-${version}-${platform}-${arch}', '${productName}-${version}-${configuration}-${arch}', '${target}-${version}'],
    installerFileNamePattern: ['${productName}-${version}-${arch}-setup', '${productName}-${version}-${platform}-${arch}-installer', '${target}-${version}-setup'],
    installerQtIfwRepositoryUrl: ['https://updates.example.com/repository'],
    installerTimestampUrl: ['http://timestamp.digicert.com', 'http://timestamp.sectigo.com'],
    installerCertificatePasswordEnvironment: ['QPM_SIGN_CERT_PASSWORD'],
    publicationBaseUrl: ['https://downloads.example.com/application', 'https://github.com/owner/repository/releases/download/v${version}'],
    publicationMsixPackageUri: ['https://downloads.example.com/application/Application.msix'],
    publicationMsixAppInstallerUri: ['https://downloads.example.com/application/Application.appinstaller'],
    publicationWingetInstallerUrl: ['https://downloads.example.com/application/Application-1.0.0-setup.exe'],
    publicationGithubRepository: ['owner/repository'],
    publicationGithubTagPattern: ['v${version}', '${channel}-${version}'],
    publicationGithubReleaseNamePattern: ['${productName} ${version}', '${productName} ${version} (${channel})'],
    publicationSshDirectory: ['/var/www/downloads/application', '/srv/releases/application'],
    profilingQmlServices: ['CanvasFrameRate,EngineControl,DebugMessages', 'CanvasFrameRate,EngineControl,DebugMessages,QmlProfiler', 'QmlProfiler'],
    profilingCppcheckChecks: ['warning,style,performance,portability', 'warning,performance,portability', 'all'],
    qmlModuleUri: ['Company.Application', 'Company.Controls', 'Qpm.Application'],
    qmlModuleResourcePrefix: ['/qt/qml', '/qml'],
    pythonVirtualEnvironment: ['.venv', 'venv'],
    pythonPySideVersion: ['6.11.0', '6.10.0', ''],
    pythonProjectFile: ['pyproject.toml'],
    pythonEntryPoint: ['main.py'],
    pythonDeploySpecFile: ['pysidedeploy.spec'],
    dependenciesVcpkgTriplet: ['x64-windows', 'x86-windows', 'arm64-windows', 'x64-linux', 'arm64-linux', 'x64-osx', 'arm64-osx'],
    dependenciesConanProfileHost: ['default'],
    dependenciesConanProfileBuild: ['default']
};
const FIELD_HELP = {
    dependenciesEnabled: 'Enables project-scoped third-party C/C++ dependency management. QPM supports vcpkg manifest mode, Conan 2 and pkg-config.',
    dependenciesAutoInstall: 'Runs the enabled dependency managers before each build. Keep disabled when you prefer explicit, reproducible synchronization.',
    dependenciesOutputDirectory: 'Directory used for generated integration metadata and package-manager build output.',
    dependenciesCmakeFindPackages: 'CMake find_package arguments, one per line. Example: fmt CONFIG REQUIRED.',
    dependenciesCmakeLinkTargets: 'Imported CMake targets linked to the generated QPM target, one per line. Example: fmt::fmt.',
    dependenciesVcpkgEnabled: 'Uses vcpkg manifest mode with vcpkg.json and a project-local installed tree.',
    dependenciesVcpkgRoot: 'Optional vcpkg root. Leave empty to use VCPKG_ROOT or an executable found on PATH.',
    dependenciesVcpkgTriplet: 'Target triplet used by vcpkg, such as x64-windows.',
    dependenciesConanEnabled: 'Uses Conan 2 with conanfile.txt, CMakeDeps and CMakeToolchain.',
    dependenciesPkgConfigEnabled: 'Uses pkg-config/pkgconf to resolve compiler and linker flags for direct, qmake and CMake builds.',
    pythonEnabled: 'Enables the Qt for Python / PySide6 backend for this project. Python project kinds enable it automatically.',
    pythonInterpreter: 'Python interpreter used by QPM. A project-local virtual environment is recommended. Leave empty to let QPM resolve or create one.',
    pythonVirtualEnvironment: 'Project-local virtual environment directory. QPM uses .venv by default.',
    pythonAutoCreateVirtualEnvironment: 'Creates the configured virtual environment automatically when preparing a new Qt for Python project.',
    pythonAutoInstallPySide6: 'Allows QPM to install PySide6 automatically with pip when it is missing. If disabled, QPM asks before installation.',
    pythonPySideVersion: 'Optional exact PySide6 version. Leave empty to install the current version allowed by pip.',
    pythonProjectFile: 'Modern PySide6 project file. pyproject.toml is recommended since PySide6 6.9.',
    pythonEntryPoint: 'Main Python file launched by Run and Debug.',
    pythonUiMode: 'Compiled uses pyside6-uic / pyside6-project to create ui_*.py files. Runtime leaves .ui files for QUiLoader-style workflows.',
    pythonBuildBeforeRun: 'Runs pyside6-project build before launching the entry point.',
    pythonDeployEnabled: 'Enables desktop packaging through pyside6-project deploy / pyside6-deploy.',
    pythonDeploySpecFile: 'Deployment configuration shared by pyside6-deploy and pyside6-android-deploy.',
    pythonAndroidDeployEnabled: 'Enables Qt for Python Android deployment commands.',
    pythonEnvironment: 'Additional Python process environment in NAME=value form, separated by semicolons.',
    variant: 'Chooses whether this page edits the Debug or Release build profile. The selected architecture is configured separately.',
    name: 'Logical project name displayed by QPM. It does not rename the project directory.',
    targetName: 'Base name of the generated executable or library, without a path or platform extension.',
    kind: 'Selects the Qt application or library template and the mandatory Qt modules for the target.',
    cppStandard: 'C++ language standard passed to the selected backend. Qt 6 requires at least C++17.',
    buildArchitecture: 'Selects x86 or x64 for the active Debug or Release variant. It must match the selected Qt kit ABI.',
    outputDirectory: 'Directory containing the final target and build outputs. Relative paths are resolved from the project root.',
    generatedDirectory: 'Directory used for MOC, UIC, RCC and other generated Qt sources.',
    majorVersion: 'Restricts the project to Qt 5 or Qt 6. Auto accepts the version supplied by the selected kit.',
    buildSystem: 'Direct invokes moc/uic/rcc and the compiler itself. qmake and CMake delegate project generation to those tools.',
    parallelJobs: 'Maximum number of concurrent compilation jobs. Zero lets QPM or the backend choose automatically.',
    kitGenerator: 'Build-file generator selected by the active kit, such as Ninja, MinGW Makefiles or NMake Makefiles.',
    autoMoc: 'Automatically runs the Meta-Object Compiler for Q_OBJECT, Q_GADGET and related declarations.',
    autoUic: 'Automatically converts Qt Designer .ui forms into ui_*.h headers.',
    autoRcc: 'Automatically compiles .qrc resource collections into C++ sources.',
    generateProjectFiles: 'Regenerates the isolated qmake or CMake project files managed by QPM.',
    unityBuild: 'Combines source files into fewer translation units to reduce compile time. It can expose symbol-name collisions.',
    useResponseFiles: 'Uses response files when linker command lines become too long, especially on Windows.',
    autoDeploy: 'Runs the active deployment profile after a successful build.',
    deployTranslations: 'Runs lrelease and copies application .qm catalogs during deployment.',
    sourceDirectory: 'Source directory used by qmake or CMake. Relative paths are resolved from the project root.',
    projectFile: 'Optional existing .pro or CMakeLists.txt. Leave empty to let QPM generate isolated backend files.',
    cmakeConfigurePreset: 'Name of a CMake configure preset to use instead of the generated default configuration.',
    cmakeBuildPreset: 'Name of a CMake build preset associated with the configure preset.',
    precompiledHeader: 'Header compiled once and reused by compatible translation units to speed up compilation.',
    configureArguments: 'Additional arguments passed during qmake or CMake configuration, one per line.',
    buildArguments: 'Additional arguments passed to the backend build command, one per line.',
    cleanArguments: 'Additional arguments passed to the backend clean command, one per line.',
    defines: 'Preprocessor definitions applied to every build profile.',
    includeDirectories: 'Additional header search directories. Use one path per line.',
    libraryDirectories: 'Additional linker search directories. Use one path per line.',
    libraries: 'Additional libraries or linker inputs. Use one item per line.',
    variantDefines: 'Preprocessor definitions applied only to the edited Debug or Release profile.',
    compilerFlags: 'Raw compiler options applied only to the edited profile.',
    linkerFlags: 'Raw linker options applied only to the edited profile.',
    runArguments: 'Command-line arguments passed to the application by the active run profile.',
    workingDirectory: 'Current working directory used when running the application.',
    environmentOptions: 'Environment variables written as NAME=value, separated by semicolons or new lines.',
    externalProcessPath: 'Host executable used when debugging a shared library instead of a standalone application.',
    platformName: 'Display name of the active platform profile.',
    platformType: 'Execution target: desktop, local Linux, Remote Linux, Docker, WebAssembly, Android, macOS or iOS.',
    platformAppleDeveloperDirectory: 'Active Xcode developer directory. Leave empty to use xcode-select.',
    platformAppleBundleIdentifier: 'Reverse-DNS bundle identifier used by macOS and iOS.',
    platformAppleDevelopmentTeam: 'Apple Developer Team identifier used by Xcode automatic signing.',
    platformAppleCodeSignIdentity: 'Certificate identity used by codesign and macdeployqt.',
    platformAppleNotaryProfile: 'Keychain profile previously created for xcrun notarytool.',
    platformBuildLocation: 'Where the build command runs: local host, remote host or container.',
    platformKitId: 'Qt kit used by the active platform profile.',
    platformBuildProfileId: 'Build profile selected for platform workflows.',
    platformRunProfileId: 'Run profile selected for platform workflows.',
    platformDeployProfileId: 'Deployment profile selected for platform workflows.',
    platformDebugProfileId: 'Debug profile selected for platform workflows.',
    platformEnvironment: 'Environment variables applied to platform commands.',
    platformSysroot: 'Target filesystem root used by cross-compilers, debuggers and header/library resolution.',
    platformSshHost: 'Hostname or IP address of the Remote Linux target.',
    platformSshUser: 'SSH account used for synchronization, build, run and debug.',
    platformSshPort: 'TCP port of the SSH service.',
    platformSshExecutable: 'Local ssh client executable. Leave ssh to use PATH discovery.',
    platformScpExecutable: 'Local scp executable used as a synchronization fallback.',
    platformRsyncExecutable: 'Local rsync executable used for incremental source synchronization.',
    platformRemoteProjectDirectory: 'Directory containing project sources on the remote target.',
    platformRemoteDeployDirectory: 'Directory receiving deployed binaries and runtime files.',
    platformRemoteBuildCommand: 'Optional remote build command overriding the generated qmake/CMake command.',
    platformRemoteRunCommand: 'Optional remote launch command overriding the active run profile.',
    platformGdbServerPort: 'TCP port used by gdbserver on the remote target.',
    platformDockerExecutable: 'Docker CLI executable. Leave docker to use PATH discovery.',
    platformDockerImage: 'Docker image containing the required Qt SDK and build tools.',
    platformDockerContainerName: 'Optional stable container name used for retained containers.',
    platformDockerWorkspace: 'Mount point of the QPM project inside the container.',
    platformDockerBuildCommand: 'Command executed inside the container to build the project.',
    platformDockerRunCommand: 'Command executed inside the container to run the project.',
    platformDockerArguments: 'Additional docker run arguments, one per line.',
    platformEmsdkRoot: 'Root directory of the Emscripten SDK used by Qt for WebAssembly.',
    platformEmsdkEnvironmentScript: 'emsdk environment script used to prepare emcc/em++ and related variables.',
    platformWasmServerExecutable: 'qtwasmserver, Python or another HTTP server executable.',
    platformWasmServerPort: 'Local HTTP port used to serve the generated WebAssembly application.',
    platformWasmHtmlEntry: 'HTML entry point generated by the WebAssembly build.',
    platformWasmServerArguments: 'Additional HTTP server arguments, one per line.',
    platformUseRsync: 'Prefer rsync over scp when synchronizing Remote Linux sources.',
    platformStartGdbServer: 'Start gdbserver automatically before remote debugging.',
    platformDockerKeepContainer: 'Do not remove the container after the platform command completes.',
    platformDockerForwardDisplay: 'Forwards the host display to Linux GUI applications in Docker.',
    platformDockerHostNetwork: 'Uses the host network stack for the Docker container.',
    platformWasmOpenBrowser: 'Opens the WebAssembly application URL after starting the local server.',
    platformAndroidSdkRoot: 'Root of the Android SDK containing platform-tools, platforms, build-tools and command-line tools.',
    platformAndroidNdkRoot: 'Android NDK used by the selected Qt for Android kit. Leave empty to use the newest side-by-side NDK from the SDK.',
    platformAndroidJdkRoot: 'Java JDK used by Gradle and Android packaging. Qt 6.11 requires a recent JDK.',
    platformAndroidDeployQtPath: 'Optional androiddeployqt override. Normally QPM uses the tool from the selected Qt for Android kit.',
    platformAndroidAdbPath: 'Optional adb override. Normally QPM uses platform-tools/adb from the Android SDK.',
    platformAndroidEmulatorPath: 'Optional Android emulator executable override.',
    platformAndroidAvdManagerPath: 'Optional avdmanager executable override from Android command-line tools.',
    platformAndroidSdkManagerPath: 'Optional sdkmanager executable override from Android command-line tools.',
    platformAndroidAbis: 'Android ABIs to package, separated by commas or new lines. Typical values are arm64-v8a, armeabi-v7a, x86_64 and x86.',
    platformAndroidCompileSdk: 'Android SDK platform used to compile the application.',
    platformAndroidTargetSdk: 'Android API level targeted by the generated application manifest.',
    platformAndroidMinSdk: 'Oldest Android API level allowed to install the application.',
    platformAndroidBuildToolsVersion: 'Android SDK build-tools revision used for packaging.',
    platformAndroidPackageName: 'Java-style application identifier, for example com.company.application.',
    platformAndroidAppName: 'User-visible Android application name.',
    platformAndroidVersionCode: 'Monotonically increasing integer used by Android package updates.',
    platformAndroidVersionName: 'User-visible application version string.',
    platformAndroidPackageFormat: 'APK for installation/testing, AAB for Play distribution, or AAR for an Android library.',
    platformAndroidDeviceSerial: 'ADB serial of the selected device or emulator. Leave empty for automatic selection.',
    platformAndroidAvdName: 'Android Virtual Device name started by the emulator command.',
    platformAndroidLogcatFilter: 'ADB logcat filter expression used by the QPM logcat command.',
    platformAndroidCMakeArguments: 'Additional CMake configure arguments for the Android build.',
    platformAndroidGradleArguments: 'Additional Gradle/package arguments reserved for the Android packaging workflow.',
    platformAndroidKeystore: 'Keystore used to sign a Release APK or AAB.',
    platformAndroidKeystoreAlias: 'Alias of the signing key inside the keystore.',
    platformAndroidStorePasswordEnvironment: 'Environment variable containing the keystore password. The password is never stored in the project manifest.',
    platformAndroidKeyPasswordEnvironment: 'Environment variable containing the key password. The password is never stored in the project manifest.',
    platformAndroidBuildAllAbis: 'Builds all Qt Android ABIs available beside the selected kit.',
    platformAndroidInstallReplace: 'Passes the replace/update option when installing an APK with adb.',
    platformAndroidUninstallBeforeInstall: 'Removes the existing package before installation.',
    platformAndroidOpenLogcatAfterRun: 'Starts a filtered logcat stream after launching the application.',
    qmlLanguageServerEnabled: 'Enables the QPM-managed qmlls client for this project.',
    qmlLanguageServerAutoStart: 'Starts qmlls automatically when the project contains QML files and becomes active.',
    qmlLanguageServerExecutable: 'Optional qmlls executable override. Leave empty to use the executable from the selected Qt kit.',
    qmlLanguageServerBuildDirectories: 'Additional build directories published to qmlls. QPM also adds the active build directory automatically.',
    qmlLanguageServerImportPaths: 'Additional QML import roots, one per line. The Qt qml directory, module root and project QML folders are added automatically.',
    qmlLanguageServerUseEnvironment: 'Lets qmlls read QML_IMPORT_PATH and QML2_IMPORT_PATH in addition to explicit -I paths.',
    qmlLanguageServerNoCmakeCalls: 'Prevents qmlls from invoking CMake itself. QPM supplies build directories directly.',
    qmlLanguageServerCmakeJobs: 'Maximum parallel CMake jobs when qmlls is allowed to invoke CMake. Zero uses its default.',
    qmlLanguageServerMaxFiles: 'Maximum number of files qmlls may search while resolving imports.',
    qmlLanguageServerTrace: 'Controls Language Server Protocol tracing in the dedicated QPM trace output channel.',
    qmlLanguageServerVerbose: 'Keeps detailed qmlls diagnostics in the QPM language-server output channel.',
    qmlLanguageServerConflictPolicy: 'Avoid duplicate prevents QPM from starting qmlls when the official Qt QML extension is installed.',
    qmlLanguageServerGenerateConfig: 'Generates and maintains a project .qmlls.ini before starting qmlls.',
    qmlLanguageServerArguments: 'Additional raw qmlls command-line arguments, one per line.',
    qmlModuleUri: 'Dotted URI used by the QML module, for example Company.Controls.',
    qmlModuleVersion: 'Major.minor version written to generated qmldir metadata.',
    qmlModuleImportRoot: 'Project-relative directory used as the QML module import root.',
    qmlModuleResourcePrefix: 'Resource prefix used by generated QML module metadata, normally /qt/qml.',
    debugName: 'Display name of the active debug profile.',
    debugRequest: 'Launches a program, attaches to a process, connects to GDB Server, opens a dump, or attaches to QML.',
    debuggerType: 'Debugger adapter selected explicitly or inferred from the active kit.',
    debugBuildProfileId: 'Build profile compiled before starting this debug profile.',
    debugRunProfileId: 'Run profile supplying default arguments, environment and working directory.',
    debugProgram: 'Optional executable override. Leave empty to use the project target.',
    debugArguments: 'Arguments passed only when this debug profile starts the application.',
    debugWorkingDirectory: 'Working directory used by the debugger.',
    debugEnvironment: 'Environment variables applied only to this debug profile.',
    debugProcessId: 'PID used by local attach. Leave empty to use the VS Code process picker.',
    debugCoreDumpPath: 'Core dump or Windows dump file opened by the debugger.',
    debugRemoteHost: 'Host running GDB Server.',
    debugRemotePort: 'Port exposed by GDB Server.',
    debugRemoteProgram: 'Path of the executable on the remote target.',
    debugRemoteWorkingDirectory: 'Working directory of the remote process.',
    debugSshHost: 'Optional SSH host used to start gdbserver automatically.',
    debugSshUser: 'SSH user used to start gdbserver.',
    debugSshPort: 'SSH port used by the debug profile.',
    debugSshExecutable: 'Local SSH client executable.',
    debugSourceFileMap: 'Maps remote source prefixes to local directories using remote=local entries.',
    debugSolibPaths: 'Directories searched for target shared libraries and debug symbols.',
    debugSymbolSearchPath: 'Additional symbol search directory, especially for MSVC/CDB.',
    debugSetupCommands: 'Debugger initialization commands executed before the session starts.',
    debugQmlHost: 'Host exposing the QML debugger socket.',
    debugQmlPort: 'TCP port of the QML debugger.',
    debugQmlServices: 'Comma-separated QML debugger services. The default covers messages, QML and JavaScript.',
    debugStopAtEntry: 'Stops at main or the debugger entry point before user code continues.',
    debugExternalConsole: 'Runs the debuggee in an external console when supported.',
    debugStartGdbServerViaSsh: 'Starts gdbserver through SSH before connecting GDB.',
    debugPrettyPrinters: 'Loads Qt pretty-printers or Natvis visualizers for Qt containers and value types.',
    debugBreakOnQtWarnings: 'Adds breakpoints for qFatal and Qt assertion helpers.',
    debugQmlEnabled: 'Starts a native session and attaches the QML/JavaScript debugger.',
    debugQmlBlock: 'Makes the application wait until the QML debugger connects.',
    testFramework: 'Framework used for test discovery and result parsing.',
    testTimeoutMs: 'Maximum duration of one test execution before QPM terminates it.',
    testArguments: 'Additional command-line arguments passed to test executables.',
    testEnvironment: 'Environment variables applied to test runs.',
    testBuildBeforeRun: 'Builds the selected test target before executing tests.',
    testOffscreenPlatform: 'Sets QT_QPA_PLATFORM=offscreen for headless Qt GUI tests.',
    testParallelJobs: 'Maximum number of tests executed in parallel by CTest. Zero lets CTest choose.',
    testStopOnFailure: 'Stops a CTest run after the first failing test.',
    testRepeatMode: 'Repeats tests until failure or after timeout to expose intermittent failures.',
    testRepeatCount: 'Maximum number of repetitions used by the selected repeat mode.',
    testHistoryLimit: 'Maximum test-run summaries kept under .qpm/test-results/history.json. Zero disables history.',
    testCtestExecutable: 'Optional CTest executable. Leave empty to use the active kit or PATH.',
    testCtestBuildDirectory: 'CTest build tree. Leave empty to use the active CMake backend directory.',
    testCtestPreset: 'Optional test preset from CMakePresets.json or CMakeUserPresets.json.',
    testCtestConfiguration: 'Multi-config CMake configuration such as Debug or Release.',
    testCtestLabelRegex: 'Runs CTest tests whose labels match this regular expression.',
    testCtestNameRegex: 'Additional regular expression applied to CTest test names.',
    testCtestExcludeRegex: 'Excludes CTest tests whose names match this regular expression.',
    testCtestOutputOnFailure: 'Displays detailed CTest output only when a test fails.',
    testBoostLogLevel: 'Boost.Test detail level used for the JUnit log stream.',
    testBoostReportLevel: 'Boost.Test summary report detail level.',
    testBoostRandomSeed: 'Randomizes Boost.Test execution with this seed. Zero preserves declared order.',
    testBoostCatchSystemErrors: 'Lets Boost.Test convert system errors into test failures.',
    clangTidyChecks: 'Clang-Tidy check expression, for example bugprone-*,performance-*.',
    clazyChecks: 'Clazy levels or checks used for Qt-specific static analysis.',
    qualityHeaderFilter: 'Regular expression restricting diagnostics emitted from headers.',
    preBuildActions: 'Shell commands executed before the selected build backend.',
    customBuildActions: 'Custom commands executed as part of the build workflow.',
    postBuildActions: 'Shell commands executed after a successful build.',
    packagingEnabled: 'Enables QPM product metadata generation and portable packaging for this project.',
    installerEnabled: 'Enables desktop installer generation independently from portable archive creation.',
    installerBackend: 'Selects Qt Installer Framework, Inno Setup or NSIS as the installer compiler.',
    installerBuildPortablePackage: 'Rebuilds the portable staging directory before compiling the installer.',
    installerOutputDirectory: 'Directory receiving generated desktop installers.',
    installerFileNamePattern: 'Installer base name. Supports ${productName}, ${version}, ${platform}, ${arch}, ${configuration} and ${target}.',
    installerQtIfwMode: 'Offline embeds packages, online downloads them from a repository, and hybrid combines both modes.',
    installerQtIfwRepositoryUrl: 'Remote Qt IFW repository URL referenced by online and hybrid installers.',
    installerQtIfwComponentId: 'Stable reverse-domain component identifier used by Qt Installer Framework.',
    installerCertificatePasswordEnvironment: 'Name of the environment variable containing the PFX password. The password itself is never stored.',
    installerCertificateThumbprint: 'SHA-1 certificate thumbprint used to select a certificate from the Windows certificate store.',
    installerTimestampUrl: 'RFC 3161 timestamp server used by SignTool so signatures remain valid after certificate expiration.',
    installerSignTargetBinary: 'Signs the staged application executable before installer compilation.',
    installerSignInstaller: 'Signs the final installer executable after it is generated.',
    publicationEnabled: 'Enables release bundle creation and publication commands for this project.',
    publicationOutputDirectory: 'Directory receiving release bundles, MSIX packages, App Installer files and publication metadata.',
    publicationChannel: 'Release channel written to release.json and used in the generated bundle name.',
    publicationBaseUrl: 'Public base URL used to derive artifact and update URLs when a more specific URI is empty.',
    publicationReleaseNotesFile: 'Optional Markdown release notes copied into each generated release bundle.',
    publicationMsixEnabled: 'Creates a Windows MSIX package from the portable Qt staging directory.',
    publicationMsixPublisher: 'Publisher subject that must match the certificate used to sign the MSIX package.',
    publicationMsixVersion: 'Four-part numeric MSIX version, for example 1.2.0.0.',
    publicationMsixGenerateAppInstaller: 'Generates an .appinstaller descriptor for installation and update checks.',
    publicationMsixUpdateOnLaunch: 'Checks for an updated MSIX package when the application is launched.',
    publicationWingetEnabled: 'Generates the version, installer and default-locale WinGet manifests.',
    publicationWingetIdentifier: 'Stable WinGet package identifier, normally Publisher.Product.',
    publicationWingetInstallerUrl: 'Public HTTPS URL of the exact installer referenced by the WinGet manifest.',
    publicationGithubRepository: 'GitHub repository in owner/repository form used by gh release create or upload.',
    publicationPublishTarget: 'Selects local directory, SSH/rsync or GitHub release publication.',
    publicationDeleteRemote: 'Allows rsync --delete to remove remote files that no longer exist locally. Use with care.',
    profilingOutputDirectory: 'Directory used for QML traces, CPU profiles, memory reports, Cppcheck XML and system traces.',
    profilingBuildBeforeRun: 'Builds the active target before starting a runtime profiler.',
    profilingTimeoutMs: 'Maximum duration of a profiler process before QPM stops it.',
    profilingArguments: 'Additional application arguments used only for profiling sessions.',
    profilingEnvironment: 'Environment variables applied to all profiling and diagnostic runs.',
    profilingQmlEnabled: 'Enables QML tracing through the Qt QML debugging infrastructure.',
    profilingQmlHost: 'Host where the QML debugging socket is exposed.',
    profilingQmlPort: 'TCP port used by the application and qmlprofiler.',
    profilingQmlServices: 'QML services enabled for profiling. Limiting services reduces measurement disturbance.',
    profilingQmlOutputFile: 'Trace file name. ${target}, ${project} and ${mode} placeholders are supported.',
    profilingQmlProfilerPath: 'Optional qmlprofiler override. Leave empty to use the selected Qt kit.',
    profilingCpuTool: 'Automatic selects perf first and Callgrind as fallback. perf is sampling-based; Callgrind records call graphs and instruction costs.',
    profilingCpuFrequency: 'Sampling frequency passed to perf record.',
    profilingCpuOutputFile: 'Base name for perf or Callgrind output.',
    profilingCallgrindCache: 'Enables Callgrind cache simulation, increasing profiling overhead.',
    profilingCallgrindBranch: 'Enables Callgrind branch-prediction simulation.',
    profilingMemoryTool: 'Automatic selects Heob on Windows when available, otherwise Valgrind Memcheck.',
    profilingLeakCheck: 'Controls the level of Valgrind leak reporting.',
    profilingTrackOrigins: 'Tracks origins of uninitialized values. This improves diagnostics but adds overhead.',
    profilingShowReachable: 'Includes still-reachable allocations in Valgrind reports.',
    profilingMemoryOutputFile: 'Output file for the selected memory analyzer.',
    profilingCppcheckEnabled: 'Enables project-level Cppcheck diagnostics based on compile_commands.json.',
    profilingCppcheckChecks: 'Comma-separated Cppcheck categories such as warning, style, performance and portability.',
    profilingCppcheckInconclusive: 'Includes diagnostics that Cppcheck marks as inconclusive.',
    profilingCppcheckSuppressionsFile: 'Optional Cppcheck suppressions list relative to the project.',
    profilingCppcheckArguments: 'Additional raw arguments passed to Cppcheck, one per line.',
    profilingTraceTool: 'System-call tracing backend. strace is available on Linux and compatible targets.',
    profilingTraceFollowForks: 'Makes strace follow child processes.',
    profilingTraceTimestamps: 'Adds timestamps to system-call trace lines.',
    profilingTraceOutputFile: 'Output file for the system trace.',
    packagingProductName: 'Human-readable product name used by Windows version resources, Linux desktop entries and package names.',
    packagingProductVersion: 'Semantic product version such as 1.2.3. Windows resources use the numeric part as a four-component version.',
    packagingCompanyName: 'Company or publisher displayed in executable metadata and package information.',
    packagingDescription: 'Short product description embedded in platform metadata.',
    packagingCopyright: 'Legal copyright string embedded in Windows version information.',
    packagingIdentifier: 'Reverse-DNS application identifier such as com.company.product.',
    packagingIcon: 'Product icon. Use .ico for Windows executable embedding; PNG or SVG can be used for Linux package metadata.',
    packagingLicenseFile: 'Optional license copied to the portable package root.',
    packagingReadmeFile: 'Optional README copied to the portable package root.',
    packagingOutputDirectory: 'Project-relative directory receiving staged folders and archives.',
    packagingNamePattern: 'Package name template. Supported tokens: ${productName}, ${version}, ${platform}, ${arch}, ${configuration}, ${target}.',
    packagingArchiveFormat: 'Folder keeps only the staged directory. ZIP and tar.gz also create an archive.',
    packagingExtraFiles: 'Additional files or directories copied into the package root, one project-relative path per line.',
    packagingCleanOutput: 'Deletes the previous staging directory before creating a package.',
    packagingBuildBefore: 'Builds the selected configuration before staging the package.',
    packagingQtRuntime: 'Runs the Qt deployment tool and includes Qt libraries and plugins beside the application.',
    packagingTranslations: 'Copies or releases application translation catalogs into the package.',
    packagingDebugSymbols: 'Includes PDB/debug symbol files when they are present.',
    packagingEmbedVersion: 'Generates and embeds Windows VERSIONINFO, application manifest and optional icon for MinGW, qmake and CMake builds.',
    packagingFileDescription: 'Windows FileDescription string.',
    packagingInternalName: 'Windows InternalName string.',
    packagingOriginalFilename: 'Windows OriginalFilename string.',
    packagingExecutionLevel: 'Requested Windows privilege level stored in the application manifest.',
    packagingDpiAwareness: 'Windows DPI-awareness mode stored in the application manifest.',
    packagingWindowsManifestFile: 'Optional custom Windows manifest. Leave empty to use the generated manifest.',
    packagingResourceCompilerPath: 'Optional windres executable override. QPM normally resolves it beside the MinGW compiler.',
    packagingLinuxDesktop: 'Generates a freedesktop .desktop launcher for Linux packages.',
    packagingLinuxAppId: 'Linux application identifier, normally the same reverse-DNS identifier as the product.',
    packagingCategories: 'Freedesktop application categories, one per line.',
    packagingLinuxComment: 'Comment shown by Linux desktop menus.',
    packagingInstallPrefix: 'Intended Linux installation prefix recorded in package metadata.'
};
const SECTION_HELP = {
    control: 'Direct access to the principal commands that are also available from QPM views and context menus.',
    project: 'Identity, target type, language standard, architecture and output directories.',
    kit: 'Qt SDK, compiler, debugger and code-generation tool configuration.',
    modules: 'Qt modules linked to the target. Required dependencies are added automatically.',
    backend: 'Backend-specific qmake, CMake and direct-build configuration.',
    compiler: 'Definitions, include paths, libraries and flags shared by the selected project.',
    run: 'Local application run profile and environment.',
    platforms: 'Desktop, Linux, Remote Linux, Docker, WebAssembly and Android execution settings.',
    debugging: 'Native and QML debugger launch, attach, remote and dump settings.',
    tests: 'Test discovery, execution environment and timeout settings.',
    quality: 'Clang-Tidy, Clazy, sanitizers and coverage-related configuration.',
    python: 'Python interpreter, virtual environment, PySide6 tools, Designer, build and deployment settings.',
    packaging: 'Product identity, executable metadata, runtime staging and portable distribution archives.',
    publication: 'MSIX, App Installer, WinGet manifests, release metadata and publication destinations.',
    steps: 'Commands executed before, during or after the selected build backend.',
    files: 'Summary of files registered in the native Qt project manifest.'
};
class QtProjectSettingsPanel {
    workspaces;
    installations;
    settings;
    builds;
    panel;
    projectRef;
    variant = 'debug';
    constructor(workspaces, installations, settings, builds) {
        this.workspaces = workspaces;
        this.installations = installations;
        this.settings = settings;
        this.builds = builds;
    }
    show(projectRef) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            vscode.window.showErrorMessage('Open a native .qtproject.json project to edit Qt settings.');
            return;
        }
        this.projectRef = ref;
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('qpm.qtProjectSettings', 'Qt Project Settings', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.projectRef = undefined;
            });
            this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
        }
        this.panel.title = `Qt Project Settings — ${ref.name}`;
        this.panel.webview.html = this.render(ref);
        this.panel.reveal(vscode.ViewColumn.Active);
    }
    update() {
        if (this.panel && this.projectRef?.exists) {
            this.panel.webview.html = this.render(this.projectRef);
        }
    }
    async showSafeMode(projectRef) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            vscode.window.showErrorMessage('Open a native .qtproject.json project to edit Qt settings.');
            return;
        }
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const selected = await vscode.window.showQuickPick([
            { id: 'full', label: '$(globe) Open full Qt settings page', description: 'Edit Qt kit, modules, generators, flags, paths and run options.' },
            { id: 'kit', label: '$(versions) Select Qt kit', description: (0, qtProjectManifest_1.getQtInstallationPreference)(manifest) || 'Use the active Qt kit' },
            { id: 'designer', label: '$(layout) Select Qt Widgets Designer', description: this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest))?.designerPath || 'Auto-detect designer.exe or Qt Creator' },
            { id: 'modules', label: '$(library) Edit Qt modules', description: manifest.qt.modules.join(', ') },
            { id: 'target', label: '$(output) Edit target name', description: manifest.targetName },
            { id: 'manifest', label: '$(json) Open raw manifest', description: path.basename(ref.absolutePath) }
        ], { title: `Qt Project Settings (Safe Mode) — ${manifest.name}` });
        if (!selected)
            return;
        if (selected.id === 'full') {
            this.show(ref);
            return;
        }
        if (selected.id === 'kit') {
            const installation = await this.installations.select();
            if (installation) {
                (0, qtProjectManifest_1.setQtInstallationPreference)(manifest, installation.root);
                (0, qtProjectManifest_1.writeQtProjectManifest)(ref.absolutePath, manifest);
                this.workspaces.refresh();
                await vscode.commands.executeCommand('qpm.syncCppTools');
            }
            return;
        }
        if (selected.id === 'designer') {
            await this.installations.selectDesignerExecutable((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
            this.update();
            return;
        }
        if (selected.id === 'modules') {
            const modules = await vscode.window.showQuickPick(QT_MODULES.map((module) => ({
                label: module,
                picked: manifest.qt.modules.some((entry) => entry.toLowerCase() === module.toLowerCase())
            })), { title: 'Select Qt modules', canPickMany: true });
            if (modules?.length) {
                manifest.qt.modules = modules.map((entry) => entry.label);
                if (!manifest.qt.modules.some((entry) => entry.toLowerCase() === 'core'))
                    manifest.qt.modules.unshift('Core');
                (0, qtProjectManifest_1.writeQtProjectManifest)(ref.absolutePath, manifest);
                this.workspaces.refresh();
            }
            return;
        }
        if (selected.id === 'target') {
            const value = await vscode.window.showInputBox({ title: 'Qt target name', value: manifest.targetName, validateInput: validateTargetName });
            if (value) {
                manifest.targetName = value;
                (0, qtProjectManifest_1.writeQtProjectManifest)(ref.absolutePath, manifest);
                this.workspaces.refresh();
            }
            return;
        }
        await this.openManifest(ref.absolutePath);
    }
    dispose() {
        this.panel?.dispose();
    }
    async handleMessage(message) {
        const ref = this.projectRef;
        if (!ref?.exists)
            return;
        if (message?.type === 'changeVariant') {
            this.variant = message.variant === 'release' ? 'release' : 'debug';
            this.update();
            return;
        }
        if (message?.type === 'selectQtKit') {
            const installation = await this.installations.select();
            if (installation) {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
                (0, qtProjectManifest_1.setQtInstallationPreference)(manifest, installation.root);
                (0, qtProjectManifest_1.writeQtProjectManifest)(ref.absolutePath, manifest);
                this.workspaces.refresh();
                await vscode.commands.executeCommand('qpm.syncCppTools');
                this.update();
            }
            return;
        }
        if (message?.type === 'repairQtToolchain') {
            await vscode.commands.executeCommand('qpm.repairQtToolchain');
            this.update();
            return;
        }
        if (message?.type === 'selectQtDesigner') {
            const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
            await this.installations.selectDesignerExecutable((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
            this.update();
            return;
        }
        if (message?.type === 'manageProfiles') {
            await vscode.commands.executeCommand('qpm.manageQtProfiles');
            this.update();
            return;
        }
        if (message?.type === 'generateLaunchJson') {
            await vscode.commands.executeCommand('qpm.generateQtLaunchJson');
            return;
        }
        if (message?.type === 'manageDebugProfiles') {
            await vscode.commands.executeCommand('qpm.manageQtDebugProfiles');
            this.update();
            return;
        }
        if (message?.type === 'managePlatformProfiles') {
            await vscode.commands.executeCommand('qpm.manageQtPlatforms');
            this.update();
            return;
        }
        if (message?.type === 'manageNamedKits') {
            await vscode.commands.executeCommand('qpm.manageQtKits');
            this.update();
            return;
        }
        if (message?.type === 'openManifest') {
            await this.openManifest(ref.absolutePath);
            return;
        }
        if (message?.type === 'reload') {
            this.update();
            return;
        }
        if (message?.type === 'browsePath' && typeof message.id === 'string') {
            await this.browsePath(ref, message.id, message.kind === 'file' ? 'file' : 'folder', message.relative === true, String(message.currentValue ?? ''));
            return;
        }
        if (message?.type === 'runCommand' && typeof message.command === 'string') {
            await vscode.commands.executeCommand(message.command);
            this.update();
            return;
        }
        if (message?.type === 'save') {
            try {
                await this.savePayload(ref, message);
                this.workspaces.refresh();
                await vscode.commands.executeCommand('qpm.syncCppTools');
                vscode.window.showInformationMessage(`Qt project settings saved for ${ref.name} (${this.variant}).`);
                this.update();
            }
            catch (error) {
                vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            }
        }
    }
    async savePayload(ref, payload) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const name = String(payload.name ?? '').trim();
        const nameError = validateProjectName(name);
        if (nameError)
            throw new Error(nameError);
        const targetName = String(payload.targetName ?? '').trim();
        const targetError = validateTargetName(targetName);
        if (targetError)
            throw new Error(targetError);
        manifest.name = name;
        manifest.targetName = targetName;
        manifest.kind = normalizeKind(payload.kind, manifest.kind);
        manifest.qt.majorVersion = payload.majorVersion === '5' ? 5 : payload.majorVersion === '6' ? 6 : 'auto';
        manifest.qt.modules = normalizeList(payload.modules);
        for (const requiredModule of requiredModulesForKind(manifest.kind)) {
            if (!manifest.qt.modules.some((entry) => entry.toLowerCase() === requiredModule.toLowerCase()))
                manifest.qt.modules.push(requiredModule);
        }
        manifest.includeDirectories = normalizeList(payload.includeDirectories);
        manifest.libraryDirectories = normalizeList(payload.libraryDirectories);
        manifest.libraries = normalizeList(payload.libraries);
        manifest.defines = normalizeList(payload.defines);
        manifest.testing.framework = normalizeTestFramework(payload.testFramework);
        if (manifest.testing.framework === 'auto' && manifest.kind === 'test-application')
            manifest.testing.framework = 'qttest';
        if (manifest.testing.framework === 'auto' && manifest.kind === 'quick-test-application')
            manifest.testing.framework = 'qtquicktest';
        manifest.testing.buildBeforeRun = payload.testBuildBeforeRun === true;
        manifest.testing.timeoutMs = normalizePositiveInteger(payload.testTimeoutMs, 120000);
        manifest.testing.arguments = normalizeList(payload.testArguments);
        manifest.testing.environment = parseEnvironmentProfile(String(payload.testEnvironment ?? ''));
        manifest.testing.useOffscreenPlatform = payload.testOffscreenPlatform === true;
        manifest.testing.parallelJobs = normalizeNonNegativeInteger(payload.testParallelJobs, 0);
        manifest.testing.stopOnFailure = payload.testStopOnFailure === true;
        manifest.testing.repeatMode = normalizeTestRepeatMode(payload.testRepeatMode);
        manifest.testing.repeatCount = Math.max(1, normalizeNonNegativeInteger(payload.testRepeatCount, 1));
        manifest.testing.historyLimit = normalizeNonNegativeInteger(payload.testHistoryLimit, 100);
        manifest.testing.ctest.executable = String(payload.testCtestExecutable ?? '').trim();
        manifest.testing.ctest.buildDirectory = String(payload.testCtestBuildDirectory ?? '').trim();
        manifest.testing.ctest.preset = String(payload.testCtestPreset ?? '').trim();
        manifest.testing.ctest.configuration = String(payload.testCtestConfiguration ?? '').trim();
        manifest.testing.ctest.labelRegex = String(payload.testCtestLabelRegex ?? '').trim();
        manifest.testing.ctest.nameRegex = String(payload.testCtestNameRegex ?? '').trim();
        manifest.testing.ctest.excludeRegex = String(payload.testCtestExcludeRegex ?? '').trim();
        manifest.testing.ctest.outputOnFailure = payload.testCtestOutputOnFailure === true;
        manifest.testing.boost.logLevel = String(payload.testBoostLogLevel ?? 'test_suite').trim() || 'test_suite';
        manifest.testing.boost.reportLevel = String(payload.testBoostReportLevel ?? 'short').trim() || 'short';
        manifest.testing.boost.randomSeed = normalizeNonNegativeInteger(payload.testBoostRandomSeed, 0);
        manifest.testing.boost.catchSystemErrors = payload.testBoostCatchSystemErrors === true;
        manifest.quality.clangTidyChecks = String(payload.clangTidyChecks ?? '').trim() || '-*,bugprone-*,performance-*,portability-*';
        manifest.quality.clazyChecks = String(payload.clazyChecks ?? '').trim() || 'level1';
        manifest.quality.headerFilter = String(payload.qualityHeaderFilter ?? '').trim() || '.*';
        manifest.profiling.outputDirectory = String(payload.profilingOutputDirectory ?? '.qpm/profiling').trim() || '.qpm/profiling';
        manifest.profiling.buildBeforeRun = payload.profilingBuildBeforeRun === true;
        manifest.profiling.timeoutMs = normalizePositiveInteger(payload.profilingTimeoutMs, 300000);
        manifest.profiling.arguments = normalizeList(payload.profilingArguments);
        manifest.profiling.environment = parseEnvironmentProfile(String(payload.profilingEnvironment ?? ''));
        manifest.profiling.qml.enabled = payload.profilingQmlEnabled === true;
        manifest.profiling.qml.host = String(payload.profilingQmlHost ?? '127.0.0.1').trim() || '127.0.0.1';
        manifest.profiling.qml.port = normalizePort(payload.profilingQmlPort, 3769);
        manifest.profiling.qml.services = String(payload.profilingQmlServices ?? '').trim() || 'CanvasFrameRate,EngineControl,DebugMessages';
        manifest.profiling.qml.outputFile = String(payload.profilingQmlOutputFile ?? '${target}-qml.qtd').trim() || '${target}-qml.qtd';
        manifest.profiling.qml.profilerPath = String(payload.profilingQmlProfilerPath ?? '').trim();
        manifest.profiling.cpu.tool = normalizeCpuProfilerTool(payload.profilingCpuTool);
        manifest.profiling.cpu.samplingFrequency = Math.max(1, normalizeNonNegativeInteger(payload.profilingCpuFrequency, 99));
        manifest.profiling.cpu.callgrindCacheSimulation = payload.profilingCallgrindCache === true;
        manifest.profiling.cpu.callgrindBranchSimulation = payload.profilingCallgrindBranch === true;
        manifest.profiling.cpu.outputFile = String(payload.profilingCpuOutputFile ?? '${target}-cpu').trim() || '${target}-cpu';
        manifest.profiling.memory.tool = normalizeMemoryProfilerTool(payload.profilingMemoryTool);
        manifest.profiling.memory.leakCheck = payload.profilingLeakCheck === 'summary' ? 'summary' : 'full';
        manifest.profiling.memory.trackOrigins = payload.profilingTrackOrigins === true;
        manifest.profiling.memory.showReachable = payload.profilingShowReachable === true;
        manifest.profiling.memory.outputFile = String(payload.profilingMemoryOutputFile ?? '${target}-memcheck.xml').trim() || '${target}-memcheck.xml';
        manifest.profiling.cppcheck.enabled = payload.profilingCppcheckEnabled === true;
        manifest.profiling.cppcheck.checks = String(payload.profilingCppcheckChecks ?? '').trim() || 'warning,style,performance,portability';
        manifest.profiling.cppcheck.inconclusive = payload.profilingCppcheckInconclusive === true;
        manifest.profiling.cppcheck.suppressionsFile = String(payload.profilingCppcheckSuppressionsFile ?? '').trim();
        manifest.profiling.cppcheck.additionalArguments = normalizeList(payload.profilingCppcheckArguments);
        manifest.profiling.tracing.tool = normalizeTraceTool(payload.profilingTraceTool);
        manifest.profiling.tracing.followForks = payload.profilingTraceFollowForks === true;
        manifest.profiling.tracing.timestamps = payload.profilingTraceTimestamps === true;
        manifest.profiling.tracing.outputFile = String(payload.profilingTraceOutputFile ?? '${target}-trace.log').trim() || '${target}-trace.log';
        manifest.dependencies.enabled = payload.dependenciesEnabled === true;
        manifest.dependencies.autoInstallBeforeBuild = payload.dependenciesAutoInstall === true;
        manifest.dependencies.outputDirectory = String(payload.dependenciesOutputDirectory ?? '.qpm/dependencies').trim() || '.qpm/dependencies';
        manifest.dependencies.cmakeFindPackages = normalizeList(payload.dependenciesCmakeFindPackages);
        manifest.dependencies.cmakeLinkTargets = normalizeList(payload.dependenciesCmakeLinkTargets);
        manifest.dependencies.additionalIncludeDirectories = normalizeList(payload.dependenciesIncludeDirectories);
        manifest.dependencies.additionalLibraryDirectories = normalizeList(payload.dependenciesLibraryDirectories);
        manifest.dependencies.additionalLibraries = normalizeList(payload.dependenciesLibraries);
        manifest.dependencies.vcpkg.enabled = payload.dependenciesVcpkgEnabled === true;
        manifest.dependencies.vcpkg.executable = String(payload.dependenciesVcpkgExecutable ?? '').trim();
        manifest.dependencies.vcpkg.root = String(payload.dependenciesVcpkgRoot ?? '').trim();
        manifest.dependencies.vcpkg.manifestFile = String(payload.dependenciesVcpkgManifestFile ?? 'vcpkg.json').trim() || 'vcpkg.json';
        manifest.dependencies.vcpkg.installRoot = String(payload.dependenciesVcpkgInstallRoot ?? '.qpm/dependencies/vcpkg_installed').trim() || '.qpm/dependencies/vcpkg_installed';
        manifest.dependencies.vcpkg.triplet = String(payload.dependenciesVcpkgTriplet ?? '').trim();
        manifest.dependencies.vcpkg.hostTriplet = String(payload.dependenciesVcpkgHostTriplet ?? '').trim();
        manifest.dependencies.vcpkg.baseline = String(payload.dependenciesVcpkgBaseline ?? '').trim();
        manifest.dependencies.vcpkg.dependencies = normalizeList(payload.dependenciesVcpkgPackages);
        manifest.dependencies.vcpkg.overlayPorts = normalizeList(payload.dependenciesVcpkgOverlayPorts);
        manifest.dependencies.vcpkg.overlayTriplets = normalizeList(payload.dependenciesVcpkgOverlayTriplets);
        manifest.dependencies.vcpkg.additionalArguments = normalizeList(payload.dependenciesVcpkgArguments);
        manifest.dependencies.conan.enabled = payload.dependenciesConanEnabled === true;
        manifest.dependencies.conan.executable = String(payload.dependenciesConanExecutable ?? '').trim();
        manifest.dependencies.conan.manifestFile = String(payload.dependenciesConanManifestFile ?? 'conanfile.txt').trim() || 'conanfile.txt';
        manifest.dependencies.conan.outputDirectory = String(payload.dependenciesConanOutputDirectory ?? '.qpm/dependencies/conan').trim() || '.qpm/dependencies/conan';
        manifest.dependencies.conan.requires = normalizeList(payload.dependenciesConanRequires);
        manifest.dependencies.conan.toolRequires = normalizeList(payload.dependenciesConanToolRequires);
        manifest.dependencies.conan.options = normalizeList(payload.dependenciesConanOptions);
        manifest.dependencies.conan.profileHost = String(payload.dependenciesConanProfileHost ?? 'default').trim() || 'default';
        manifest.dependencies.conan.profileBuild = String(payload.dependenciesConanProfileBuild ?? 'default').trim() || 'default';
        manifest.dependencies.conan.buildMissing = payload.dependenciesConanBuildMissing === true;
        manifest.dependencies.conan.lockfile = String(payload.dependenciesConanLockfile ?? '').trim();
        manifest.dependencies.conan.additionalArguments = normalizeList(payload.dependenciesConanArguments);
        manifest.dependencies.pkgConfig.enabled = payload.dependenciesPkgConfigEnabled === true;
        manifest.dependencies.pkgConfig.executable = String(payload.dependenciesPkgConfigExecutable ?? '').trim();
        manifest.dependencies.pkgConfig.packages = normalizeList(payload.dependenciesPkgConfigPackages);
        manifest.dependencies.pkgConfig.searchPaths = normalizeList(payload.dependenciesPkgConfigSearchPaths);
        manifest.dependencies.pkgConfig.staticLink = payload.dependenciesPkgConfigStatic === true;
        manifest.dependencies.pkgConfig.additionalArguments = normalizeList(payload.dependenciesPkgConfigArguments);
        manifest.python.enabled = payload.pythonEnabled === true || manifest.kind === 'python-widgets-application' || manifest.kind === 'python-quick-application';
        manifest.python.binding = 'pyside6';
        manifest.python.interpreter = String(payload.pythonInterpreter ?? '').trim();
        manifest.python.virtualEnvironment = String(payload.pythonVirtualEnvironment ?? '.venv').trim() || '.venv';
        manifest.python.autoCreateVirtualEnvironment = payload.pythonAutoCreateVirtualEnvironment === true;
        manifest.python.autoInstallPySide6 = payload.pythonAutoInstallPySide6 === true;
        manifest.python.pySideVersion = String(payload.pythonPySideVersion ?? '').trim();
        manifest.python.projectFile = String(payload.pythonProjectFile ?? 'pyproject.toml').trim() || 'pyproject.toml';
        manifest.python.entryPoint = String(payload.pythonEntryPoint ?? 'main.py').trim() || 'main.py';
        manifest.python.uiMode = payload.pythonUiMode === 'runtime' ? 'runtime' : 'compiled';
        manifest.python.buildBeforeRun = payload.pythonBuildBeforeRun === true;
        manifest.python.deployEnabled = payload.pythonDeployEnabled === true;
        manifest.python.deploySpecFile = String(payload.pythonDeploySpecFile ?? 'pysidedeploy.spec').trim() || 'pysidedeploy.spec';
        manifest.python.androidDeployEnabled = payload.pythonAndroidDeployEnabled === true;
        manifest.python.toolOverrides.project = String(payload.pythonToolProject ?? '').trim();
        manifest.python.toolOverrides.designer = String(payload.pythonToolDesigner ?? '').trim();
        manifest.python.toolOverrides.uic = String(payload.pythonToolUic ?? '').trim();
        manifest.python.toolOverrides.rcc = String(payload.pythonToolRcc ?? '').trim();
        manifest.python.toolOverrides.deploy = String(payload.pythonToolDeploy ?? '').trim();
        manifest.python.toolOverrides.androidDeploy = String(payload.pythonToolAndroidDeploy ?? '').trim();
        manifest.python.toolOverrides.linguist = String(payload.pythonToolLinguist ?? '').trim();
        manifest.python.toolOverrides.lupdate = String(payload.pythonToolLupdate ?? '').trim();
        manifest.python.toolOverrides.lrelease = String(payload.pythonToolLrelease ?? '').trim();
        manifest.python.toolOverrides.qmllint = String(payload.pythonToolQmllint ?? '').trim();
        manifest.python.additionalProjectArguments = normalizeList(payload.pythonProjectArguments);
        manifest.python.additionalDeployArguments = normalizeList(payload.pythonDeployArguments);
        manifest.python.environment = parseEnvironmentProfile(String(payload.pythonEnvironment ?? ''));
        manifest.qml.languageServer.enabled = payload.qmlLanguageServerEnabled === true;
        manifest.qml.languageServer.autoStart = payload.qmlLanguageServerAutoStart === true;
        manifest.qml.languageServer.executable = String(payload.qmlLanguageServerExecutable ?? '').trim();
        manifest.qml.languageServer.buildDirectories = normalizeList(payload.qmlLanguageServerBuildDirectories);
        manifest.qml.languageServer.importPaths = normalizeList(payload.qmlLanguageServerImportPaths);
        manifest.qml.languageServer.useQmlImportPathEnvironment = payload.qmlLanguageServerUseEnvironment === true;
        manifest.qml.languageServer.noCmakeCalls = payload.qmlLanguageServerNoCmakeCalls === true;
        manifest.qml.languageServer.cmakeJobs = Math.min(256, normalizeNonNegativeInteger(payload.qmlLanguageServerCmakeJobs, 0));
        manifest.qml.languageServer.maxFilesToSearch = Math.min(1_000_000, normalizeNonNegativeInteger(payload.qmlLanguageServerMaxFiles, 20000));
        manifest.qml.languageServer.trace = normalizeQmlLanguageTrace(payload.qmlLanguageServerTrace);
        manifest.qml.languageServer.verboseOutput = payload.qmlLanguageServerVerbose === true;
        manifest.qml.languageServer.conflictPolicy = payload.qmlLanguageServerConflictPolicy === 'allow-parallel' ? 'allow-parallel' : 'avoid-duplicate';
        manifest.qml.languageServer.generateConfigurationFile = payload.qmlLanguageServerGenerateConfig === true;
        manifest.qml.languageServer.additionalArguments = normalizeList(payload.qmlLanguageServerArguments);
        manifest.qml.module.uri = String(payload.qmlModuleUri ?? manifest.qml.module.uri).trim() || manifest.qml.module.uri;
        manifest.qml.module.version = String(payload.qmlModuleVersion ?? manifest.qml.module.version).trim() || manifest.qml.module.version;
        manifest.qml.module.importRoot = String(payload.qmlModuleImportRoot ?? manifest.qml.module.importRoot).trim() || manifest.qml.module.importRoot;
        manifest.qml.module.resourcePrefix = String(payload.qmlModuleResourcePrefix ?? manifest.qml.module.resourcePrefix).trim() || manifest.qml.module.resourcePrefix;
        manifest.packaging.enabled = payload.packagingEnabled === true;
        manifest.packaging.productName = String(payload.packagingProductName ?? manifest.name).trim() || manifest.name;
        manifest.packaging.productVersion = normalizePackagingVersion(payload.packagingProductVersion);
        manifest.packaging.companyName = String(payload.packagingCompanyName ?? '').trim();
        manifest.packaging.description = String(payload.packagingDescription ?? '').trim() || `${manifest.packaging.productName} Qt application`;
        manifest.packaging.copyright = String(payload.packagingCopyright ?? '').trim();
        manifest.packaging.identifier = String(payload.packagingIdentifier ?? '').trim() || `com.example.${manifest.name.toLowerCase()}`;
        manifest.packaging.icon = String(payload.packagingIcon ?? '').trim();
        manifest.packaging.licenseFile = String(payload.packagingLicenseFile ?? '').trim();
        manifest.packaging.readmeFile = String(payload.packagingReadmeFile ?? '').trim();
        manifest.packaging.outputDirectory = String(payload.packagingOutputDirectory ?? 'dist').trim() || 'dist';
        manifest.packaging.packageNamePattern = String(payload.packagingNamePattern ?? '').trim() || '${productName}-${version}-${platform}-${arch}';
        manifest.packaging.archiveFormat = normalizePackagingArchive(payload.packagingArchiveFormat);
        manifest.packaging.extraFiles = normalizeList(payload.packagingExtraFiles);
        manifest.packaging.cleanOutput = payload.packagingCleanOutput === true;
        manifest.packaging.buildBeforePackaging = payload.packagingBuildBefore === true;
        manifest.packaging.includeQtRuntime = payload.packagingQtRuntime === true;
        manifest.packaging.includeTranslations = payload.packagingTranslations === true;
        manifest.packaging.includeDebugSymbols = payload.packagingDebugSymbols === true;
        manifest.packaging.windows.embedVersionResource = payload.packagingEmbedVersion === true;
        manifest.packaging.windows.fileDescription = String(payload.packagingFileDescription ?? '').trim() || manifest.packaging.description;
        manifest.packaging.windows.internalName = String(payload.packagingInternalName ?? '').trim() || manifest.targetName;
        manifest.packaging.windows.originalFilename = String(payload.packagingOriginalFilename ?? '').trim() || `${manifest.targetName}.exe`;
        manifest.packaging.windows.executionLevel = normalizePackagingExecutionLevel(payload.packagingExecutionLevel);
        manifest.packaging.windows.dpiAwareness = normalizePackagingDpi(payload.packagingDpiAwareness);
        manifest.packaging.windows.manifestFile = String(payload.packagingWindowsManifestFile ?? '').trim();
        manifest.packaging.windows.resourceCompilerPath = String(payload.packagingResourceCompilerPath ?? '').trim();
        manifest.packaging.linux.generateDesktopEntry = payload.packagingLinuxDesktop === true;
        manifest.packaging.linux.appId = String(payload.packagingLinuxAppId ?? '').trim() || manifest.packaging.identifier;
        manifest.packaging.linux.categories = normalizeList(payload.packagingCategories);
        manifest.packaging.linux.comment = String(payload.packagingLinuxComment ?? '').trim() || manifest.packaging.description;
        manifest.packaging.linux.installPrefix = String(payload.packagingInstallPrefix ?? '').trim() || '/usr/local';
        const installer = manifest.packaging.installer;
        installer.enabled = payload.installerEnabled === true;
        installer.backend = normalizeInstallerBackend(payload.installerBackend);
        installer.buildPortablePackage = payload.installerBuildPortablePackage === true;
        installer.outputDirectory = String(payload.installerOutputDirectory ?? 'dist/installers').trim() || 'dist/installers';
        installer.fileNamePattern = String(payload.installerFileNamePattern ?? '').trim() || '${productName}-${version}-${arch}-setup';
        installer.installDirectoryName = String(payload.installerInstallDirectoryName ?? manifest.packaging.productName).trim() || manifest.packaging.productName;
        installer.createDesktopShortcut = payload.installerDesktopShortcut === true;
        installer.createStartMenuShortcut = payload.installerStartMenuShortcut === true;
        installer.runAfterInstall = payload.installerRunAfterInstall === true;
        installer.qtIfw.mode = normalizeQtIfwMode(payload.installerQtIfwMode);
        installer.qtIfw.binaryCreatorPath = String(payload.installerQtIfwBinaryCreatorPath ?? '').trim();
        installer.qtIfw.repogenPath = String(payload.installerQtIfwRepogenPath ?? '').trim();
        installer.qtIfw.installerBasePath = String(payload.installerQtIfwInstallerBasePath ?? '').trim();
        installer.qtIfw.componentId = String(payload.installerQtIfwComponentId ?? manifest.packaging.identifier).trim() || manifest.packaging.identifier;
        installer.qtIfw.componentDisplayName = String(payload.installerQtIfwComponentDisplayName ?? manifest.packaging.productName).trim() || manifest.packaging.productName;
        installer.qtIfw.componentDescription = String(payload.installerQtIfwComponentDescription ?? manifest.packaging.description).trim() || manifest.packaging.description;
        installer.qtIfw.releaseDate = String(payload.installerQtIfwReleaseDate ?? '').trim();
        installer.qtIfw.repositoryUrl = String(payload.installerQtIfwRepositoryUrl ?? '').trim();
        installer.qtIfw.repositoryOutputDirectory = String(payload.installerQtIfwRepositoryOutputDirectory ?? 'dist/repository').trim() || 'dist/repository';
        installer.qtIfw.maintenanceToolName = String(payload.installerQtIfwMaintenanceToolName ?? 'maintenancetool').trim() || 'maintenancetool';
        installer.qtIfw.wizardStyle = normalizeQtIfwWizardStyle(payload.installerQtIfwWizardStyle);
        installer.qtIfw.controlScript = String(payload.installerQtIfwControlScript ?? '').trim();
        installer.qtIfw.componentScript = String(payload.installerQtIfwComponentScript ?? '').trim();
        installer.qtIfw.archiveFormat = normalizeQtIfwArchiveFormat(payload.installerQtIfwArchiveFormat);
        installer.qtIfw.compression = Math.max(0, Math.min(9, Number(payload.installerQtIfwCompression) || 7));
        installer.qtIfw.additionalArguments = normalizeList(payload.installerQtIfwArguments);
        installer.inno.isccPath = String(payload.installerInnoIsccPath ?? '').trim();
        installer.inno.scriptFile = String(payload.installerInnoScriptFile ?? '').trim();
        installer.inno.languages = normalizeList(payload.installerInnoLanguages);
        installer.inno.privilegesRequired = normalizeInnoPrivileges(payload.installerInnoPrivileges);
        installer.inno.architecture = normalizeInnoArchitecture(payload.installerInnoArchitecture);
        installer.inno.compression = String(payload.installerInnoCompression ?? 'lzma2').trim() || 'lzma2';
        installer.inno.solidCompression = payload.installerInnoSolidCompression === true;
        installer.inno.additionalDirectives = normalizeList(payload.installerInnoDirectives);
        installer.nsis.makensisPath = String(payload.installerNsisMakensisPath ?? '').trim();
        installer.nsis.scriptFile = String(payload.installerNsisScriptFile ?? '').trim();
        installer.nsis.requestExecutionLevel = normalizeNsisExecutionLevel(payload.installerNsisExecutionLevel);
        installer.nsis.compressor = normalizeNsisCompressor(payload.installerNsisCompressor);
        installer.nsis.additionalDefines = normalizeList(payload.installerNsisDefines);
        installer.signing.enabled = payload.installerSigningEnabled === true;
        installer.signing.signToolPath = String(payload.installerSignToolPath ?? '').trim();
        installer.signing.certificateFile = String(payload.installerCertificateFile ?? '').trim();
        installer.signing.certificateThumbprint = String(payload.installerCertificateThumbprint ?? '').trim();
        installer.signing.certificateSubject = String(payload.installerCertificateSubject ?? '').trim();
        installer.signing.certificatePasswordEnvironment = String(payload.installerCertificatePasswordEnvironment ?? 'QPM_SIGN_CERT_PASSWORD').trim() || 'QPM_SIGN_CERT_PASSWORD';
        installer.signing.timestampUrl = String(payload.installerTimestampUrl ?? '').trim();
        installer.signing.fileDigest = normalizeSigningDigest(payload.installerFileDigest);
        installer.signing.timestampDigest = normalizeSigningDigest(payload.installerTimestampDigest);
        installer.signing.signTargetBinary = payload.installerSignTargetBinary === true;
        installer.signing.signInstaller = payload.installerSignInstaller === true;
        installer.signing.verifyAfterSigning = payload.installerVerifyAfterSigning === true;
        installer.signing.additionalArguments = normalizeList(payload.installerSigningArguments);
        const publication = manifest.publication;
        publication.enabled = payload.publicationEnabled === true;
        publication.outputDirectory = String(payload.publicationOutputDirectory ?? 'dist/publication').trim() || 'dist/publication';
        publication.channel = normalizePublicationChannel(payload.publicationChannel);
        publication.baseUrl = String(payload.publicationBaseUrl ?? '').trim().replace(/\/+$/, '');
        publication.releaseNotesFile = String(payload.publicationReleaseNotesFile ?? '').trim();
        publication.includePortablePackage = payload.publicationIncludePortablePackage === true;
        publication.includeInstaller = payload.publicationIncludeInstaller === true;
        publication.includeQtIfwRepository = payload.publicationIncludeQtIfwRepository === true;
        publication.generateChecksums = payload.publicationGenerateChecksums === true;
        publication.generateLatestManifest = payload.publicationGenerateLatestManifest === true;
        publication.msix.enabled = payload.publicationMsixEnabled === true;
        publication.msix.makeAppxPath = String(payload.publicationMsixMakeAppxPath ?? '').trim();
        publication.msix.packageIdentityName = String(payload.publicationMsixIdentity ?? '').trim();
        publication.msix.publisher = String(payload.publicationMsixPublisher ?? 'CN=QPM Development').trim() || 'CN=QPM Development';
        publication.msix.publisherDisplayName = String(payload.publicationMsixPublisherDisplayName ?? '').trim();
        publication.msix.displayName = String(payload.publicationMsixDisplayName ?? manifest.packaging.productName).trim() || manifest.packaging.productName;
        publication.msix.description = String(payload.publicationMsixDescription ?? manifest.packaging.description).trim() || manifest.packaging.description;
        publication.msix.version = normalizeFourPartUiVersion(payload.publicationMsixVersion, manifest.packaging.productVersion);
        publication.msix.architecture = normalizeMsixArchitecture(payload.publicationMsixArchitecture);
        publication.msix.minimumOsVersion = normalizeFourPartUiVersion(payload.publicationMsixMinimumOsVersion, '10.0.19041.0');
        publication.msix.targetOsVersion = normalizeFourPartUiVersion(payload.publicationMsixTargetOsVersion, '10.0.26100.0');
        publication.msix.logo44 = String(payload.publicationMsixLogo44 ?? '').trim();
        publication.msix.logo150 = String(payload.publicationMsixLogo150 ?? '').trim();
        publication.msix.storeLogo = String(payload.publicationMsixStoreLogo ?? '').trim();
        publication.msix.signPackage = payload.publicationMsixSignPackage === true;
        publication.msix.generateAppInstaller = payload.publicationMsixGenerateAppInstaller === true;
        publication.msix.packageUri = String(payload.publicationMsixPackageUri ?? '').trim();
        publication.msix.appInstallerUri = String(payload.publicationMsixAppInstallerUri ?? '').trim();
        publication.msix.updateOnLaunch = payload.publicationMsixUpdateOnLaunch === true;
        publication.msix.hoursBetweenUpdateChecks = Math.max(0, Math.min(255, Number(payload.publicationMsixHoursBetweenChecks) || 0));
        publication.msix.showPrompt = payload.publicationMsixShowPrompt === true;
        publication.msix.updateBlocksActivation = payload.publicationMsixUpdateBlocksActivation === true;
        publication.msix.forceUpdateFromAnyVersion = payload.publicationMsixForceUpdateFromAnyVersion === true;
        publication.msix.automaticBackgroundTask = payload.publicationMsixAutomaticBackgroundTask === true;
        publication.winget.enabled = payload.publicationWingetEnabled === true;
        publication.winget.wingetPath = String(payload.publicationWingetPath ?? '').trim();
        publication.winget.wingetCreatePath = String(payload.publicationWingetCreatePath ?? '').trim();
        publication.winget.packageIdentifier = String(payload.publicationWingetIdentifier ?? '').trim();
        publication.winget.publisher = String(payload.publicationWingetPublisher ?? '').trim();
        publication.winget.packageName = String(payload.publicationWingetPackageName ?? manifest.packaging.productName).trim() || manifest.packaging.productName;
        publication.winget.shortDescription = String(payload.publicationWingetDescription ?? manifest.packaging.description).trim() || manifest.packaging.description;
        publication.winget.license = String(payload.publicationWingetLicense ?? 'Proprietary').trim() || 'Proprietary';
        publication.winget.licenseUrl = String(payload.publicationWingetLicenseUrl ?? '').trim();
        publication.winget.publisherUrl = String(payload.publicationWingetPublisherUrl ?? '').trim();
        publication.winget.packageUrl = String(payload.publicationWingetPackageUrl ?? '').trim();
        publication.winget.installerUrl = String(payload.publicationWingetInstallerUrl ?? '').trim();
        publication.winget.installerType = normalizeWingetInstallerType(payload.publicationWingetInstallerType);
        publication.winget.scope = payload.publicationWingetScope === 'user' ? 'user' : 'machine';
        publication.winget.locale = String(payload.publicationWingetLocale ?? 'en-US').trim() || 'en-US';
        publication.winget.tags = normalizeList(payload.publicationWingetTags);
        publication.winget.releaseNotesUrl = String(payload.publicationWingetReleaseNotesUrl ?? '').trim();
        publication.winget.minimumOsVersion = normalizeFourPartUiVersion(payload.publicationWingetMinimumOsVersion, '10.0.0.0');
        publication.github.enabled = payload.publicationGithubEnabled === true;
        publication.github.ghPath = String(payload.publicationGithubGhPath ?? '').trim();
        publication.github.repository = String(payload.publicationGithubRepository ?? '').trim();
        publication.github.tagPattern = String(payload.publicationGithubTagPattern ?? 'v${version}').trim() || 'v${version}';
        publication.github.releaseNamePattern = String(payload.publicationGithubReleaseNamePattern ?? '${productName} ${version}').trim() || '${productName} ${version}';
        publication.github.draft = payload.publicationGithubDraft === true;
        publication.github.prerelease = payload.publicationGithubPrerelease === true;
        publication.github.generateNotes = payload.publicationGithubGenerateNotes === true;
        publication.github.clobberAssets = payload.publicationGithubClobberAssets === true;
        publication.publish.target = normalizePublicationTarget(payload.publicationPublishTarget);
        publication.publish.localDirectory = String(payload.publicationLocalDirectory ?? '').trim();
        publication.publish.sshHost = String(payload.publicationSshHost ?? '').trim();
        publication.publish.sshUser = String(payload.publicationSshUser ?? '').trim();
        publication.publish.sshPort = normalizePort(payload.publicationSshPort, 22);
        publication.publish.sshDirectory = String(payload.publicationSshDirectory ?? '').trim();
        publication.publish.scpPath = String(payload.publicationScpPath ?? '').trim();
        publication.publish.rsyncPath = String(payload.publicationRsyncPath ?? '').trim();
        publication.publish.useRsync = payload.publicationUseRsync === true;
        publication.publish.deleteRemote = payload.publicationDeleteRemote === true;
        const requestedArchitecture = payload.buildArchitecture === 'x86' ? 'x86' : 'x64';
        const representativeMode = this.variant === 'release'
            ? (requestedArchitecture === 'x64' ? 'release64' : 'release')
            : (requestedArchitecture === 'x64' ? 'debug64' : 'debug');
        const buildProfile = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, representativeMode);
        buildProfile.system = normalizeBuildSystem(payload.buildSystem);
        buildProfile.cppStandard = normalizeCppStandard(payload.cppStandard);
        buildProfile.outputDirectory = String(payload.outputDirectory ?? 'build').trim() || 'build';
        buildProfile.generatedDirectory = String(payload.generatedDirectory ?? 'generated').trim() || 'generated';
        buildProfile.autoMoc = payload.autoMoc === true;
        buildProfile.autoUic = payload.autoUic === true;
        buildProfile.autoRcc = payload.autoRcc === true;
        buildProfile.parallelJobs = normalizeNonNegativeInteger(payload.parallelJobs, 0);
        buildProfile.configureArguments = normalizeList(payload.configureArguments);
        buildProfile.buildArguments = normalizeList(payload.buildArguments);
        buildProfile.cleanArguments = normalizeList(payload.cleanArguments);
        buildProfile.sourceDirectory = String(payload.sourceDirectory ?? '.').trim() || '.';
        buildProfile.projectFile = String(payload.projectFile ?? '').trim();
        buildProfile.cmakeConfigurePreset = String(payload.cmakeConfigurePreset ?? '').trim();
        buildProfile.cmakeBuildPreset = String(payload.cmakeBuildPreset ?? '').trim();
        buildProfile.generateProjectFiles = payload.generateProjectFiles === true;
        buildProfile.precompiledHeader = String(payload.precompiledHeader ?? '').trim();
        buildProfile.unityBuild = payload.unityBuild === true;
        buildProfile.useResponseFiles = payload.useResponseFiles === true;
        buildProfile.defines = normalizeList(payload.variantDefines);
        buildProfile.compilerFlags = normalizeList(payload.compilerFlags);
        buildProfile.linkerFlags = normalizeList(payload.linkerFlags);
        const runProfile = (0, qtProjectManifest_1.getActiveQtRunProfile)(manifest);
        const debugProfile = (0, qtProjectManifest_1.getActiveQtDebugProfile)(manifest);
        runProfile.buildProfileId = buildProfile.id;
        runProfile.arguments = String(payload.runArguments ?? '');
        runProfile.workingDirectory = String(payload.workingDirectory ?? '');
        runProfile.environment = parseEnvironmentProfile(String(payload.environmentOptions ?? ''));
        const deployProfile = (0, qtProjectManifest_1.getActiveQtDeployProfile)(manifest);
        deployProfile.enabled = payload.autoDeploy === true;
        deployProfile.translations = payload.deployTranslations === true;
        const platformProfile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
        platformProfile.name = String(payload.platformName ?? platformProfile.name).trim() || platformProfile.name;
        platformProfile.type = normalizePlatformType(payload.platformType);
        platformProfile.buildLocation = normalizePlatformBuildLocation(payload.platformBuildLocation, platformProfile.type);
        platformProfile.kitId = String(payload.platformKitId ?? kitProfileIdForBuild(manifest, buildProfile.id)).trim() || platformProfile.kitId;
        platformProfile.buildProfileId = String(payload.platformBuildProfileId ?? buildProfile.id).trim() || buildProfile.id;
        platformProfile.runProfileId = String(payload.platformRunProfileId ?? runProfile.id).trim() || runProfile.id;
        platformProfile.deployProfileId = String(payload.platformDeployProfileId ?? deployProfile.id).trim() || deployProfile.id;
        platformProfile.debugProfileId = String(payload.platformDebugProfileId ?? debugProfile.id).trim() || debugProfile.id;
        platformProfile.environment = parseEnvironmentProfile(String(payload.platformEnvironment ?? ''));
        platformProfile.sysroot = String(payload.platformSysroot ?? '').trim();
        platformProfile.sshHost = String(payload.platformSshHost ?? '').trim();
        platformProfile.sshUser = String(payload.platformSshUser ?? '').trim();
        platformProfile.sshPort = normalizePort(payload.platformSshPort, 22);
        platformProfile.sshExecutable = String(payload.platformSshExecutable ?? 'ssh').trim() || 'ssh';
        platformProfile.scpExecutable = String(payload.platformScpExecutable ?? 'scp').trim() || 'scp';
        platformProfile.rsyncExecutable = String(payload.platformRsyncExecutable ?? 'rsync').trim() || 'rsync';
        platformProfile.remoteProjectDirectory = String(payload.platformRemoteProjectDirectory ?? '~/qpm-project').trim() || '~/qpm-project';
        platformProfile.remoteDeployDirectory = String(payload.platformRemoteDeployDirectory ?? '~/qpm-deploy').trim() || '~/qpm-deploy';
        platformProfile.remoteBuildCommand = String(payload.platformRemoteBuildCommand ?? '').trim();
        platformProfile.remoteRunCommand = String(payload.platformRemoteRunCommand ?? '').trim();
        platformProfile.useRsync = payload.platformUseRsync === true;
        platformProfile.startGdbServer = payload.platformStartGdbServer === true;
        platformProfile.gdbServerPort = normalizePort(payload.platformGdbServerPort, 2345);
        platformProfile.dockerExecutable = String(payload.platformDockerExecutable ?? 'docker').trim() || 'docker';
        platformProfile.dockerImage = String(payload.platformDockerImage ?? '').trim();
        platformProfile.dockerContainerName = String(payload.platformDockerContainerName ?? '').trim();
        platformProfile.dockerWorkspace = String(payload.platformDockerWorkspace ?? '/workspace').trim() || '/workspace';
        platformProfile.dockerBuildCommand = String(payload.platformDockerBuildCommand ?? '').trim();
        platformProfile.dockerRunCommand = String(payload.platformDockerRunCommand ?? '').trim();
        platformProfile.dockerArguments = normalizeList(payload.platformDockerArguments);
        platformProfile.dockerKeepContainer = payload.platformDockerKeepContainer === true;
        platformProfile.dockerForwardDisplay = payload.platformDockerForwardDisplay === true;
        platformProfile.dockerHostNetwork = payload.platformDockerHostNetwork === true;
        platformProfile.emsdkRoot = String(payload.platformEmsdkRoot ?? '').trim();
        platformProfile.emsdkEnvironmentScript = String(payload.platformEmsdkEnvironmentScript ?? '').trim();
        platformProfile.wasmServerExecutable = String(payload.platformWasmServerExecutable ?? '').trim();
        platformProfile.wasmServerPort = normalizePort(payload.platformWasmServerPort, 8000);
        platformProfile.wasmHtmlEntry = String(payload.platformWasmHtmlEntry ?? '').trim();
        platformProfile.wasmOpenBrowser = payload.platformWasmOpenBrowser === true;
        platformProfile.wasmServerArguments = normalizeList(payload.platformWasmServerArguments);
        platformProfile.androidSdkRoot = String(payload.platformAndroidSdkRoot ?? '').trim();
        platformProfile.androidNdkRoot = String(payload.platformAndroidNdkRoot ?? '').trim();
        platformProfile.androidJdkRoot = String(payload.platformAndroidJdkRoot ?? '').trim();
        platformProfile.androidDeployQtPath = String(payload.platformAndroidDeployQtPath ?? '').trim();
        platformProfile.androidAdbPath = String(payload.platformAndroidAdbPath ?? '').trim();
        platformProfile.androidEmulatorPath = String(payload.platformAndroidEmulatorPath ?? '').trim();
        platformProfile.androidAvdManagerPath = String(payload.platformAndroidAvdManagerPath ?? '').trim();
        platformProfile.androidSdkManagerPath = String(payload.platformAndroidSdkManagerPath ?? '').trim();
        platformProfile.androidAbis = normalizeList(payload.platformAndroidAbis).flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean);
        if (!platformProfile.androidAbis.length)
            platformProfile.androidAbis = ['arm64-v8a'];
        platformProfile.androidBuildAllAbis = payload.platformAndroidBuildAllAbis === true;
        platformProfile.androidCompileSdk = normalizeAndroidApi(payload.platformAndroidCompileSdk, 36);
        platformProfile.androidTargetSdk = normalizeAndroidApi(payload.platformAndroidTargetSdk, 36);
        platformProfile.androidMinSdk = normalizeAndroidApi(payload.platformAndroidMinSdk, 28);
        platformProfile.androidBuildToolsVersion = String(payload.platformAndroidBuildToolsVersion ?? '36.0.0').trim() || '36.0.0';
        platformProfile.androidPackageName = String(payload.platformAndroidPackageName ?? '').trim();
        platformProfile.androidAppName = String(payload.platformAndroidAppName ?? '').trim();
        platformProfile.androidVersionCode = Math.max(1, Math.floor(Number(payload.platformAndroidVersionCode) || 1));
        platformProfile.androidVersionName = String(payload.platformAndroidVersionName ?? '1.0.0').trim() || '1.0.0';
        platformProfile.androidPackageFormat = normalizeAndroidPackageFormat(payload.platformAndroidPackageFormat);
        platformProfile.androidDeviceSerial = String(payload.platformAndroidDeviceSerial ?? '').trim();
        platformProfile.androidAvdName = String(payload.platformAndroidAvdName ?? '').trim();
        platformProfile.androidLogcatFilter = String(payload.platformAndroidLogcatFilter ?? '*:S Qt:D').trim() || '*:S Qt:D';
        platformProfile.androidInstallReplace = payload.platformAndroidInstallReplace === true;
        platformProfile.androidUninstallBeforeInstall = payload.platformAndroidUninstallBeforeInstall === true;
        platformProfile.androidOpenLogcatAfterRun = payload.platformAndroidOpenLogcatAfterRun === true;
        platformProfile.androidGradleArguments = normalizeList(payload.platformAndroidGradleArguments);
        platformProfile.androidCMakeArguments = normalizeList(payload.platformAndroidCMakeArguments);
        platformProfile.androidKeystore = String(payload.platformAndroidKeystore ?? '').trim();
        platformProfile.androidKeystoreAlias = String(payload.platformAndroidKeystoreAlias ?? '').trim();
        platformProfile.androidStorePasswordEnvironment = String(payload.platformAndroidStorePasswordEnvironment ?? 'QPM_ANDROID_STORE_PASSWORD').trim() || 'QPM_ANDROID_STORE_PASSWORD';
        platformProfile.androidKeyPasswordEnvironment = String(payload.platformAndroidKeyPasswordEnvironment ?? 'QPM_ANDROID_KEY_PASSWORD').trim() || 'QPM_ANDROID_KEY_PASSWORD';
        platformProfile.appleDeveloperDirectory = String(payload.platformAppleDeveloperDirectory ?? '').trim();
        platformProfile.appleXcodebuildPath = String(payload.platformAppleXcodebuildPath ?? '').trim();
        platformProfile.appleXcrunPath = String(payload.platformAppleXcrunPath ?? '').trim();
        platformProfile.appleMacDeployQtPath = String(payload.platformAppleMacDeployQtPath ?? '').trim();
        platformProfile.appleBundleIdentifier = String(payload.platformAppleBundleIdentifier ?? '').trim();
        platformProfile.appleDeploymentTarget = String(payload.platformAppleDeploymentTarget ?? '').trim();
        platformProfile.appleArchitectures = normalizeList(payload.platformAppleArchitectures).flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean);
        if (!platformProfile.appleArchitectures.length)
            platformProfile.appleArchitectures = ['arm64'];
        platformProfile.appleDevelopmentTeam = String(payload.platformAppleDevelopmentTeam ?? '').trim();
        platformProfile.appleCodeSignIdentity = String(payload.platformAppleCodeSignIdentity ?? '').trim();
        platformProfile.appleProvisioningProfile = String(payload.platformAppleProvisioningProfile ?? '').trim();
        platformProfile.appleEntitlementsFile = String(payload.platformAppleEntitlementsFile ?? '').trim();
        platformProfile.appleAutomaticSigning = payload.platformAppleAutomaticSigning === true;
        platformProfile.appleAllowProvisioningUpdates = payload.platformAppleAllowProvisioningUpdates === true;
        platformProfile.appleScheme = String(payload.platformAppleScheme ?? '').trim();
        platformProfile.appleConfiguration = payload.platformAppleConfiguration === 'Release' ? 'Release' : 'Debug';
        platformProfile.appleSimulatorId = String(payload.platformAppleSimulatorId ?? '').trim();
        platformProfile.appleDeviceId = String(payload.platformAppleDeviceId ?? '').trim();
        platformProfile.appleCreateDmg = payload.platformAppleCreateDmg === true;
        platformProfile.appleDmgFileSystem = payload.platformAppleDmgFileSystem === 'APFS' ? 'APFS' : 'HFS+';
        platformProfile.appleNotaryProfile = String(payload.platformAppleNotaryProfile ?? '').trim();
        platformProfile.appleStapleAfterNotarization = payload.platformAppleStapleAfterNotarization === true;
        platformProfile.appleAppStoreCompliant = payload.platformAppleAppStoreCompliant === true;
        platformProfile.appleHardenedRuntime = payload.platformAppleHardenedRuntime === true;
        platformProfile.appleTimestamp = payload.platformAppleTimestamp === true;
        platformProfile.appleAdditionalCMakeArguments = normalizeList(payload.platformAppleAdditionalCMakeArguments);
        platformProfile.appleAdditionalXcodebuildArguments = normalizeList(payload.platformAppleAdditionalXcodebuildArguments);
        platformProfile.appleAdditionalMacDeployQtArguments = normalizeList(payload.platformAppleAdditionalMacDeployQtArguments);
        debugProfile.name = String(payload.debugName ?? debugProfile.name).trim() || debugProfile.name;
        debugProfile.request = normalizeDebugRequest(payload.debugRequest);
        debugProfile.debuggerType = normalizeDebuggerType(payload.debuggerType);
        debugProfile.buildProfileId = String(payload.debugBuildProfileId ?? buildProfile.id).trim() || buildProfile.id;
        debugProfile.runProfileId = String(payload.debugRunProfileId ?? runProfile.id).trim() || runProfile.id;
        debugProfile.program = String(payload.debugProgram ?? '').trim();
        debugProfile.arguments = String(payload.debugArguments ?? '');
        debugProfile.workingDirectory = String(payload.debugWorkingDirectory ?? '').trim();
        debugProfile.environment = parseEnvironmentProfile(String(payload.debugEnvironment ?? ''));
        debugProfile.stopAtEntry = payload.debugStopAtEntry === true;
        debugProfile.externalConsole = payload.debugExternalConsole === true;
        debugProfile.processId = String(payload.debugProcessId ?? '').trim();
        debugProfile.coreDumpPath = String(payload.debugCoreDumpPath ?? '').trim();
        debugProfile.remoteHost = String(payload.debugRemoteHost ?? '127.0.0.1').trim() || '127.0.0.1';
        debugProfile.remotePort = normalizePort(payload.debugRemotePort, 2345);
        debugProfile.remoteProgram = String(payload.debugRemoteProgram ?? '').trim();
        debugProfile.remoteWorkingDirectory = String(payload.debugRemoteWorkingDirectory ?? '').trim();
        debugProfile.sshHost = String(payload.debugSshHost ?? '').trim();
        debugProfile.sshUser = String(payload.debugSshUser ?? '').trim();
        debugProfile.sshPort = normalizePort(payload.debugSshPort, 22);
        debugProfile.sshExecutable = String(payload.debugSshExecutable ?? 'ssh').trim() || 'ssh';
        debugProfile.startGdbServerViaSsh = payload.debugStartGdbServerViaSsh === true;
        debugProfile.sourceFileMap = parseMappingProfile(String(payload.debugSourceFileMap ?? ''));
        debugProfile.additionalSolibSearchPath = normalizeList(payload.debugSolibPaths);
        debugProfile.symbolSearchPath = String(payload.debugSymbolSearchPath ?? '').trim();
        debugProfile.setupCommands = normalizeList(payload.debugSetupCommands);
        debugProfile.enableQtPrettyPrinters = payload.debugPrettyPrinters === true;
        debugProfile.breakOnQtWarnings = payload.debugBreakOnQtWarnings === true;
        debugProfile.qmlDebug = payload.debugQmlEnabled === true;
        debugProfile.qmlHost = String(payload.debugQmlHost ?? '127.0.0.1').trim() || '127.0.0.1';
        debugProfile.qmlPort = normalizePort(payload.debugQmlPort, 3768);
        debugProfile.qmlBlock = payload.debugQmlBlock === true;
        debugProfile.qmlServices = String(payload.debugQmlServices ?? '').trim() || 'DebugMessages,QmlDebugger,V8Debugger';
        (0, qtProjectManifest_1.synchronizeLegacyProfileMirrors)(manifest);
        (0, qtProjectManifest_1.writeQtProjectManifest)(ref.absolutePath, manifest);
        const projectSettings = this.settings.getSettings(ref, representativeMode);
        projectSettings.run.arguments = runProfile.arguments;
        projectSettings.run.workingDirectory = runProfile.workingDirectory;
        projectSettings.run.environmentOptions = String(payload.environmentOptions ?? '');
        projectSettings.run.externalProcessPath = String(payload.externalProcessPath ?? '');
        projectSettings.preBuildActions = normalizeList(payload.preBuildActions);
        projectSettings.customBuildActions = normalizeList(payload.customBuildActions);
        projectSettings.postBuildActions = normalizeList(payload.postBuildActions);
        for (const mode of this.variant === 'release' ? ['release', 'release64'] : ['debug', 'debug64']) {
            this.settings.setSettings(ref, cloneProjectSettings(projectSettings), mode);
        }
        await this.builds.setBuildMode(representativeMode);
    }
    async openManifest(manifestPath) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(manifestPath));
        await vscode.window.showTextDocument(document, { preview: false });
    }
    async browsePath(ref, targetId, kind, relative, currentValue) {
        const projectRoot = path.dirname(ref.absolutePath);
        const currentPath = currentValue.trim()
            ? (path.isAbsolute(currentValue.trim()) ? currentValue.trim() : path.resolve(projectRoot, currentValue.trim()))
            : projectRoot;
        const defaultPath = fs.existsSync(currentPath)
            ? currentPath
            : fs.existsSync(path.dirname(currentPath))
                ? path.dirname(currentPath)
                : projectRoot;
        const selected = await vscode.window.showOpenDialog({
            title: kind === 'file' ? 'Select a file' : 'Select a directory',
            defaultUri: vscode.Uri.file(defaultPath),
            canSelectFiles: kind === 'file',
            canSelectFolders: kind === 'folder',
            canSelectMany: false,
            openLabel: 'Select'
        });
        const selectedPath = selected?.[0]?.fsPath;
        if (!selectedPath || !this.panel)
            return;
        let value = selectedPath;
        if (relative) {
            const candidate = path.relative(projectRoot, selectedPath);
            if (candidate && candidate !== '..' && !candidate.startsWith(`..${path.sep}`) && !path.isAbsolute(candidate)) {
                value = candidate.split(path.sep).join('/');
            }
        }
        await this.panel.webview.postMessage({ type: 'pathSelected', id: targetId, value });
    }
    render(ref) {
        const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
        const configuredMode = this.builds.buildMode;
        const configuredX64 = configuredMode === 'debug64' || configuredMode === 'release64';
        const mode = this.variant === 'release'
            ? (configuredX64 ? 'release64' : 'release')
            : (configuredX64 ? 'debug64' : 'debug');
        const projectSettings = this.settings.getSettings(ref, mode);
        const buildProfile = (0, qtProjectManifest_1.getActiveQtBuildProfile)(manifest, mode);
        const buildVariant = buildProfile;
        const kitProfile = (0, qtProjectManifest_1.getQtKitProfileForBuild)(manifest, mode);
        const runProfile = (0, qtProjectManifest_1.getActiveQtRunProfile)(manifest);
        const debugProfile = (0, qtProjectManifest_1.getActiveQtDebugProfile)(manifest);
        const deployProfile = (0, qtProjectManifest_1.getActiveQtDeployProfile)(manifest);
        const platformProfile = (0, qtProjectManifest_1.getActiveQtPlatformProfile)(manifest);
        const runArguments = runProfile.arguments || projectSettings.run.arguments;
        const runWorkingDirectory = runProfile.workingDirectory || projectSettings.run.workingDirectory || path.dirname(ref.absolutePath);
        const runEnvironmentOptions = Object.keys(runProfile.environment).length
            ? Object.entries(runProfile.environment).map(([key, value]) => `${key}=${value}`).join(';')
            : projectSettings.run.environmentOptions;
        const installation = this.installations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, mode));
        const projectRoot = path.dirname(ref.absolutePath);
        const moduleHtml = QT_MODULES.map((module) => {
            const checked = manifest.qt.modules.some((entry) => entry.toLowerCase() === module.toLowerCase());
            const installed = !installation || fs.existsSync(path.join(installation.includeDir, `Qt${module}`));
            return `<label class="module ${installed ? '' : 'missing'}"><input type="checkbox" name="qtModule" value="${escapeHtml(module)}" ${checked ? 'checked' : ''}> <span>${escapeHtml(module)}</span>${installed ? '' : '<small>not detected</small>'}</label>`;
        }).join('');
        const counts = manifest.files;
        const kitCompatibility = kitProfile.compatibility ?? installation?.toolchain.compatibility ?? 'unknown';
        const toolchainState = !installation && !kitProfile.qtInstallation
            ? 'error'
            : kitCompatibility === 'incompatible'
                ? 'error'
                : kitCompatibility === 'unknown'
                    ? 'warning'
                    : '';
        const compilerPath = kitProfile.compilerPath || installation?.toolchain.cppCompilerPath || 'not resolved';
        const compilerTarget = kitProfile.compilerTargetTriple || installation?.toolchain.targetTriple || '';
        const compilerDetails = `${compilerPath}${compilerTarget ? ` (${compilerTarget})` : ''}`;
        const compilerSource = kitProfile.compilerPath ? 'named project kit' : installation?.toolchain.source || 'not resolved';
        const toolchainDiagnosticText = kitProfile.diagnostic || installation?.toolchain.diagnostic || '';
        const toolchainDiagnostic = toolchainDiagnosticText ? `<br>${escapeHtml(toolchainDiagnosticText)}` : '';
        const debuggerDetails = `${kitProfile.debuggerType || 'auto'}${kitProfile.debuggerPath ? ` — ${kitProfile.debuggerPath}` : ''}`;
        const qmakeDetails = kitProfile.qmakePath || installation?.qmakePath || 'not resolved';
        const cmakeDetails = kitProfile.cmakePath || installation?.cmakePath || 'not resolved';
        const buildToolDetails = kitProfile.buildToolPath || installation?.ninjaPath || installation?.jomPath || installation?.nmakePath || 'auto';
        const generatorDetails = kitProfile.generator || (installation?.ninjaPath ? 'Ninja' : installation?.compilerFamily === 'msvc' ? 'NMake Makefiles' : 'Auto');
        const designerDetails = installation?.designerPath
            ? `${installation.designerPath} (${installation.designerLauncherKind ?? 'designer'}, ${installation.designerSource ?? 'unknown source'})`
            : 'not resolved — select designer.exe or Qt Creator';
        const linguistDetails = installation
            ? `Linguist ${installation.linguistPath ? 'ready' : 'missing'} · lupdate ${installation.lupdatePath ? 'ready' : 'missing'} · lrelease ${installation.lreleasePath ? 'ready' : 'missing'}`
            : 'Qt Linguist tools not resolved';
        const qmlToolDetails = installation
            ? `qmllint ${installation.qmlLintPath ? 'ready' : 'missing'} · qmlformat ${installation.qmlFormatPath ? 'ready' : 'missing'} · qmlls ${installation.qmlLanguageServerPath ? 'ready' : 'missing'} · preview ${installation.qmlRuntimePath || installation.qmlScenePath ? 'ready' : 'missing'}`
            : 'QML tools not resolved';
        const nonce = makeNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Qt Project Settings</title>
<style>
:root{color-scheme:light dark;--qpm-sticky-offset:150px}*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:22px;max-width:1380px;margin:auto}h1{margin:0 0 4px;font-size:26px}h2{font-size:16px;margin:0}.subtitle,.muted{color:var(--vscode-descriptionForeground)}.settings-sticky-header{position:sticky;top:0;z-index:4;background:var(--vscode-editor-background);isolation:isolate;margin-bottom:12px}.toolbar{position:static;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);margin:0}.toolbar .actions,.actions{display:flex;gap:8px;flex-wrap:wrap}.settings-nav{position:static;display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,320px) auto;gap:10px;align-items:center;padding:10px 0 14px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border)}.dirty{font-size:12px;color:var(--vscode-descriptionForeground);white-space:nowrap}.dirty.changed{color:var(--vscode-editorWarning-foreground);font-weight:600}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{border:1px solid var(--vscode-panel-border);border-radius:7px;background:var(--vscode-sideBar-background);padding:16px;min-width:0;scroll-margin-top:var(--qpm-sticky-offset)}.wide{grid-column:1/-1}.card h2{margin-bottom:13px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:5px}.field.wide{grid-column:1/-1}.field-label{display:inline-flex;align-items:center;gap:6px;font-weight:600}.input-row{display:flex;gap:6px;align-items:stretch}.input-row input{min-width:0;flex:1}.browse{min-width:34px;padding:6px 9px}.help{position:relative;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid var(--vscode-textLink-foreground);border-radius:50%;font-size:11px;line-height:1;color:var(--vscode-textLink-foreground);cursor:help;font-weight:700;outline:none}.help:hover::after,.help:focus::after{content:attr(data-help);position:absolute;z-index:20;left:50%;top:calc(100% + 8px);transform:translateX(-20%);width:min(360px,70vw);padding:9px 11px;border:1px solid var(--vscode-widget-border,var(--vscode-panel-border));border-radius:5px;background:var(--vscode-editorHoverWidget-background);color:var(--vscode-editorHoverWidget-foreground);box-shadow:0 4px 16px var(--vscode-widget-shadow);font-size:12px;font-weight:400;line-height:1.4;white-space:normal;pointer-events:none}.section-hidden{display:none!important}.conditional-group{display:contents}.conditional-group.hidden{display:none}.control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.control-group{border:1px solid var(--vscode-panel-border);border-radius:5px;padding:11px;background:var(--vscode-editorWidget-background)}.control-group h3{font-size:13px;margin:0 0 9px}.control-group .actions{gap:6px}.control-group button{font-size:12px;padding:6px 9px}label{font-weight:600}input,select,textarea{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:7px 8px;font:inherit;border-radius:2px}input:focus,select:focus,textarea:focus,button:focus,.help:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}textarea{min-height:92px;resize:vertical;font-family:var(--vscode-editor-font-family);font-size:12px}.checkbox{display:flex;align-items:center;gap:8px;font-weight:400}.checkbox input,.module input{width:auto}.kit{font-family:var(--vscode-editor-font-family);font-size:12px;padding:10px;background:var(--vscode-textCodeBlock-background);border-radius:4px;overflow-wrap:anywhere;border-left:4px solid var(--vscode-testing-iconPassed)}.kit.warning{border-left-color:var(--vscode-editorWarning-foreground)}.kit.error{border-left-color:var(--vscode-errorForeground)}.modules{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px}.module{display:flex;align-items:center;gap:6px;font-weight:400;border:1px solid var(--vscode-panel-border);padding:7px;border-radius:4px}.module small{margin-left:auto;color:var(--vscode-errorForeground);font-size:10px}.module.missing{opacity:.72}.checks{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px}.stats{display:flex;gap:8px;flex-wrap:wrap}.pill{border:1px solid var(--vscode-panel-border);border-radius:999px;padding:4px 9px;font-size:12px;color:var(--vscode-descriptionForeground)}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:7px 11px;border-radius:3px;cursor:pointer;font:inherit}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:hover{background:var(--vscode-button-hoverBackground)}code{font-family:var(--vscode-editor-font-family)}@media(max-width:800px){.grid,.fields{grid-template-columns:1fr}.wide{grid-column:auto}.settings-sticky-header{position:static}.toolbar{align-items:flex-start;flex-direction:column}.settings-nav{grid-template-columns:1fr}.help:hover::after,.help:focus::after{left:0;transform:none}}
</style>
</head>
<body>
<h1>Qt Project Settings</h1>
<div class="subtitle">${escapeHtml(manifest.name)} · schema v${manifest.schemaVersion} · ${escapeHtml(buildProfile.name)} / ${escapeHtml(kitProfile.name)} · <code>${escapeHtml(ref.absolutePath)}</code></div>
<div id="settingsStickyHeader" class="settings-sticky-header">
  <div id="settingsToolbar" class="toolbar">
    <div>${selectField('Edited build variant', 'variant', `<option value="debug" ${this.variant === 'debug' ? 'selected' : ''}>Debug</option><option value="release" ${this.variant === 'release' ? 'selected' : ''}>Release</option>`)}</div>
    <div class="actions"><button id="save">Save Qt settings</button><button class="secondary" id="reloadSettings" title="Discard unsaved edits and reload the manifest">Reload</button><button class="secondary" id="manageProfiles">Manage profiles</button><button class="secondary" id="manageDebugProfiles">Debug profiles</button><button class="secondary" id="managePlatformProfiles">Platforms</button><button class="secondary" id="manageNamedKits">Manage named kits</button><button class="secondary" id="selectKit">Select Qt installation</button><button class="secondary" id="repairToolchain">Repair compiler</button><button class="secondary" id="selectDesigner">Locate Designer</button><button class="secondary" id="openManifest">Open manifest JSON</button></div>
  </div>
  <div id="settingsNavigation" class="settings-nav">
    <input id="settingsFilter" type="search" placeholder="Filter settings, fields or tools…" aria-label="Filter project settings">
    <select id="sectionNav" aria-label="Jump to settings section"><option value="">Jump to a section…</option><option value="section-control">Control center</option><option value="section-project">Project and target</option><option value="section-kit">Qt kit and generators</option><option value="section-modules">Qt modules</option><option value="section-backend">Backend configuration</option><option value="section-compiler">Compiler and linker</option><option value="section-run">Run</option><option value="section-platforms">Platforms</option><option value="section-debug">Advanced debugging</option><option value="section-tests">Tests</option><option value="section-quality">Quality</option><option value="section-dependencies">Dependencies / package managers</option><option value="section-python">Qt for Python / PySide6</option><option value="section-qml-language">QML language and modules</option><option value="section-profiling">Profiling and diagnostics</option><option value="section-packaging">Packaging</option><option value="section-installers">Installers and signing</option><option value="section-publication">Publication and updates</option><option value="section-build-steps">Build steps</option><option value="section-files">Files</option></select>
    <span id="dirtyState" class="dirty">Saved state</span>
  </div>
</div>
<section id="section-control" data-settings-section class="card wide" style="margin-bottom:18px"><h2>${sectionHeading('control', 'Project control center')}</h2><div class="control-grid">
  <div class="control-group"><h3>Build and run</h3><div class="actions"><button class="secondary" data-command="qpm.selectBuildMode">Build mode</button><button class="secondary" data-command="qpm.selectQtBackend">Backend</button><button class="secondary" data-command="qpm.configureQtBackend">Configure</button><button class="secondary" data-command="qpm.chooseBuildAction">Build / rebuild / clean</button><button class="secondary" data-command="qpm.chooseRunAction">Run options</button><button class="secondary" data-command="qpm.startQtDebugProfile">Start debugging</button></div></div>
  <div class="control-group"><h3>Project and kits</h3><div class="actions"><button class="secondary" id="manageProfilesControl">Profiles</button><button class="secondary" id="manageNamedKitsControl">Named kits</button><button class="secondary" data-command="qpm.syncCppTools">IntelliSense</button><button class="secondary" data-command="qpm.openProjectHealthReport">Project health</button><button class="secondary" data-command="qpm.editQtModules">Qt modules</button></div></div>
  <div class="control-group"><h3>Qt tools</h3><div class="actions"><button class="secondary" id="selectDesignerControl">Designer</button><button class="secondary" data-command="qpm.updateTranslations">Update translations</button><button class="secondary" data-command="qpm.releaseTranslations">Release translations</button><button class="secondary" data-command="qpm.qmlLintProject">Lint QML</button><button class="secondary" data-command="qpm.qmlFormatProject">Format QML</button><button class="secondary" data-command="qpm.restartQmlLanguageServer">Restart qmlls</button><button class="secondary" data-command="qpm.openQtDocumentation">Documentation</button></div></div>
  <div class="control-group"><h3>Tests and quality</h3><div class="actions"><button class="secondary" data-command="qpm.openTestExplorer">Test Explorer</button><button class="secondary" data-command="qpm.runAllTests">Run tests</button><button class="secondary" data-command="qpm.runClangTidyProject">Clang-Tidy</button><button class="secondary" data-command="qpm.runClazyProject">Clazy</button><button class="secondary" data-command="qpm.runAllTestsWithCoverage">Coverage</button><button class="secondary" data-command="qpm.openQualityReport">Quality report</button></div></div>
  <div class="control-group"><h3>Platforms</h3><div class="actions"><button class="secondary" id="managePlatformProfilesControl">Profiles</button><button class="secondary" data-command="qpm.selectQtPlatform">Active platform</button><button class="secondary" data-command="qpm.detectPlatformCapabilities">Detect tools</button><button class="secondary" data-command="qpm.buildDeployRunPlatform">Build / deploy / run</button><button class="secondary" data-command="qpm.openPlatformReport">Report</button></div></div>
  <div class="control-group"><h3>Profiling and diagnostics</h3><div class="actions"><button class="secondary" data-command="qpm.profileQmlApplication">QML Profiler</button><button class="secondary" data-command="qpm.profileCpu">CPU</button><button class="secondary" data-command="qpm.profileMemory">Memory</button><button class="secondary" data-command="qpm.runCppcheck">Cppcheck</button><button class="secondary" data-command="qpm.openProfilingReport">Report</button></div></div>
  <div class="control-group"><h3>Packaging</h3><div class="actions"><button class="secondary" data-command="qpm.createPortablePackage">Create package</button><button class="secondary" data-command="qpm.generateProductMetadata">Generate metadata</button><button class="secondary" data-command="qpm.openPackagingReport">Report</button><button class="secondary" data-command="qpm.revealPackagingOutput">Reveal output</button></div></div>
</div></section>
<div class="grid">
<section id="section-project" data-settings-section class="card"><h2>${sectionHeading('project', 'Project and target')}</h2><div class="fields">
  ${field('Project name', 'name', manifest.name)}
  ${field('Target file name', 'targetName', manifest.targetName)}
  ${selectField('Project type', 'kind', kindOptions(manifest.kind))}
  ${selectField('C++ standard', 'cppStandard', cppStandardOptions(buildProfile.cppStandard))}
  ${selectField('Active build architecture', 'buildArchitecture', `<option value="x64" ${configuredX64 ? 'selected' : ''}>64-bit (recommended for this kit)</option><option value="x86" ${!configuredX64 ? 'selected' : ''}>32-bit</option>`)}
  ${field('Output directory', 'outputDirectory', buildProfile.outputDirectory)}
  ${field('Generated Qt files directory', 'generatedDirectory', buildProfile.generatedDirectory)}
</div></section>
<section id="section-kit" data-settings-section class="card"><h2>${sectionHeading('kit', 'Qt kit and generators')}</h2>
  <div class="kit ${toolchainState}">${installation || kitProfile.qtInstallation ? `${escapeHtml(kitProfile.name)}<br>Qt: ${escapeHtml(installation?.label || kitProfile.qtInstallation || 'not resolved')}<br>Root: ${escapeHtml(installation?.root || kitProfile.qtInstallation || 'not resolved')}<br>Compiler: ${escapeHtml(compilerDetails)}<br>Source: ${escapeHtml(compilerSource)} · Compatibility: ${escapeHtml(kitCompatibility)}${toolchainDiagnostic}<br>Debugger: ${escapeHtml(debuggerDetails)}<br>qmake: ${escapeHtml(qmakeDetails)}<br>CMake: ${escapeHtml(cmakeDetails)}<br>Build tool: ${escapeHtml(buildToolDetails)} · Generator: ${escapeHtml(generatorDetails)}<br>Qt Widgets Designer: ${escapeHtml(designerDetails)}<br>${escapeHtml(linguistDetails)}<br>${escapeHtml(qmlToolDetails)}` : `No valid Qt kit is resolved.<br>Configured path: ${escapeHtml((0, qtProjectManifest_1.getQtInstallationPreference)(manifest, mode) || 'project/workspace active kit')}<br>Use “Manage named kits” to create or assign a reusable kit.<br>Qt Widgets Designer: ${escapeHtml(designerDetails)}<br>${escapeHtml(linguistDetails)}<br>${escapeHtml(qmlToolDetails)}`}</div>
  <div class="fields" style="margin-top:12px">${selectField('Required Qt major version', 'majorVersion', `<option value="auto" ${manifest.qt.majorVersion === 'auto' ? 'selected' : ''}>Auto</option><option value="5" ${manifest.qt.majorVersion === 5 ? 'selected' : ''}>Qt 5</option><option value="6" ${manifest.qt.majorVersion === 6 ? 'selected' : ''}>Qt 6</option>`)}${selectField('Build backend', 'buildSystem', buildSystemOptions(buildProfile.system))}<div class="field"><label for="parallelJobs" class="field-label">Parallel jobs (0 = automatic)${helpIcon('parallelJobs')}</label><input id="parallelJobs" type="number" min="0" value="${buildProfile.parallelJobs}"></div>${readOnlyField('Kit generator', 'kitGenerator', kitProfile.generator || (installation?.ninjaPath ? 'Ninja' : installation?.compilerFamily === 'msvc' ? 'NMake Makefiles' : 'Auto'))}</div>
  <div class="checks">${check('autoMoc', 'Automatic MOC', buildProfile.autoMoc)}${check('autoUic', 'Automatic UIC', buildProfile.autoUic)}${check('autoRcc', 'Automatic RCC', buildProfile.autoRcc)}${check('generateProjectFiles', 'Generate backend project files', buildProfile.generateProjectFiles)}${check('unityBuild', 'Unity build', buildProfile.unityBuild)}${check('useResponseFiles', 'Use response files when needed', buildProfile.useResponseFiles)}${check('autoDeploy', 'Run deployment tool after build', deployProfile.enabled)}${check('deployTranslations', 'Release and deploy application translations', deployProfile.translations)}</div>
</section>
<section id="section-modules" data-settings-section class="card wide"><h2>${sectionHeading('modules', 'Qt modules')}</h2><div class="modules">${moduleHtml}</div></section>
<section id="section-backend" data-settings-section class="card wide"><h2>${sectionHeading('backend', 'Backend configuration')}</h2><div class="fields">
  <div class="conditional-group" data-build-systems="qmake cmake">
    ${field('Backend source directory', 'sourceDirectory', buildProfile.sourceDirectory)}
    ${field('Existing .pro or CMakeLists.txt (optional)', 'projectFile', buildProfile.projectFile)}
  </div>
  <div class="conditional-group" data-build-systems="cmake">
    ${field('CMake configure preset', 'cmakeConfigurePreset', buildProfile.cmakeConfigurePreset)}
    ${field('CMake build preset', 'cmakeBuildPreset', buildProfile.cmakeBuildPreset)}
  </div>
  ${field('Precompiled header (optional)', 'precompiledHeader', buildProfile.precompiledHeader)}
  <div class="conditional-group" data-build-systems="qmake cmake">
    ${area('Configure arguments', 'configureArguments', buildProfile.configureArguments)}
  </div>
  ${area('Build arguments', 'buildArguments', buildProfile.buildArguments)}
  ${area('Clean arguments', 'cleanArguments', buildProfile.cleanArguments, true)}
</div><p class="muted">Fields that do not apply to the selected backend are hidden automatically. QPM can generate isolated qmake/CMake files under .qpm or use an existing project file.</p></section>
<section id="section-compiler" data-settings-section class="card"><h2>${sectionHeading('compiler', 'Common compiler and linker inputs')}</h2><div class="fields">
  ${area('Global defines', 'defines', manifest.defines)}
  ${area('Include directories', 'includeDirectories', manifest.includeDirectories)}
  ${area('Library directories', 'libraryDirectories', manifest.libraryDirectories)}
  ${area('Additional libraries', 'libraries', manifest.libraries)}
</div></section>
<section id="section-flags" data-settings-section class="card"><h2>${sectionHeading('compiler', this.variant === 'release' ? 'Release flags' : 'Debug flags')}</h2><div class="fields">
  ${area('Variant defines', 'variantDefines', buildVariant.defines)}
  ${area('Compiler flags', 'compilerFlags', buildVariant.compilerFlags)}
  ${area('Linker flags', 'linkerFlags', buildVariant.linkerFlags, true)}
</div></section>
<section id="section-run" data-settings-section class="card wide"><h2>${sectionHeading('run', 'Run')}</h2><div class="fields">
  ${field('Command-line arguments', 'runArguments', runArguments, true)}
  ${field('Working directory', 'workingDirectory', runWorkingDirectory)}
  ${field('Environment options (NAME=value;OTHER=value)', 'environmentOptions', runEnvironmentOptions, true)}
  ${field('External executable for shared-library debugging', 'externalProcessPath', projectSettings.run.externalProcessPath)}
</div></section>
<section id="section-platforms" data-settings-section class="card wide"><h2>${sectionHeading('platforms', 'Platforms')}</h2><div class="fields">
  ${field('Platform profile name', 'platformName', platformProfile.name)}
  ${selectField('Platform type', 'platformType', platformTypeOptions(platformProfile.type))}
  ${selectField('Build location', 'platformBuildLocation', platformBuildLocationOptions(platformProfile.buildLocation))}
  ${selectField('Kit', 'platformKitId', profileOptions(manifest.profiles.kits, platformProfile.kitId))}
  ${selectField('Build profile', 'platformBuildProfileId', profileOptions(manifest.profiles.builds, platformProfile.buildProfileId))}
  ${selectField('Run profile', 'platformRunProfileId', profileOptions(manifest.profiles.runs, platformProfile.runProfileId))}
  ${selectField('Deploy profile', 'platformDeployProfileId', profileOptions(manifest.profiles.deploys, platformProfile.deployProfileId))}
  ${selectField('Debug profile', 'platformDebugProfileId', profileOptions(manifest.profiles.debugs, platformProfile.debugProfileId))}
  ${field('Platform environment (NAME=value;OTHER=value)', 'platformEnvironment', environmentToText(platformProfile.environment), true)}
  ${field('Sysroot', 'platformSysroot', platformProfile.sysroot, true)}
  <div class="conditional-group" data-platform-types="remote-linux">
    ${field('SSH host', 'platformSshHost', platformProfile.sshHost)}
    ${field('SSH user', 'platformSshUser', platformProfile.sshUser)}
    ${numberField('SSH port', 'platformSshPort', platformProfile.sshPort)}
    ${field('SSH executable', 'platformSshExecutable', platformProfile.sshExecutable)}
    ${field('SCP executable', 'platformScpExecutable', platformProfile.scpExecutable)}
    ${field('rsync executable', 'platformRsyncExecutable', platformProfile.rsyncExecutable)}
    ${field('Remote project directory', 'platformRemoteProjectDirectory', platformProfile.remoteProjectDirectory)}
    ${field('Remote deploy directory', 'platformRemoteDeployDirectory', platformProfile.remoteDeployDirectory)}
    ${field('Remote build command', 'platformRemoteBuildCommand', platformProfile.remoteBuildCommand, true)}
    ${field('Remote run command', 'platformRemoteRunCommand', platformProfile.remoteRunCommand, true)}
    ${numberField('GDB Server port', 'platformGdbServerPort', platformProfile.gdbServerPort)}
  </div>
  <div class="conditional-group" data-platform-types="docker">
    ${field('Docker executable', 'platformDockerExecutable', platformProfile.dockerExecutable)}
    ${field('Docker image', 'platformDockerImage', platformProfile.dockerImage)}
    ${field('Docker container name', 'platformDockerContainerName', platformProfile.dockerContainerName)}
    ${field('Container workspace', 'platformDockerWorkspace', platformProfile.dockerWorkspace)}
    ${field('Docker build command', 'platformDockerBuildCommand', platformProfile.dockerBuildCommand, true)}
    ${field('Docker run command', 'platformDockerRunCommand', platformProfile.dockerRunCommand, true)}
    ${area('Additional Docker arguments', 'platformDockerArguments', platformProfile.dockerArguments, true)}
  </div>
  <div class="conditional-group" data-platform-types="webassembly">
    ${field('emsdk root', 'platformEmsdkRoot', platformProfile.emsdkRoot)}
    ${field('emsdk environment script', 'platformEmsdkEnvironmentScript', platformProfile.emsdkEnvironmentScript)}
    ${field('WebAssembly server executable', 'platformWasmServerExecutable', platformProfile.wasmServerExecutable)}
    ${numberField('WebAssembly HTTP port', 'platformWasmServerPort', platformProfile.wasmServerPort)}
    ${field('WebAssembly HTML entry', 'platformWasmHtmlEntry', platformProfile.wasmHtmlEntry)}
    ${area('WebAssembly server arguments', 'platformWasmServerArguments', platformProfile.wasmServerArguments, true)}
  </div>
  <div class="conditional-group" data-platform-types="macos ios-simulator ios-device">
    ${field('Xcode developer directory', 'platformAppleDeveloperDirectory', platformProfile.appleDeveloperDirectory)}
    ${field('xcodebuild executable', 'platformAppleXcodebuildPath', platformProfile.appleXcodebuildPath)}
    ${field('xcrun executable', 'platformAppleXcrunPath', platformProfile.appleXcrunPath)}
    ${field('Bundle identifier', 'platformAppleBundleIdentifier', platformProfile.appleBundleIdentifier)}
    ${field('Deployment target', 'platformAppleDeploymentTarget', platformProfile.appleDeploymentTarget)}
    ${field('Architectures', 'platformAppleArchitectures', platformProfile.appleArchitectures.join(', '))}
    ${field('Apple development team', 'platformAppleDevelopmentTeam', platformProfile.appleDevelopmentTeam)}
    ${field('Code-sign identity', 'platformAppleCodeSignIdentity', platformProfile.appleCodeSignIdentity)}
    ${field('Provisioning profile', 'platformAppleProvisioningProfile', platformProfile.appleProvisioningProfile)}
    ${field('Entitlements file', 'platformAppleEntitlementsFile', platformProfile.appleEntitlementsFile)}
    ${field('Xcode scheme', 'platformAppleScheme', platformProfile.appleScheme)}
    ${selectField('Xcode configuration', 'platformAppleConfiguration', appleConfigurationOptions(platformProfile.appleConfiguration))}
    ${area('Additional Apple CMake arguments', 'platformAppleAdditionalCMakeArguments', platformProfile.appleAdditionalCMakeArguments)}
    ${area('Additional xcodebuild arguments', 'platformAppleAdditionalXcodebuildArguments', platformProfile.appleAdditionalXcodebuildArguments)}
  </div>
  <div class="conditional-group" data-platform-types="macos">
    ${field('macdeployqt executable', 'platformAppleMacDeployQtPath', platformProfile.appleMacDeployQtPath)}
    ${selectField('DMG file system', 'platformAppleDmgFileSystem', appleDmgFileSystemOptions(platformProfile.appleDmgFileSystem))}
    ${field('notarytool keychain profile', 'platformAppleNotaryProfile', platformProfile.appleNotaryProfile)}
    ${area('Additional macdeployqt arguments', 'platformAppleAdditionalMacDeployQtArguments', platformProfile.appleAdditionalMacDeployQtArguments)}
  </div>
  <div class="conditional-group" data-platform-types="ios-simulator">
    ${field('iOS simulator UDID', 'platformAppleSimulatorId', platformProfile.appleSimulatorId)}
  </div>
  <div class="conditional-group" data-platform-types="ios-device">
    ${field('Physical iOS device identifier', 'platformAppleDeviceId', platformProfile.appleDeviceId)}
  </div>
  <div class="conditional-group" data-platform-types="android">
    ${field('Android SDK root', 'platformAndroidSdkRoot', platformProfile.androidSdkRoot)}
    ${field('Android NDK root', 'platformAndroidNdkRoot', platformProfile.androidNdkRoot)}
    ${field('Java JDK root', 'platformAndroidJdkRoot', platformProfile.androidJdkRoot)}
    ${field('androiddeployqt executable', 'platformAndroidDeployQtPath', platformProfile.androidDeployQtPath)}
    ${field('adb executable', 'platformAndroidAdbPath', platformProfile.androidAdbPath)}
    ${field('Android emulator executable', 'platformAndroidEmulatorPath', platformProfile.androidEmulatorPath)}
    ${field('avdmanager executable', 'platformAndroidAvdManagerPath', platformProfile.androidAvdManagerPath)}
    ${field('sdkmanager executable', 'platformAndroidSdkManagerPath', platformProfile.androidSdkManagerPath)}
    ${field('Android ABIs', 'platformAndroidAbis', platformProfile.androidAbis.join(', '))}
    ${numberField('Compile SDK', 'platformAndroidCompileSdk', platformProfile.androidCompileSdk)}
    ${numberField('Target SDK', 'platformAndroidTargetSdk', platformProfile.androidTargetSdk)}
    ${numberField('Minimum SDK', 'platformAndroidMinSdk', platformProfile.androidMinSdk)}
    ${field('Build-tools version', 'platformAndroidBuildToolsVersion', platformProfile.androidBuildToolsVersion)}
    ${field('Package name', 'platformAndroidPackageName', platformProfile.androidPackageName)}
    ${field('Application name', 'platformAndroidAppName', platformProfile.androidAppName)}
    ${numberField('Version code', 'platformAndroidVersionCode', platformProfile.androidVersionCode)}
    ${field('Version name', 'platformAndroidVersionName', platformProfile.androidVersionName)}
    ${selectField('Package format', 'platformAndroidPackageFormat', androidPackageFormatOptions(platformProfile.androidPackageFormat))}
    ${field('Device serial', 'platformAndroidDeviceSerial', platformProfile.androidDeviceSerial)}
    ${field('AVD name', 'platformAndroidAvdName', platformProfile.androidAvdName)}
    ${field('Logcat filter', 'platformAndroidLogcatFilter', platformProfile.androidLogcatFilter, true)}
    ${area('Additional Android CMake arguments', 'platformAndroidCMakeArguments', platformProfile.androidCMakeArguments)}
    ${area('Additional Gradle/package arguments', 'platformAndroidGradleArguments', platformProfile.androidGradleArguments)}
    ${field('Release keystore', 'platformAndroidKeystore', platformProfile.androidKeystore)}
    ${field('Keystore alias', 'platformAndroidKeystoreAlias', platformProfile.androidKeystoreAlias)}
    ${field('Store password environment variable', 'platformAndroidStorePasswordEnvironment', platformProfile.androidStorePasswordEnvironment)}
    ${field('Key password environment variable', 'platformAndroidKeyPasswordEnvironment', platformProfile.androidKeyPasswordEnvironment)}
  </div>
</div><div class="checks">
  <span class="conditional-group" data-platform-types="remote-linux">${check('platformUseRsync', 'Prefer rsync for Remote Linux synchronization', platformProfile.useRsync)}${check('platformStartGdbServer', 'Start gdbserver when running remotely', platformProfile.startGdbServer)}</span>
  <span class="conditional-group" data-platform-types="docker">${check('platformDockerKeepContainer', 'Keep Docker container after execution', platformProfile.dockerKeepContainer)}${check('platformDockerForwardDisplay', 'Forward X11 display', platformProfile.dockerForwardDisplay)}${check('platformDockerHostNetwork', 'Use Docker host network', platformProfile.dockerHostNetwork)}</span>
  <span class="conditional-group" data-platform-types="webassembly">${check('platformWasmOpenBrowser', 'Open WebAssembly application in browser', platformProfile.wasmOpenBrowser)}</span>
  <span class="conditional-group" data-platform-types="macos ios-simulator ios-device">${check('platformAppleAutomaticSigning', 'Use Xcode automatic signing', platformProfile.appleAutomaticSigning)}${check('platformAppleAllowProvisioningUpdates', 'Allow Xcode provisioning updates', platformProfile.appleAllowProvisioningUpdates)}</span>
  <span class="conditional-group" data-platform-types="macos">${check('platformAppleCreateDmg', 'Create a DMG after deployment', platformProfile.appleCreateDmg)}${check('platformAppleStapleAfterNotarization', 'Staple notarization ticket automatically', platformProfile.appleStapleAfterNotarization)}${check('platformAppleAppStoreCompliant', 'Use App Store compliant deployment', platformProfile.appleAppStoreCompliant)}${check('platformAppleHardenedRuntime', 'Enable hardened runtime', platformProfile.appleHardenedRuntime)}${check('platformAppleTimestamp', 'Timestamp signatures', platformProfile.appleTimestamp)}</span>
  <span class="conditional-group" data-platform-types="android">${check('platformAndroidBuildAllAbis', 'Build all installed Qt Android ABIs', platformProfile.androidBuildAllAbis)}${check('platformAndroidInstallReplace', 'Replace existing APK during installation', platformProfile.androidInstallReplace)}${check('platformAndroidUninstallBeforeInstall', 'Uninstall before installation', platformProfile.androidUninstallBeforeInstall)}${check('platformAndroidOpenLogcatAfterRun', 'Open logcat after run', platformProfile.androidOpenLogcatAfterRun)}</span>
</div><div class="actions"><button class="secondary" id="managePlatformProfilesInline">Manage platform profiles</button><button class="secondary" data-command="qpm.detectPlatformCapabilities">Detect capabilities</button><button class="secondary" data-command="qpm.buildForPlatform">Build platform</button><button class="secondary" data-command="qpm.deployToPlatform">Deploy platform</button><button class="secondary" data-command="qpm.runOnPlatform">Run platform</button><span class="conditional-group" data-platform-types="macos ios-simulator ios-device"><button class="secondary" data-command="qpm.configureAppleEnvironment">Configure Apple</button><button class="secondary" data-command="qpm.buildAppleTarget">Build Apple target</button><button class="secondary" data-command="qpm.openAppleReport">Apple report</button></span><span class="conditional-group" data-platform-types="macos"><button class="secondary" data-command="qpm.createMacDmg">Create DMG</button><button class="secondary" data-command="qpm.notarizeAppleArtifact">Notarize</button></span><span class="conditional-group" data-platform-types="ios-simulator"><button class="secondary" data-command="qpm.selectAppleSimulator">Select simulator</button><button class="secondary" data-command="qpm.installRunIosSimulator">Build / install / run</button></span><span class="conditional-group" data-platform-types="android"><button class="secondary" data-command="qpm.configureAndroidEnvironment">Configure Android</button><button class="secondary" data-command="qpm.buildAndroidApk">Build APK</button><button class="secondary" data-command="qpm.buildInstallRunAndroid">Build / install / run</button><button class="secondary" data-command="qpm.openAndroidReport">Android report</button></span></div><p class="muted">Fields that do not apply to the selected platform type are preserved but ignored.</p></section>
<section id="section-debug" data-settings-section class="card wide"><h2>${sectionHeading('debugging', 'Advanced debugging')}</h2><div class="fields">
  ${field('Profile name', 'debugName', debugProfile.name)}
  ${selectField('Request', 'debugRequest', debugRequestOptions(debugProfile.request))}
  ${selectField('Debugger', 'debuggerType', debuggerTypeOptions(debugProfile.debuggerType))}
  ${selectField('Build profile', 'debugBuildProfileId', profileOptions(manifest.profiles.builds, debugProfile.buildProfileId))}
  ${selectField('Run profile', 'debugRunProfileId', profileOptions(manifest.profiles.runs, debugProfile.runProfileId))}
  ${field('Program override (empty = project target)', 'debugProgram', debugProfile.program, true)}
  ${field('Arguments', 'debugArguments', debugProfile.arguments, true)}
  ${field('Working directory', 'debugWorkingDirectory', debugProfile.workingDirectory)}
  ${field('Environment (NAME=value;OTHER=value)', 'debugEnvironment', environmentToText(debugProfile.environment), true)}
  <div class="conditional-group" data-debug-requests="attach">${field('Process ID / picker expression', 'debugProcessId', debugProfile.processId)}</div>
  <div class="conditional-group" data-debug-requests="core-dump">${field('Core or dump file', 'debugCoreDumpPath', debugProfile.coreDumpPath)}</div>
  <div class="conditional-group" data-debug-requests="remote-gdb">
    ${field('Remote GDB host', 'debugRemoteHost', debugProfile.remoteHost)}
    ${numberField('Remote GDB port', 'debugRemotePort', debugProfile.remotePort)}
    ${field('Remote program', 'debugRemoteProgram', debugProfile.remoteProgram)}
    ${field('Remote working directory', 'debugRemoteWorkingDirectory', debugProfile.remoteWorkingDirectory)}
    ${field('SSH host', 'debugSshHost', debugProfile.sshHost)}
    ${field('SSH user', 'debugSshUser', debugProfile.sshUser)}
    ${numberField('SSH port', 'debugSshPort', debugProfile.sshPort)}
    ${field('SSH executable', 'debugSshExecutable', debugProfile.sshExecutable)}
    ${area('Source file map (remote=local)', 'debugSourceFileMap', mappingToLines(debugProfile.sourceFileMap))}
    ${area('Shared-library search paths', 'debugSolibPaths', debugProfile.additionalSolibSearchPath)}
  </div>
  ${field('Symbol search path', 'debugSymbolSearchPath', debugProfile.symbolSearchPath)}
  ${area('Debugger setup commands', 'debugSetupCommands', debugProfile.setupCommands, true)}
  <div class="conditional-group" data-debug-requests="launch qml-attach">
    ${field('QML debugger host', 'debugQmlHost', debugProfile.qmlHost)}
    ${numberField('QML debugger port', 'debugQmlPort', debugProfile.qmlPort)}
    ${field('QML services', 'debugQmlServices', debugProfile.qmlServices, true)}
  </div>
</div><div class="checks">
  ${check('debugStopAtEntry', 'Stop at entry', debugProfile.stopAtEntry)}
  ${check('debugExternalConsole', 'Use external console', debugProfile.externalConsole)}
  <span class="conditional-group" data-debug-requests="remote-gdb">${check('debugStartGdbServerViaSsh', 'Start gdbserver through SSH', debugProfile.startGdbServerViaSsh)}</span>
  ${check('debugPrettyPrinters', 'Enable Qt pretty printers / Natvis', debugProfile.enableQtPrettyPrinters)}
  ${check('debugBreakOnQtWarnings', 'Break on qFatal / Qt assertions', debugProfile.breakOnQtWarnings)}
  <span class="conditional-group" data-debug-requests="launch qml-attach">${check('debugQmlEnabled', 'Enable mixed C++ / QML debugging', debugProfile.qmlDebug)}${check('debugQmlBlock', 'Block until QML debugger attaches', debugProfile.qmlBlock)}</span>
</div><div class="actions"><button class="secondary" id="manageDebugProfilesInline">Manage debug profiles</button><button class="secondary" id="generateLaunchJson">Generate launch.json</button><button class="secondary" data-command="qpm.debugWithGdb">Build and debug</button><button class="secondary" data-command="qpm.attachQtProcess">Attach process</button></div><p class="muted">All fields of the active debug profile are editable here. Request-specific fields are ignored when they do not apply.</p></section>
<section id="section-tests" data-settings-section class="card wide"><h2>${sectionHeading('tests', 'Tests')}</h2><div class="fields">
  ${selectField('Framework discovery', 'testFramework', testFrameworkOptions(manifest.testing.framework))}
  <div class="field"><label for="testTimeoutMs" class="field-label">Timeout per test run (ms)${helpIcon('testTimeoutMs')}</label><input id="testTimeoutMs" type="number" min="1000" step="1000" value="${manifest.testing.timeoutMs}"></div>
  <div class="field"><label for="testParallelJobs" class="field-label">Parallel test jobs${helpIcon('testParallelJobs')}</label><input id="testParallelJobs" type="number" min="0" max="256" value="${manifest.testing.parallelJobs}"></div>
  ${selectField('Repeat mode', 'testRepeatMode', testRepeatModeOptions(manifest.testing.repeatMode))}
  <div class="field"><label for="testRepeatCount" class="field-label">Repeat count${helpIcon('testRepeatCount')}</label><input id="testRepeatCount" type="number" min="1" max="10000" value="${manifest.testing.repeatCount}"></div>
  <div class="field"><label for="testHistoryLimit" class="field-label">History entries${helpIcon('testHistoryLimit')}</label><input id="testHistoryLimit" type="number" min="0" max="5000" value="${manifest.testing.historyLimit}"></div>
  ${area('Additional test arguments', 'testArguments', manifest.testing.arguments)}
  ${field('Test environment (NAME=value;OTHER=value)', 'testEnvironment', Object.entries(manifest.testing.environment).map(([key, value]) => `${key}=${value}`).join(';'), true)}
</div><div class="checks">${check('testBuildBeforeRun', 'Build before running tests', manifest.testing.buildBeforeRun)}${check('testOffscreenPlatform', 'Use Qt offscreen platform', manifest.testing.useOffscreenPlatform)}${check('testStopOnFailure', 'Stop on first failure', manifest.testing.stopOnFailure)}</div>
<div class="conditional-group" data-test-frameworks="auto ctest"><div class="wide"><h3>CTest</h3><div class="fields">
  ${field('CTest executable', 'testCtestExecutable', manifest.testing.ctest.executable)}
  ${field('CTest build directory', 'testCtestBuildDirectory', manifest.testing.ctest.buildDirectory)}
  ${field('CTest preset', 'testCtestPreset', manifest.testing.ctest.preset)}
  ${field('CTest configuration', 'testCtestConfiguration', manifest.testing.ctest.configuration)}
  ${field('CTest label regex', 'testCtestLabelRegex', manifest.testing.ctest.labelRegex)}
  ${field('CTest name regex', 'testCtestNameRegex', manifest.testing.ctest.nameRegex)}
  ${field('CTest exclude regex', 'testCtestExcludeRegex', manifest.testing.ctest.excludeRegex)}
</div><div class="checks">${check('testCtestOutputOnFailure', 'Show CTest output on failure', manifest.testing.ctest.outputOnFailure)}</div></div></div>
<div class="conditional-group" data-test-frameworks="auto boost"><div class="wide"><h3>Boost.Test</h3><div class="fields">
  ${selectField('Boost log level', 'testBoostLogLevel', boostLogLevelOptions(manifest.testing.boost.logLevel))}
  ${selectField('Boost report level', 'testBoostReportLevel', boostReportLevelOptions(manifest.testing.boost.reportLevel))}
  <div class="field"><label for="testBoostRandomSeed" class="field-label">Random seed${helpIcon('testBoostRandomSeed')}</label><input id="testBoostRandomSeed" type="number" min="0" value="${manifest.testing.boost.randomSeed}"></div>
</div><div class="checks">${check('testBoostCatchSystemErrors', 'Catch system errors', manifest.testing.boost.catchSystemErrors)}</div></div></div>
<div class="actions"><button type="button" class="secondary" data-command="qpm.rerunFailedTests">Rerun failed</button><button type="button" class="secondary" data-command="qpm.openTestHistory">Open history</button><button type="button" class="secondary" data-command="qpm.clearTestHistory">Clear history</button></div></section>
<section id="section-quality" data-settings-section class="card"><h2>${sectionHeading('quality', 'Static analysis and quality')}</h2><div class="fields">
  ${field('Clang-Tidy checks', 'clangTidyChecks', manifest.quality.clangTidyChecks, true)}
  ${field('Clazy checks', 'clazyChecks', manifest.quality.clazyChecks, true)}
  ${field('Header filter regular expression', 'qualityHeaderFilter', manifest.quality.headerFilter, true)}
</div><p class="muted">Use the Qt Tests & Quality view to run analyzers and create sanitizer or coverage profiles.</p></section>
<section id="section-dependencies" data-settings-section class="card wide"><h2>${sectionHeading('dependencies', 'Dependencies and package managers')}</h2>
<p class="muted">Project-scoped C/C++ dependencies with vcpkg manifest mode, Conan 2 and pkg-config. Generated integration is shared by the direct, qmake and CMake backends.</p>
<div class="fields">
  ${field('Dependency output directory', 'dependenciesOutputDirectory', manifest.dependencies.outputDirectory)}
  ${area('CMake find_package entries', 'dependenciesCmakeFindPackages', manifest.dependencies.cmakeFindPackages, true)}
  ${area('CMake link targets', 'dependenciesCmakeLinkTargets', manifest.dependencies.cmakeLinkTargets, true)}
  ${area('Additional include directories', 'dependenciesIncludeDirectories', manifest.dependencies.additionalIncludeDirectories, true)}
  ${area('Additional library directories', 'dependenciesLibraryDirectories', manifest.dependencies.additionalLibraryDirectories, true)}
  ${area('Additional libraries', 'dependenciesLibraries', manifest.dependencies.additionalLibraries, true)}
</div><div class="checks">${check('dependenciesEnabled', 'Enable dependency management', manifest.dependencies.enabled)}${check('dependenciesAutoInstall', 'Install / synchronize before each build', manifest.dependencies.autoInstallBeforeBuild)}</div>
<h3 style="margin-top:18px">vcpkg</h3><div class="fields">
  ${field('vcpkg executable', 'dependenciesVcpkgExecutable', manifest.dependencies.vcpkg.executable, true)}
  ${field('VCPKG_ROOT', 'dependenciesVcpkgRoot', manifest.dependencies.vcpkg.root, true)}
  ${field('Manifest file', 'dependenciesVcpkgManifestFile', manifest.dependencies.vcpkg.manifestFile)}
  ${field('Installed tree', 'dependenciesVcpkgInstallRoot', manifest.dependencies.vcpkg.installRoot)}
  ${field('Target triplet', 'dependenciesVcpkgTriplet', manifest.dependencies.vcpkg.triplet, true)}
  ${field('Host triplet', 'dependenciesVcpkgHostTriplet', manifest.dependencies.vcpkg.hostTriplet)}
  ${field('Builtin baseline', 'dependenciesVcpkgBaseline', manifest.dependencies.vcpkg.baseline)}
  ${area('vcpkg dependencies', 'dependenciesVcpkgPackages', manifest.dependencies.vcpkg.dependencies, true)}
  ${area('Overlay ports', 'dependenciesVcpkgOverlayPorts', manifest.dependencies.vcpkg.overlayPorts)}
  ${area('Overlay triplets', 'dependenciesVcpkgOverlayTriplets', manifest.dependencies.vcpkg.overlayTriplets)}
  ${area('Additional vcpkg arguments', 'dependenciesVcpkgArguments', manifest.dependencies.vcpkg.additionalArguments, true)}
</div><div class="checks">${check('dependenciesVcpkgEnabled', 'Enable vcpkg', manifest.dependencies.vcpkg.enabled)}</div>
<h3 style="margin-top:18px">Conan 2</h3><div class="fields">
  ${field('Conan executable', 'dependenciesConanExecutable', manifest.dependencies.conan.executable, true)}
  ${field('Conan manifest', 'dependenciesConanManifestFile', manifest.dependencies.conan.manifestFile)}
  ${field('Conan output directory', 'dependenciesConanOutputDirectory', manifest.dependencies.conan.outputDirectory)}
  ${field('Host profile', 'dependenciesConanProfileHost', manifest.dependencies.conan.profileHost, true)}
  ${field('Build profile', 'dependenciesConanProfileBuild', manifest.dependencies.conan.profileBuild, true)}
  ${field('Lockfile', 'dependenciesConanLockfile', manifest.dependencies.conan.lockfile)}
  ${area('Conan requires', 'dependenciesConanRequires', manifest.dependencies.conan.requires, true)}
  ${area('Conan tool_requires', 'dependenciesConanToolRequires', manifest.dependencies.conan.toolRequires)}
  ${area('Conan options', 'dependenciesConanOptions', manifest.dependencies.conan.options, true)}
  ${area('Additional Conan arguments', 'dependenciesConanArguments', manifest.dependencies.conan.additionalArguments, true)}
</div><div class="checks">${check('dependenciesConanEnabled', 'Enable Conan 2', manifest.dependencies.conan.enabled)}${check('dependenciesConanBuildMissing', 'Build missing packages', manifest.dependencies.conan.buildMissing)}</div>
<h3 style="margin-top:18px">pkg-config / pkgconf</h3><div class="fields">
  ${field('pkg-config executable', 'dependenciesPkgConfigExecutable', manifest.dependencies.pkgConfig.executable, true)}
  ${area('pkg-config packages', 'dependenciesPkgConfigPackages', manifest.dependencies.pkgConfig.packages, true)}
  ${area('PKG_CONFIG_PATH additions', 'dependenciesPkgConfigSearchPaths', manifest.dependencies.pkgConfig.searchPaths)}
  ${area('Additional pkg-config arguments', 'dependenciesPkgConfigArguments', manifest.dependencies.pkgConfig.additionalArguments, true)}
</div><div class="checks">${check('dependenciesPkgConfigEnabled', 'Enable pkg-config', manifest.dependencies.pkgConfig.enabled)}${check('dependenciesPkgConfigStatic', 'Request static pkg-config flags', manifest.dependencies.pkgConfig.staticLink)}</div>
<div class="actions"><button class="secondary" data-command="qpm.dependencies.detectTools">Detect tools</button><button class="secondary" data-command="qpm.dependencies.generateManifests">Generate manifests</button><button class="secondary" data-command="qpm.dependencies.install">Install / synchronize</button><button class="secondary" data-command="qpm.dependencies.openReport">Open report</button><button class="secondary" data-command="qpm.dependencies.revealOutput">Reveal output</button></div></section>
<section id="section-python" data-settings-section class="card wide"><h2>${sectionHeading('python', 'Qt for Python / PySide6')}</h2>
<p class="muted">Official Qt for Python workflow using PySide6, a project-local Python environment, pyside6-project, Designer and deployment tools.</p>
<h3>Python environment</h3><div class="fields">
  ${field('Python interpreter', 'pythonInterpreter', manifest.python.interpreter, true)}
  ${field('Virtual environment', 'pythonVirtualEnvironment', manifest.python.virtualEnvironment)}
  ${field('PySide6 version (optional exact version)', 'pythonPySideVersion', manifest.python.pySideVersion)}
  ${field('Python project file', 'pythonProjectFile', manifest.python.projectFile)}
  ${field('Entry point', 'pythonEntryPoint', manifest.python.entryPoint)}
  ${selectField('Qt Designer UI mode', 'pythonUiMode', pythonUiModeOptions(manifest.python.uiMode))}
  ${field('Environment (NAME=value;OTHER=value)', 'pythonEnvironment', Object.entries(manifest.python.environment).map(([key, value]) => `${key}=${value}`).join(';'), true)}
</div><div class="checks">${check('pythonEnabled', 'Enable Qt for Python backend', manifest.python.enabled)}${check('pythonAutoCreateVirtualEnvironment', 'Automatically create project virtual environment', manifest.python.autoCreateVirtualEnvironment)}${check('pythonAutoInstallPySide6', 'Automatically install PySide6 when missing', manifest.python.autoInstallPySide6)}${check('pythonBuildBeforeRun', 'Build before run', manifest.python.buildBeforeRun)}${check('pythonDeployEnabled', 'Enable desktop deployment', manifest.python.deployEnabled)}${check('pythonAndroidDeployEnabled', 'Enable Android deployment', manifest.python.androidDeployEnabled)}</div>
<h3 style="margin-top:18px">PySide6 tool overrides</h3><div class="fields">
  ${field('pyside6-project', 'pythonToolProject', manifest.python.toolOverrides.project, true)}
  ${field('pyside6-designer', 'pythonToolDesigner', manifest.python.toolOverrides.designer, true)}
  ${field('pyside6-uic', 'pythonToolUic', manifest.python.toolOverrides.uic, true)}
  ${field('pyside6-rcc', 'pythonToolRcc', manifest.python.toolOverrides.rcc, true)}
  ${field('pyside6-deploy', 'pythonToolDeploy', manifest.python.toolOverrides.deploy, true)}
  ${field('pyside6-android-deploy', 'pythonToolAndroidDeploy', manifest.python.toolOverrides.androidDeploy, true)}
  ${field('pyside6-linguist', 'pythonToolLinguist', manifest.python.toolOverrides.linguist, true)}
  ${field('pyside6-lupdate', 'pythonToolLupdate', manifest.python.toolOverrides.lupdate, true)}
  ${field('pyside6-lrelease', 'pythonToolLrelease', manifest.python.toolOverrides.lrelease, true)}
  ${field('pyside6-qmllint', 'pythonToolQmllint', manifest.python.toolOverrides.qmllint, true)}
  ${field('Deployment specification', 'pythonDeploySpecFile', manifest.python.deploySpecFile)}
  ${area('Additional pyside6-project arguments', 'pythonProjectArguments', manifest.python.additionalProjectArguments, true)}
  ${area('Additional deployment arguments', 'pythonDeployArguments', manifest.python.additionalDeployArguments, true)}
</div><div class="actions"><button class="secondary" data-command="qpm.python.bootstrap">Prepare environment</button><button class="secondary" data-command="qpm.python.selectInterpreter">Select interpreter</button><button class="secondary" data-command="qpm.python.createVirtualEnvironment">Create venv</button><button class="secondary" data-command="qpm.python.installPySide6">Install PySide6</button><button class="secondary" data-command="qpm.python.build">Build</button><button class="secondary" data-command="qpm.python.run">Run</button><button class="secondary" data-command="qpm.python.debug">Debug</button><button class="secondary" data-command="qpm.python.openDesigner">Designer</button><button class="secondary" data-command="qpm.python.deploy">Deploy</button><button class="secondary" data-command="qpm.python.openReport">Open report</button></div></section>
<section id="section-qml-language" data-settings-section class="card wide"><h2>${sectionHeading('qml-language', 'QML language and modules')}</h2>
<p class="muted">Project-scoped QML code intelligence powered by qmlls, with explicit build/import directories and duplicate-server protection.</p>
<h3>QML Language Server</h3><div class="fields">
  ${field('qmlls executable override', 'qmlLanguageServerExecutable', manifest.qml.languageServer.executable, true)}
  ${selectField('LSP trace level', 'qmlLanguageServerTrace', qmlLanguageTraceOptions(manifest.qml.languageServer.trace))}
  ${selectField('Official extension conflict policy', 'qmlLanguageServerConflictPolicy', qmlLanguageConflictOptions(manifest.qml.languageServer.conflictPolicy))}
  ${numberField('CMake jobs', 'qmlLanguageServerCmakeJobs', manifest.qml.languageServer.cmakeJobs)}
  ${numberField('Maximum files to search', 'qmlLanguageServerMaxFiles', manifest.qml.languageServer.maxFilesToSearch)}
  ${area('Additional build directories', 'qmlLanguageServerBuildDirectories', manifest.qml.languageServer.buildDirectories)}
  ${area('Additional QML import paths', 'qmlLanguageServerImportPaths', manifest.qml.languageServer.importPaths)}
  ${area('Additional qmlls arguments', 'qmlLanguageServerArguments', manifest.qml.languageServer.additionalArguments, true)}
</div><div class="checks">${check('qmlLanguageServerEnabled', 'Enable QML Language Server', manifest.qml.languageServer.enabled)}${check('qmlLanguageServerAutoStart', 'Start automatically', manifest.qml.languageServer.autoStart)}${check('qmlLanguageServerUseEnvironment', 'Read QML import-path environment', manifest.qml.languageServer.useQmlImportPathEnvironment)}${check('qmlLanguageServerNoCmakeCalls', 'Disable qmlls CMake calls', manifest.qml.languageServer.noCmakeCalls)}${check('qmlLanguageServerVerbose', 'Verbose server output', manifest.qml.languageServer.verboseOutput)}${check('qmlLanguageServerGenerateConfig', 'Maintain .qmlls.ini', manifest.qml.languageServer.generateConfigurationFile)}</div>
<h3 style="margin-top:18px">QML module metadata</h3><div class="fields">
  ${field('Module URI', 'qmlModuleUri', manifest.qml.module.uri, true)}
  ${field('Module version', 'qmlModuleVersion', manifest.qml.module.version)}
  ${field('Module import root', 'qmlModuleImportRoot', manifest.qml.module.importRoot)}
  ${field('Resource prefix', 'qmlModuleResourcePrefix', manifest.qml.module.resourcePrefix, true)}
</div><div class="actions"><button class="secondary" data-command="qpm.startQmlLanguageServer">Start qmlls</button><button class="secondary" data-command="qpm.restartQmlLanguageServer">Restart qmlls</button><button class="secondary" data-command="qpm.stopQmlLanguageServer">Stop qmlls</button><button class="secondary" data-command="qpm.generateQmllsConfiguration">Generate .qmlls.ini</button><button class="secondary" data-command="qpm.openQmllsConfiguration">Open .qmlls.ini</button><button class="secondary" data-command="qpm.generateQmldir">Generate qmldir</button><button class="secondary" data-command="qpm.openQmlLanguageReport">Open report</button></div></section>
<section id="section-profiling" data-settings-section class="card wide"><h2>${sectionHeading('profiling', 'Profiling and diagnostics')}</h2><div class="fields">
  ${field('Profiling output directory', 'profilingOutputDirectory', manifest.profiling.outputDirectory)}
  ${numberField('Profiler timeout (ms)', 'profilingTimeoutMs', manifest.profiling.timeoutMs)}
  ${area('Application arguments for profiling', 'profilingArguments', manifest.profiling.arguments)}
  ${field('Profiling environment (NAME=value;OTHER=value)', 'profilingEnvironment', Object.entries(manifest.profiling.environment).map(([key, value]) => `${key}=${value}`).join(';'), true)}
</div><div class="checks">${check('profilingBuildBeforeRun', 'Build before profiling', manifest.profiling.buildBeforeRun)}</div>
<h3 style="margin-top:18px">QML Profiler</h3><div class="fields">
  ${field('QML profiler host', 'profilingQmlHost', manifest.profiling.qml.host)}
  ${numberField('QML profiler port', 'profilingQmlPort', manifest.profiling.qml.port)}
  ${field('QML profiler services', 'profilingQmlServices', manifest.profiling.qml.services, true)}
  ${field('QML trace output file', 'profilingQmlOutputFile', manifest.profiling.qml.outputFile)}
  ${field('qmlprofiler executable override', 'profilingQmlProfilerPath', manifest.profiling.qml.profilerPath, true)}
</div><div class="checks">${check('profilingQmlEnabled', 'Enable QML profiling', manifest.profiling.qml.enabled)}</div>
<h3 style="margin-top:18px">CPU profiling</h3><div class="fields">
  ${selectField('CPU profiler', 'profilingCpuTool', cpuProfilerOptions(manifest.profiling.cpu.tool))}
  ${numberField('perf sampling frequency', 'profilingCpuFrequency', manifest.profiling.cpu.samplingFrequency)}
  ${field('CPU profile output name', 'profilingCpuOutputFile', manifest.profiling.cpu.outputFile)}
</div><div class="checks">${check('profilingCallgrindCache', 'Callgrind cache simulation', manifest.profiling.cpu.callgrindCacheSimulation)}${check('profilingCallgrindBranch', 'Callgrind branch simulation', manifest.profiling.cpu.callgrindBranchSimulation)}</div>
<h3 style="margin-top:18px">Memory diagnostics</h3><div class="fields">
  ${selectField('Memory profiler', 'profilingMemoryTool', memoryProfilerOptions(manifest.profiling.memory.tool))}
  ${selectField('Valgrind leak check', 'profilingLeakCheck', leakCheckOptions(manifest.profiling.memory.leakCheck))}
  ${field('Memory report output file', 'profilingMemoryOutputFile', manifest.profiling.memory.outputFile)}
</div><div class="checks">${check('profilingTrackOrigins', 'Track uninitialized-value origins', manifest.profiling.memory.trackOrigins)}${check('profilingShowReachable', 'Show reachable allocations', manifest.profiling.memory.showReachable)}</div>
<h3 style="margin-top:18px">Cppcheck</h3><div class="fields">
  ${field('Cppcheck categories', 'profilingCppcheckChecks', manifest.profiling.cppcheck.checks, true)}
  ${field('Cppcheck suppressions file', 'profilingCppcheckSuppressionsFile', manifest.profiling.cppcheck.suppressionsFile)}
  ${area('Additional Cppcheck arguments', 'profilingCppcheckArguments', manifest.profiling.cppcheck.additionalArguments, true)}
</div><div class="checks">${check('profilingCppcheckEnabled', 'Enable Cppcheck', manifest.profiling.cppcheck.enabled)}${check('profilingCppcheckInconclusive', 'Include inconclusive diagnostics', manifest.profiling.cppcheck.inconclusive)}</div>
<h3 style="margin-top:18px">System tracing</h3><div class="fields">
  ${selectField('Trace tool', 'profilingTraceTool', traceToolOptions(manifest.profiling.tracing.tool))}
  ${field('Trace output file', 'profilingTraceOutputFile', manifest.profiling.tracing.outputFile)}
</div><div class="checks">${check('profilingTraceFollowForks', 'Follow child processes', manifest.profiling.tracing.followForks)}${check('profilingTraceTimestamps', 'Add timestamps', manifest.profiling.tracing.timestamps)}</div>
<div class="actions"><button class="secondary" data-command="qpm.profileQmlApplication">Profile QML</button><button class="secondary" data-command="qpm.profileCpu">Profile CPU</button><button class="secondary" data-command="qpm.profileMemory">Analyze memory</button><button class="secondary" data-command="qpm.runCppcheck">Run Cppcheck</button><button class="secondary" data-command="qpm.traceSystemCalls">Trace system calls</button><button class="secondary" data-command="qpm.openProfilingReport">Open report</button></div></section>
<section id="section-packaging" data-settings-section class="card wide"><h2>${sectionHeading('packaging', 'Packaging and product metadata')}</h2><div class="fields">
  ${field('Product name', 'packagingProductName', manifest.packaging.productName)}
  ${field('Product version', 'packagingProductVersion', manifest.packaging.productVersion)}
  ${field('Company / publisher', 'packagingCompanyName', manifest.packaging.companyName)}
  ${field('Application identifier', 'packagingIdentifier', manifest.packaging.identifier)}
  ${field('Description', 'packagingDescription', manifest.packaging.description, true)}
  ${field('Copyright', 'packagingCopyright', manifest.packaging.copyright, true)}
  ${field('Product icon', 'packagingIcon', manifest.packaging.icon)}
  ${field('License file', 'packagingLicenseFile', manifest.packaging.licenseFile)}
  ${field('README file', 'packagingReadmeFile', manifest.packaging.readmeFile)}
  ${field('Packaging output directory', 'packagingOutputDirectory', manifest.packaging.outputDirectory)}
  ${field('Package name pattern', 'packagingNamePattern', manifest.packaging.packageNamePattern, true)}
  ${selectField('Archive format', 'packagingArchiveFormat', packagingArchiveOptions(manifest.packaging.archiveFormat))}
  ${area('Additional package files', 'packagingExtraFiles', manifest.packaging.extraFiles, true)}
</div><div class="checks">
  ${check('packagingEnabled', 'Enable packaging', manifest.packaging.enabled)}
  ${check('packagingCleanOutput', 'Clean previous staging output', manifest.packaging.cleanOutput)}
  ${check('packagingBuildBefore', 'Build before packaging', manifest.packaging.buildBeforePackaging)}
  ${check('packagingQtRuntime', 'Include Qt runtime and plugins', manifest.packaging.includeQtRuntime)}
  ${check('packagingTranslations', 'Include application translations', manifest.packaging.includeTranslations)}
  ${check('packagingDebugSymbols', 'Include debug symbols', manifest.packaging.includeDebugSymbols)}
</div><h3 style="margin-top:18px">Windows metadata</h3><div class="fields">
  ${field('File description', 'packagingFileDescription', manifest.packaging.windows.fileDescription)}
  ${field('Internal name', 'packagingInternalName', manifest.packaging.windows.internalName)}
  ${field('Original filename', 'packagingOriginalFilename', manifest.packaging.windows.originalFilename)}
  ${selectField('Execution level', 'packagingExecutionLevel', packagingExecutionLevelOptions(manifest.packaging.windows.executionLevel))}
  ${selectField('DPI awareness', 'packagingDpiAwareness', packagingDpiOptions(manifest.packaging.windows.dpiAwareness))}
  ${field('Custom Windows manifest', 'packagingWindowsManifestFile', manifest.packaging.windows.manifestFile)}
  ${field('windres override', 'packagingResourceCompilerPath', manifest.packaging.windows.resourceCompilerPath, true)}
</div><div class="checks">${check('packagingEmbedVersion', 'Embed Windows version resource and manifest', manifest.packaging.windows.embedVersionResource)}</div>
<h3 style="margin-top:18px">Linux metadata</h3><div class="fields">
  ${field('Application ID', 'packagingLinuxAppId', manifest.packaging.linux.appId)}
  ${field('Desktop comment', 'packagingLinuxComment', manifest.packaging.linux.comment)}
  ${field('Install prefix', 'packagingInstallPrefix', manifest.packaging.linux.installPrefix)}
  ${area('Desktop categories', 'packagingCategories', manifest.packaging.linux.categories)}
</div><div class="checks">${check('packagingLinuxDesktop', 'Generate Linux desktop entry', manifest.packaging.linux.generateDesktopEntry)}</div>
<div class="actions"><button class="secondary" data-command="qpm.generateProductMetadata">Generate metadata</button><button class="secondary" data-command="qpm.createPortablePackage">Create portable package</button><button class="secondary" data-command="qpm.openPackagingReport">Open report</button><button class="secondary" data-command="qpm.cleanPackagingOutput">Clean output</button></div></section>
<section id="section-installers" data-settings-section class="card wide"><h2>${sectionHeading('installers', 'Desktop installers, updates and signing')}</h2><div class="fields">
  ${selectField('Installer backend', 'installerBackend', installerBackendOptions(manifest.packaging.installer.backend))}
  ${field('Installer output directory', 'installerOutputDirectory', manifest.packaging.installer.outputDirectory)}
  ${field('Installer filename pattern', 'installerFileNamePattern', manifest.packaging.installer.fileNamePattern, true)}
  ${field('Installation directory name', 'installerInstallDirectoryName', manifest.packaging.installer.installDirectoryName)}
</div><div class="checks">
  ${check('installerEnabled', 'Enable desktop installers', manifest.packaging.installer.enabled)}
  ${check('installerBuildPortablePackage', 'Rebuild portable package before installer', manifest.packaging.installer.buildPortablePackage)}
  ${check('installerDesktopShortcut', 'Create desktop shortcut', manifest.packaging.installer.createDesktopShortcut)}
  ${check('installerStartMenuShortcut', 'Create Start menu shortcut', manifest.packaging.installer.createStartMenuShortcut)}
  ${check('installerRunAfterInstall', 'Offer to run application after installation', manifest.packaging.installer.runAfterInstall)}
</div><h3 style="margin-top:18px">Qt Installer Framework</h3><div class="fields">
  ${selectField('Installer mode', 'installerQtIfwMode', qtIfwModeOptions(manifest.packaging.installer.qtIfw.mode))}
  ${field('binarycreator override', 'installerQtIfwBinaryCreatorPath', manifest.packaging.installer.qtIfw.binaryCreatorPath)}
  ${field('repogen override', 'installerQtIfwRepogenPath', manifest.packaging.installer.qtIfw.repogenPath)}
  ${field('installerbase override', 'installerQtIfwInstallerBasePath', manifest.packaging.installer.qtIfw.installerBasePath)}
  ${field('Component ID', 'installerQtIfwComponentId', manifest.packaging.installer.qtIfw.componentId)}
  ${field('Component display name', 'installerQtIfwComponentDisplayName', manifest.packaging.installer.qtIfw.componentDisplayName)}
  ${field('Component description', 'installerQtIfwComponentDescription', manifest.packaging.installer.qtIfw.componentDescription, true)}
  ${field('Release date (YYYY-MM-DD)', 'installerQtIfwReleaseDate', manifest.packaging.installer.qtIfw.releaseDate)}
  ${field('Repository URL', 'installerQtIfwRepositoryUrl', manifest.packaging.installer.qtIfw.repositoryUrl)}
  ${field('Repository output directory', 'installerQtIfwRepositoryOutputDirectory', manifest.packaging.installer.qtIfw.repositoryOutputDirectory)}
  ${field('Maintenance tool name', 'installerQtIfwMaintenanceToolName', manifest.packaging.installer.qtIfw.maintenanceToolName)}
  ${selectField('Wizard style', 'installerQtIfwWizardStyle', qtIfwWizardOptions(manifest.packaging.installer.qtIfw.wizardStyle))}
  ${field('Controller script', 'installerQtIfwControlScript', manifest.packaging.installer.qtIfw.controlScript)}
  ${field('Component script', 'installerQtIfwComponentScript', manifest.packaging.installer.qtIfw.componentScript)}
  ${selectField('Archive format', 'installerQtIfwArchiveFormat', qtIfwArchiveOptions(manifest.packaging.installer.qtIfw.archiveFormat))}
  ${field('Compression level (0-9)', 'installerQtIfwCompression', String(manifest.packaging.installer.qtIfw.compression))}
  ${area('Additional binarycreator arguments', 'installerQtIfwArguments', manifest.packaging.installer.qtIfw.additionalArguments, true)}
</div><h3 style="margin-top:18px">Inno Setup</h3><div class="fields">
  ${field('ISCC compiler override', 'installerInnoIsccPath', manifest.packaging.installer.inno.isccPath)}
  ${field('Custom .iss script', 'installerInnoScriptFile', manifest.packaging.installer.inno.scriptFile)}
  ${selectField('Privileges', 'installerInnoPrivileges', innoPrivilegeOptions(manifest.packaging.installer.inno.privilegesRequired))}
  ${selectField('Architecture', 'installerInnoArchitecture', innoArchitectureOptions(manifest.packaging.installer.inno.architecture))}
  ${field('Compression', 'installerInnoCompression', manifest.packaging.installer.inno.compression)}
  ${area('Languages', 'installerInnoLanguages', manifest.packaging.installer.inno.languages)}
  ${area('Additional directives', 'installerInnoDirectives', manifest.packaging.installer.inno.additionalDirectives, true)}
</div><div class="checks">${check('installerInnoSolidCompression', 'Enable solid compression', manifest.packaging.installer.inno.solidCompression)}</div>
<h3 style="margin-top:18px">NSIS</h3><div class="fields">
  ${field('makensis override', 'installerNsisMakensisPath', manifest.packaging.installer.nsis.makensisPath)}
  ${field('Custom .nsi script', 'installerNsisScriptFile', manifest.packaging.installer.nsis.scriptFile)}
  ${selectField('Execution level', 'installerNsisExecutionLevel', nsisExecutionOptions(manifest.packaging.installer.nsis.requestExecutionLevel))}
  ${selectField('Compressor', 'installerNsisCompressor', nsisCompressorOptions(manifest.packaging.installer.nsis.compressor))}
  ${area('Additional defines', 'installerNsisDefines', manifest.packaging.installer.nsis.additionalDefines, true)}
</div><h3 style="margin-top:18px">Authenticode / SignTool</h3><div class="fields">
  ${field('SignTool override', 'installerSignToolPath', manifest.packaging.installer.signing.signToolPath)}
  ${field('PFX certificate', 'installerCertificateFile', manifest.packaging.installer.signing.certificateFile)}
  ${field('Certificate thumbprint', 'installerCertificateThumbprint', manifest.packaging.installer.signing.certificateThumbprint)}
  ${field('Certificate subject', 'installerCertificateSubject', manifest.packaging.installer.signing.certificateSubject)}
  ${field('PFX password environment variable', 'installerCertificatePasswordEnvironment', manifest.packaging.installer.signing.certificatePasswordEnvironment)}
  ${field('Timestamp URL', 'installerTimestampUrl', manifest.packaging.installer.signing.timestampUrl)}
  ${selectField('File digest', 'installerFileDigest', signingDigestOptions(manifest.packaging.installer.signing.fileDigest))}
  ${selectField('Timestamp digest', 'installerTimestampDigest', signingDigestOptions(manifest.packaging.installer.signing.timestampDigest))}
  ${area('Additional SignTool arguments', 'installerSigningArguments', manifest.packaging.installer.signing.additionalArguments, true)}
</div><div class="checks">
  ${check('installerSigningEnabled', 'Enable Authenticode signing', manifest.packaging.installer.signing.enabled)}
  ${check('installerSignTargetBinary', 'Sign target executable', manifest.packaging.installer.signing.signTargetBinary)}
  ${check('installerSignInstaller', 'Sign final installer', manifest.packaging.installer.signing.signInstaller)}
  ${check('installerVerifyAfterSigning', 'Verify signatures after signing', manifest.packaging.installer.signing.verifyAfterSigning)}
</div><p class="muted">Certificate passwords are read only from the configured environment variable and are never written to .qtproject.json.</p>
<div class="actions"><button class="secondary" data-command="qpm.detectInstallerTools">Detect tools</button><button class="secondary" data-command="qpm.generateInstallerProject">Generate sources</button><button class="secondary" data-command="qpm.createDesktopInstaller">Create installer</button><button class="secondary" data-command="qpm.createQtIfwRepository">Create update repository</button><button class="secondary" data-command="qpm.signDistributionArtifacts">Sign artifacts</button><button class="secondary" data-command="qpm.verifyDistributionSignatures">Verify signatures</button><button class="secondary" data-command="qpm.openInstallerReport">Open report</button></div></section>
<section id="section-publication" data-settings-section class="card wide"><h2>${sectionHeading('publication', 'Publication and application updates')}</h2><div class="fields">
  ${selectField('Release channel', 'publicationChannel', publicationChannelOptions(manifest.publication.channel))}
  ${field('Publication output directory', 'publicationOutputDirectory', manifest.publication.outputDirectory)}
  ${field('Public base URL', 'publicationBaseUrl', manifest.publication.baseUrl, true)}
  ${field('Release notes file', 'publicationReleaseNotesFile', manifest.publication.releaseNotesFile)}
</div><div class="checks">
  ${check('publicationEnabled', 'Enable publication workflows', manifest.publication.enabled)}
  ${check('publicationIncludePortablePackage', 'Include portable package', manifest.publication.includePortablePackage)}
  ${check('publicationIncludeInstaller', 'Include desktop installer', manifest.publication.includeInstaller)}
  ${check('publicationIncludeQtIfwRepository', 'Include Qt IFW update repository', manifest.publication.includeQtIfwRepository)}
  ${check('publicationGenerateChecksums', 'Generate SHA-256 checksums', manifest.publication.generateChecksums)}
  ${check('publicationGenerateLatestManifest', 'Generate latest.json update manifest', manifest.publication.generateLatestManifest)}
</div><h3 style="margin-top:18px">Microsoft MSIX and App Installer</h3><div class="fields">
  ${field('MakeAppx override', 'publicationMsixMakeAppxPath', manifest.publication.msix.makeAppxPath)}
  ${field('Package identity name', 'publicationMsixIdentity', manifest.publication.msix.packageIdentityName)}
  ${field('Publisher subject', 'publicationMsixPublisher', manifest.publication.msix.publisher)}
  ${field('Publisher display name', 'publicationMsixPublisherDisplayName', manifest.publication.msix.publisherDisplayName)}
  ${field('Application display name', 'publicationMsixDisplayName', manifest.publication.msix.displayName)}
  ${field('MSIX description', 'publicationMsixDescription', manifest.publication.msix.description, true)}
  ${field('MSIX version', 'publicationMsixVersion', manifest.publication.msix.version)}
  ${selectField('MSIX architecture', 'publicationMsixArchitecture', msixArchitectureOptions(manifest.publication.msix.architecture))}
  ${field('Minimum Windows version', 'publicationMsixMinimumOsVersion', manifest.publication.msix.minimumOsVersion)}
  ${field('Tested Windows version', 'publicationMsixTargetOsVersion', manifest.publication.msix.targetOsVersion)}
  ${field('44 × 44 logo', 'publicationMsixLogo44', manifest.publication.msix.logo44)}
  ${field('150 × 150 logo', 'publicationMsixLogo150', manifest.publication.msix.logo150)}
  ${field('Store logo', 'publicationMsixStoreLogo', manifest.publication.msix.storeLogo)}
  ${field('MSIX package URI', 'publicationMsixPackageUri', manifest.publication.msix.packageUri, true)}
  ${field('App Installer URI', 'publicationMsixAppInstallerUri', manifest.publication.msix.appInstallerUri, true)}
  ${field('Hours between update checks', 'publicationMsixHoursBetweenChecks', String(manifest.publication.msix.hoursBetweenUpdateChecks))}
</div><div class="checks">
  ${check('publicationMsixEnabled', 'Enable MSIX packaging', manifest.publication.msix.enabled)}
  ${check('publicationMsixSignPackage', 'Sign generated MSIX package', manifest.publication.msix.signPackage)}
  ${check('publicationMsixGenerateAppInstaller', 'Generate .appinstaller file', manifest.publication.msix.generateAppInstaller)}
  ${check('publicationMsixUpdateOnLaunch', 'Check for updates on launch', manifest.publication.msix.updateOnLaunch)}
  ${check('publicationMsixShowPrompt', 'Show update prompt', manifest.publication.msix.showPrompt)}
  ${check('publicationMsixUpdateBlocksActivation', 'Block activation until required update', manifest.publication.msix.updateBlocksActivation)}
  ${check('publicationMsixForceUpdateFromAnyVersion', 'Allow downgrade / force update from any version', manifest.publication.msix.forceUpdateFromAnyVersion)}
  ${check('publicationMsixAutomaticBackgroundTask', 'Enable background update task', manifest.publication.msix.automaticBackgroundTask)}
</div><h3 style="margin-top:18px">WinGet manifests</h3><div class="fields">
  ${field('WinGet CLI override', 'publicationWingetPath', manifest.publication.winget.wingetPath)}
  ${field('WinGetCreate override', 'publicationWingetCreatePath', manifest.publication.winget.wingetCreatePath)}
  ${field('Package identifier', 'publicationWingetIdentifier', manifest.publication.winget.packageIdentifier)}
  ${field('Publisher', 'publicationWingetPublisher', manifest.publication.winget.publisher)}
  ${field('Package name', 'publicationWingetPackageName', manifest.publication.winget.packageName)}
  ${field('Short description', 'publicationWingetDescription', manifest.publication.winget.shortDescription, true)}
  ${field('License', 'publicationWingetLicense', manifest.publication.winget.license)}
  ${field('License URL', 'publicationWingetLicenseUrl', manifest.publication.winget.licenseUrl)}
  ${field('Publisher URL', 'publicationWingetPublisherUrl', manifest.publication.winget.publisherUrl)}
  ${field('Package URL', 'publicationWingetPackageUrl', manifest.publication.winget.packageUrl)}
  ${field('Installer URL', 'publicationWingetInstallerUrl', manifest.publication.winget.installerUrl, true)}
  ${selectField('Installer type', 'publicationWingetInstallerType', wingetInstallerTypeOptions(manifest.publication.winget.installerType))}
  ${selectField('Install scope', 'publicationWingetScope', wingetScopeOptions(manifest.publication.winget.scope))}
  ${field('Locale', 'publicationWingetLocale', manifest.publication.winget.locale)}
  ${area('Tags', 'publicationWingetTags', manifest.publication.winget.tags)}
  ${field('Release notes URL', 'publicationWingetReleaseNotesUrl', manifest.publication.winget.releaseNotesUrl)}
  ${field('Minimum Windows version', 'publicationWingetMinimumOsVersion', manifest.publication.winget.minimumOsVersion)}
</div><div class="checks">${check('publicationWingetEnabled', 'Generate WinGet manifests', manifest.publication.winget.enabled)}</div>
<h3 style="margin-top:18px">GitHub Releases</h3><div class="fields">
  ${field('GitHub CLI override', 'publicationGithubGhPath', manifest.publication.github.ghPath)}
  ${field('Repository (owner/repository)', 'publicationGithubRepository', manifest.publication.github.repository)}
  ${field('Tag pattern', 'publicationGithubTagPattern', manifest.publication.github.tagPattern)}
  ${field('Release name pattern', 'publicationGithubReleaseNamePattern', manifest.publication.github.releaseNamePattern, true)}
</div><div class="checks">
  ${check('publicationGithubEnabled', 'Enable GitHub release settings', manifest.publication.github.enabled)}
  ${check('publicationGithubDraft', 'Create release as draft', manifest.publication.github.draft)}
  ${check('publicationGithubPrerelease', 'Mark as prerelease', manifest.publication.github.prerelease)}
  ${check('publicationGithubGenerateNotes', 'Generate release notes from GitHub history', manifest.publication.github.generateNotes)}
  ${check('publicationGithubClobberAssets', 'Replace assets on an existing release', manifest.publication.github.clobberAssets)}
</div><h3 style="margin-top:18px">Publication target</h3><div class="fields">
  ${selectField('Target', 'publicationPublishTarget', publicationTargetOptions(manifest.publication.publish.target))}
  ${field('Local destination directory', 'publicationLocalDirectory', manifest.publication.publish.localDirectory)}
  ${field('SSH host', 'publicationSshHost', manifest.publication.publish.sshHost)}
  ${field('SSH user', 'publicationSshUser', manifest.publication.publish.sshUser)}
  ${field('SSH port', 'publicationSshPort', String(manifest.publication.publish.sshPort))}
  ${field('Remote directory', 'publicationSshDirectory', manifest.publication.publish.sshDirectory)}
  ${field('scp override', 'publicationScpPath', manifest.publication.publish.scpPath)}
  ${field('rsync override', 'publicationRsyncPath', manifest.publication.publish.rsyncPath)}
</div><div class="checks">
  ${check('publicationUseRsync', 'Use rsync instead of scp', manifest.publication.publish.useRsync)}
  ${check('publicationDeleteRemote', 'Delete obsolete remote files with rsync', manifest.publication.publish.deleteRemote)}
</div><p class="muted">QPM stores no GitHub token, SSH password or certificate password. Authentication remains delegated to gh, SSH keys and the configured certificate environment variable.</p>
<div class="actions"><button class="secondary" data-command="qpm.detectPublicationTools">Detect tools</button><button class="secondary" data-command="qpm.generatePublicationSources">Generate sources</button><button class="secondary" data-command="qpm.createMsixPackage">Create MSIX</button><button class="secondary" data-command="qpm.generateAppInstaller">Generate App Installer</button><button class="secondary" data-command="qpm.generateWingetManifests">Generate WinGet</button><button class="secondary" data-command="qpm.validateWingetManifests">Validate WinGet</button><button class="secondary" data-command="qpm.createReleaseBundle">Create release bundle</button><button class="secondary" data-command="qpm.publishRelease">Publish release</button><button class="secondary" data-command="qpm.openPublicationReport">Open report</button></div></section>
<section id="section-build-steps" data-settings-section class="card wide"><h2>${sectionHeading('steps', 'Build steps')}</h2><div class="fields">
  ${area('Pre-build actions', 'preBuildActions', projectSettings.preBuildActions)}
  ${area('Custom build actions', 'customBuildActions', projectSettings.customBuildActions)}
  ${area('Post-build actions', 'postBuildActions', projectSettings.postBuildActions, true)}
</div><p class="muted">One command per line. These actions run around the selected Direct, qmake or CMake backend.</p></section>
<section id="section-files" data-settings-section class="card wide"><h2>${sectionHeading('files', 'Manifest file summary')}</h2><div class="stats">
  ${pill('Sources', counts.sources.length)}${pill('Headers', counts.headers.length)}${pill('Forms', counts.forms.length)}${pill('Resources', counts.resources.length)}${pill('QML', counts.qml.length)}${pill('Translations', counts.translations.length)}${pill('Other', counts.other.length)}
</div><p class="muted" style="margin-top:10px">Files are managed from the project tree with “Add Existing File” and the Qt creation templates.</p></section>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const byId = (id) => document.getElementById(id);
const on = (id, event, handler) => { const element = byId(id); if (element) element.addEventListener(event, handler); };
const post = (type) => () => vscode.postMessage({ type });
on('variant', 'change', () => vscode.postMessage({ type:'changeVariant', variant:byId('variant').value }));
['manageProfiles','manageProfilesControl'].forEach((id) => on(id, 'click', post('manageProfiles')));
['manageDebugProfiles','manageDebugProfilesInline'].forEach((id) => on(id, 'click', post('manageDebugProfiles')));
['managePlatformProfiles','managePlatformProfilesInline','managePlatformProfilesControl'].forEach((id) => on(id, 'click', post('managePlatformProfiles')));
['manageNamedKits','manageNamedKitsControl'].forEach((id) => on(id, 'click', post('manageNamedKits')));
['selectDesigner','selectDesignerControl'].forEach((id) => on(id, 'click', post('selectQtDesigner')));
on('generateLaunchJson', 'click', post('generateLaunchJson'));
on('selectKit', 'click', post('selectQtKit'));
on('repairToolchain', 'click', post('repairQtToolchain'));
on('openManifest', 'click', post('openManifest'));
on('reloadSettings', 'click', post('reload'));
document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ type:'runCommand', command:button.dataset.command })));
document.querySelectorAll('[data-browse-id]').forEach((button) => button.addEventListener('click', () => {
  const target = byId(button.dataset.browseId);
  vscode.postMessage({ type:'browsePath', id:button.dataset.browseId, kind:button.dataset.browseKind, relative:button.dataset.browseRelative === 'true', currentValue:target ? target.value : '' });
}));
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message && message.type === 'pathSelected' && typeof message.id === 'string') {
    const target = byId(message.id);
    if (target) { target.value = message.value || ''; target.dispatchEvent(new Event('input', { bubbles:true })); }
  }
});
const updateConditionalVisibility = () => {
  const platform = byId('platformType') ? byId('platformType').value : 'desktop';
  document.querySelectorAll('[data-platform-types]').forEach((element) => element.classList.toggle('hidden', !element.dataset.platformTypes.split(/\s+/).includes(platform)));
  const request = byId('debugRequest') ? byId('debugRequest').value : 'launch';
  document.querySelectorAll('[data-debug-requests]').forEach((element) => element.classList.toggle('hidden', !element.dataset.debugRequests.split(/\s+/).includes(request)));
  const backend = byId('buildSystem') ? byId('buildSystem').value : 'direct';
  document.querySelectorAll('[data-build-systems]').forEach((element) => element.classList.toggle('hidden', !element.dataset.buildSystems.split(/\s+/).includes(backend)));
  const testFramework = byId('testFramework') ? byId('testFramework').value : 'auto';
  document.querySelectorAll('[data-test-frameworks]').forEach((element) => element.classList.toggle('hidden', !element.dataset.testFrameworks.split(/\s+/).includes(testFramework)));
};
on('platformType', 'change', updateConditionalVisibility);
on('debugRequest', 'change', updateConditionalVisibility);
on('buildSystem', 'change', updateConditionalVisibility);
on('testFramework', 'change', updateConditionalVisibility);
updateConditionalVisibility();
const updateStickyOffsets = () => {
  const stickyHeader = byId('settingsStickyHeader');
  if (!stickyHeader || window.matchMedia('(max-width: 800px)').matches) return;
  const stickyOffset = Math.ceil(stickyHeader.getBoundingClientRect().height + 8);
  document.documentElement.style.setProperty('--qpm-sticky-offset', stickyOffset + 'px');
};
if (typeof ResizeObserver !== 'undefined') {
  const stickyObserver = new ResizeObserver(updateStickyOffsets);
  const stickyHeader = byId('settingsStickyHeader');
  if (stickyHeader) stickyObserver.observe(stickyHeader);
}
window.addEventListener('resize', updateStickyOffsets);
window.requestAnimationFrame(updateStickyOffsets);
on('sectionNav', 'change', () => { const target = byId(byId('sectionNav').value); if (target) target.scrollIntoView({ behavior:'smooth', block:'start' }); });
on('settingsFilter', 'input', () => {
  const query = byId('settingsFilter').value.trim().toLowerCase();
  document.querySelectorAll('[data-settings-section]').forEach((section) => section.classList.toggle('section-hidden', Boolean(query) && !section.textContent.toLowerCase().includes(query)));
});
const dirtyState = byId('dirtyState');
const markDirty = () => { if (dirtyState) { dirtyState.textContent = 'Unsaved changes'; dirtyState.classList.add('changed'); } };
document.querySelectorAll('input,select,textarea').forEach((element) => {
  if (!['variant','settingsFilter','sectionNav'].includes(element.id)) { element.addEventListener('input', markDirty); element.addEventListener('change', markDirty); }
});
on('save', 'click', () => {
  const value = (id) => byId(id).value;
  const checked = (id) => byId(id).checked;
  vscode.postMessage({
    type:'save',
    name:value('name'), targetName:value('targetName'), kind:value('kind'), cppStandard:value('cppStandard'), buildArchitecture:value('buildArchitecture'), buildSystem:value('buildSystem'), parallelJobs:value('parallelJobs'),
    outputDirectory:value('outputDirectory'), generatedDirectory:value('generatedDirectory'), majorVersion:value('majorVersion'),
    autoMoc:checked('autoMoc'), autoUic:checked('autoUic'), autoRcc:checked('autoRcc'), generateProjectFiles:checked('generateProjectFiles'), unityBuild:checked('unityBuild'), useResponseFiles:checked('useResponseFiles'), autoDeploy:checked('autoDeploy'), deployTranslations:checked('deployTranslations'),
    modules:[...document.querySelectorAll('input[name="qtModule"]:checked')].map((input) => input.value),
    defines:value('defines'), includeDirectories:value('includeDirectories'), libraryDirectories:value('libraryDirectories'), libraries:value('libraries'),
    variantDefines:value('variantDefines'), compilerFlags:value('compilerFlags'), linkerFlags:value('linkerFlags'), sourceDirectory:value('sourceDirectory'), projectFile:value('projectFile'), cmakeConfigurePreset:value('cmakeConfigurePreset'), cmakeBuildPreset:value('cmakeBuildPreset'), precompiledHeader:value('precompiledHeader'), configureArguments:value('configureArguments'), buildArguments:value('buildArguments'), cleanArguments:value('cleanArguments'),
    runArguments:value('runArguments'), workingDirectory:value('workingDirectory'), environmentOptions:value('environmentOptions'), externalProcessPath:value('externalProcessPath'),
    platformName:value('platformName'), platformType:value('platformType'), platformBuildLocation:value('platformBuildLocation'), platformKitId:value('platformKitId'), platformBuildProfileId:value('platformBuildProfileId'), platformRunProfileId:value('platformRunProfileId'), platformDeployProfileId:value('platformDeployProfileId'), platformDebugProfileId:value('platformDebugProfileId'), platformEnvironment:value('platformEnvironment'), platformSysroot:value('platformSysroot'), platformSshHost:value('platformSshHost'), platformSshUser:value('platformSshUser'), platformSshPort:value('platformSshPort'), platformSshExecutable:value('platformSshExecutable'), platformScpExecutable:value('platformScpExecutable'), platformRsyncExecutable:value('platformRsyncExecutable'), platformRemoteProjectDirectory:value('platformRemoteProjectDirectory'), platformRemoteDeployDirectory:value('platformRemoteDeployDirectory'), platformRemoteBuildCommand:value('platformRemoteBuildCommand'), platformRemoteRunCommand:value('platformRemoteRunCommand'), platformUseRsync:checked('platformUseRsync'), platformStartGdbServer:checked('platformStartGdbServer'), platformGdbServerPort:value('platformGdbServerPort'), platformDockerExecutable:value('platformDockerExecutable'), platformDockerImage:value('platformDockerImage'), platformDockerContainerName:value('platformDockerContainerName'), platformDockerWorkspace:value('platformDockerWorkspace'), platformDockerBuildCommand:value('platformDockerBuildCommand'), platformDockerRunCommand:value('platformDockerRunCommand'), platformDockerArguments:value('platformDockerArguments'), platformDockerKeepContainer:checked('platformDockerKeepContainer'), platformDockerForwardDisplay:checked('platformDockerForwardDisplay'), platformDockerHostNetwork:checked('platformDockerHostNetwork'), platformEmsdkRoot:value('platformEmsdkRoot'), platformEmsdkEnvironmentScript:value('platformEmsdkEnvironmentScript'), platformWasmServerExecutable:value('platformWasmServerExecutable'), platformWasmServerPort:value('platformWasmServerPort'), platformWasmHtmlEntry:value('platformWasmHtmlEntry'), platformWasmOpenBrowser:checked('platformWasmOpenBrowser'), platformWasmServerArguments:value('platformWasmServerArguments'), platformAndroidSdkRoot:value('platformAndroidSdkRoot'), platformAndroidNdkRoot:value('platformAndroidNdkRoot'), platformAndroidJdkRoot:value('platformAndroidJdkRoot'), platformAndroidDeployQtPath:value('platformAndroidDeployQtPath'), platformAndroidAdbPath:value('platformAndroidAdbPath'), platformAndroidEmulatorPath:value('platformAndroidEmulatorPath'), platformAndroidAvdManagerPath:value('platformAndroidAvdManagerPath'), platformAndroidSdkManagerPath:value('platformAndroidSdkManagerPath'), platformAndroidAbis:value('platformAndroidAbis'), platformAndroidBuildAllAbis:checked('platformAndroidBuildAllAbis'), platformAndroidCompileSdk:value('platformAndroidCompileSdk'), platformAndroidTargetSdk:value('platformAndroidTargetSdk'), platformAndroidMinSdk:value('platformAndroidMinSdk'), platformAndroidBuildToolsVersion:value('platformAndroidBuildToolsVersion'), platformAndroidPackageName:value('platformAndroidPackageName'), platformAndroidAppName:value('platformAndroidAppName'), platformAndroidVersionCode:value('platformAndroidVersionCode'), platformAndroidVersionName:value('platformAndroidVersionName'), platformAndroidPackageFormat:value('platformAndroidPackageFormat'), platformAndroidDeviceSerial:value('platformAndroidDeviceSerial'), platformAndroidAvdName:value('platformAndroidAvdName'), platformAndroidLogcatFilter:value('platformAndroidLogcatFilter'), platformAndroidInstallReplace:checked('platformAndroidInstallReplace'), platformAndroidUninstallBeforeInstall:checked('platformAndroidUninstallBeforeInstall'), platformAndroidOpenLogcatAfterRun:checked('platformAndroidOpenLogcatAfterRun'), platformAndroidGradleArguments:value('platformAndroidGradleArguments'), platformAndroidCMakeArguments:value('platformAndroidCMakeArguments'), platformAndroidKeystore:value('platformAndroidKeystore'), platformAndroidKeystoreAlias:value('platformAndroidKeystoreAlias'), platformAndroidStorePasswordEnvironment:value('platformAndroidStorePasswordEnvironment'), platformAndroidKeyPasswordEnvironment:value('platformAndroidKeyPasswordEnvironment'), platformAppleDeveloperDirectory:value('platformAppleDeveloperDirectory'), platformAppleXcodebuildPath:value('platformAppleXcodebuildPath'), platformAppleXcrunPath:value('platformAppleXcrunPath'), platformAppleMacDeployQtPath:value('platformAppleMacDeployQtPath'), platformAppleBundleIdentifier:value('platformAppleBundleIdentifier'), platformAppleDeploymentTarget:value('platformAppleDeploymentTarget'), platformAppleArchitectures:value('platformAppleArchitectures'), platformAppleDevelopmentTeam:value('platformAppleDevelopmentTeam'), platformAppleCodeSignIdentity:value('platformAppleCodeSignIdentity'), platformAppleProvisioningProfile:value('platformAppleProvisioningProfile'), platformAppleEntitlementsFile:value('platformAppleEntitlementsFile'), platformAppleAutomaticSigning:checked('platformAppleAutomaticSigning'), platformAppleAllowProvisioningUpdates:checked('platformAppleAllowProvisioningUpdates'), platformAppleScheme:value('platformAppleScheme'), platformAppleConfiguration:value('platformAppleConfiguration'), platformAppleSimulatorId:value('platformAppleSimulatorId'), platformAppleDeviceId:value('platformAppleDeviceId'), platformAppleCreateDmg:checked('platformAppleCreateDmg'), platformAppleDmgFileSystem:value('platformAppleDmgFileSystem'), platformAppleNotaryProfile:value('platformAppleNotaryProfile'), platformAppleStapleAfterNotarization:checked('platformAppleStapleAfterNotarization'), platformAppleAppStoreCompliant:checked('platformAppleAppStoreCompliant'), platformAppleHardenedRuntime:checked('platformAppleHardenedRuntime'), platformAppleTimestamp:checked('platformAppleTimestamp'), platformAppleAdditionalCMakeArguments:value('platformAppleAdditionalCMakeArguments'), platformAppleAdditionalXcodebuildArguments:value('platformAppleAdditionalXcodebuildArguments'), platformAppleAdditionalMacDeployQtArguments:value('platformAppleAdditionalMacDeployQtArguments'),
    debugName:value('debugName'), debugRequest:value('debugRequest'), debuggerType:value('debuggerType'), debugBuildProfileId:value('debugBuildProfileId'), debugRunProfileId:value('debugRunProfileId'), debugProgram:value('debugProgram'), debugArguments:value('debugArguments'), debugWorkingDirectory:value('debugWorkingDirectory'), debugEnvironment:value('debugEnvironment'), debugStopAtEntry:checked('debugStopAtEntry'), debugExternalConsole:checked('debugExternalConsole'), debugProcessId:value('debugProcessId'), debugCoreDumpPath:value('debugCoreDumpPath'), debugRemoteHost:value('debugRemoteHost'), debugRemotePort:value('debugRemotePort'), debugRemoteProgram:value('debugRemoteProgram'), debugRemoteWorkingDirectory:value('debugRemoteWorkingDirectory'), debugSshHost:value('debugSshHost'), debugSshUser:value('debugSshUser'), debugSshPort:value('debugSshPort'), debugSshExecutable:value('debugSshExecutable'), debugStartGdbServerViaSsh:checked('debugStartGdbServerViaSsh'), debugSourceFileMap:value('debugSourceFileMap'), debugSolibPaths:value('debugSolibPaths'), debugSymbolSearchPath:value('debugSymbolSearchPath'), debugSetupCommands:value('debugSetupCommands'), debugPrettyPrinters:checked('debugPrettyPrinters'), debugBreakOnQtWarnings:checked('debugBreakOnQtWarnings'), debugQmlEnabled:checked('debugQmlEnabled'), debugQmlHost:value('debugQmlHost'), debugQmlPort:value('debugQmlPort'), debugQmlBlock:checked('debugQmlBlock'), debugQmlServices:value('debugQmlServices'),
    testFramework:value('testFramework'), testBuildBeforeRun:checked('testBuildBeforeRun'), testTimeoutMs:value('testTimeoutMs'), testArguments:value('testArguments'), testEnvironment:value('testEnvironment'), testOffscreenPlatform:checked('testOffscreenPlatform'), testParallelJobs:value('testParallelJobs'), testStopOnFailure:checked('testStopOnFailure'), testRepeatMode:value('testRepeatMode'), testRepeatCount:value('testRepeatCount'), testHistoryLimit:value('testHistoryLimit'),
    testCtestExecutable:value('testCtestExecutable'), testCtestBuildDirectory:value('testCtestBuildDirectory'), testCtestPreset:value('testCtestPreset'), testCtestConfiguration:value('testCtestConfiguration'), testCtestLabelRegex:value('testCtestLabelRegex'), testCtestNameRegex:value('testCtestNameRegex'), testCtestExcludeRegex:value('testCtestExcludeRegex'), testCtestOutputOnFailure:checked('testCtestOutputOnFailure'),
    testBoostLogLevel:value('testBoostLogLevel'), testBoostReportLevel:value('testBoostReportLevel'), testBoostRandomSeed:value('testBoostRandomSeed'), testBoostCatchSystemErrors:checked('testBoostCatchSystemErrors'),
    clangTidyChecks:value('clangTidyChecks'), clazyChecks:value('clazyChecks'), qualityHeaderFilter:value('qualityHeaderFilter'),
    profilingOutputDirectory:value('profilingOutputDirectory'), profilingBuildBeforeRun:checked('profilingBuildBeforeRun'), profilingTimeoutMs:value('profilingTimeoutMs'), profilingArguments:value('profilingArguments'), profilingEnvironment:value('profilingEnvironment'), profilingQmlEnabled:checked('profilingQmlEnabled'), profilingQmlHost:value('profilingQmlHost'), profilingQmlPort:value('profilingQmlPort'), profilingQmlServices:value('profilingQmlServices'), profilingQmlOutputFile:value('profilingQmlOutputFile'), profilingQmlProfilerPath:value('profilingQmlProfilerPath'), profilingCpuTool:value('profilingCpuTool'), profilingCpuFrequency:value('profilingCpuFrequency'), profilingCpuOutputFile:value('profilingCpuOutputFile'), profilingCallgrindCache:checked('profilingCallgrindCache'), profilingCallgrindBranch:checked('profilingCallgrindBranch'), profilingMemoryTool:value('profilingMemoryTool'), profilingLeakCheck:value('profilingLeakCheck'), profilingMemoryOutputFile:value('profilingMemoryOutputFile'), profilingTrackOrigins:checked('profilingTrackOrigins'), profilingShowReachable:checked('profilingShowReachable'), profilingCppcheckEnabled:checked('profilingCppcheckEnabled'), profilingCppcheckChecks:value('profilingCppcheckChecks'), profilingCppcheckInconclusive:checked('profilingCppcheckInconclusive'), profilingCppcheckSuppressionsFile:value('profilingCppcheckSuppressionsFile'), profilingCppcheckArguments:value('profilingCppcheckArguments'), profilingTraceTool:value('profilingTraceTool'), profilingTraceFollowForks:checked('profilingTraceFollowForks'), profilingTraceTimestamps:checked('profilingTraceTimestamps'), profilingTraceOutputFile:value('profilingTraceOutputFile'),

    dependenciesEnabled:checked('dependenciesEnabled'), dependenciesAutoInstall:checked('dependenciesAutoInstall'), dependenciesOutputDirectory:value('dependenciesOutputDirectory'), dependenciesCmakeFindPackages:value('dependenciesCmakeFindPackages'), dependenciesCmakeLinkTargets:value('dependenciesCmakeLinkTargets'), dependenciesIncludeDirectories:value('dependenciesIncludeDirectories'), dependenciesLibraryDirectories:value('dependenciesLibraryDirectories'), dependenciesLibraries:value('dependenciesLibraries'),
    dependenciesVcpkgEnabled:checked('dependenciesVcpkgEnabled'), dependenciesVcpkgExecutable:value('dependenciesVcpkgExecutable'), dependenciesVcpkgRoot:value('dependenciesVcpkgRoot'), dependenciesVcpkgManifestFile:value('dependenciesVcpkgManifestFile'), dependenciesVcpkgInstallRoot:value('dependenciesVcpkgInstallRoot'), dependenciesVcpkgTriplet:value('dependenciesVcpkgTriplet'), dependenciesVcpkgHostTriplet:value('dependenciesVcpkgHostTriplet'), dependenciesVcpkgBaseline:value('dependenciesVcpkgBaseline'), dependenciesVcpkgPackages:value('dependenciesVcpkgPackages'), dependenciesVcpkgOverlayPorts:value('dependenciesVcpkgOverlayPorts'), dependenciesVcpkgOverlayTriplets:value('dependenciesVcpkgOverlayTriplets'), dependenciesVcpkgArguments:value('dependenciesVcpkgArguments'),
    dependenciesConanEnabled:checked('dependenciesConanEnabled'), dependenciesConanExecutable:value('dependenciesConanExecutable'), dependenciesConanManifestFile:value('dependenciesConanManifestFile'), dependenciesConanOutputDirectory:value('dependenciesConanOutputDirectory'), dependenciesConanProfileHost:value('dependenciesConanProfileHost'), dependenciesConanProfileBuild:value('dependenciesConanProfileBuild'), dependenciesConanLockfile:value('dependenciesConanLockfile'), dependenciesConanRequires:value('dependenciesConanRequires'), dependenciesConanToolRequires:value('dependenciesConanToolRequires'), dependenciesConanOptions:value('dependenciesConanOptions'), dependenciesConanArguments:value('dependenciesConanArguments'), dependenciesConanBuildMissing:checked('dependenciesConanBuildMissing'),
    dependenciesPkgConfigEnabled:checked('dependenciesPkgConfigEnabled'), dependenciesPkgConfigExecutable:value('dependenciesPkgConfigExecutable'), dependenciesPkgConfigPackages:value('dependenciesPkgConfigPackages'), dependenciesPkgConfigSearchPaths:value('dependenciesPkgConfigSearchPaths'), dependenciesPkgConfigArguments:value('dependenciesPkgConfigArguments'), dependenciesPkgConfigStatic:checked('dependenciesPkgConfigStatic'),
    pythonEnabled:checked('pythonEnabled'), pythonInterpreter:value('pythonInterpreter'), pythonVirtualEnvironment:value('pythonVirtualEnvironment'), pythonAutoCreateVirtualEnvironment:checked('pythonAutoCreateVirtualEnvironment'), pythonAutoInstallPySide6:checked('pythonAutoInstallPySide6'), pythonPySideVersion:value('pythonPySideVersion'), pythonProjectFile:value('pythonProjectFile'), pythonEntryPoint:value('pythonEntryPoint'), pythonUiMode:value('pythonUiMode'), pythonBuildBeforeRun:checked('pythonBuildBeforeRun'), pythonDeployEnabled:checked('pythonDeployEnabled'), pythonDeploySpecFile:value('pythonDeploySpecFile'), pythonAndroidDeployEnabled:checked('pythonAndroidDeployEnabled'), pythonToolProject:value('pythonToolProject'), pythonToolDesigner:value('pythonToolDesigner'), pythonToolUic:value('pythonToolUic'), pythonToolRcc:value('pythonToolRcc'), pythonToolDeploy:value('pythonToolDeploy'), pythonToolAndroidDeploy:value('pythonToolAndroidDeploy'), pythonToolLinguist:value('pythonToolLinguist'), pythonToolLupdate:value('pythonToolLupdate'), pythonToolLrelease:value('pythonToolLrelease'), pythonToolQmllint:value('pythonToolQmllint'), pythonProjectArguments:value('pythonProjectArguments'), pythonDeployArguments:value('pythonDeployArguments'), pythonEnvironment:value('pythonEnvironment'),
    qmlLanguageServerEnabled:checked('qmlLanguageServerEnabled'), qmlLanguageServerAutoStart:checked('qmlLanguageServerAutoStart'), qmlLanguageServerExecutable:value('qmlLanguageServerExecutable'), qmlLanguageServerBuildDirectories:value('qmlLanguageServerBuildDirectories'), qmlLanguageServerImportPaths:value('qmlLanguageServerImportPaths'), qmlLanguageServerUseEnvironment:checked('qmlLanguageServerUseEnvironment'), qmlLanguageServerNoCmakeCalls:checked('qmlLanguageServerNoCmakeCalls'), qmlLanguageServerCmakeJobs:value('qmlLanguageServerCmakeJobs'), qmlLanguageServerMaxFiles:value('qmlLanguageServerMaxFiles'), qmlLanguageServerTrace:value('qmlLanguageServerTrace'), qmlLanguageServerVerbose:checked('qmlLanguageServerVerbose'), qmlLanguageServerConflictPolicy:value('qmlLanguageServerConflictPolicy'), qmlLanguageServerGenerateConfig:checked('qmlLanguageServerGenerateConfig'), qmlLanguageServerArguments:value('qmlLanguageServerArguments'), qmlModuleUri:value('qmlModuleUri'), qmlModuleVersion:value('qmlModuleVersion'), qmlModuleImportRoot:value('qmlModuleImportRoot'), qmlModuleResourcePrefix:value('qmlModuleResourcePrefix'),

    packagingEnabled:checked('packagingEnabled'), packagingProductName:value('packagingProductName'), packagingProductVersion:value('packagingProductVersion'), packagingCompanyName:value('packagingCompanyName'), packagingDescription:value('packagingDescription'), packagingCopyright:value('packagingCopyright'), packagingIdentifier:value('packagingIdentifier'), packagingIcon:value('packagingIcon'), packagingLicenseFile:value('packagingLicenseFile'), packagingReadmeFile:value('packagingReadmeFile'), packagingOutputDirectory:value('packagingOutputDirectory'), packagingNamePattern:value('packagingNamePattern'), packagingArchiveFormat:value('packagingArchiveFormat'), packagingExtraFiles:value('packagingExtraFiles'), packagingCleanOutput:checked('packagingCleanOutput'), packagingBuildBefore:checked('packagingBuildBefore'), packagingQtRuntime:checked('packagingQtRuntime'), packagingTranslations:checked('packagingTranslations'), packagingDebugSymbols:checked('packagingDebugSymbols'), packagingEmbedVersion:checked('packagingEmbedVersion'), packagingFileDescription:value('packagingFileDescription'), packagingInternalName:value('packagingInternalName'), packagingOriginalFilename:value('packagingOriginalFilename'), packagingExecutionLevel:value('packagingExecutionLevel'), packagingDpiAwareness:value('packagingDpiAwareness'), packagingWindowsManifestFile:value('packagingWindowsManifestFile'), packagingResourceCompilerPath:value('packagingResourceCompilerPath'), packagingLinuxDesktop:checked('packagingLinuxDesktop'), packagingLinuxAppId:value('packagingLinuxAppId'), packagingCategories:value('packagingCategories'), packagingLinuxComment:value('packagingLinuxComment'), packagingInstallPrefix:value('packagingInstallPrefix'),
    installerEnabled:checked('installerEnabled'), installerBackend:value('installerBackend'), installerBuildPortablePackage:checked('installerBuildPortablePackage'), installerOutputDirectory:value('installerOutputDirectory'), installerFileNamePattern:value('installerFileNamePattern'), installerInstallDirectoryName:value('installerInstallDirectoryName'), installerDesktopShortcut:checked('installerDesktopShortcut'), installerStartMenuShortcut:checked('installerStartMenuShortcut'), installerRunAfterInstall:checked('installerRunAfterInstall'), installerQtIfwMode:value('installerQtIfwMode'), installerQtIfwBinaryCreatorPath:value('installerQtIfwBinaryCreatorPath'), installerQtIfwRepogenPath:value('installerQtIfwRepogenPath'), installerQtIfwInstallerBasePath:value('installerQtIfwInstallerBasePath'), installerQtIfwComponentId:value('installerQtIfwComponentId'), installerQtIfwComponentDisplayName:value('installerQtIfwComponentDisplayName'), installerQtIfwComponentDescription:value('installerQtIfwComponentDescription'), installerQtIfwReleaseDate:value('installerQtIfwReleaseDate'), installerQtIfwRepositoryUrl:value('installerQtIfwRepositoryUrl'), installerQtIfwRepositoryOutputDirectory:value('installerQtIfwRepositoryOutputDirectory'), installerQtIfwMaintenanceToolName:value('installerQtIfwMaintenanceToolName'), installerQtIfwWizardStyle:value('installerQtIfwWizardStyle'), installerQtIfwControlScript:value('installerQtIfwControlScript'), installerQtIfwComponentScript:value('installerQtIfwComponentScript'), installerQtIfwArchiveFormat:value('installerQtIfwArchiveFormat'), installerQtIfwCompression:value('installerQtIfwCompression'), installerQtIfwArguments:value('installerQtIfwArguments'), installerInnoIsccPath:value('installerInnoIsccPath'), installerInnoScriptFile:value('installerInnoScriptFile'), installerInnoLanguages:value('installerInnoLanguages'), installerInnoPrivileges:value('installerInnoPrivileges'), installerInnoArchitecture:value('installerInnoArchitecture'), installerInnoCompression:value('installerInnoCompression'), installerInnoSolidCompression:checked('installerInnoSolidCompression'), installerInnoDirectives:value('installerInnoDirectives'), installerNsisMakensisPath:value('installerNsisMakensisPath'), installerNsisScriptFile:value('installerNsisScriptFile'), installerNsisExecutionLevel:value('installerNsisExecutionLevel'), installerNsisCompressor:value('installerNsisCompressor'), installerNsisDefines:value('installerNsisDefines'), installerSigningEnabled:checked('installerSigningEnabled'), installerSignToolPath:value('installerSignToolPath'), installerCertificateFile:value('installerCertificateFile'), installerCertificateThumbprint:value('installerCertificateThumbprint'), installerCertificateSubject:value('installerCertificateSubject'), installerCertificatePasswordEnvironment:value('installerCertificatePasswordEnvironment'), installerTimestampUrl:value('installerTimestampUrl'), installerFileDigest:value('installerFileDigest'), installerTimestampDigest:value('installerTimestampDigest'), installerSignTargetBinary:checked('installerSignTargetBinary'), installerSignInstaller:checked('installerSignInstaller'), installerVerifyAfterSigning:checked('installerVerifyAfterSigning'), installerSigningArguments:value('installerSigningArguments'),
    publicationEnabled:checked('publicationEnabled'), publicationOutputDirectory:value('publicationOutputDirectory'), publicationChannel:value('publicationChannel'), publicationBaseUrl:value('publicationBaseUrl'), publicationReleaseNotesFile:value('publicationReleaseNotesFile'), publicationIncludePortablePackage:checked('publicationIncludePortablePackage'), publicationIncludeInstaller:checked('publicationIncludeInstaller'), publicationIncludeQtIfwRepository:checked('publicationIncludeQtIfwRepository'), publicationGenerateChecksums:checked('publicationGenerateChecksums'), publicationGenerateLatestManifest:checked('publicationGenerateLatestManifest'),
    publicationMsixEnabled:checked('publicationMsixEnabled'), publicationMsixMakeAppxPath:value('publicationMsixMakeAppxPath'), publicationMsixIdentity:value('publicationMsixIdentity'), publicationMsixPublisher:value('publicationMsixPublisher'), publicationMsixPublisherDisplayName:value('publicationMsixPublisherDisplayName'), publicationMsixDisplayName:value('publicationMsixDisplayName'), publicationMsixDescription:value('publicationMsixDescription'), publicationMsixVersion:value('publicationMsixVersion'), publicationMsixArchitecture:value('publicationMsixArchitecture'), publicationMsixMinimumOsVersion:value('publicationMsixMinimumOsVersion'), publicationMsixTargetOsVersion:value('publicationMsixTargetOsVersion'), publicationMsixLogo44:value('publicationMsixLogo44'), publicationMsixLogo150:value('publicationMsixLogo150'), publicationMsixStoreLogo:value('publicationMsixStoreLogo'), publicationMsixSignPackage:checked('publicationMsixSignPackage'), publicationMsixGenerateAppInstaller:checked('publicationMsixGenerateAppInstaller'), publicationMsixPackageUri:value('publicationMsixPackageUri'), publicationMsixAppInstallerUri:value('publicationMsixAppInstallerUri'), publicationMsixUpdateOnLaunch:checked('publicationMsixUpdateOnLaunch'), publicationMsixHoursBetweenChecks:value('publicationMsixHoursBetweenChecks'), publicationMsixShowPrompt:checked('publicationMsixShowPrompt'), publicationMsixUpdateBlocksActivation:checked('publicationMsixUpdateBlocksActivation'), publicationMsixForceUpdateFromAnyVersion:checked('publicationMsixForceUpdateFromAnyVersion'), publicationMsixAutomaticBackgroundTask:checked('publicationMsixAutomaticBackgroundTask'),
    publicationWingetEnabled:checked('publicationWingetEnabled'), publicationWingetPath:value('publicationWingetPath'), publicationWingetCreatePath:value('publicationWingetCreatePath'), publicationWingetIdentifier:value('publicationWingetIdentifier'), publicationWingetPublisher:value('publicationWingetPublisher'), publicationWingetPackageName:value('publicationWingetPackageName'), publicationWingetDescription:value('publicationWingetDescription'), publicationWingetLicense:value('publicationWingetLicense'), publicationWingetLicenseUrl:value('publicationWingetLicenseUrl'), publicationWingetPublisherUrl:value('publicationWingetPublisherUrl'), publicationWingetPackageUrl:value('publicationWingetPackageUrl'), publicationWingetInstallerUrl:value('publicationWingetInstallerUrl'), publicationWingetInstallerType:value('publicationWingetInstallerType'), publicationWingetScope:value('publicationWingetScope'), publicationWingetLocale:value('publicationWingetLocale'), publicationWingetTags:value('publicationWingetTags'), publicationWingetReleaseNotesUrl:value('publicationWingetReleaseNotesUrl'), publicationWingetMinimumOsVersion:value('publicationWingetMinimumOsVersion'),
    publicationGithubEnabled:checked('publicationGithubEnabled'), publicationGithubGhPath:value('publicationGithubGhPath'), publicationGithubRepository:value('publicationGithubRepository'), publicationGithubTagPattern:value('publicationGithubTagPattern'), publicationGithubReleaseNamePattern:value('publicationGithubReleaseNamePattern'), publicationGithubDraft:checked('publicationGithubDraft'), publicationGithubPrerelease:checked('publicationGithubPrerelease'), publicationGithubGenerateNotes:checked('publicationGithubGenerateNotes'), publicationGithubClobberAssets:checked('publicationGithubClobberAssets'), publicationPublishTarget:value('publicationPublishTarget'), publicationLocalDirectory:value('publicationLocalDirectory'), publicationSshHost:value('publicationSshHost'), publicationSshUser:value('publicationSshUser'), publicationSshPort:value('publicationSshPort'), publicationSshDirectory:value('publicationSshDirectory'), publicationScpPath:value('publicationScpPath'), publicationRsyncPath:value('publicationRsyncPath'), publicationUseRsync:checked('publicationUseRsync'), publicationDeleteRemote:checked('publicationDeleteRemote'),
        preBuildActions:value('preBuildActions'), customBuildActions:value('customBuildActions'), postBuildActions:value('postBuildActions')
  });
});
</script>
</body></html>`;
    }
}
exports.QtProjectSettingsPanel = QtProjectSettingsPanel;
function requiredModulesForKind(kind) {
    switch (kind) {
        case 'widgets-application':
        case 'python-widgets-application': return ['Core', 'Gui', 'Widgets'];
        case 'quick-application':
        case 'python-quick-application': return ['Core', 'Gui', 'Qml', 'Quick'];
        case 'test-application': return ['Core', 'Test'];
        case 'quick-test-application': return ['Core', 'Gui', 'Qml', 'Quick', 'QuickTest', 'Test'];
        default: return ['Core'];
    }
}
function normalizeTestFramework(value) {
    const allowed = ['auto', 'qttest', 'qtquicktest', 'gtest', 'catch2', 'boost', 'ctest'];
    return typeof value === 'string' && allowed.includes(value) ? value : 'auto';
}
function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1000 ? Math.floor(parsed) : fallback;
}
function testFrameworkOptions(selected) {
    const options = [
        ['auto', 'Automatic detection'], ['qttest', 'Qt Test'], ['qtquicktest', 'Qt Quick Test'], ['gtest', 'GoogleTest'], ['catch2', 'Catch2'], ['boost', 'Boost.Test'], ['ctest', 'CTest']
    ];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function normalizeTestRepeatMode(value) {
    return value === 'until-fail' || value === 'after-timeout' ? value : 'never';
}
function testRepeatModeOptions(selected) {
    const options = [['never', 'Do not repeat'], ['until-fail', 'Repeat until failure'], ['after-timeout', 'Repeat after timeout']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function boostLogLevelOptions(selected) {
    return ['all', 'success', 'test_suite', 'message', 'warning', 'error', 'cpp_exception', 'system_error', 'fatal_error', 'nothing'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join('');
}
function boostReportLevelOptions(selected) {
    return ['confirm', 'short', 'detailed', 'no'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join('');
}
function normalizeKind(value, fallback) {
    const allowed = ['widgets-application', 'console-application', 'quick-application', 'test-application', 'quick-test-application', 'shared-library', 'static-library', 'python-widgets-application', 'python-quick-application'];
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
function normalizeBuildSystem(value) {
    return value === 'qmake' || value === 'cmake' ? value : 'direct';
}
function normalizeNonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}
function buildSystemOptions(selected) {
    const options = [['direct', 'Direct Qt build'], ['qmake', 'qmake'], ['cmake', 'CMake / CMake Presets']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function normalizeCppStandard(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return ['c++17', 'c++20', 'c++23'].includes(text) ? text : 'c++17';
}
function normalizePlatformType(value) {
    return value === 'linux-local' || value === 'remote-linux' || value === 'docker' || value === 'webassembly' || value === 'android' || value === 'macos' || value === 'ios-simulator' || value === 'ios-device' ? value : 'desktop';
}
function normalizePlatformBuildLocation(value, type) {
    if (value === 'remote' || value === 'container')
        return value;
    return type === 'docker' ? 'container' : 'local';
}
function platformTypeOptions(selected) {
    const options = [['desktop', 'Desktop'], ['linux-local', 'Linux Local'], ['remote-linux', 'Remote Linux'], ['docker', 'Docker'], ['webassembly', 'WebAssembly'], ['android', 'Android device / emulator'], ['macos', 'macOS'], ['ios-simulator', 'iOS Simulator'], ['ios-device', 'iOS Device']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function appleConfigurationOptions(selected) {
    return [['Debug', 'Debug'], ['Release', 'Release']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function appleDmgFileSystemOptions(selected) {
    return [['HFS+', 'HFS+'], ['APFS', 'APFS']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function normalizeAndroidApi(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? Math.floor(parsed) : fallback;
}
function normalizeAndroidPackageFormat(value) {
    return value === 'aab' || value === 'aar' ? value : 'apk';
}
function androidPackageFormatOptions(selected) {
    const options = [['apk', 'APK — install and test'], ['aab', 'AAB — Google Play bundle'], ['aar', 'AAR — Android library']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function platformBuildLocationOptions(selected) {
    const options = [['local', 'Local host'], ['remote', 'Remote host'], ['container', 'Container']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function kitProfileIdForBuild(manifest, buildProfileId) {
    return manifest.profiles.builds.find((entry) => entry.id === buildProfileId)?.kitId ?? manifest.profiles.active.kitProfileId;
}
function normalizeDebugRequest(value) {
    return value === 'attach' || value === 'remote-gdb' || value === 'core-dump' || value === 'qml-attach' ? value : 'launch';
}
function normalizeDebuggerType(value) {
    return value === 'gdb' || value === 'lldb' || value === 'cdb' || value === 'cppvsdbg' ? value : 'auto';
}
function normalizePort(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 65535 ? Math.floor(parsed) : fallback;
}
function parseMappingProfile(value) {
    const result = {};
    for (const line of value.split(/\r?\n|;/)) {
        const separator = line.indexOf('=');
        if (separator <= 0)
            continue;
        const remote = line.slice(0, separator).trim();
        const local = line.slice(separator + 1).trim();
        if (remote && local)
            result[remote] = local;
    }
    return result;
}
function environmentToText(value) {
    return Object.entries(value).map(([key, entry]) => `${key}=${entry}`).join(';');
}
function mappingToLines(value) {
    return Object.entries(value).map(([remote, local]) => `${remote}=${local}`);
}
function debugRequestOptions(selected) {
    const options = [['launch', 'Local launch'], ['attach', 'Attach local process'], ['remote-gdb', 'Remote GDB Server'], ['core-dump', 'Core / dump file'], ['qml-attach', 'QML attach']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function debuggerTypeOptions(selected) {
    const options = [['auto', 'Automatic from kit'], ['gdb', 'GDB'], ['lldb', 'LLDB'], ['cdb', 'CDB'], ['cppvsdbg', 'Visual Studio debugger']];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}
function profileOptions(profiles, selected) {
    return profiles.map((profile) => `<option value="${escapeAttribute(profile.id)}" ${profile.id === selected ? 'selected' : ''}>${escapeHtml(profile.name)}</option>`).join('');
}
function numberField(label, id, value) {
    return `<div class="field"><label for="${id}" class="field-label">${escapeHtml(label)}${helpIcon(id)}</label><input id="${id}" type="number" min="1" max="65535" value="${value}"></div>`;
}
function parseEnvironmentProfile(value) {
    const result = {};
    for (const entry of value.split(/[;\r\n]+/)) {
        const separator = entry.indexOf('=');
        if (separator <= 0)
            continue;
        const key = entry.slice(0, separator).trim();
        if (key)
            result[key] = entry.slice(separator + 1).trim();
    }
    return result;
}
function normalizeList(value) {
    if (Array.isArray(value))
        return [...new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean))];
    return [...new Set(String(value ?? '').split(/\r?\n|;/).map((entry) => entry.trim()).filter(Boolean))];
}
function cloneProjectSettings(value) {
    return JSON.parse(JSON.stringify(value));
}
function packagingArchiveOptions(selected) { return [['folder', 'Folder only'], ['zip', 'ZIP archive'], ['tar-gz', 'tar.gz archive']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function packagingExecutionLevelOptions(selected) { return [['asInvoker', 'As invoker'], ['highestAvailable', 'Highest available'], ['requireAdministrator', 'Require administrator']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function packagingDpiOptions(selected) { return [['unaware', 'DPI unaware'], ['system', 'System aware'], ['per-monitor', 'Per-monitor'], ['per-monitor-v2', 'Per-monitor v2']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function installerBackendOptions(selected) { return [['qt-ifw', 'Qt Installer Framework'], ['inno-setup', 'Inno Setup'], ['nsis', 'NSIS']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function qtIfwModeOptions(selected) { return [['offline', 'Offline'], ['online', 'Online'], ['hybrid', 'Hybrid']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function qtIfwWizardOptions(selected) { return ['Modern', 'Aero', 'Classic', 'Mac'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join(''); }
function qtIfwArchiveOptions(selected) { return ['7z', 'zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join(''); }
function innoPrivilegeOptions(selected) { return [['lowest', 'Current user'], ['admin', 'Administrator']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function innoArchitectureOptions(selected) { return [['x86', 'x86'], ['x64', 'x64'], ['x86-x64', 'x86 + x64']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function nsisExecutionOptions(selected) { return ['user', 'highest', 'admin'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join(''); }
function nsisCompressorOptions(selected) { return ['lzma', 'zlib', 'bzip2'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`).join(''); }
function signingDigestOptions(selected) { return ['sha256', 'sha384', 'sha512'].map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value.toUpperCase()}</option>`).join(''); }
function publicationChannelOptions(selected) { return [['stable', 'Stable'], ['beta', 'Beta'], ['nightly', 'Nightly']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function msixArchitectureOptions(selected) { return [['auto', 'Automatic from Qt kit'], ['x86', 'x86'], ['x64', 'x64'], ['arm64', 'ARM64']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function wingetInstallerTypeOptions(selected) { return [['exe', 'Generic EXE'], ['inno', 'Inno Setup'], ['nullsoft', 'NSIS / Nullsoft'], ['msix', 'MSIX'], ['zip', 'ZIP portable']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function wingetScopeOptions(selected) { return [['machine', 'Machine'], ['user', 'Current user']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function publicationTargetOptions(selected) { return [['none', 'No publication target'], ['local', 'Local directory'], ['ssh', 'SSH / rsync'], ['github', 'GitHub Release']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function normalizePublicationChannel(value) { return value === 'beta' || value === 'nightly' ? value : 'stable'; }
function normalizeMsixArchitecture(value) { return value === 'x86' || value === 'x64' || value === 'arm64' ? value : 'auto'; }
function normalizeWingetInstallerType(value) { return value === 'msix' || value === 'inno' || value === 'nullsoft' || value === 'zip' ? value : 'exe'; }
function normalizePublicationTarget(value) { return value === 'local' || value === 'ssh' || value === 'github' ? value : 'none'; }
function normalizeFourPartUiVersion(value, fallback) { const source = String(value ?? fallback).trim(); const parts = source.split(/[.-]/).filter(Boolean).slice(0, 4).map((part) => /^\d+$/.test(part) ? String(Number(part)) : '0'); while (parts.length < 4)
    parts.push('0'); return parts.join('.'); }
function normalizeCpuProfilerTool(value) { return value === 'perf' || value === 'callgrind' ? value : 'auto'; }
function normalizeMemoryProfilerTool(value) { return value === 'valgrind-memcheck' || value === 'heob' ? value : 'auto'; }
function normalizeTraceTool(value) { return value === 'strace' || value === 'none' ? value : 'auto'; }
function cpuProfilerOptions(selected) { return `<option value="auto" ${selected === 'auto' ? 'selected' : ''}>Automatic</option><option value="perf" ${selected === 'perf' ? 'selected' : ''}>Linux perf</option><option value="callgrind" ${selected === 'callgrind' ? 'selected' : ''}>Valgrind Callgrind</option>`; }
function memoryProfilerOptions(selected) { return `<option value="auto" ${selected === 'auto' ? 'selected' : ''}>Automatic</option><option value="valgrind-memcheck" ${selected === 'valgrind-memcheck' ? 'selected' : ''}>Valgrind Memcheck</option><option value="heob" ${selected === 'heob' ? 'selected' : ''}>Heob (Windows)</option>`; }
function leakCheckOptions(selected) { return `<option value="summary" ${selected === 'summary' ? 'selected' : ''}>Summary</option><option value="full" ${selected === 'full' ? 'selected' : ''}>Full</option>`; }
function traceToolOptions(selected) { return `<option value="auto" ${selected === 'auto' ? 'selected' : ''}>Automatic</option><option value="strace" ${selected === 'strace' ? 'selected' : ''}>strace</option><option value="none" ${selected === 'none' ? 'selected' : ''}>Disabled</option>`; }
function pythonUiModeOptions(selected) { return [['compiled', 'Compile .ui to ui_*.py'], ['runtime', 'Runtime .ui loading / manual workflow']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function qmlLanguageTraceOptions(selected) { return [['off', 'Off'], ['messages', 'Messages'], ['verbose', 'Verbose']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function qmlLanguageConflictOptions(selected) { return [['avoid-duplicate', 'Avoid duplicate server'], ['allow-parallel', 'Allow QPM and official extension']].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function normalizeQmlLanguageTrace(value) { return value === 'messages' || value === 'verbose' ? value : 'off'; }
function normalizeInstallerBackend(value) { return value === 'inno-setup' || value === 'nsis' ? value : 'qt-ifw'; }
function normalizeQtIfwMode(value) { return value === 'online' || value === 'hybrid' ? value : 'offline'; }
function normalizeQtIfwWizardStyle(value) { return value === 'Aero' || value === 'Classic' || value === 'Mac' ? value : 'Modern'; }
function normalizeQtIfwArchiveFormat(value) { return value === 'zip' || value === 'tar' || value === 'tar.gz' || value === 'tar.bz2' || value === 'tar.xz' ? value : '7z'; }
function normalizeInnoPrivileges(value) { return value === 'admin' ? 'admin' : 'lowest'; }
function normalizeInnoArchitecture(value) { return value === 'x86' || value === 'x86-x64' ? value : 'x64'; }
function normalizeNsisExecutionLevel(value) { return value === 'user' || value === 'highest' ? value : 'admin'; }
function normalizeNsisCompressor(value) { return value === 'zlib' || value === 'bzip2' ? value : 'lzma'; }
function normalizeSigningDigest(value) { return value === 'sha384' || value === 'sha512' ? value : 'sha256'; }
function normalizePackagingArchive(value) { return value === 'folder' || value === 'tar-gz' ? value : 'zip'; }
function normalizePackagingExecutionLevel(value) { return value === 'highestAvailable' || value === 'requireAdministrator' ? value : 'asInvoker'; }
function normalizePackagingDpi(value) { return value === 'unaware' || value === 'system' || value === 'per-monitor' ? value : 'per-monitor-v2'; }
function normalizePackagingVersion(value) { const text = String(value ?? '').trim(); const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[.-]([0-9A-Za-z.-]+))?$/); if (!match)
    return '1.0.0'; return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}${match[4] ? `-${match[4]}` : ''}`; }
function validateProjectName(value) {
    const normalized = value.trim();
    if (!normalized)
        return 'A Qt project name is required.';
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(normalized))
        return 'Use letters, digits, underscore, dot or hyphen; start with a letter or underscore.';
    return undefined;
}
function validateTargetName(value) {
    const normalized = value.trim();
    if (!normalized)
        return 'A target name is required.';
    if (normalized !== value || /[. ]$/.test(normalized) || /[<>:"/\\|?*\x00-\x1f]/.test(normalized))
        return 'Use a valid file name without a path.';
    return undefined;
}
function kindOptions(value) {
    const values = [
        ['widgets-application', 'Qt Widgets application'],
        ['console-application', 'Qt Console application'],
        ['quick-application', 'Qt Quick application'],
        ['python-widgets-application', 'Qt for Python — Widgets (PySide6)'],
        ['python-quick-application', 'Qt for Python — Quick (PySide6)'],
        ['test-application', 'Qt Test application'],
        ['quick-test-application', 'Qt Quick Test application'],
        ['shared-library', 'Qt shared library'],
        ['static-library', 'Qt static library']
    ];
    return values.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('');
}
function cppStandardOptions(value) {
    return ['c++17', 'c++20', 'c++23'].map((entry) => `<option value="${entry}" ${value === entry ? 'selected' : ''}>${entry}</option>`).join('');
}
function readOnlyField(label, id, value, wide = false) {
    return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}" class="field-label">${escapeHtml(label)}${helpIcon(id)}</label><input id="${id}" value="${escapeAttribute(value)}" readonly></div>`;
}
function field(label, id, value, wide = false) {
    const browse = PATH_BROWSE_FIELDS[id];
    const suggestions = FIELD_DATALISTS[id] || [];
    const listId = suggestions.length > 0 ? `${id}-suggestions` : '';
    const input = `<input id="${id}" value="${escapeAttribute(value)}" ${listId ? `list="${listId}"` : ''}>`;
    const datalist = suggestions.length > 0
        ? `<datalist id="${listId}">${suggestions.map((entry) => `<option value="${escapeAttribute(entry)}"></option>`).join('')}</datalist>`
        : '';
    const control = browse
        ? `<div class="input-row">${input}<button type="button" class="secondary browse" data-browse-id="${id}" data-browse-kind="${browse.kind}" data-browse-relative="${browse.relative === true ? 'true' : 'false'}" title="Browse…" aria-label="Browse for ${escapeAttribute(label)}">…</button></div>${datalist}`
        : `${input}${datalist}`;
    return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}" class="field-label">${escapeHtml(label)}${helpIcon(id)}</label>${control}</div>`;
}
function area(label, id, values, wide = false) {
    return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}" class="field-label">${escapeHtml(label)}${helpIcon(id)}</label><textarea id="${id}">${escapeHtml(values.join('\n'))}</textarea></div>`;
}
function selectField(label, id, options, wide = false) {
    return `<div class="field ${wide ? 'wide' : ''}"><label for="${id}" class="field-label">${escapeHtml(label)}${helpIcon(id)}</label><select id="${id}">${options}</select></div>`;
}
function check(id, label, checked) {
    return `<label class="checkbox"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><span>${escapeHtml(label)}</span>${helpIcon(id)}</label>`;
}
function helpIcon(id) {
    const text = FIELD_HELP[id];
    return text ? `<span class="help" tabindex="0" role="img" aria-label="${escapeAttribute(text)}" data-help="${escapeAttribute(text)}">?</span>` : '';
}
function sectionHeading(id, label) {
    const text = SECTION_HELP[id];
    return `${escapeHtml(label)}${text ? `<span class="help" tabindex="0" role="img" aria-label="${escapeAttribute(text)}" data-help="${escapeAttribute(text)}">?</span>` : ''}`;
}
function pill(label, count) {
    return `<span class="pill">${escapeHtml(label)}: ${count}</span>`;
}
function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttribute(value) {
    return escapeHtml(value).replace(/\r?\n/g, ' ');
}
function makeNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let index = 0; index < 32; index += 1)
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
}
