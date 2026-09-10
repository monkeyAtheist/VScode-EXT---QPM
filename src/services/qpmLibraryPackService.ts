import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface PackIdentity {
  id?: string;
  name?: string;
  version?: string;
  readOnly?: boolean;
}

interface BundledPackSpec {
  fileName: string;
  expectedId: string;
  label: string;
}

/**
 * Canonical curated JC Lib packs preinstalled by QPM.
 *
 * Each file keeps the environment -> library -> category -> group hierarchy used
 * by the standalone JC Lib extension. They are deliberately separate so a Qt
 * workspace can display only the domain roots that are useful to QPM without a
 * synthetic "Qt Project Manager" environment.
 */
export const QPM_BUNDLED_LIBRARY_PACKS: readonly BundledPackSpec[] = [
  { fileName: 'c_language_pack.json', expectedId: 'c_language_pack', label: 'C' },
  { fileName: 'cpp_language_pack.json', expectedId: 'jclib.cpp.language', label: 'C++' },
  { fileName: 'qpm_base_preprocessor_pack.json', expectedId: 'qpm.base.preprocessor', label: 'Preprocessor' },
  { fileName: 'opencv_pack.json', expectedId: 'opencv_cpp_structured_pack', label: 'OpenCV' },
  { fileName: 'build_pack.json', expectedId: 'build-toolchains-structured-pack', label: 'Build' },
  { fileName: 'windows_api_device_pack.json', expectedId: 'windows-api-device-pack', label: 'Windows API / Devices' },
  { fileName: 'system_scripting_pack.json', expectedId: 'scripting-system-pack', label: 'Scripting / System' },
  { fileName: 'python_pack.json', expectedId: 'python_structured_complete_pack', label: 'Python' },
  { fileName: 'web_language_pack.json', expectedId: 'javascript-html-css-audit-pack', label: 'JavaScript / HTML / CSS' },
  { fileName: 'typescript_language_pack.json', expectedId: 'typescript-language-pack-audit-v1', label: 'TypeScript' },
  { fileName: 'database_pack.json', expectedId: 'database_pack', label: 'Database' },
  { fileName: 'php_language_pack.json', expectedId: 'php_structured_complete_pack', label: 'PHP' },
  { fileName: 'embedded_language_pack.json', expectedId: 'embedded_systems_pack', label: 'Embedded' },
  { fileName: 'qt_pack.json', expectedId: 'qt-cpp-complete-pack', label: 'Qt C++' },
  { fileName: 'qt_python_pack.json', expectedId: 'qt-python-pyside6-complete', label: 'Qt for Python / PySide6' }
] as const;

