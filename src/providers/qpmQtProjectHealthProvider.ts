import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getActiveQtBuildProfile, getActiveQtDeployProfile, getQtKitProfileForBuild, getActiveQtRunProfile, getActiveQtDebugProfile, getActiveQtPlatformProfile, getQtInstallationPreference, isQtProjectManifestPath, readQtProjectManifest, resolveQtProjectFiles } from '../model/qtProjectManifest';
import { QpmBuildService } from '../services/qpmBuildService';
import { createQtDirectBuildPlan } from '../services/qpmQtDirectBuildService';
import { QpmQtInstallationService } from '../services/qpmQtInstallationService';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';
import { QpmQtTestingService } from '../services/qpmQtTestingService';
import { QpmQtQualityService } from '../services/qpmQtQualityService';
import { QpmQtPlatformService } from '../services/qpmQtPlatformService';
import { QpmQtProfilingService } from '../services/qpmQtProfilingService';
import { QpmQtInstallerService } from '../services/qpmQtInstallerService';
import { QpmQtPublicationService } from '../services/qpmQtPublicationService';
import { readQtResourceDocument, validateQtResourceDocument } from '../views/qtResourceEditorPanel';

export type QtHealthSeverity = 'ok' | 'info' | 'warning' | 'error';

export interface QtHealthItem {
  id: string;
  label: string;
  description: string;
  severity: QtHealthSeverity;
  detail?: string;
  command?: vscode.Command;
}

