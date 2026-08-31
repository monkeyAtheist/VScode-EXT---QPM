import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type QpmBuildLogDetail = 'compact' | 'normal' | 'verbose';
export type QpmBuildDiagnosticSeverity = 'error' | 'warning' | 'note';

export interface QpmBuildDiagnostic {
  severity: QpmBuildDiagnosticSeverity;
  filePath?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  raw: string;
  sourceLine?: string;
  hint?: string;
}

export interface QpmToolExecutionResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  diagnostics: QpmBuildDiagnostic[];
  durationMs: number;
}

const GCC_DIAGNOSTIC = /^(.*?):(\d+):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/;
const GCC_DIAGNOSTIC_NO_COLUMN = /^(.*?):(\d+):\s+(fatal error|error|warning|note):\s+(.*)$/;
const MSVC_DIAGNOSTIC = /^(.*?)\((\d+)(?:,(\d+))?\):\s*(fatal error|error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*)$/;

export function parseBuildDiagnostics(text: string, cwd: string): QpmBuildDiagnostic[] {
  const diagnostics: QpmBuildDiagnostic[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    let match = GCC_DIAGNOSTIC.exec(trimmed);
    if (match) {
      diagnostics.push(createDiagnostic(match[4], match[5], match[1], Number(match[2]), Number(match[3]), undefined, trimmed, cwd));
      continue;
    }

    match = GCC_DIAGNOSTIC_NO_COLUMN.exec(trimmed);
    if (match) {
      diagnostics.push(createDiagnostic(match[3], match[4], match[1], Number(match[2]), 1, undefined, trimmed, cwd));
      continue;
    }

    match = MSVC_DIAGNOSTIC.exec(trimmed);
    if (match) {
      diagnostics.push(createDiagnostic(match[4], match[6], match[1], Number(match[2]), Number(match[3] || 1), match[5], trimmed, cwd));
      continue;
    }

    if (/undefined reference to|unresolved external symbol|cannot find -l|ld(?:\.exe)?:\s+cannot find/i.test(trimmed)) {
      diagnostics.push({ severity: 'error', message: trimmed.trim(), raw: trimmed, hint: buildDiagnosticHint(trimmed) });
      continue;
    }
    if (/collect2(?:\.exe)?: error:|linker command failed/i.test(trimmed)) {
      diagnostics.push({ severity: 'error', message: trimmed.trim(), raw: trimmed, hint: buildDiagnosticHint(trimmed) });
      continue;
    }
  }
  return deduplicateDiagnostics(diagnostics);
}

function createDiagnostic(
  severityText: string,
  message: string,
  rawFilePath: string,
  line: number,
  column: number,
  code: string | undefined,
  raw: string,
  cwd: string
): QpmBuildDiagnostic {
  const severity: QpmBuildDiagnosticSeverity = severityText.toLowerCase().includes('warn')
    ? 'warning'
    : severityText.toLowerCase().includes('note')
      ? 'note'
      : 'error';
  const filePath = resolveDiagnosticPath(rawFilePath.trim(), cwd);
  return {
    severity,
    filePath,
    line,
    column,
    code,
    message: message.trim(),
    raw,
    sourceLine: readSourceLine(filePath, line),
    hint: buildDiagnosticHint(message)
  };
}

function resolveDiagnosticPath(value: string, cwd: string): string | undefined {
  if (!value || value.startsWith('<')) return undefined;
  const normalized = value.replace(/^"|"$/g, '');
  return path.isAbsolute(normalized) ? path.normalize(normalized) : path.resolve(cwd, normalized);
}

function readSourceLine(filePath: string | undefined, line: number | undefined): string | undefined {
  if (!filePath || !line || line < 1 || !fs.existsSync(filePath)) return undefined;
  try {
    return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').split('\n')[line - 1]?.trim();
  } catch {
    return undefined;
  }
}

function deduplicateDiagnostics(items: QpmBuildDiagnostic[]): QpmBuildDiagnostic[] {
  const seen = new Set<string>();
  const result: QpmBuildDiagnostic[] = [];
  for (const item of items) {
    const key = `${item.severity}|${item.filePath ?? ''}|${item.line ?? ''}|${item.column ?? ''}|${item.code ?? ''}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildDiagnosticHint(message: string): string | undefined {
  const text = message.toLowerCase();
  if (text.includes('was not declared in this scope') || text.includes('undeclared identifier')) {
    return 'The identifier is used without a visible declaration. If it is a widget placed in Qt Designer, access the generated instance through ui-><objectName>; otherwise declare the variable/member in the appropriate scope.';
  }
  if (text.includes('incomplete type') || text.includes("class type") && text.includes('incomplete')) {
    return 'A forward declaration is not sufficient for this operation. Include the header that contains the complete class definition at the point where the type is used.';
  }
  if (text.includes('no matching function for call') || text.includes('deduced conflicting types')) {
    return 'The call does not match any overload. Check argument types and implicit conversions; for Qt helpers such as qMin/qMax, pass operands with compatible types.';
  }
  if (text.includes('undefined reference to') || text.includes('unresolved external symbol')) {
    return 'This is a linker error: the declaration was found but no matching definition was linked. Check that the .cpp file is included in the project, the signature matches, and the required Qt/library module is linked.';
  }
  if (text.includes('cannot find -l')) {
    return 'The linker cannot locate a requested library. Check the Qt module/library name, library directories, architecture, and selected kit.';
  }
  if (text.includes('no such file or directory') || text.includes('cannot open include file')) {
    return 'A required file/header is missing from the compiler search paths. Check the include path, generated files, Qt module selection, and filename casing.';
  }
  if (text.includes('multiple definition')) {
    return 'The same symbol is defined in more than one translation unit. Move non-inline definitions out of headers or ensure the source file is linked only once.';
  }
  return undefined;
}

export function diagnosticSeverityLabel(severity: QpmBuildDiagnosticSeverity): string {
  return severity === 'error' ? 'ERROR' : severity === 'warning' ? 'WARNING' : 'NOTE';
}

export function diagnosticSeverityIcon(severity: QpmBuildDiagnosticSeverity): string {
  return severity === 'error' ? 'X' : severity === 'warning' ? '!' : 'i';
}

export function relativeDiagnosticPath(filePath: string | undefined, cwd: string): string {
  if (!filePath) return '(tool/linker)';
  const relative = path.relative(cwd, filePath);
  return relative && !relative.startsWith('..') ? relative : filePath;
}

export function toVsCodeDiagnostic(item: QpmBuildDiagnostic): vscode.Diagnostic | undefined {
  if (!item.filePath || !item.line) return undefined;
  const line = Math.max(0, item.line - 1);
  const column = Math.max(0, (item.column ?? 1) - 1);
  const range = new vscode.Range(line, column, line, column + 1);
  const severity = item.severity === 'error'
    ? vscode.DiagnosticSeverity.Error
    : item.severity === 'warning'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information;
  const diagnostic = new vscode.Diagnostic(range, item.message, severity);
  diagnostic.source = 'QPM Build';
  diagnostic.code = item.code;
  return diagnostic;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10000 ? 2 : 1)} s`;
}

export function indentMultiline(text: string, prefix = '    '): string {
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => `${prefix}${line}`).join('\n');
}
