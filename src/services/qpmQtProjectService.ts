import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import {
  QtBuildSystem,
  QtProjectKind,
  QtProjectManifest,
  addFilesToQtManifest,
  createDefaultQtProjectManifest,
  isQtProjectManifestPath,
  isQtPythonProject,
  readQtProjectManifest,
  getQtInstallationPreference,
  setQtInstallationPreference,
  synchronizeLegacyProfileMirrors,
  getActiveQtBuildProfile,
  getActiveQtRunProfile,
  getActiveQtDeployProfile,
  removeFileFromQtManifest,
  writeQtProjectManifest
} from '../model/qtProjectManifest';
import { describeQtRoot, QpmQtInstallation, QpmQtInstallationService } from './qpmQtInstallationService';

const MODULE_CHOICES = [
  'Core', 'Core5Compat', 'Gui', 'Widgets', 'Network', 'Concurrent',
  'SerialPort', 'SerialBus', 'Bluetooth', 'Sql', 'Xml',
  'Multimedia', 'MultimediaWidgets', 'OpenGL', 'OpenGLWidgets', 'PrintSupport',
  'Qml', 'QmlModels', 'Quick', 'QuickControls2', 'QuickWidgets', 'QuickTest',
  'Svg', 'SvgWidgets', 'Charts', 'StateMachine', 'WebSockets', 'HttpServer',
  'Positioning', 'Sensors', 'Test'
];

export class QpmQtProjectService {
  constructor(
    private readonly installations: QpmQtInstallationService,
    private readonly output: vscode.OutputChannel
  ) {}

  async createProjectWizard(parentDirectory?: string): Promise<string | undefined> {
    let installation = this.installations.getActive();

    const selectedParent = parentDirectory
      ? vscode.Uri.file(parentDirectory)
      : (await vscode.window.showOpenDialog({
          title: 'Select the parent directory for the Qt project',
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false
        }))?.[0];
    if (!selectedParent) return undefined;

    const template = await vscode.window.showQuickPick([
      { label: 'Qt Widgets application', description: 'QApplication, QMainWindow and a Qt Designer .ui form', projectKind: 'widgets-application' as const },
      { label: 'Qt Console application', description: 'QCoreApplication without graphical dependencies', projectKind: 'console-application' as const },
      { label: 'Qt Quick application', description: 'QQmlApplicationEngine, QML and a compiled resource', projectKind: 'quick-application' as const },
      { label: 'Qt Test application', description: 'Qt Test executable integrated with the VS Code Test Explorer', projectKind: 'test-application' as const },
      { label: 'Qt Quick Test application', description: 'Qt Quick Test runner with a QML TestCase', projectKind: 'quick-test-application' as const },
      { label: 'Qt shared library', description: 'C++ shared library using Qt Core', projectKind: 'shared-library' as const },
      { label: 'Qt static library', description: 'C++ static library using Qt Core', projectKind: 'static-library' as const },
      { label: 'Qt for Python — Widgets (PySide6)', description: 'Python Qt Widgets application using PySide6, Designer and pyproject.toml', projectKind: 'python-widgets-application' as const },
      { label: 'Qt for Python — Quick (PySide6)', description: 'Python Qt Quick/QML application using PySide6 and pyproject.toml', projectKind: 'python-quick-application' as const }
    ], { title: 'Qt project template' });
    if (!template) return undefined;
    const pythonProject = template.projectKind === 'python-widgets-application' || template.projectKind === 'python-quick-application';
    if (!pythonProject && !installation) {
      installation = await this.installations.select();
      if (!installation) return undefined;
    }

    const name = await vscode.window.showInputBox({
      title: 'Qt project name',
      prompt: 'Directory, manifest and target name',
      value: template.projectKind === 'widgets-application' ? 'QtWidgetsApp' : template.projectKind === 'quick-application' ? 'QtQuickApp' : template.projectKind === 'python-widgets-application' ? 'PySideWidgetsApp' : template.projectKind === 'python-quick-application' ? 'PySideQuickApp' : template.projectKind === 'test-application' ? 'QtTestApp' : template.projectKind === 'quick-test-application' ? 'QtQuickTestApp' : 'QtApp',
      validateInput: validateProjectName
    });
    if (!name) return undefined;

    const defaultModules = createDefaultQtProjectManifest(name, template.projectKind).qt.modules;
    const selectedModules = pythonProject
      ? defaultModules.map((label) => ({ label }))
      : await vscode.window.showQuickPick(MODULE_CHOICES.map((module) => ({
          label: module,
          picked: defaultModules.includes(module),
          description: moduleAvailabilityDescription(installation!.includeDir, module)
        })), {
          title: 'Qt modules',
          placeHolder: 'Select modules linked by the direct build engine',
          canPickMany: true
        });
    if (!selectedModules?.length) return undefined;

    const projectDirectory = path.join(selectedParent.fsPath, name);
    if (fs.existsSync(projectDirectory) && fs.readdirSync(projectDirectory).length > 0) {
      throw new Error(`The target directory is not empty: ${projectDirectory}`);
    }

    const manifestPath = this.createProject(projectDirectory, name, template.projectKind, selectedModules.map((entry) => entry.label), pythonProject ? undefined : installation?.root);
    this.output.appendLine(`[Qt] Created ${template.label}: ${manifestPath}`);
    vscode.window.showInformationMessage(`Created Qt project ${name}.`);
    return manifestPath;
  }

