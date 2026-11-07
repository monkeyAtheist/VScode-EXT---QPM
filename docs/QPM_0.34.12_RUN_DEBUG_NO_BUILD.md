# QPM 0.34.12 — Run Debug without build

QPM now exposes a dedicated **Run Debug** action in the Qt Workspace toolbar. The command starts the active Qt debug profile against the executable already present on disk and does **not** invoke the build pipeline.

## UI

The Qt Workspace toolbar order is now conceptually:

`Build` → `Run` → `Run Debug` → `Advanced Run` → build mode → target type → settings.

The same action is also available from **Advanced Qt run options** as **Run debug without build**.

## Safety

For local launch profiles, QPM verifies that the configured executable exists before asking VS Code to start the debugger. If it is missing, QPM stops with a clear message and leaves the choice of rebuilding to the user.

**Build & Debug** remains available as a separate action.
