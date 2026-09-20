# QPM 0.34.10 — Generate Source from Qt File Symbols

The **Qt File Symbols** view now exposes **Generate Source From Qt File Symbols...** directly beside **Generate Header From Qt File Symbols...**.

The source generator:

- creates `.cpp` for C++/Qt inputs and `.c` for C inputs;
- preserves the include directives of a selected source file;
- includes a selected header when generation starts from `.h/.hpp/.hh/.hxx`;
- keeps qualified names such as `MainWindow::pushButton`;
- removes default arguments from generated definitions;
- removes declaration-only `override` / `final` specifiers;
- emits TODO bodies rather than copying existing implementations;
- uses `std::abort()` / `abort()` for non-void generated stubs until the user supplies a real return path.

When starting from a header, the fallback symbol scanner may not always infer class ownership for unqualified declarations inside a class body. The generated source therefore contains a review note rather than silently pretending that ownership information is certain.
