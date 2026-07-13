# 0.15.2

### Fixed

- Prevented `Clean Project` from recreating `build/<mode>/generated` and `obj` while Windows file watchers are still transitioning from the previous build directory.
- Removed the clean-time `mkdir` operation that could fail with `EPERM` immediately after a successful atomic directory rename.
- Deferred build-directory creation to the next build, where QPM already provides retries, Windows shell fallback and detailed diagnostics.
- Changed the in-place fallback to preserve the `generated` and `obj` directory roots while deleting only their contents, avoiding delete/recreate races.
- Made an already absent build directory a successful no-op instead of recreating an empty skeleton.
- Kept locked pending-clean directories isolated for a later retry without failing the active clean command.

### Validation

- Added simulated `EPERM` coverage that rejects every clean-time `mkdir` for `generated` and `obj`.
- Added atomic-rename, absent-directory and forced in-place-fallback scenarios.
- Full regression from QPM 0.2.0 through QPM 0.15.2 passes.

# 0.15.1

### Fixed

- Automatically detects Qt module dependencies introduced by Qt Designer forms and C++ headers/sources, including `QOpenGLWidget` → `OpenGLWidgets`.
- Adds inferred modules to direct, qmake, CMake, Android, Apple and IntelliSense configurations without requiring a manual manifest edit.
- Tracks applications launched by QPM and stops the matching process before clean, rebuild or relink operations.
- Cleans direct-build output through an atomic rename-and-recreate strategy to avoid Windows `EPERM` races with IntelliSense, antivirus scanners and file watchers.
- Recreates the `generated` and `obj` directories immediately after clean so the next build starts from a stable directory skeleton.
- Retries removal of Windows-locked artifacts and preserves pending cleanup directories for a later retry instead of leaving the active build directory half-deleted.

### Validation

- Reproduced the reported `QOpenGLWidget` form with a manifest that omitted `OpenGLWidgets` and verified `-lQt6OpenGLWidgets` is added to the direct linker command.
- Added atomic clean/recreate tests and source checks for exact-path process termination on Windows.
- Full regression from QPM 0.2.0 through QPM 0.15.1 passes.

# 0.15.0

### Added

- Added manifest schema version 15 with project-local publication, MSIX, App Installer, WinGet, GitHub Release and SSH/local deployment settings.
- Added a **Qt Publication & Updates** tree view with tool readiness, output paths, validation state and release actions.
- Added Windows SDK `MakeAppx` discovery and MSIX packaging from the existing portable Qt staging directory.
- Added generated MSIX application manifests, correctly sized fallback PNG assets and optional SignTool signing.
- Added `.appinstaller` generation with configurable on-launch, prompt, activation-blocking, force-update and background-task policies.
- Added WinGet version, installer and default-locale manifest generation and validation.
- Added release-bundle assembly with portable packages, installers, MSIX/App Installer artifacts, Qt IFW repositories, WinGet manifests, release notes, JSON update metadata and SHA-256 checksums.
- Added local directory, SSH/`scp`, SSH/`rsync` and GitHub Release publication backends.
- Added publication settings, help text, file/folder browsers and direct actions to Qt Project Settings.
- Added consolidated **Publication / updates** editor and Explorer context menus.

### Changed

- Qt Project Health now reports publication readiness and blocking configuration errors.
- Release metadata and checksum files are stored inside the versioned release bundle so every publication backend uploads a self-contained directory.
- GitHub publication can replace assets on an existing release when the clobber option is enabled.
- Local publication rejects drive roots and the project root as destructive destinations.

### Validation

- Added schema/default/migration coverage from schema 14 to schema 15.
- Added MSIX, App Installer and WinGet generator checks.
- Added a simulated end-to-end MakeAppx invocation and validation of generated MSIX assets.
- Full regression from QPM 0.2.0 through QPM 0.15.0 passes.

# 0.14.0

### Added

- Added manifest schema version 14 with macOS, iOS Simulator and iOS Device platform profiles and migration from schemas 1 through 13.
- Added a **Qt Apple Platforms** view for Xcode readiness, platform identity, signing, simulators, reports and generated artifacts.
- Added Xcode developer-directory, `xcodebuild`, `xcrun`, `codesign`, `security`, `hdiutil`, `spctl`, `macdeployqt`, `qt-cmake` and CMake detection.
- Added isolated iOS CMake/Xcode project generation without modifying the user CMake project.
- Added iOS Simulator discovery, selection, boot, application installation and launch through `simctl`.
- Added macOS runtime deployment and DMG creation through `macdeployqt`.
- Added Apple code signing, signature verification, Gatekeeper assessment, Developer ID notarization and ticket stapling.
- Added Apple platform settings to Qt Project Settings and the consolidated QPM context menus.

### Changed

