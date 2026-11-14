import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { executeWebviewCommand, hardenHtml, mediaUri, safeJson } from './webviewKit';
import { QpmBuildService, QpmLastBuildResult } from '../services/qpmBuildService';
import { QpmInstallationService } from '../services/qpmInstallationService';
import { QpmQtInstallationService } from '../services/qpmQtInstallationService';
import { QpmQtPythonService } from '../services/qpmQtPythonService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';
import { getActiveQtPlatformProfile, getQtInstallationPreference, isQtProjectManifestPath, isQtPythonProject, readQtProjectManifest } from '../model/qtProjectManifest';

const BUILD_MODE_SHORT: Record<string, string> = { debug: 'D32', release: 'R32', debug64: 'D64', release64: 'R64' };
const BUILD_MODE_LONG: Record<string, string> = { debug: 'Debug, 32-bit', release: 'Release, 32-bit', debug64: 'Debug, 64-bit', release64: 'Release, 64-bit' };
const TARGET_SHORT: Record<string, string> = { 'Executable': 'EXE', 'Dynamic Link Library': 'DLL', 'Static Library': 'LIB' };
const PLATFORM_LABEL: Record<string, string> = { desktop: 'Desktop', 'linux-local': 'Linux local', 'remote-linux': 'Remote Linux', docker: 'Docker', webassembly: 'WebAssembly', android: 'Android', macos: 'macOS', 'ios-simulator': 'iOS Simulator', 'ios-device': 'iOS device' };

interface HomeToolState { role: string; label: string; path: string; status: 'ok' | 'missing' | 'unresolved'; message: string }

export interface HomeState {
  workspace?: { name: string; path: string; projectCount: number; canAddProject: boolean };
  project?: { name: string; path: string; targetType: string; targetShort: string; language: 'qt-cpp' | 'qt-python' | 'compat'; platform?: { name: string; type: string; label: string } };
  mode: string;
  modeShort: string;
  modeLong: string;
  qt: { version?: string; label?: string; root?: string; compiler?: string; compatibility?: string; diagnostic?: string; tools: HomeToolState[] };
  python?: { state: string; message: string; interpreter?: string; pythonVersion?: string; pySideVersion?: string; virtualEnvironment?: string; tools: HomeToolState[] };
  lastBuild?: QpmLastBuildResult;
  problems: { errors: number; warnings: number };
  recents: Array<{ name: string; path: string; lastOpened: number; exists: boolean; current: boolean }>;
}

/**
 * Home page. The HTML skeleton is rendered once; every later change (workspace, configuration, Qt kit,
 * build result, problems, recents) is pushed with postMessage and drawn by media/webview/home.js,
 * so the page never reloads, flickers or loses its scroll position.
 */
