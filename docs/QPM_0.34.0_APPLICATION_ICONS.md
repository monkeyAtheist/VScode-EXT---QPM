# QPM 0.34.0 — Application icons

## Purpose

QPM separates three related but distinct icon roles:

1. **Executable icon** — the native Windows PE icon shown by Explorer and shortcuts before the application starts. It uses an `.ico` file and is compiled through a Windows resource (`.rc`).
2. **Qt window/application icon** — the default icon used by Qt top-level windows and the windowing system while the application is running. QPM embeds the selected image in a generated Qt resource and applies it through `QGuiApplication::setWindowIcon()`.
3. **Package / installer icon override** — optional distribution metadata. When empty, packaging and installer workflows reuse the executable icon.

## Project settings

The first two settings are available under **Project > Application icons**:

- `Executable icon (Windows .ico)`
- `Qt window / application icon`
- `Apply Qt window icon automatically`

The package override remains under the Distribution/Packaging settings.

## Generated files

Managed Qt window branding is generated in `.qpm/branding/generated/`:

- `qpm_window_icon.<ext>`
- `qpm_window_icon.qrc`
- `qpm_window_icon.cpp`

The generated C++ source queues the GUI-specific icon assignment until the first event-loop turn. It sets the application default and only fills top-level windows that do not already have an explicit icon.

Windows executable branding is integrated through QPM's generated Windows `.rc` resource. It is independent from VERSIONINFO/package metadata and therefore works even when package metadata embedding is disabled.

## Backend support

Automatic integration is supported for:

- Direct QPM build backend
- QPM-generated qmake project
- QPM-generated CMake project

QPM deliberately does not silently modify a user-owned external `.pro` or `CMakeLists.txt`. Project Health emits a warning when an icon is configured with such a backend. For these projects, the generated resource must be referenced by the user project or the project must be switched to a QPM-generated backend.

## Compatibility and migration

Schema v19 introduces the `branding` object. Projects created with schema v18 or earlier that used `packaging.icon` are migrated by moving the legacy value to `branding.executableIcon`; packaging then inherits that icon unless an explicit package override is later selected.
