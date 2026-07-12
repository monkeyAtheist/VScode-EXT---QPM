"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomePanel = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class HomePanel {
    context;
    workspaces;
    builds;
    installations;
    panel;
    disposables = [];
    constructor(context, workspaces, builds, installations) {
        this.context = context;
        this.workspaces = workspaces;
        this.builds = builds;
        this.installations = installations;
        this.disposables.push(this.workspaces.onDidChange(() => this.update()));
    }
    dispose() {
        this.panel?.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.update();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('qpm.home', 'Qt Project Manager', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'qpm.svg');
        this.panel.onDidDispose(() => { this.panel = undefined; });
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (!message.command) {
                return;
            }
            await vscode.commands.executeCommand(message.command);
            this.update();
        });
        this.update();
    }
    update() {
        if (!this.panel) {
            return;
        }
        const workspace = this.workspaces.currentWorkspace;
        const activeProject = this.workspaces.activeProjectRef;
        const project = activeProject ? this.workspaces.getProject(activeProject) : undefined;
        const toolchain = this.installations.getActiveInstallation(workspace?.qpmDir, false);
        const detectedToolchainCount = this.installations.getConfiguredInstallations().length;
        const mode = this.builds.buildMode;
        this.panel.webview.html = renderHtml({
            workspace: workspace?.path,
            workspaceName: workspace?.name,
            projectCount: workspace?.projects.length ?? 0,
            projectName: activeProject?.name,
            projectPath: activeProject?.absolutePath,
            targetType: project?.targetType,
            cCompiler: toolchain?.cCompilerExe ?? toolchain?.compileExe,
            cppCompiler: toolchain?.cppCompilerExe,
            archiver: toolchain?.archiverExe,
            debuggerPath: toolchain?.debuggerExe,
            toolchainRoot: toolchain?.root,
            toolchainSource: toolchain?.source,
            detectedToolchainCount,
            mode
        });
    }
}
exports.HomePanel = HomePanel;
function renderHtml(state) {
    const nonce = makeNonce();
    const hasWorkspace = Boolean(state.workspace);
    const hasProject = Boolean(state.projectPath);
    const workspaceName = escapeHtml(state.workspaceName ?? 'No workspace loaded');
    const workspacePath = escapeHtml(state.workspace ?? 'Open a native .qtproject.json project or a .cws/.prj compatibility workspace.');
    const projectName = escapeHtml(state.projectName ?? 'No project loaded');
    const projectPath = escapeHtml(state.projectPath ?? 'Load or create a Qt project to enable build, run and file-generation actions.');
    const mode = escapeHtml(state.mode);
    const targetType = escapeHtml(state.targetType ?? 'No target');
    const projectCountLabel = `${state.projectCount} project${state.projectCount === 1 ? '' : 's'}`;
    const toolchainRoot = escapeHtml(state.toolchainRoot ?? 'No Qt/C++ toolchain selected');
    const compilerLine = escapeHtml([
        state.cCompiler ? `C: ${compactPath(state.cCompiler)}` : 'C: not configured',
        state.cppCompiler ? `C++: ${compactPath(state.cppCompiler)}` : 'C++: not configured',
        state.archiver ? `AR: ${compactPath(state.archiver)}` : 'AR: not configured',
        state.debuggerPath ? `DBG: ${compactPath(state.debuggerPath)}` : 'DBG: not configured'
    ].join(' · '));
    const detectedLabel = state.detectedToolchainCount > 0
        ? `${state.detectedToolchainCount} configured toolchain${state.detectedToolchainCount === 1 ? '' : 's'}`
        : 'toolchains detected on demand';
    const sourceLabel = escapeHtml(state.toolchainSource ?? 'auto');
    const emptyState = !hasProject ? `
      <div class="empty-state">
        <div class="empty-icon">QPM</div>
        <div>
          <h3>No project loaded</h3>
          <p>Open an existing native Qt project or create a Qt Widgets, Console, Quick or library starter. The selected project folder can be synchronized with the standard VS Code Qt/C++ IntelliSense configuration.</p>
          <div class="actions primary-row">
            <button data-command="qpm.openWorkspace">Open workspace</button>
            <button data-command="qpm.createQtProject">Create native Qt project</button>
            <button class="secondary" data-command="qpm.createWorkspaceProject">Workspace + native project</button>
            <button data-command="qpm.configureInstallation">Select toolchain</button>
          </div>
        </div>
      </div>` : '';
    const canAddProjectToWorkspace = Boolean(state.workspace && path.extname(state.workspace).toLowerCase() === '.cws');
    const addProjectToWorkspaceAction = canAddProjectToWorkspace
        ? '<button class="secondary" data-command="qpm.createProjectInWorkspace">Add native Qt project to this workspace</button>'
        : '';
    const workspaceActions = hasWorkspace ? `
        <div class="actions">
          <button data-command="qpm.openWorkspace">Open another workspace</button>
          <button data-command="qpm.createWorkspaceProject">Create another workspace + native Qt project</button>
          ${addProjectToWorkspaceAction}
          <button class="secondary" data-command="qpm.createQtProject">Create standalone native Qt project</button>
          <button class="secondary" data-command="qpm.openWorkspaceInQpm">Open workspace file</button>
        </div>` : '';
    const projectActions = hasProject ? `
        <div class="actions project-actions">
          <button data-command="qpm.chooseBuildAction">Build / rebuild / clean</button>
          <button class="secondary" data-command="qpm.run">Build + run</button>
          <button class="secondary" data-command="qpm.debugInQpm">Build + debug</button>
          <button class="secondary" data-command="qpm.chooseRunAction">Run options</button>
          <button class="secondary" data-command="qpm.selectBuildMode">Build mode</button>
          <button class="secondary" data-command="qpm.selectTargetType">Target type</button>
          <button class="secondary" data-command="qpm.editBuildSettings">Build settings</button>
          <button class="secondary" data-command="qpm.createNewFile">Create file</button>
        </div>` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Qt Project Manager</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 28px 28px 46px; max-width: 1240px; margin: auto; }
    h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: .1px; }
    h2 { font-size: 18px; margin: 0; }
    h3 { font-size: 16px; margin: 0 0 7px; }
    p { margin: 0; line-height: 1.55; }
    .muted { color: var(--vscode-descriptionForeground); }
    .section { margin-top: 24px; }
    .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .section-heading span { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .overview-grid, .tools-grid { display: grid; gap: 12px; }
    .overview-grid { grid-template-columns: repeat(auto-fit, minmax(390px, 1fr)); }
    .tools-grid { grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); padding: 17px; border-radius: 8px; min-width: 0; }
    .card-header { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
    .tile-icon { display: grid; place-items: center; flex: 0 0 auto; width: 38px; height: 38px; border-radius: 9px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 11px; font-weight: 800; letter-spacing: .3px; }
    .title-stack { min-width: 0; }
    .title-stack strong { display: block; font-size: 15px; overflow-wrap: anywhere; }
    .title-stack small { color: var(--vscode-descriptionForeground); }
    .path { font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); border-radius: 4px; padding: 8px 9px; margin: 9px 0 13px; }
    .tag { display: inline-block; border: 1px solid var(--vscode-panel-border); padding: 3px 8px; border-radius: 999px; font-size: 12px; margin-right: 5px; color: var(--vscode-descriptionForeground); }
    .actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
    button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 7px 11px; cursor: pointer; border-radius: 3px; font: inherit; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .empty-state { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; border: 1px dashed var(--vscode-panel-border); background: var(--vscode-sideBar-background); padding: 19px; border-radius: 8px; margin-bottom: 12px; }
    .empty-state p { color: var(--vscode-descriptionForeground); max-width: 840px; }
    .empty-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 15px; font-weight: 800; letter-spacing: .5px; }
    .primary-row button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .toolchain-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: center; }
    .toolchain-card .actions { margin-top: 0; justify-content: flex-end; }
    @media (max-width: 760px) {
      body { padding: 20px 18px 36px; }
      .overview-grid, .tools-grid { grid-template-columns: 1fr; }
      .toolchain-card { grid-template-columns: 1fr; }
      .toolchain-card .actions { justify-content: flex-start; }
      .empty-state { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>Qt Project Manager</h1>
  <div class="muted">Create, organize, build, run and debug native Qt projects with automatic moc, uic and rcc generation and the compiler shipped for the selected Qt kit.</div>

  <section class="section">
    <div class="section-heading">
      <h2>Workspace and active project</h2>
      <span>${escapeHtml(projectCountLabel)}</span>
    </div>
    ${emptyState}
    <div class="overview-grid">
      <article class="card">
        <div class="card-header">
          <div class="tile-icon">WS</div>
          <div class="title-stack">
            <small>Workspace</small>
            <strong>${workspaceName}</strong>
          </div>
        </div>
        <div class="path">${workspacePath}</div>
        ${workspaceActions}
      </article>

      <article class="card">
        <div class="card-header">
          <div class="tile-icon">PRJ</div>
          <div class="title-stack">
            <small>Active project</small>
            <strong>${projectName}</strong>
          </div>
        </div>
        <div class="path">${projectPath}</div>
        <span class="tag">${mode}</span><span class="tag">${targetType}</span>
        ${projectActions}
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-heading">
      <h2>Libraries, templates and reusable code</h2>
      <span>Qt/C++ symbols, templates and snippets</span>
    </div>
    <div class="tools-grid">
      <article class="card">
        <div class="card-header">
          <div class="tile-icon">LIB</div>
          <div class="title-stack">
            <small>Libraries</small>
            <strong>Embedded Qt/C++ symbol explorer</strong>
          </div>
        </div>
        <p class="muted">Browse Qt/C++ API packs, search symbols and insert parameterized calls from the Libraries view.</p>
        <div class="actions">
          <button data-command="qpm.library.findFunction">Find symbol</button>
          <button class="secondary" data-command="qpm.library.reloadPacks">Reload packs</button>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div class="tile-icon">TPL</div>
          <div class="title-stack">
            <small>Templates and snippets</small>
            <strong>Qt/C++ starter files and reusable fragments</strong>
          </div>
        </div>
        <p class="muted">Create .c, .cpp, .h, .hpp, DLL and class starters, or insert snippets at the active cursor position.</p>
        <div class="actions">
          <button data-command="qpm.createNewFile">Create file</button>
          <button class="secondary" data-command="qpm.insertSnippet">Insert snippet</button>
          <button class="secondary" data-command="qpm.manageFileTemplates">Manage templates</button>
          <button class="secondary" data-command="qpm.manageSnippets">Manage snippets</button>
        </div>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-heading">
      <h2>Qt/C++ toolchain</h2>
      <span>${escapeHtml(detectedLabel)}</span>
    </div>
    <article class="card toolchain-card">
      <div>
        <div class="card-header">
          <div class="tile-icon">CFG</div>
          <div class="title-stack">
            <small>Selected toolchain · ${sourceLabel}</small>
            <strong>${toolchainRoot}</strong>
          </div>
        </div>
        <div class="path">${compilerLine}</div>
      </div>
      <div class="actions">
        <button data-command="qpm.configureInstallation">Detect / select toolchain</button>
        <button class="secondary" data-command="qpm.syncCppTools">Sync IntelliSense</button>
        <button class="secondary" data-command="qpm.diagnoseCppTools">Diagnose IntelliSense</button>
        <button class="secondary" data-command="qpm.repairCppToolsProvider">Repair provider</button>
      </div>
    </article>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ command: button.dataset.command }));
    });
  </script>
</body>
</html>`;
}
function compactPath(value) {
    const parent = path.basename(path.dirname(value));
    const base = path.basename(value);
    return parent ? `${parent}/${base}` : base;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function makeNonce() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let index = 0; index < 32; index += 1) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
