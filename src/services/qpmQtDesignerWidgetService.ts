import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';
import * as vscode from 'vscode';
import {
  getQtInstallationPreference,
  isQtProjectManifestPath,
  readQtProjectManifest,
  resolveQtProjectFiles
} from '../model/qtProjectManifest';
import { QpmWorkspaceProjectRef } from '../model/types';
import { QpmWorkspaceService } from './qpmWorkspaceService';
import {
  describeQtRoot,
  QpmQtInstallation,
  QpmQtInstallationService
} from './qpmQtInstallationService';
import { QpmQtProjectService } from './qpmQtProjectService';

export interface QpmDesignerWidgetDescriptor {
  className: string;
  headerPath: string;
  sourcePath?: string;
  formPath?: string;
  includeFile: string;
  objectName: string;
  displayName: string;
  toolTip: string;
}

interface QpmDesignerWidgetConfig {
  schemaVersion: 1;
  group: string;
  widgets: Array<{
    className: string;
    header: string;
    source?: string;
    form?: string;
    includeFile: string;
    displayName: string;
    toolTip: string;
  }>;
}

export interface QpmDesignerPluginLayout {
  root: string;
  sourceDirectory: string;
  buildDirectory: string;
  runtimeRoot: string;
  designerDirectory: string;
  projectFile: string;
  configFile: string;
}

const CONFIG_DIRECTORY = path.join('.qpm', 'designer-plugins');
const CONFIG_FILE = 'widgets.json';
const SOURCE_DIRECTORY = 'qpm_instrumentation';
const BUILD_DIRECTORY = 'build';
const RUNTIME_DIRECTORY = 'runtime';

export function qpmDesignerPluginLayout(projectRoot: string): QpmDesignerPluginLayout {
  const root = path.join(projectRoot, CONFIG_DIRECTORY);
  const sourceDirectory = path.join(root, SOURCE_DIRECTORY);
  const buildDirectory = path.join(root, BUILD_DIRECTORY);
  const runtimeRoot = path.join(root, RUNTIME_DIRECTORY);
  const designerDirectory = path.join(runtimeRoot, 'designer');
  return {
    root,
    sourceDirectory,
    buildDirectory,
    runtimeRoot,
    designerDirectory,
    projectFile: path.join(sourceDirectory, 'qpm_instrumentation.pro'),
    configFile: path.join(root, CONFIG_FILE)
  };
}

