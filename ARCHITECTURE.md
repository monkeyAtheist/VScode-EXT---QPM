# QPM architecture

## Schema v15 persistence

Native project manifests persist `profiles.active.buildMode`. The manifest is authoritative for native Qt projects; the VS Code `qpm.buildMode` setting is a UI/cache mirror restored whenever the active workspace changes. Debug profiles derive their variant from the selected build profile and their architecture from the persisted project mode plus resolved kit evidence.


## Project formats

`*.qtproject.json` is the native Qt project format. Schema version 15 is implemented in `src/model/qtProjectManifest.ts` and remains independent from CMake.

A native manifest contains:

- project identity, target kind and registered files;
- Qt modules, include/library directories and project-wide definitions;
- Qt kit profiles;
- Debug and Release build profiles;
- run profiles;
- deployment profiles;
- debug profiles for launch, attach, remote, dump and QML workflows;
- active profile identifiers;
- test framework, execution and environment settings;
- static-analysis and coverage settings;
- product metadata and portable-packaging settings;
- QML/CPU/memory profiling, Cppcheck and system-trace settings;
- Android SDK/NDK/JDK, ABI, package, device, emulator and signing settings.
- Apple platform, Xcode, simulator, signing and notarization settings.
- MSIX, App Installer, WinGet, release metadata and publication-target settings.

Schema-version-1 through schema-version-14 manifests are normalized and migrated automatically. A sibling backup is written before persistence. Legacy top-level `qt` and `build` values are maintained as compatibility mirrors.

Legacy `.cws/.prj` documents remain supported through `QpmParser` as generic C/C++ compatibility projects.

## Main services

- `QpmQtInstallationService`: discovers Qt installations, deployment tools, CMake/Ninja/jom/nmake, Visual Studio developer environments and ABI-compatible compiler/debugger toolchains.
- `QpmQtProjectService`: creates native projects, manages files/modules/profiles, generates starters and launches Qt Designer.
- `QpmQtDirectBuildService`: creates deterministic MOC/UIC/RCC, precompiled-header, compile, archive and link plans from direct-build profiles.
- `QpmQtBuildBackendService`: configures, builds and cleans generated or imported qmake/CMake projects, publishes CMake compilation databases and captures MSVC environments.
- `QpmQtKitRegistryService`: stores reusable named kits and assigns project-local copies to every build profile.
- `QpmQtKitsProvider`: exposes active backend/kit status and named-kit actions in the dedicated tree view.
- `QpmQtDebugService`: resolves project-local debug profiles, launches native/QML sessions, starts remote gdbserver over SSH, opens dumps and exports launch configurations.
- `QpmQtDebugProvider`: exposes active profile, attach, dump, QML and launch-generation actions in the dedicated Qt Debugging tree.
- `QpmBuildService`: executes build plans, incremental compilation, linking, run/debug and deployment workflows.
- `QpmWorkspaceService`: loads workspaces/manifests, migrates schema versions and adapts projects to the common QPM tree model.
- `QpmCppToolsService`: owns the automatic native-project IntelliSense lifecycle, registers the exact project root, writes project-local Microsoft C/C++ configuration and `compile_commands.json`, activates cpptools and requests rescans.
- `QpmQtProjectHealthProvider`: evaluates the active project, build configuration and Qt tool readiness, then exposes actionable diagnostics in a dedicated tree view and Markdown report.
- `QpmQtToolsService`: resolves the active project/kit and runs Qt Linguist, `lupdate`, `lrelease`, `qmllint`, `qmlformat`, QML preview and documentation workflows.
- `QtResourceEditorPanel`: parses, validates and rewrites `.qrc` documents through a graphical webview while preserving a first-write backup.
- `QpmQtToolsProvider`: exposes translation, resource, QML and documentation actions in the dedicated Qt Tools tree.
- `QpmQmlLanguageService`: owns the QPM-managed `qmlls` Language Server client, resolves project build/import paths, publishes build directories, generates `.qmlls.ini`/`qmldir` metadata and prevents duplicate language servers by default.
- `QpmQmlLanguageProvider`: exposes qmlls state, readiness, lifecycle, module-generation and report/output actions in the QML Language & Modules tree.
- `QpmQtTestingService`: publishes Test Explorer items, discovers Qt Test/Qt Quick Test/GoogleTest/Catch2/Boost.Test cases, imports CTest inventories from the CMake build tree, runs or debugs selections, parses JUnit/XML results, records test history and publishes line coverage.
- `QpmQtQualityService`: resolves Clang-Tidy, Clazy and gcov; publishes diagnostics; and creates sanitizer/coverage build profiles.
- `QpmQtQualityProvider`: groups test, static-analysis, runtime-check and coverage actions in the Qt Tests & Quality tree.
- `QpmQtPackagingService`: generates product metadata, stages portable distributions, deploys optional Qt runtime content and creates folder/ZIP/`tar.gz` packages.
- `QpmQtPackagingProvider`: exposes product identity, package readiness and packaging actions in the Qt Packaging tree.
- `QpmQtPackagingModel`: renders Windows manifests/resources, Linux desktop entries and package identity metadata independently from VS Code APIs.
- `QpmQtInstallerService`: generates Qt Installer Framework, Inno Setup and NSIS projects, compiles installers, builds Qt IFW repositories and signs distribution artifacts.
- `QpmQtPublicationService`: generates MSIX/App Installer and WinGet metadata, assembles self-contained release bundles, writes checksums/update manifests and publishes through local, SSH or GitHub backends.
- `QpmQtPublicationProvider`: exposes publication readiness, source/package generation, release assembly, upload, reporting and cleanup actions in the Qt Publication & Updates tree.
- `QpmQtProfilingService`: resolves profiler tools, launches QML/CPU/memory/system-trace workflows, parses Cppcheck and Valgrind XML, publishes diagnostics and manages generated reports.
- `QpmQtProfilingProvider`: exposes profiler readiness, run/stop/open/reveal/clean actions in the Qt Profiling & Diagnostics tree.
- `QpmQtAndroidService`: resolves Android SDK/NDK/JDK and Qt Android tools, generates isolated CMake package projects, builds APK/AAB/AAR outputs and drives ADB device, emulator, install, run, debug-wait and logcat workflows.
- `QpmQtAndroidProvider`: exposes Android readiness, package, device and emulator actions in the Qt Android & Devices tree.
- `JcLibEmbedded`: hosts the embedded JC Lib editor and the six QPM base pack integrations.