  createProject(projectDirectory: string, name: string, kind: QtProjectKind, modules: string[], qtInstallation?: string): string {
    fs.mkdirSync(projectDirectory, { recursive: true });
    const manifest = createDefaultQtProjectManifest(name, kind, modules);
    if (qtInstallation) setQtInstallationPreference(manifest, qtInstallation);
    if (kind === 'shared-library') manifest.defines.push(`${safeIdentifier(name).toUpperCase()}_LIBRARY`);
    if (kind === 'quick-test-application') manifest.profiles.runs[0].arguments = '-input qmltests';
    const generatedFiles = writeStarterProject(projectDirectory, name, kind);
    for (const filePath of generatedFiles) {
      const relative = toManifestPath(path.relative(projectDirectory, filePath));
      const extension = path.extname(filePath).toLowerCase();
      if (['.c', '.cc', '.cpp', '.cxx'].includes(extension)) manifest.files.sources.push(relative);
      else if (['.py', '.pyi'].includes(extension)) manifest.files.python.push(relative);
      else if (['.h', '.hh', '.hpp', '.hxx'].includes(extension)) manifest.files.headers.push(relative);
      else if (extension === '.ui') manifest.files.forms.push(relative);
      else if (extension === '.qrc') manifest.files.resources.push(relative);
      else if (extension === '.qml') manifest.files.qml.push(relative);
      else manifest.files.other.push(relative);
    }
    const manifestPath = path.join(projectDirectory, `${name}.qtproject.json`);
    writeQtProjectManifest(manifestPath, manifest);
    writeProjectSupportFiles(projectDirectory, manifestPath, manifest);
    return manifestPath;
  }

  addFiles(manifestPath: string, filePaths: string[]): number {
    return addFilesToQtManifest(manifestPath, filePaths);
  }

  removeFile(manifestPath: string, filePath: string): boolean {
    return removeFileFromQtManifest(manifestPath, filePath);
  }

  ensureModules(manifestPath: string, modules: string[]): string[] {
    const manifest = readQtProjectManifest(manifestPath);
    const configured = new Set(manifest.qt.modules.map((entry) => entry.toLowerCase()));
    const added: string[] = [];
    for (const module of modules) {
      const normalized = module.trim();
      if (!normalized || configured.has(normalized.toLowerCase())) continue;
      manifest.qt.modules.push(normalized);
      configured.add(normalized.toLowerCase());
      added.push(normalized);
    }
    if (!configured.has('core')) {
      manifest.qt.modules.unshift('Core');
      added.unshift('Core');
    }
    if (added.length > 0) {
      writeQtProjectManifest(manifestPath, manifest);
      this.output.appendLine(`[Qt] Added required module(s) to ${manifest.name}: ${added.join(', ')}`);
    }
    return added;
  }

  async editModules(manifestPath: string): Promise<void> {
    const manifest = readQtProjectManifest(manifestPath);
    const installation = this.installations.getActive(getQtInstallationPreference(manifest));
    const selected = await vscode.window.showQuickPick(MODULE_CHOICES.map((module) => ({
      label: module,
      picked: manifest.qt.modules.some((entry) => entry.toLowerCase() === module.toLowerCase()),
      description: installation ? moduleAvailabilityDescription(installation.includeDir, module) : undefined
    })), { title: `Qt modules — ${manifest.name}`, canPickMany: true });
    if (!selected?.length) return;
    manifest.qt.modules = selected.map((entry) => entry.label);
    if (!manifest.qt.modules.includes('Core')) manifest.qt.modules.unshift('Core');
    writeQtProjectManifest(manifestPath, manifest);
    vscode.window.showInformationMessage(`Qt modules updated for ${manifest.name}.`);
  }

