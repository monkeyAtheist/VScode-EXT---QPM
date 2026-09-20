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
    getSelectedFile() {
        return this.selectedFile;
    }
    async currentSymbols() {
        return this.selectedFile ? this.symbols.symbolsForFile(this.selectedFile) : [];
    }
    async reveal(symbol) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(symbol.filePath));
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const position = new vscode.Position(symbol.line, symbol.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
    async copySymbol(symbol) {
        if (!symbol || 'label' in symbol)
            return;
        await vscode.env.clipboard.writeText(symbol.signature);
        void vscode.window.setStatusBarMessage(`QPM: copied ${symbol.qualifiedName || symbol.name}`, 1800);
    }
    async copySymbolDeclaration(symbol) {
        if (!symbol || 'label' in symbol)
            return;
        const declaration = symbol.declaration || (0, qpmSymbolService_1.normalizeSourceSymbolDeclaration)(symbol.signature);
        await vscode.env.clipboard.writeText(declaration);
        void vscode.window.setStatusBarMessage(`QPM: copied declaration for ${symbol.qualifiedName || symbol.name}`, 1800);
    }
    async copyAllSymbols(asDeclarations = false) {
        if (!this.selectedFile) {
            void vscode.window.showWarningMessage('Select a C/C++ or Qt source/header file first.');
            return;
        }
        const symbols = await this.currentSymbols();
        if (!symbols.length) {
            void vscode.window.showWarningMessage('No function/method symbol was detected in the selected file.');
            return;
        }
        const text = asDeclarations
            ? symbols.map((symbol) => symbol.declaration || (0, qpmSymbolService_1.normalizeSourceSymbolDeclaration)(symbol.signature)).join('\n') + '\n'
            : (0, qpmSymbolService_1.formatSourceSymbolList)(symbols, this.selectedFile, 'text');
        await vscode.env.clipboard.writeText(text);
        void vscode.window.showInformationMessage(`Copied ${symbols.length} Qt File Symbol${symbols.length === 1 ? '' : 's'} to the clipboard.`);
    }
    async exportSymbols() {
        if (!this.selectedFile) {
            void vscode.window.showWarningMessage('Select a C/C++ or Qt source/header file first.');
            return;
        }
        const symbols = await this.currentSymbols();
        if (!symbols.length) {
            void vscode.window.showWarningMessage('No function/method symbol was detected in the selected file.');
            return;
        }
        const choice = await vscode.window.showQuickPick([
            { label: 'Markdown report (.md)', value: 'markdown', extension: '.symbols.md' },
            { label: 'Plain text (.txt)', value: 'text', extension: '.symbols.txt' },
            { label: 'JSON (.json)', value: 'json', extension: '.symbols.json' }
        ], { title: 'Export Qt File Symbols' });
        if (!choice)
            return;
        const source = path.parse(this.selectedFile);
        const target = await vscode.window.showSaveDialog({
            title: 'Export Qt File Symbols',
            defaultUri: vscode.Uri.file(path.join(source.dir, `${source.name}${choice.extension}`)),
            filters: choice.value === 'markdown'
                ? { Markdown: ['md'] }
                : choice.value === 'json' ? { JSON: ['json'] } : { Text: ['txt'] }
        });
        if (!target)
            return;
        const content = (0, qpmSymbolService_1.formatSourceSymbolList)(symbols, this.selectedFile, choice.value);
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        const action = await vscode.window.showInformationMessage(`Exported ${symbols.length} symbol(s) to ${target.fsPath}.`, 'Open');
        if (action === 'Open') {
            const document = await vscode.workspace.openTextDocument(target);
            await vscode.window.showTextDocument(document, { preview: false });
        }
    }
    async generateHeader() {
        if (!this.selectedFile) {
            void vscode.window.showWarningMessage('Select a C/C++ or Qt source/header file first.');
            return;
        }
        const symbols = await this.currentSymbols();
        if (!symbols.length) {
            void vscode.window.showWarningMessage('No function/method symbol was detected in the selected file.');
            return;
        }
        const source = path.parse(this.selectedFile);
        const isCpp = ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'].includes(source.ext.toLowerCase());
        const headerExtension = isCpp ? '.hpp' : '.h';
        const target = await vscode.window.showSaveDialog({
            title: 'Generate Header From Qt File Symbols',
            defaultUri: vscode.Uri.file(path.join(source.dir, `${source.name}${headerExtension}`)),
            filters: isCpp ? { 'C++ Header': ['hpp', 'h'] } : { 'C Header': ['h'] }
        });
        if (!target)
            return;
        const content = (0, qpmSymbolService_1.buildHeaderFromSourceSymbols)(symbols, this.selectedFile);
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        const action = await vscode.window.showInformationMessage(`Generated header from ${symbols.length} detected symbol(s): ${target.fsPath}`, 'Open');
        if (action === 'Open') {
            const document = await vscode.workspace.openTextDocument(target);
            await vscode.window.showTextDocument(document, { preview: false });
        }
    }
    async generateSource() {
        if (!this.selectedFile) {
            void vscode.window.showWarningMessage('Select a C/C++ or Qt source/header file first.');
            return;
        }
        const symbols = await this.currentSymbols();
        if (!symbols.length) {
            void vscode.window.showWarningMessage('No function/method symbol was detected in the selected file.');
            return;
        }
        const source = path.parse(this.selectedFile);
        const selectedExt = source.ext.toLowerCase();
        const isC = selectedExt === '.c';
        const isHeader = ['.h', '.hh', '.hpp', '.hxx'].includes(selectedExt);
        const sourceExtension = isC ? '.c' : '.cpp';
        const defaultName = isHeader ? `${source.name}${sourceExtension}` : `${source.name}_generated${sourceExtension}`;
        const target = await vscode.window.showSaveDialog({
            title: 'Generate Source From Qt File Symbols',
            defaultUri: vscode.Uri.file(path.join(source.dir, defaultName)),
            filters: isC ? { 'C Source': ['c'] } : { 'C++ Source': ['cpp', 'cc', 'cxx'] }
        });
        if (!target)
            return;
        const content = (0, qpmSymbolService_1.buildSourceFromSourceSymbols)(symbols, this.selectedFile);
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        const action = await vscode.window.showInformationMessage(`Generated source stubs from ${symbols.length} detected symbol(s): ${target.fsPath}`, 'Open');
        if (action === 'Open') {
            const document = await vscode.workspace.openTextDocument(target);
            await vscode.window.showTextDocument(document, { preview: false });
        }
    }
    getTreeItem(node) {
        if ('label' in node) {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('info');
            return item;
        }
        const displayName = node.qualifiedName || node.name;
        const item = new vscode.TreeItem(displayName, vscode.TreeItemCollapsibleState.None);
        item.description = `L${node.line + 1}`;
        item.tooltip = `${node.signature}\n${node.filePath}:${node.line + 1}`;
        item.contextValue = 'qpmFileSymbol';
        item.iconPath = new vscode.ThemeIcon(node.kind === vscode.SymbolKind.Method
            ? 'symbol-method'
            : node.kind === vscode.SymbolKind.Constructor ? 'symbol-constructor' : 'symbol-function');
        item.command = { command: 'qpm.revealFileSymbol', title: 'Reveal Qt/C++ file symbol', arguments: [node] };
        return item;
    }
    async getChildren() {
        if (!this.selectedFile) {
            return [{ kind: 'placeholder', label: 'Select a Qt/C++ source or header file in the Qt Workspace.' }];
        }
        const symbols = await this.symbols.symbolsForFile(this.selectedFile);
        return symbols.length > 0 ? symbols : [{ kind: 'placeholder', label: 'No function or method declaration found in the selected file.' }];
    }
    updateDescription() {
        if (this.view) {
            this.view.description = this.selectedFile ? path.basename(this.selectedFile) : 'No file selected';
        }
    }
}
exports.QpmFileSymbolsProvider = QpmFileSymbolsProvider;