- Generic platform build/deploy/run commands now route Apple profiles through the Apple backend.
- Qt Platform capability reports now include Apple SDK, Xcode, simulator, signing and notarization readiness.
- Direct builds are automatically switched to CMake for iOS profiles because the generated Xcode workflow requires CMake.

### Validation

- Added schema/default/migration tests, simulator JSON parsing, generated CMake/Xcode checks, command/view/menu coverage and source-level checks for `macdeployqt`, `xcodebuild`, `simctl`, `codesign`, `notarytool` and `stapler`.
- Full regression from QPM 0.2.0 through QPM 0.14.0 passes.
- Apple execution is structurally validated on the packaging host; physical validation still requires macOS, Xcode and matching Qt macOS/iOS kits.

# 0.13.2

### Fixed

- Restored the QPM workspace explicitly loaded most recently in the current VS Code window before evaluating project-folder association markers.
- Prevented an older associated workspace, such as a previously opened Widgets project, from replacing the current Qt Quick workspace after restarting VS Code.
- Added a global last-workspace fallback for empty or untitled VS Code windows whose `workspaceState` identity may not survive a full application restart.
- Normalized persisted workspace paths and synchronized window-local and global persistence whenever a workspace or standalone project is loaded.
- Avoided retrying the same folder association during startup fallback discovery.

### Validation

- Added a regression that simulates `QtQuickApp` being active while an older `Test` project-folder association remains open, then verifies the same workspace is restored after a VS Code relaunch.
- Added coverage for the global fallback used by empty VS Code windows.
- All QML Language Server and installer workflows from 0.13.1 remain unchanged.

# 0.13.1

### Fixed

- Added a compatibility registration for the dotted `workspace.didChangeWatchedFiles` capability emitted by some `qmlls` builds, preventing the language client warning and preserving external file-change tracking.
- Expanded QPM-managed QML Language Server watchers to C/C++ headers, sources and CMake fragments so changes to registered QML types are forwarded to `qmlls`.
- Serialized QML Language Server startup to prevent concurrent automatic/manual starts and duplicate `.qmlls.ini` generation.
- Avoided rewriting or logging `.qmlls.ini` when the generated content is already current.
- Continued the same startup operation when the user chooses **Start QPM qmlls anyway**, rather than recursively starting a second operation.

### Validation

- Added a regression test for qmlls file-watcher compatibility, startup serialization, expanded source watching and idempotent configuration generation.
- The official Qt QML extension conflict policy remains unchanged: QPM still avoids a duplicate server by default and starts only after explicit confirmation.

# 0.13.0

### Added

- Added manifest schema version 13 with project-local QML Language Server and QML module metadata, including migration from schemas 1 through 12.
- Added a **QML Language & Modules** view for qmlls readiness, lifecycle, build-directory synchronization, configuration files, module metadata, reports and protocol output.
- Added a QPM-managed Language Server Protocol client using the `qmlls` executable from the active Qt kit or a project override.
- Added project-aware build-directory publication through `$/addBuildDirs`, explicit QML import roots and Qt/QML environment preparation.
- Added automatic `.qmlls.ini` generation with preservation of user-managed configuration files.
- Added `qmldir` generation from registered QML files, including singleton detection and persistent module URI/version/import-root settings.
- Added QML language and TextMate grammar contributions so `.qml` files receive QML editing behavior before the language server starts.
- Added duplicate-server protection for the official Qt QML extension, with an explicit opt-in parallel mode.

### Changed

- Qt installation discovery and readiness reports now include `qmlls`.
- Qt Project Settings now contains a complete QML language/module section with executable, build/import directories, tracing, conflict policy and module identity controls.
- Qt Quick and Qt Quick Test projects enable and auto-start QML Language Server by default; non-QML project types keep it disabled.
- The extension host entry point is bundled with `vscode-languageclient`; the VSIX continues to exclude `node_modules`, TypeScript sources, tests and source maps.

### Validation

- Added schema/default/migration tests, QML contribution tests, language-client wiring checks, settings coverage and runtime-dependency packaging checks.
- Automated validation remains structural and simulated; a physical `qmlls` session should be verified with the locally installed Qt kit.

# 0.12.3

### Fixed

- Replaced the two independent sticky layers in Qt Project Settings with one opaque sticky header containing both the action toolbar and the filter/navigation row.
- Removed the transparent toolbar margin and independent navigation offset that allowed scrolled settings content to appear between the two rows.
- Kept section navigation accurate by measuring the complete sticky header with `ResizeObserver` and applying its height to section `scroll-margin-top`.

### Validation

- Added a regression test verifying the unified wrapper, opaque background, static child rows and removal of the obsolete toolbar-gap calculation.

# 0.12.2

### Fixed

- Selected the `windeployqt` Debug or Release mode from the Qt runtime DLLs actually imported by the executable.
- Added the selected Qt kit, compiler runtime, plugin and QML directories to the deployment environment.
- Passed explicit `qtpaths` and deployment-directory arguments to `windeployqt`.
- Replaced the fixed settings-navigation offset with dynamic height measurement for wrapped action buttons.