  async openDesigner(input?: unknown, extraPluginRoots: string[] = []): Promise<void> {
    const target = designerTargetPath(input) ?? vscode.window.activeTextEditor?.document.uri.fsPath ?? activeTabResourcePath();
    if (!target || path.extname(target).toLowerCase() !== '.ui') {
      vscode.window.showErrorMessage('Select or open a Qt Designer .ui file first.');
      return;
    }
    if (!fs.existsSync(target)) {
      vscode.window.showErrorMessage(`Qt Designer form not found: ${target}`);
      return;
    }

    const manifestPath = findNearestQtManifest(target);
    const manifestQtRoot = manifestPath ? getQtInstallationPreference(readQtProjectManifest(manifestPath)) : undefined;
    let installation = this.installations.getActive(manifestQtRoot);
    if (!installation) installation = await this.installations.select();
    if (!installation) return;
    if (!installation.designerPath || !fs.existsSync(installation.designerPath)) {
      installation = await this.installations.selectDesignerExecutable(installation.root);
    }
    if (!installation?.designerPath) {
      vscode.window.showErrorMessage('Qt Widgets Designer was not found. Use “Qt Project Manager: Select Qt Widgets Designer Executable” to locate designer.exe.');
      return;
    }

    this.output.show(true);
    this.output.appendLine(`[Qt Designer] Form: ${target}`);
    this.output.appendLine(`[Qt Designer] Launcher: ${installation.designerPath} (${installation.designerLauncherKind ?? 'designer'}, ${installation.designerSource ?? 'unknown source'})`);
    const localPluginRoot = manifestPath ? path.join(path.dirname(manifestPath), '.qpm', 'designer-plugins', 'runtime') : undefined;
    const pluginRoots = [...extraPluginRoots];
    if (localPluginRoot && fs.existsSync(path.join(localPluginRoot, 'designer'))) pluginRoots.push(localPluginRoot);
    await spawnDesigner(installation, target, this.output, pluginRoots);
    vscode.window.showInformationMessage(`Opened ${path.basename(target)} with ${installation.designerLauncherKind === 'qtcreator' ? 'Qt Creator' : 'Qt Widgets Designer'}.`);
  }

  async manageProfiles(manifestPath: string): Promise<void> {
    const manifest = readQtProjectManifest(manifestPath);
    const selected = await vscode.window.showQuickPick([
      { id: 'kit', label: '$(versions) Select active kit profile', description: manifest.profiles.active.kitProfileId },
      { id: 'debug', label: '$(debug) Select Debug build profile', description: manifest.profiles.active.debugBuildProfileId },
      { id: 'release', label: '$(rocket) Select Release build profile', description: manifest.profiles.active.releaseBuildProfileId },
      { id: 'run', label: '$(play) Select run profile', description: manifest.profiles.active.runProfileId },
      { id: 'deploy', label: '$(package) Select deploy profile', description: manifest.profiles.active.deployProfileId },
      { id: 'duplicate-build', label: '$(copy) Duplicate active build profile', description: 'Choose Debug or Release' },
      { id: 'duplicate-run', label: '$(copy) Duplicate active run profile', description: getActiveQtRunProfile(manifest).name },
      { id: 'duplicate-deploy', label: '$(copy) Duplicate active deploy profile', description: getActiveQtDeployProfile(manifest).name }
    ], { title: `Qt project profiles — ${manifest.name}` });
    if (!selected) return;

    if (selected.id === 'kit') {
      const choice = await vscode.window.showQuickPick(manifest.profiles.kits.map((entry) => ({ label: entry.name, description: entry.qtInstallation || 'No Qt installation', id: entry.id })), { title: 'Select active kit profile' });
      if (!choice) return;
      manifest.profiles.active.kitProfileId = choice.id;
      getActiveQtBuildProfile(manifest, 'debug64').kitId = choice.id;
      getActiveQtBuildProfile(manifest, 'release64').kitId = choice.id;
    } else if (selected.id === 'debug' || selected.id === 'release') {
      const variant = selected.id;
      const profiles = manifest.profiles.builds.filter((entry) => entry.variant === variant);
      const choice = await vscode.window.showQuickPick(profiles.map((entry) => ({ label: entry.name, description: `${entry.system} · ${entry.cppStandard} · kit ${entry.kitId}`, id: entry.id })), { title: `Select ${variant} build profile` });
      if (!choice) return;
      if (variant === 'debug') manifest.profiles.active.debugBuildProfileId = choice.id;
      else manifest.profiles.active.releaseBuildProfileId = choice.id;
      const selectedProfile = manifest.profiles.builds.find((entry) => entry.id === choice.id);
      if (selectedProfile && manifest.profiles.kits.some((entry) => entry.id === selectedProfile.kitId)) {
        manifest.profiles.active.kitProfileId = selectedProfile.kitId;
      }
    } else if (selected.id === 'run') {
      const choice = await vscode.window.showQuickPick(manifest.profiles.runs.map((entry) => ({ label: entry.name, description: entry.arguments || 'No arguments', id: entry.id })), { title: 'Select run profile' });
      if (!choice) return;
      manifest.profiles.active.runProfileId = choice.id;
    } else if (selected.id === 'deploy') {
      const choice = await vscode.window.showQuickPick(manifest.profiles.deploys.map((entry) => ({ label: entry.name, description: entry.enabled ? 'Automatic deployment' : 'Manual deployment', id: entry.id })), { title: 'Select deploy profile' });
      if (!choice) return;
      manifest.profiles.active.deployProfileId = choice.id;
    } else if (selected.id === 'duplicate-build') {
      const variant = await vscode.window.showQuickPick([{ label: 'Debug', id: 'debug' as const }, { label: 'Release', id: 'release' as const }], { title: 'Build profile variant to duplicate' });
      if (!variant) return;
      const source = getActiveQtBuildProfile(manifest, variant.id === 'release' ? 'release64' : 'debug64');
      const identity = await askProfileIdentity(`${source.name} Copy`, `${source.id}-copy`);
      if (!identity) return;
      ensureUniqueProfileId(manifest.profiles.builds, identity.id, 'build');
      manifest.profiles.builds.push({ ...source, ...identity, defines: [...source.defines], compilerFlags: [...source.compilerFlags], linkerFlags: [...source.linkerFlags] });
      if (source.variant === 'release') manifest.profiles.active.releaseBuildProfileId = identity.id;
      else manifest.profiles.active.debugBuildProfileId = identity.id;
    } else if (selected.id === 'duplicate-run') {
      const source = getActiveQtRunProfile(manifest);
      const identity = await askProfileIdentity(`${source.name} Copy`, `${source.id}-copy`);
      if (!identity) return;
      ensureUniqueProfileId(manifest.profiles.runs, identity.id, 'run');
      manifest.profiles.runs.push({ ...source, ...identity, environment: { ...source.environment } });
      manifest.profiles.active.runProfileId = identity.id;
    } else if (selected.id === 'duplicate-deploy') {
      const source = getActiveQtDeployProfile(manifest);
      const identity = await askProfileIdentity(`${source.name} Copy`, `${source.id}-copy`);
      if (!identity) return;
      ensureUniqueProfileId(manifest.profiles.deploys, identity.id, 'deploy');
      manifest.profiles.deploys.push({ ...source, ...identity });
      manifest.profiles.active.deployProfileId = identity.id;
    }

    synchronizeLegacyProfileMirrors(manifest);
    writeQtProjectManifest(manifestPath, manifest);
    vscode.window.showInformationMessage(`Qt project profiles updated for ${manifest.name}.`);
  }

