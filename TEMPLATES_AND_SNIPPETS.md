## QPM 0.30.0 — Build diagnostics

Build diagnostics are not generated project templates, but generated Qt/C++ sources benefit from the same parser. When compiler messages point at QPM-generated code, the structured log shows the generated file path and source line while the raw trace preserves the complete command line.

## QPM 0.28.0 Instrument Driver Registry and capabilities

Use **Create New File > Qt > Instrument Driver Registry + Capabilities** to generate `QpmInstrumentProfile`, `QpmInstrumentDriverRegistry` and the Designer-ready `InstrumentCapabilitiesControl`. Existing SCPI actions remain the executable commands; capabilities are stable semantic names linked to those action IDs.

Example profile fragment:

```json
{
  "capabilities": [
    {
      "id": "power.voltage-set",
      "label": "Voltage setpoint",
      "category": "power",
      "actions": ["voltage"]
    },
    {
      "id": "measure.dc-voltage",
      "label": "DC voltage measurement",
      "category": "measurement",
      "actions": ["measured-voltage"]
    }
  ]
}
```

Application logic can then ask `supportsCapability()` or use `invokeActiveCapability()` rather than checking whether the connected instrument is a Keysight, Rigol, Fluke, etc. For numeric/toggle capabilities, pass the requested value; with no value the runtime falls back to the mapped readback query when available.

The SCPI Profile Catalog & Editor exposes the same capability list visually and validates that every linked action ID exists. Older profiles without a capability list remain compatible through conservative action-ID inference.

The 0.28.0 acquisition templates also guarantee that `m_sampleRateHz` is declared in the generated acquisition controller/source state and propagated to the active buffer.

## QPM 0.27.0 — SCPI automatic profile matching

The **SCPI Instrument Manager + Auto Profile Detection** starter now generates `QpmScpiProfileMatcher` alongside the SCPI session, profile model, manager and Designer-ready control. A standard `*IDN?` reply is parsed and compared with project-local profile metadata. `InstrumentManagerControl` shows the best scored suggestion and requires an explicit **Apply suggested profile** action.

Typical setup:

```cpp
QpmInstrumentManager manager;
manager.setProfileDirectory("instrument_profiles");
manager.addInstrument("DMM", "192.168.1.40", 5025);
manager.connectInstrument("DMM");
// auto-identify -> suggestion after *IDN?

connect(&manager, &QpmInstrumentManager::profileApplied, this,
        [](const QString &name, const QString &profileId, const QString &path) {
            // load path into ProfiledInstrumentControl or application driver layer
        });
```

## 0.2.50 SDL add-on usage notes

SDL2 and SDL3 starter projects can use add-on packages such as TTF, image, mixer and net without manually editing linker flags. The build settings still expose `SDL packages`, but QPM can infer installed add-ons from source code. For example, `TTF_Init()` causes `SDL2_ttf` or `SDL3_ttf` to be added to the build plan when the selected SDK contains the matching library.

Accepted package aliases in build settings include `ttf`, `image`, `mixer` and `net`; QPM maps them to the selected SDL major version.

# Templates and snippets guide

## QPM 0.26.0 SCPI profile catalog/editor

Use **Qt Project Manager: Open SCPI Instrument Profile Catalog & Editor** to create or adapt model-specific profiles without hand-editing JSON. Pick a generic or manufacturer/model-labelled starter from the catalog, edit the metadata and semantic action table, validate it, then save under `instrument_profiles/`.

The editor supports the same four 0.25.0 action kinds and provides fields for query/write commands, `%1` substitution templates, unit, minimum/maximum, decimals, default value and readback. It also previews the resulting dynamic control layout. Model-labelled catalog entries are editable starters and should be reconciled with the programming manual before they are used as production drivers.

New optional metadata fields are:

```json
{
  "schemaVersion": 1,
  "manufacturer": "Keysight",
  "model": "34461A",
  "documentationUrl": "docs/34461a-programming-guide.pdf"
}
```

Existing 0.25.0 profiles without these fields remain valid.

