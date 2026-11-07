# QPM 0.34.13 — Run Debug toolbar icon

The dedicated **Run Debug without build** action now uses a custom QPM icon in the Qt Workspace toolbar.

The icon combines the regular Run triangle with a small debugger bug overlay so the action remains visually related to Run while being immediately distinguishable from normal execution.

Two SVG variants are included:

- `media/run-debug-dark.svg` for dark/high-contrast dark themes;
- `media/run-debug-light.svg` for light/high-contrast light themes.

The command behavior is unchanged: `qpm.startQtDebugProfileWithoutBuild` starts the existing executable under the active Qt debug profile and never triggers a build.
