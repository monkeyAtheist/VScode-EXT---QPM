> QPM 0.34.4 fixes VSIX activation/entry-point validation; the embedded JC Lib content remains aligned with 0.8.36.

## QPM 0.34.2 — Reliable automatic standalone deployment

QPM now runs standalone deployment from one centralized post-build stage shared by Direct, qmake and CMake. When **Run deployment tool after build** is enabled for the selected build profile, deleting `dist/` and rebuilding recreates the deployment tree automatically. The settings page also exposes the build profile associated with automatic deployment.

The 0.34.2 test VSIX also restores the runtime dependencies required by the unbundled `out/` entry point, fixing the activation failure seen in 0.34.1.

## QPM 0.34.1 — Application icon deployment fix

QPM now treats the icon embedded in a Windows executable and the icon displayed by Qt windows as two independent application-branding resources. In **Project > Application icons**, `Executable icon` accepts a Windows `.ico` file and is linked into the executable resource, while `Qt window / application icon` is embedded in a generated QRC and applied as the default Qt window icon for native C++ GUI targets.

The package/installer icon remains independently configurable under Distribution and acts as an override; if left empty, it reuses the executable icon. QPM-generated Direct, qmake and CMake projects integrate these resources automatically. Existing external/custom `.pro` or `CMakeLists.txt` files remain user-owned and are not rewritten silently.

### QPM 0.33.0 — Thematic project settings

The Qt Project Settings editor is now organized by task instead of exposing every project option in one long page. Ten thematic pages — **Overview**, **Project**, **Build**, **Run & Deploy**, **Debug & Diagnostics**, **Qt & Languages**, **Platforms**, **Tests & Quality**, **Dependencies** and **Distribution** — are available from a persistent page bar. **Jump to a section** only lists sections from the active page, and filtering is scoped to that page.

The Build page now explicitly separates common compiler/linker inputs from the selected Debug/Release variant. The old ambiguous **Debug flags** block has become **Debug compiler & linker settings**, with dedicated Linkage, Preprocessor, Compiler and Linker subsections. The top toolbar has also been reduced to the actions that must remain globally available; profile, kit and Designer controls are placed where they are configured, while the Overview page remains a quick command dashboard.

A source-level UI audit validates unique field IDs, command registrations, explicit button handlers and path/suggestion bindings without changing the Qt project schema or removing supported settings.

### QPM 0.32.0 — Clean standalone deployment and linkage modes

QPM now separates the **build working tree** from the **standalone runtime image**. Direct/qmake/CMake builds can keep `obj`, `generated`, response files and backend files below `build/`, while deployment stages only the application and runtime dependencies below `dist/<debug|release>` by default. The deployment directory is cleaned before each staging operation, then `windeployqt` runs against the copied target. This prevents stale or architecture-mismatched Qt DLLs from remaining beside the executable.

The Qt Project Settings page adds a dedicated **Standalone deployment** section with the deployment directory, automatic deployment, clean staging, compiler-runtime deployment, translation deployment and post-deploy verification. New native projects bind automatic deployment to the Release build profile by default; Debug builds are not deployed automatically unless the deploy profile is reassigned. Portable packaging consumes this clean deployment image instead of copying the complete build directory.

Build profiles also expose a **Linkage mode**:

- **Dynamic Qt + dynamic compiler runtime** — normal Qt installation and DLL deployment;
- **Dynamic Qt + static MinGW/GCC runtime** — adds `-static-libgcc -static-libstdc++` so the compiler runtime no longer needs its usual DLLs, while Qt remains dynamic;
- **Static Qt kit** — requires a Qt installation actually built with `-static` and uses qmake/CMake. The direct backend intentionally rejects static Qt kits until static plugin/transitive-library resolution is complete.

A fully single-file Qt executable therefore requires a real static Qt kit and may still require explicitly static third-party dependencies. Selecting “static” cannot convert the standard dynamic Qt installation into a static one.

### QPM 0.30.0 — Structured build diagnostics and readable logs

QPM now separates the human-readable build report from the raw compiler trace.

The main `Qt Project Manager` output is organized into explicit phases:

- build order;
- project/toolchain;
- clean/rebuild preparation;
- Qt code generation (`moc`, `uic`, `rcc`);
- C++ compilation;
- link;
- deployment;
- final build summary.

Successful compiler invocations are reduced to one status line with elapsed time. Full compiler paths, arguments and raw stdout/stderr are preserved in the separate `Qt Project Manager - Build Trace` output channel.

Compiler diagnostics are parsed for GCC/MinGW/Clang and MSVC-style messages. Errors and warnings are presented with file, line, column, source line and a contextual troubleshooting hint when QPM can recognize the error family. Parsed file diagnostics are also published to VS Code's Problems view (`QPM Build`) so they are clickable.

The new `qpm.buildLogDetail` setting supports `compact`, `normal` (default) and `verbose`. Commands `Qt Project Manager: Show Build Problems` and `Qt Project Manager: Show Full Build Trace` provide direct access to the two diagnostic views.

Typical failure output is now similar to:

```text
--- C++ COMPILATION -----------------------------------------------------------
  Sources: 19 | Compile: 12 | Cached: 7 | Parallel jobs: 16
  [OK] Compile qpm_signal_buffer.cpp (381 ms)

  [X] Compile mainwindow.cpp FAILED (exit code 1, 426 ms)
  ------------------------------------------------------------------------------
  [X] ERROR 1/1
      Location : src/mainwindow.cpp:10:5
      Message  : 'acqctrl' was not declared in this scope
      Source   : acqctrl = new AcquisitionControl(this);
      Hint     : The identifier is used without a visible declaration. If it is
                 a widget placed in Qt Designer, access it through ui-><objectName>.

  [SKIP] Link step skipped because compilation failed.
```

### QPM 0.29.2 — SignalPlot bridge Qt 6.11 compatibility

QPM now generates `qpm_signal_plot_bridge.h` with the complete `SignalPlot` type before declaring `QPointer<SignalPlot>`. This fixes Qt 6.11 builds where MOC instantiates the inline `QPointer::data()` getter. The header also explicitly includes `<limits>`.

# Qt Project Manager

> QPM 0.34.3 embeds the curated JC Lib 0.8.36-compatible library set. and Build

## QPM 0.29.0 — Complete Acquisition Dashboard and one-step Designer preparation

QPM now adds **Create New File > Qt > Complete Acquisition Dashboard**. The workflow fills in any missing acquisition transport classes, the realtime ring buffer/plot bridge, the advanced `SignalPlot`, `AcquisitionControl`, and a new `AcquisitionDashboard` widget that owns the runtime wiring between them. When the project still has the untouched blank QPM `mainwindow.ui`, the dashboard is inserted automatically as the central widget; an already-designed MainWindow is preserved and the generated dashboard can instead be placed manually.

`AcquisitionDashboard` exposes Designer properties for channel count, buffer capacity, sample rate, display refresh rate and visible sample window. At runtime it creates `QpmSignalBuffer -> QpmAcquisitionController -> QpmSignalPlotBridge -> SignalPlot`; under `QPM_DESIGNER_PLUGIN_BUILD` it keeps only the visual preview so Designer never opens acquisition transports.

The Qt Designer custom-widget workflow also gains **Prepare All QPM Widgets for Qt Designer** and **Prepare QPM Widgets & Open Designer**. These commands synchronize every discoverable `Q_OBJECT` QWidget into the project-local `QPM Instrumentation` collection, rebuild the ABI-matched Designer plugin and optionally launch the standalone Designer with the project-local plugin path. Opening with custom widgets now warns when newly generated widgets are missing from an older plugin configuration and offers to rebuild it.

## QPM 0.28.0 — Instrument Driver Registry and semantic capabilities

QPM now adds a capability layer above SCPI model profiles. A profile can declare model-independent functions such as `measure.dc-voltage`, `power.output`, `source.frequency` or `scope.single` and map each capability to one or more existing SCPI action IDs. `QpmInstrumentDriverRegistry` loads the project `instrument_profiles/*.json`, indexes which drivers support each capability, and lets application code choose instruments by function rather than by vendor/model string.

Typical runtime use:

```cpp
QpmInstrumentManager manager;
manager.setProfileDirectory("instrument_profiles");
manager.addInstrument("PSU", "192.168.1.50", 5025);
// ... identify + explicit Apply suggested profile ...

if (manager.supportsCapability("PSU", "power.voltage-set")) {
    manager.setActiveInstrument("PSU");
    manager.invokeActiveCapability("power.voltage-set", 12.0);
    manager.invokeActiveCapability("power.output", true);
}
```

`InstrumentCapabilitiesControl` is a Designer-ready inspector that follows the applied profile through `QpmInstrumentManager` or can display a selected driver directly. The VS Code SCPI profile editor also gains a capability table where semantic IDs, category and linked action IDs can be authored without hand-editing JSON. Older 0.25–0.27 profiles remain loadable; the generated C++ profile layer infers common capabilities from known action IDs when no explicit capability list is present.

The 0.28.0 acquisition templates also fix the sample-rate member regression: both `QpmAcquisitionController` and `QpmAcquisitionSource` now declare the `m_sampleRateHz` state they expose, and the configured sampling rate is propagated to the active source and `QpmSignalBuffer`.

## QPM 0.27.0 — SCPI automatic profile detection

QPM can now connect the 0.24.0 SCPI Instrument Manager to the 0.26.0 profile catalogue workflow. Generated `QpmScpiProfileMatcher` code parses standard comma-separated `*IDN?` replies into manufacturer, model, serial number and firmware fields, normalizes common vendor naming variants (for example Keysight / Agilent / Hewlett-Packard), and scores project-local `instrument_profiles/*.json` entries by manufacturer/model compatibility.

`QpmInstrumentManager` refreshes the suggestion automatically when an instrument identity changes. `InstrumentManagerControl` shows the suggested profile and confidence score beside the instrument, exposes the profile directory, and adds **Apply suggested profile**. Applying is deliberately explicit: QPM never silently switches an instrument driver after a heuristic match. Generic starter profiles are excluded from auto-detection candidates.

The visual SCPI Profile Catalog & Editor also includes a `*IDN? matcher` field. Pasting an identity such as `KEYSIGHT TECHNOLOGIES,34461A,...` ranks matching catalogue entries before saving a model profile into the project. Runtime matching uses the project-local JSON files, so a manufacturer/model starter from the extension catalogue must first be saved into `instrument_profiles/` before the application can apply it.

## QPM 0.26.0 — SCPI profile catalog and visual editor

QPM now includes a **SCPI Instrument Profile Catalog & Editor**. Open it from the Qt Project Tools menu, the Command Palette, or directly from a JSON file inside `instrument_profiles/`. The editor keeps the 0.25.0 JSON format as the runtime interchange format, but removes the need to edit that JSON manually.

The left side provides a searchable catalog of generic instrument-family templates and manufacturer/model-labelled starter entries. Model-labelled entries are intentionally marked **starter**: they provide a convenient editable baseline and do not claim that every command has been verified against a specific firmware revision. The target instrument programming manual remains authoritative.

The editor exposes profile metadata (`id`, family, manufacturer, model, documentation URL and description), semantic action rows, query/write commands, units, numeric ranges, precision, default values and readback flags. Validation catches duplicate IDs, missing measurement queries, missing write templates, invalid ranges and `%1` substitution mistakes. A live preview shows the type of control that `ProfiledInstrumentControl` will build at runtime.

Profiles created by 0.25.0 remain valid. New metadata is optional, and generated C++ `QpmInstrumentProfile` loaders now preserve `manufacturer`, `model` and `documentationUrl` when loading/saving profiles.

## QPM 0.25.0 — SCPI instrument profiles and automatic control panels

QPM can now generate **SCPI Instrument Profiles + Auto Control Panel**. The starter adds `QpmInstrumentProfile`, four editable JSON starter profiles (`DMM`, `Power Supply`, `Signal Generator`, `Oscilloscope`) and a Designer-ready `ProfiledInstrumentControl`. A profile describes semantic actions rather than a fixed vendor UI: measurement queries, numeric setpoints, ON/OFF toggles and immediate actions. The widget builds its controls dynamically from those definitions and routes replies through the request IDs already provided by `QpmScpiInstrument`.

Typical runtime binding is:

```cpp
auto *instrument = new QpmScpiInstrument(this);
instrument->setHost("192.168.1.40");
instrument->setPort(5025);
ui->profiledInstrumentControl->setProfileId("power-supply");
ui->profiledInstrumentControl->setInstrument(instrument);
instrument->connectToInstrument();
```

A project can also load an edited profile without recompiling the control logic:

```cpp
ui->profiledInstrumentControl->loadProfileFile(
    "instrument_profiles/my_keysight_supply.json");
```

The supplied SCPI commands are intentionally **starter profiles**, not a claim that every vendor implements identical command trees. Channel selection, measurement subsystems and waveform commands frequently differ by manufacturer/model, so the JSON profile is the adaptation point. `ProfiledInstrumentControl` remains compatible with the QPM Designer Widget Box plugin and suppresses live SCPI linkage under `QPM_DESIGNER_PLUGIN_BUILD`.

## QPM 0.24.0 — SCPI Instrument Manager

QPM can now generate a reusable **SCPI Instrument Manager** from `Create New File > Qt > SCPI Instrument Manager`. The starter provides a queued `QpmScpiInstrument` TCP session with per-command timeouts, asynchronous `writeCommand()` / `query()` calls, an optional blocking `queryBlocking()` convenience API, automatic `*IDN?` identification, and timestamped TX/RX/System traffic signals. Commands are serialized so one response is associated with one active SCPI query.

`QpmInstrumentManager` manages multiple named endpoints, selects an active instrument, connects/disconnects instruments individually or as a group, and probes configured instruments with `*IDN?`. Generic SCPI does not define universal LAN discovery; the generated **Probe configured** workflow deliberately operates on known endpoints rather than pretending that arbitrary network scanning is a portable discovery mechanism.

`InstrumentManagerControl` is a Designer-ready `QWidget` with endpoint configuration, a table showing endpoint/state/identity, Connect/Disconnect/Probe actions, direct Query/Write controls and a bounded TX/RX history console. Runtime linkage is disabled under `QPM_DESIGNER_PLUGIN_BUILD`, so it remains compatible with the QPM Instrumentation Widget Box plugin. Native projects automatically receive the `Network`, `Widgets` and `Core` Qt modules when needed.

## QPM 0.23.0 — Acquisition sources and control panel

QPM now extends the 0.22.0 realtime buffer with a transport-independent acquisition layer. `Create New File > Qt > Acquisition Sources + Control Panel` generates a common decoder/base source, Serial, TCP, UDP and SCPI-over-TCP backends, a `QpmAcquisitionController`, and a Designer-ready `AcquisitionControl` widget. Every backend writes decoded interleaved samples into the same `QpmSignalBuffer`, so the existing `QpmSignalPlotBridge` and advanced `SignalPlot` remain unchanged.

The generic decoder supports newline-delimited ASCII/CSV numeric samples and little-endian Float32, Float64 and Int16 streams. TCP and serial partial reads are buffered until complete text lines or complete binary frames are available. The SCPI starter intentionally targets ASCII numeric replies such as `READ?`; instrument-specific IEEE 488.2 binary blocks require a dedicated decoder.

`AcquisitionControl` can be published through the existing **QPM Instrumentation** Designer plugin. At application runtime, bind it to a controller with `acquisitionControl->setController(controller)`. The controller centralizes backend selection, serial/network endpoint configuration, channel count, sampling frequency, scaling/offset and SCPI polling, while the control displays connection state, byte/sample counters and transfer rate. QPM also adds `Network`, `SerialPort`, `Widgets` and `Core` to native project modules when required.

## QPM 0.22.0 — Real-time acquisition buffer

QPM can now generate a dedicated acquisition layer from `Create New File > Qt > Real-time Signal Acquisition Support`. The generated `QpmSignalBuffer` is a fixed-capacity, multi-channel ring buffer protected by `QReadWriteLock`; acquisition threads can write individual samples, blocks, simultaneous frames or interleaved blocks without touching a QWidget.

`QpmSignalPlotBridge` stays in the GUI thread and refreshes `SignalPlot` with a `QTimer` at a bounded rate (30 Hz by default). It uses `trySnapshot()` so a short acquisition write can make the UI skip one refresh instead of blocking. `SignalPlot` also gains `setChannelSamplesBatch()` so a complete multi-channel snapshot performs a single autoscale/trigger/update pass.