## QPM 0.25.0 SCPI instrument profiles

Use **Create New File > Qt > SCPI Instrument Profiles + Auto Control Panel** when several instruments expose the same kinds of operations but use different SCPI command dialects. QPM creates `QpmInstrumentProfile`, `ProfiledInstrumentControl`, four generic profile JSON files, and the 0.24.0 `QpmScpiInstrument` session automatically when it is missing.

An action in JSON can be one of:

- `measurement`: query + readback label;
- `numeric`: numeric editor with `%1` substituted into the write template plus optional readback query;
- `toggle`: ON/OFF control using `%1` and optional readback;
- `action`: immediate command such as `RUN`, `STOP` or `SING`.

Example:

```json
{
  "id": "voltage",
  "label": "Voltage setpoint",
  "kind": "numeric",
  "query": "VOLT?",
  "write": "VOLT %1",
  "unit": "V",
  "minimum": 0,
  "maximum": 30,
  "decimals": 3,
  "defaultValue": 5
}
```

Bind the Designer widget with `setInstrument()` and select a built-in profile with `setProfileId()`, or call `loadProfileFile()` for a vendor/model-specific JSON profile. The starter SCPI strings must be checked against the target programming manual; QPM intentionally keeps this variability explicit rather than hard-coding one manufacturer's dialect.

## QPM 0.24.0 SCPI Instrument Manager

Use **Create New File > Qt > SCPI Instrument Manager** when the application must configure and command one or more SCPI-over-TCP instruments independently of waveform acquisition. QPM creates `QpmScpiInstrument`, `QpmInstrumentManager` and `widgets/InstrumentManagerControl`.

Typical asynchronous usage:

```cpp
auto *manager = new QpmInstrumentManager(this);
manager->addInstrument("DMM", "192.168.1.40", 5025);
manager->connectInstrument("DMM");
connect(manager->instrument("DMM"), &QpmScpiInstrument::identityChanged, this, [](const QString &idn) {
    qInfo() << idn;
});
manager->queryActive("MEAS:VOLT:DC?");
```

`QpmScpiInstrument` keeps a FIFO command queue and one outstanding line-response query at a time, associates requests with numeric IDs, applies per-command timeouts and emits timestamped traffic. The blocking `queryBlocking()` helper exists for non-latency-sensitive control flows, but asynchronous queries are preferable in GUI code.

The **Probe configured (*IDN?)** action identifies endpoints already present in the manager. SCPI alone does not define portable LAN discovery; LXI/mDNS, VXI-11 and HiSLIP discovery are separate future providers rather than hidden network scanning in this starter.

`InstrumentManagerControl` can be published through the QPM Designer plugin. Under `QPM_DESIGNER_PLUGIN_BUILD` it shows a static preview and avoids linking runtime networking/manager behavior into Designer.

## QPM 0.23.0 acquisition source pack

Use **Create New File > Qt > Acquisition Sources + Control Panel** after or alongside **Real-time Signal Acquisition Support**. QPM creates `QpmSampleDecoder`, `QpmAcquisitionSource`, Serial/TCP/UDP/SCPI implementations, `QpmAcquisitionController`, and `widgets/AcquisitionControl`. If `QpmSignalBuffer` is missing, the ring buffer is generated automatically; when `SignalPlot` already exists, QPM can also generate the plot bridge.

The sample decoder expects either newline-delimited ASCII numeric values (comma, semicolon or whitespace separated) or interleaved little-endian Float32/Float64/Int16 frames. Set the controller channel count to the number of values in one frame. A sample-rate field can update `QpmSignalBuffer::sampleInterval` so the plot time axis remains calibrated. Scale and offset are applied after decoding and before samples enter the buffer.

`AcquisitionControl` is a normal `QWidget` and is discoverable by the 0.18.0 Designer plugin workflow. Runtime usage is intentionally explicit: construct a `QpmAcquisitionController` with a `QpmSignalBuffer`, then call `setController()` on the widget. The generated SCPI backend is an ASCII-over-TCP starter (default port 5025 and `READ?`); binary-block parsing remains instrument-specific.


