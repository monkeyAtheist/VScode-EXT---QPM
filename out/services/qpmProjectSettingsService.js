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
exports.QpmProjectSettingsService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const EMPTY_RUN_SETTINGS = {
    arguments: '',
    workingDirectory: '',
    environmentOptions: '',
    externalProcessPath: ''
};
class QpmProjectSettingsService {
    workspaces;
    parser;
    output;
    constructor(workspaces, parser, output) {
        this.workspaces = workspaces;
        this.parser = parser;
        this.output = output;
    }
    getConfigurationPath() {
        const root = this.getConfigurationRoot();
        return root ? path.join(root, '.vscode', 'qpm-build.json') : undefined;
    }
    getSettings(projectRef, mode = this.buildMode) {
        const store = this.loadStore();
        const stored = store.projects[this.projectKey(projectRef.absolutePath)];
        const cwsRun = this.getCwsRunSettings(projectRef, mode);
        if ((0, qtProjectManifest_1.isQtProjectManifestPath)(projectRef.absolutePath)) {
            return normalizeSettings(stored, cwsRun, undefined, false);
        }
        const nativeActions = this.parser.getProjectBuildActions(projectRef.absolutePath, mode);
        return normalizeSettings(stored, cwsRun, nativeActions.nativeSectionsPresent ? nativeActions : undefined, nativeActions.nativeSectionsPresent);
    }
    setSettings(projectRef, settings, mode = this.buildMode) {
        const store = this.loadStore();
        const normalized = normalizeSettings(settings);
        if (!(0, qtProjectManifest_1.isQtProjectManifestPath)(projectRef.absolutePath)) {
            this.parser.setProjectBuildActions(projectRef.absolutePath, mode, normalized);
            normalized.nativeBuildActions = true;
        }
        else {
            normalized.nativeBuildActions = false;
        }
        store.projects[this.projectKey(projectRef.absolutePath)] = normalized;
        this.saveStore(store);
        this.setCwsRunSettings(projectRef, normalized.run, mode);
        this.output.appendLine(`[QPM] Project build settings saved: ${projectRef.name}`);
    }
    getBuildOrder(projectRef) {
        const workspace = this.workspaces.currentWorkspace;
        if (!workspace) {
            return [projectRef];
        }
        const byKey = new Map(workspace.projects.map((ref) => [this.projectKey(ref.absolutePath), ref]));
        const result = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (ref) => {
            const key = this.projectKey(ref.absolutePath);
            if (visited.has(key)) {
                return;
            }
            if (visiting.has(key)) {
                throw new Error(`Circular Qt build dependency detected at ${ref.name}.`);
            }
            visiting.add(key);
            for (const dependencyKey of this.getSettings(ref).dependencies) {
                const dependency = byKey.get(dependencyKey);
                if (dependency?.exists) {
                    visit(dependency);
                }
            }
            visiting.delete(key);
            visited.add(key);
            result.push(ref);
        };
        visit(projectRef);
        return result;
    }
    hasNativeBuildActions(projectRef) {
        return !(0, qtProjectManifest_1.isQtProjectManifestPath)(projectRef.absolutePath) && this.parser.getProjectBuildActions(projectRef.absolutePath, this.buildMode).nativeSectionsPresent;
    }
    dependencyKey(projectRef) {
        return this.projectKey(projectRef.absolutePath);
    }
    async runActions(actions, label, cwd) {
        const commands = actions.map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#'));
        if (!commands.length) {
            return true;
        }
        this.output.appendLine(`[QPM] ${label}`);
        for (const command of commands) {
            this.output.appendLine(`[QPM] > ${command}`);
            const success = await this.runShellCommand(command, cwd);
            if (!success) {
                this.output.appendLine(`[QPM] ${label} failed.`);
                return false;
            }
        }
        return true;
    }
    parseArguments(value) {
        const result = [];
        const pattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
        let match;
        while ((match = pattern.exec(value)) !== null) {
            result.push(match[1] ?? match[2] ?? match[3]);
        }
        return result;
    }
    parseEnvironment(value) {
        const result = { ...process.env };
        for (const entry of value.split(';')) {
            const trimmed = entry.trim();
            if (!trimmed) {
                continue;
            }
            const separator = trimmed.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            const key = trimmed.slice(0, separator).trim();
            const val = trimmed.slice(separator + 1).trim();
            if (key) {
                result[key] = val;
            }
        }
        return result;
    }
    getCwsRunSettings(projectRef, mode = this.buildMode) {
        const workspace = this.workspaces.currentWorkspace;
        if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
            return undefined;
        }
        return this.parser.getWorkspaceRunOptions(workspace.path, projectRef.index, mode);
    }
    setCwsRunSettings(projectRef, run, mode = this.buildMode) {
        const workspace = this.workspaces.currentWorkspace;
        if (!workspace || path.extname(workspace.path).toLowerCase() !== '.cws') {
            return;
        }
        this.parser.setWorkspaceRunOptions(workspace.path, projectRef.index, mode, run);
    }
    get buildMode() {
        return vscode.workspace.getConfiguration('qpm').get('buildMode', 'debug');
    }
    getConfigurationRoot() {
        const workspace = this.workspaces.currentWorkspace;
        if (workspace) {
            return path.dirname(workspace.path);
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }
    projectKey(projectPath) {
        const root = this.getConfigurationRoot();
        if (!root) {
            return path.normalize(projectPath).replace(/\\/g, '/').toLowerCase();
        }
        return path.relative(root, projectPath).replace(/\\/g, '/').toLowerCase();
    }
    loadStore() {
        const filePath = this.getConfigurationPath();
        let effectivePath = filePath;
        if (!effectivePath || !fs.existsSync(effectivePath)) {
            const root = this.getConfigurationRoot();
            const legacyPath = root ? path.join(root, '.vscode', 'labwindows-qpm-build.json') : undefined;
            if (!legacyPath || !fs.existsSync(legacyPath)) {
                return { version: 1, projects: {} };
            }
            effectivePath = legacyPath;
        }
        try {
            const raw = JSON.parse(fs.readFileSync(effectivePath, 'utf8'));
            return { version: 1, projects: raw.projects && typeof raw.projects === 'object' ? raw.projects : {} };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Unable to read ${effectivePath}: ${message}`);
        }
    }
    saveStore(store) {
        const filePath = this.getConfigurationPath();
        if (!filePath) {
            throw new Error('No Qt workspace directory is available to store build settings.');
        }
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    }
    async runShellCommand(command, cwd) {
        return await new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(command, { cwd, shell: true, windowsHide: true });
            child.stdout.on('data', (data) => this.output.append(data.toString()));
            child.stderr.on('data', (data) => this.output.append(data.toString()));
            child.on('error', (error) => {
                this.output.appendLine(`[QPM] Unable to run action: ${error.message}`);
                resolve(false);
            });
            child.on('close', (code) => {
                this.output.appendLine(`[QPM] Action exited with code ${String(code)}.`);
                resolve(code === 0);
            });
        });
    }
}
exports.QpmProjectSettingsService = QpmProjectSettingsService;
function normalizeSettings(value, fallbackRun, nativeActions, nativeBuildActions = false) {
    return {
        preBuildActions: normalizeActions(nativeActions?.preBuildActions ?? value?.preBuildActions),
        customBuildActions: normalizeActions(nativeActions?.customBuildActions ?? value?.customBuildActions),
        postBuildActions: normalizeActions(nativeActions?.postBuildActions ?? value?.postBuildActions),
        dependencies: Array.isArray(value?.dependencies) ? value.dependencies.map(String) : [],
        run: {
            arguments: String(fallbackRun?.arguments ?? value?.run?.arguments ?? EMPTY_RUN_SETTINGS.arguments),
            workingDirectory: String(fallbackRun?.workingDirectory ?? value?.run?.workingDirectory ?? EMPTY_RUN_SETTINGS.workingDirectory),
            environmentOptions: String(fallbackRun?.environmentOptions ?? value?.run?.environmentOptions ?? EMPTY_RUN_SETTINGS.environmentOptions),
            externalProcessPath: String(fallbackRun?.externalProcessPath ?? value?.run?.externalProcessPath ?? EMPTY_RUN_SETTINGS.externalProcessPath)
        },
        nativeBuildActions: nativeBuildActions || value?.nativeBuildActions === true
    };
}
function normalizeActions(value) {
    return Array.isArray(value) ? value.map(String).map((entry) => entry.trim()).filter(Boolean) : [];
}