Typical flow:

```cpp
QpmSignalBuffer buffer(2, 65536);
buffer.setSampleInterval(1.0 / 100000.0);

QpmSignalPlotBridge bridge(&buffer, ui->signalPlot, this);
bridge.setWindowSamples(5000);
bridge.setRefreshRateHz(30);
bridge.start();

// Worker/acquisition thread:
buffer.appendFrame({channel1Sample, channel2Sample});
```

The buffer owns no transport. USB, serial, TCP, SCPI or ADC code can therefore use the same sink while the UI remains decoupled from the producer rate.

## QPM 0.21.0 — Oscilloscope trigger and analysis

`SignalPlot` now adds oscilloscope-oriented acquisition analysis while retaining the 0.20.0 multichannel API: DC/AC software coupling, Off/Auto/Normal trigger modes, rising/falling edge selection, trigger level/channel/pre-trigger position, X cursors and Y1/Y2 horizontal cursors, plus automatic Vpp, Vrms, Vavg, frequency and duty-cycle measurements. Ctrl+left click places the trigger level; Alt+left/right click places Y1/Y2.

`SpectrumPlot` now adds maximum/minimum hold, configurable persistence history and a peak marker/peak measurement. Hold and persistence are maintained per trace and can be cleared independently. These properties remain compatible with the QPM Designer widget plugin and can be edited through Qt Designer where applicable.

## QPM 0.20.0 — Advanced oscilloscope and spectrum widgets

`SignalPlot` and `SpectrumPlot` now act as instrumentation controls rather than basic drawing starters. `SignalPlot` supports multiple named/colored channels, a configurable sample interval, legend, dynamic autoscale, horizontal zoom/pan, optional follow-latest scrolling, block/sample append APIs and dual A/B cursors that report `Δt`, `ΔV` and the derived `1/Δt` frequency. `SpectrumPlot` supports multiple traces, linear or logarithmic frequency display, independent frequency view zoom/pan, autoscale and A/B spectral measurements (`Δf`, `ΔA`).

The original 0.19.0 APIs remain valid: existing code using `setSamples()`, `appendSample()`, `setMagnitudes()`, `cursorSampleChanged()` or `cursorBinChanged()` continues to target the primary channel/trace. Advanced code can add channels/traces and configure their names, colors and visibility without changing the Qt Designer plugin workflow. Both controls remain normal `QWidget`/`QPainter` classes and continue to use the current Qt palette/QStyle for QSS integration.

## QPM 0.19.0 — Instrumentation widgets

QPM now ships generators for a broader set of reusable **Qt Widgets instrumentation controls**. **Complete QPM Instrumentation Pack** creates the full set in one operation; individual generators remain available for: **LED Indicator**, **Digital Meter**, **Rotary Knob**, **Linear Gauge**, **Analog Gauge / Dial**, **Signal Plot / Chart**, **Spectrum Plot**, **XY Plot**, plus the generic painted-value starter. Generated classes live under `include/widgets/` and `src/widgets/`, expose useful `Q_PROPERTY` values to Qt Designer, use the current Qt palette/style for QSS compatibility, and are automatically discoverable by the **QPM Instrumentation** Designer plugin workflow introduced in 0.18.0.

Typical use is: create the control from **Create New File > Qt > Custom Painted Widget (QPainter)**, configure its public properties in C++ or Designer, then run **Configure Qt Designer Custom Widgets...** to expose it directly in the Designer Widget Box. `SignalPlot`, `SpectrumPlot` and `XyPlot` expose cursor signals suitable for measurement readouts; the input controls (`RotaryKnob`, `LinearGauge`) emit `valueChanged`.

## QPM 0.18.0 — Native Qt Widgets Designer custom-widget plugins

QPM can now expose project-local `Q_OBJECT` / `QWidget` classes directly in the **Qt Widgets Designer Widget Box**. Use **QPM > Qt project tools > Configure Qt Designer Custom Widgets...** to select the widgets to publish and choose the category name (default: **QPM Instrumentation**). QPM generates a separate `QDesignerCustomWidgetCollectionInterface` plugin under `.qpm/designer-plugins/`; the application itself remains independent from Qt Designer libraries.

**Build Qt Designer Widget Plugin** compiles the collection with the Qt kit that owns the selected `designer.exe` whenever QPM can resolve it. This matters on Windows because Designer plugins must match Designer's Qt/compiler ABI (for example MSVC Designer requires an MSVC-built plugin; a MinGW plugin is not interchangeable). The compiled library is kept project-local under `.qpm/designer-plugins/runtime/designer`. Normal **Open .ui in Qt Widgets Designer** automatically adds that project-local runtime root to `QT_PLUGIN_PATH`, so configured controls appear as native drag-and-drop Designer widgets without modifying the global Qt installation. An optional explicit install command can copy the built plugin into the resolved Qt `plugins/designer` directory.

The 0.17.9 **Custom Painted Widget** starters are detected automatically, and the scanner also accepts common `QWidget` subclasses such as `QDial`, `QSlider`, `QFrame`, buttons, editors and display widgets when the class contains `Q_OBJECT`. The native Widget Box plugin workflow intentionally targets the standalone **Qt Widgets Designer (`designer.exe`)** so QPM can resolve and match its Qt/compiler ABI. **Promote to...** remains available as the zero-plugin fallback.

## QPM 0.17.9 — Custom QPainter widgets for instrumentation

QPM can now create reusable **Custom Painted Widget (QPainter)** classes directly from the Qt file-creation workflow. The generator writes `include/widgets/<widget>.h` and `src/widgets/<widget>.cpp`, registers them in native Qt projects, refreshes direct-build MOC output, and keeps the class ready for Qt Designer through **Promote to...** on a placeholder `QWidget`.

Three starters are included: **Generic Painted Value Widget** (value/range/title/unit properties with mouse and wheel interaction), **Analog Gauge / Dial** (270° scale, ticks and interactive needle), and **Signal Plot / Chart** (sample buffer, grid, cursor, configurable Y range and wheel zoom). The templates use `Q_OBJECT`, `Q_PROPERTY`, `QPainter` and the active Qt palette/style so they remain compatible with application QSS styling instead of hard-coding a theme.

## QPM 0.17.8 — Designer forms and Qt C++ classes

QPM now distinguishes clearly between a **Qt Widget / QObject class** and a **Designer Form Only (.ui)**. Creating `QWidget + UI`, `QDialog + UI` or `QMainWindow + UI` creates the editable C++ `.h/.cpp` class files together with the Designer `.ui` file. The UI-only workflow deliberately creates only XML for `uic`; Qt does not generate the application class source files from a `.ui` file.

An existing standalone `.ui` can now be converted with **QPM > Convert Designer Form to Qt C++ Class...**. QPM reads the Designer `<class>` and root widget type, preserves the form, creates the matching C++ wrapper under `include/` and `src/`, adds all references to the native project manifest and refreshes MOC/UIC generated artifacts. This command is available from the QPM Workspace, VS Code Explorer and editor QPM menus for Qt/C++ projects.

## QPM 0.17.7 — Generated Qt files in Workspace

QPM now exposes the active native Qt build profile's generated directory directly in the **Workspace** tree. Each native Qt project gets a dedicated **Generated Files** node showing generated `moc_*.cpp`, `ui_*.h`, `qrc_*.cpp` files and any other generated artifacts, including nested directories. The node follows the active Debug/Release and 32/64-bit build mode and refreshes when the mode changes or after project build/rebuild/clean operations.

Generated entries are deliberately read-only from the project-management point of view: they can be opened, revealed in the system Explorer and have their path copied, but QPM does not offer rename/remove/exclude actions because the files are regenerated from the source `.h`, `.ui` and `.qrc` inputs.

## QPM 0.17.6 — Qt/C++ Designer regression fix

QPM 0.17.6 restores the exact Qt/C++ Designer process-launch behavior from QPM 0.10.0, which was physically validated on Windows before Qt for Python was integrated. The C++ and PySide6 Designer launchers are now intentionally different: C++ uses the historical direct `designer.exe` behavior, while PySide6 retains Windows console suppression.