## Creation wizard

Open a Qt project, right-click the project or a logical folder, then run **Create New File or Starter...**.

The wizard can generate one file or a coordinated starter set. Existing files are never overwritten silently. When a generated filename already exists, choose either:

- **Keep existing and add references**;
- **Overwrite generated files**;
- cancel the operation.

## User creation templates

Run **Qt Project Manager: Manage Creation Templates...**. A text file can be saved as a reusable template or imported from disk.

Templates support these placeholders:

| Placeholder | Meaning |
|---|---|
| `{{baseName}}` | output filename without extension |
| `{{fileName}}` | output filename |
| `{{headerFile}}` | generated or associated header filename |
| `{{guard}}` | normalized uppercase include guard |
| `{{prefix}}` | normalized uppercase module prefix |
| `{{uirFile}}` | associated UIR filename |
| `{{date}}` | ISO generation date |
| `{{year}}` | generation year |

## Snippet insertion

Run **QPM > Snippets > Insert snippet** or press `Ctrl+Alt+I` (`Cmd+Alt+I` on macOS). QPM first asks for a category, then shows only the matching snippets. The editor context menu also exposes the categories directly:

- **Qt**: application entry points, signals/slots, QObject, Q_PROPERTY, timers, settings, files, resources, logging, tests and QML registration;
- **C — classic**: entry points, validation, error paths, files, structures and state machines;
- **C++ — classic**: entry points, classes, RAII, scoped enums and locks;
- **Windows / communication**: WinMain, DLL lifecycle, serial ports, sockets and Win32 error formatting;
- **Documentation / comments**: file headers, change rows and section comments;
- **Saved user snippets**.

The **Search all snippets** category retains a single searchable list when the exact group is not known. Snippets are inserted through VS Code `SnippetString`, so tab stops such as `${1:sender}` remain interactive.

To add a personal snippet, select code in the editor and run **QPM > Snippets > Save selection as snippet**.

## Documentation and comment helpers

The editor right-click menu now exposes a single **QPM** submenu. Use **QPM > Documentation / comments** to insert:

- a file description header with company/contact placeholders and a `CHANGES/EVOLUTIONS` table;
- one formatted change-table line at the cursor position;
- reusable comment-section separators, either boxed, line-based or compact;
- special-character text banners with selectable fill pattern, compact/standard size presets and output mode.

Use **QPM > Insert color value** for the context-menu color helper. It opens a VS Code webview color picker and can insert `#RRGGBB`, `0xRRGGBB`, decimal RGB, CSS-style `rgb(...)` / `rgba(...)`, raw C channel lists, `SDL_Color` initializers and `QColor(...)`.

The same building blocks are also available as built-in snippets from **QPM > Snippets > QPM: Insert snippet**.

## Error-managed main starter

The creation wizard includes **C main with QPM error handling**. It generates a `main.c` starter with the documentation header, QPM error initialization, `error:` and `cleanup:` labels, and code-section comment headers. The wizard can also create a paired `main.h` and the `qpm_error.c/.h/.ini` support module when it is not already present.

## 0.2.21 starter behavior

Generated entry-point starters no longer insert placeholder unused-parameter casts such as `(void)argc;`, `(void)argv;` or `(void)hInstance;`. Instead, console `main()` starters include a small argument loop using `argc`/`argv`, and the WinMain starter includes an `lpCmdLine` block for command-line text passed to a Windows GUI executable.

The DLL starter references `hinstDLL` and `lpvReserved` directly in the generated `DllMain` body, so the template remains warning-friendly without adding artificial `(void)` lines.

## Module bundles

The `Module bundle...` creation action is grouped by language. C bundles currently generate QPM-native utility files such as `qpm_util.c/.h/.ini` and `qpm_error.c/.h/.ini`. C++ bundles copy the bundled MY_Util modules without repeating the `MY_Util /` prefix in each item label.



## Module bundle grouping