  async selectBuildBackend(manifestPath: string): Promise<void> {
    const manifest = readQtProjectManifest(manifestPath);
    const backend = await vscode.window.showQuickPick([
      { label: 'Direct Qt build', description: 'QPM invokes moc, uic, rcc and the compiler directly', value: 'direct' as QtBuildSystem },
      { label: 'qmake', description: 'Generate or use a .pro project and invoke qmake + make/jom/nmake', value: 'qmake' as QtBuildSystem },
      { label: 'CMake', description: 'Generate or use CMakeLists.txt / CMakePresets.json', value: 'cmake' as QtBuildSystem }
    ], { title: `Select build backend — ${manifest.name}` });
    if (!backend) return;
    const scope = await vscode.window.showQuickPick([
      { label: 'Debug and Release', value: 'both' as const },
      { label: 'Debug only', value: 'debug' as const },
      { label: 'Release only', value: 'release' as const }
    ], { title: 'Apply backend to build profiles' });
    if (!scope) return;
    const profiles = manifest.profiles.builds.filter((profile) => scope.value === 'both' || profile.variant === scope.value);
    for (const profile of profiles) {
      profile.system = backend.value;
      if (backend.value === 'direct') {
        profile.projectFile = '';
        profile.cmakeConfigurePreset = '';
        profile.cmakeBuildPreset = '';
      } else if (!profile.projectFile) {
        profile.generateProjectFiles = true;
      }
    }
    synchronizeLegacyProfileMirrors(manifest);
    writeQtProjectManifest(manifestPath, manifest);
    vscode.window.showInformationMessage(`${backend.label} selected for ${profiles.length} build profile(s) in ${manifest.name}.`);
  }