## Version 0.17.4 — Recovery-safe Qt Widgets Designer

QPM now detects pending crash-recovery state from the standalone Qt Widgets Designer on Windows. When such state is present and the Designer executable was auto-detected, QPM leaves the recovery registry entries and backup files untouched and automatically opens the requested `.ui` file with the Qt Creator integrated Designer instead. Qt Creator is discovered from the Qt installation tree (for example `Tools/QtCreator/bin/qtcreator.exe`) and is launched with `-no-crashcheck` so an unrelated Qt Creator crash-check dialog cannot replace the Designer recovery dialog.

The normal single-session `designer.exe --server` broker remains the default when no recovery state is pending. An explicitly configured `designer.exe` override is also respected.


Qt Project Manager and Build (QPM) provides project-oriented Qt workflows in Visual Studio Code for both **Qt/C++** and **Qt for Python / PySide6**. C++ projects can use QPM's direct `moc`/`uic`/`rcc` build engine, qmake or CMake, while Python projects can use project-local interpreters, virtual environments, `pyside6-project`, Designer and PySide6 deployment tools.

## Version 0.17.3 — Single-session Qt Widgets Designer

QPM now keeps one standalone Qt Widgets Designer process per resolved `designer.exe` and opens additional `.ui` forms through Designer's built-in local server channel instead of spawning a new Designer process for every click. This avoids multiple Designer instances competing for the same QtProject/Designer recovery state, which could incorrectly trigger the “last session was not terminated correctly” backup prompt.

On Windows the Designer server is launched with its console hidden and without a detached Windows process group. Qt Creator remains available as an explicit launcher through **Select Qt Widgets Designer Executable**. QPM never deletes Designer recovery data automatically; if a stale recovery dialog exists from an older session, handle it once and close any old Designer processes normally.

## Version 0.17.0 — C/C++ dependency managers

Version 0.17.0 adds project-local dependency management for native Qt/C++ projects. QPM can drive **vcpkg manifest mode**, **Conan 2** and **pkg-config/pkgconf**, then publish a normalized build-integration file consumed by the direct, qmake and CMake backends. Qt for Python projects continue to use their Python environment and `pip`/`pyproject.toml` workflow.

A dedicated **Qt Dependencies** view reports configured managers, executable discovery, synchronization state, package count and generated output. The same operations are available from Qt Project Settings and the consolidated editor/Explorer context menus.

### Manifest schema v17

Schema v17 adds a top-level `dependencies` section. It stores manager enablement, tool overrides, manifests, triplets/profiles, package requirements, pkg-config search paths, additional libraries/include paths and optional CMake package/target metadata. Existing schema-v1 through schema-v16 projects migrate automatically with dependency management disabled by default and a sibling backup of the previous manifest.

The dependency workflow supports:

- generation of project-local `vcpkg.json` manifests with optional builtin baseline, features, target/host triplets and overlay ports/triplets;
- project-local vcpkg installation under `.qpm/dependencies/vcpkg_installed` by default;
- Conan 2 `conanfile.txt` generation with `[requires]`, `[tool_requires]`, `[options]`, `CMakeDeps`, `CMakeToolchain`, `PkgConfigDeps` and `cmake_layout`;
- Conan host/build profiles, lockfiles, `--build=missing` and additional install arguments;
- `pkg-config`/`pkgconf` resolution of compiler/linker flags, including static-link mode and project-local `PKG_CONFIG_PATH` entries;
- normalized `.qpm/dependencies/integration.json` output shared by all native C++ build backends;
- automatic dependency synchronization before Build when explicitly enabled;
- additional CMake `find_package(...)` declarations and imported targets for generated CMake backends;
- dependency reports, tool detection, output reveal and cleanup actions.

## Version 0.16.0 — Qt for Python / PySide6

Version 0.16.0 adds first-class **Qt for Python** support without replacing the existing C++ workflow. QPM can create Qt Widgets and Qt Quick projects backed by PySide6, maintain a project-local `.venv`, select or synchronize the Python interpreter, install PySide6 on request, build/run/debug the application, open PySide6 Designer, compile `.ui` and `.qrc` resources and drive the PySide6 deployment tools.

Two native project kinds are available:

- **Qt for Python — Widgets (PySide6)** for traditional QWidget applications and Designer `.ui` files;
- **Qt for Python — Quick (PySide6)** for QML/Qt Quick applications.

A dedicated **Qt for Python** view reports Python/PySide6 readiness and exposes environment, build, run, debug, clean, Designer, deployment and report commands. The central Qt Project Settings page contains interpreter, virtual-environment, project-file, entry-point, UI-generation, tool-override and deployment settings.

### Manifest schema v16

Schema v16 adds a top-level `python` block and Python source-file registration. Existing C++/Qt projects migrate with the Python backend disabled, so their build and deployment behavior remains unchanged. Qt Quick Python projects can reuse the QML language-server and module infrastructure introduced in QPM 0.13.

The Qt for Python workflow supports:

- project-local `.venv` creation with `python -m venv`;
- explicit interpreter selection and VS Code `python.defaultInterpreterPath` synchronization;
- optional `python -m pip install PySide6`;
- `pyside6-project` build/run integration;
- `pyside6-designer`, `pyside6-uic` and `pyside6-rcc`;
- `debugpy` launch configuration generation;
- desktop deployment through `pyside6-project deploy` or `pyside6-deploy`;
- `pyside6-android-deploy` integration when enabled and supported by the host/toolchain;
- project-local environment variables and additional build/deployment arguments.

## Version 0.15.2 — EPERM-safe deferred clean

Version 0.15.2 removes the last Windows clean race. **Clean Project** no longer recreates `generated` and `obj` immediately after moving the previous build directory aside. Their creation is deferred to the next build, where QPM applies its existing retry and diagnostic logic. If Windows prevents the atomic rename, QPM cleans in place while preserving the directory roots and deleting only their contents.

## Version 0.15.1 — Qt Designer module inference and reliable clean

Version 0.15.1 detects module requirements introduced by `.ui` files and source headers. For example, adding `QOpenGLWidget` in Qt Designer automatically adds the `OpenGLWidgets` module to direct, qmake, CMake, Android, Apple and IntelliSense plans. The project manifest can still list the module explicitly, but a missing manual entry no longer causes an undefined-reference linker failure.

Direct-build cleanup stops matching applications launched by QPM and atomically moves the previous mode directory aside. The initial 0.15.1 implementation recreated `generated` and `obj` immediately; version 0.15.2 supersedes that step by deferring directory creation to the next build to avoid a remaining Windows `EPERM` race.

## Version 0.15.0 — Publication and application updates

Version 0.15.0 adds a complete desktop release-publication layer on top of QPM packaging and installer workflows. Projects can generate Windows MSIX packages, `.appinstaller` update descriptors, WinGet manifest sets, release metadata and SHA-256 checksum files, then publish the assembled bundle to a local directory, an SSH/rsync destination or a GitHub Release.

A dedicated **Qt Publication & Updates** view reports product identity, release channel, tool readiness, output paths and blocking configuration issues. The same actions are available from Qt Project Settings and the consolidated editor/Explorer context menus.

### Manifest schema v15

Schema v15 adds a top-level `publication` section. It contains release-channel and artifact-selection settings, MSIX/App Installer identity and update behavior, WinGet metadata, GitHub Release options and local/SSH publication targets. Existing schema-v1 through schema-v14 projects migrate automatically with a sibling backup.

The publication workflow supports:

- Windows SDK `MakeAppx` discovery and MSIX creation from the portable Qt staging directory;
- optional MSIX signing through the existing SignTool/certificate configuration;
- `.appinstaller` generation with launch-time and background update policies;
- WinGet version, installer and default-locale manifests plus CLI validation when available;
- release bundles containing portable packages, desktop installers, MSIX, Qt IFW repositories and WinGet metadata;
- `release.json`, `latest.json`, Markdown release notes and `SHA256SUMS.txt` generation;
- local-directory publication, SSH upload through `scp` or `rsync`, and GitHub Release creation through `gh`;
- secret-free manifests: authentication remains delegated to certificate environment variables, SSH keys and authenticated CLI sessions.

## Version 0.14.0 — Apple platforms

