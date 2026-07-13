import * as fs from 'fs';
import * as path from 'path';

export interface QpmQtCleanResult {
  success: boolean;
  strategy: 'absent' | 'rename' | 'in-place';
  pendingDirectory?: string;
  warnings: string[];
}

export interface QpmQtCleanOptions {
  modeDirectory: string;
  requiredDirectories: string[];
  retryCount?: number;
  retryDelayMs?: number;
}

/**
 * Clean a direct-build output atomically when possible.
 *
 * Important Windows rule: do not recreate `generated`/`obj` from the clean
 * command. File watchers, IntelliSense and antivirus scanners may still be
 * transitioning from the renamed directory and Windows can reject an
 * immediate mkdir with EPERM. The next build owns directory creation through
 * QpmBuildService.ensureDirectory(), which already retries and diagnoses the
 * operation.
 *
 * If the atomic rename is unavailable, QPM cleans in place while preserving
 * the required directory roots. This avoids a delete/recreate race entirely.
 */
export async function cleanQtDirectModeDirectory(options: QpmQtCleanOptions): Promise<QpmQtCleanResult> {
  const modeDirectory = path.normalize(options.modeDirectory);
  const requiredDirectories = unique(options.requiredDirectories.map((entry) => path.normalize(entry)));
  const retryCount = Math.max(1, options.retryCount ?? 8);
  const retryDelayMs = Math.max(10, options.retryDelayMs ?? 120);
  const warnings: string[] = [];

  for (const pending of findPendingDirectories(modeDirectory)) {
    if (!await removePathWithRetries(pending, Math.max(2, Math.ceil(retryCount / 2)), retryDelayMs)) {
      warnings.push(`A previous pending clean directory is still locked: ${pending}`);
    }
  }

  if (!fs.existsSync(modeDirectory)) {
    return { success: true, strategy: 'absent', warnings };
  }

  const pendingDirectory = createPendingDirectoryName(modeDirectory);
  let lastRenameError: unknown;
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      fs.renameSync(modeDirectory, pendingDirectory);
      const removed = await removePathWithRetries(pendingDirectory, Math.max(3, Math.ceil(retryCount / 2)), retryDelayMs);
      if (!removed) {
        warnings.push(`The previous build was moved to ${pendingDirectory}, but Windows still has a handle open. QPM will retry removal during the next clean.`);
      }
      return { success: true, strategy: 'rename', pendingDirectory: removed ? undefined : pendingDirectory, warnings };
    } catch (error) {
      lastRenameError = error;
      if (!isRetryableFileSystemError(error) || attempt === retryCount) break;
      await delay(retryDelayMs * attempt);
    }
  }

  warnings.push(`Atomic clean rename was unavailable: ${formatError(lastRenameError)}. Falling back to in-place cleanup.`);
  const failures: string[] = [];
  try {
    const preservedRoots = requiredDirectories.filter((entry) => isSameOrChildPath(entry, modeDirectory));
    for (const entry of fs.readdirSync(modeDirectory)) {
      const candidate = path.join(modeDirectory, entry);
      const preserved = preservedRoots.find((root) => pathsEqual(root, candidate));
      if (preserved && isDirectory(candidate)) {
        if (!await clearDirectoryContents(candidate, retryCount, retryDelayMs)) failures.push(candidate);
        continue;
      }
      if (!await removePathWithRetries(candidate, retryCount, retryDelayMs)) failures.push(candidate);
    }
  } catch (error) {
    failures.push(modeDirectory);
    warnings.push(`Unable to enumerate the build output directory: ${formatError(error)}.`);
  }

  if (failures.length > 0) {
    warnings.push(`Unable to remove ${failures.length} locked build item(s): ${failures.join(', ')}`);
  }
  return { success: failures.length === 0, strategy: 'in-place', warnings };
}

export async function removePathWithRetries(targetPath: string, retryCount = 8, retryDelayMs = 120): Promise<boolean> {
  for (let attempt = 1; attempt <= Math.max(1, retryCount); attempt++) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 0 });
      if (!fs.existsSync(targetPath)) return true;
    } catch (error) {
      if (!isRetryableFileSystemError(error) || attempt === retryCount) return !fs.existsSync(targetPath);
    }
    await delay(Math.max(10, retryDelayMs) * attempt);
  }
  return !fs.existsSync(targetPath);
}

export function createPendingDirectoryName(modeDirectory: string, now = Date.now(), processId = process.pid): string {
  const parent = path.dirname(modeDirectory);
  const base = path.basename(modeDirectory);
  let candidate = path.join(parent, `.${base}.qpm-clean-pending-${processId}-${now}`);
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = path.join(parent, `.${base}.qpm-clean-pending-${processId}-${now}-${suffix++}`);
  return candidate;
}

async function clearDirectoryContents(directory: string, retryCount: number, retryDelayMs: number): Promise<boolean> {
  let entries: string[];
  try {
    entries = fs.readdirSync(directory);
  } catch (error) {
    return !fs.existsSync(directory);
  }

  let success = true;
  for (const entry of entries) {
    if (!await removePathWithRetries(path.join(directory, entry), retryCount, retryDelayMs)) success = false;
  }
  return success;
}

function findPendingDirectories(modeDirectory: string): string[] {
  const parent = path.dirname(modeDirectory);
  const prefix = `.${path.basename(modeDirectory)}.qpm-clean-pending-`;
  try {
    return fs.readdirSync(parent)
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => path.join(parent, entry));
  } catch {
    return [];
  }
}

function isRetryableFileSystemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'ENOENT';
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown error');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function pathsEqual(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isSameOrChildPath(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isDirectory(candidate: string): boolean {
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