  async importBuildProject(manifestPath: string): Promise<void> {
    const manifest = readQtProjectManifest(manifestPath);
    const root = path.dirname(manifestPath);
    const picked = await vscode.window.showOpenDialog({
      title: 'Select a qmake or CMake project inside the Qt project directory',
      defaultUri: vscode.Uri.file(root),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Qt build projects': ['pro', 'txt'], 'All files': ['*'] }
    });
    const selected = picked?.[0]?.fsPath;
    if (!selected) return;
    const relative = path.relative(root, selected).replace(/\\/g, '/');
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
      vscode.window.showErrorMessage('The imported build project must be located inside the native Qt project directory.');
      return;
    }
    const fileName = path.basename(selected).toLowerCase();
    const backend: QtBuildSystem = fileName.endsWith('.pro') ? 'qmake' : fileName === 'cmakelists.txt' ? 'cmake' : await inferBuildSystem(selected);
    const scope = await vscode.window.showQuickPick([
      { label: 'Debug and Release', value: 'both' as const },
      { label: 'Debug only', value: 'debug' as const },
      { label: 'Release only', value: 'release' as const }
    ], { title: `Use ${path.basename(selected)} for which profiles?` });
    if (!scope) return;
    const profiles = manifest.profiles.builds.filter((profile) => scope.value === 'both' || profile.variant === scope.value);
    for (const profile of profiles) {
      profile.system = backend;
      profile.projectFile = relative;
      profile.sourceDirectory = path.dirname(relative) === '.' ? '.' : path.dirname(relative).replace(/\\/g, '/');
      profile.generateProjectFiles = false;
    }
    synchronizeLegacyProfileMirrors(manifest);
    writeQtProjectManifest(manifestPath, manifest);
    vscode.window.showInformationMessage(`Imported ${path.basename(selected)} as the ${backend} backend for ${manifest.name}.`);
  }

  async showProjectInformation(manifestPath?: string): Promise<void> {
    const active = manifestPath ?? findActiveManifestPath();
    if (!active || !isQtProjectManifestPath(active)) {
      vscode.window.showWarningMessage('No native .qtproject.json project is active.');
      return;
    }
    const manifest = readQtProjectManifest(active);
    const installation = this.installations.getActive(getQtInstallationPreference(manifest));
    const content = {
      manifestPath: active,
      project: manifest,
      selectedQt: installation ? {
        label: installation.label,
        root: installation.root,
        tools: {
          moc: installation.mocPath,
          uic: installation.uicPath,
          rcc: installation.rccPath,
          compiler: installation.toolchain.cppCompilerPath,
          deploy: installation.deployToolPath
        }
      } : null
    };
    const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(content, null, 2) });
    await vscode.window.showTextDocument(document, { preview: true });
  }
}


async function inferBuildSystem(filePath: string): Promise<QtBuildSystem> {
  if (path.basename(filePath).toLowerCase() === 'cmakelists.txt') return 'cmake';
  if (/\.pro$/i.test(filePath)) return 'qmake';
  const choice = await vscode.window.showQuickPick([
    { label: 'qmake', value: 'qmake' as QtBuildSystem },
    { label: 'CMake', value: 'cmake' as QtBuildSystem }
  ], { title: `Build system for ${path.basename(filePath)}` });
  if (!choice) throw new Error('Build project import cancelled.');
  return choice.value;
}

function ensureUniqueProfileId(entries: Array<{ id: string }>, id: string, kind: string): void {
  if (entries.some((entry) => entry.id === id)) {
    throw new Error(`A ${kind} profile with identifier "${id}" already exists.`);
  }
}

async function askProfileIdentity(defaultName: string, defaultId: string): Promise<{ name: string; id: string } | undefined> {
  const name = await vscode.window.showInputBox({ title: 'Profile name', value: defaultName, validateInput: (value) => value.trim() ? undefined : 'A profile name is required.' });
  if (!name) return undefined;
  const id = await vscode.window.showInputBox({ title: 'Profile identifier', value: defaultId, validateInput: (value) => /^[A-Za-z0-9_.-]+$/.test(value.trim()) ? undefined : 'Use letters, digits, dots, dashes or underscores.' });
  if (!id) return undefined;
  return { name: name.trim(), id: id.trim() };
}

function writeStarterProject(projectDirectory: string, name: string, kind: QtProjectKind): string[] {
  const files: Array<[string, string]> = [];
  if (kind === 'python-widgets-application') {
    files.push(
      ['main.py', pythonWidgetsMainSource(name)],
      ['mainwindow.ui', widgetsMainWindowUi(name)],
      ['pyproject.toml', pythonPyProjectToml(name, ['main.py', 'mainwindow.ui'])]
    );
  } else if (kind === 'python-quick-application') {
    files.push(
      ['main.py', pythonQuickMainSource()],
      ['qml/Main.qml', quickMainQml(name)],
      ['pyproject.toml', pythonPyProjectToml(name, ['main.py', 'qml/Main.qml'])]
    );
  } else if (kind === 'widgets-application') {
    files.push(
      ['src/main.cpp', widgetsMainSource()],
      ['src/mainwindow.cpp', widgetsMainWindowSource()],
      ['include/mainwindow.h', widgetsMainWindowHeader()],
      ['forms/mainwindow.ui', widgetsMainWindowUi(name)],
      ['resources/resources.qrc', emptyResourceFile()]
    );
  } else if (kind === 'quick-application') {
    files.push(
      ['src/main.cpp', quickMainSource()],
      ['qml/Main.qml', quickMainQml(name)],
      ['resources/qml.qrc', quickResourceFile()]
    );
  } else if (kind === 'test-application') {
    files.push(['tests/tst_example.cpp', qtTestSource(name)]);
  } else if (kind === 'quick-test-application') {
    files.push(
      ['tests/quicktest_main.cpp', quickTestMainSource()],
      ['qmltests/tst_example.qml', quickTestQml(name)]
    );
  } else if (kind === 'console-application') {
    files.push(['src/main.cpp', consoleMainSource(name)]);
  } else {
    files.push(
      [`include/${safeIdentifier(name).toLowerCase()}.h`, libraryHeader(name, kind === 'shared-library')],
      [`src/${safeIdentifier(name).toLowerCase()}.cpp`, librarySource(name)]
    );
  }
  const paths: string[] = [];
  for (const [relativePath, content] of files) {
    const target = path.join(projectDirectory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, normalizeNewlines(content), 'utf8');
    paths.push(target);
  }
  return paths;
}

