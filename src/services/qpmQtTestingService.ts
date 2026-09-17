import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import {
  QtProjectManifest,
  QtTestFramework,
  getActiveQtRunProfile,
  getActiveQtBuildProfile,
  getQtKitProfileForBuild,
  getQtInstallationPreference,
  isQtProjectManifestPath,
  isReleaseBuildMode,
  qtTargetPath,
  readQtProjectManifest,
  resolveQtProjectFiles,
  writeQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmBuildMode, QpmWorkspaceProjectRef } from '../model/types';
import { createQtDirectBuildPlan } from './qpmQtDirectBuildService';
import { QpmBuildService } from './qpmBuildService';
import { QpmQtInstallation, QpmQtInstallationService } from './qpmQtInstallationService';
import { QpmQtQualityService } from './qpmQtQualityService';
import { QpmWorkspaceService } from './qpmWorkspaceService';

export interface DiscoveredQtTest {
  id: string;
  label: string;
  runtimeName: string;
  suite: string;
  framework: Exclude<QtTestFramework, 'auto'>;
  sourcePath: string;
  line: number;
  command?: string[];
  workingDirectory?: string;
  labels?: string[];
  disabled?: boolean;
}

export interface QtProjectTestDiscovery {
  manifestPath: string;
  projectName: string;
  tests: DiscoveredQtTest[];
}

interface TestMetadata extends DiscoveredQtTest {
  projectRef: QpmWorkspaceProjectRef;
  manifestPath: string;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
}

interface JunitCaseResult {
  name: string;
  classname: string;
  durationMs?: number;
  status: 'passed' | 'failed' | 'errored' | 'skipped';
  message?: string;
}

interface CoverageData {
  filePath: string;
  details: vscode.StatementCoverage[];
}

const TEST_SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx']);
const FRAMEWORK_LABELS: Record<Exclude<QtTestFramework, 'auto'>, string> = {
  qttest: 'Qt Test',
  qtquicktest: 'Qt Quick Test',
  gtest: 'GoogleTest',
  catch2: 'Catch2',
  boost: 'Boost.Test',
  ctest: 'CTest'
};

export class QpmQtTestingService implements vscode.Disposable {
  readonly controller: vscode.TestController;
  private readonly metadata = new Map<string, TestMetadata>();
  private readonly projectMetadata = new Map<string, QpmWorkspaceProjectRef>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly coverageDetails = new Map<vscode.TestRun, Map<string, vscode.FileCoverageDetail[]>>();
  private refreshTimer?: NodeJS.Timeout;
  private readonly lastFailedIds = new Set<string>();