The module-bundle picker is separated into C modules, C++ modules and script modules. `Python execution bridge` copies only the C++ bridge in `external/pythonExec`; `Python worker protocol starter` creates the generic worker files; `Robot demo Python scripts` separately copies the original project-specific Python files.



## QPM 0.18.0 Qt Designer Widget Box integration

After creating one or more custom painted widgets, run **QPM > Qt project tools > Configure Qt Designer Custom Widgets...**. QPM scans the native manifest for `Q_OBJECT` classes deriving from `QWidget`, lets you select the classes to publish and writes a project-local Designer collection under `.qpm/designer-plugins/`. The default Widget Box category is **QPM Instrumentation**.

Run **Build Qt Designer Widget Plugin** before opening Designer. The generated qmake project builds a plugin library with `Qt::UiPlugin`/`uiplugin` interfaces and embeds the selected widget implementations in the plugin. QPM prefers the Qt kit containing the selected `designer.exe` so the plugin ABI matches Designer. The output lives in `.qpm/designer-plugins/runtime/designer`, and QPM automatically exposes the parent runtime directory through `QT_PLUGIN_PATH` when opening `.ui` forms.

The plugin is intentionally separate from the application: your normal application continues to compile the original widget `.h/.cpp` files and does not depend on Qt Designer. The optional **Install Widget Plugin into Qt Designer...** command copies the compiled library to the resolved `plugins/designer` directory; the project-local launch path is preferred because it avoids modifying the Qt installation.

## QPM 0.17.9 Qt custom painted widgets

`Create New File > Qt > Custom Painted Widget (QPainter)` creates reusable native Qt widget classes without a `.ui` file. QPM provides three starters: a generic value control, an analog gauge/dial, and a signal plot/chart. Each class is written under `include/widgets/` and `src/widgets/`, uses `Q_OBJECT`/`Q_PROPERTY`, and is suitable for project-local use in Qt Designer by placing a `QWidget` and choosing **Promote to...** with the generated class name and `widgets/<name>.h` header.

The generated paint code deliberately uses the current `QPalette` and `QStyle::PE_Widget`, so application Qt Style Sheets can still control the widget background, foreground and highlight colors. The signal-plot starter exposes `setSamples`, `appendSample`, `clearSamples`, cursor notifications and Y-range zoom as a practical basis for instrumentation UIs.

## 0.2.26 creation workflow

The file creation command is now organized as category pickers rather than one long list. The first picker exposes `C`, `C++`, `Module bundles`, `Scripts and text`, and `Saved templates` when user templates exist.

Module bundles are also organized by folder-like categories: `C`, `C++`, and `Scripts`. Generated bundle default folders now use `Bundle/C`, `Bundle/C++`, and `Bundle/Scripts`. The generated QPM core utility and error-management bundles exist in both C and C++ forms. Generated C rewrites are available for Python execution, Web UI backend, UART, IPC and Ethernet TCP/UDP. C++ MY_Util modules remain available for projects that want the original class-based APIs.


### C communication bundles

`Module bundles > C` now includes generated C communication modules:

- `UART communication`: creates `qpm_uart.c` / `qpm_uart.h`.
- `IPC communication`: creates `qpm_ipc.c` / `qpm_ipc.h`.
- `Ethernet TCP-UDP communication`: creates `qpm_socket.c` / `qpm_socket.h`.
- `Full communication stack`: creates all three communication modules together.

The C APIs are intentionally procedural and independent from the original MY_Util C++ classes. Under Windows, the Ethernet module requires `ws2_32` at link time.

### C Python execution bridge

`Module bundles > C > Python execution bridge` generates:

- `qpm_python_exec.h`
- `qpm_python_exec.c`

The API is pure C and supports one-shot script execution as well as a persistent session with stdin/stdout pipes. It mirrors the useful behavior of the MY_Util C++ bridge without copying the companion Python scripts. Generic scripts are available under `Module bundles > Scripts > Python worker protocol starter`; the old project-specific scripts are available under `Module bundles > Scripts > Robot demo Python scripts`.


### 0.2.28 Web UI bundle split

