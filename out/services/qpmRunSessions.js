"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpmRunSessions = exports.QPM_RUN_TERMINAL_PREFIX = void 0;
exports.isQpmRunTerminalName = isQpmRunTerminalName;
exports.isLegacyQpmRunTerminalName = isLegacyQpmRunTerminalName;
exports.qpmRunSessions = qpmRunSessions;
exports.disposeQpmRunSessions = disposeQpmRunSessions;
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
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
exports.QPM_RUN_TERMINAL_PREFIX = 'QPM Run: ';
const LEGACY_RUN_TERMINAL_PREFIXES = ['QPM — ', 'QPM Python — '];
function isQpmRunTerminalName(name) {
    return name.startsWith(exports.QPM_RUN_TERMINAL_PREFIX);
}
function isLegacyQpmRunTerminalName(name) {
    return LEGACY_RUN_TERMINAL_PREFIXES.some((prefix) => name.startsWith(prefix));
}
class QpmRunSessions {
    output;
    terminals = new Set();
    processes = new Set();
    disposables = [];
    constructor(output) {
        this.output = output;
        this.disposables.push(vscode.window.onDidCloseTerminal((terminal) => { this.terminals.delete(terminal); }), vscode.window.onDidOpenTerminal((terminal) => {
            if (isLegacyQpmRunTerminalName(terminal.name)) {
                try {
                    terminal.dispose();
                }
                catch { /* best effort migration cleanup */ }
            }
        }));
        this.disposeLegacyRestoredTerminals();
    }
    /** Creates the Run terminal for a project after closing the previous QPM Run sessions. */
    createRunTerminal(projectName, options, action = 'Run') {
        this.stopPrevious(action);
        const terminal = vscode.window.createTerminal({ ...options, name: `${exports.QPM_RUN_TERMINAL_PREFIX}${projectName}`, isTransient: true });
        this.terminals.add(terminal);
        return terminal;
    }
    /** Tracks a non-detached captured process so the next Run/Debug can stop it. */
    trackProcess(child) {
        this.processes.add(child);
        const release = () => { this.processes.delete(child); };
        child.once('exit', release);
        child.once('error', release);
    }
    /** Closes previous QPM Run terminals and stops captured processes; returns what was stopped. */
    stopPrevious(action) {
        const previous = new Set(this.terminals);
        for (const terminal of vscode.window.terminals) {
            if (isQpmRunTerminalName(terminal.name) || isLegacyQpmRunTerminalName(terminal.name))
                previous.add(terminal);
        }
        let terminals = 0;
        for (const terminal of previous) {
            try {
                terminal.dispose();
                terminals++;
            }
            catch { /* already closed */ }
            this.terminals.delete(terminal);
        }
        const children = [...this.processes];
        for (const child of children)
            terminateProcess(child);
        this.processes.clear();
        if (terminals > 0 || children.length > 0) {
            this.output?.appendLine(`[QPM] ${action}: closed ${terminals} previous QPM Run terminal(s) and stopped ${children.length} captured process(es).`);
        }
        return { terminals, processes: children.length };
    }
    dispose() {
        for (const terminal of this.terminals) {
            try {
                terminal.dispose();
            }
            catch { /* shutting down */ }
        }
        this.terminals.clear();
        for (const child of this.processes)
            terminateProcess(child);
        this.processes.clear();
        for (const disposable of this.disposables.splice(0))
            disposable.dispose();
    }
    disposeLegacyRestoredTerminals() {
        let disposed = 0;
        for (const terminal of vscode.window.terminals ?? []) {
            if (!isLegacyQpmRunTerminalName(terminal.name))
                continue;
            try {
                terminal.dispose();
                disposed++;
            }
            catch { /* best effort */ }
        }
        if (disposed > 0)
            this.output?.appendLine(`[QPM] Closed ${disposed} restored legacy QPM Run terminal(s) to prevent the executable from relaunching on startup.`);
    }
}
exports.QpmRunSessions = QpmRunSessions;
function terminateProcess(child) {
    if (child.killed || child.exitCode !== null || child.signalCode !== null)
        return;
    if (process.platform === 'win32' && child.pid) {
        // Kill the whole tree: a Qt app started through a launcher would otherwise survive.
        try {
            (0, child_process_1.execFileSync)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            return;
        }
        catch { /* fall back to kill() */ }
    }
    try {
        child.kill('SIGTERM');
    }
    catch { /* already gone */ }
}
let shared;
/** Shared instance; created on first use (activate() creates it with the output channel). */
function qpmRunSessions(output) {
    if (!shared)
        shared = new QpmRunSessions(output);
    return shared;
}
function disposeQpmRunSessions() {
    shared?.dispose();
    shared = undefined;
}