Version 0.14.0 adds project-local **macOS**, **iOS Simulator** and **iOS Device** platform profiles. QPM detects Xcode and its command-line tools, generates isolated CMake/Xcode projects for iOS, builds with `xcodebuild`, manages iOS simulators through `simctl`, deploys macOS application bundles with `macdeployqt`, and exposes signing, verification, notarization and ticket-stapling workflows.

A dedicated **Qt Apple Platforms** view reports host/tool readiness and provides configuration, build, deployment, DMG, signature, notarization, simulator and output-management commands. Apple actions remain visible on non-macOS hosts but are reported as unavailable instead of attempting unsupported commands.

### Manifest schema v14

Schema v14 extends platform profiles with Xcode paths, bundle identity, deployment target, architectures, development team, signing identity, provisioning, entitlements, simulator/device selection, DMG options, hardened runtime, timestamping, `notarytool` keychain profile and additional CMake/Xcode/macdeployqt arguments. Existing schema-v1 through schema-v13 projects migrate automatically with a sibling backup.

The Apple workflow supports:

- macOS app-bundle deployment and optional DMG creation through `macdeployqt`;
- iOS Xcode-project generation with `qt-cmake`;
- iOS Simulator selection, boot, install and launch through `xcrun simctl`;
- automatic or manual Xcode signing configuration;
- `codesign` verification and Gatekeeper assessment;
- Developer ID notarization through `xcrun notarytool`;
- notarization ticket attachment through `xcrun stapler`;
- per-project tool overrides and Apple build arguments.

## Version 0.13.2 — Last active workspace restoration

Version 0.13.2 corrects QPM startup persistence. The workspace explicitly loaded most recently in the current VS Code window is now restored before QPM evaluates project-folder association markers. An older project folder that remains in the VS Code window can therefore no longer replace the active Qt Quick workspace after an application restart.

QPM persists the selected `.cws`, `.qtproject.json` or compatibility `.prj` path in both window-local state and a global fallback. The local value preserves the workspace selected for a specific VS Code window; the global value covers empty and untitled windows whose local identity may change between launches. Folder associations and exact-folder discovery remain fallback mechanisms when no valid explicit selection exists.

## Version 0.13.1 — qmlls client compatibility

Version 0.13.1 hardens the QML Language Server client introduced in 0.13.0. QPM now accepts the dotted `workspace.didChangeWatchedFiles` dynamic-registration method emitted by affected `qmlls` builds while its project watchers continue forwarding standard file-change notifications. C/C++ sources, headers and CMake fragments are included so external edits to QML type registrations are visible to the server.

QML Language Server startup is serialized, the **Start QPM qmlls anyway** action continues the current startup operation, and generated `.qmlls.ini` files are updated only when their content changes. This removes duplicate generation messages and avoids competing automatic/manual server starts.

## Version 0.13.0 — QML Language Server and modules

Version 0.13.0 adds project-scoped QML code intelligence through Qt's `qmlls` executable. QPM resolves `qmlls` from the active Qt kit, starts and stops it through a VS Code Language Server client, publishes the active build directories and supplies the project, module and Qt import roots.

A dedicated **QML Language & Modules** view exposes server state, readiness, duplicate-server protection, `.qmlls.ini` generation, `qmldir` generation, reports, server output and protocol traces. Qt Quick and Qt Quick Test projects enable automatic startup by default, while other project kinds remain opt-in.

### Manifest schema v13

Schema v13 adds a top-level `qml` configuration containing language-server lifecycle, executable override, build/import paths, CMake behavior, trace level, official-extension conflict policy and module URI/version/import-root/resource-prefix metadata. Existing schema-v1 through schema-v12 projects migrate automatically with a sibling backup.

The QML workflow supports:

- kit-local `qmlls` discovery and per-project executable overrides;
- active build-directory publication through the QML Language Server protocol;
- explicit and environment-based QML import roots;
- generated or user-managed `.qmlls.ini` files;
- generated `qmldir` files with `pragma Singleton` detection;
- QML syntax/language configuration before the server starts;
- automatic restart when the active native project changes;
- duplicate-diagnostic protection when the official Qt QML extension is installed.

## Version 0.12.3 — Unified opaque settings header

Version 0.12.3 refines the Qt Project Settings scrolling experience after the dynamic-height correction introduced in 0.12.2. The action toolbar and filter/navigation row now live inside one opaque sticky container. This removes the transparent interstice that previously allowed settings cards to remain visible between the two fixed rows while scrolling.

The complete sticky container is measured with `ResizeObserver`, so section jumps and `scroll-margin-top` continue to adapt to wrapped buttons, window resizing and editor zoom. The desktop installer workflow validated in 0.12.2 is unchanged.

## Version 0.12.2 — Qt deployment and settings navigation

Version 0.12.2 selects the `windeployqt` runtime mode from the Qt DLLs actually linked by the target, prepares the selected kit environment and keeps the settings filter visible when the action toolbar wraps.

## Version 0.12.1 — Desktop installers, updates and signing

Version 0.12.1 retains the desktop distribution workflow introduced in 0.12.0 and corrects Windows build-directory preparation, `windres` output creation and Inno Setup command-line compiler selection. QPM can generate and compile installers with **Qt Installer Framework**, **Inno Setup** or **NSIS**, create Qt IFW update repositories and sign Windows executables with **SignTool**.

A dedicated **Qt Installers & Signing** view reports backend readiness and provides installer generation, source generation, repository creation, signing, verification, report and cleanup actions. The same commands are grouped under **QPM → Installers / signing** in editor and Explorer context menus.

### Manifest schema v12

Schema v12 adds `packaging.installer` with shared installer identity/output settings and backend-specific sections for Qt IFW, Inno Setup, NSIS and Authenticode. Existing schema-v1 through schema-v11 projects migrate automatically with a sibling backup.

The installer workflow supports:

- rebuilding or reusing the portable package staging directory;
- offline, online and hybrid Qt IFW installers;
- generated Qt IFW `config.xml`, package metadata and shortcut scripts;
- Qt IFW update repositories through `repogen`;
- generated or custom Inno Setup `.iss` scripts;
- generated or custom NSIS `.nsi` scripts;
- automatic tool discovery with per-project executable overrides;
- signing the staged target and/or final installer;
- certificate selection by PFX, thumbprint, subject or automatic store selection;
- RFC 3161 timestamping and post-signature verification.

Certificate passwords are referenced by environment-variable name only. QPM does not write the secret into the project manifest, reports or command previews.

## Version 0.11.0 — Android and devices

Version 0.11.0 adds project-local **Qt for Android** profiles, environment detection and device workflows. QPM detects Android SDK/NDK/JDK installations, Qt Android kits, CMake/Ninja, `androiddeployqt`, ADB, command-line SDK tools and emulators. A dedicated **Qt Android & Devices** view provides configuration, package build, installation, launch, uninstall, wait-for-debugger and logcat actions.

Android builds use an isolated CMake project under `.qpm/android`, Qt's `qt-cmake` tool and the package targets provided by Qt for Android. QPM supports APK, Android App Bundle (AAB) and Android Archive (AAR) outputs, one or several ABIs, Android API/build-tools settings, application identity/version metadata and optional Release signing through password environment variables.

### Manifest schema v11

Schema v11 extends platform and kit profiles with Android SDK/NDK/JDK paths, ABIs, API levels, package metadata, device/AVD selection, ADB/logcat behavior and signing references. Existing schema-v1 through schema-v10 projects migrate automatically with a sibling backup. Desktop remains the default platform, so existing projects retain their current workflow.

### Android workflow

- configure or auto-detect Android SDK, NDK and JDK;
- assign a Qt for Android kit such as `android_arm64_v8a`;
- install missing SDK platform/build-tools packages with `sdkmanager`;
- select a USB device or emulator through ADB;
- build APK, AAB or AAR packages;
- install, launch and uninstall applications;
- start an AVD and stream filtered logcat output;
- launch the application in Android wait-for-debugger mode;
- inspect readiness and generated package locations from dedicated reports.

## Version 0.10.0 — Extended testing