  constructor(
    private readonly workspaces: QpmWorkspaceService,
    private readonly builds: QpmBuildService,
    private readonly installations: QpmQtInstallationService,
    private readonly quality: QpmQtQualityService,
    private readonly output: vscode.OutputChannel
  ) {
    this.controller = vscode.tests.createTestController('qpm.qtTests', 'Qt Project Manager');
    this.controller.resolveHandler = async () => this.refresh();
    this.controller.refreshHandler = async () => this.refresh();

    this.controller.createRunProfile('Run Qt tests', vscode.TestRunProfileKind.Run, (request, token) => this.runRequest(request, token, 'run'), true);
    this.controller.createRunProfile('Debug Qt test', vscode.TestRunProfileKind.Debug, (request, token) => this.runRequest(request, token, 'debug'), true);
    const coverageProfile = this.controller.createRunProfile('Qt test coverage', vscode.TestRunProfileKind.Coverage, (request, token) => this.runRequest(request, token, 'coverage'), true);
    coverageProfile.loadDetailedCoverage = async (run, fileCoverage) => this.coverageDetails.get(run)?.get(normalizePathKey(fileCoverage.uri.fsPath)) ?? [];

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{cpp,cc,cxx,h,hpp,hxx,qml,qtproject.json}');
    const ctestWatcher = vscode.workspace.createFileSystemWatcher('**/{CMakeLists.txt,CTestTestfile.cmake,CMakePresets.json,CMakeUserPresets.json}');
    this.disposables.push(
      this.controller,
      watcher,
      ctestWatcher,
      watcher.onDidCreate(() => this.scheduleRefresh()),
      watcher.onDidChange(() => this.scheduleRefresh()),
      watcher.onDidDelete(() => this.scheduleRefresh()),
      ctestWatcher.onDidCreate(() => this.scheduleRefresh()),
      ctestWatcher.onDidChange(() => this.scheduleRefresh()),
      ctestWatcher.onDidDelete(() => this.scheduleRefresh()),
      this.workspaces.onDidChange(() => this.scheduleRefresh()),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (document.uri.scheme === 'file' && (TEST_SOURCE_EXTENSIONS.has(path.extname(document.uri.fsPath).toLowerCase()) || path.extname(document.uri.fsPath).toLowerCase() === '.qml')) {
          this.controller.invalidateTestResults();
          this.scheduleRefresh();
        }
      })
    );
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    while (this.disposables.length > 0) this.disposables.pop()?.dispose();
  }

  get testCount(): number {
    return this.metadata.size;
  }

  get projectCount(): number {
    return this.projectMetadata.size;
  }

  get failedTestCount(): number {
    return this.lastFailedIds.size;
  }

  async refresh(): Promise<void> {
    this.metadata.clear();
    this.projectMetadata.clear();
    this.controller.items.replace([]);
    const workspace = this.workspaces.currentWorkspace;
    if (!workspace) return;

    for (const ref of workspace.projects.filter((entry) => entry.exists && isQtProjectManifestPath(entry.absolutePath))) {
      let discovery: QtProjectTestDiscovery;
      try {
        discovery = discoverTestsInQtProject(ref.absolutePath);
        const manifest = readQtProjectManifest(ref.absolutePath);
        if (manifest.testing.framework === 'auto' || manifest.testing.framework === 'ctest') {
          const ctestTests = await this.discoverCTestTests(ref.absolutePath, manifest);
          const merged = new Map(discovery.tests.map((entry) => [entry.id, entry]));
          for (const entry of ctestTests) merged.set(entry.id, entry);
          discovery.tests = [...merged.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line || a.label.localeCompare(b.label));
        }
      } catch (error) {
        this.output.appendLine(`[Qt Tests] Discovery failed for ${ref.absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (discovery.tests.length === 0) continue;

      const projectId = projectItemId(ref.absolutePath);
      const projectItem = this.controller.createTestItem(projectId, discovery.projectName, vscode.Uri.file(ref.absolutePath));
      projectItem.description = `${discovery.tests.length} test(s)`;
      this.projectMetadata.set(projectId, ref);
      const frameworkGroups = new Map<string, DiscoveredQtTest[]>();
      for (const test of discovery.tests) {
        const list = frameworkGroups.get(test.framework) ?? [];
        list.push(test);
        frameworkGroups.set(test.framework, list);
      }
      for (const [framework, tests] of frameworkGroups) {
        const frameworkId = `${projectId}::${framework}`;
        const frameworkItem = this.controller.createTestItem(frameworkId, FRAMEWORK_LABELS[framework as Exclude<QtTestFramework, 'auto'>], vscode.Uri.file(ref.absolutePath));
        frameworkItem.description = `${tests.length}`;
        const sourceGroups = new Map<string, DiscoveredQtTest[]>();
        for (const test of tests) {
          const list = sourceGroups.get(test.sourcePath) ?? [];
          list.push(test);
          sourceGroups.set(test.sourcePath, list);
        }
        for (const [sourcePath, sourceTests] of sourceGroups) {
          const sourceId = `${frameworkId}::${normalizePathKey(sourcePath)}`;
          const sourceItem = this.controller.createTestItem(sourceId, path.basename(sourcePath), vscode.Uri.file(sourcePath));
          for (const test of sourceTests) {
            const testItem = this.controller.createTestItem(test.id, test.label, vscode.Uri.file(test.sourcePath));
            testItem.range = new vscode.Range(Math.max(0, test.line - 1), 0, Math.max(0, test.line - 1), 1);
            testItem.tags = [new vscode.TestTag(`qpm.${test.framework}`)];
            sourceItem.children.add(testItem);
            this.metadata.set(test.id, { ...test, projectRef: ref, manifestPath: ref.absolutePath });
          }
          frameworkItem.children.add(sourceItem);
        }
        projectItem.children.add(frameworkItem);
      }
      this.controller.items.add(projectItem);
    }
  }

  async runAll(): Promise<void> {
    await this.runAllWithMode('run');
  }

  async runAllWithCoverage(): Promise<void> {
    await this.runAllWithMode('coverage');
  }

  private async runAllWithMode(mode: 'run' | 'coverage'): Promise<void> {
    await this.refresh();
    const cancellation = new vscode.CancellationTokenSource();
    try {
      await this.runRequest(new vscode.TestRunRequest(), cancellation.token, mode);
    } finally {
      cancellation.dispose();
    }
  }

  async runAtCursor(debug = false): Promise<void> {
    await this.refresh();
    const item = this.findTestAtCursor();
    if (!item) throw new Error('No discovered Qt test is associated with the current cursor position.');
    await this.runRequest(new vscode.TestRunRequest([item]), new vscode.CancellationTokenSource().token, debug ? 'debug' : 'run');
  }

  async openTestExplorer(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.test');
  }

  async rerunFailed(): Promise<void> {
    await this.refresh();
    const items = [...this.lastFailedIds].map((id) => findItemById(this.controller.items, id)).filter((entry): entry is vscode.TestItem => !!entry);
    if (items.length === 0) throw new Error('No failed test is available to rerun.');
    const cancellation = new vscode.CancellationTokenSource();
    try {
      await this.runRequest(new vscode.TestRunRequest(items), cancellation.token, 'run');
    } finally {
      cancellation.dispose();
    }
  }

  async openTestHistory(): Promise<void> {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) throw new Error('Open a native Qt project first.');
    const history = readTestHistory(ref.absolutePath);
    const markdown = renderTestHistoryMarkdown(ref.name, history);
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
    await vscode.window.showTextDocument(document, { preview: false });
  }

  async clearTestHistory(): Promise<void> {
    const ref = this.workspaces.activeProjectRef;
    if (!ref?.exists || !isQtProjectManifestPath(ref.absolutePath)) throw new Error('Open a native Qt project first.');
    const historyPath = testHistoryPath(ref.absolutePath);
    try { fs.rmSync(historyPath, { force: true }); } catch { /* best effort */ }
    this.lastFailedIds.clear();
    vscode.window.showInformationMessage('QPM test history cleared.');
  }

  private async discoverCTestTests(manifestPath: string, manifest: QtProjectManifest): Promise<DiscoveredQtTest[]> {
    const resolution = resolveCTestInvocation(manifestPath, manifest, this.builds.buildMode, this.installations);
    if (!resolution.ctestPath || (!resolution.usePreset && !fs.existsSync(resolution.buildDirectory))) {
      if (manifest.testing.framework === 'ctest') this.output.appendLine(`[CTest] Discovery unavailable: ${resolution.diagnostic}`);
      return [];
    }
    const args = buildCTestDiscoveryArguments(manifest, resolution);
    const cancellation = new vscode.CancellationTokenSource();
    try {
      this.output.appendLine(`[CTest] Discovery: ${resolution.ctestPath} ${args.map(renderArgument).join(' ')}`);
      const result = await runProcess(resolution.ctestPath, args, resolution.cwd, process.env, Math.min(manifest.testing.timeoutMs, 60000), cancellation.token);
      if (result.code !== 0) {
        this.output.appendLine(`[CTest] Discovery failed (${String(result.code)}): ${(result.stderr || result.stdout).trim()}`);
        return [];
      }
      return parseCTestJson(result.stdout, manifestPath);
    } finally {
      cancellation.dispose();
    }
  }

  private scheduleRefresh(): void {
    if (!vscode.workspace.getConfiguration('qpm').get<boolean>('testAutoRefresh', true)) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 250);
  }

  private findTestAtCursor(): vscode.TestItem | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') return undefined;
    const fileKey = normalizePathKey(editor.document.uri.fsPath);
    let best: { item: vscode.TestItem; distance: number } | undefined;
    for (const [id, metadata] of this.metadata) {
      if (normalizePathKey(metadata.sourcePath) !== fileKey) continue;
      const item = findItemById(this.controller.items, id);
      if (!item) continue;
      const distance = Math.abs((metadata.line - 1) - editor.selection.active.line);
      if (!best || distance < best.distance) best = { item, distance };
    }
    return best?.item;
  }

  private async runRequest(request: vscode.TestRunRequest, token: vscode.CancellationToken, mode: 'run' | 'debug' | 'coverage'): Promise<void> {
    if (this.metadata.size === 0) await this.refresh();
    const selected = this.collectSelectedTests(request);
    const run = this.controller.createTestRun(request, mode === 'coverage' ? 'Qt test coverage' : mode === 'debug' ? 'Debug Qt test' : 'Qt tests');
    for (const item of selected) this.lastFailedIds.delete(item.id);
    if (selected.length === 0) {
      run.appendOutput('No Qt test was discovered for this request.\r\n');
      run.end();
      return;
    }
    for (const item of selected) run.enqueued(item);

    try {
      if (mode === 'debug') {
        await this.debugSelectedTest(selected, run, token);
        return;
      }
      const grouped = groupByProject(selected, this.metadata);
      for (const [manifestPath, items] of grouped) {
        if (token.isCancellationRequested) break;
        if (mode === 'coverage') await this.runProjectWithCoverage(manifestPath, items, run, token);
        else await this.runProjectTests(manifestPath, items, run, token, false);
      }
    } catch (error) {
      const message = new vscode.TestMessage(error instanceof Error ? error.message : String(error));
      for (const item of selected) run.errored(item, message);
    } finally {
      run.end();
    }
  }

  private collectSelectedTests(request: vscode.TestRunRequest): vscode.TestItem[] {
    const excluded = new Set<string>();
    for (const item of request.exclude ?? []) collectLeafIds(item, excluded);
    const roots = request.include?.length ? request.include : collectionValues(this.controller.items);
    const result: vscode.TestItem[] = [];
    for (const root of roots) collectLeafItems(root, result, this.metadata, excluded);
    return uniqueItems(result);
  }

  private async debugSelectedTest(items: vscode.TestItem[], run: vscode.TestRun, token: vscode.CancellationToken): Promise<void> {
    const item = items[0];
    const metadata = this.metadata.get(item.id)!;
    for (const extra of items.slice(1)) run.skipped(extra);
    run.started(item);
    if (token.isCancellationRequested) return;
    const manifest = readQtProjectManifest(metadata.manifestPath);
    if (manifest.testing.buildBeforeRun && !await this.builds.build(false, metadata.projectRef)) {
      run.errored(item, new vscode.TestMessage('The test target did not build successfully.'));
      return;
    }
    const installation = this.resolveInstallation(manifest);
    let targetPath = qtTargetPath(metadata.manifestPath, this.builds.buildMode, manifest);
    let args = testArguments(metadata.framework, [metadata], manifest, path.join(os.tmpdir(), 'qpm-debug-test.xml'));
    let cwd = resolveTestWorkingDirectory(metadata.manifestPath, manifest, targetPath);
    if (metadata.framework === 'ctest' && metadata.command?.length) {
      targetPath = metadata.command[0];
      args = metadata.command.slice(1);
      cwd = metadata.workingDirectory || path.dirname(metadata.manifestPath);
    }
    if (!fs.existsSync(targetPath) && !findOnPath(targetPath)) throw new Error(`Test executable not found: ${targetPath}`);
    const env = createQtTestEnvironment(manifest, installation, targetPath);
    const kit = getQtKitProfileForBuild(manifest, this.builds.buildMode);
    const visualStudio = kit.debuggerType === 'cppvsdbg' || kit.debuggerType === 'cdb' || kit.compilerFamily === 'msvc';
    const common = {
      name: `Debug ${metadata.label}`,
      request: 'launch',
      program: targetPath,
      args,
      cwd,
      stopAtEntry: false,
      externalConsole: false,
      internalConsoleOptions: 'neverOpen',
      environment: Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([name, value]) => ({ name, value }))
    };
    const debugConfig: vscode.DebugConfiguration = visualStudio
      ? { ...common, type: 'cppvsdbg' }
      : {
          ...common,
          type: 'cppdbg',
          avoidWindowsConsoleRedirection: false,
          MIMode: kit.debuggerType === 'lldb' ? 'lldb' : 'gdb',
          miDebuggerPath: kit.debuggerPath || installation.toolchain.debuggerPath || (kit.debuggerType === 'lldb' ? 'lldb-mi' : 'gdb'),
          setupCommands: [{ description: 'Enable debugger pretty printing', text: '-enable-pretty-printing', ignoreFailures: true }]
        };
    const started = await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(vscode.Uri.file(metadata.manifestPath)), debugConfig);
    run.appendOutput(`${started ? 'Debug session started' : 'Unable to start debug session'} for ${metadata.label}.\r\n`, undefined, item);
    if (!started) run.errored(item, new vscode.TestMessage('Unable to start the VS Code C++ debugger.'));
  }

  private async runProjectTests(manifestPath: string, items: vscode.TestItem[], run: vscode.TestRun, token: vscode.CancellationToken, coverage: boolean): Promise<void> {
    const manifest = readQtProjectManifest(manifestPath);
    const metadata = items.map((item) => this.metadata.get(item.id)!).filter(Boolean);
    const ref = metadata[0].projectRef;
    if ((coverage || manifest.testing.buildBeforeRun) && !await this.builds.build(false, ref)) {
      for (const item of items) run.errored(item, new vscode.TestMessage('The test target did not build successfully.'));
      return;
    }
    const installation = this.resolveInstallation(manifest);
    const targetPath = qtTargetPath(manifestPath, this.builds.buildMode, manifest);

    const byFramework = new Map<Exclude<QtTestFramework, 'auto'>, Array<{ item: vscode.TestItem; metadata: TestMetadata }>>();
    for (const item of items) {
      const entry = this.metadata.get(item.id)!;
      const list = byFramework.get(entry.framework) ?? [];
      list.push({ item, metadata: entry });
      byFramework.set(entry.framework, list);
    }

    for (const [framework, entries] of byFramework) {
      if (token.isCancellationRequested) return;
      if (framework === 'ctest') {
        await this.runCTestGroup(manifestPath, manifest, entries, run, token);
        continue;
      }
      if (!fs.existsSync(targetPath)) throw new Error(`Test executable not found: ${targetPath}`);
      for (const entry of entries) run.started(entry.item);
      const resultsDirectory = path.join(path.dirname(targetPath), 'qpm-test-results');
      fs.mkdirSync(resultsDirectory, { recursive: true });
      const resultPath = path.join(resultsDirectory, `${framework}-${Date.now()}-${Math.random().toString(16).slice(2)}.xml`);
      const args = testArguments(framework, entries.map((entry) => entry.metadata), manifest, resultPath);
      const env = createQtTestEnvironment(manifest, installation, targetPath);
      const cwd = resolveTestWorkingDirectory(manifestPath, manifest, targetPath);
      this.output.appendLine(`[Qt Tests] ${targetPath} ${args.map(renderArgument).join(' ')}`);
      const result = await runProcess(targetPath, args, cwd, env, manifest.testing.timeoutMs, token);
      const combinedOutput = `${result.stdout}${result.stderr}`;
      if (combinedOutput) run.appendOutput(toTestOutput(combinedOutput), undefined, entries[0].item);
      const junit = fs.existsSync(resultPath) ? parseJunitXml(fs.readFileSync(resultPath, 'utf8')) : [];
      this.publishFrameworkResults(entries, junit, result, run);
      appendTestHistory(manifestPath, manifest.testing.historyLimit, {
        timestamp: new Date().toISOString(), framework, selected: entries.map((entry) => entry.metadata.runtimeName),
        durationMs: result.durationMs, exitCode: result.code, timedOut: result.timedOut, cancelled: result.cancelled,
        failed: junit.filter((entry) => entry.status === 'failed' || entry.status === 'errored').map((entry) => entry.name)
      });
      if (!coverage) try { fs.rmSync(resultPath, { force: true }); } catch { /* keep result when locked */ }
    }
  }

  private async runCTestGroup(manifestPath: string, manifest: QtProjectManifest, entries: Array<{ item: vscode.TestItem; metadata: TestMetadata }>, run: vscode.TestRun, token: vscode.CancellationToken): Promise<void> {
    const resolution = resolveCTestInvocation(manifestPath, manifest, this.builds.buildMode, this.installations);
    if (!resolution.ctestPath) throw new Error(resolution.diagnostic || 'CTest was not found.');
    for (const entry of entries) {
      if (entry.metadata.disabled) run.skipped(entry.item);
      else run.started(entry.item);
    }
    const runnable = entries.filter((entry) => !entry.metadata.disabled);
    if (runnable.length === 0) return;
    const resultsDirectory = path.join(path.dirname(manifestPath), '.qpm', 'test-results');
    fs.mkdirSync(resultsDirectory, { recursive: true });
    const resultPath = path.join(resultsDirectory, `ctest-${Date.now()}-${Math.random().toString(16).slice(2)}.xml`);
    const args = buildCTestRunArguments(manifest, resolution, runnable.map((entry) => entry.metadata.runtimeName), resultPath);
    this.output.appendLine(`[CTest] ${resolution.ctestPath} ${args.map(renderArgument).join(' ')}`);
    const result = await runProcess(resolution.ctestPath, args, resolution.cwd, { ...process.env, ...manifest.testing.environment }, manifest.testing.timeoutMs, token);
    const combinedOutput = `${result.stdout}${result.stderr}`;
    if (combinedOutput) run.appendOutput(toTestOutput(combinedOutput), undefined, runnable[0].item);
    const junit = fs.existsSync(resultPath) ? parseJunitXml(fs.readFileSync(resultPath, 'utf8')) : [];
    this.publishFrameworkResults(runnable, junit, result, run);
    appendTestHistory(manifestPath, manifest.testing.historyLimit, {
      timestamp: new Date().toISOString(), framework: 'ctest', selected: runnable.map((entry) => entry.metadata.runtimeName),
      durationMs: result.durationMs, exitCode: result.code, timedOut: result.timedOut, cancelled: result.cancelled,
      failed: junit.filter((entry) => entry.status === 'failed' || entry.status === 'errored').map((entry) => entry.name)
    });
  }

  private publishFrameworkResults(entries: Array<{ item: vscode.TestItem; metadata: TestMetadata }>, junit: JunitCaseResult[], processResult: ProcessResult, run: vscode.TestRun): void {
    for (const entry of entries) {
      const matches = junit.filter((candidate) => junitMatchesTest(candidate, entry.metadata));
      const duration = matches.reduce((sum, item) => sum + (item.durationMs ?? 0), 0) || Math.round(processResult.durationMs / Math.max(1, entries.length));
      const failed = matches.find((item) => item.status === 'failed' || item.status === 'errored');
      const skipped = matches.length > 0 && matches.every((item) => item.status === 'skipped');
      const consideredFailure = !processResult.cancelled && (processResult.timedOut || !!failed || (matches.length === 0 && processResult.code !== 0));
      if (consideredFailure) this.lastFailedIds.add(entry.item.id);
      else this.lastFailedIds.delete(entry.item.id);
      if (processResult.cancelled) {
        run.skipped(entry.item);
      } else if (processResult.timedOut) {
        run.errored(entry.item, new vscode.TestMessage(`Test timed out after ${processResult.durationMs} ms.`), duration);
      } else if (failed) {
        const message = new vscode.TestMessage(failed.message || `Test failed with exit code ${String(processResult.code)}.`);
        message.location = new vscode.Location(vscode.Uri.file(entry.metadata.sourcePath), new vscode.Position(Math.max(0, entry.metadata.line - 1), 0));
        if (failed.status === 'errored') run.errored(entry.item, message, duration);
        else run.failed(entry.item, message, duration);
      } else if (skipped) {
        run.skipped(entry.item);
      } else if (matches.length > 0 || processResult.code === 0) {
        run.passed(entry.item, duration);
      } else {
        run.failed(entry.item, new vscode.TestMessage((processResult.stderr || processResult.stdout || `Test process exited with code ${String(processResult.code)}.`).trim()), duration);
      }
    }
  }

  private async runProjectWithCoverage(manifestPath: string, items: vscode.TestItem[], run: vscode.TestRun, token: vscode.CancellationToken): Promise<void> {
    const originalManifest = readQtProjectManifest(manifestPath);
    const profileId = this.quality.ensureCoverageProfile(manifestPath);
    const originalDebugProfile = originalManifest.profiles.active.debugBuildProfileId;
    const originalMode = this.builds.buildMode;
    const coverageManifest = readQtProjectManifest(manifestPath);
    coverageManifest.profiles.active.debugBuildProfileId = profileId;
    writeQtProjectManifest(manifestPath, coverageManifest);
    const debugMode: QpmBuildMode = originalMode === 'release64' ? 'debug64' : originalMode === 'release' ? 'debug' : originalMode;
    if (debugMode !== originalMode) await this.builds.setBuildMode(debugMode);

    try {
      await this.runProjectTests(manifestPath, items, run, token, true);
      const manifest = readQtProjectManifest(manifestPath);
      const installation = this.resolveInstallation(manifest);
      const gcov = this.quality.getToolStatus(items.length ? this.metadata.get(items[0].id)?.projectRef : undefined).gcovPath;
      if (!gcov) {
        run.appendOutput('gcov was not found; tests ran with coverage instrumentation but no VS Code coverage report could be generated.\r\n');
        return;
      }
      const plan = createQtDirectBuildPlan(manifestPath, debugMode, installation);
      const coverage = await collectGcovCoverage(gcov, plan.sourceFiles, plan.objectDirectory, plan.projectDirectory, token, this.output);
      const detailsMap = new Map<string, vscode.FileCoverageDetail[]>();
      for (const file of coverage) {
        const fileCoverage = vscode.FileCoverage.fromDetails(vscode.Uri.file(file.filePath), file.details);
        run.addCoverage(fileCoverage);
        detailsMap.set(normalizePathKey(file.filePath), file.details);
      }
      this.coverageDetails.set(run, detailsMap);
      run.appendOutput(`Coverage collected for ${coverage.length} source file(s).\r\n`);
    } finally {
      const restore = readQtProjectManifest(manifestPath);
      restore.profiles.active.debugBuildProfileId = originalDebugProfile;
      writeQtProjectManifest(manifestPath, restore);
      if (this.builds.buildMode !== originalMode) await this.builds.setBuildMode(originalMode);
    }
  }

  private resolveInstallation(manifest: QtProjectManifest): QpmQtInstallation {
    const installation = this.installations.getActive(getQtInstallationPreference(manifest, this.builds.buildMode));
    if (!installation) throw new Error('No compatible Qt kit is selected for the test project.');
    return installation;
  }
}

export function discoverTestsInQtProject(manifestPath: string): QtProjectTestDiscovery {
  const manifest = readQtProjectManifest(manifestPath);
  const files = resolveQtProjectFiles(manifestPath, manifest);
  const requested = manifest.testing.framework;
  const tests: DiscoveredQtTest[] = [];

  for (const sourcePath of [...files.sources, ...files.headers].filter((entry) => fs.existsSync(entry))) {
    const source = fs.readFileSync(sourcePath, 'utf8');
    if (requested === 'auto' || requested === 'qttest') tests.push(...discoverQtTestFunctions(source, sourcePath));
    if (requested === 'auto' || requested === 'gtest') tests.push(...discoverGoogleTests(source, sourcePath));
    if (requested === 'auto' || requested === 'catch2') tests.push(...discoverCatch2Tests(source, sourcePath));
    if (requested === 'auto' || requested === 'boost') tests.push(...discoverBoostTests(source, sourcePath));
  }
  if (requested === 'auto' || requested === 'qtquicktest') {
    for (const qmlPath of files.qml.filter((entry) => fs.existsSync(entry))) tests.push(...discoverQtQuickTests(fs.readFileSync(qmlPath, 'utf8'), qmlPath));
  }

  const unique = new Map<string, DiscoveredQtTest>();
  for (const test of tests) unique.set(test.id, test);
  return { manifestPath, projectName: manifest.name, tests: [...unique.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line || a.label.localeCompare(b.label)) };
}

export function discoverQtTestFunctions(source: string, sourcePath: string): DiscoveredQtTest[] {
  if (!/(?:QTEST_(?:APPLESS_|GUILESS_)?MAIN|<QtTest(?:\/QTest)?>|<QTest>)/.test(source)) return [];
  const className = source.match(/class\s+(?:\w+\s+)*([A-Za-z_]\w*)\s+(?:final\s+)?(?::[^\{]+)?\{/)?.[1] ?? path.basename(sourcePath, path.extname(sourcePath));
  const result: DiscoveredQtTest[] = [];
  const sectionPattern = /(?:private|protected|public)\s+(?:Q_SLOTS|slots)\s*:\s*([\s\S]*?)(?=(?:private|protected|public)\s*(?:(?:Q_SLOTS|slots)\s*)?:|\};)/g;
  let section: RegExpExecArray | null;
  while ((section = sectionPattern.exec(source)) !== null) {
    const methodPattern = /\bvoid\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:;|\{)/g;
    let method: RegExpExecArray | null;
    while ((method = methodPattern.exec(section[1])) !== null) {
      const name = method[1];
      if (['initTestCase', 'cleanupTestCase', 'init', 'cleanup'].includes(name) || name.endsWith('_data')) continue;
      const absoluteIndex = section.index + section[0].indexOf(section[1]) + method.index;
      result.push(testRecord('qttest', sourcePath, className, name, name, lineAt(source, absoluteIndex)));
    }
  }
  return result;
}

export function discoverGoogleTests(source: string, sourcePath: string): DiscoveredQtTest[] {
  const result: DiscoveredQtTest[] = [];
  const pattern = /\b(?:TEST|TEST_F|TEST_P|TYPED_TEST|TYPED_TEST_P)\s*\(\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const suite = match[1];
    const name = match[2];
    result.push(testRecord('gtest', sourcePath, suite, name, `${suite}.${name}`, lineAt(source, match.index)));
  }
  return result;
}

export function discoverCatch2Tests(source: string, sourcePath: string): DiscoveredQtTest[] {
  const result: DiscoveredQtTest[] = [];
  const pattern = /\b(?:TEST_CASE|SCENARIO)\s*\(\s*"((?:\\.|[^"\\])*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = decodeCppString(match[1]);
    result.push(testRecord('catch2', sourcePath, path.basename(sourcePath, path.extname(sourcePath)), name, name, lineAt(source, match.index)));
  }
  return result;
}

export function discoverBoostTests(source: string, sourcePath: string): DiscoveredQtTest[] {
  if (!/BOOST_(?:AUTO|FIXTURE|DATA)_TEST_(?:CASE|SUITE)/.test(source)) return [];
  const result: DiscoveredQtTest[] = [];
  const suites: string[] = [];
  const tokenPattern = /\bBOOST_(AUTO_TEST_SUITE|FIXTURE_TEST_SUITE|AUTO_TEST_SUITE_END|AUTO_TEST_CASE|FIXTURE_TEST_CASE|DATA_TEST_CASE)\s*\(([^\n)]*)\)?/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source)) !== null) {
    const kind = match[1];
    const firstArgument = (match[2] ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (kind === 'AUTO_TEST_SUITE' || kind === 'FIXTURE_TEST_SUITE') {
      if (firstArgument) suites.push(firstArgument);
      continue;
    }
    if (kind === 'AUTO_TEST_SUITE_END') {
      suites.pop();
      continue;
    }
    if (!firstArgument) continue;
    const suite = suites.length ? suites.join('/') : path.basename(sourcePath, path.extname(sourcePath));
    const runtimeName = suites.length ? `${suites.join('/')}/${firstArgument}` : firstArgument;
    result.push(testRecord('boost', sourcePath, suite, firstArgument, runtimeName, lineAt(source, match.index)));
  }
  return result;
}

export function discoverQtQuickTests(source: string, sourcePath: string): DiscoveredQtTest[] {
  if (!/\bTestCase\s*\{/.test(source)) return [];
  const suite = source.match(/\bname\s*:\s*["']([^"']+)["']/)?.[1] ?? path.basename(sourcePath, path.extname(sourcePath));
  const result: DiscoveredQtTest[] = [];
  const pattern = /\bfunction\s+(test_[A-Za-z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1];
    result.push(testRecord('qtquicktest', sourcePath, suite, name, `${suite}::${name}`, lineAt(source, match.index)));
  }
  return result;
}

export function parseJunitXml(xml: string): JunitCaseResult[] {
  const result: JunitCaseResult[] = [];
  const pattern = /<testcase\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/testcase>)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const attributes = parseXmlAttributes(match[1]);
    const body = match[2] ?? '';
    const failure = body.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/i) ?? body.match(/<(failure|error)\b([^>]*)\/\s*>/i);
    const skipped = /<skipped\b/i.test(body);
    const failureAttributes = failure ? parseXmlAttributes(failure[2] ?? '') : {};
    result.push({
      name: attributes.name ?? '',
      classname: attributes.classname ?? attributes.class ?? '',
      durationMs: attributes.time ? Number(attributes.time) * 1000 : undefined,
      status: skipped ? 'skipped' : failure ? (failure[1].toLowerCase() === 'error' ? 'errored' : 'failed') : 'passed',
      ...(failure ? { message: decodeXml(failureAttributes.message ?? stripXml(failure[3] ?? 'Test failed')) } : {})
    });
  }
  return result;
}

export function parseGcovText(content: string, sourcePath?: string): CoverageData | undefined {
  let resolvedSource = sourcePath;
  const details: vscode.StatementCoverage[] = [];
  for (const line of content.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^\s*([^:]+):\s*(\d+):(.*)$/);
    if (!match) continue;
    const countToken = match[1].trim();
    const lineNumber = Number(match[2]);
    const sourceText = match[3];
    if (lineNumber === 0 && sourceText.startsWith('Source:')) resolvedSource = sourceText.slice('Source:'.length).trim();
    if (lineNumber <= 0 || countToken === '-') continue;
    const executed = /^#+$/.test(countToken) || /^=+$/.test(countToken) ? 0 : Number(countToken.replace(/\*$/, '')) || 0;
    details.push(new vscode.StatementCoverage(executed, new vscode.Position(lineNumber - 1, 0)));
  }
  if (!resolvedSource || details.length === 0) return undefined;
  return { filePath: resolvedSource, details };
}

function testRecord(framework: Exclude<QtTestFramework, 'auto'>, sourcePath: string, suite: string, label: string, runtimeName: string, line: number): DiscoveredQtTest {
  return {
    id: `${normalizePathKey(sourcePath)}::${framework}::${runtimeName}`,
    label,
    runtimeName,
    suite,
    framework,
    sourcePath: path.resolve(sourcePath),
    line
  };
}

function testArguments(framework: Exclude<QtTestFramework, 'auto'>, tests: TestMetadata[], manifest: QtProjectManifest, resultPath: string): string[] {
  const extra = [...manifest.testing.arguments];
  switch (framework) {
    case 'qttest': return [...tests.map((entry) => entry.runtimeName), ...extra, '-o', `${resultPath},junitxml`];
    case 'qtquicktest': {
      const hasInput = extra.some((entry) => entry === '-input' || entry.startsWith('-input='));
      const projectRoot = path.dirname(tests[0].manifestPath);
      const qmlRoot = path.dirname(tests[0].sourcePath);
      return [...(!hasInput ? ['-input', path.relative(projectRoot, qmlRoot) || '.'] : []), ...extra, '-o', `${resultPath},junitxml`];
    }
    case 'gtest': return [`--gtest_filter=${tests.map((entry) => entry.runtimeName).join(':')}`, `--gtest_output=xml:${resultPath}`, ...extra];
    case 'catch2': return [...tests.map((entry) => entry.runtimeName), '--reporter', 'junit', '--out', resultPath, ...extra];
    case 'boost': {
      const boost = manifest.testing.boost;
      return [
        `--run_test=${tests.map((entry) => entry.runtimeName).join(',')}`,
        '--log_format=JUNIT', `--log_sink=${resultPath}`, `--log_level=${boost.logLevel}`,
        `--report_level=${boost.reportLevel}`, `--catch_system_errors=${boost.catchSystemErrors ? 'yes' : 'no'}`,
        ...(boost.randomSeed > 0 ? [`--random=${boost.randomSeed}`] : []), ...extra
      ];
    }
    case 'ctest': return extra;
  }
}

interface CTestInvocationResolution {
  ctestPath?: string;
  buildDirectory: string;
  cwd: string;
  usePreset: boolean;
  diagnostic: string;
}

interface TestHistoryRecord {
  timestamp: string;
  framework: string;
  selected: string[];
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  failed: string[];
}

export function parseCTestJson(content: string, manifestPath: string): DiscoveredQtTest[] {
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) return [];
  const root = JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  const tests = Array.isArray(root.tests) ? root.tests as Array<Record<string, unknown>> : [];
  const graph = root.backtraceGraph && typeof root.backtraceGraph === 'object' ? root.backtraceGraph as Record<string, unknown> : {};
  const files = Array.isArray(graph.files) ? graph.files.filter((entry): entry is string => typeof entry === 'string') : [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes as Array<Record<string, unknown>> : [];
  const projectRoot = path.dirname(manifestPath);
  const fallbackSource = fs.existsSync(path.join(projectRoot, 'CMakeLists.txt')) ? path.join(projectRoot, 'CMakeLists.txt') : manifestPath;
  const result: DiscoveredQtTest[] = [];
  for (const entry of tests) {
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (!name) continue;
    const properties = Array.isArray(entry.properties) ? entry.properties as Array<Record<string, unknown>> : [];
    const property = (propertyName: string): unknown => properties.find((candidate) => String(candidate.name ?? '').toUpperCase() === propertyName)?.value;
    const labelsValue = property('LABELS');
    const labels = Array.isArray(labelsValue) ? labelsValue.map(String) : typeof labelsValue === 'string' ? labelsValue.split(';').filter(Boolean) : [];
    const disabledValue = property('DISABLED');
    const disabled = disabledValue === true || String(disabledValue ?? '').toUpperCase() === 'TRUE' || String(disabledValue ?? '') === '1';
    const workingDirectoryValue = property('WORKING_DIRECTORY');
    const workingDirectory = typeof workingDirectoryValue === 'string' && workingDirectoryValue ? workingDirectoryValue : undefined;
    const command = Array.isArray(entry.command) ? entry.command.filter((part): part is string => typeof part === 'string') : undefined;
    let sourcePath = fallbackSource;
    let line = 1;
    const backtraceIndex = typeof entry.backtrace === 'number' ? entry.backtrace : -1;
    if (backtraceIndex >= 0 && nodes[backtraceIndex]) {
      const node = nodes[backtraceIndex];
      const fileIndex = typeof node.file === 'number' ? node.file : -1;
      if (fileIndex >= 0 && files[fileIndex]) sourcePath = path.isAbsolute(files[fileIndex]) ? files[fileIndex] : path.resolve(projectRoot, files[fileIndex]);
      if (typeof node.line === 'number' && node.line > 0) line = node.line;
    }
    const suite = labels.length ? labels.join(', ') : 'CTest';
    result.push({
      ...testRecord('ctest', sourcePath, suite, name, name, line),
      ...(command?.length ? { command } : {}),
      ...(workingDirectory ? { workingDirectory } : {}),
      ...(labels.length ? { labels } : {}),
      ...(disabled ? { disabled: true } : {})
    });
  }
  return result;
}

export function buildCTestDiscoveryArguments(manifest: QtProjectManifest, resolution: CTestInvocationResolution): string[] {
  const args = resolution.usePreset
    ? ['--preset', manifest.testing.ctest.preset]
    : ['--test-dir', resolution.buildDirectory, ...(ctestConfiguration(manifest) ? ['-C', ctestConfiguration(manifest)] : [])];
  return [...args, '--show-only=json-v1'];
}

export function buildCTestRunArguments(manifest: QtProjectManifest, resolution: CTestInvocationResolution, names: string[], resultPath: string): string[] {
  const settings = manifest.testing;
  const args = resolution.usePreset
    ? ['--preset', settings.ctest.preset]
    : ['--test-dir', resolution.buildDirectory, ...(ctestConfiguration(manifest) ? ['-C', ctestConfiguration(manifest)] : [])];
  const selectedRegex = names.length ? `^(?:${names.map(escapeRegex).join('|')})$` : '';
  const configuredRegex = settings.ctest.nameRegex.trim();
  const effectiveRegex = selectedRegex && configuredRegex ? `(?=${configuredRegex})(?:${selectedRegex})` : selectedRegex || configuredRegex;
  if (effectiveRegex) args.push('--tests-regex', effectiveRegex);
  if (settings.ctest.excludeRegex.trim()) args.push('--exclude-regex', settings.ctest.excludeRegex.trim());
  if (settings.ctest.labelRegex.trim()) args.push('--label-regex', settings.ctest.labelRegex.trim());
  if (settings.parallelJobs > 0) args.push('--parallel', String(settings.parallelJobs));
  if (settings.stopOnFailure) args.push('--stop-on-failure');
  if (settings.ctest.outputOnFailure) args.push('--output-on-failure');
  if (settings.repeatMode !== 'never' && settings.repeatCount > 1) args.push('--repeat', `${settings.repeatMode}:${settings.repeatCount}`);
  args.push('--output-junit', resultPath, ...settings.arguments);
  return args;
}

function resolveCTestInvocation(manifestPath: string, manifest: QtProjectManifest, mode: QpmBuildMode, installations: QpmQtInstallationService): CTestInvocationResolution {
  const projectRoot = path.dirname(manifestPath);
  const profile = getActiveQtBuildProfile(manifest, mode);
  const kit = getQtKitProfileForBuild(manifest, mode);
  const installation = installations.getActive(getQtInstallationPreference(manifest, mode));
  const configured = manifest.testing.ctest.executable.trim();
  const globalOverride = vscode.workspace.getConfiguration?.('qpm')?.get<string>('ctestPath', '')?.trim?.() ?? '';
  const executableName = process.platform === 'win32' ? 'ctest.exe' : 'ctest';
  const candidates = [
    configured,
    globalOverride,
    kit.cmakePath ? path.join(path.dirname(kit.cmakePath), executableName) : '',
    installation?.cmakePath ? path.join(path.dirname(installation.cmakePath), executableName) : '',
    findOnPath(executableName),
    findOnPath('ctest')
  ].filter((entry): entry is string => !!entry);
  const ctestPath = candidates.find((entry) => fs.existsSync(entry)) ?? candidates.find((entry) => !path.isAbsolute(entry));
  const modeFolder = isReleaseBuildMode(mode) ? 'release' : 'debug';
  const configuredBuild = manifest.testing.ctest.buildDirectory.trim();
  const buildDirectory = configuredBuild
    ? (path.isAbsolute(configuredBuild) ? configuredBuild : path.resolve(projectRoot, configuredBuild))
    : path.resolve(projectRoot, profile.outputDirectory, modeFolder, 'cmake');
  const usePreset = Boolean(manifest.testing.ctest.preset.trim());
  const diagnostic = !ctestPath
    ? 'CTest executable not found. Configure testing.ctest.executable or qpm.ctestPath.'
    : !usePreset && !fs.existsSync(buildDirectory)
      ? `CTest build directory does not exist: ${buildDirectory}`
      : 'ready';
  return { ctestPath, buildDirectory, cwd: projectRoot, usePreset, diagnostic };
}

function ctestConfiguration(manifest: QtProjectManifest): string {
  const configured = manifest.testing.ctest.configuration.trim();
  if (configured) return configured;
  return isReleaseBuildMode(manifest.profiles.active.buildMode) ? 'Release' : 'Debug';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOnPath(executable: string): string | undefined {
  if (!executable) return undefined;
  if (path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) return fs.existsSync(executable) ? executable : undefined;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executable);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function testHistoryPath(manifestPath: string): string {
  return path.join(path.dirname(manifestPath), '.qpm', 'test-results', 'history.json');
}

function appendTestHistory(manifestPath: string, limit: number, record: TestHistoryRecord): void {
  if (limit <= 0) return;
  const historyPath = testHistoryPath(manifestPath);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  const history = readTestHistory(manifestPath);
  history.unshift(record);
  fs.writeFileSync(historyPath, `${JSON.stringify(history.slice(0, limit), null, 2)}\n`, 'utf8');
}

function readTestHistory(manifestPath: string): TestHistoryRecord[] {
  const historyPath = testHistoryPath(manifestPath);
  if (!fs.existsSync(historyPath)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(historyPath, 'utf8')) as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is TestHistoryRecord => !!entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function renderTestHistoryMarkdown(projectName: string, history: TestHistoryRecord[]): string {
  const lines = [`# ${projectName} — Test history`, '', `Generated: ${new Date().toLocaleString()}`, ''];
  if (history.length === 0) return `${lines.join('\n')}No recorded test execution.\n`;
  lines.push('| Date | Framework | Selected | Failed | Duration | Exit |', '|---|---|---:|---:|---:|---:|');
  for (const entry of history) {
    lines.push(`| ${entry.timestamp.replace(/\|/g, '\\|')} | ${entry.framework} | ${entry.selected.length} | ${entry.failed.length} | ${entry.durationMs} ms | ${entry.exitCode ?? '-'} |`);
    if (entry.failed.length) lines.push('', `Failed: ${entry.failed.map((name) => `\`${name}\``).join(', ')}`, '');
  }
  return `${lines.join('\n')}\n`;
}

function createQtTestEnvironment(manifest: QtProjectManifest, installation: QpmQtInstallation, targetPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...getActiveQtRunProfile(manifest).environment, ...manifest.testing.environment };
  const searchDirectories = [path.dirname(targetPath), installation.binDir, installation.toolchain.binDir].filter((entry): entry is string => !!entry);
  env.PATH = [...searchDirectories, env.PATH ?? ''].filter(Boolean).join(path.delimiter);
  if (installation.pluginsDir) env.QT_PLUGIN_PATH = installation.pluginsDir;
  if (installation.qmlDir) {
    env.QML_IMPORT_PATH = [installation.qmlDir, env.QML_IMPORT_PATH ?? ''].filter(Boolean).join(path.delimiter);
    env.QML2_IMPORT_PATH = [installation.qmlDir, env.QML2_IMPORT_PATH ?? ''].filter(Boolean).join(path.delimiter);
  }
  if (manifest.testing.useOffscreenPlatform && !env.QT_QPA_PLATFORM) env.QT_QPA_PLATFORM = 'offscreen';
  return env;
}

function resolveTestWorkingDirectory(manifestPath: string, manifest: QtProjectManifest, targetPath: string): string {
  const configured = getActiveQtRunProfile(manifest).workingDirectory.trim();
  if (!configured) return path.dirname(targetPath);
  return path.isAbsolute(configured) ? configured : path.resolve(path.dirname(manifestPath), configured);
}

function groupByProject(items: vscode.TestItem[], metadata: Map<string, TestMetadata>): Map<string, vscode.TestItem[]> {
  const result = new Map<string, vscode.TestItem[]>();
  for (const item of items) {
    const manifestPath = metadata.get(item.id)?.manifestPath;
    if (!manifestPath) continue;
    const list = result.get(manifestPath) ?? [];
    list.push(item);
    result.set(manifestPath, list);
  }
  return result;
}

function collectLeafItems(item: vscode.TestItem, result: vscode.TestItem[], metadata: Map<string, TestMetadata>, excluded: Set<string>): void {
  if (excluded.has(item.id)) return;
  if (metadata.has(item.id)) {
    result.push(item);
    return;
  }
  item.children.forEach((child) => collectLeafItems(child, result, metadata, excluded));
}

function collectLeafIds(item: vscode.TestItem, result: Set<string>): void {
  result.add(item.id);
  item.children.forEach((child) => collectLeafIds(child, result));
}

function collectionValues(collection: vscode.TestItemCollection): vscode.TestItem[] {
  const result: vscode.TestItem[] = [];
  collection.forEach((item) => result.push(item));
  return result;
}

function findItemById(collection: vscode.TestItemCollection, id: string): vscode.TestItem | undefined {
  let found: vscode.TestItem | undefined;
  collection.forEach((item) => {
    if (found) return;
    if (item.id === id) found = item;
    else found = findItemById(item.children, id);
  });
  return found;
}

function uniqueItems(items: vscode.TestItem[]): vscode.TestItem[] {
  const seen = new Set<string>();
  return items.filter((item) => seen.has(item.id) ? false : (seen.add(item.id), true));
}

function projectItemId(manifestPath: string): string {
  return `qpm-project::${normalizePathKey(manifestPath)}`;
}

function normalizePathKey(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function decodeCppString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
}

function parseXmlAttributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) result[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  return result;
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function stripXml(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function junitMatchesTest(candidate: JunitCaseResult, metadata: TestMetadata): boolean {
  const candidateValues = [candidate.name, `${candidate.classname}.${candidate.name}`, `${candidate.classname}::${candidate.name}`].map(normalizeTestName);
  const expectedValues = [metadata.runtimeName, metadata.label, `${metadata.suite}.${metadata.label}`, `${metadata.suite}::${metadata.label}`].map(normalizeTestName);
  return candidateValues.some((candidateValue) => expectedValues.some((expected) => candidateValue === expected || candidateValue.startsWith(`${expected}(`) || candidateValue.startsWith(`${expected}:`)));
}

function normalizeTestName(value: string): string {
  return value.trim().replace(/\(\)$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function runProcess(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, token: vscode.CancellationToken): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, { cwd, env, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code: number | null, timedOut: boolean, cancelled: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cancellation.dispose();
      resolve({ code, stdout, stderr, durationMs: Date.now() - started, timedOut, cancelled });
    };
    const timeout = setTimeout(() => { child.kill(); finish(null, true, false); }, timeoutMs);
    const cancellation = token.onCancellationRequested(() => { child.kill(); finish(null, false, true); });
    child.stdout?.on('data', (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.on('error', (error) => { stderr += error.message; finish(null, false, false); });
    child.on('close', (code) => finish(code, false, false));
  });
}

async function collectGcovCoverage(gcovPath: string, sourceFiles: string[], objectDirectory: string, projectDirectory: string, token: vscode.CancellationToken, output: vscode.OutputChannel): Promise<CoverageData[]> {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-gcov-'));
  try {
    const notes = fs.existsSync(objectDirectory)
      ? listFilesRecursive(objectDirectory).filter((entry) => entry.toLowerCase().endsWith('.gcno'))
      : [];
    if (notes.length > 0) {
      for (const notesPath of notes) {
        if (token.isCancellationRequested) break;
        const args = ['-b', '-c', notesPath];
        const result = await runProcess(gcovPath, args, temporaryDirectory, process.env, 120000, token);
        output.appendLine(`[Qt Coverage] ${path.basename(gcovPath)} ${args.map(renderArgument).join(' ')}`);
        if (result.stdout || result.stderr) output.appendLine(`${result.stdout}${result.stderr}`.trimEnd());
      }
    } else {
      output.appendLine(`[Qt Coverage] No .gcno file was found in ${objectDirectory}; falling back to source-based gcov invocation.`);
      for (const sourcePath of sourceFiles) {
        if (token.isCancellationRequested) break;
        const args = ['-o', objectDirectory, sourcePath];
        const result = await runProcess(gcovPath, args, temporaryDirectory, process.env, 120000, token);
        output.appendLine(`[Qt Coverage] ${path.basename(gcovPath)} ${args.map(renderArgument).join(' ')}`);
        if (result.stdout || result.stderr) output.appendLine(`${result.stdout}${result.stderr}`.trimEnd());
      }
    }
    const result: CoverageData[] = [];
    const seen = new Set<string>();
    for (const gcovFile of listFilesRecursive(temporaryDirectory).filter((entry) => entry.toLowerCase().endsWith('.gcov'))) {
      const parsed = parseGcovText(fs.readFileSync(gcovFile, 'utf8'));
      if (!parsed) continue;
      parsed.filePath = path.isAbsolute(parsed.filePath) ? parsed.filePath : path.resolve(projectDirectory, parsed.filePath);
      const key = normalizePathKey(parsed.filePath);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(parsed);
    }
    return result;
  } finally {
    try { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function listFilesRecursive(root: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...listFilesRecursive(absolutePath));
    else if (entry.isFile()) result.push(absolutePath);
  }
  return result;
}

function renderArgument(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function toTestOutput(value: string): string {
  return value.replace(/\r?\n/g, '\r\n');
}
