# Select a Qt installation

QPM builds with the Qt kit you select: a **Qt 5 or Qt 6** installation and its matching **MinGW, MSVC or Clang** compiler.

- **Select Qt installation** lists the Qt versions QPM finds in `C:\Qt`, `%USERPROFILE%\Qt`, `QTDIR` and the `qpm.qtSearchPaths` setting, and lets you add another root.
- **Detect Qt kits** saves every detected installation as a named kit (Qt version, compiler, debugger) that projects can reference.

The status bar shows the active version, for example `Qt 6.8.2`. Home shows the kit tools — qmake, compiler, debugger, Designer, lupdate, qmllint, windeployqt — as pills that turn red when one is missing.