function writeProjectSupportFiles(projectDirectory: string, manifestPath: string, manifest: QtProjectManifest): void {
  const pythonProject = isQtPythonProject(manifest);
  fs.writeFileSync(path.join(projectDirectory, '.gitignore'), pythonProject ? '.venv/\n__pycache__/\n*.pyc\nbuild/\ndist/\n.vscode/*.log\n' : 'build/\n.vscode/*.log\n', 'utf8');
  const details = pythonProject
    ? `- Runtime: Qt for Python / PySide6\n- Python project: \`${manifest.python.projectFile}\`\n- Entry point: \`${manifest.python.entryPoint}\`\n- Virtual environment: \`${manifest.python.virtualEnvironment}\``
    : `- Build system: direct Qt build (no CMake required)\n- Qt modules: ${manifest.qt.modules.join(', ')}\n- Generated files: \`${manifest.build.outputDirectory}/<mode>/${manifest.build.generatedDirectory}\``;
  const usage = pythonProject
    ? 'Use **Qt Project Manager: Prepare Python Environment**, **Build**, **Run**, **Debug**, **Open PySide6 Designer**, or **Deploy Qt for Python** from VS Code.'
    : 'Use **Qt Project Manager: Build**, **Run**, **Open in Qt Designer**, or **Deploy Qt Runtime** from VS Code.';
  fs.writeFileSync(path.join(projectDirectory, 'README_QPM.md'), normalizeNewlines(`# ${manifest.name}

Native Qt Project Manager project.

- Project manifest: \`${path.basename(manifestPath)}\`
${details}

${usage}
`), 'utf8');
}

function pythonWidgetsMainSource(name: string): string {
  return `import sys\n\nfrom PySide6.QtWidgets import QApplication, QMainWindow\nfrom ui_mainwindow import Ui_MainWindow\n\n\nclass MainWindow(QMainWindow):\n    def __init__(self) -> None:\n        super().__init__()\n        self.ui = Ui_MainWindow()\n        self.ui.setupUi(self)\n\n\ndef main() -> int:\n    app = QApplication(sys.argv)\n    window = MainWindow()\n    window.setWindowTitle(${JSON.stringify(name)})\n    window.show()\n    return app.exec()\n\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n`;
}

function pythonQuickMainSource(): string {
  return `import sys\nfrom pathlib import Path\n\nfrom PySide6.QtCore import QUrl\nfrom PySide6.QtGui import QGuiApplication\nfrom PySide6.QtQml import QQmlApplicationEngine\n\n\ndef main() -> int:\n    app = QGuiApplication(sys.argv)\n    engine = QQmlApplicationEngine()\n    qml_file = Path(__file__).resolve().parent / "qml" / "Main.qml"\n    engine.load(QUrl.fromLocalFile(str(qml_file)))\n    if not engine.rootObjects():\n        return -1\n    return app.exec()\n\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n`;
}

function pythonPyProjectToml(name: string, files: string[]): string {
  const encoded = files.map((entry) => JSON.stringify(entry)).join(', ');
  return `[project]\nname = ${JSON.stringify(name)}\nversion = "1.0.0"\nrequires-python = ">=3.10"\ndependencies = ["PySide6>=6.9"]\n\n[tool.pyside6-project]\nfiles = [${encoded}]\n`;
}

function widgetsMainSource(): string {
  return `#include <QApplication>\n#include "mainwindow.h"\n\nint main(int argc, char *argv[])\n{\n    QApplication application(argc, argv);\n    MainWindow window;\n    window.show();\n    return application.exec();\n}\n`;
}

function widgetsMainWindowHeader(): string {
  return `#pragma once\n\n#include <QMainWindow>\n#include <memory>\n\nQT_BEGIN_NAMESPACE\nnamespace Ui { class MainWindow; }\nQT_END_NAMESPACE\n\nclass MainWindow final : public QMainWindow\n{\n    Q_OBJECT\n\npublic:\n    explicit MainWindow(QWidget *parent = nullptr);\n    ~MainWindow() override;\n\nprivate:\n    std::unique_ptr<Ui::MainWindow> ui;\n};\n`;
}