# 0.12.1

### Fixed

- Fixed native-project preparation so every code-generation output directory is created before launching `uic`, `rcc`, `moc` or `windres`; this specifically creates `build/<mode>/obj` before writing `qpm_product_metadata.o`.
- Removed build-directory creation from background IntelliSense synchronization to prevent concurrent Windows `mkdir` operations against `build/<mode>/generated`.
- Added parent-first directory creation, longer transient-lock retries, post-race verification, Windows command-shell fallback and detailed directory diagnostics for `EPERM`, `EACCES`, `EBUSY` and `ENOENT`.
- Corrected Inno Setup executable selection: choosing `Compil32.exe` now automatically uses the sibling command-line compiler `ISCC.exe`.

### Validation

- Added a regression test covering windres output-directory preparation, IntelliSense/build ownership separation and `Compil32.exe` to `ISCC.exe` normalization.

# 0.12.0

### Added

- Added manifest schema version 12 with project-local desktop installer and Authenticode settings, including migration from schemas 1 through 11.
- Added the **Qt Installers & Signing** view and a consolidated **Installers / signing** submenu for editor and Explorer contexts.
- Added Qt Installer Framework project generation with `config.xml`, component metadata, optional controller/component scripts, offline/online/hybrid modes and portable staging import.
- Added Qt IFW update-repository generation through `repogen`.
- Added generated Inno Setup and NSIS installer scripts, plus support for custom `.iss` and `.nsi` scripts.
- Added automatic discovery and explicit overrides for `binarycreator`, `repogen`, `installerbase`, `ISCC`, `makensis` and Windows SDK `signtool`.
- Added Authenticode signing and signature verification for target binaries and generated installers, with RFC 3161 timestamping and configurable SHA-2 digests.
- Added installer readiness to Qt Project Health and a Markdown installer/signing report.

### Changed

- Qt Project Settings now contains a complete installer section with backend-specific controls, path selectors, suggestions and contextual help.
- Portable packaging remains the staging source for installer workflows, avoiding modifications to user CMake or qmake projects.
- Certificate passwords are read only from a configured environment variable and are never persisted in `.qtproject.json` or command previews.

### Known limitations

- Inno Setup, NSIS and Authenticode signing require Windows and separately installed tools or a Windows SDK.
- Automated validation uses simulated Qt IFW tools. A physical Release build should still be tested with the locally installed Qt Installer Framework, certificate and timestamp service.
- macOS code signing/notarization, Microsoft Store publication and package-manager publication are not automated in this version.

# 0.11.0

### Added

- Added manifest schema version 11 with Android platform and device settings, including migration from schemas 1 through 10.
- Added the **Qt Android & Devices** view and consolidated Android commands in the editor and Explorer QPM menus.
- Added Android SDK, NDK and JDK discovery with SDK platform/build-tools validation.
- Added Qt for Android kit recognition, ABI detection, `qt-cmake`, CMake, Ninja and `androiddeployqt` resolution.
- Added generated Android CMake projects and APK, AAB and AAR package targets.
- Added ADB device/emulator discovery, device selection, APK installation, launch, uninstall and filtered logcat streaming.
- Added AVD selection and emulator launch, plus `sdkmanager` installation of required packages.
- Added Android package identity, API levels, versioning, ABI selection and Release signing references to Qt Project Settings.
- Added Android wait-for-debugger launch and Android environment/package reports.

### Changed

- Generic Build/Run/Debug actions route through the Android workflow when an Android platform profile is active.
- Qt platform capability reports and Project Health now include Android toolchain and device readiness.
- The project settings page now exposes conditional Android controls with file/folder browsers and contextual help.

### Known limitations

- Automated validation uses simulated Android SDK/NDK/JDK and ADB tools; physical device and Gradle packaging must be confirmed with a real Qt for Android installation.
- Native LLDB/JDWP attachment remains dependent on an installed Android-capable VS Code debug adapter; QPM currently prepares the application in wait-for-debugger mode.
- Google Play upload, Play signing and store publication are not automated in this version.

# 0.10.0

### Added

- Added manifest schema version 10 with extended test-runner settings and migration from schemas 1 through 9.
- Added CTest discovery through the JSON v1 object model, including labels, commands, disabled tests, working directories and CMake backtraces.
- Added CTest execution through build directories or CMake test presets, with JUnit output, name/label filters, parallel jobs, stop-on-failure and repeat policies.
- Added Boost.Test macro discovery, nested-suite handling and JUnit-oriented execution settings.
- Added failed-test reruns and persistent project-local test history with open/clear actions.
- Added a header-only Boost.Test source template.

### Changed

- Qt Project Settings now exposes generic test orchestration plus conditional CTest and Boost.Test sections.
- The Qt Tests & Quality view now groups project tests rather than only Qt-native test frameworks.
- Test discovery refreshes when CMake/CTest metadata changes.