## Profile resolution

For every operation QPM resolves the project-local active profile chain:

```text
Build mode -> active Debug/Release build profile -> referenced kit profile
Run command -> active run profile
Deploy command -> active deploy profile
Debug command -> active debug profile -> referenced build/run profiles and kit
```

The selected build profile determines the direct/qmake/CMake backend, C++ standard, configure/build/clean arguments, presets, parallelism, output directories, unity/PCH/response-file options and variant flags. Direct GNU response files are emitted only near the platform command-line limit and normalize drive-qualified Windows paths to forward slashes before GCC/MinGW parses them. The referenced kit profile determines the Qt installation, compiler, debugger, environment script, qmake/CMake executables, build tool and generator. Run and deployment settings no longer need to be global to the workspace.


## Backend dispatch

The active Debug or Release profile selects one backend:

```text
direct -> QpmQtDirectBuildService + QpmBuildService
qmake  -> QpmQtBuildBackendService -> qmake -> mingw32-make/jom/nmake
cmake  -> QpmQtBuildBackendService -> CMake configure/build/clean
```

Generated backend files are stored under `.qpm/qmake/<profile>` or `.qpm/cmake/<profile>` and never replace the native manifest. Existing `.pro`, `CMakeLists.txt` and preset files can instead be referenced from the build profile.

MSVC kits capture `vcvarsall.bat` before invoking tools. The direct backend intentionally rejects MSVC and static Qt dependency resolution; qmake and CMake remain the compatibility route for those configurations.

The backend layer controls output directories so run, debug and deployment continue to resolve the same native QPM target path regardless of build system.

## IntelliSense lifecycle

Native project creation and loading use the same project-local resolution chain as the build engine. QPM first resolves the active kit/build profile, then prepares stale Qt code-generation outputs, registers the exact manifest directory as a VS Code workspace folder, writes `c_cpp_properties.json` and `compile_commands.json`, activates Microsoft C/C++ when available and requests a rescan. Kit, module and profile changes repeat this sequence automatically.

The manual synchronization command remains available as an explicit repair action, but it is no longer required during normal project creation.

## Direct build sequence

1. Read, normalize and validate the native manifest.
2. Resolve the active build profile and referenced Qt kit profile.
3. Validate Qt version, compiler ABI/architecture, modules, tools and safe output paths.
4. Generate `ui_*.h`, `moc_*.cpp`/`*.moc` and `qrc_*.cpp` when their inputs are stale.
5. Compile each translation unit with a matching dependency file:

   ```text
   -MMD -MP -MF <object>.d
   ```

6. On subsequent builds, parse each `.d` file and recompile only objects whose real dependencies changed or disappeared.
7. Link the executable/shared library, create a MinGW import library where applicable, or archive the static library.
8. Optionally release and copy application `.qm` catalogs selected by the active deploy profile.
9. Run with Qt/toolchain runtime paths or deploy through the selected Qt platform deployment tool.

The build planner remains independent from VS Code UI state so it can be tested with simulated kits and tools.

## Project health

The health provider is a read-only diagnostic layer over the same manifest and build-planning services. It checks:

- schema/profile integrity;
- active kit and compiler compatibility;
- registered file existence;
- generator and deployment tools;
- IntelliSense/compile database state;
- direct build-plan validity;
- active run and deploy profiles;
- active debug profile readiness;
- Qt Linguist and translation tool availability;
- `.qrc` validation state;
- QML lint, format, preview and `qmlls` availability.

Health findings link back to repair and settings commands rather than duplicating mutation logic.

## Qt tools

Qt tools never rely on a global Qt installation. The service resolves the native manifest, active project-local kit profile and installation metadata for every command. Translation source discovery follows the manifest file lists; QML lint/format uses kit and project import paths; resource editing operates on registered `.qrc` files. Tool output is routed to the shared QPM output channel.

The deployment profile distinguishes application translations from the optional Qt framework translation payload handled by the platform deployment tool. When application translations are enabled, QPM invokes `lrelease` for registered `.ts` files and copies resulting `.qm` catalogs beneath the target `translations` directory before platform deployment.


## QML language lifecycle

QML language support is independent from the selected build backend. QPM resolves the active native manifest, build profile and Qt kit, then starts the kit-local `qmlls` through `vscode-languageclient`. The client supplies Qt and project import paths, publishes active build directories through `$/addBuildDirs`, watches QML/module/build metadata and restarts when the active project changes.

The top-level manifest `qml` object stores lifecycle, executable override, build/import roots, CMake policy, trace level, duplicate-server policy and module identity. Generated `.qmlls.ini` files carry a QPM marker so user-managed files are preserved. Generated `qmldir` files enumerate capitalized QML types and detect `pragma Singleton` declarations.

QPM checks for the official `TheQtCompany.qt-qml` extension before starting its own client. The default policy avoids a second language server to prevent duplicate diagnostics and completion entries; a project can explicitly allow parallel operation.

## Tests and quality

Test discovery is intentionally independent from a specific build backend. The service scans files registered by the native manifest and creates stable Test Explorer identifiers from the source path, framework and runtime test name. Execution then resolves the active project-local run/build/kit chain, builds when required and applies the selected Qt runtime environment.

Framework adapters generate native selectors and result formats:

```text
Qt Test       -> function names + -o <file>,junitxml
Qt Quick Test -> TestCase function names + QML input path + JUnit XML
GoogleTest    -> --gtest_filter + --gtest_output=xml
Catch2        -> test case names and process result fallback
```

Quality analyzers consume the project-local `compile_commands.json`, so their compiler arguments match the direct Qt build. Diagnostics are normalized into VS Code ranges. Sanitizer and coverage configurations are regular build profiles rather than global switches, which keeps instrumented objects isolated from standard Debug/Release outputs.

Coverage temporarily activates the dedicated coverage profile, forces a build, runs tests, invokes gcov against generated `.gcno` files, publishes statement coverage and restores the original active profile and build mode.

## Advanced debugging

Debug profiles are regular manifest objects. They reference build and run profiles rather than duplicating their target, arguments and environment. The debug service resolves the selected kit and emits one of the following configurations:

```text
cppdbg   -> GDB/LLDB launch, attach, remote GDB Server or core dump
cppvsdbg -> Visual Studio launch, attach or dump
qml      -> QML attach by host/port
```

Mixed C++/QML profiles append the Qt QML debugger argument to the native launch and then attach the `qml` debug adapter. Remote profiles optionally start `gdbserver` through OpenSSH and wait for the listening state before connecting. Source maps and additional shared-library lookup paths remain profile-local. Generated `launch.json` entries carry a QPM profile marker so regeneration preserves unrelated user configurations.

## Extension packaging

The VSIX contains compiled JavaScript, schemas, media, templates and only the six QPM JC Lib base packs. TypeScript sources, test scripts, source maps, reports and non-base pack payloads are excluded. This keeps the installed extension focused while the source archive retains the maintainable project structure.

## Application packaging and product metadata

Packaging is represented by the manifest `packaging` object and is independent from the selected build backend. Metadata generation produces deterministic files under `.qpm/packaging/generated`:

```text
application.manifest  -> Windows execution level and DPI awareness
qpm_product.rc        -> Windows version information, icon and manifest reference
application.desktop   -> Linux desktop launcher metadata
package-info.json     -> normalized package identity and provenance
```

For a direct MinGW build, `QpmQtDirectBuildService` resolves `windres`, compiles `qpm_product.rc` to an object and appends it to the linker input. The qmake backend emits `RC_FILE`; the CMake backend adds the resource to the target and enables the RC language on Windows.

Portable package creation follows a staging model:

```text
optional build -> optional Qt runtime deployment -> stage target/runtime/content
               -> generate metadata -> archive folder/ZIP/tar.gz
```

The staging directory is recreated when requested, so stale DLLs and metadata do not leak between releases. Installer generators and signing remain intentionally outside the 0.8.0 portable-package layer.

