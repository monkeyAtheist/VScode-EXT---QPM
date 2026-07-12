import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  QtKitProfile,
  readQtProjectManifest,
  synchronizeLegacyProfileMirrors,
  writeQtProjectManifest
} from '../model/qtProjectManifest';
import { QpmQtInstallation, QpmQtInstallationService, describeQtRoot, inspectQtCompiler } from './qpmQtInstallationService';

export interface QpmRegisteredQtKit extends QtKitProfile {
  qtVersion: string;
  qtLabel: string;
  createdAt: string;
  updatedAt: string;
}

interface RegistryDocument {
  schemaVersion: 1;
  kits: QpmRegisteredQtKit[];
}

export class QpmQtKitRegistryService implements vscode.Disposable {
  private readonly registryPath: string;

  constructor(
    context: vscode.ExtensionContext,
    private readonly installations: QpmQtInstallationService,
    private readonly output: vscode.OutputChannel
  ) {
    this.registryPath = path.join(context.globalStorageUri.fsPath, 'qt-kits.json');
  }

  dispose(): void { /* no live resources */ }

  list(): QpmRegisteredQtKit[] {
    return this.read().kits.sort((a, b) => a.name.localeCompare(b.name));
  }

  async detectAndSave(): Promise<QpmRegisteredQtKit[]> {
    const document = this.read();
    const byId = new Map(document.kits.map((kit) => [kit.id, kit]));
    const now = new Date().toISOString();
    for (const installation of this.installations.scan()) {
      const detected = registeredKitFromInstallation(installation, now);
      const existing = byId.get(detected.id);
      byId.set(detected.id, existing ? { ...existing, ...detected, name: existing.name, createdAt: existing.createdAt, updatedAt: now } : detected);
    }
    document.kits = [...byId.values()];
    this.write(document);
    this.output.appendLine(`[Qt Kits] ${document.kits.length} named kit(s) stored in ${this.registryPath}.`);
    return this.list();
  }