### Known limitations

- CTest must point to a configured build tree or a valid test preset before discovery can return tests.
- Boost.Test execution expects a test binary produced by the active QPM project and a Boost version supporting the selected runtime log format.

# 0.9.0

### Added

- Added manifest schema version 9 with project-local profiling and diagnostic settings, including migration from schemas 1 through 8.
- Added the **Qt Profiling & Diagnostics** tree view and consolidated editor-menu actions.
- Added QML Profiler launching and trace capture through the Qt QML debugging socket.
- Added CPU profiling with Linux `perf` or Valgrind Callgrind, including optional cache and branch simulation.
- Added memory diagnostics with Valgrind Memcheck and Heob, with XML/HTML report handling.
- Added Cppcheck execution from the project compilation database and publication of diagnostics to the VS Code Problems panel.
- Added Linux system-call tracing through `strace`, unified output management and Markdown profiling reports.

### Changed

- Qt Project Settings now contains a complete Profiling and diagnostics section with contextual help, tool selectors, output templates and direct actions.
- Qt Project Health now reports profiling-tool readiness and output configuration.

### Known limitations

- `perf`, Valgrind/Callgrind and `strace` require a Linux host or compatible target.
- Heob is Windows-specific and must be installed separately when it is not available in the Qt tool directories.
- Automated validation uses simulated profiler executables; real traces must be confirmed with the installed Qt/toolchain environment.

# 0.8.0

### Added

- Added manifest schema version 8 with project-local packaging and product metadata, including automatic migration from schemas 1 through 7.
- Added the **Qt Packaging** tree view and packaging actions in Qt Project Settings, editor menus and Explorer menus.
- Added generated Windows application manifests, version resources and MinGW `windres` integration for the direct backend.
- Added Windows resource propagation to generated qmake and CMake projects.
- Added Linux `.desktop` metadata generation and a machine-readable `package-info.json` manifest.
- Added portable distribution staging as a folder, ZIP or `tar.gz`, with optional Qt runtime, translations, documentation, extra files and debug symbols.
- Added packaging readiness to Qt Project Health and a Markdown packaging report.

### Changed

- Qt Project Settings now centralizes package identity, versioning, icon, publisher, output naming and platform-specific metadata.
- The extension package remains compact and excludes TypeScript sources, tests and source maps.

### Known limitations

- Native MSI/NSIS/Inno Setup installers, code signing, notarization and store publication are not generated in this release.
- Archive creation depends on the corresponding system utility when the platform does not provide the preferred native implementation.

# 0.7.3

### Changed

- Consolidated editor and Explorer context-menu actions under a single QPM root with contextual submenus for project/configuration, build/run/debug, Qt tools, tests/quality, documentation, snippets and utilities.
- Reworked Qt Project Settings into a searchable, responsive control center with direct access to every specialized profile and tool manager.
- Added conditional rendering for qmake/CMake, Remote Linux, Docker, WebAssembly, local attach, core-dump, GDB Server and QML-debug fields.
- Added file/folder browse controls for paths and presets for Clang-Tidy, Clazy, header filters, QML debugger services, Docker images and WebAssembly servers.

### Added

- Added keyboard-accessible question-mark help popovers for project, kit, backend, compiler, run, platform, debug, testing, quality, build-step and file settings.
- Added settings filtering, section navigation, reload/discard support and an unsaved-change indicator.
- Added a functional/UI audit and regression test covering menu consolidation, command registration, contextual settings and help coverage.

# 0.7.2

### Changed

- The D32/R32/D64/R64 workspace-toolbar item now opens the build-mode picker instead of reapplying its current value.
- Kept the four direct build-mode commands for command-palette and automation workflows.
- Reorganized the editor snippet menu into Qt, C, C++, Windows/communication, documentation and user categories.
- Reworked the generic snippet picker into a category-first workflow with an optional all-snippets search.

### Added

- Added a substantial Qt snippet library for QApplication/QCoreApplication, signals and slots, QObject, Q_PROPERTY, QTimer, QSettings, QFile, QMessageBox, QRC images, logging categories, Qt Test and QML type registration.
- Added modern C++ class, RAII, enum/switch and mutex snippets plus defensive C and Windows error-handling snippets.
- Added regression tests for the toolbar command routing, menu hierarchy and snippet catalogue.

# 0.7.1

- Persist the active build mode (`debug`, `release`, `debug64` or `release64`) inside each native Qt project manifest.
- Restore the project build mode when a workspace is opened, switched or restored after a VS Code restart.
- Prevent advanced debug profiles from interpreting a resolved x64 kit with `architecture: auto` as a 32-bit kit.
- Route debug, coverage and Qt Project Settings mode changes through the same persistence service.
- Preserve the selected architecture when choosing another Qt installation.
- Upgrade native manifests to schema v7 with a schema-v6 backup.

