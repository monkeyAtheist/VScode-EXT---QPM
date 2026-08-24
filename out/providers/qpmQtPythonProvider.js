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
exports.QpmQtPythonProvider = void 0;
const vscode = __importStar(require("vscode"));
class QpmQtPythonProvider {
    python;
    changeEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.changeEmitter.event;
    disposables = [];
    constructor(python) {
        this.python = python;
        this.disposables.push(this.python.onDidChange(() => this.refresh()));
    }
    attachView(view) {
        this.disposables.push(view.onDidChangeVisibility((event) => {
            if (event.visible)
                void this.python.refresh();
        }));
        if (view.visible)
            void this.python.refresh();
    }
    dispose() {
        for (const disposable of this.disposables)
            disposable.dispose();
        this.changeEmitter.dispose();
    }
    refresh() {
        this.changeEmitter.fire();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.tooltip = element.tooltip ?? [element.label, element.description].filter(Boolean).join(' — ');
        item.iconPath = new vscode.ThemeIcon(element.icon);
        if (element.command)
            item.command = { command: element.command, title: element.label };
        return item;
    }
    getChildren() {
        const manifestPath = this.python.activeManifestPath;
        if (!manifestPath) {
            return [{ id: 'empty', label: 'Active project is C++ Qt', description: 'Select or create a Qt for Python project', icon: 'info' }];
        }
        const status = this.python.status;
        if (!status) {
            void this.python.refresh();
            return [{ id: 'loading', label: 'Inspecting Qt for Python environment…', icon: 'sync~spin' }];
        }
        return nodesForStatus(status);
    }
}
exports.QpmQtPythonProvider = QpmQtPythonProvider;
function nodesForStatus(status) {
    const stateIcon = status.state === 'ready' ? 'pass-filled'
        : status.state === 'missing-pyside6' || status.state === 'missing-python' ? 'warning'
            : status.state === 'disabled' ? 'circle-slash'
                : 'error';
    return [
        { id: 'project', label: status.projectName, description: 'Qt for Python · PySide6', icon: 'symbol-class', tooltip: status.manifestPath },
        { id: 'state', label: 'State', description: status.state, icon: stateIcon, tooltip: status.message },
        { id: 'python', label: 'Python', description: status.pythonVersion ? `${status.pythonVersion} · ${status.interpreter}` : status.interpreter || 'not resolved', icon: 'terminal-python' },
        { id: 'pyside', label: 'PySide6', description: status.pySideVersion || 'not installed', icon: status.pySideVersion ? 'versions' : 'warning' },
        { id: 'venv', label: 'Virtual environment', description: status.virtualEnvironment || 'not configured', icon: 'folder-library' },
        { id: 'projectFile', label: 'PySide project', description: status.projectFile || 'pyproject.toml', icon: 'json' },
        { id: 'projectTool', label: 'pyside6-project', description: status.tools.project || 'not found', icon: status.tools.project ? 'tools' : 'warning' },
        { id: 'designer', label: 'Designer', description: status.tools.designer || 'not found', icon: status.tools.designer ? 'layout' : 'warning' },
        { id: 'bootstrap', label: 'Prepare Python environment', description: 'Create venv / verify PySide6', icon: 'rocket', command: 'qpm.python.bootstrap' },
        { id: 'selectPython', label: 'Select Python interpreter', description: 'Choose Python 3.10+', icon: 'folder-opened', command: 'qpm.python.selectInterpreter' },
        { id: 'venvCreate', label: 'Create virtual environment', description: 'python -m venv', icon: 'new-folder', command: 'qpm.python.createVirtualEnvironment' },
        { id: 'install', label: 'Install / update PySide6', description: 'Install in selected environment', icon: 'cloud-download', command: 'qpm.python.installPySide6' },
        { id: 'build', label: 'Build Python project', description: 'pyside6-project build', icon: 'tools', command: 'qpm.python.build' },
        { id: 'run', label: 'Run Python project', description: 'Build if needed and launch main.py', icon: 'play', command: 'qpm.python.run' },
        { id: 'debug', label: 'Debug Python project', description: 'VS Code debugpy', icon: 'debug-alt', command: 'qpm.python.debug' },
        { id: 'clean', label: 'Clean Python project', description: 'pyside6-project clean', icon: 'trash', command: 'qpm.python.clean' },
        { id: 'uic', label: 'Generate Python UI files', description: 'pyside6-uic', icon: 'layout', command: 'qpm.python.compileUi' },
        { id: 'rcc', label: 'Generate Python resources', description: 'pyside6-rcc', icon: 'package', command: 'qpm.python.compileResources' },
        { id: 'designerOpen', label: 'Open PySide6 Designer', description: 'pyside6-designer', icon: 'preview', command: 'qpm.python.openDesigner' },
        { id: 'deploy', label: 'Deploy desktop application', description: 'pyside6-project deploy', icon: 'package', command: 'qpm.python.deploy' },
        { id: 'androidDeploy', label: 'Deploy Android application', description: 'pyside6-android-deploy', icon: 'device-mobile', command: 'qpm.python.deployAndroid' },
        { id: 'report', label: 'Open Qt for Python report', description: 'Environment and tools', icon: 'report', command: 'qpm.python.openReport' },
        { id: 'reveal', label: 'Reveal Python environment', description: 'Open venv / project directory', icon: 'folder-opened', command: 'qpm.python.revealEnvironment' }
    ];
}