export class HomePanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private updateTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaces: QpmWorkspaceService,
    private readonly builds: QpmBuildService,
    private readonly installations: QpmInstallationService,
    private readonly qtInstallations?: QpmQtInstallationService,
    private readonly qtPython?: QpmQtPythonService
  ) {
    this.disposables.push(
      this.workspaces.onDidChange(() => this.update()),
      this.builds.onDidFinishBuild(() => this.update()),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleUpdate())
    );
    if (this.qtPython) this.disposables.push(this.qtPython.onDidChange(() => this.scheduleUpdate()));
  }

  dispose(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.panel?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.update();
      return;
    }
    this.panel = vscode.window.createWebviewPanel('qpm.home', 'Qt Project Manager', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    });
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'qpm.svg');
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    this.panel.webview.html = this.renderSkeleton(this.panel.webview);
  }

  /** Pushes fresh state to an open page (no reload). */
  update(): void {
    if (!this.panel) return;
    void this.panel.webview.postMessage({ type: 'state', state: this.collectState() });
  }

  private scheduleUpdate(): void {
    if (!this.panel) return;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.update(), 250);
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      switch (String(message?.type ?? '')) {
        case 'ready':
          return;
        case 'command':
          await executeWebviewCommand(message.command);
          return;
        case 'openRecent': {
          const target = String(message.path ?? '');
          const known = this.workspaces.getRecentWorkspaces().find((entry) => entry.path === target);
          if (!known) return;
          if (!known.exists) {
            const answer = await vscode.window.showWarningMessage(`${known.name} no longer exists at ${known.path}.`, 'Remove from recents');
            if (answer) await this.workspaces.forgetRecentWorkspace(known.path);
            return;
          }
          await this.workspaces.load(known.path);
          return;
        }
        case 'forgetRecent':
          await this.workspaces.forgetRecentWorkspace(String(message.path ?? ''));
          return;
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      this.update();
    }
  }

  private collectState(): HomeState {
    const workspace = this.workspaces.currentWorkspace;
    const activeProject = this.workspaces.activeProjectRef;
    const project = activeProject?.exists ? this.workspaces.getProject(activeProject) : undefined;
    const mode = this.builds.buildMode;
    const targetType = project?.targetType ?? '';

    let language: 'qt-cpp' | 'qt-python' | 'compat' = 'compat';
    let platform: { name: string; type: string; label: string } | undefined;
    let qtPreference: string | undefined;
    if (activeProject?.exists && isQtProjectManifestPath(activeProject.absolutePath)) {
      try {
        const manifest = readQtProjectManifest(activeProject.absolutePath);
        language = isQtPythonProject(manifest) ? 'qt-python' : 'qt-cpp';
        const profile = getActiveQtPlatformProfile(manifest);
        platform = { name: profile.name, type: profile.type, label: PLATFORM_LABEL[profile.type] ?? profile.type };
        qtPreference = getQtInstallationPreference(manifest, mode);
      } catch {
        language = 'qt-cpp';
      }
    }

    const qt = this.collectQtState(qtPreference, workspace?.qpmDir);
    const python = language === 'qt-python' ? this.collectPythonState() : undefined;

    let errors = 0;
    let warnings = 0;
    this.builds.diagnostics.forEach((_uri, items) => {
      for (const item of items) {
        if (item.severity === vscode.DiagnosticSeverity.Error) errors++;
        else if (item.severity === vscode.DiagnosticSeverity.Warning) warnings++;
      }
    });

    return {
      workspace: workspace ? { name: workspace.name, path: workspace.path, projectCount: workspace.projects.length, canAddProject: path.extname(workspace.path).toLowerCase() === '.cws' } : undefined,
      project: activeProject?.exists ? { name: activeProject.name, path: activeProject.absolutePath, targetType, targetShort: TARGET_SHORT[targetType] ?? targetType, language, platform } : undefined,
      mode,
      modeShort: BUILD_MODE_SHORT[mode] ?? mode,
      modeLong: BUILD_MODE_LONG[mode] ?? mode,
      qt,
      python,
      lastBuild: this.builds.lastBuild,
      problems: { errors, warnings },
      recents: this.workspaces.getRecentWorkspaces().map((entry) => ({ ...entry, current: Boolean(workspace && path.resolve(workspace.path) === path.resolve(entry.path)) }))
    };
  }

  private collectQtState(preference: string | undefined, compatDir: string | undefined): HomeState['qt'] {
    const installation = this.qtInstallations?.getActive(preference);
    if (!installation) {
      // Compatibility C/C++ projects (.cws/.prj) build with the plain toolchain.
      const toolchain = this.installations.getActiveInstallation(compatDir, false);
      return {
        root: toolchain?.root,
        compiler: toolchain ? 'Compatibility C/C++ toolchain' : undefined,
        tools: toolchain ? [
          fileTool('C++ compiler', 'g++', toolchain.cppCompilerExe),
          fileTool('Archiver', 'ar', toolchain.archiverExe),
          fileTool('Debugger', 'gdb', toolchain.debuggerExe)
        ] : []
      };
    }
    const chain = installation.toolchain;
    const compilerParts = [chain.family !== 'unknown' ? chain.family.toUpperCase() : installation.compilerFamily.toUpperCase(), chain.compilerVersion, chain.architecture || installation.architecture].filter(Boolean);
    return {
      version: installation.version,
      label: installation.label,
      root: installation.root,
      compiler: compilerParts.join(' · '),
      compatibility: chain.compatibility,
      diagnostic: chain.diagnostic,
      tools: [
        fileTool('Build', 'qmake', installation.qmakePath ?? installation.cmakePath),
        fileTool('Compiler', path.basename(chain.cppCompilerPath ?? '') || 'c++', chain.cppCompilerPath),
        fileTool('Debugger', path.basename(chain.debuggerPath ?? '') || 'gdb', chain.debuggerPath),
        fileTool('Designer', 'designer', installation.designerPath),
        fileTool('Translations', 'lupdate', installation.lupdatePath),
        fileTool('QML', 'qmllint', installation.qmlLintPath),
        fileTool('Deploy', path.basename(installation.deployToolPath ?? '') || 'windeployqt', installation.deployToolPath)
      ]
    };
  }

  private collectPythonState(): HomeState['python'] {
    const status = this.qtPython?.status;
    if (!status) return { state: 'unknown', message: 'Qt for Python status is being refreshed…', tools: [] };
    return {
      state: status.state,
      message: status.message,
      interpreter: status.interpreter,
      pythonVersion: status.pythonVersion,
      pySideVersion: status.pySideVersion,
      virtualEnvironment: status.virtualEnvironment,
      tools: [
        fileTool('Interpreter', 'python', status.interpreter),
        fileTool('UI compiler', 'pyside6-uic', status.tools.uic),
        fileTool('Resources', 'pyside6-rcc', status.tools.rcc),
        fileTool('Designer', 'pyside6-designer', status.tools.designer),
        fileTool('Deploy', 'pyside6-deploy', status.tools.deploy)
      ]
    };
  }

  private renderSkeleton(webview: vscode.Webview): string {
    const style = mediaUri(webview, 'home.css');
    const script = mediaUri(webview, 'home.js');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Qt Project Manager</title>
${style ? `<link rel="stylesheet" href="${style.toString()}">` : ''}
</head>
<body class="home">
<div id="app" class="home-shell" aria-live="polite"></div>
<script>window.QPM_HOME_INIT = ${safeJson(this.collectState())};</script>
${script ? `<script src="${script.toString()}"></script>` : ''}
</body>
</html>`;
    return hardenHtml(html, webview, { sharedStyles: true });
  }
}

function fileTool(role: string, label: string, executable: string | undefined): HomeToolState {
  if (!executable) return { role, label, path: '', status: 'missing', message: `${role}: ${label} was not found` };
  const exists = (() => { try { return fs.statSync(executable).isFile(); } catch { return false; } })();
  if (exists) return { role, label, path: executable, status: 'ok', message: '' };
  // Bare names (resolved through PATH at run time) are flagged as unresolved rather than missing.
  return path.isAbsolute(executable) || /[\\/]/.test(executable)
    ? { role, label, path: executable, status: 'missing', message: `Not found: ${executable}` }
    : { role, label, path: executable, status: 'unresolved', message: `${executable} is expected on PATH` };
}
