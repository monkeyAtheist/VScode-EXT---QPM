# QPM 0.35.0 — Library generation and analyzers

## Scope

QPM 0.35.0 ports the reusable library tooling introduced in CPM 0.2.85–0.2.88 into the Qt-oriented QPM architecture. The port keeps Qt/qmake/CMake ownership rules intact and only lets the QPM Direct backend interpret the new artifact-format selectors.

## Windows import-library generation

- Header(s) → `.lib`: select one or more `.h/.hh/.hpp/.hxx`; QPM keeps free/public functions it can safely name, filters static helpers and class methods, and warns about C++ decorated-name ambiguity.
- DLL → `.lib`: QPM parses the PE export directory, preserves decorated C++ names, reports ordinal-only exports, writes a `.def`, then invokes the selected generator.
- Supported generators: GNU `dlltool`, LLVM `llvm-dlltool`, Microsoft `lib.exe`, LLVM `llvm-lib`.
- Multi-DLL mode is a batch: each DLL receives its own output import library.
- Reports are written below `.qpm/import-libraries/`.

## Binary analyzers

### DLL Analyzer
Reports PE architecture/format, VERSIONINFO, timestamp, image metadata, subsystem, SHA-256, Authenticode table presence, CLR header, exports/imports, sections, resources, and CodeView/PDB information.

### `.a/.lib` Analyzer
Parses the archive container and reports members, architecture evidence, symbols, import-object records and referenced runtime DLLs. Classification (`static`, `import`, `mixed`, `unknown`) is based on content rather than file extension.

## Build-profile output formats

Direct static-library targets: `Automatic`, GNU/LLVM `.a`, Windows static `.lib`.

Direct shared-library targets: `Automatic`, `.dll.a`, `.a`, `.lib`, `.dll.a + .a`, `.dll.a + .lib`, `.a + .lib`, all three, or none. A Direct GCC/Clang link emits one GNU import archive and QPM materializes a requested GNU alias; a requested Windows `.lib` is then generated from the completed DLL's real export table.

qmake and CMake retain control over their own target/import-library outputs.

## Validation

- TypeScript no-emit and emit compile: PASS
- Synthetic PE32+ x64 DLL export parsing/analyzer: PASS
- Header symbol filtering: PASS
- `.def` rendering and dlltool invocation generation: PASS
- Real GCC/ar static archive analysis: PASS
- Existing QPM File Symbols/OpenSSH/console-I/O/Run Debug regressions: PASS

A final Windows smoke test is still recommended for actual execution of `lib.exe`, `llvm-lib`, `dlltool`, or `llvm-dlltool`, since those Windows executables are not available in the Linux packaging environment.