export function discoverQpmDesignerWidgets(manifestPath: string): QpmDesignerWidgetDescriptor[] {
  const manifest = readQtProjectManifest(manifestPath);
  const files = resolveQtProjectFiles(manifestPath, manifest);
  const projectRoot = path.dirname(manifestPath);
  const sourceByStem = new Map<string, string>();
  for (const sourcePath of files.sources) {
    sourceByStem.set(path.basename(sourcePath, path.extname(sourcePath)).toLowerCase(), sourcePath);
  }
  const formByStem = new Map<string, string>();
  for (const formPath of files.forms) {
    formByStem.set(path.basename(formPath, path.extname(formPath)).toLowerCase(), formPath);
  }

  const widgets: QpmDesignerWidgetDescriptor[] = [];
  for (const headerPath of files.headers) {
    let content = '';
    try { content = fs.readFileSync(headerPath, 'utf8'); } catch { continue; }
    if (!/\bQ_OBJECT\b/.test(content)) continue;
    const declaration = content.match(/class\s+([^\n{;]+?)\s*:\s*public\s+(?:Qt::)?(?:QWidget|QFrame|QAbstractButton|QPushButton|QToolButton|QCheckBox|QRadioButton|QAbstractSlider|QSlider|QScrollBar|QDial|QLabel|QLineEdit|QTextEdit|QPlainTextEdit|QComboBox|QSpinBox|QDoubleSpinBox|QDateEdit|QTimeEdit|QDateTimeEdit|QLCDNumber|QProgressBar|QGroupBox|QGraphicsView|QOpenGLWidget)\b/);
    if (!declaration) continue;
    const declarationTokens = declaration[1].trim().split(/\s+/).filter((token) => token !== 'final');
    const className = declarationTokens[declarationTokens.length - 1];
    if (!/^[A-Za-z_]\w*$/.test(className)) continue;

    const stem = path.basename(headerPath, path.extname(headerPath));
    const sourcePath = sourceByStem.get(stem.toLowerCase());
    const relativeFromInclude = relativeIncludePath(projectRoot, headerPath);
    widgets.push({
      className,
      headerPath,
      sourcePath,
      formPath: formByStem.get(stem.toLowerCase()),
      includeFile: relativeFromInclude,
      objectName: lowerCamel(className),
      displayName: humanizeClassName(className),
      toolTip: `${humanizeClassName(className)} custom Qt widget`
    });
  }
  return widgets.sort((a, b) => a.className.localeCompare(b.className));
}

export function generateQpmDesignerPluginProject(
  projectRoot: string,
  config: QpmDesignerWidgetConfig,
  targetName = `qpm_${safeIdentifier(path.basename(projectRoot)).toLowerCase()}_designerwidgets`
): QpmDesignerPluginLayout {
  const layout = qpmDesignerPluginLayout(projectRoot);
  fs.mkdirSync(layout.sourceDirectory, { recursive: true });
  fs.mkdirSync(layout.designerDirectory, { recursive: true });

  const widgets = config.widgets.map((entry) => ({
    ...entry,
    headerPath: path.resolve(projectRoot, entry.header),
    sourcePath: entry.source ? path.resolve(projectRoot, entry.source) : undefined,
    formPath: entry.form ? path.resolve(projectRoot, entry.form) : undefined,
    objectName: lowerCamel(entry.className)
  }));

  const pluginHeader = `#pragma once\n\n#include <functional>\n#include <QIcon>\n#include <QList>\n#include <QObject>\n#include <QString>\n#include <QWidget>\n#include <utility>\n#include <QtUiPlugin/QDesignerCustomWidgetInterface>\n\nclass QpmDesignerWidgetInterface final : public QObject, public QDesignerCustomWidgetInterface\n{\n    Q_OBJECT\n    Q_INTERFACES(QDesignerCustomWidgetInterface)\n\npublic:\n    using Factory = std::function<QWidget *(QWidget *)>;\n\n    QpmDesignerWidgetInterface(QString className, QString includeFile, QString objectName, QString displayName, QString groupName, QString toolTip, Factory factory, QObject *parent = nullptr);\n\n    bool isContainer() const override;\n    bool isInitialized() const override;\n    QIcon icon() const override;\n    QString domXml() const override;\n    QString group() const override;\n    QString includeFile() const override;\n    QString name() const override;\n    QString toolTip() const override;\n    QString whatsThis() const override;\n    QWidget *createWidget(QWidget *parent) override;\n    void initialize(QDesignerFormEditorInterface *formEditor) override;\n\nprivate:\n    QString m_className;\n    QString m_includeFile;\n    QString m_objectName;\n    QString m_displayName;\n    QString m_groupName;\n    QString m_toolTip;\n    Factory m_factory;\n    bool m_initialized = false;\n};\n\nclass QpmInstrumentationWidgetCollection final : public QObject, public QDesignerCustomWidgetCollectionInterface\n{\n    Q_OBJECT\n    Q_PLUGIN_METADATA(IID \"org.qt-project.Qt.QDesignerCustomWidgetCollectionInterface\")\n    Q_INTERFACES(QDesignerCustomWidgetCollectionInterface)\n\npublic:\n    explicit QpmInstrumentationWidgetCollection(QObject *parent = nullptr);\n    QList<QDesignerCustomWidgetInterface *> customWidgets() const override;\n\nprivate:\n    QList<QDesignerCustomWidgetInterface *> m_widgets;\n};\n`;

  const widgetIncludes = widgets.map((widget) => `#include \"${escapeCppString(widget.headerPath.replace(/\\/g, '/'))}\"`).join('\n');
  const registrations = widgets.map((widget) => `    m_widgets.append(new QpmDesignerWidgetInterface(\n        QStringLiteral(\"${escapeCppString(widget.className)}\"),\n        QStringLiteral(\"${escapeCppString(widget.includeFile)}\"),\n        QStringLiteral(\"${escapeCppString(widget.objectName)}\"),\n        QStringLiteral(\"${escapeCppString(widget.displayName)}\"),\n        QStringLiteral(\"${escapeCppString(config.group)}\"),\n        QStringLiteral(\"${escapeCppString(widget.toolTip)}\"),\n        [](QWidget *parent) -> QWidget * { return new ${widget.className}(parent); },\n        this));`).join('\n\n');

  const pluginSource = `#include \"qpm_designer_widgets.h\"\n\n${widgetIncludes}\n\nQpmDesignerWidgetInterface::QpmDesignerWidgetInterface(QString className, QString includeFile, QString objectName, QString displayName, QString groupName, QString toolTip, Factory factory, QObject *parent)\n    : QObject(parent),\n      m_className(std::move(className)),\n      m_includeFile(std::move(includeFile)),\n      m_objectName(std::move(objectName)),\n      m_displayName(std::move(displayName)),\n      m_groupName(std::move(groupName)),\n      m_toolTip(std::move(toolTip)),\n      m_factory(std::move(factory))\n{\n}\n\nbool QpmDesignerWidgetInterface::isContainer() const\n{\n    return false;\n}\n\nbool QpmDesignerWidgetInterface::isInitialized() const\n{\n    return m_initialized;\n}\n\nQIcon QpmDesignerWidgetInterface::icon() const\n{\n    return {};\n}\n\nQString QpmDesignerWidgetInterface::domXml() const\n{\n    return QStringLiteral(\"<ui language=\\\"c++\\\"><widget class=\\\"%1\\\" name=\\\"%2\\\"><property name=\\\"geometry\\\"><rect><x>0</x><y>0</y><width>320</width><height>200</height></rect></property><property name=\\\"toolTip\\\"><string>%3</string></property></widget></ui>\")\n        .arg(m_className, m_objectName, m_displayName);\n}\n\nQString QpmDesignerWidgetInterface::group() const\n{\n    return m_groupName;\n}\n\nQString QpmDesignerWidgetInterface::includeFile() const\n{\n    return m_includeFile;\n}\n\nQString QpmDesignerWidgetInterface::name() const\n{\n    return m_className;\n}\n\nQString QpmDesignerWidgetInterface::toolTip() const\n{\n    return m_toolTip;\n}\n\nQString QpmDesignerWidgetInterface::whatsThis() const\n{\n    return m_toolTip;\n}\n\nQWidget *QpmDesignerWidgetInterface::createWidget(QWidget *parent)\n{\n    return m_factory ? m_factory(parent) : nullptr;\n}\n\nvoid QpmDesignerWidgetInterface::initialize(QDesignerFormEditorInterface *)\n{\n    m_initialized = true;\n}\n\nQpmInstrumentationWidgetCollection::QpmInstrumentationWidgetCollection(QObject *parent)\n    : QObject(parent)\n{\n${registrations}\n}\n\nQList<QDesignerCustomWidgetInterface *> QpmInstrumentationWidgetCollection::customWidgets() const\n{\n    return m_widgets;\n}\n`;

  const pluginHeaderPath = path.join(layout.sourceDirectory, 'qpm_designer_widgets.h');
  const pluginSourcePath = path.join(layout.sourceDirectory, 'qpm_designer_widgets.cpp');
  fs.writeFileSync(pluginHeaderPath, pluginHeader, 'utf8');
  fs.writeFileSync(pluginSourcePath, pluginSource, 'utf8');

  const headers = [pluginHeaderPath, ...widgets.map((widget) => widget.headerPath)];
  const sources = [pluginSourcePath, ...widgets.map((widget) => widget.sourcePath).filter((entry): entry is string => !!entry)];
  const forms = widgets.map((widget) => widget.formPath).filter((entry): entry is string => !!entry);
  const projectFile = [
    '# Generated by Qt Project Manager — Qt Widgets Designer custom-widget collection',
    'QT += widgets uiplugin',
    'TEMPLATE = lib',
    'CONFIG += plugin release c++17',
    'CONFIG -= debug debug_and_release debug_and_release_target',
    `TARGET = ${targetName}`,
    'DEFINES += QPM_DESIGNER_PLUGIN_BUILD',
    `DESTDIR = ${qmakeQuote(layout.designerDirectory)}`,
    // qmake/MinGW can corrupt absolute OBJECTS_DIR values containing spaces when
    // it generates object_script response files. These directories are relative to
    // layout.buildDirectory because qmake itself is executed with that cwd.
    'OBJECTS_DIR = obj',
    'MOC_DIR = moc',
    'RCC_DIR = rcc',
    'UI_DIR = ui',
    `INCLUDEPATH += ${qmakeQuote(projectRoot)} ${qmakeQuote(path.join(projectRoot, 'include'))}`,
    qmakeList('HEADERS', headers),
    qmakeList('SOURCES', sources),
    qmakeList('FORMS', forms),
    '',
    '# Qt Designer searches a designer/ subdirectory for each QT_PLUGIN_PATH entry.',
    'target.path = $$[QT_INSTALL_PLUGINS]/designer',
    'INSTALLS += target',
    ''
  ].join('\n');
  fs.writeFileSync(layout.projectFile, projectFile, 'utf8');
  return layout;
}

export class QpmQtDesignerWidgetService {
  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly installations: QpmQtInstallationService,
    private readonly qtProjects: QpmQtProjectService,
    private readonly output: vscode.OutputChannel
  ) {}

  async configure(projectRef?: QpmWorkspaceProjectRef): Promise<boolean> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return false;
    const discovered = discoverQpmDesignerWidgets(ref.absolutePath);
    if (discovered.length === 0) {
      vscode.window.showInformationMessage('No Q_OBJECT QWidget class was found in the active Qt project. Create a Custom Painted Widget first, or add a QWidget-derived class to the project.');
      return false;
    }

    const selected = await vscode.window.showQuickPick(discovered.map((widget) => ({
      label: widget.className,
      description: widget.includeFile,
      detail: widget.sourcePath ? path.relative(path.dirname(ref.absolutePath), widget.sourcePath) : 'Header-only widget',
      picked: true,
      widget
    })), {
      title: 'Qt Designer Custom Widgets',
      placeHolder: 'Select the project widgets to expose in Qt Widgets Designer',
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!selected?.length) return false;

    const group = await vscode.window.showInputBox({
      title: 'Qt Designer Widget Box Group',
      prompt: 'Category displayed in Qt Widgets Designer',
      value: 'QPM Instrumentation',
      validateInput: (value) => value.trim() ? undefined : 'The Designer group name cannot be empty.'
    });
    if (!group) return false;

    const projectRoot = path.dirname(ref.absolutePath);
    const layout = qpmDesignerPluginLayout(projectRoot);
    fs.mkdirSync(layout.root, { recursive: true });
    const config: QpmDesignerWidgetConfig = {
      schemaVersion: 1,
      group: group.trim(),
      widgets: selected.map(({ widget }) => ({
        className: widget.className,
        header: normalizeRelative(projectRoot, widget.headerPath),
        source: widget.sourcePath ? normalizeRelative(projectRoot, widget.sourcePath) : undefined,
        form: widget.formPath ? normalizeRelative(projectRoot, widget.formPath) : undefined,
        includeFile: widget.includeFile,
        displayName: widget.displayName,
        toolTip: widget.toolTip
      }))
    };
    fs.writeFileSync(layout.configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    generateQpmDesignerPluginProject(projectRoot, config);
    this.output.appendLine(`[Qt Designer Widgets] Configured ${config.widgets.length} widget(s) in group “${config.group}”.`);
    vscode.window.showInformationMessage(`Configured ${config.widgets.length} Qt Designer custom widget(s) in “${config.group}”.`);
    return true;
  }

  async prepareAll(projectRef?: QpmWorkspaceProjectRef): Promise<string | undefined> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return undefined;
    const discovered = discoverQpmDesignerWidgets(ref.absolutePath);
    if (discovered.length === 0) {
      vscode.window.showInformationMessage('No Q_OBJECT QWidget class was found in the active Qt project. Generate an instrumentation widget or AcquisitionDashboard first.');
      return undefined;
    }

    const projectRoot = path.dirname(ref.absolutePath);
    const previous = this.readConfig(projectRoot);
    const group = previous?.group?.trim() || 'QPM Instrumentation';
    const config: QpmDesignerWidgetConfig = {
      schemaVersion: 1,
      group,
      widgets: discovered.map((widget) => ({
        className: widget.className,
        header: normalizeRelative(projectRoot, widget.headerPath),
        source: widget.sourcePath ? normalizeRelative(projectRoot, widget.sourcePath) : undefined,
        form: widget.formPath ? normalizeRelative(projectRoot, widget.formPath) : undefined,
        includeFile: widget.includeFile,
        displayName: widget.displayName,
        toolTip: widget.toolTip
      }))
    };
    const layout = qpmDesignerPluginLayout(projectRoot);
    fs.mkdirSync(layout.root, { recursive: true });
    fs.writeFileSync(layout.configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    generateQpmDesignerPluginProject(projectRoot, config);
    this.output.appendLine(`[Qt Designer Widgets] Prepared all ${config.widgets.length} discovered widget(s) in group “${config.group}”.`);
    return this.build(ref);
  }

  async prepareAllAndOpen(target?: unknown, projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return;
    const plugin = await this.prepareAll(ref);
    if (!plugin) return;
    const layout = qpmDesignerPluginLayout(path.dirname(ref.absolutePath));
    await this.qtProjects.openDesigner(target, [layout.runtimeRoot]);
  }

  async build(projectRef?: QpmWorkspaceProjectRef): Promise<string | undefined> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return undefined;
    const projectRoot = path.dirname(ref.absolutePath);
    let config = this.readConfig(projectRoot);
    if (!config) {
      const configured = await this.configure(ref);
      if (!configured) return undefined;
      config = this.readConfig(projectRoot);
    }
    if (!config) return undefined;

    const layout = generateQpmDesignerPluginProject(projectRoot, config);
    const manifest = readQtProjectManifest(ref.absolutePath);
    let activeInstallation = this.installations.getActive(getQtInstallationPreference(manifest));
    if (!activeInstallation) activeInstallation = await this.installations.select();
    if (!activeInstallation) return undefined;
    if (!activeInstallation.designerPath || !fs.existsSync(activeInstallation.designerPath)) {
      activeInstallation = await this.installations.selectDesignerExecutable(activeInstallation.root);
    }
    if (!activeInstallation?.designerPath) return undefined;
    if (activeInstallation.designerLauncherKind === 'qtcreator') {
      vscode.window.showErrorMessage(
        "QPM Designer custom widgets require the standalone Qt Widgets Designer (designer.exe), because the plugin must match Designer's Qt ABI. Select designer.exe from the Qt kit used by Designer."
      );
      return undefined;
    }

    const designerKit = resolveDesignerKit(activeInstallation);
    if (!designerKit.qmakePath || !fs.existsSync(designerKit.qmakePath)) {
      vscode.window.showErrorMessage(`The Qt kit used by Designer does not provide qmake: ${designerKit.root}`);
      return undefined;
    }
    const buildTool = resolveBuildTool(designerKit);
    if (!buildTool) {
      vscode.window.showErrorMessage(`No build tool was found for the Designer Qt kit (${designerKit.compilerFamily}).`);
      return undefined;
    }

    try {
      fs.rmSync(layout.buildDirectory, { recursive: true, force: true });
      fs.rmSync(layout.designerDirectory, { recursive: true, force: true });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to clean the Designer plugin output. Close Qt Widgets Designer before rebuilding the plugin. ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
    fs.mkdirSync(layout.buildDirectory, { recursive: true });
    fs.mkdirSync(layout.designerDirectory, { recursive: true });

    const env = createBuildEnvironment(designerKit);
    this.output.show(true);
    this.output.appendLine(`[Qt Designer Widgets] Designer: ${activeInstallation.designerPath}`);
    this.output.appendLine(`[Qt Designer Widgets] Build Qt kit: ${designerKit.label}`);
    this.output.appendLine(`[Qt Designer Widgets] qmake: ${designerKit.qmakePath}`);
    this.output.appendLine(`[Qt Designer Widgets] build tool: ${buildTool}`);

    const qmakeOk = await this.run(designerKit.qmakePath, [layout.projectFile], layout.buildDirectory, env, 'Generate Designer plugin Makefile');
    if (!qmakeOk) return undefined;
    const makeName = path.basename(buildTool).toLowerCase();
    const makeArgs = /(?:mingw32-make|make|jom)/.test(makeName) ? ['-j', String(Math.max(1, Math.min(8, os.cpus().length)))] : [];
    const buildOk = await this.run(buildTool, makeArgs, layout.buildDirectory, env, 'Build Designer custom-widget plugin');
    if (!buildOk) return undefined;

    const plugin = findPluginBinary(layout.designerDirectory);
    if (!plugin) {
      vscode.window.showErrorMessage(`The Designer plugin build completed but no plugin library was found in ${layout.designerDirectory}.`);
      return undefined;
    }
    this.output.appendLine(`[Qt Designer Widgets] Plugin ready: ${plugin}`);
    vscode.window.showInformationMessage(`Qt Designer widget plugin built: ${path.basename(plugin)}. Open a .ui file through QPM to load it.`);
    return plugin;
  }

  async install(projectRef?: QpmWorkspaceProjectRef): Promise<string | undefined> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return undefined;
    const plugin = await this.ensureBuilt(ref);
    if (!plugin) return undefined;
    const manifest = readQtProjectManifest(ref.absolutePath);
    let installation = this.installations.getActive(getQtInstallationPreference(manifest));
    if (!installation) installation = await this.installations.select();
    if (!installation) return undefined;
    if (!installation.designerPath || !fs.existsSync(installation.designerPath)) installation = await this.installations.selectDesignerExecutable(installation.root);
    if (!installation?.designerPath) return undefined;
    if (installation.designerLauncherKind === 'qtcreator') {
      vscode.window.showErrorMessage('Global QPM Designer widget installation requires the standalone Qt Widgets Designer (designer.exe), not Qt Creator.');
      return undefined;
    }
    const designerKit = resolveDesignerKit(installation);
    if (!designerKit.pluginsDir) {
      vscode.window.showErrorMessage('The selected Designer Qt kit does not expose a plugins directory.');
      return undefined;
    }
    const destinationDirectory = path.join(designerKit.pluginsDir, 'designer');
    const destination = path.join(destinationDirectory, path.basename(plugin));
    const answer = await vscode.window.showWarningMessage(
      `Install ${path.basename(plugin)} into the Qt Designer installation? QPM normally uses a project-local plugin path, which is safer.`,
      { modal: true },
      'Install'
    );
    if (answer !== 'Install') return undefined;
    try {
      fs.mkdirSync(destinationDirectory, { recursive: true });
      fs.copyFileSync(plugin, destination);
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to install the Designer plugin: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    vscode.window.showInformationMessage(`Installed Qt Designer widget plugin to ${destinationDirectory}. Restart Designer to reload plugins.`);
    return destination;
  }

  async openDesigner(target?: unknown, projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return;
    const projectRoot = path.dirname(ref.absolutePath);
    const layout = qpmDesignerPluginLayout(projectRoot);
    const discovered = discoverQpmDesignerWidgets(ref.absolutePath);
    const configured = this.readConfig(projectRoot);
    const configuredClasses = new Set((configured?.widgets ?? []).map((entry) => entry.className));
    const missingClasses = discovered.filter((widget) => !configuredClasses.has(widget.className));
    if (configured && missingClasses.length > 0) {
      const choice = await vscode.window.showInformationMessage(
        `${missingClasses.length} project widget(s) are not yet included in the Designer plugin: ${missingClasses.map((widget) => widget.className).join(', ')}.`,
        'Prepare all & rebuild',
        'Keep current plugin'
      );
      if (choice === 'Prepare all & rebuild') {
        const plugin = await this.prepareAll(ref);
        if (!plugin) return;
      }
    }
    if (!findPluginBinary(layout.designerDirectory)) {
      const choice = await vscode.window.showInformationMessage(
        'The project-local Qt Designer widget plugin has not been built yet.',
        'Build plugin',
        'Open without custom widgets'
      );
      if (choice === 'Build plugin') {
        const plugin = await this.build(ref);
        if (!plugin) return;
      } else if (choice !== 'Open without custom widgets') {
        return;
      }
    }
    await this.qtProjects.openDesigner(target, [layout.runtimeRoot]);
  }

  async clean(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return;
    const layout = qpmDesignerPluginLayout(path.dirname(ref.absolutePath));
    try {
      fs.rmSync(layout.buildDirectory, { recursive: true, force: true });
      fs.rmSync(layout.runtimeRoot, { recursive: true, force: true });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to clean the Designer plugin output. Close Qt Widgets Designer first. ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    vscode.window.showInformationMessage('Cleaned the project-local Qt Designer widget plugin build/output. Configuration was preserved.');
  }

  async reveal(projectRef?: QpmWorkspaceProjectRef): Promise<void> {
    const ref = this.requireNativeProject(projectRef);
    if (!ref) return;
    const layout = qpmDesignerPluginLayout(path.dirname(ref.absolutePath));
    fs.mkdirSync(layout.designerDirectory, { recursive: true });
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(layout.designerDirectory));
  }

  private requireNativeProject(projectRef?: QpmWorkspaceProjectRef): QpmWorkspaceProjectRef | undefined {
    const ref = projectRef ?? this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) {
      vscode.window.showErrorMessage('Open a native Qt C++ .qtproject.json project first.');
      return undefined;
    }
    return ref;
  }

  private readConfig(projectRoot: string): QpmDesignerWidgetConfig | undefined {
    const configFile = qpmDesignerPluginLayout(projectRoot).configFile;
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8')) as QpmDesignerWidgetConfig;
      return parsed.schemaVersion === 1 && Array.isArray(parsed.widgets) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private async ensureBuilt(ref: QpmWorkspaceProjectRef): Promise<string | undefined> {
    const layout = qpmDesignerPluginLayout(path.dirname(ref.absolutePath));
    return findPluginBinary(layout.designerDirectory) ?? this.build(ref);
  }

  private run(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): Promise<boolean> {
    this.output.appendLine(`[Qt Designer Widgets] ${label}`);
    this.output.appendLine(`[Qt Designer Widgets] ${executable} ${args.map(quoteForLog).join(' ')}`);
    return new Promise((resolve) => {
      const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false });
      child.stdout.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.stderr.on('data', (data: Buffer) => this.output.append(data.toString()));
      child.on('error', (error) => {
        this.output.appendLine(`[Qt Designer Widgets] Unable to start ${executable}: ${error.message}`);
        resolve(false);
      });
      child.on('close', (code) => {
        this.output.appendLine(`[Qt Designer Widgets] ${path.basename(executable)} exited with code ${String(code)}.`);
        resolve(code === 0);
      });
    });
  }
}

