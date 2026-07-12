import * as fs from 'fs';
import * as path from 'path';

/**
 * Keep a safety margin below the Windows CreateProcess command-line limit.
 * QPM only enables GNU response files when the direct linker command actually
 * approaches the platform limit; small projects stay on ordinary arguments.
 */
export const WINDOWS_GNU_RESPONSE_FILE_THRESHOLD = 24_000;
export const POSIX_GNU_RESPONSE_FILE_THRESHOLD = 100_000;

export function estimateGnuArgumentLength(argumentsList: readonly string[]): number {
  return argumentsList.reduce((total, value) => total + quoteGnuResponseArgument(value).length + 1, 0);
}

export function shouldUseGnuResponseFile(
  argumentsList: readonly string[],
  platform: NodeJS.Platform = process.platform
): boolean {
  const threshold = platform === 'win32'
    ? WINDOWS_GNU_RESPONSE_FILE_THRESHOLD
    : POSIX_GNU_RESPONSE_FILE_THRESHOLD;
  return estimateGnuArgumentLength(argumentsList) >= threshold;
}

/**
 * GCC/MinGW response-file parsing treats backslashes as escape characters even
 * when they occur inside a quoted token. Convert drive-qualified and UNC paths
 * to the forward-slash form accepted by GNU tools before serializing them.
 *
 * This also covers embedded paths such as:
 *   -Wl,--out-implib,C:\\build\\library.dll.a
 */
export function normalizeGnuResponseArgument(value: string): string {
  const containsWindowsPath = /[A-Za-z]:[\\/]/.test(value) || /(?:^|[=,:])\\\\/.test(value);
  return containsWindowsPath ? value.replace(/\\/g, '/') : value;
}

export function quoteGnuResponseArgument(value: string): string {
  const normalized = normalizeGnuResponseArgument(value);
  if (normalized.length === 0) return '""';
  if (!/[\s"\\]/.test(normalized)) return normalized;

  // GNU response files use backslash escaping rather than cmd.exe quoting.
  // Double remaining literal backslashes and escape embedded quotation marks.
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function createGnuResponseFileArguments(
  argumentsList: readonly string[],
  responseFilePath: string
): string[] {
  fs.mkdirSync(path.dirname(responseFilePath), { recursive: true });
  const content = argumentsList.map(quoteGnuResponseArgument).join('\n');
  fs.writeFileSync(responseFilePath, `${content}\n`, 'utf8');
  return [`@${responseFilePath}`];
}