The Web UI backend and frontend assets are now separate bundle choices. C projects can generate `qpm_webui.c` / `qpm_webui.h`; C++ projects can copy only `webui.cpp` / `webui.h`; HTML, JavaScript, CSS and images are available from `Module bundles > Scripts > Minimal Web UI frontend`.

### 0.2.30 bundle clarification

Script bundles are now split between generic starters and project-specific demos. The Python worker protocol starter creates only a minimal `catj_py_helper.py`, `logger.py`, `example_worker.py` and README. The older Raspberry Pi / robot-oriented Python files are available separately as `Robot demo Python scripts`.

The Web UI assets are split the same way: `Minimal Web UI frontend` generates a small generic HTML/JS/CSS frontend for `/api/state` and `/api/action`, while `Embedded demo Web UI frontend` keeps the original GPIO/camera/bus demo assets.

C bundles now include README/API notes where useful. When a socket or Web UI backend bundle is added on Windows, QPM adds `ws2_32` to the workspace linker libraries if it is not already present.

### 0.2.31 C I2C/SPI communication bundles

`Module bundles > C` now offers `I2C communication` and `SPI communication` alongside UART, IPC and Ethernet. The full C communication stack now creates all five low-level communication modules. The C++ bundle list also exposes the original MY_Util I2C and SPI classes as individual selectable bundles.



## 0.2.32 bundle note

The C communication bundle set now includes Wi-Fi and Bluetooth RFCOMM modules in addition to UART, IPC, Ethernet, I2C and SPI. The Wi-Fi module handles application TCP/UDP traffic once the operating system is connected to Wi-Fi; it does not manage SSID association. The Bluetooth C module targets Windows RFCOMM by default and reports unsupported on other platforms unless extended with a platform backend.

### 0.2.33 CAN communication bundles

New bundle entries:

- `Module bundles > C > CAN communication`
- `Module bundles > C++ > CAN communication`

The C bundle creates `qpm_can.c`, `qpm_can.h` and `README.md` under `Bundle/C/Communication/CAN` by default. The API provides `QpmCan_Open`, `QpmCan_Send`, `QpmCan_Receive`, receive timeout configuration, loopback control, own-message reception, filter configuration and diagnostic formatting.

The C++ bundle creates `Communication/can/can.cpp` and `can.h` under the selected C++ bundle folder. The default implementation is a SocketCAN wrapper.

### 0.2.38 bundle Doxygen examples

Bundle generation now writes usage examples into the generated headers as Doxygen `@par Example of use` blocks. For the C Python bridge, `qpm_python_exec.h` includes a complete `QpmPythonConfig`, `QpmPythonResult`, `QpmPython_RunScript` and `QpmPython_ResultFree` example. The C sources generated or copied by the bundle system also receive Doxygen-style comments on implementation helpers and API functions, so the generated files can be read or processed by Doxygen without adding documentation manually first.

### Special-character text comments

The C `Python execution bridge` bundle generates `qpm_python_exec.c` / `qpm_python_exec.h` and keeps the Windows wait/timeout code compatible with older MinGW/MinGW32 headers.

`Insert special-character text` renders characters using a selectable fill pattern such as `//`, `\\`, `||`, `**`, `##`, `==`, `--`, `++` or a custom 1 to 8 character token. The size picker provides five presets: Micro, Small, Narrow, Standard and Large. Micro/Small use a compact 3x5 font, Narrow/Standard use a standard 5x7 font, and Large corresponds to the previous size 2. The command can insert the result as Qt/C++ line comments, as a C block comment, or as raw generated characters.

### Header change entries

`Insert header change line` keeps the CHANGES/EVOLUTIONS table width stable. Descriptions longer than the Description column are wrapped onto continuation rows, and a separator row is inserted under the generated entry.



## 0.2.39 Lua execution bridge

New module bundles:

- `Module bundles > C > Lua execution bridge`: generates `qpm_lua_exec.c`, `qpm_lua_exec.h` and README notes.
- `Module bundles > C++ > Lua execution bridge`: generates the same C ABI bridge in a C++ bundle folder.
- `Module bundles > Scripts > Lua worker protocol starter`: generates `example_worker.lua` and a short protocol README.