  async manage(): Promise<void> {
    while (true) {
      const kits = this.list();
      const action = await vscode.window.showQuickPick([
        { id: 'detect', label: '$(search) Detect and update Qt kits', description: 'Scan configured Qt installations and Qt Tools' },
        { id: 'add', label: '$(add) Add current Qt installation as a named kit', description: this.installations.getActive()?.label ?? 'No active Qt installation' },
        ...kits.map((kit) => ({ id: `kit:${kit.id}`, label: `$(tools) ${kit.name}`, description: `${kit.qtLabel} · ${kit.compilerFamily ?? 'unknown'} ${kit.architecture}`, detail: kit.qtInstallation }))
      ], { title: 'Qt Kit Manager', placeHolder: 'Named kits can be assigned to multiple QPM projects' });
      if (!action) return;
      if (action.id === 'detect') {
        await this.detectAndSave();
        continue;
      }
      if (action.id === 'add') {
        let installation = this.installations.getActive();
        if (!installation) installation = await this.installations.select();
        if (!installation) continue;
        const name = await vscode.window.showInputBox({ title: 'Qt kit name', value: installation.label, validateInput: (value) => value.trim() ? undefined : 'A kit name is required.' });
        if (!name) continue;
        this.upsert({ ...registeredKitFromInstallation(installation, new Date().toISOString()), name: name.trim() });
        continue;
      }
      const kitId = action.id.slice(4);
      const kit = kits.find((entry) => entry.id === kitId);
      if (!kit) continue;
      const kitAction = await vscode.window.showQuickPick([
        { id: 'show', label: '$(json) Show kit details' },
        { id: 'edit', label: '$(tools) Edit kit tools and generator' },
        { id: 'rename', label: '$(edit) Rename kit' },
        { id: 'duplicate', label: '$(copy) Duplicate kit' },
        { id: 'delete', label: '$(trash) Delete kit' }
      ], { title: kit.name });
      if (!kitAction) continue;
      if (kitAction.id === 'show') {
        const doc = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(kit, null, 2) });
        await vscode.window.showTextDocument(doc, { preview: true });
      } else if (kitAction.id === 'edit') {
        await this.editKit(kit);
      } else if (kitAction.id === 'rename') {
        const name = await vscode.window.showInputBox({ title: 'Qt kit name', value: kit.name });
        if (name?.trim()) this.upsert({ ...kit, name: name.trim(), updatedAt: new Date().toISOString() });
      } else if (kitAction.id === 'duplicate') {
        const name = await vscode.window.showInputBox({ title: 'Duplicated Qt kit name', value: `${kit.name} Copy`, validateInput: (value) => value.trim() ? undefined : 'A kit name is required.' });
        if (name?.trim()) {
          const id = `${kit.id}-copy-${Date.now().toString(36)}`;
          const now = new Date().toISOString();
          this.upsert({ ...kit, id, name: name.trim(), createdAt: now, updatedAt: now });
        }
      } else if (kitAction.id === 'delete') {
        const confirmation = await vscode.window.showWarningMessage(`Delete named kit “${kit.name}”? Project-local copies are not removed.`, { modal: true }, 'Delete');
        if (confirmation === 'Delete') this.remove(kit.id);
      }
    }
  }

  async assignToProject(manifestPath: string): Promise<QpmRegisteredQtKit | undefined> {
    let kits = this.list();
    if (!kits.length) kits = await this.detectAndSave();
    const choice = await vscode.window.showQuickPick(kits.map((kit) => ({
      label: kit.name,
      description: `${kit.qtLabel} · ${kit.compilerFamily ?? 'unknown'} ${kit.architecture}`,
      detail: kit.qtInstallation,
      kit
    })), { title: 'Assign named Qt kit to project' });
    if (!choice) return undefined;
    const manifest = readQtProjectManifest(manifestPath);
    const projectKit: QtKitProfile = copyAsProjectKit(choice.kit);
    const index = manifest.profiles.kits.findIndex((entry) => entry.id === projectKit.id);
    if (index >= 0) manifest.profiles.kits[index] = projectKit;
    else manifest.profiles.kits.push(projectKit);
    manifest.profiles.active.kitProfileId = projectKit.id;
    for (const buildProfile of manifest.profiles.builds) {
      buildProfile.kitId = projectKit.id;
    }
    synchronizeLegacyProfileMirrors(manifest);
    writeQtProjectManifest(manifestPath, manifest);
    vscode.window.showInformationMessage(`Assigned Qt kit ${choice.kit.name} to ${manifest.name}.`);
    return choice.kit;
  }

  private async editKit(initial: QpmRegisteredQtKit): Promise<void> {
    let kit = { ...initial };
    while (true) {
      const action = await vscode.window.showQuickPick([
        { id: 'qt', label: 'Qt installation', description: kit.qtInstallation || 'not set' },
        { id: 'cpp', label: 'C++ compiler', description: kit.compilerPath || 'not set' },
        { id: 'c', label: 'C compiler', description: kit.cCompilerPath || 'not set' },
        { id: 'arch', label: 'Architecture', description: kit.architecture },
        { id: 'family', label: 'Compiler family', description: kit.compilerFamily || 'unknown' },
        { id: 'device', label: 'Device type', description: kit.deviceType },
        { id: 'debug-type', label: 'Debugger type', description: kit.debuggerType },
        { id: 'debugger', label: 'Debugger executable', description: kit.debuggerPath || 'automatic' },
        { id: 'environment', label: 'Environment script', description: kit.environmentScript || 'none' },
        { id: 'qmake', label: 'qmake executable', description: kit.qmakePath || 'not set' },
        { id: 'cmake', label: 'CMake executable', description: kit.cmakePath || 'not set' },
        { id: 'build', label: 'Build tool', description: kit.buildToolPath || 'not set' },
        { id: 'generator', label: 'CMake generator', description: kit.generator || 'automatic' },
        { id: 'save', label: '$(save) Save kit', description: 'Persist all changes' }
      ], { title: `Edit Qt kit — ${kit.name}`, placeHolder: 'Select a field or save' });
      if (!action) return;
      if (action.id === 'save') {
        kit.updatedAt = new Date().toISOString();
        this.upsert(kit);
        vscode.window.showInformationMessage(`Qt kit ${kit.name} updated.`);
        return;
      }
      if (action.id === 'qt') {
        const selected = await selectPath('Select Qt kit root', true, kit.qtInstallation);
        if (!selected) continue;
        const installation = describeQtRoot(selected);
        if (!installation) {
          vscode.window.showErrorMessage('The selected directory is not a valid Qt kit root.');
          continue;
        }
        const detected = registeredKitFromInstallation(installation, kit.createdAt);
        kit = { ...kit, ...detected, id: kit.id, name: kit.name, createdAt: kit.createdAt, updatedAt: kit.updatedAt };
        continue;
      }
      if (action.id === 'arch') {
        const selected = await vscode.window.showQuickPick(['auto', 'x86', 'x64'].map((value) => ({ label: value, value })), { title: 'Qt kit architecture' });
        if (selected) kit.architecture = selected.value as QtKitProfile['architecture'];
        continue;
      }
      if (action.id === 'family') {
        const selected = await vscode.window.showQuickPick(['mingw', 'msvc', 'clang', 'gcc', 'emscripten', 'unknown'].map((value) => ({ label: value, value })), { title: 'Compiler family' });
        if (selected) kit.compilerFamily = selected.value as QtKitProfile['compilerFamily'];
        continue;
      }
      if (action.id === 'device') {
        const selected = await vscode.window.showQuickPick(['desktop', 'linux-local', 'remote-linux', 'docker', 'webassembly', 'android'].map((value) => ({ label: value, value })), { title: 'Qt kit device type' });
        if (selected) kit.deviceType = selected.value as QtKitProfile['deviceType'];
        continue;
      }
      if (action.id === 'debug-type') {
        const selected = await vscode.window.showQuickPick(['auto', 'gdb', 'lldb', 'cdb', 'cppvsdbg'].map((value) => ({ label: value, value })), { title: 'Debugger type' });
        if (selected) kit.debuggerType = selected.value as QtKitProfile['debuggerType'];
        continue;
      }
      if (action.id === 'generator') {
        const selected = await vscode.window.showQuickPick([
          { label: 'Automatic', value: '' },
          { label: 'Ninja', value: 'Ninja' },
          { label: 'NMake Makefiles', value: 'NMake Makefiles' },
          { label: 'MinGW Makefiles', value: 'MinGW Makefiles' },
          { label: 'Unix Makefiles', value: 'Unix Makefiles' },
          { label: 'Visual Studio generator…', value: 'custom' },
          { label: 'Custom generator…', value: 'custom' }
        ], { title: 'CMake generator' });
        if (!selected) continue;
        if (selected.value === 'custom') {
          const value = await vscode.window.showInputBox({ title: 'CMake generator', value: kit.generator || '' });
          if (value !== undefined) kit.generator = value.trim();
        } else kit.generator = selected.value;
        continue;
      }
      const field = ({ cpp: 'compilerPath', c: 'cCompilerPath', debugger: 'debuggerPath', environment: 'environmentScript', qmake: 'qmakePath', cmake: 'cmakePath', build: 'buildToolPath' } as const)[action.id as 'cpp' | 'c' | 'debugger' | 'environment' | 'qmake' | 'cmake' | 'build'];
      if (field) {
        const selected = await selectPath(`Select ${action.label}`, false, kit[field]);
        if (!selected) continue;
        if (field === 'compilerPath') {
          const expectedArchitecture = kit.architecture === 'auto' ? 'unknown' : kit.architecture;
          const probe = inspectQtCompiler(selected, kit.compilerFamily ?? 'unknown', expectedArchitecture);
          kit = {
            ...kit,
            compilerPath: probe.cppCompilerPath || selected,
            cCompilerPath: kit.cCompilerPath || probe.cCompilerPath,
            compilerFamily: probe.family,
            compilerTargetTriple: probe.targetTriple,
            compilerVersion: probe.compilerVersion,
            compatibility: probe.compatibility,
            diagnostic: probe.diagnostic,
            architecture: kit.architecture === 'auto' && (probe.detectedArchitecture === 'x86' || probe.detectedArchitecture === 'x64') ? probe.detectedArchitecture : kit.architecture,
            debuggerPath: kit.debuggerPath || probe.debuggerPath,
            buildToolPath: kit.buildToolPath || probe.makePath
          };
        } else {
          kit = { ...kit, [field]: selected };
        }
      }
    }
  }

  private upsert(kit: QpmRegisteredQtKit): void {
    const document = this.read();
    const index = document.kits.findIndex((entry) => entry.id === kit.id);
    if (index >= 0) document.kits[index] = kit;
    else document.kits.push(kit);
    this.write(document);
  }

  private remove(id: string): void {
    const document = this.read();
    document.kits = document.kits.filter((entry) => entry.id !== id);
    this.write(document);
  }

  private read(): RegistryDocument {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.registryPath, 'utf8')) as RegistryDocument;
      return { schemaVersion: 1, kits: Array.isArray(parsed.kits) ? parsed.kits : [] };
    } catch {
      return { schemaVersion: 1, kits: [] };
    }
  }

  private write(document: RegistryDocument): void {
    fs.mkdirSync(path.dirname(this.registryPath), { recursive: true });
    fs.writeFileSync(this.registryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }
}