function resolveDesignerKit(activeInstallation: QpmQtInstallation): QpmQtInstallation {
  const designerPath = activeInstallation.designerPath;
  if (designerPath) {
    const candidateRoot = path.dirname(path.dirname(designerPath));
    const candidate = describeQtRoot(candidateRoot);
    if (candidate) return candidate;
  }
  return activeInstallation;
}

function resolveBuildTool(installation: QpmQtInstallation): string | undefined {
  const candidates = [installation.toolchain.makePath, installation.jomPath, installation.nmakePath];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return process.platform === 'win32'
    ? installation.compilerFamily === 'mingw' ? 'mingw32-make.exe' : installation.compilerFamily === 'msvc' ? 'nmake.exe' : undefined
    : 'make';
}

function createBuildEnvironment(installation: QpmQtInstallation): NodeJS.ProcessEnv {
  let env: NodeJS.ProcessEnv = { ...process.env };
  const script = installation.toolchain.environmentScript || installation.vcVarsPath;
  if (script && process.platform === 'win32' && fs.existsSync(script)) {
    env = { ...env, ...captureWindowsEnvironment(script, installation.architecture === 'x86' ? 'x86' : installation.architecture === 'arm64' ? 'arm64' : 'x64') };
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const entries = [
    installation.binDir,
    installation.toolchain.binDir,
    installation.qmakePath ? path.dirname(installation.qmakePath) : undefined,
    ...(env[pathKey] ?? '').split(path.delimiter)
  ].filter((entry): entry is string => !!entry);
  env[pathKey] = uniquePaths(entries).join(path.delimiter);
  env.QTDIR = installation.root;
  if (installation.pluginsDir) env.QT_PLUGIN_PATH = installation.pluginsDir;
  return env;
}

function captureWindowsEnvironment(script: string, architecture: string): NodeJS.ProcessEnv {
  try {
    const command = `\"${script}\" ${architecture} >nul && set`;
    const output = execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    const env: NodeJS.ProcessEnv = {};
    for (const line of output.split(/\r?\n/)) {
      const separator = line.indexOf('=');
      if (separator > 0) env[line.slice(0, separator)] = line.slice(separator + 1);
    }
    return env;
  } catch {
    return {};
  }
}

function findPluginBinary(directory: string): string | undefined {
  if (!fs.existsSync(directory)) return undefined;
  const extensions = process.platform === 'win32' ? ['.dll'] : process.platform === 'darwin' ? ['.dylib', '.so'] : ['.so'];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name))[0];
}