function readPackIdentity(filePath: string): PackIdentity | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackIdentity;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeVersion(version: string | undefined): string {
  return String(version || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function createBackupPath(targetDirectory: string, fileName: string, previousVersion: string | undefined): string {
  const backupDirectory = path.join(targetDirectory, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = sanitizeVersion(previousVersion);
  return path.join(backupDirectory, `${fileName}.backup-${suffix}-${timestamp}.json`);
}

function backupAndRemove(filePath: string, targetDirectory: string, output: vscode.OutputChannel, reason: string): void {
  if (!fs.existsSync(filePath)) return;
  const identity = readPackIdentity(filePath);
  const stem = path.basename(filePath, path.extname(filePath));
  const backup = createBackupPath(targetDirectory, stem, identity?.version);
  fs.copyFileSync(filePath, backup);
  fs.unlinkSync(filePath);
  output.appendLine(`[Qt Libraries] ${reason}. Backup: ${backup}`);
}

function migrateLegacySingleCorePack(targetDirectory: string, output: vscode.OutputChannel): void {
  const legacyCandidates = ['qpm_core_pack.json', 'qpm_pack.json'];
  for (const fileName of legacyCandidates) {
    const filePath = path.join(targetDirectory, fileName);
    if (!fs.existsSync(filePath)) continue;
    const identity = readPackIdentity(filePath);
    const id = String(identity?.id || '').toLowerCase();
    const name = String(identity?.name || '').toLowerCase();
    const isLegacy = fileName === 'qpm_core_pack.json'
      || id === 'qpm-c-cpp-core-pack'
      || id === 'qpm-structured-pack'
      || name.includes('qt project manager core')
      || name.includes('labwindows/qpm');
    if (isLegacy) {
      backupAndRemove(filePath, targetDirectory, output, 'Migrated the legacy combined QPM library pack to the curated QPM JC Lib pack set');
    }
  }
}

function migrateDeprecatedIntegratedPacks(targetDirectory: string, output: vscode.OutputChannel): void {
  const deprecated = [
    'qpm_base_qt_pack.json',
    'qpm_base_c_pack.json',
    'qpm_base_cpp_pack.json',
    'qpm_base_windows_pack.json',
    'qpm_base_python_pack.json'
  ];
  for (const fileName of deprecated) {
    const filePath = path.join(targetDirectory, fileName);
    if (fs.existsSync(filePath)) {
      backupAndRemove(filePath, targetDirectory, output, `Migrated deprecated integrated pack ${fileName}`);
    }
  }
}

function installOrUpgradePack(
  context: vscode.ExtensionContext,
  targetDirectory: string,
  spec: BundledPackSpec,
  output: vscode.OutputChannel
): 'installed' | 'upgraded' | 'current' | 'missing' {
  const source = vscode.Uri.joinPath(context.extensionUri, 'data', spec.fileName).fsPath;
  const target = path.join(targetDirectory, spec.fileName);

  if (!fs.existsSync(source)) {
    output.appendLine(`[Qt Libraries] Bundled ${spec.label} pack not found: ${source}`);
    return 'missing';
  }

  const bundled = readPackIdentity(source);
  if (!bundled || bundled.id !== spec.expectedId) {
    output.appendLine(`[Qt Libraries] Rejected invalid bundled ${spec.label} pack: expected id ${spec.expectedId}, found ${bundled?.id || 'none'}.`);
    return 'missing';
  }

  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
    output.appendLine(`[Qt Libraries] Installed integrated ${spec.label} pack (${bundled.version || 'unknown'}).`);
    return 'installed';
  }

  const installed = readPackIdentity(target);
  const sameId = installed?.id === spec.expectedId;
  const sameVersion = String(installed?.version || '') === String(bundled.version || '');
  if (sameId && sameVersion) {
    return 'current';
  }

  const backup = createBackupPath(targetDirectory, path.basename(spec.fileName, '.json'), installed?.version);
  fs.copyFileSync(target, backup);
  fs.copyFileSync(source, target);
  output.appendLine(
    `[Qt Libraries] Upgraded integrated ${spec.label} pack ${installed?.version || 'unknown'} -> ${bundled.version || 'unknown'}.`
  );
  output.appendLine(`[Qt Libraries] Previous pack backed up to: ${backup}`);
  return 'upgraded';
}

/**
 * Seed or upgrade the curated JC Lib pack set used by QPM.
 *
 * The old combined qpm_core_pack.json is backed up and removed to prevent
 * duplicated C/C++/preprocessor nodes. User-created global and workspace packs
 * are not touched.
 */
export function ensureBundledCppLibraryPack(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  const targetDirectory = path.join(context.globalStorageUri.fsPath, 'packs');
  fs.mkdirSync(targetDirectory, { recursive: true });

  migrateLegacySingleCorePack(targetDirectory, output);
  migrateDeprecatedIntegratedPacks(targetDirectory, output);

  const counts = { installed: 0, upgraded: 0, current: 0, missing: 0 };
  for (const spec of QPM_BUNDLED_LIBRARY_PACKS) {
    counts[installOrUpgradePack(context, targetDirectory, spec, output)] += 1;
  }

  output.appendLine(
    `[Qt Libraries] Curated integrated packs: ${counts.installed} installed, ${counts.upgraded} upgraded, ${counts.current} current, ${counts.missing} missing.`
  );
}

// Backward-compatible exported name for older imports inside the extension.
export const ensureBundledQpmLibraryPack = ensureBundledCppLibraryPack;