The Lua header documents the main API directly in Doxygen form: one-shot execution with `QpmLua_RunScript`, stdout/stderr capture through `QpmLuaResult.output`, command-line arguments through Lua `arg[]`, and interactive line/JSON-style text exchanges through `QpmLuaSession_*`.

### 0.2.40 bundle header documentation audit

The bundle headers now include a stronger self-contained documentation block. Each audited header starts with Doxygen sections for main features, typical applications, usage notes and a short example using the public API. This was applied to the generated C bundles, the generated C++ bundles and the copied MY_Util communication/external/Web UI bundles.

This avoids missing important runtime behavior such as script argument passing or stdout capture: the Python and Lua execution bridge headers now explicitly document both argument access on the script side and output capture in the Qt/C++ result structures.

## SDL2 / SDL3 project starter

Version 0.2.44 extends the dedicated SDL project creation commands to SDL2 and SDL3. The generated SDL project contains:

- `main.c` or `main.cpp` with an SDL2 or SDL3 initialization path, window creation, renderer creation, event loop and cleanup;
- `assets/` for images, fonts or audio;
- `README_SDL.md` describing the SDL workspace settings.

The starter is intended for graphical applications. QPM configures SDL through `qpm.sdlVersion`, `qpm.sdlRootPath`, `qpm.sdlPackages`, `qpm.sdlRuntimeMode`, `qpm.sdlSubsystem` and `qpm.sdlCopyAllRuntimeDlls`. SDL3 starters include `<SDL3/SDL.h>` and `<SDL3/SDL_main.h>` and use the SDL3 event constants.

## Generic toolchain runtime dependency modes

The build settings page includes a `Generic toolchain runtime dependencies` section for normal Qt builds. Use `copy-dlls` when the executable must also launch from Explorer, `path-only` when the executable is only launched through QPM run/debug, and `static-link` when the selected GCC/Clang-compatible toolchain provides suitable static runtime libraries. QPM can deploy GCC/MinGW/MSYS2 and LLVM/Clang runtime DLLs found in the selected toolchain `bin` directory, and it records copied DLLs in `.qpm-runtime-dlls.json` for cleanup.


## SDL SDK path selection

When using SDL2/SDL3 templates, the build settings `SDL SDK root` field can point either to the SDK root or to a nested architecture folder such as `i686-w64-mingw32`, `x86_64-w64-mingw32`, `bin`, `lib`, `include` or `include/SDL2`. QPM normalizes the selected folder during build resolution.

### 0.2.47 embedded library synchronization

The embedded library manager imports the JC Lib 0.8.9 SDL2 / SDL3 pack routing and enum-backed multi-select picker fix. SDL content is now available as combined SDL2 / SDL3, SDL2-only, or SDL3-only bundled packs.

## Color value picker

`Insert color value` is available from the **QPM** editor context menu. It provides a native color selector, editable RGB channels, alpha control, alpha preview over a checkerboard, brightness/value adjustment and preset swatches. The current selection is reused as the initial color when it matches `#RRGGBB` or `0xRRGGBB`.

Supported output formats are `#RRGGBB`, `0xRRGGBB`, decimal RGB integer, `rgb(r, g, b)`, `rgba(r, g, b, a)`, `r, g, b`, `r, g, b, a`, `{ r, g, b, a }` for `SDL_Color`, `RGB(r, g, b)` and `QColor(r, g, b, a)`.

## 0.2.49 editor utility integration

The editor context menu now imports the JC Lib 0.8.24 utility surface into QPM-specific commands. The implementation lives in `src/services/qpmEditorUtilitiesService.ts` and registers character/encoding tools, number/bit tools, logic/FSM generation and digital filter design alongside the existing snippet, header, special-text and color services.


## Android projects

Android is configured as a platform profile rather than a separate source template. Existing Qt Widgets, Qt Quick, console, test and library projects can therefore target Desktop and Android with the same registered source files. QPM generates an isolated `.qpm/android/<build-profile>/CMakeLists.txt` and does not overwrite a user-owned CMake project.