Version 0.10.0 extends the native VS Code Testing integration with **CTest** and **Boost.Test** while preserving Qt Test, Qt Quick Test, GoogleTest and Catch2. CTest test inventories are read from `ctest --show-only=json-v1`, including labels, commands, working directories, disabled state and source backtraces when CMake provides them. Selected CTest tests run through the active build tree or a named CMake test preset and publish JUnit results in the VS Code Test Explorer.

Boost.Test macros are discovered directly in C++ sources, including nested suites and fixture/data test cases. QPM runs selected Boost.Test cases with a JUnit log sink and project-local log/report/randomization settings. Failed tests can be rerun from the Qt Tests & Quality view, and compact execution history is stored below `.qpm/test-results` with open and clear actions.

### Manifest schema v10

Schema v10 extends `testing` with parallel execution, stop-on-failure, repeat policies, history retention, CTest executable/build/preset/filter configuration and Boost.Test runtime options. Existing schema-v1 through schema-v9 projects migrate automatically with a sibling backup.

## Version 0.9.0 — Profiling and diagnostics

Version 0.9.0 adds project-local profiling and diagnostic workflows. The active manifest now stores QML Profiler, CPU, memory, Cppcheck and system-trace settings, while a dedicated **Qt Profiling & Diagnostics** view exposes tool readiness and the common actions.

QPM can start `qmlprofiler` against an application launched with the QML debugging socket, record CPU activity with `perf` or Valgrind Callgrind, analyze memory with Valgrind Memcheck or Heob, publish Cppcheck XML diagnostics in the VS Code Problems panel, and capture Linux system calls with `strace`. Generated traces and reports are grouped below `.qpm/profiling` by default and can be opened, revealed or cleaned from QPM.

### Manifest schema v9

Schema v9 adds the `profiling` configuration. Existing schema-v1 through schema-v8 projects migrate automatically with a sibling backup. Tool paths can be configured globally, while project-specific profiler settings, arguments, environment, timeouts and output templates stay inside the native project manifest.

## Version 0.8.0 — Packaging and product metadata

Version 0.8.0 adds project-local product identity and portable packaging. The native manifest now stores the product name/version, publisher, application identifier, description, copyright, icon, license/readme files, distribution directory, archive naming pattern and runtime-content policy.

QPM can generate Windows version resources and manifests, Linux desktop entries and a machine-readable package manifest. With the direct MinGW backend, `windres` compiles the generated `.rc` file and links the metadata into the target; generated qmake and CMake projects receive the same resource automatically. The **Qt Packaging** view and the central project settings page can build, stage, validate, reveal and clean portable distributions.

Portable packages can be produced as a directory, ZIP or `tar.gz`. The staging workflow can include the Qt runtime, application translations, selected documentation, extra files and optional debug symbols. Packaging status and missing metadata files are reported in Qt Project Health.

### Manifest schema v8

Schema v8 adds the `packaging` configuration. Existing schema-v1 through schema-v7 projects migrate automatically with a sibling backup. The initial 0.8.0 scope focuses on reproducible portable packages and embedded product metadata; native installer authoring, code signing and store publication remain future work.

## Version 0.7.3 — Consolidated menus and settings UX

Version 0.7.3 consolidates every editor and Explorer right-click action behind a single **QPM** submenu. Project/configuration, build/run/debug, Qt tools, tests/quality, documentation, snippets and utilities are separated into contextual subgroups instead of appearing as a long flat command list.

The **Qt Project Settings** webview is now a searchable control center with section navigation, contextual fields, file/folder browsers, preset suggestions, unsaved-change feedback and keyboard-accessible help icons. Platform-, backend- and debugger-specific controls are shown only when relevant, while specialist profile and kit editors remain directly accessible from the same page.

The accompanying functional audit originally identified packaging, extended testing, profiling, Android and QML language-server integration as the main gaps. These workflows are now covered; the remaining emphasis is physical Apple/Android toolchain validation, store publication and deeper platform-specific debugging.

## Version 0.7.2 — Build-mode toolbar and categorized snippets

Version 0.7.2 makes the D32/R32/D64/R64 item in the QPM workspace toolbar interactive: clicking the current mode now opens the complete build-mode selector, just like the target-type item, while the dedicated palette commands remain available for direct selection.

The editor context menu now organizes snippets under Qt, classic C, classic C++, Windows/communication, documentation and saved-user categories. The generic **Insert snippet** command uses the same two-stage category picker and the built-in library now includes Qt Widgets/Core entry points, type-safe signal/slot connections, QObject and Q_PROPERTY skeletons, QTimer, QSettings, QFile, resources, logging, Qt Test and QML type registration.

## Version 0.7.1 — Persistent project configuration

Version 0.7.1 makes the native `.qtproject.json` manifest the durable source of truth for the active build variant and architecture. D64/R64 selections now survive project switches and VS Code restarts, and debug launch no longer converts an `architecture: auto` Qt 64-bit kit to D32.

### Manifest schema v7

Schema v7 adds `profiles.active.buildMode`. Existing schema-v1 through schema-v6 projects migrate automatically with a sibling backup. Project profiles, platform settings, run/deploy/debug configuration and the active build mode are restored together when the project is loaded.

## Version 0.7.0 — Platforms

Version 0.7.0 adds project-local platform profiles and a dedicated **Qt Platforms** view. A native Qt project can target the local desktop, local Linux, a Remote Linux device, a Docker container or Qt for WebAssembly without replacing its existing kit, build, run, deploy and debug profiles.

Platform profiles record the platform-specific environment and toolchain details: sysroot and environment for local Linux; SSH, rsync/SCP, remote build/deploy/run directories and optional gdbserver for Remote Linux; image, container workspace, Docker options and custom commands for containers; Emscripten SDK, HTML entry point, web server and browser behavior for WebAssembly.

The platform service provides **Build**, **Deploy**, **Run** and **Build + Deploy + Run** workflows, capability detection, Remote Linux terminals, Docker shells and WebAssembly serving. Platform readiness is also exposed in Qt Project Health, the quick actions summary and the central Qt Project Settings page.

### Manifest schema v6

Schema v6 adds `profiles.platforms` and `profiles.active.platformProfileId`. Schema-v1 through schema-v5 projects migrate automatically with a sibling backup. The default profile remains **Desktop**, preserving the established Windows/MinGW workflow.

### Supported platform workflows

- **Desktop**: existing direct, qmake and CMake workflows.
- **Local Linux**: local build/run with Linux kit environment and optional sysroot.
- **Remote Linux**: source synchronization, remote qmake/CMake/custom build, deployment and execution through OpenSSH.
- **Docker**: bind-mounted project builds and runs through a selected container image.
- **WebAssembly**: Emscripten-aware kit profiles, generated HTML target discovery and local serving through `qtwasmserver` or Python.

## Version 0.6.0 — Advanced debugging

Version 0.6.0 adds project-local debug profiles and a dedicated **Qt Debugging** view. A profile can launch a native target, attach to a local process, connect to a remote GDB Server, open a core/dump file, attach the QML debugger, or combine native C++ and QML debugging.

Debug profiles record the build and run profiles they depend on, debugger selection, program/arguments/working directory, environment, source mappings, shared-library search paths, core-dump path, remote host/port, optional SSH gdbserver startup, Qt pretty-printing preferences and QML debugger settings. QPM can export the profiles to `.vscode/launch.json` while preserving unrelated user configurations.

The active kit selects GDB, LLDB or the Visual Studio debugger automatically. GNU sessions enable pretty printing, optional breaks on Qt fatal/assert helpers and installed Qt source lookup. MSVC sessions use `cppvsdbg` and load Qt Natvis data when it is available. Debugging a test now follows the same kit-specific debugger selection.

For Qt Quick projects, mixed profiles add `QT_QML_DEBUG`, launch the application with `-qmljsdebugger=port:<port>,block,services:...`, then attach the official `qml` debug adapter. Remote profiles can connect to an existing gdbserver or start one through SSH before the C++ debugger attaches.

### Manifest schema v5

Schema v5 adds `profiles.debugs` and `profiles.active.debugProfileId`. Schema-v1 through schema-v4 projects migrate automatically with a sibling backup.

## Version 0.5.2 — Workspace-state and IntelliSense cleanup

