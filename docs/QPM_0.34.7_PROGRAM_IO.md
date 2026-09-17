# QPM 0.34.7 — Program I/O

QPM previously launched native C/C++ targets with `stdio: 'ignore'`. This intentionally discarded standard output/error and provided no standard input, so `printf`, `std::cout`, `std::cerr`, `scanf` and `std::cin` could not be used from the QPM Run action.

## Run modes

Each Qt run profile now stores a `outputMode` value:

- `integrated-terminal` — default. QPM launches the executable as the VS Code Integrated Terminal process. stdin, stdout and stderr are attached to the terminal.
- `output-channel` — QPM launches the process with stdout/stderr pipes and mirrors both streams to **Qt Project Manager - Program Output**. stdin is intentionally unavailable.
- `detached` — previous behavior for GUI/background applications; standard streams are ignored.

The generic QPM build-settings editor uses the same three modes. For legacy `.cws` workspaces, the mode is stored in `.vscode/qpm-build.json` instead of introducing a QPM-specific key in the workspace file.

## Debugging

`cppdbg` launch configurations now explicitly use:

```json
{
  "externalConsole": false,
  "avoidWindowsConsoleRedirection": false,
  "internalConsoleOptions": "neverOpen"
}
```

This keeps the Microsoft C/C++ debugger's integrated-terminal redirection active on Windows and avoids routing program I/O to the Debug Console.

## Qt for Python

PySide6 launches use the same active run-profile mode. Integrated Terminal supports `input()` and normal stdout/stderr; Program Output captures stdout/stderr; Detached preserves the previous background launch behavior.

## Compatibility

No project schema version bump is required. Existing run profiles that do not contain `outputMode` normalize to `integrated-terminal`.
