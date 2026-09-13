# QPM 0.33.0 — Project Settings audit

## Objective

The previous Qt Project Settings webview exposed 22 top-level sections in one scrolling document. The global `Jump to a section…` selector therefore duplicated the full information architecture and became difficult to scan. Several global toolbar actions were also repeated in the control center or in the section where they were configured.

## Information architecture

The settings editor is now split into ten pages:

| Page | Sections |
| --- | --- |
| Overview | Project control center |
| Project | Project and target; Manifest file summary |
| Build | Qt kit and generators; Qt modules; Backend configuration; Compiler and linker inputs; Variant compiler and linker settings; Build steps |
| Run & Deploy | Run profile; Standalone deployment |
| Debug & Diagnostics | Advanced debugging; Profiling and diagnostics |
| Qt & Languages | Qt for Python / PySide6; QML language and modules |
| Platforms | Platform profile and target |
| Tests & Quality | Tests; Static analysis and quality |
| Dependencies | Dependencies and package managers |
| Distribution | Packaging and product metadata; Installers and signing; Publication and updates |

`Jump to a section…` is generated dynamically from the active page. The filter is also scoped to the active page. The selected page is persisted in the webview state so switching Debug/Release does not send the user back to the first page.

## Build flags correction

The old card title `Debug flags` / `Release flags` was misleading because it also contained linkage and linker settings. It has been replaced by `Debug compiler & linker settings` / `Release compiler & linker settings` and split into four explicit subsections:

- Linkage
- Preprocessor
- Compiler
- Linker

No stored field was renamed; this is a presentation correction only.

## Duplicate and dead-control audit

The 0.33.0 audit checks the source for structural defects rather than simply hiding them visually:

- 22 settings sections, each assigned to exactly one page;
- no duplicate settings field/control IDs;
- no explicit button ID without a JavaScript handler;
- all `data-command` actions in the settings panel are contributed QPM commands;
- all path-browse metadata entries refer to an existing field;
- all datalist/suggestion metadata entries refer to an existing field;
- global toolbar duplication reduced: profile, platform, kit, Designer and toolchain management are moved to the relevant page/control-center surfaces;
- the Overview control center intentionally remains a shortcut surface and can therefore invoke commands also available on detailed pages.

No manifest field was removed during the audit. Similar-looking fields such as run/debug environment, package/deployment output, or local/remote SSH settings represent different profiles or workflows and are retained deliberately.

## Layout

All page sections use the full editor width. Fields inside sections keep a responsive two-column layout on large editors and switch to one column on narrow editors. The sticky header contains, in order:

1. build variant and global Save/Reload/manifest actions;
2. thematic page navigation;
3. page-local filter, section navigation, page context and dirty-state indicator.

The complete sticky-header height is still measured at runtime and used as the section scroll margin.