export class QpmQtProjectHealthProvider implements vscode.TreeDataProvider<QtHealthItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<QtHealthItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private view?: vscode.TreeView<QtHealthItem>;

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly installations: QpmQtInstallationService,
    private readonly builds: QpmBuildService,
    private readonly testing?: QpmQtTestingService,
    private readonly quality?: QpmQtQualityService,
    private readonly platforms?: QpmQtPlatformService,
    private readonly profiling?: QpmQtProfilingService,
    private readonly installers?: QpmQtInstallerService,
    private readonly publication?: QpmQtPublicationService
  ) {
    this.disposables.push(this.workspaces.onDidChange(() => this.refresh()));
  }

  attachView(view: vscode.TreeView<QtHealthItem>): void {
    this.view = view;
    this.updateDescription();
  }

  refresh(): void {
    this.updateDescription();
    this.emitter.fire();
  }

  getTreeItem(element: QtHealthItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.detail ?? `${element.label}: ${element.description}`;
    item.contextValue = `qpmQtHealth.${element.severity}`;
    item.iconPath = new vscode.ThemeIcon(iconForSeverity(element.severity));
    item.command = element.command;
    return item;
  }

  getChildren(): QtHealthItem[] {
    return this.collect();
  }

  async openReport(): Promise<void> {
    const ref = this.workspaces.activeProjectRef;
    const items = this.collect();
    const lines = [
      '# Qt Project Health',
      '',
      `Project: ${ref?.name ?? 'none'}`,
      `Manifest: ${ref?.absolutePath ?? 'none'}`,
      `Build mode: ${this.builds.buildMode}`,
      '',
      '| Status | Check | Result |',
      '|---|---|---|',
      ...items.map((item) => `| ${item.severity.toUpperCase()} | ${escapeTable(item.label)} | ${escapeTable(item.description)} |`),
      '',
      ...items.filter((item) => item.detail).flatMap((item) => [`## ${item.label}`, '', item.detail!, ''])
    ];
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private collect(): QtHealthItem[] {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists) {
      return [health('project', 'Active project', 'No active project', 'warning', 'Open or create a native Qt project.', 'qpm.openWorkspace')];
    }
    if (!isQtProjectManifestPath(ref.absolutePath)) {
      return [health('project', 'Project format', 'Compatibility .prj project', 'warning', 'Qt Project Health is optimized for .qtproject.json projects.', 'qpm.createQtProject')];
    }

    try {
      const manifest = readQtProjectManifest(ref.absolutePath);
      const projectRoot = path.dirname(ref.absolutePath);
      const files = resolveQtProjectFiles(ref.absolutePath, manifest);
      const kitProfile = getQtKitProfileForBuild(manifest, this.builds.buildMode);
      const buildProfile = getActiveQtBuildProfile(manifest, this.builds.buildMode);
      const runProfile = getActiveQtRunProfile(manifest);
      const deployProfile = getActiveQtDeployProfile(manifest);
      const debugProfile = getActiveQtDebugProfile(manifest);
      const platformProfile = getActiveQtPlatformProfile(manifest);
      const installation = this.installations.getActive(getQtInstallationPreference(manifest, this.builds.buildMode));
      const allFiles = Object.values(files).flat();
      const missingFiles = allFiles.filter((filePath) => !fs.existsSync(filePath));
      const items: QtHealthItem[] = [];

      items.push(health('manifest', 'Manifest', `Schema v${manifest.schemaVersion} · ${manifest.kind}`, 'ok', ref.absolutePath, 'qpm.showQtProjectInfo'));
      items.push(health('profiles', 'Project profiles', `${manifest.profiles.kits.length} kit · ${manifest.profiles.builds.length} builds · ${manifest.profiles.runs.length} run · ${manifest.profiles.deploys.length} deploy · ${manifest.profiles.debugs.length} debug · ${manifest.profiles.platforms.length} platform`, 'ok', `Active kit: ${kitProfile.name}\nActive build: ${buildProfile.name}\nActive run: ${runProfile.name}\nActive deploy: ${deployProfile.name}
Active debug: ${debugProfile.name}
Active platform: ${platformProfile.name}`, 'qpm.editBuildSettings'));

      if (this.platforms) {
        const capabilities = this.platforms.detectCapabilities(platformProfile);
        items.push(health(
          'platform',
          'Target platform',
          `${platformProfile.name} · ${platformProfile.type} · ${platformProfile.buildLocation}`,
          capabilities.ready ? 'ok' : 'warning',
          [capabilities.summary, ...capabilities.details, ...Object.entries(capabilities.tools).map(([key, value]) => `${key}: ${value ?? 'not found'}`)].join('\n'),
          capabilities.ready ? 'qpm.selectQtPlatform' : 'qpm.manageQtPlatforms'
        ));
      }

      if (!installation) {
        items.push(health('kit', 'Qt kit', 'Not resolved', 'error', kitProfile.qtInstallation || 'No Qt installation configured in the active kit profile.', 'qpm.selectQtInstallation'));
      } else {
        const compatibility = kitProfile.compatibility ?? installation.toolchain.compatibility;
        const severity: QtHealthSeverity = compatibility === 'incompatible' ? 'error' : compatibility === 'unknown' ? 'warning' : 'ok';
        items.push(health(
          'kit',
          'Qt kit',
          `${kitProfile.name} · ${installation.label}`,
          severity,
          `${installation.root}
Compiler: ${kitProfile.compilerPath ?? installation.toolchain.cppCompilerPath ?? 'not resolved'}
Target: ${kitProfile.compilerTargetTriple ?? installation.toolchain.targetTriple ?? kitProfile.architecture ?? installation.architecture}
Debugger: ${kitProfile.debuggerType}${kitProfile.debuggerPath ? ` · ${kitProfile.debuggerPath}` : ''}
${kitProfile.diagnostic ?? installation.toolchain.diagnostic ?? ''}`,
          severity === 'error' ? 'qpm.manageQtKits' : 'qpm.showQtInstallationInfo'
        ));
      }

      const backendTool = buildProfile.system === 'qmake'
        ? (kitProfile.qmakePath || installation?.qmakePath)
        : buildProfile.system === 'cmake'
          ? (kitProfile.cmakePath || installation?.cmakePath)
          : installation?.toolchain.cppCompilerPath;
      const backendReady = buildProfile.system === 'direct' || Boolean(backendTool);
      items.push(health(
        'backend',
        'Build backend',
        `${buildProfile.name} · ${buildProfile.system} · ${buildProfile.cppStandard}`,
        backendReady ? 'ok' : 'error',
        `Output: ${buildProfile.outputDirectory}
Generated: ${buildProfile.generatedDirectory}
Kit profile: ${buildProfile.kitId}
Tool: ${backendTool ?? 'not resolved'}
Parallel jobs: ${buildProfile.parallelJobs > 0 ? buildProfile.parallelJobs : 'automatic'}`,
        buildProfile.system === 'direct' ? 'qpm.editBuildSettings' : 'qpm.configureQtBackend'
      ));
      items.push(health('files', 'Project files', missingFiles.length ? `${missingFiles.length} missing / ${allFiles.length}` : `${allFiles.length} files available`, missingFiles.length ? 'error' : 'ok', missingFiles.length ? missingFiles.join('\n') : 'All manifest files exist.', 'qpm.refresh'));

      const cppConfigPath = path.join(projectRoot, '.vscode', 'c_cpp_properties.json');
      const compileDbPath = path.join(projectRoot, 'compile_commands.json');
      const intelliSenseOk = fs.existsSync(cppConfigPath) && fs.existsSync(compileDbPath);
      items.push(health('intellisense', 'Qt/C++ IntelliSense', intelliSenseOk ? 'Configuration synchronized' : 'Configuration incomplete', intelliSenseOk ? 'ok' : 'warning', `${cppConfigPath}\n${compileDbPath}`, 'qpm.syncCppTools'));

      if (installation && missingFiles.length === 0) {
        if (buildProfile.system === 'direct') {
          try {
            const plan = createQtDirectBuildPlan(ref.absolutePath, this.builds.buildMode, installation);
            items.push(health('plan', 'Direct build plan', `${plan.sourceFiles.length + plan.generatedSourceFiles.length} sources · ${plan.generationSteps.length} Qt generators`, 'ok', `Target: ${plan.targetPath}
Objects: ${plan.objectDirectory}
Generated: ${plan.generatedDirectory}`, 'qpm.showQtBuildPlan'));
          } catch (error) {
            items.push(health('plan', 'Direct build plan', 'Invalid', 'error', error instanceof Error ? error.message : String(error), 'qpm.showQtBuildPlan'));
          }
        } else {
          items.push(health(
            'plan',
            `${buildProfile.system === 'qmake' ? 'qmake' : 'CMake'} project`,
            buildProfile.generateProjectFiles ? 'Generated by QPM' : (buildProfile.projectFile || buildProfile.sourceDirectory || 'Project source directory'),
            backendReady ? 'ok' : 'error',
            `Build directory: ${path.resolve(projectRoot, buildProfile.outputDirectory, buildProfile.variant, buildProfile.system)}
Configure arguments: ${buildProfile.configureArguments.join(' ') || 'none'}
Build arguments: ${buildProfile.buildArguments.join(' ') || 'none'}`,
            'qpm.openQtBackendProject'
          ));
        }
      }

      const mocEnabled = buildProfile.autoMoc;
      const uicEnabled = buildProfile.autoUic;
      const rccEnabled = buildProfile.autoRcc;
      items.push(health('generators', 'Qt generators', `MOC ${state(mocEnabled)} · UIC ${state(uicEnabled)} · RCC ${state(rccEnabled)}`, mocEnabled && uicEnabled && rccEnabled ? 'ok' : 'info', 'Generator settings are stored in the active build profile.', 'qpm.editBuildSettings'));

      const discoveredTests = this.testing?.testCount ?? 0;
      const testSeverity: QtHealthSeverity = manifest.kind === 'test-application' || manifest.kind === 'quick-test-application' || manifest.testing.framework !== 'auto'
        ? discoveredTests > 0 ? 'ok' : 'warning'
        : discoveredTests > 0 ? 'ok' : 'info';
      items.push(health('tests', 'Project tests', `${discoveredTests} discovered · ${manifest.testing.framework}`, testSeverity, `Build before run: ${manifest.testing.buildBeforeRun ? 'yes' : 'no'}\nTimeout: ${manifest.testing.timeoutMs} ms\nParallel jobs: ${manifest.testing.parallelJobs || 'automatic'}\nRepeat: ${manifest.testing.repeatMode === 'never' ? 'disabled' : `${manifest.testing.repeatMode} × ${manifest.testing.repeatCount}`}\nFailed tests remembered: ${this.testing?.failedTestCount ?? 0}\nOffscreen platform: ${manifest.testing.useOffscreenPlatform ? 'yes' : 'no'}`, 'qpm.openTestExplorer'));

      if (this.quality) {
        const tools = this.quality.getToolStatus(ref);
        const analyzerReady = Boolean(tools.clangTidyPath || tools.clazyPath);
        items.push(health('quality', 'Static analysis', `${this.quality.diagnosticCount} diagnostic(s) · ${analyzerReady ? 'tool available' : 'tools missing'}`, analyzerReady ? 'ok' : 'info', `clang-tidy: ${tools.clangTidyPath ?? 'missing'}\nClazy: ${tools.clazyPath ?? 'missing'}\ngcov: ${tools.gcovPath ?? 'missing'}`, 'qpm.openQualityReport'));
        const sanitizerCount = manifest.profiles.builds.filter((entry) => /^qpm-(?:asan|ubsan|asan-ubsan)$/.test(entry.id)).length;
        items.push(health('runtime-quality', 'Runtime quality profiles', `${sanitizerCount} sanitizer profile(s) · coverage ${manifest.quality.coverageBuildProfileId ? 'configured' : 'not configured'}`, sanitizerCount || manifest.quality.coverageBuildProfileId ? 'ok' : 'info', 'Create ASan/UBSan and coverage build profiles from the Qt Quality view.', 'qpm.createSanitizerProfiles'));
      }


      if (this.profiling) {
        const report = this.profiling.getReport(ref);
        if (report) {
          const errors = report.issues.filter((entry) => entry.severity === 'error').length;
          const warnings = report.issues.filter((entry) => entry.severity === 'warning').length;
          const readyTools = Object.values(report.tools).filter(Boolean).length;
          items.push(health(
            'profiling',
            'Profiling and diagnostics',
            `${readyTools} tool(s) detected · ${errors ? `${errors} error(s)` : warnings ? `${warnings} warning(s)` : 'ready'}`,
            errors ? 'error' : warnings ? 'warning' : 'ok',
            `Output: ${report.outputDirectory}
QML Profiler: ${report.tools.qmlProfilerPath ?? 'missing'}
CPU: ${report.tools.perfPath ?? report.tools.valgrindPath ?? 'missing'}
Memory: ${report.tools.valgrindPath ?? report.tools.heobPath ?? 'missing'}
Cppcheck: ${report.tools.cppcheckPath ?? 'missing'}`,
            'qpm.openProfilingReport'
          ));
        }
      }

      const translationFiles = files.translations.filter((filePath) => /\.(?:ts|qm)$/i.test(filePath));
      if (translationFiles.length > 0) {
        const translationToolsReady = Boolean(installation?.lupdatePath && installation?.lreleasePath && installation?.linguistPath);
        items.push(health(
          'translations',
          'Qt translations',
          `${translationFiles.length} catalog(s) · ${translationToolsReady ? 'tools ready' : 'tools incomplete'}`,
          translationToolsReady ? 'ok' : 'warning',
          `lupdate: ${installation?.lupdatePath ?? 'missing'}\nlrelease: ${installation?.lreleasePath ?? 'missing'}\nLinguist: ${installation?.linguistPath ?? 'missing'}`,
          'qpm.showTranslationStatus'
        ));
      }

      if (files.resources.length > 0) {
        let qrcErrors = 0;
        let qrcWarnings = 0;
        for (const qrcPath of files.resources.filter((filePath) => path.extname(filePath).toLowerCase() === '.qrc' && fs.existsSync(filePath))) {
          try {
            for (const issue of validateQtResourceDocument(qrcPath, readQtResourceDocument(qrcPath))) {
              if (issue.severity === 'error') qrcErrors += 1;
              else qrcWarnings += 1;
            }
          } catch {
            qrcErrors += 1;
          }
        }
        const resourceSeverity: QtHealthSeverity = qrcErrors ? 'error' : qrcWarnings ? 'warning' : 'ok';
        items.push(health('resources', 'Qt resources', `${files.resources.length} collection(s) · ${qrcErrors} error(s) · ${qrcWarnings} warning(s)`, resourceSeverity, `RCC: ${installation?.rccPath ?? 'missing'}`, 'qpm.validateQrc'));
      }

      if (files.qml.length > 0) {
        const qmlLintReady = Boolean(installation?.qmlLintPath);
        const qmlFormatReady = Boolean(installation?.qmlFormatPath);
        const qmlLanguageReady = Boolean(manifest.qml.languageServer.executable || installation?.qmlLanguageServerPath);
        const qmlPreviewReady = Boolean(installation?.qmlRuntimePath || installation?.qmlScenePath);
        const qmlSeverity: QtHealthSeverity = qmlLintReady && qmlFormatReady && (!manifest.qml.languageServer.enabled || qmlLanguageReady) ? 'ok' : 'warning';
        items.push(health(
          'qml-tools',
          'QML tools and language server',
          `${files.qml.length} file(s) · lint ${qmlLintReady ? 'ready' : 'missing'} · format ${qmlFormatReady ? 'ready' : 'missing'} · qmlls ${manifest.qml.languageServer.enabled ? qmlLanguageReady ? 'ready' : 'missing' : 'disabled'}`,
          qmlSeverity,
          `qmllint: ${installation?.qmlLintPath ?? 'missing'}
qmlformat: ${installation?.qmlFormatPath ?? 'missing'}
qmlls: ${manifest.qml.languageServer.executable || installation?.qmlLanguageServerPath || 'missing'}
Auto-start: ${manifest.qml.languageServer.autoStart ? 'yes' : 'no'}
Preview runtime: ${installation?.qmlRuntimePath ?? installation?.qmlScenePath ?? 'missing'}`,
          manifest.qml.languageServer.enabled ? 'qpm.startQmlLanguageServer' : 'qpm.editBuildSettings'
        ));
        if (!qmlPreviewReady) items.push(health('qml-preview', 'QML preview', 'Runtime not resolved', 'info', 'Select a Qt kit that provides qml or qmlscene.', 'qpm.qmlPreviewFile'));
      }

      const packaging = manifest.packaging;
      const packagingFiles = [
        ['Icon', packaging.icon],
        ['License', packaging.licenseFile],
        ['Readme', packaging.readmeFile]
      ].filter((entry): entry is [string, string] => Boolean(entry[1]));
      const missingPackagingFiles = packagingFiles
        .map(([label, configuredPath]) => [label, path.resolve(projectRoot, configuredPath)] as const)
        .filter(([, absolutePath]) => !fs.existsSync(absolutePath));
      const packagingSeverity: QtHealthSeverity = !packaging.enabled
        ? 'info'
        : missingPackagingFiles.length > 0
          ? 'warning'
          : 'ok';
      items.push(health(
        'packaging',
        'Packaging and product metadata',
        packaging.enabled
          ? `${packaging.productName} ${packaging.productVersion} · ${packaging.archiveFormat}`
          : 'Packaging disabled',
        packagingSeverity,
        `Output: ${path.resolve(projectRoot, packaging.outputDirectory)}
Runtime: ${packaging.includeQtRuntime ? 'included' : 'excluded'}
Translations: ${packaging.includeTranslations ? 'included' : 'excluded'}${missingPackagingFiles.length ? `
Missing: ${missingPackagingFiles.map(([label, absolutePath]) => `${label}: ${absolutePath}`).join('\n')}` : ''}`,
        'qpm.openPackagingReport'
      ));

      if (this.installers) {
        const installerReport = this.installers.getReport(ref);
        if (installerReport) {
          const errors = installerReport.issues.filter((entry) => entry.severity === 'error').length;
          const warnings = installerReport.issues.filter((entry) => entry.severity === 'warning').length;
          const selectedTool = installerReport.backend === 'qt-ifw'
            ? installerReport.tools.binaryCreator
            : installerReport.backend === 'inno-setup'
              ? installerReport.tools.iscc
              : installerReport.tools.makensis;
          items.push(health(
            'installers',
            'Desktop installer and signing',
            packaging.installer.enabled
              ? `${installerReport.backend} · ${errors ? `${errors} error(s)` : warnings ? `${warnings} warning(s)` : 'ready'}`
              : 'Installer generation disabled',
            !packaging.installer.enabled ? 'info' : errors ? 'error' : warnings ? 'warning' : 'ok',
            `Output: ${installerReport.installerPath}
Compiler: ${selectedTool ?? 'missing'}
Qt IFW repository: ${installerReport.repositoryPath}
SignTool: ${installerReport.tools.signTool ?? 'missing'}
Signing: ${packaging.installer.signing.enabled ? 'enabled' : 'disabled'}`,
            'qpm.openInstallerReport'
          ));
        }
      }


      if (this.publication) {
        const publicationReport = this.publication.getReport(ref);
        if (publicationReport) {
          const errors = publicationReport.issues.filter((entry) => entry.severity === 'error').length;
          const warnings = publicationReport.issues.filter((entry) => entry.severity === 'warning').length;
          const enabled = manifest.publication.enabled;
          items.push(health(
            'publication',
            'Publication and updates',
            enabled ? `${manifest.publication.channel} · ${errors ? `${errors} error(s)` : warnings ? `${warnings} warning(s)` : 'ready'}` : 'Publication disabled',
            !enabled ? 'info' : errors ? 'error' : warnings ? 'warning' : 'ok',
            `Output: ${publicationReport.outputRoot}
MSIX: ${manifest.publication.msix.enabled ? 'enabled' : 'disabled'}
WinGet: ${manifest.publication.winget.enabled ? 'enabled' : 'disabled'}
Target: ${manifest.publication.publish.target}`,
            'qpm.openPublicationReport'
          ));
        }
      }

      items.push(health('run', 'Run profile', runProfile.workingDirectory || 'Target directory', 'info', `Arguments: ${runProfile.arguments || 'none'}\nEnvironment variables: ${Object.keys(runProfile.environment).length}`, 'qpm.chooseRunAction'));
      const debugKit = manifest.profiles.kits.find((entry) => entry.id === manifest.profiles.builds.find((entry) => entry.id === debugProfile.buildProfileId)?.kitId) ?? kitProfile;
      const debugReady = debugProfile.request === 'qml-attach' || Boolean(debugKit.debuggerPath || installation?.toolchain.debuggerPath || debugProfile.debuggerType === 'cppvsdbg' || debugProfile.debuggerType === 'cdb' || debugKit.compilerFamily === 'msvc');
      items.push(health(
        'debug',
        'Debug profile',
        `${debugProfile.name} · ${debugProfile.request}`,
        debugReady ? 'ok' : 'warning',
        `Debugger: ${debugProfile.debuggerType === 'auto' ? debugKit.debuggerType : debugProfile.debuggerType}\nPretty printers: ${debugProfile.enableQtPrettyPrinters ? 'enabled' : 'disabled'}\nQML debugger: ${debugProfile.qmlDebug || debugProfile.request === 'qml-attach' ? `${debugProfile.qmlHost}:${debugProfile.qmlPort}` : 'disabled'}\nRemote GDB: ${debugProfile.remoteHost}:${debugProfile.remotePort}`,
        'qpm.manageQtDebugProfiles'
      ));
      items.push(health('deploy', 'Deploy profile', deployProfile.enabled ? 'Automatic deployment enabled' : 'Manual deployment', deployProfile.enabled ? 'ok' : 'info', `Profile: ${deployProfile.name}\nTranslations: ${deployProfile.translations ? 'included' : 'not included'}`, 'qpm.deployQtRuntime'));

      const errorCount = items.filter((item) => item.severity === 'error').length;
      const warningCount = items.filter((item) => item.severity === 'warning').length;
      items.unshift(health('summary', 'Health summary', errorCount ? `${errorCount} error(s), ${warningCount} warning(s)` : warningCount ? `${warningCount} warning(s)` : 'Ready', errorCount ? 'error' : warningCount ? 'warning' : 'ok', `Project: ${manifest.name}\nMode: ${this.builds.buildMode}`, 'qpm.openProjectHealthReport'));
      return items;
    } catch (error) {
      return [health('manifest-error', 'Manifest', 'Invalid Qt project manifest', 'error', error instanceof Error ? error.message : String(error), 'qpm.showQtProjectInfo')];
    }
  }

  private updateDescription(): void {
    if (!this.view) return;
    const ref = this.workspaces.activeProjectRef;
    this.view.description = ref?.exists ? ref.name : 'No project';
  }
}

function health(id: string, label: string, description: string, severity: QtHealthSeverity, detail?: string, command?: string): QtHealthItem {
  return { id, label, description, severity, detail, ...(command ? { command: { command, title: label } } : {}) };
}

function iconForSeverity(severity: QtHealthSeverity): string {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'ok': return 'pass-filled';
    default: return 'info';
  }
}

function state(enabled: boolean): string { return enabled ? 'on' : 'off'; }
function escapeTable(value: string): string { return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
