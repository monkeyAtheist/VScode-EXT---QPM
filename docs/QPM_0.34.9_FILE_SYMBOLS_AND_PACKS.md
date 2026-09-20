# QPM 0.34.9 — Qt File Symbols and custom packs

## Qt File Symbols

The fallback C/C++ scanner now distinguishes declarations/definitions from expressions located inside function bodies. This prevents Qt constructors, return expressions and calls such as `QObject::connect(...)` from appearing as function symbols.

Available actions:

- Copy one symbol signature or declaration from the item context menu.
- Copy all symbols or all declarations to the clipboard.
- Export the selected file symbol list as Markdown, text or JSON.
- Generate a `.h`/`.hpp` declaration header. Free non-static functions are emitted as active declarations; internal `static` functions and scoped member definitions are retained as commented review entries because they cannot safely be promoted to public API automatically.

## Custom Qt Libraries packs

The Qt Libraries title bar now exposes separate Create and Import actions. Both support Workspace or Global storage. Creation offers C, C++, Qt/C++, QML/Qt Quick, Python/PySide6 and Other language metadata. The same actions are available from the QPM context menu under **Qt Libraries / packs**.