# 0.7.0

### Added

- Added manifest schema version 6 with project-local platform profiles and automatic migration from schemas 1 through 5.
- Added the **Qt Platforms** view and platform actions in Qt Project Settings and Quick Actions.
- Added Desktop, Local Linux, Remote Linux, Docker and WebAssembly platform types.
- Added capability detection for OpenSSH, SCP, rsync, Docker, `qtwasmserver`, Python and Emscripten.
- Added Remote Linux synchronization, remote qmake/CMake/custom builds, deployment, execution, SSH terminals and optional gdbserver startup.
- Added Docker bind-mounted build/run workflows and an interactive Docker shell.
- Added WebAssembly target discovery, local serving, browser launch and server lifecycle management.
- Added platform readiness checks to Qt Project Health and a Markdown platform report.

### Changed

- Target file extensions now follow the active platform: `.exe`/`.dll` on Windows desktop, native Linux outputs for Linux/Docker and `.html` for WebAssembly applications.
- Named kit detection now recognizes Emscripten toolchains and records appropriate device types.
- The central project settings page now exposes all platform-specific fields and profile relationships.
- The default platform remains Desktop, preserving all existing 0.6.x project behavior.

# 0.6.1

- Fixed persistent 32/64-bit build mode selection, including direct D32/R32/D64/R64 commands.
- Added build architecture to Qt Project Settings and synchronized it with the active QPM mode.
- Made the complete active debugger profile editable from Qt Project Settings.
- Added a central project control center for backend, IntelliSense, health, tests, translations, QML and documentation actions.

# Change Log

## 0.6.0

- Added schema-v5 project-local debug profiles and migration from schema v1-v4.
- Added the **Qt Debugging** tree view and profile manager.
- Added local native launch and process attach for GDB, LLDB and Visual Studio debugging.
- Added remote GDB Server debugging with source maps, shared-library search paths and optional SSH gdbserver startup.
- Added GDB/LLDB core-dump and Visual Studio dump debugging.
- Added QML attach and mixed C++/QML debugging through the official Qt QML debug adapter.
- Added automatic `QT_QML_DEBUG` activation for mixed Qt Quick profiles.
- Added Qt pretty-printing setup, Qt source lookup and Natvis discovery.
- Added dynamic Run and Debug configurations and safe `.vscode/launch.json` generation with JSONC preservation.
- Updated Qt Test debugging to select the debugger from the active named kit.


## 0.5.2

### Fixed

- Fixed stale `.vscode/qpm-workspace.json` associations reopening deleted or unrelated historical Qt projects.
- The last-used workspace is now forgotten when its file no longer exists or when a `.cws` file only references deleted projects; QPM starts on its blank home page instead.
- Automatic startup discovery now inspects only the exact VS Code workspace folder and no longer recursively scans broad parent folders such as Downloads.
- Fixed QPM cleanup leaving `c_cpp_properties.json` with an invalid empty `configurations` array.
- Stale QPM-only IntelliSense files and empty `.vscode` directories are removed safely, while user-defined C/C++ configurations are preserved.
- Added activation-time cleanup for stale parent-folder IntelliSense artifacts created by earlier QPM versions.

## 0.5.1

### Fixed