## QML module metadata

QPM 0.13.0 can generate a `qmldir` file from the QML files registered in the native manifest. Capitalized file names become exported QML types, `pragma Singleton` produces singleton entries, and the project manifest persists the module URI, major/minor version, import root and resource prefix. The generated metadata complements QML starters and allows `qmlls` to resolve project-local types consistently.

## Apple generated projects (0.14.0)

Apple support does not add source-code snippets. For iOS, QPM generates an isolated CMake project containing the source/header/form/resource/QML files already registered in `.qtproject.json`, the selected Qt modules, bundle metadata, optional QML module metadata and Xcode signing attributes. The generated project is disposable and can be recreated from the manifest.

macOS projects keep their existing direct, qmake or CMake source layout. Apple distribution commands operate on the produced `.app` bundle and do not modify user source files.
## QPM 0.20.0 — Advanced SignalPlot / SpectrumPlot templates

The `Signal Plot / Chart` starter is now multichannel and exposes channel naming/color/visibility, `sampleInterval`, legend control, autoscale, dual A/B measurement cursors, horizontal zoom/pan, follow-latest realtime scrolling, block append and Ctrl+wheel Y zoom. The compatibility methods `setSamples()`, `appendSample()` and `clearSamples()` still address channel 0.

The `Spectrum Plot` starter is now multitrace with trace naming/color/visibility, linear/logarithmic frequency display, independent view-frequency zoom/pan, autoscale and dual A/B cursors for `Δf` and `ΔA`. `setMagnitudes()` and `clearSpectrum()` still address trace 0.

## QPM 0.19.0 — Qt instrumentation widget starters

`Create New File > Qt > Custom Painted Widget (QPainter)` now includes **Complete QPM Instrumentation Pack** plus LED Indicator, Digital Meter, Rotary Knob, Linear Gauge, Analog Gauge / Dial, Signal Plot / Chart, Spectrum Plot, XY Plot and the generic painted value widget. Every starter creates one header/source pair under `include/widgets` and `src/widgets`, includes `Q_OBJECT`, and exposes Designer-friendly properties appropriate to the control.


## QPM 0.21.0 — Oscilloscope / analyzer templates

`Signal Plot / Chart` adds `Coupling`, `TriggerMode`, `TriggerEdge`, trigger level/channel/position, automatic measurements and horizontal voltage cursors. `Spectrum Plot` adds `HoldMode`, persistence frames, hold/persistence clearing and peak measurement. Existing 0.20.0 methods remain valid.

## Real-time acquisition support (0.22.0)

`Create New File > Qt > Real-time Signal Acquisition Support` generates:

- `include/instrumentation/qpm_signal_buffer.h` / `src/instrumentation/qpm_signal_buffer.cpp`
- `include/instrumentation/qpm_signal_plot_bridge.h` / `src/instrumentation/qpm_signal_plot_bridge.cpp`

The buffer accepts `appendSample`, `appendSamples`, `appendFrame` and `appendInterleaved`. The bridge polls with a precise `QTimer`, calls non-blocking `trySnapshot`, maps buffer channel names to `SignalPlot` channels and applies data through the batch-update API.

### Complete acquisition dashboard (0.29.0)

Use **Create New File > Qt > Complete Acquisition Dashboard** for a ready-to-run acquisition page. QPM adds only the missing acquisition/runtime/widget files, creates `widgets/AcquisitionDashboard`, and automatically inserts it into a still-blank `mainwindow.ui`. If the MainWindow already contains user controls, it is left untouched.

To make QPM widgets appear in the standalone Qt Widgets Designer Widget Box, use **Qt Project Tools > Prepare QPM Widgets & Open Designer**. This is the shortest path: QPM discovers every eligible widget, writes/synchronizes the `QPM Instrumentation` collection, builds the ABI-compatible Designer plugin, sets the project-local plugin path and launches Designer. **Configure Qt Designer Custom Widgets...** remains available when only a selected subset should be published.