## Workspace association marker

Native project roots contain `.vscode/qpm-workspace.json`, which associates the exact folder opened by VS Code with its QPM `.cws` workspace. The marker is consumed during activation before generic workspace discovery.


## Platform profiles and execution

Platform profiles are project-local manifest objects layered above kits and build/run/deploy/debug profiles. They do not duplicate compiler or debugger configuration; instead, they select the execution environment and reference the profiles used for that environment. The default profile is `desktop`, so migrated projects retain their previous behavior.

The platform service resolves each workflow through the active platform type:

```text
desktop      -> existing local build/deploy/run services
linux-local  -> local backend and process environment
remote-linux -> SSH + rsync/SCP + remote backend commands
docker       -> docker run with bind-mounted project/build directories
webassembly  -> Emscripten build + HTML discovery + local HTTP server
```

Remote Linux and Docker support qmake, CMake or explicit custom build commands. The direct backend remains local because its incremental object model and generated-file paths are host-specific. WebAssembly expects a Qt/Emscripten kit and uses the selected backend to produce the browser entry point.

Capability detection is intentionally non-mutating. It reports available executables and missing profile fields to the platform tree and Qt Project Health. Build, deploy and run actions validate the selected platform before starting external processes.

## Profiling and diagnostics

Profiling is represented by the manifest `profiling` object and remains independent from the selected build backend. Every run resolves the active build, run, kit and platform chain before starting external tools. QML profiling launches the application with a QML debugging socket, then attaches `qmlprofiler`; CPU profiling selects `perf` or Callgrind; memory diagnostics selects Heob or Valgrind Memcheck; Cppcheck consumes the generated compilation database; system tracing uses `strace`.

Outputs are normalized under the project-local profiling directory and recorded by manifest path so the tree view can reopen the latest result. Analyzer XML is converted to VS Code diagnostics without changing source files. Platform-specific tools are reported as unavailable rather than silently falling back to an incompatible command.
## Workspace persistence precedence (0.13.2)

At activation, `QpmWorkspaceService` restores workspace state in this order:

1. the last workspace explicitly loaded in the current VS Code window (`workspaceState`);
2. an association marker in an opened project folder;
3. the globally last loaded QPM workspace (`globalState`) for empty/untitled windows;
4. exact-folder automatic discovery.

Loading any `.cws`, `.qtproject.json` or compatibility `.prj` updates both persistence levels with a normalized absolute path. This ordering prevents stale project-folder markers from replacing a workspace selected later by the user while retaining project-specific association behavior for new VS Code windows.


## Apple platform backend (0.14.0)

`QpmQtAppleService` isolates Apple-specific workflows from the generic platform router. `QpmQtPlatformService` delegates macOS and iOS profiles to this service while preserving the existing desktop, Android, remote, Docker and WebAssembly implementations.

For iOS, QPM writes an isolated generated `CMakeLists.txt` under `.qpm/apple/generated/<platform-id>`, configures it with the selected Qt kit's `qt-cmake` and the Xcode generator, then invokes `xcodebuild` for the selected scheme, configuration and destination. Simulator discovery and execution use `xcrun simctl`.

For macOS, the normal QPM build produces the application bundle, after which `macdeployqt` deploys Qt frameworks/plugins and may create a DMG. Signing, verification, notarization and stapling are separate explicit stages using system Apple tools. Credentials are not stored in the project manifest; notarization references a Keychain profile managed by `notarytool`.

The Apple provider is read-only apart from command dispatch. Durable configuration remains in the schema-v14 platform profile, and tool readiness is also surfaced through the generic project-health/platform capability path.


## Qt module inference and direct-build cleanup (0.15.1)

`QpmQtModuleInference` scans project sources, headers and Qt Designer forms before a build plan is generated. Module-prefixed includes such as `QtOpenGLWidgets/QOpenGLWidget` and known widget/class names are mapped to their owning Qt module. The inferred set is merged with the explicit `manifest.qt.modules` list and is consumed by the direct linker, generated qmake/CMake projects, Android and Apple generators, and C/C++ IntelliSense. Inference is non-destructive: it does not silently rewrite the project manifest.

`QpmBuildCleanup` handles direct-build cleaning independently from code generation. The preferred strategy renames the complete mode directory to a unique pending path and removes that pending tree with bounded retries. It intentionally does not recreate `generated` or `obj` during the clean command: directory creation is owned by the next build and its retry-aware `ensureDirectory()` path. If Windows refuses the rename, QPM falls back to in-place removal while preserving the `generated` and `obj` roots and deleting only their contents.

`QpmBuildService` retains process handles for applications it launches. Clean, rebuild and relink operations stop the tracked process, stop a matching active VS Code debug session, and on Windows query processes by exact executable path before modifying the target directory. This avoids both executable locks and the delete/recreate race with IntelliSense.