function widgetsMainWindowSource(): string {
  return `#include "mainwindow.h"\n#include "ui_mainwindow.h"\n\nMainWindow::MainWindow(QWidget *parent)\n    : QMainWindow(parent),\n      ui(std::make_unique<Ui::MainWindow>())\n{\n    ui->setupUi(this);\n}\n\nMainWindow::~MainWindow() = default;\n`;
}

function widgetsMainWindowUi(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ui version="4.0">\n <class>MainWindow</class>\n <widget class="QMainWindow" name="MainWindow">\n  <property name="geometry">\n   <rect><x>0</x><y>0</y><width>800</width><height>500</height></rect>\n  </property>\n  <property name="windowTitle"><string>${escapeXml(name)}</string></property>\n  <widget class="QWidget" name="centralWidget"/>\n  <widget class="QMenuBar" name="menuBar"/>\n  <widget class="QStatusBar" name="statusBar"/>\n </widget>\n <resources/>\n <connections/>\n</ui>\n`;
}

function emptyResourceFile(): string {
  return `<RCC>\n    <qresource prefix="/"/>\n</RCC>\n`;
}

function consoleMainSource(name: string): string {
  return `#include <QCoreApplication>\n#include <QDebug>\n\nint main(int argc, char *argv[])\n{\n    QCoreApplication application(argc, argv);\n    qInfo() << "${escapeCppString(name)} started with Qt" << QT_VERSION_STR;\n    return 0;\n}\n`;
}

function quickMainSource(): string {
  return `#include <QGuiApplication>\n#include <QQmlApplicationEngine>\n#include <QUrl>\n\nint main(int argc, char *argv[])\n{\n    QGuiApplication application(argc, argv);\n    QQmlApplicationEngine engine;\n    const QUrl url(QStringLiteral("qrc:/qml/Main.qml"));\n    engine.load(url);\n    if (engine.rootObjects().isEmpty()) {\n        return -1;\n    }\n    return application.exec();\n}\n`;
}

function quickMainQml(name: string): string {
  return `import QtQuick\nimport QtQuick.Controls\n\nApplicationWindow {\n    width: 800\n    height: 500\n    visible: true\n    title: "${escapeQmlString(name)}"\n\n    Label {\n        anchors.centerIn: parent\n        text: "${escapeQmlString(name)} — Qt Project Manager"\n        font.pixelSize: 24\n    }\n}\n`;
}

function quickResourceFile(): string {
  return `<RCC>\n    <qresource prefix="/qml">\n        <file alias="Main.qml">../qml/Main.qml</file>\n    </qresource>\n</RCC>\n`;
}

function qtTestSource(name: string): string {
  const className = `${safeIdentifier(name)}Test`;
  return `#include <QtTest/QTest>\n\nclass ${className} final : public QObject\n{\n    Q_OBJECT\n\nprivate slots:\n    void initTestCase();\n    void addition();\n    void cleanupTestCase();\n};\n\nvoid ${className}::initTestCase()\n{\n}\n\nvoid ${className}::addition()\n{\n    QCOMPARE(2 + 2, 4);\n}\n\nvoid ${className}::cleanupTestCase()\n{\n}\n\nQTEST_APPLESS_MAIN(${className})\n\n#include "tst_example.moc"\n`;
}

function quickTestMainSource(): string {
  return `#include <QtQuickTest/quicktest.h>\n\nQUICK_TEST_MAIN(qpm_quick_tests)\n`;
}

function quickTestQml(name: string): string {
  return `import QtQuick\nimport QtTest\n\nTestCase {\n    name: "${escapeQmlString(name)}"\n\n    function test_addition() {\n        compare(2 + 2, 4)\n    }\n}\n`;
}

function libraryHeader(name: string, shared: boolean): string {
  const className = safeIdentifier(name);
  const macroBase = className.toUpperCase();
  const exportBlock = shared
    ? `\n#if defined(${macroBase}_LIBRARY)\n#  define ${macroBase}_EXPORT Q_DECL_EXPORT\n#else\n#  define ${macroBase}_EXPORT Q_DECL_IMPORT\n#endif\n`
    : '';
  const classPrefix = shared ? `${macroBase}_EXPORT ` : '';
  return `#pragma once\n\n#include <QString>\n#include <QtGlobal>\n${exportBlock}\nclass ${classPrefix}${className}\n{\npublic:\n    static QString version();\n};\n`;
}

function librarySource(name: string): string {
  const className = safeIdentifier(name);
  return `#include "${className.toLowerCase()}.h"\n#include <QtGlobal>\n\nQString ${className}::version()\n{\n    return QStringLiteral(QT_VERSION_STR);\n}\n`;
}

function moduleAvailabilityDescription(includeDir: string, module: string): string {
  return fs.existsSync(path.join(includeDir, `Qt${module}`)) ? 'Installed in the selected Qt kit' : 'Not detected in this Qt kit';
}

