# QPM 0.34.14 — Native Run Debug icon

QPM now uses VS Code's native `debug-alt` Codicon for `qpm.startQtDebugProfileWithoutBuild`.

- Qt Workspace toolbar: `$(debug-alt)` from the product icon theme.
- Status bar: `$(debug-alt)`.
- Advanced Run picker: `ThemeIcon('debug-alt', ThemeColor('debugIcon.startForeground'))` for **Run debug without build**.
- **Build and debug** uses the same `debug-alt` ThemeIcon without a forced color.

This removes the custom SVG approximation and lets the active VS Code product icon/color theme control rendering.
