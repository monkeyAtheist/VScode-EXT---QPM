import { ChildProcess, execFileSync } from 'child_process';
import * as vscode from 'vscode';

/**
 * One QPM-managed interactive Run at a time (C++/Qt and Qt for Python).
 *
 * - Run terminals are named `QPM Run: <project>` and created with `isTransient: true`, so VS Code never
 *   revives them after a restart (a revived terminal whose shell is the target executable would
 *   re-launch the program once per stored tab).
 * - Starting a new Run or Debug closes the previous QPM Run terminals — including orphan tabs left by an
 *   extension-host reload, found through `window.terminals` — and stops captured (Program Output)
 *   processes. Detached launches are never stopped. User, build, SSH, Docker and debugger terminals are
 *   never touched.
 * - QPM <= 0.35 created persistent `QPM — <project>` / `QPM Python — <project>` terminals; they are closed
 *   once at activation and whenever VS Code restores one.
 */
export const QPM_RUN_TERMINAL_PREFIX = 'QPM Run: ';
const LEGACY_RUN_TERMINAL_PREFIXES = ['QPM — ', 'QPM Python — '];

export function isQpmRunTerminalName(name: string): boolean {
  return name.startsWith(QPM_RUN_TERMINAL_PREFIX);
}

export function isLegacyQpmRunTerminalName(name: string): boolean {
  return LEGACY_RUN_TERMINAL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export class QpmRunSessions implements vscode.Disposable {
  private readonly terminals = new Set<vscode.Terminal>();
  private readonly processes = new Set<ChildProcess>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output?: vscode.OutputChannel) {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => { this.terminals.delete(terminal); }),
      vscode.window.onDidOpenTerminal((terminal) => {
        if (isLegacyQpmRunTerminalName(terminal.name)) {
          try { terminal.dispose(); } catch { /* best effort migration cleanup */ }
        }
      })
    );
    this.disposeLegacyRestoredTerminals();
  }

  /** Creates the Run terminal for a project after closing the previous QPM Run sessions. */
  createRunTerminal(projectName: string, options: Omit<vscode.TerminalOptions, 'name' | 'isTransient'>, action: 'Run' | 'Debug' = 'Run'): vscode.Terminal {
    this.stopPrevious(action);
    const terminal = vscode.window.createTerminal({ ...options, name: `${QPM_RUN_TERMINAL_PREFIX}${projectName}`, isTransient: true });
    this.terminals.add(terminal);
    return terminal;
  }

  /** Tracks a non-detached captured process so the next Run/Debug can stop it. */
  trackProcess(child: ChildProcess): void {
    this.processes.add(child);
    const release = (): void => { this.processes.delete(child); };
    child.once('exit', release);
    child.once('error', release);
  }

  /** Closes previous QPM Run terminals and stops captured processes; returns what was stopped. */
  stopPrevious(action: 'Run' | 'Debug'): { terminals: number; processes: number } {
    const previous = new Set<vscode.Terminal>(this.terminals);
    for (const terminal of vscode.window.terminals) {
      if (isQpmRunTerminalName(terminal.name) || isLegacyQpmRunTerminalName(terminal.name)) previous.add(terminal);
    }
    let terminals = 0;
    for (const terminal of previous) {
      try { terminal.dispose(); terminals++; } catch { /* already closed */ }
      this.terminals.delete(terminal);
    }
    const children = [...this.processes];
    for (const child of children) terminateProcess(child);
    this.processes.clear();
    if (terminals > 0 || children.length > 0) {
      this.output?.appendLine(`[QPM] ${action}: closed ${terminals} previous QPM Run terminal(s) and stopped ${children.length} captured process(es).`);
    }
    return { terminals, processes: children.length };
  }

  dispose(): void {
    for (const terminal of this.terminals) {
      try { terminal.dispose(); } catch { /* shutting down */ }
    }
    this.terminals.clear();
    for (const child of this.processes) terminateProcess(child);
    this.processes.clear();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  private disposeLegacyRestoredTerminals(): void {
    let disposed = 0;
    for (const terminal of vscode.window.terminals ?? []) {
      if (!isLegacyQpmRunTerminalName(terminal.name)) continue;
      try { terminal.dispose(); disposed++; } catch { /* best effort */ }
    }
    if (disposed > 0) this.output?.appendLine(`[QPM] Closed ${disposed} restored legacy QPM Run terminal(s) to prevent the executable from relaunching on startup.`);
  }
}

function terminateProcess(child: ChildProcess): void {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    // Kill the whole tree: a Qt app started through a launcher would otherwise survive.
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return; } catch { /* fall back to kill() */ }
  }
  try { child.kill('SIGTERM'); } catch { /* already gone */ }
}

let shared: QpmRunSessions | undefined;

/** Shared instance; created on first use (activate() creates it with the output channel). */
export function qpmRunSessions(output?: vscode.OutputChannel): QpmRunSessions {
  if (!shared) shared = new QpmRunSessions(output);
  return shared;
}

export function disposeQpmRunSessions(): void {
  shared?.dispose();
  shared = undefined;
}