Version 0.5.2 hardens QPM startup when test projects or workspaces have been deleted. Stale project associations are removed, missing last-used workspaces now fall back to the blank QPM home page, and automatic discovery no longer scans broad parent directories recursively. The activation cleanup also removes obsolete QPM-managed `c_cpp_properties.json` files instead of leaving the invalid `"configurations": []` structure rejected by Microsoft C/C++.

## Version 0.5.1 — Direct-link response-file fix

Version 0.5.1 fixes a Windows/MinGW regression introduced by the 0.5.0 direct backend. GNU response files treat backslashes as escape characters, so drive-qualified object, Qt library and output paths could lose every directory separator during linking. QPM now serializes Windows paths with GNU-safe forward slashes, escapes the remaining response-file characters correctly, and only creates `qpm_link.rsp` when the linker command is genuinely long. Small projects use ordinary process arguments, as they did before 0.5.0.

## Version 0.5.0 — Backends and named kits

Version 0.5.0 turns the project-local kit/build profile model into an operational multi-backend workflow.

### Named Qt kits

QPM stores reusable kits in its global storage and can assign them to any native project. A named kit records:

```text
Qt installation and version
C and C++ compilers
Compiler family and target architecture
Debugger type and executable
Visual Studio environment script when applicable
qmake and CMake executables
make, jom, nmake or Ninja
CMake generator
Desktop device profile
```

The **Qt Kits & Backends** view detects, updates, renames, deletes and assigns kits. Assigning a kit updates every build profile in the active project while preserving project-local copies.

### Direct, qmake and CMake backends

Each Debug or Release profile can select one of three backends:

- **Direct Qt build**: QPM invokes `moc`, `uic`, `rcc`, the compiler, archiver and linker itself.
- **qmake**: QPM generates a `.pro` file or imports an existing one, runs qmake, then invokes `mingw32-make`, `jom` or `nmake`.
- **CMake**: QPM generates `CMakeLists.txt` and `CMakePresets.json`, or imports an existing CMake project/preset, then runs configure/build/clean through CMake.

The generated qmake and CMake projects preserve the native manifest's source lists, Qt modules, forms, resources, translations, include/library directories, definitions, target kind and output location.

### MSVC and debugger selection

MSVC kits resolve `vcvarsall.bat`, `cl.exe`, `lib.exe`, `nmake`/`jom` or Ninja. qmake and CMake commands run inside the captured Visual Studio developer environment. Run/debug chooses `cppvsdbg` for MSVC/CDB kits and `cppdbg` with GDB or LLDB for GNU/Clang kits.

The direct backend remains intentionally limited to GCC/MinGW and Clang. MSVC projects use qmake or CMake.

### Build performance and project generation

Build profiles now support:

```text
Parallel job count
Precompiled header
Unity build
Response files for long direct-link commands
Backend configure/build/clean arguments
Generated or imported backend files
CMake configure/build presets
```

CMake publishes its authoritative `compile_commands.json`. Before a backend has configured, QPM creates a project-local fallback compilation database so IntelliSense remains available immediately after switching from the direct backend.

### Manifest schema v4

Schema v4 adds complete named-kit metadata and backend configuration to every build profile. Schema-v1 through schema-v3 manifests are migrated automatically with a sibling backup.

## Version 0.4.0 — Tests and quality

Version 0.4.0 integrates native Qt/C++ test discovery and quality workflows with the project-local kit, build, run and deployment profile model.

### VS Code Test Explorer

QPM publishes discovered tests through the VS Code Testing API. The active workspace is scanned automatically and the following frameworks are recognized:

- Qt Test private slots;
- Qt Quick Test QML `TestCase` functions;
- GoogleTest `TEST`, `TEST_F`, `TEST_P` and typed-test macros;
- Catch2 `TEST_CASE` and `SCENARIO` declarations.

Tests can be run from Test Explorer, from the **Qt Tests & Quality** view, or directly under the cursor. Qt Test and Qt Quick Test results are read from JUnit XML output; GoogleTest XML and Catch2-compatible selection are also supported. A dedicated debug profile starts the selected test in the VS Code C++ debugger.

New native templates include **Qt Test application**, **Qt Quick Test application**, **Qt Test class** and **Qt Quick TestCase**. Project settings expose framework selection, test timeout, build-before-run, extra arguments, environment variables and the optional Qt offscreen platform.

### Static analysis

The active compilation database drives project- and file-level analysis:

```text
Clang-Tidy current file / project
Apply Clang-Tidy fixes
Clazy current file / project
Clear quality diagnostics
```

Diagnostics are published in the Problems panel and linked to source locations. QPM resolves tools from explicit settings, the selected Qt toolchain, Qt's Tools directories or `PATH`.

### Sanitizers and coverage

QPM can create project-local Debug profiles for:

```text
AddressSanitizer
UndefinedBehaviorSanitizer
Address + Undefined Sanitizers
Coverage (--coverage)
```

The Test Explorer coverage profile and **Run All Tests with Coverage** command force an instrumented build, run the selected tests, invoke `gcov` on produced `.gcno` data and publish line coverage through the VS Code coverage API.

### Manifest schema v3

Native manifests now include explicit `testing` and `quality` sections. Schema-v1 and schema-v2 projects are migrated automatically with a sibling backup before persistence. Existing kit, build, run and deployment profiles remain compatible.

## Version 0.3.2 — QRC resource opening fix

The graphical QRC editor now opens referenced resources with the editor registered by VS Code. Image resources such as PNG, JPEG, SVG and ICO files therefore open in the image preview, while text and QML resources continue to open in their normal editors. Relative paths are resolved from the `.qrc` directory and failures expose actionable diagnostics.

## Version 0.3.0 — Qt tools

Version 0.3.0 adds a project-aware Qt tool layer on top of the native direct-build workflow. The active project profile and selected Qt kit now drive Qt Linguist, resource editing, QML quality tools and official Qt documentation access.

### Qt Linguist and translations

QPM can create `.ts` catalogs, update source strings with `lupdate`, open catalogs in Qt Linguist, generate `.qm` files with `lrelease` and display translation coverage. Translation files are registered in the native manifest automatically. An active deploy profile can release and copy application catalogs to the target `translations` directory.

Commands include:

```text
Qt Project Manager: Create Translation
Qt Project Manager: Update Translations
Qt Project Manager: Release Translations
Qt Project Manager: Open Translation in Qt Linguist
Qt Project Manager: Show Translation Status
```

### Graphical Qt resource editor

Opening a `.qrc` file from the QPM tree launches a graphical resource editor. It manages resource prefixes, language qualifiers, source files, aliases and empty-file markers. The editor validates missing files, duplicate runtime paths and reserved Qt prefixes before saving, and creates a first-write backup when enabled.

### QML tools

The selected Qt kit supplies `qmllint`, `qmlformat` and the `qml`/`qmlscene` preview runtime. QPM supports file- and project-level linting and formatting, diagnostic integration in VS Code, configurable import paths, lint-on-save, optional format-on-save and external preview.

### Qt documentation and tool health

The selected editor symbol can be searched directly in the official documentation for the active Qt major version. A new **Qt Tools** view groups translations, resources, QML and documentation actions. Qt Project Health now reports the availability of Linguist, resource and QML tools.

## Version 0.2.9 — Home workspace actions

Version 0.2.9 completes the home-page workspace workflow. A new workspace and native Qt project can now be created even while another workspace is already loaded, and an additional native Qt project can be added directly to the current `.cws` workspace. Automatic IntelliSense preparation remains enabled throughout these creation paths.

### Immediate project readiness

Creating either a standalone native project or a workspace with a native project now performs the following sequence:

```text
Create .qtproject.json
Resolve the project-local Qt kit and compiler
Generate stale uic/moc/rcc outputs
Add the exact project root to the VS Code workspace
Write .vscode/c_cpp_properties.json
Write compile_commands.json
Activate Microsoft C/C++ when installed
Request a C/C++ workspace rescan
```

This means starter files can resolve both Qt headers such as `QApplication` and generated headers such as `ui_mainwindow.h` without running the manual synchronization command first.

Automatic synchronization is also triggered when:

- a native Qt project or workspace is opened;
- QPM restores the previous project during activation;
- a Qt/C++ source or header is opened;
- the selected Qt kit or matching compiler changes;
- Qt modules or project profiles change;
- the relevant QPM IntelliSense settings change.