function relativeIncludePath(projectRoot: string, headerPath: string): string {
  const includeRoot = path.join(projectRoot, 'include');
  const normalizedHeader = path.resolve(headerPath);
  const relative = path.relative(includeRoot, normalizedHeader);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
  return path.relative(projectRoot, normalizedHeader).replace(/\\/g, '/');
}

function normalizeRelative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/g, '/');
}

function lowerCamel(value: string): string {
  return value.length ? value[0].toLowerCase() + value.slice(1) : 'customWidget';
}

function humanizeClassName(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
}

function safeIdentifier(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z_]/.test(safe) ? safe : `project_${safe || 'qt'}`;
}

function escapeCppString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
}

function qmakeQuote(value: string): string {
  // Let qmake own whitespace escaping; plain quoted absolute Windows paths can
  // leak quote characters into generated MinGW response-file names.
  return `$$quote(${value.replace(/\\/g, '/')})`;
}

function qmakeList(name: string, values: string[]): string {
  if (!values.length) return `${name} =`;
  return `${name} += \\\n    ${values.map(qmakeQuote).join(' \\\n    ')}`;
}

function uniquePaths(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((entry) => {
    const key = path.normalize(entry).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function quoteForLog(value: string): string {
  return /\s/.test(value) ? `\"${value}\"` : value;
}
