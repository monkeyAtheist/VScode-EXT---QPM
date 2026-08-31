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
exports.QpmInstrumentProfileService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qtInstrumentProfileEditorPanel_1 = require("../views/qtInstrumentProfileEditorPanel");
class QpmInstrumentProfileService {
    workspaces;
    output;
    panels = new Map();
    catalogPath;
    constructor(extensionPath, workspaces, output) {
        this.workspaces = workspaces;
        this.output = output;
        this.catalogPath = path.join(extensionPath, 'data', 'qt_instrument_profile_catalog.json');
    }
    dispose() {
        for (const panel of this.panels.values())
            panel.dispose();
        this.panels.clear();
    }
    async openEditor(target) {
        const root = this.requireNativeQtProjectRoot();
        const targetPath = this.resolveProfileTarget(target, root);
        const key = targetPath ? normalizeKey(targetPath) : `${normalizeKey(root)}::catalog`;
        const existing = this.panels.get(key);
        if (existing) {
            existing.reveal();
            if (targetPath)
                await existing.loadFile(targetPath);
            return;
        }
        const catalog = (0, qtInstrumentProfileEditorPanel_1.readQtInstrumentProfileCatalog)(this.catalogPath);
        const panel = new qtInstrumentProfileEditorPanel_1.QtInstrumentProfileEditorPanel(targetPath, root, catalog, this.output, () => this.workspaces.refresh(), () => this.panels.delete(key));
        this.panels.set(key, panel);
    }
    async newFromCatalog() {
        await this.openEditor();
    }
    async openProfileFile(target) {
        const root = this.requireNativeQtProjectRoot();
        const targetPath = this.resolveProfileTarget(target, root);
        if (targetPath) {
            await this.openEditor(targetPath);
            return;
        }
        const profileDirectory = path.join(root, 'instrument_profiles');
        const selected = await vscode.window.showOpenDialog({
            title: 'Open SCPI instrument profile',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(fs.existsSync(profileDirectory) ? profileDirectory : root),
            filters: { 'SCPI instrument profile': ['json'] }
        });
        if (selected?.[0])
            await this.openEditor(selected[0].fsPath);
    }
    requireNativeQtProjectRoot() {
        const ref = this.workspaces.activeProjectRef;
        if (!ref?.exists || !(0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath)) {
            throw new Error('Open a native .qtproject.json project before editing SCPI instrument profiles.');
        }
        return path.dirname(ref.absolutePath);
    }
    resolveProfileTarget(target, projectRoot) {
        const candidates = [];
        if (typeof target === 'string')
            candidates.push(target);
        if (target instanceof vscode.Uri)
            candidates.push(target.fsPath);
        if (target && typeof target === 'object') {
            const value = target;
            if (value.fsPath)
                candidates.push(value.fsPath);
            if (value.absolutePath)
                candidates.push(value.absolutePath);
            if (value.uri?.fsPath)
                candidates.push(value.uri.fsPath);
            if (value.file?.absolutePath)
                candidates.push(value.file.absolutePath);
        }
        const active = vscode.window.activeTextEditor?.document.uri;
        if (active?.scheme === 'file')
            candidates.push(active.fsPath);
        for (const candidate of candidates) {
            const absolute = path.resolve(candidate);
            if (!absolute.toLowerCase().endsWith('.json'))
                continue;
            if (!fs.existsSync(absolute))
                continue;
            if (!isUnderProfileDirectory(absolute, projectRoot))
                continue;
            return absolute;
        }
        return undefined;
    }
}
exports.QpmInstrumentProfileService = QpmInstrumentProfileService;
function isUnderProfileDirectory(filePath, projectRoot) {
    const profileDirectory = normalizeKey(path.join(projectRoot, 'instrument_profiles'));
    const normalized = normalizeKey(filePath);
    return normalized === profileDirectory || normalized.startsWith(`${profileDirectory}${path.sep}`.toLowerCase());
}
function normalizeKey(value) {
    return path.resolve(value).toLowerCase();
}