- Fixed MinGW/GCC linker response files on Windows. Drive-qualified paths are now written with forward slashes so GNU response-file parsing no longer removes `\` separators.
- Fixed object, Qt library, import-library and output paths containing spaces when passed through `qpm_link.rsp`.
- Response files are now generated only when the estimated linker command approaches the platform command-line limit; ordinary projects use direct linker arguments.
- Stale `qpm_link.rsp` files are removed when a response file is no longer required.
- Added a regression test based on the reported Qt 6.11 MinGW project paths.

## 0.5.0

### Added

- Added a persistent named Qt kit registry shared across QPM projects.
- Added the **Qt Kits & Backends** tree view with detection, assignment and kit-management actions.
- Added project-local kit metadata for compilers, debugger type/path, environment scripts, qmake, CMake, build tools and generators.
- Added operational qmake configure/build/clean support with generated or imported `.pro` projects.
- Added operational CMake configure/build/clean support with generated or imported `CMakeLists.txt` projects.
- Added generated `CMakePresets.json` files and support for external configure/build presets.
- Added commands to select a backend, import an existing qmake/CMake project, configure a backend and open its project file.
- Added Visual Studio developer-environment discovery and MSVC kit support through qmake/CMake.
- Added debugger selection by kit: `cppvsdbg` for MSVC and `cppdbg` with GDB/LLDB for GNU/Clang.
- Added parallel direct compilation and backend parallel-build controls.
- Added direct-build precompiled headers, unity builds and linker response files.
- Added backend-aware IntelliSense fallback databases and CMake compile-database publication.
- Added manifest schema version 4 and migration from earlier schemas.

### Changed

- Named-kit assignment now updates every build profile in the active project.
- Direct-build operations use compiler and debugger overrides from the active project kit.
- Qt Project Health now validates the selected backend and its required executable instead of treating qmake/CMake as warnings.
- qmake output, target and configuration variables are controlled by the active QPM profile.
- CMake output directories are forced to the native QPM target directory for generated and imported projects.
- Qt modules written to generated `.pro` files use qmake's lowercase module names.
- CMake and qmake backend settings are editable from Qt Project Settings.

## 0.4.0

### Added

- Added a VS Code TestController with Run, Debug and Coverage profiles.
- Added automatic discovery for Qt Test, Qt Quick Test, GoogleTest and Catch2 source declarations.
- Added run-all, run-at-cursor, debug-at-cursor and run-all-with-coverage commands.
- Added JUnit XML result parsing, source-linked failure messages, timeout handling and Qt runtime environment preparation.
- Added native Qt Test and Qt Quick Test project templates plus file-level test starters.
- Added project settings for test framework, timeout, build policy, arguments, environment and offscreen execution.
- Added Clang-Tidy and Clazy analysis for the current file or complete project using `compile_commands.json`.
- Added source diagnostics in the Problems panel and a Clang-Tidy fix workflow.
- Added AddressSanitizer, UndefinedBehaviorSanitizer, combined sanitizer and coverage build-profile generators.
- Added `gcov` collection from compiler-generated `.gcno` notes and VS Code line-coverage publication.
- Added the **Qt Tests & Quality** tree view and quality checks in **Qt Project Health**.
- Added manifest schema version 3 with `testing` and `quality` sections and automatic migration from older schemas.

### Changed

- Coverage runs always build the instrumented profile, even when normal test runs are configured not to build first.
- Qt Test discovery now recognizes both slot declarations and inline slot implementations.
- Qt project settings now centralize test and static-analysis configuration.

## 0.3.2

### Fixed

- Fixed the **Open** action for resource entries in the graphical QRC editor.
- Resource files are now opened with VS Code's registered default editor through `vscode.open`, allowing images and other binary assets to use their native preview instead of being forced through the text editor.
- Relative QRC paths such as `../../test.png` are resolved from the directory containing the `.qrc` file.
- Added explicit diagnostics for missing paths, directories and editor failures, with fallback actions to reveal the file in Explorer or open it with the system application.
- Added a regression test covering a PNG resource referenced through a parent-relative path.

## 0.3.1

### Fixed

- Fixed the Qt Resource Editor webview client script on Windows. A backslash-normalization regular expression was corrupted while being embedded in the HTML template, preventing all editor controls from initializing.
- Added support for self-closing resource groups such as `<qresource prefix="/"/>`, which are generated by the default Qt Widgets template.
- Added a top-level **Add files** action and an explicit empty-prefix message so a newly created `resources.qrc` can be populated immediately.
- Protected runtime-path refresh logic when a prefix contains no files.
- Added a regression test that compiles the generated webview script and validates the exact empty QRC structure used by newly generated projects.

## 0.3.0 - Qt tools

- Added project-aware Qt Linguist integration for creating, updating, opening and releasing translations.
- Added translation coverage reports and automatic registration of `.ts` and `.qm` files in native manifests.
- Added optional release and deployment of application translation catalogs through the active deploy profile.
- Added a graphical `.qrc` resource editor with prefixes, languages, aliases, empty entries, validation and first-write backups.
- Added `qmllint` diagnostics for the active file or complete project.
- Added `qmlformat` for files and projects, with optional format-on-save.
- Added QML preview through the selected kit's `qml` or `qmlscene` runtime.
- Added configurable QML import paths and automatic lint-on-save for managed QPM projects.
- Added official Qt documentation search for the selected symbol and the active Qt major version.
- Added the dedicated **Qt Tools** activity view and contextual translation, resource, QML and documentation menus.
- Extended Qt installation discovery with Qt Linguist, `lupdate`, `lrelease`, `qmllint`, `qmlformat`, `qml`, `qmlscene` and Qt Assistant metadata.
- Extended Qt Project Settings and Qt Project Health with Qt tool and application-translation deployment status.
- Preserved all 0.2.x direct-build, profile, IntelliSense, Designer, workspace and JC Lib workflows.

## 0.2.9

- Added **Create another workspace + native Qt project** to the home page while a workspace is already loaded.
- Added a direct **Add native Qt project to this workspace** action for loaded `.cws` workspaces.
- Kept standalone project creation available with a clearer label.
- Applied the same generated-file preparation and automatic IntelliSense synchronization after adding a project to an existing workspace.
- Added regression coverage for loaded-workspace home actions.

## 0.2.8

- Fixed workspace + native project creation so the generated QPM workspace remains loaded after VS Code adds the exact project folder for IntelliSense.
- Added a project-local `.vscode/qpm-workspace.json` association marker.
- QPM now restores the associated `.cws` workspace automatically after a workspace-folder reload.
- Standalone native Qt projects use the same automatic restoration mechanism.

## 0.2.7 - Automatic IntelliSense lifecycle

- Enabled native Qt IntelliSense synchronization and precise project-root workspace registration by default.
- Forced synchronization after both standalone native-project creation and workspace-plus-project creation.
- Added lightweight pre-index generation of stale `uic`, `moc` and `rcc` outputs so generated headers are available before the first full build.
- Added automatic synchronization when a native project is opened or restored, a Qt/C++ file is opened, or Qt kits, modules and profiles change.
- Activated the Microsoft C/C++ extension before requesting a rescan and waited for the exact project folder to be registered in multi-root workspaces.
- Regenerated project-local `c_cpp_properties.json` and `compile_commands.json` throughout the project lifecycle.
- Requested a C/C++ rescan after successful builds so newly generated Qt files are indexed immediately.
- Added regression coverage for the complete automatic IntelliSense lifecycle.

## 0.2.6 - Consolidation

- Added manifest schema version 2 with project-local Qt kit, Debug/Release build, run and deploy profiles.
- Added automatic schema-v1 migration with a sibling backup before modifying the project manifest.
- Added the **Manage Project Profiles** command and profile controls in Qt Project Settings.
- Made native build, run, debug, deployment, IntelliSense and Designer resolution consume the project profile model.
- Added GCC/Clang `.d` dependency-file generation and per-translation-unit header invalidation for exact incremental builds.
- Added the **Qt Project Health** view with manifest, profile, kit/toolchain, project file, generator, IntelliSense, build-plan, run and deploy diagnostics.
- Added a Markdown health report and direct repair actions from the health tree.
- Hid additional SDL and generic compatibility commands while a native Qt project is active.
- Reduced the embedded JC Lib catalog to the six QPM base packs: Qt, C, C++, preprocessor, Windows and Python.
- Removed unused CVI-derived source modules and legacy CVI/native test scripts from the distributable source tree.
- Disabled production source maps and excluded non-base JC Lib pack payloads from the VSIX.
- Added regression tests for schema migration, project profiles, compiler dependency parsing and project-health registration.

## 0.2.5 - JC Lib 0.8.27 integrated packs

- Updated the embedded JC Lib pack engine to the 0.8.27 environment hierarchy model.
- New editable packs now remain empty until an environment is explicitly created; deleting the last environment no longer recreates `General`.
- Starter imports preserve their canonical root environments and libraries.
- Replaced the legacy combined QPM core pack with six independently versioned integrated packs: Qt Complete, C, C++, C/C++ Preprocessor, Windows API / Devices, and Python.
- Qt Complete now groups Qt Language, Qt QML, Qt Multimedia, Qt SQL & Test, and Qt for Python (PySide6) under the `QT` environment.
- Existing `qpm_core_pack.json` installations are backed up before migration to prevent duplicate roots.
- Synchronized all bundled structured-pack JSON files with JC Lib 0.8.27.

## 0.2.4

- Fixed Windows native-project root resolution when synchronizing Microsoft C/C++ IntelliSense. Backslash-separated paths no longer collapse to the drive root such as `C:\`.
- Made the directory containing the active `.qtproject.json` manifest authoritative for native Qt IntelliSense files.
- Added automatic generation of `compile_commands.json` beside the native Qt manifest using the exact compiler, defines, include paths and generated MOC/UIC/RCC sources from the direct build plan.
- Added the generated compile database to the managed `c_cpp_properties.json` configuration.
- Added cleanup of obsolete QPM-managed `C:\.vscode\c_cpp_properties.json` entries created by earlier versions, including removal of an accidentally-added drive-root workspace folder when detected.
- Added an IntelliSense database reset after migrating an obsolete drive-root configuration.
- Added cross-platform regression tests for Windows backslash paths, Windows slash paths, POSIX paths and compile-database generation.

## 0.2.3

- Fixed `.ui` file activation from the QPM workspace tree so clicking a Qt Designer form launches Qt Widgets Designer directly instead of opening an inert intermediary editor.
- Added robust Qt Widgets Designer discovery in the selected kit, sibling Qt kits and the Qt `Tools` directory, with Qt Creator as a controlled fallback.
- Added the `qpm.qtDesignerPath` override and the **Select Qt Widgets Designer Executable** command for non-standard installations.
- Added Qt Designer actions to the standard VS Code Explorer, editor title and editor context menus for `.ui` files.
- Resolved the Qt kit from the nearest `.qtproject.json` manifest before launching Designer, rather than relying only on the global active kit.
- Added a launch environment containing the selected Qt `bin`, plugin, platform-plugin and QML paths.
- Added visible launch diagnostics, process errors and exit-code reporting in the **Qt Project Manager** output channel.
- Added a **Locate Designer** control to the Qt Project Settings page and a safe-mode equivalent.
- Added regression tests for kit-local Designer detection, Qt Creator fallback, configured overrides and `.ui` tree/menu wiring.

## 0.2.2

- Fixed native Qt kit resolution so the compiler installed under the Qt `Tools` directory takes priority over stale generic CPM/QPM compiler settings.
- Added compiler probing through `-dumpmachine` and explicit ABI/architecture diagnostics before a native Qt build starts.
- Added recursive Qt installation discovery for nested layouts such as `C:\Qt\Qt6.11.0\6.11.0\mingw_64`.
- Added a dedicated `qpm.qtCompilerPath` override and a **Repair / Select Matching Qt Compiler** command.
- Removed generic C/C++ architecture flags, include paths, libraries and SDL settings from the native Qt direct-build pipeline.
- Prevented native Qt builds from inheriting a stale 32-bit `g++` and from attempting to compensate with `-m64`.
- Updated native run/debug runtime resolution to use the compiler, debugger and runtime directories associated with the active Qt kit.
- Fixed Microsoft C/C++ IntelliSense synchronization for projects nested inside a broader VS Code folder by adding the Qt project root as an exact workspace folder.
- Added automatic Qt include paths, transitive module include paths, kit-derived mkspecs, generated headers, project include directories and the selected C++ standard to `c_cpp_properties.json`.
- Added automatic C/C++ workspace rescan after Qt kit selection or project settings changes.
- Added a compiler compatibility indicator and repair action to the Qt Project Settings page.
- Added regression tests reproducing the 32-bit MinGW versus Qt 6.11 x64 failure and validating the generated Qt IntelliSense configuration end to end.

## 0.2.1

- Replaced the inherited C++ activity-bar and Marketplace artwork with dedicated Qt/QPM branding.
- Changed the primary workspace workflow to create a native `.qtproject.json` project instead of a legacy generic `.prj` project.
- Changed new-workspace and project defaults to Qt-oriented names such as `Qt_Workspace`, `QtWidgetsApp`, `QtQuickApp` and `QtApp`.
- Added Qt-native creation templates for Widgets, Console and Quick `main.cpp` files, `QObject` and Widget classes, Designer `.ui` forms, `.qrc` resources and QML files.
- Added a dedicated native Qt Project Settings page for Qt kit selection, modules, MOC/UIC/RCC, deployment, project kind, C++ standard, paths, flags, run options and build actions.
- Relabelled the inherited `.prj` settings editor as a C/C++ compatibility editor and added explicit diagnostics that it does not invoke `moc`, `uic` or `rcc`.
- Separated native and compatibility project context menus so Qt-only build-plan, module and deployment commands are no longer shown on legacy `.prj` projects.
- Removed SDL compatibility actions from the primary Qt toolbar and project context menu while preserving them in the command palette.
- Added validation for native workspace/project selection and a regression suite for the Qt-oriented creation and settings workflow.

## 0.2.0

- Added the native `.qtproject.json` project format with bundled JSON schema validation.
- Added project templates for Qt Widgets, console, Qt Quick, shared-library and static-library targets.
- Added the direct Qt build backend without a CMake dependency.
- Added automatic `moc`, `uic` and `rcc` planning and incremental generation.
- Added Qt module dependency ordering, include paths, preprocessor definitions and linker libraries.
- Added Qt-bundled toolchain discovery and synchronization of compiler/debugger paths.
- Added native project support in the workspace tree, file add/remove/rename operations and IntelliSense synchronization.
- Added build-plan inspection, Qt module editing and Qt Designer launch commands.
- Added explicit Qt runtime deployment through the selected platform deployment tool.
- Preserved `.cws/.prj` projects as a compatibility format.
- Added regression tests for manifest handling, toolchain discovery, Qt code-generation planning and linker arguments.
- Added Windows Qt 6 GUI entry-point handling through `QT_NEEDS_QMAIN`, `Qt6EntryPoint` and PRL dependency parsing.
- Added MinGW shared-library export templates and automatic import-library generation.
- Added automatic runtime deployment through the manifest `autoDeploy` option.
- Added architecture, Qt-major-version, module-presence, target-name and output-path safety checks.
- Added an end-to-end simulated Qt generation/compile/link execution test.

## 0.1.0

- Forked the reusable CPM workspace, project, build, run, debug, IntelliSense and embedded-library architecture into Qt Project Manager.
- Migrated public commands, views, settings and context keys from `cpm.*` to `qpm.*` so both extensions can coexist.
- Added Qt kit discovery for standard Windows, Linux and macOS locations and configurable search paths.
- Added Qt kit validation for `bin`, `include`, `lib`, `qmake/qtpaths`, `moc`, `uic` and `rcc`.
- Added active Qt installation selection, manual registration and an information view.
- Added an active Qt version indicator to the VS Code status bar.

This first increment keeps the proven generic CPM build backend. Direct Qt compilation and automatic MOC/UIC/RCC dependency generation are the next implementation stage.
