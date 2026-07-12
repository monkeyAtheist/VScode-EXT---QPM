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
exports.QtResourceEditorPanel = void 0;
exports.readQtResourceDocument = readQtResourceDocument;
exports.serializeQtResourceDocument = serializeQtResourceDocument;
exports.validateQtResourceDocument = validateQtResourceDocument;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class QtResourceEditorPanel {
    qrcPath;
    output;
    onSaved;
    onDisposed;
    panel;
    disposables = [];
    document;
    savedSnapshot;
    statusMessage = '';
    constructor(qrcPath, output, onSaved, onDisposed = () => undefined) {
        this.qrcPath = qrcPath;
        this.output = output;
        this.onSaved = onSaved;
        this.onDisposed = onDisposed;
        this.document = readQtResourceDocument(qrcPath);
        this.savedSnapshot = JSON.stringify(this.document);
        this.panel = vscode.window.createWebviewPanel('qpmQtResourceEditor', `Qt Resource Editor — ${path.basename(qrcPath)}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.iconPath = new vscode.ThemeIcon('package');
        this.disposables.push(this.panel.onDidDispose(() => { this.onDisposed(); this.dispose(); }), this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message)));
        this.render();
    }
    dispose() {
        while (this.disposables.length > 0)
            this.disposables.pop()?.dispose();
    }
    reveal() {
        this.panel.reveal(vscode.ViewColumn.Active, false);
    }
    async handleMessage(raw) {
        if (!raw || typeof raw !== 'object')
            return;
        const message = raw;
        if (message.document)
            this.document = normalizeResourceDocument(message.document);
        switch (message.type) {
            case 'save':
                await this.save();
                break;
            case 'addFiles':
                await this.addFiles(message.groupId);
                break;
            case 'openFile':
                await this.openResourceFile(message.source);
                break;
            case 'openXml':
                await vscode.window.showTextDocument(vscode.Uri.file(this.qrcPath), { preview: false });
                break;
            case 'validate':
                this.showValidation();
                break;
            case 'revert':
                this.document = readQtResourceDocument(this.qrcPath);
                this.savedSnapshot = JSON.stringify(this.document);
                this.statusMessage = 'Reloaded from disk.';
                this.render();
                break;
        }
    }
    async save() {
        const issues = validateQtResourceDocument(this.qrcPath, this.document);
        const errors = issues.filter((issue) => issue.severity === 'error');
        if (errors.length > 0) {
            const choice = await vscode.window.showWarningMessage(`The resource collection contains ${errors.length} error(s). Save anyway?`, { modal: true }, 'Save anyway');
            if (choice !== 'Save anyway') {
                this.statusMessage = 'Save cancelled because validation errors remain.';
                this.render();
                return;
            }
        }
        const config = vscode.workspace.getConfiguration('qpm');
        if (config.get('qrcCreateBackups', true) && fs.existsSync(this.qrcPath)) {
            const backupPath = `${this.qrcPath}.qpm-backup`;
            if (!fs.existsSync(backupPath))
                fs.copyFileSync(this.qrcPath, backupPath);
        }
        fs.mkdirSync(path.dirname(this.qrcPath), { recursive: true });
        fs.writeFileSync(this.qrcPath, serializeQtResourceDocument(this.document), 'utf8');
        this.savedSnapshot = JSON.stringify(this.document);
        this.statusMessage = issues.length > 0
            ? `Saved with ${issues.length} validation issue(s).`
            : 'Resource collection saved.';
        this.output.appendLine(`[Qt Resources] Saved ${this.qrcPath}.`);
        this.onSaved();
        this.render();
    }
    async addFiles(groupId) {
        const group = this.document.groups.find((entry) => entry.id === groupId) ?? this.document.groups[0];
        if (!group) {
            this.document.groups.push({ id: crypto.randomUUID(), prefix: '/', language: '', files: [] });
            return this.addFiles(this.document.groups[0].id);
        }
        const selected = await vscode.window.showOpenDialog({
            title: `Add files to Qt resource prefix ${group.prefix || '/'}`,
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            defaultUri: vscode.Uri.file(path.dirname(this.qrcPath)),
            filters: { 'Resource files': ['png', 'jpg', 'jpeg', 'svg', 'ico', 'qml', 'js', 'mjs', 'json', 'txt', 'qm', 'ttf', 'otf', 'wav', 'mp3', 'bin'], 'All files': ['*'] }
        });
        if (!selected?.length)
            return;
        const qrcDirectory = path.dirname(this.qrcPath);
        for (const uri of selected) {
            const relative = normalizeSlash(path.relative(qrcDirectory, uri.fsPath));
            if (!group.files.some((entry) => entry.source.toLowerCase() === relative.toLowerCase())) {
                group.files.push({ id: crypto.randomUUID(), source: relative, alias: '', empty: false });
            }
        }
        group.files.sort((a, b) => a.source.localeCompare(b.source));
        this.statusMessage = `${selected.length} file(s) added. Save to write the .qrc file.`;
        this.render();
    }
    async openResourceFile(source) {
        const trimmedSource = source?.trim();
        if (!trimmedSource) {
            vscode.window.showWarningMessage('This resource entry has no source file path.');
            return;
        }
        const qrcDirectory = path.dirname(this.qrcPath);
        const absolute = path.resolve(qrcDirectory, trimmedSource.replace(/[\/]+/g, path.sep));
        let stats;
        try {
            stats = fs.statSync(absolute);
        }
        catch {
            this.output.appendLine(`[Qt Resources] Unable to open missing resource file: ${absolute}`);
            vscode.window.showErrorMessage(`Resource file not found: ${absolute}`);
            return;
        }
        if (!stats.isFile()) {
            this.output.appendLine(`[Qt Resources] Resource entry is not a file: ${absolute}`);
            vscode.window.showErrorMessage(`The resource entry does not reference a file: ${absolute}`);
            return;
        }
        const uri = vscode.Uri.file(absolute);
        this.output.appendLine(`[Qt Resources] Opening ${absolute}.`);
        try {
            // vscode.open delegates to the registered default editor. This is required for
            // images and other binary resources, while showTextDocument only supports text.
            await vscode.commands.executeCommand('vscode.open', uri, { preview: true });
            this.statusMessage = `Opened ${path.basename(absolute)}.`;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.output.appendLine(`[Qt Resources] VS Code could not open ${absolute}: ${detail}`);
            const choice = await vscode.window.showErrorMessage(`Unable to open ${path.basename(absolute)} in VS Code: ${detail}`, 'Reveal in File Explorer', 'Open with system application');
            if (choice === 'Reveal in File Explorer') {
                await vscode.commands.executeCommand('revealFileInOS', uri);
            }
            else if (choice === 'Open with system application') {
                const opened = await vscode.env.openExternal(uri);
                if (!opened)
                    vscode.window.showErrorMessage(`The system application could not open: ${absolute}`);
            }
        }
    }
    showValidation() {
        const issues = validateQtResourceDocument(this.qrcPath, this.document);
        this.statusMessage = issues.length === 0
            ? 'Validation passed: all resource paths and aliases are consistent.'
            : issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`).join('\n');
        this.render();
    }
    render() {
        const webview = this.panel.webview;
        const nonce = crypto.randomBytes(16).toString('hex');
        const state = JSON.stringify(this.document).replace(/</g, '\\u003c');
        const dirty = JSON.stringify(this.document) !== this.savedSnapshot;
        const status = escapeHtml(this.statusMessage);
        webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Qt Resource Editor</title>
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:20px;line-height:1.45}h1{margin:0 0 4px}code,.path{font-family:var(--vscode-editor-font-family);color:var(--vscode-textPreformat-foreground)}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.toolbar button,.group button{border:0;padding:8px 12px;border-radius:3px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}.secondary{background:var(--vscode-button-secondaryBackground)!important;color:var(--vscode-button-secondaryForeground)!important}.danger{background:var(--vscode-inputValidation-errorBackground)!important}.group{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:14px;margin:14px 0;background:var(--vscode-sideBar-background)}.groupHead{display:grid;grid-template-columns:2fr 1fr auto auto;gap:10px;align-items:end}.field{display:flex;flex-direction:column;gap:4px}.field input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:7px}.files{width:100%;border-collapse:collapse;margin-top:14px}.files th,.files td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:7px}.files input[type=text]{width:95%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:5px}.status{white-space:pre-wrap;border-left:3px solid var(--vscode-focusBorder);padding:8px 12px;background:var(--vscode-textBlockQuote-background)}.empty{opacity:.7;padding:15px}.missing{color:var(--vscode-errorForeground)}.runtime{font-family:var(--vscode-editor-font-family);font-size:.9em;opacity:.85}.badge{padding:2px 6px;border-radius:8px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
</style></head><body>
<h1>Qt Resource Editor</h1><div class="path">${escapeHtml(this.qrcPath)}</div>
<div class="toolbar"><button id="addGroup">Add prefix</button><button id="addFilesTop">Add files</button><button id="save">Save${dirty ? ' *' : ''}</button><button id="validate" class="secondary">Validate</button><button id="openXml" class="secondary">Open XML</button><button id="revert" class="secondary">Reload from disk</button></div>
${status ? `<div class="status">${status}</div>` : ''}<div id="groups"></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let state=${state};
const groups=document.getElementById('groups');
function slash(value){return String(value??'').split(String.fromCharCode(92)).join('/');}
function trimLeadingSlashes(value){let result=slash(value);while(result.startsWith('/'))result=result.slice(1);return result;}
function trimOuterSlashes(value){let result=slash(value);while(result.startsWith('/'))result=result.slice(1);while(result.endsWith('/'))result=result.slice(0,-1);return result;}
function runtimePath(group,file){const raw=slash(group.prefix||'/');const prefix=raw==='/'?'':trimOuterSlashes(raw);const name=trimLeadingSlashes(file.alias||file.source);return ':/' + [prefix,name].filter(Boolean).join('/');}
function send(type,extra={}){vscode.postMessage(Object.assign({type,document:state},extra));}
function render(){groups.textContent='';if(!state.groups.length){const e=document.createElement('div');e.className='empty';e.textContent='No resource prefix. Use “Add prefix”.';groups.appendChild(e);return;}state.groups.forEach((group,gi)=>{const box=document.createElement('section');box.className='group';box.innerHTML='<div class="groupHead"><label class="field">Prefix<input class="prefix"></label><label class="field">Language<input class="language" placeholder="fr_FR"></label><button class="addFile">Add files</button><button class="removeGroup danger">Remove prefix</button></div><table class="files"><thead><tr><th>Source file</th><th>Alias</th><th>Empty</th><th>Runtime path</th><th></th></tr></thead><tbody></tbody></table>';
const prefix=box.querySelector('.prefix');prefix.value=group.prefix;prefix.oninput=e=>{group.prefix=e.target.value;renderRuntime(box,group)};const lang=box.querySelector('.language');lang.value=group.language;lang.oninput=e=>group.language=e.target.value;box.querySelector('.addFile').onclick=()=>send('addFiles',{groupId:group.id});box.querySelector('.removeGroup').onclick=()=>{if(confirm('Remove this resource prefix and all of its entries?')){state.groups.splice(gi,1);render();}};
const tbody=box.querySelector('tbody');if(!group.files.length){const emptyRow=document.createElement('tr');emptyRow.className='emptyRow';emptyRow.innerHTML='<td colspan="5" class="empty">No file in this prefix. Use “Add files”.</td>';tbody.appendChild(emptyRow);}group.files.forEach((file,fi)=>{const tr=document.createElement('tr');tr.dataset.fileIndex=String(fi);tr.innerHTML='<td><input class="source" type="text"></td><td><input class="alias" type="text" placeholder="optional"></td><td><input class="emptyFlag" type="checkbox"></td><td class="runtime"></td><td><button class="open secondary">Open</button> <button class="remove danger">Remove</button></td>';const src=tr.querySelector('.source');src.value=file.source;src.oninput=e=>{file.source=e.target.value;tr.querySelector('.runtime').textContent=runtimePath(group,file)};const alias=tr.querySelector('.alias');alias.value=file.alias;alias.oninput=e=>{file.alias=e.target.value;tr.querySelector('.runtime').textContent=runtimePath(group,file)};const empty=tr.querySelector('.emptyFlag');empty.checked=file.empty;empty.onchange=e=>file.empty=e.target.checked;tr.querySelector('.runtime').textContent=runtimePath(group,file);tr.querySelector('.open').onclick=()=>send('openFile',{source:file.source});tr.querySelector('.remove').onclick=()=>{group.files.splice(fi,1);render();};tbody.appendChild(tr)});groups.appendChild(box)});}
function renderRuntime(box,group){box.querySelectorAll('tbody tr[data-file-index]').forEach(tr=>{const i=Number(tr.dataset.fileIndex);const runtime=tr.querySelector('.runtime');if(runtime&&group.files[i])runtime.textContent=runtimePath(group,group.files[i]);});}
document.getElementById('addGroup').onclick=()=>{state.groups.push({id:cryptoId(),prefix:'/',language:'',files:[]});render();};document.getElementById('addFilesTop').onclick=()=>send('addFiles',{groupId:state.groups[0]?.id});document.getElementById('save').onclick=()=>send('save');document.getElementById('validate').onclick=()=>send('validate');document.getElementById('openXml').onclick=()=>send('openXml');document.getElementById('revert').onclick=()=>send('revert');function cryptoId(){return 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}render();
</script></body></html>`;
    }
}
exports.QtResourceEditorPanel = QtResourceEditorPanel;
function readQtResourceDocument(qrcPath) {
    if (!fs.existsSync(qrcPath))
        return { groups: [{ id: crypto.randomUUID(), prefix: '/', language: '', files: [] }] };
    const xml = fs.readFileSync(qrcPath, 'utf8');
    const groups = [];
    const groupPattern = /<qresource\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/qresource\s*>)/gi;
    let groupMatch;
    while ((groupMatch = groupPattern.exec(xml)) !== null) {
        const attributes = parseXmlAttributes(groupMatch[1]);
        const files = [];
        const filePattern = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi;
        let fileMatch;
        while ((fileMatch = filePattern.exec(groupMatch[2] ?? '')) !== null) {
            const fileAttributes = parseXmlAttributes(fileMatch[1]);
            files.push({
                id: crypto.randomUUID(),
                source: decodeXml(fileMatch[2].trim()),
                alias: fileAttributes.alias ?? '',
                empty: (fileAttributes.empty ?? '').toLowerCase() === 'true'
            });
        }
        groups.push({
            id: crypto.randomUUID(),
            prefix: attributes.prefix || '/',
            language: attributes.lang || '',
            files
        });
    }
    return { groups: groups.length > 0 ? groups : [{ id: crypto.randomUUID(), prefix: '/', language: '', files: [] }] };
}
function serializeQtResourceDocument(document) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<RCC>'];
    for (const group of document.groups) {
        const attributes = [`prefix="${encodeXmlAttribute(normalizePrefix(group.prefix))}"`];
        if (group.language.trim())
            attributes.push(`lang="${encodeXmlAttribute(group.language.trim())}"`);
        lines.push(`  <qresource ${attributes.join(' ')}>`);
        for (const file of group.files) {
            const fileAttributes = [];
            if (file.alias.trim())
                fileAttributes.push(`alias="${encodeXmlAttribute(normalizeSlash(file.alias.trim()))}"`);
            if (file.empty)
                fileAttributes.push('empty="true"');
            lines.push(`    <file${fileAttributes.length ? ` ${fileAttributes.join(' ')}` : ''}>${encodeXmlText(normalizeSlash(file.source.trim()))}</file>`);
        }
        lines.push('  </qresource>');
    }
    lines.push('</RCC>', '');
    return lines.join('\n');
}
function validateQtResourceDocument(qrcPath, document) {
    const issues = [];
    const qrcDirectory = path.dirname(qrcPath);
    const runtimeKeys = new Map();
    for (const group of document.groups) {
        const prefix = normalizePrefix(group.prefix);
        if (prefix === '/qt' || prefix.startsWith('/qt/') || prefix === '/qt-project.org' || prefix.startsWith('/qt-project.org/')) {
            issues.push({ severity: 'warning', message: `Prefix ${prefix} is reserved by Qt.`, groupId: group.id });
        }
        for (const file of group.files) {
            if (!file.source.trim()) {
                issues.push({ severity: 'error', message: `An entry under ${prefix} has no source path.`, groupId: group.id, fileId: file.id });
                continue;
            }
            const absolute = path.resolve(qrcDirectory, file.source);
            if (!fs.existsSync(absolute))
                issues.push({ severity: 'error', message: `Missing resource file: ${file.source}`, groupId: group.id, fileId: file.id });
            const resourceName = normalizeSlash((file.alias || file.source).replace(/^\/+/, ''));
            const runtimeKey = `${group.language.toLowerCase()}|${prefix.toLowerCase()}|${resourceName.toLowerCase()}`;
            const previous = runtimeKeys.get(runtimeKey);
            if (previous)
                issues.push({ severity: 'error', message: `Duplicate runtime resource path: ${resourceRuntimePath(prefix, resourceName)}`, groupId: group.id, fileId: file.id });
            else
                runtimeKeys.set(runtimeKey, file);
        }
    }
    return issues;
}
function normalizeResourceDocument(value) {
    const groups = Array.isArray(value?.groups) ? value.groups : [];
    return {
        groups: groups.map((group) => ({
            id: typeof group.id === 'string' && group.id ? group.id : crypto.randomUUID(),
            prefix: typeof group.prefix === 'string' ? group.prefix : '/',
            language: typeof group.language === 'string' ? group.language : '',
            files: Array.isArray(group.files) ? group.files.map((file) => ({
                id: typeof file.id === 'string' && file.id ? file.id : crypto.randomUUID(),
                source: typeof file.source === 'string' ? file.source : '',
                alias: typeof file.alias === 'string' ? file.alias : '',
                empty: file.empty === true
            })) : []
        }))
    };
}
function parseXmlAttributes(source) {
    const result = {};
    const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = pattern.exec(source)) !== null)
        result[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
    return result;
}
function resourceRuntimePath(prefix, resourceName) {
    const normalizedPrefix = normalizePrefix(prefix);
    const cleanPrefix = normalizedPrefix === '/' ? '' : normalizedPrefix.replace(/^\/+|\/+$/g, '');
    const cleanName = resourceName.replace(/^\/+/, '');
    return `:/${[cleanPrefix, cleanName].filter(Boolean).join('/')}`;
}
function normalizePrefix(value) {
    const trimmed = normalizeSlash(value.trim() || '/');
    const prefixed = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return prefixed.length > 1 ? prefixed.replace(/\/+$/g, '') : '/';
}
function normalizeSlash(value) { return value.replace(/\\/g, '/'); }
function decodeXml(value) { return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function encodeXmlText(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function encodeXmlAttribute(value) { return encodeXmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function escapeHtml(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