A successful build requests another C/C++ rescan so newly generated MOC/UIC/RCC files are visible immediately.

The settings `qpm.autoConfigureCppTools` and `qpm.autoAddQpmFolderToWorkspace` are now enabled by default. They can still be disabled explicitly for users who manage Microsoft C/C++ configuration themselves.

## Version 0.2.6 — Consolidation

Version 0.2.6 consolidates the native Qt workflow introduced in the 0.2.x series. It adds project-local profiles, exact compiler dependency tracking, a project health view and a smaller embedded JC Lib catalog while preserving compatibility with existing manifests and `.cws/.prj` workspaces.

### Manifest schema v3 and project profiles

Native projects now use schema version 3. The schema-v2 profile model remains unchanged and is extended with test and quality configuration. The manifest contains four explicit profile families:

- Qt kit profiles: Qt installation and toolchain identity;
- build profiles: backend, variant, C++ standard, MOC/UIC/RCC, output paths and flags;
- run profiles: arguments, working directory and environment;
- deploy profiles: deployment activation and destination policy.

Each project selects its own active Debug, Release, run and deploy profiles. The command **Qt Project Manager: Manage Project Profiles** changes the active profiles or duplicates an existing build, run or deploy profile.

A version 1 manifest is migrated automatically when loaded. QPM writes a sibling backup before changing the file:

```text
MyApplication.qtproject.json.schema-v1.backup
```

The legacy top-level `qt` and `build` sections remain synchronized so older QPM code and external tooling can still inspect the project.

### Exact incremental builds

For GCC and Clang toolchains, QPM now emits one dependency file per object:

```text
-MMD -MP -MF <object>.d
```

The next build reads the compiler-produced dependency graph and recompiles only the translation units affected by a changed or missing included header. This replaces the previous project-wide header timestamp heuristic.

The direct build sequence remains:

```text
.ui  -> uic -> ui_*.h
Q_OBJECT/Q_GADGET/Q_NAMESPACE -> moc -> moc_*.cpp or *.moc
.qrc -> rcc -> qrc_*.cpp
C++ and generated sources -> compiler -> object files + .d files
objects + Qt modules -> linker -> executable/library
```

### Qt Project Health

The **Qt Project Health** view checks the active native project before a build. It reports:

- manifest schema and profile consistency;
- selected kit, compiler ABI and architecture compatibility;
- active build backend and C++ standard;
- missing source, header, form, resource, QML or translation files;
- MOC, UIC and RCC availability;
- IntelliSense files and compile database;
- direct-build plan validity;
- run and deployment profile status.

Actions in the view open the relevant repair, settings, build-plan or synchronization command. A Markdown report can also be opened from the view toolbar.

### Qt kit and compiler safety

A native Qt project uses the compiler associated with the selected kit, not a stale generic CPM/QPM compiler. QPM probes the compiler target and rejects incompatible combinations, such as a 32-bit MinGW compiler with a Qt `mingw_64` kit.

For a layout such as:

```text
C:\Qt\Qt6.11.0\6.11.0\mingw_64
C:\Qt\Qt6.11.0\Tools\mingw1310_64\bin\g++.exe
```

QPM resolves the toolchain from the surrounding Qt installation. Use **Qt Project Manager: Repair / Select Matching Qt Compiler** for a custom installation.

### Managed C++ IntelliSense

QPM writes project-local IntelliSense files beside the native manifest:

```text
MyApplication/
├── MyApplication.qtproject.json
├── compile_commands.json
└── .vscode/
    └── c_cpp_properties.json
```

The generated configuration uses the active Qt kit compiler, module include directories, project includes, generated MOC/UIC/RCC paths, defines and C++ standard.

### Qt Widgets Designer

Clicking a `.ui` file in the QPM workspace launches Qt Widgets Designer directly. On Windows QPM launches the GUI process without creating a visible console window.

New QPM Widgets forms start with an empty `centralWidget`, without an imposed top-level layout, so widgets can initially be positioned and resized freely with the mouse. Once a Qt layout is applied, Qt itself owns the child-widget geometry; use **Form > Break Layout** or `Ctrl+0` to return to free positioning. Existing `.ui` files are not changed by QPM.

QPM can also use Qt Creator's integrated Widgets Designer. Select `qtcreator.exe` with **Qt Project Manager: Select Qt Widgets Designer Executable**. A typical Qt 6.11 installation uses `C:\Qt\Qt6.11.0\Tools\QtCreator\bin\qtcreator.exe`.

QPM searches the selected kit, the surrounding Qt installation and its `Tools` directory, then uses Qt Creator as a controlled fallback. A custom path can be selected with **Qt Project Manager: Select Qt Widgets Designer Executable**.

### Native project templates

**Qt Project Manager: Create Workspace and Native Qt Project** creates a `.cws` workspace referencing a `.qtproject.json` project. Available project types include:

- Qt Widgets application;
- Qt console application;
- Qt Quick application;
- Qt shared library;
- Qt static library;
- Qt Test application;
- Qt Quick Test application.

The **Create New File or Starter...** menu includes Qt entry points, `QObject`, `QWidget`, `QDialog`, `QMainWindow`, Designer forms, resource collections and QML files. Created files are registered automatically in the native manifest.

### Embedded JC Lib catalog

QPM embeds the JC Lib hierarchy model and ships a curated QPM-focused pack set:

```text
C
C++
Preprocessor
OpenCV
Build
Windows API / Devices
Scripting / System
Python
JavaScript / HTML / CSS
TypeScript
Database
PHP
Embedded
Qt
```

The Qt pack groups Qt language, QML, Multimedia, SQL/Test and PySide6 content under the canonical `QT` environment. Empty custom packs no longer receive an automatic `General` environment.

### Compatibility projects

Legacy `.cws/.prj` projects remain available through the inherited generic C/C++ pipeline. They do not invoke Qt `moc`, `uic` or `rcc`. Compatibility-only SDL, generic target and legacy build commands are hidden from the primary command surface when a native Qt project is active.

## Principal commands

```text
Qt Project Manager: Create Workspace and Native Qt Project
Qt Project Manager: Create Native Qt Project
Qt Project Manager: Detect / Select Qt Installation
Qt Project Manager: Repair / Select Matching Qt Compiler
Qt Project Manager: Manage Project Profiles
Qt Project Manager: Edit Qt Project Settings
Qt Project Manager: Edit Qt Modules
Qt Project Manager: Show Direct Qt Build Plan
Qt Project Manager: Synchronize Qt/C++ IntelliSense Configuration
Qt Project Manager: Open File in Qt Widgets Designer
Qt Project Manager: Deploy Qt Runtime
Qt Project Manager: Open Qt Project Health Report
Qt Project Manager: Start QML Language Server
Qt Project Manager: Generate .qmlls.ini
Qt Project Manager: Generate qmldir
Qt Project Manager: Configure Apple Environment
Qt Project Manager: Build Apple Target
Qt Project Manager: Create macOS DMG
Qt Project Manager: Notarize Apple Artifact
```

Build, rebuild, clean, run and debug are also available from the QPM activity bar and project context menus.

## Current validated scope

The primary physically validated workflow is Qt 6 dynamic desktop development on Windows with MinGW 64-bit. The direct backend supports Widgets, Console, Quick, shared-library and static-library project models. qmake, CMake, MSVC, Android, macOS/iOS, remote Linux, WebAssembly, QML debugging/language tooling, portable packaging and desktop installers are implemented, with platform-specific workflows requiring the corresponding external SDKs and tools.

## Development

```bash
npm install
npm run compile
npm run test:qt-all
npm run package
```

The full test suite uses simulated Qt tools and toolchains for deterministic regression coverage. A physical Windows Qt installation remains necessary for final platform validation.

### Automatic workspace restoration

When QPM adds a native Qt project directory to the VS Code workspace for IntelliSense, it stores a small `.vscode/qpm-workspace.json` association. This lets QPM automatically reopen the corresponding `.cws` workspace after VS Code reloads the window.

### QPM 0.29.1 — Designer custom-widget reliability

QPM 0.29.1 fixes generated `SignalPlot`/`RotaryKnob` compilation issues and makes Designer plugin builds robust when the project path contains spaces. Existing affected generated widget sources should be regenerated (or repaired manually) before rebuilding the Designer plugin.