function validateProjectName(value: string): string | undefined {
  if (!value.trim()) return 'A project name is required.';
  if (/[<>:"/\\|?*]/.test(value)) return 'The name contains a character that is not permitted in a file name.';
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) return 'Use letters, digits, underscore, dot or hyphen; start with a letter or underscore.';
  return undefined;
}

function safeIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(normalized) ? normalized : `Qt${normalized}`;
}

function normalizeNewlines(value: string): string {
  return process.platform === 'win32' ? value.replace(/\r?\n/g, '\r\n') : value.replace(/\r\n/g, '\n');
}

function toManifestPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeCppString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeQmlString(value: string): string {
  return escapeCppString(value).replace(/\n/g, '\\n');
}

function activeTabResourcePath(): string | undefined {
  const input = vscode.window.tabGroups?.activeTabGroup.activeTab?.input as { uri?: { fsPath?: string }; modified?: { fsPath?: string }; original?: { fsPath?: string } } | undefined;
  return input?.uri?.fsPath ?? input?.modified?.fsPath ?? input?.original?.fsPath;
}

function designerTargetPath(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { fsPath?: unknown; file?: { absolutePath?: unknown }; resourceUri?: { fsPath?: unknown } };
  if (typeof candidate.fsPath === 'string') return candidate.fsPath;
  if (typeof candidate.file?.absolutePath === 'string') return candidate.file.absolutePath;
  if (typeof candidate.resourceUri?.fsPath === 'string') return candidate.resourceUri.fsPath;
  return undefined;
}

function findNearestQtManifest(filePath: string): string | undefined {
  let current = path.dirname(path.resolve(filePath));
  for (let depth = 0; depth < 10; depth += 1) {
    let entries: string[] = [];
    try { entries = fs.readdirSync(current); } catch { entries = []; }
    const manifests = entries
      .filter((entry) => isQtProjectManifestPath(entry))
      .map((entry) => path.join(current, entry));
    if (manifests.length === 1) return manifests[0];
    for (const manifestPath of manifests) {
      try {
        const manifest = readQtProjectManifest(manifestPath);
        const absoluteForms = manifest.files.forms.map((entry) => path.resolve(current, entry));
        if (absoluteForms.some((entry) => path.normalize(entry).toLowerCase() === path.normalize(filePath).toLowerCase())) return manifestPath;
      } catch {
        // Ignore an invalid manifest while searching parent directories.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function designerEnvironment(installation: QpmQtInstallation, extraPluginRoots: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const directDesignerKit = installation.designerPath ? describeQtRoot(path.dirname(path.dirname(installation.designerPath))) : undefined;
  const runtimeKit = directDesignerKit ?? installation;
  const entries = [
    installation.designerPath ? path.dirname(installation.designerPath) : undefined,
    runtimeKit.binDir,
    runtimeKit.toolchain.binDir,
    ...(process.env.PATH ?? '').split(path.delimiter)
  ].filter((entry): entry is string => Boolean(entry));
  const seen = new Set<string>();
  env.PATH = entries.filter((entry) => {
    const key = path.normalize(entry).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(path.delimiter);
  const pluginRoots = [runtimeKit.pluginsDir, ...extraPluginRoots].filter((entry): entry is string => !!entry && fs.existsSync(entry));
  if (pluginRoots.length) env.QT_PLUGIN_PATH = [...new Set(pluginRoots.map((entry) => path.normalize(entry)))].join(path.delimiter);
  if (runtimeKit.pluginsDir) env.QT_QPA_PLATFORM_PLUGIN_PATH = path.join(runtimeKit.pluginsDir, 'platforms');
  if (runtimeKit.qmlDir) env.QML2_IMPORT_PATH = runtimeKit.qmlDir;
  return env;
}

async function spawnDesigner(installation: QpmQtInstallation, target: string, output: vscode.OutputChannel, extraPluginRoots: string[] = []): Promise<void> {
  const executable = installation.designerPath!;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [target], {
      cwd: path.dirname(target),
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
      shell: false,
      env: designerEnvironment(installation, extraPluginRoots)
    });
    let started = false;
    child.once('error', (error) => {
      output.appendLine(`[Qt Designer] Launch failed: ${error.message}`);
      reject(error);
    });
    child.once('spawn', () => {
      started = true;
      output.appendLine(`[Qt Designer] Process started (PID ${child.pid ?? 'unknown'}).`);
      child.unref();
      resolve();
    });
    child.once('exit', (code, signal) => {
      output.appendLine(`[Qt Designer] Process exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`);
      if (started && code !== null && code !== 0) {
        void vscode.window.showErrorMessage(`Qt Widgets Designer exited with code ${code}. See the “Qt Project Manager” output for details.`);
      }
    });
  });
}

function findActiveManifestPath(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  return active && isQtProjectManifestPath(active) ? active : undefined;
}
