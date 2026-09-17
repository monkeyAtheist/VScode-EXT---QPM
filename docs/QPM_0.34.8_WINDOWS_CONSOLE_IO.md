# QPM 0.34.8 — Windows console I/O for Qt GUI applications

## Root cause

Qt Widgets and Qt Quick executables were linked with the Windows GUI subsystem (`-mwindows`, qmake `CONFIG += windows`, or CMake `WIN32`). In that subsystem the process does not own the console streams expected by the C/C++ CRT. Starting such an executable from a VS Code terminal does not make `stdin`, `stdout` and `stderr` valid console streams. This is why `printf`/`std::cout`/`std::cerr` were not visible and `fgets(..., stdin)` could immediately see EOF.

## Fix

When the active run profile is set to **Integrated Terminal**, the corresponding QPM-generated build profile now uses the console subsystem on Windows:

- Direct/MinGW: `-mconsole`, without Qt's GUI entry-point shim / `QT_NEEDS_QMAIN`.
- qmake: `CONFIG += console`.
- CMake: generated executable is created without the `WIN32` keyword.

Detached and captured-output modes keep the normal GUI subsystem for Widgets/Quick applications. Console and test applications remain console-subsystem targets regardless of run mode.

## Runtime guard

QPM reads the PE subsystem field before an Integrated Terminal launch. If a stale executable is still a GUI-subsystem PE, QPM warns that a rebuild is required instead of silently implying that interactive terminal I/O is available.

## External project files

QPM does not rewrite user-owned external qmake/CMake files. For such projects use `CONFIG += console` (qmake) or disable `WIN32_EXECUTABLE` / remove `WIN32` from `add_executable` (CMake) when terminal I/O is desired.