async function selectPath(title: string, folder: boolean, current?: string): Promise<string | undefined> {
  const selected = await vscode.window.showOpenDialog({
    title,
    defaultUri: current ? vscode.Uri.file(folder ? current : path.dirname(current)) : undefined,
    canSelectFiles: !folder,
    canSelectFolders: folder,
    canSelectMany: false,
    filters: !folder && process.platform === 'win32' ? { Executables: ['exe', 'bat', 'cmd'], 'All files': ['*'] } : undefined
  });
  return selected?.[0]?.fsPath;
}

function registeredKitFromInstallation(installation: QpmQtInstallation, now: string): QpmRegisteredQtKit {
  const debuggerType = installation.compilerFamily === 'msvc'
    ? (installation.toolchain.debuggerPath ? 'cdb' : 'cppvsdbg')
    : installation.toolchain.debuggerPath?.toLowerCase().includes('lldb') ? 'lldb' : 'gdb';
  const buildToolPath = installation.compilerFamily === 'msvc'
    ? installation.jomPath || installation.nmakePath || installation.ninjaPath || installation.toolchain.makePath
    : installation.ninjaPath || installation.toolchain.makePath;
  const generator = installation.compilerFamily === 'msvc'
    ? (installation.ninjaPath ? 'Ninja' : 'NMake Makefiles')
    : installation.ninjaPath ? 'Ninja' : process.platform === 'win32' ? 'MinGW Makefiles' : 'Unix Makefiles';
  return {
    id: `kit-${installation.id}`.replace(/[^A-Za-z0-9_.-]+/g, '-'),
    name: installation.label,
    qtVersion: installation.version,
    qtLabel: installation.label,
    qtInstallation: installation.root,
    cCompilerPath: installation.toolchain.cCompilerPath,
    compilerPath: installation.toolchain.cppCompilerPath,
    debuggerPath: installation.toolchain.debuggerPath,
    debuggerType,
    compilerFamily: installation.toolchain.family,
    compilerTargetTriple: installation.toolchain.targetTriple,
    compilerVersion: installation.toolchain.compilerVersion,
    compatibility: installation.toolchain.compatibility,
    diagnostic: installation.toolchain.diagnostic,
    architecture: installation.architecture === 'x86' || installation.architecture === 'x64' ? installation.architecture : 'auto',
    deviceType: installation.isAndroid || /(?:^|[\\/])android_(?:arm64_v8a|armv7|x86|x86_64)(?:[\\/]|$)/i.test(installation.root) ? 'android' : installation.compilerFamily === 'emscripten' || /wasm|webassembly/i.test(installation.root) ? 'webassembly' : process.platform === 'linux' ? 'linux-local' : 'desktop',
    environmentScript: installation.toolchain.environmentScript || installation.vcVarsPath,
    qmakePath: installation.qmakePath,
    cmakePath: installation.cmakePath,
    buildToolPath,
    generator,
    createdAt: now,
    updatedAt: now
  };
}

function copyAsProjectKit(kit: QpmRegisteredQtKit): QtKitProfile {
  const { qtVersion: _qtVersion, qtLabel: _qtLabel, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = kit;
  return { ...profile };
}
