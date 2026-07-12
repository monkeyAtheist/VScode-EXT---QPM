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
exports.QpmFileSymbolsProvider = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qpmSymbolService_1 = require("../services/qpmSymbolService");
class QpmFileSymbolsProvider {
    symbols;
    changeEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.changeEmitter.event;
    selectedFile;
    view;
    constructor(symbols) {
        this.symbols = symbols;
    }
    attachView(view) {
        this.view = view;
        this.updateDescription();
    }
    setSelectedFile(filePath) {
        const normalized = filePath && (0, qpmSymbolService_1.isSourceOrHeader)(filePath) ? path.normalize(filePath) : undefined;
        if (normalized === this.selectedFile) {
            return;
        }
        this.selectedFile = normalized;
        this.updateDescription();
        this.refresh();
    }
    refresh() {
        this.changeEmitter.fire();
    }
    async reveal(symbol) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(symbol.filePath));
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const position = new vscode.Position(symbol.line, symbol.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    getTreeItem(node) {
        if ('label' in node) {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('info');
            return item;
        }
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        item.description = `L${node.line + 1}`;
        item.tooltip = `${node.signature}\n${node.filePath}:${node.line + 1}`;
        item.iconPath = new vscode.ThemeIcon('symbol-function');
        item.command = { command: 'qpm.revealFileSymbol', title: 'Reveal Qt/C++ file symbol', arguments: [node] };
        return item;
    }
    async getChildren() {
        if (!this.selectedFile) {
            return [{ kind: 'placeholder', label: 'Select a Qt/C++ source or header file in the Qt Workspace.' }];
        }
        const symbols = await this.symbols.symbolsForFile(this.selectedFile);
        return symbols.length > 0 ? symbols : [{ kind: 'placeholder', label: 'No function found in the selected file.' }];
    }
    updateDescription() {
        if (this.view) {
            this.view.description = this.selectedFile ? path.basename(this.selectedFile) : 'No file selected';
        }
    }
}
exports.QpmFileSymbolsProvider = QpmFileSymbolsProvider;
