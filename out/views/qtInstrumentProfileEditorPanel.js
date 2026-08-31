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
exports.QtInstrumentProfileEditorPanel = void 0;
exports.createBlankInstrumentProfile = createBlankInstrumentProfile;
exports.normalizeQtInstrumentProfile = normalizeQtInstrumentProfile;
exports.readQtInstrumentProfile = readQtInstrumentProfile;
exports.serializeQtInstrumentProfile = serializeQtInstrumentProfile;
exports.validateQtInstrumentProfile = validateQtInstrumentProfile;
exports.readQtInstrumentProfileCatalog = readQtInstrumentProfileCatalog;
exports.parseScpiIdentity = parseScpiIdentity;
exports.matchScpiIdentityToCatalog = matchScpiIdentityToCatalog;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class QtInstrumentProfileEditorPanel {
    projectRoot;
    catalog;
    output;
    onSaved;
    onDisposed;
    panel;
    disposables = [];
    document;
    savedSnapshot;
    profilePath;
    statusMessage = '';
    constructor(initialProfilePath, projectRoot, catalog, output, onSaved, onDisposed = () => undefined) {
        this.projectRoot = projectRoot;
        this.catalog = catalog;
        this.output = output;
        this.onSaved = onSaved;
        this.onDisposed = onDisposed;
        this.profilePath = initialProfilePath && fs.existsSync(initialProfilePath) ? path.resolve(initialProfilePath) : undefined;
        this.document = this.profilePath ? readQtInstrumentProfile(this.profilePath) : createBlankInstrumentProfile();
        this.savedSnapshot = JSON.stringify(this.document);
        this.panel = vscode.window.createWebviewPanel('qpmQtInstrumentProfileEditor', this.panelTitle(), vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        this.panel.iconPath = new vscode.ThemeIcon('radio-tower');
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
    async loadFile(filePath) {
        const absolute = path.resolve(filePath);
        this.document = readQtInstrumentProfile(absolute);
        this.profilePath = absolute;
        this.savedSnapshot = JSON.stringify(this.document);
        this.statusMessage = `Loaded ${path.basename(absolute)}.`;
        this.panel.title = this.panelTitle();
        this.render();
    }
    panelTitle() {
        return this.profilePath
            ? `SCPI Profile Editor — ${path.basename(this.profilePath)}`
            : 'SCPI Instrument Profile Catalog & Editor';
    }
    async handleMessage(raw) {
        if (!raw || typeof raw !== 'object')
            return;
        const message = raw;
        if (message.document)
            this.document = normalizeQtInstrumentProfile(message.document);
        switch (message.type) {
            case 'save':
                await this.save(false);
                break;
            case 'saveAs':
                await this.save(true);
                break;
            case 'openProfile':
                await this.openProfileDialog();
                break;
            case 'openJson':
                if (this.profilePath)
                    await vscode.window.showTextDocument(vscode.Uri.file(this.profilePath), { preview: false });
                else
                    await this.save(true, true);
                break;
            case 'newProfile':
                await this.newProfile();
                break;
            case 'loadCatalog':
                this.loadCatalogEntry(message.catalogId);
                break;
            case 'validate':
                this.showValidation();
                break;
            case 'reload':
                this.reloadFromDisk();
                break;
            case 'revealDirectory':
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.profilePath ? path.dirname(this.profilePath) : this.profileDirectory()));
                break;
            case 'openDocumentation':
                await this.openDocumentation(message.documentationUrl);
                break;
        }
    }
    async save(forceSaveAs, openAfter = false) {
        const issues = validateQtInstrumentProfile(this.document);
        const errors = issues.filter((issue) => issue.severity === 'error');
        if (errors.length > 0) {
            const choice = await vscode.window.showWarningMessage(`The instrument profile contains ${errors.length} error(s). Save anyway?`, { modal: true }, 'Save anyway');
            if (choice !== 'Save anyway') {
                this.statusMessage = 'Save cancelled because validation errors remain.';
                this.render();
                return;
            }
        }
        let target = this.profilePath;
        if (!target || forceSaveAs) {
            const suggestedName = sanitizeProfileFileName(this.document.id || this.document.displayName || 'instrument-profile');
            const selected = await vscode.window.showSaveDialog({
                title: 'Save SCPI instrument profile',
                defaultUri: vscode.Uri.file(path.join(this.profileDirectory(), `${suggestedName}.json`)),
                filters: { 'SCPI instrument profile': ['json'] }
            });
            if (!selected)
                return;
            target = ensureJsonExtension(selected.fsPath);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (fs.existsSync(target)) {
            const backup = `${target}.qpm-backup`;
            if (!fs.existsSync(backup))
                fs.copyFileSync(target, backup);
        }
        fs.writeFileSync(target, serializeQtInstrumentProfile(this.document), 'utf8');
        this.profilePath = target;
        this.savedSnapshot = JSON.stringify(this.document);
        this.statusMessage = issues.length > 0
            ? `Saved with ${issues.length} validation issue(s).`
            : 'Instrument profile saved.';
        this.panel.title = this.panelTitle();
        this.output.appendLine(`[SCPI Profiles] Saved ${target}.`);
        this.onSaved();
        this.render();
        if (openAfter)
            await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false });
    }
    async openProfileDialog() {
        const selected = await vscode.window.showOpenDialog({
            title: 'Open SCPI instrument profile',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(this.profileDirectory()),
            filters: { 'SCPI instrument profile': ['json'] }
        });
        if (!selected?.[0])
            return;
        try {
            await this.loadFile(selected[0].fsPath);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Unable to open instrument profile: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async newProfile() {
        if (JSON.stringify(this.document) !== this.savedSnapshot) {
            const choice = await vscode.window.showWarningMessage('The current instrument profile has unsaved changes.', { modal: true }, 'Discard changes');
            if (choice !== 'Discard changes')
                return;
        }
        this.profilePath = undefined;
        this.document = createBlankInstrumentProfile();
        this.savedSnapshot = JSON.stringify(this.document);
        this.statusMessage = 'New blank profile.';
        this.panel.title = this.panelTitle();
        this.render();
    }
    loadCatalogEntry(catalogId) {
        const entry = this.catalog.find((candidate) => candidate.catalogId === catalogId);
        if (!entry)
            return;
        const cloned = normalizeQtInstrumentProfile(JSON.parse(JSON.stringify(entry.profile)));
        // A catalog item is a template: its first save must be explicit and cannot silently overwrite the prior file.
        this.profilePath = undefined;
        this.document = cloned;
        this.savedSnapshot = '';
        this.statusMessage = `${entry.profile.displayName} loaded from the ${entry.status} catalog. Review the SCPI commands before use.`;
        this.panel.title = this.panelTitle();
        this.render();
    }
    showValidation() {
        const issues = validateQtInstrumentProfile(this.document);
        this.statusMessage = issues.length === 0
            ? 'Validation passed: metadata, action IDs and SCPI command mappings are structurally consistent.'
            : issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.message}`).join('\n');
        this.render();
    }
    reloadFromDisk() {
        if (!this.profilePath || !fs.existsSync(this.profilePath)) {
            this.statusMessage = 'This profile has not been saved yet.';
            this.render();
            return;
        }
        try {
            this.document = readQtInstrumentProfile(this.profilePath);
            this.savedSnapshot = JSON.stringify(this.document);
            this.statusMessage = 'Reloaded from disk.';
            this.render();
        }
        catch (error) {
            this.statusMessage = `Unable to reload profile: ${error instanceof Error ? error.message : String(error)}`;
            this.render();
        }
    }
    async openDocumentation(rawUrl) {
        const value = rawUrl?.trim();
        if (!value) {
            vscode.window.showInformationMessage('No documentation URL is configured for this profile.');
            return;
        }
        let uri;
        try {
            uri = /^[a-z][a-z0-9+.-]*:/i.test(value) ? vscode.Uri.parse(value) : vscode.Uri.file(path.resolve(this.projectRoot, value));
        }
        catch {
            vscode.window.showErrorMessage('The documentation URL is invalid.');
            return;
        }
        await vscode.env.openExternal(uri);
    }
    profileDirectory() {
        return path.join(this.projectRoot, 'instrument_profiles');
    }
    render() {
        const webview = this.panel.webview;
        const nonce = crypto.randomBytes(16).toString('hex');
        const state = JSON.stringify(this.document).replace(/</g, '\\u003c');
        const catalog = JSON.stringify(this.catalog).replace(/</g, '\\u003c');
        const dirty = JSON.stringify(this.document) !== this.savedSnapshot;
        const status = escapeHtml(this.statusMessage);
        const fileLabel = this.profilePath ? this.profilePath : 'Unsaved profile — choose Save or Save As';
        webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>SCPI Instrument Profile Editor</title>
<style>
:root{--gap:12px}*{box-sizing:border-box}body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px;margin:0;line-height:1.4}h1,h2,h3{margin-top:0}.header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.path{font-family:var(--vscode-editor-font-family);font-size:.9em;opacity:.82;word-break:break-all}.toolbar{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.toolbar button,.button{border:0;border-radius:3px;padding:7px 11px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.secondary{background:var(--vscode-button-secondaryBackground)!important;color:var(--vscode-button-secondaryForeground)!important}.danger{background:var(--vscode-inputValidation-errorBackground)!important;color:var(--vscode-errorForeground)!important;border:1px solid var(--vscode-inputValidation-errorBorder)!important}.layout{display:grid;grid-template-columns:minmax(250px,330px) minmax(600px,1fr);gap:16px;align-items:start}.panel{border:1px solid var(--vscode-panel-border);border-radius:6px;background:var(--vscode-sideBar-background);padding:14px}.catalog{position:sticky;top:12px;max-height:calc(100vh - 50px);overflow:auto}.catalogFilters{display:grid;gap:8px;margin-bottom:10px}.catalogList{display:grid;gap:8px}.catalogCard{padding:10px;border:1px solid var(--vscode-panel-border);border-radius:5px;background:var(--vscode-editor-background)}.catalogCard h3{font-size:1em;margin:0 0 3px}.meta{opacity:.8;font-size:.88em}.catalogNotes{font-size:.88em;margin:7px 0;opacity:.88}.badge{display:inline-block;padding:1px 6px;border-radius:9px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:.8em}.formGrid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:10px}.field{display:flex;flex-direction:column;gap:4px}.field.wide{grid-column:1/-1}input,select,textarea{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:6px 7px;border-radius:2px}textarea{min-height:72px;resize:vertical}.actionsWrap{overflow:auto;margin-top:12px}.actions{width:100%;border-collapse:collapse;min-width:1230px}.actions th,.actions td{padding:5px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle;text-align:left}.actions th{position:sticky;top:0;background:var(--vscode-sideBar-background);z-index:1}.actions input,.actions select{min-width:80px}.actions .cmd{min-width:150px;font-family:var(--vscode-editor-font-family)}.actions .small{min-width:72px;width:84px}.rowButtons{display:flex;gap:4px}.status{white-space:pre-wrap;border-left:3px solid var(--vscode-focusBorder);padding:8px 12px;background:var(--vscode-textBlockQuote-background);margin:10px 0}.preview{margin-top:14px}.previewGrid{display:grid;gap:7px}.previewRow{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1.4fr);gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border)}.previewControl{display:flex;gap:6px;align-items:center}.previewValue{font-family:var(--vscode-editor-font-family);padding:5px 7px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);min-height:29px;flex:1}.hint{opacity:.75;font-size:.88em}.empty{opacity:.7;padding:8px 0}@media(max-width:1000px){.layout{grid-template-columns:1fr}.catalog{position:static;max-height:none}.formGrid{grid-template-columns:1fr}.field.wide{grid-column:auto}}
</style></head><body>
<div class="header"><div><h1>SCPI Instrument Profile Catalog & Editor</h1><div class="path">${escapeHtml(fileLabel)}</div></div><span class="badge">QPM 0.28.0</span></div>
<div class="toolbar"><button id="newProfile">New</button><button id="openProfile" class="secondary">Open profile...</button><button id="save">Save${dirty ? ' *' : ''}</button><button id="saveAs" class="secondary">Save As...</button><button id="validate" class="secondary">Validate</button><button id="openJson" class="secondary">Open JSON</button><button id="reload" class="secondary">Reload</button><button id="revealDirectory" class="secondary">Reveal profiles folder</button></div>
${status ? `<div class="status">${status}</div>` : ''}
<div class="layout">
<aside class="panel catalog"><h2>Profile catalog</h2><div class="hint">Bundled entries marked <b>starter</b> are editable baselines, not verified vendor drivers.</div><div class="catalogFilters"><input id="catalogSearch" placeholder="Search manufacturer, model, family..."><select id="catalogFamily"><option value="">All families</option><option value="dmm">DMM</option><option value="power-supply">Power supply</option><option value="signal-generator">Signal generator</option><option value="oscilloscope">Oscilloscope</option><option value="generic">Generic</option></select></div><div class="panel" style="padding:10px;margin:10px 0"><b>*IDN? matcher</b><div class="hint">Paste an instrument identity to rank catalogue profiles. Matching uses manufacturer/model metadata; it never applies a profile automatically.</div><input id="idnTest" placeholder="KEYSIGHT TECHNOLOGIES,34461A,MY...,A.03.00" style="margin-top:7px"><div id="idnMatches" class="hint" style="margin-top:7px"></div></div><div id="catalogList" class="catalogList"></div></aside>
<main>
<section class="panel"><h2>Profile metadata</h2><div class="formGrid">
<label class="field">Profile ID<input id="profileId" placeholder="keysight-34461a"></label>
<label class="field">Display name<input id="displayName"></label>
<label class="field">Family<select id="family"><option value="generic">Generic</option><option value="dmm">Digital multimeter</option><option value="power-supply">Power supply</option><option value="signal-generator">Signal generator</option><option value="oscilloscope">Oscilloscope</option></select></label>
<label class="field">Manufacturer<input id="manufacturer" placeholder="Keysight"></label>
<label class="field">Model<input id="model" placeholder="34461A"></label>
<label class="field">Documentation URL<input id="documentationUrl" placeholder="https://... or project-relative path"></label>
<label class="field wide">Description<textarea id="description"></textarea></label>
</div><div class="toolbar"><button id="openDocumentation" class="secondary">Open documentation</button></div></section>
<section class="panel" style="margin-top:16px"><div class="header"><div><h2>SCPI actions</h2><div class="hint">Use <code>%1</code> in numeric/toggle write templates where the runtime value must be inserted.</div></div><button id="addAction">Add action</button></div><div class="actionsWrap"><table class="actions"><thead><tr><th>ID</th><th>Label</th><th>Kind</th><th>Query</th><th>Write template</th><th>Unit</th><th>Min</th><th>Max</th><th>Decimals</th><th>Default</th><th>Readback</th><th></th></tr></thead><tbody id="actionRows"></tbody></table></div></section>
<section class="panel" style="margin-top:16px"><div class="header"><div><h2>Instrument capabilities</h2><div class="hint">Capabilities describe what the driver can do independently of vendor/model. Link each capability to one or more SCPI action IDs, separated by commas.</div></div><button id="addCapability">Add capability</button></div><div class="actionsWrap"><table class="actions" style="min-width:760px"><thead><tr><th>Capability ID</th><th>Label</th><th>Category</th><th>Action IDs</th><th></th></tr></thead><tbody id="capabilityRows"></tbody></table></div></section>
<section class="panel preview"><h2>Auto-control preview</h2><div class="hint">This preview mirrors the control kind generated by <code>ProfiledInstrumentControl</code>; it does not connect to an instrument.</div><div id="previewGrid" class="previewGrid"></div></section>
</main></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let state=${state};const catalog=${catalog};
const byId=id=>document.getElementById(id);const clone=value=>JSON.parse(JSON.stringify(value));
function send(type,extra={}){syncMetadata();syncRows();syncCapabilities();vscode.postMessage(Object.assign({type,document:state},extra));}
function numberValue(raw,fallback){const value=Number(raw);return Number.isFinite(value)?value:fallback;}
function syncMetadata(){state.schemaVersion=1;state.id=byId('profileId').value.trim();state.displayName=byId('displayName').value.trim();state.family=byId('family').value;state.manufacturer=byId('manufacturer').value.trim();state.model=byId('model').value.trim();state.documentationUrl=byId('documentationUrl').value.trim();state.description=byId('description').value;}
function fillMetadata(){byId('profileId').value=state.id||'';byId('displayName').value=state.displayName||'';byId('family').value=state.family||'generic';byId('manufacturer').value=state.manufacturer||'';byId('model').value=state.model||'';byId('documentationUrl').value=state.documentationUrl||'';byId('description').value=state.description||'';}
function defaultAction(){return{id:'new-action',label:'New action',kind:'measurement',query:'',write:'',unit:'',minimum:-1e12,maximum:1e12,decimals:6,defaultValue:0,readback:true};}
function syncRows(){document.querySelectorAll('tr[data-action-index]').forEach(row=>{const i=Number(row.dataset.actionIndex);const a=state.actions[i];if(!a)return;a.id=row.querySelector('.a-id').value.trim();a.label=row.querySelector('.a-label').value.trim();a.kind=row.querySelector('.a-kind').value;a.query=row.querySelector('.a-query').value;a.write=row.querySelector('.a-write').value;a.unit=row.querySelector('.a-unit').value;a.minimum=numberValue(row.querySelector('.a-min').value,-1e12);a.maximum=numberValue(row.querySelector('.a-max').value,1e12);a.decimals=Math.max(0,Math.min(15,Math.trunc(numberValue(row.querySelector('.a-dec').value,6))));a.defaultValue=numberValue(row.querySelector('.a-default').value,0);a.readback=row.querySelector('.a-readback').checked;});}
function renderRows(){const body=byId('actionRows');body.textContent='';if(!state.actions.length){const row=document.createElement('tr');row.innerHTML='<td colspan="12" class="empty">No action. Use “Add action”.</td>';body.appendChild(row);}state.actions.forEach((a,i)=>{const row=document.createElement('tr');row.dataset.actionIndex=String(i);row.innerHTML='<td><input class="a-id"></td><td><input class="a-label"></td><td><select class="a-kind"><option value="measurement">Measurement</option><option value="numeric">Numeric</option><option value="toggle">Toggle</option><option value="action">Action</option></select></td><td><input class="a-query cmd"></td><td><input class="a-write cmd"></td><td><input class="a-unit small"></td><td><input class="a-min small" type="number"></td><td><input class="a-max small" type="number"></td><td><input class="a-dec small" type="number" min="0" max="15"></td><td><input class="a-default small" type="number"></td><td><input class="a-readback" type="checkbox"></td><td><div class="rowButtons"><button class="up secondary">↑</button><button class="down secondary">↓</button><button class="remove danger">×</button></div></td>';
const set=(sel,val)=>row.querySelector(sel).value=String(val??'');set('.a-id',a.id);set('.a-label',a.label);set('.a-kind',a.kind);set('.a-query',a.query);set('.a-write',a.write);set('.a-unit',a.unit);set('.a-min',a.minimum);set('.a-max',a.maximum);set('.a-dec',a.decimals);set('.a-default',a.defaultValue);row.querySelector('.a-readback').checked=!!a.readback;row.querySelector('.up').onclick=()=>{syncRows();if(i>0){[state.actions[i-1],state.actions[i]]=[state.actions[i],state.actions[i-1]];renderRows();renderPreview();}};row.querySelector('.down').onclick=()=>{syncRows();if(i+1<state.actions.length){[state.actions[i+1],state.actions[i]]=[state.actions[i],state.actions[i+1]];renderRows();renderPreview();}};row.querySelector('.remove').onclick=()=>{syncRows();state.actions.splice(i,1);renderRows();renderPreview();};row.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',()=>{syncRows();renderPreview();});el.addEventListener('change',()=>{syncRows();renderPreview();});});body.appendChild(row);});}
function defaultCapability(){return{id:'custom.capability',label:'Custom capability',category:'general',actionIds:[]};}
function syncCapabilities(){document.querySelectorAll('tr[data-capability-index]').forEach(row=>{const i=Number(row.dataset.capabilityIndex);const c=state.capabilities[i];if(!c)return;c.id=row.querySelector('.c-id').value.trim();c.label=row.querySelector('.c-label').value.trim();c.category=row.querySelector('.c-category').value.trim();c.actionIds=row.querySelector('.c-actions').value.split(',').map(v=>v.trim()).filter(Boolean);});}
function renderCapabilities(){if(!Array.isArray(state.capabilities))state.capabilities=[];const body=byId('capabilityRows');body.textContent='';if(!state.capabilities.length){const row=document.createElement('tr');row.innerHTML='<td colspan="5" class="empty">No capability. Add capabilities to expose model-independent driver functions.</td>';body.appendChild(row);}state.capabilities.forEach((c,i)=>{const row=document.createElement('tr');row.dataset.capabilityIndex=String(i);row.innerHTML='<td><input class="c-id cmd"></td><td><input class="c-label"></td><td><input class="c-category"></td><td><input class="c-actions cmd" placeholder="action-id, other-action"></td><td><div class="rowButtons"><button class="up secondary">↑</button><button class="down secondary">↓</button><button class="remove danger">×</button></div></td>';const set=(sel,val)=>row.querySelector(sel).value=String(val??'');set('.c-id',c.id);set('.c-label',c.label);set('.c-category',c.category);set('.c-actions',(c.actionIds||[]).join(', '));row.querySelector('.up').onclick=()=>{syncCapabilities();if(i>0){[state.capabilities[i-1],state.capabilities[i]]=[state.capabilities[i],state.capabilities[i-1]];renderCapabilities();}};row.querySelector('.down').onclick=()=>{syncCapabilities();if(i+1<state.capabilities.length){[state.capabilities[i+1],state.capabilities[i]]=[state.capabilities[i],state.capabilities[i+1]];renderCapabilities();}};row.querySelector('.remove').onclick=()=>{syncCapabilities();state.capabilities.splice(i,1);renderCapabilities();};row.querySelectorAll('input').forEach(el=>{el.addEventListener('input',syncCapabilities);el.addEventListener('change',syncCapabilities);});body.appendChild(row);});}
function renderPreview(){syncMetadata();const grid=byId('previewGrid');grid.textContent='';if(!state.actions.length){grid.innerHTML='<div class="empty">No controls to preview.</div>';return;}state.actions.forEach(a=>{const row=document.createElement('div');row.className='previewRow';const label=document.createElement('div');label.textContent=a.label||a.id||'Unnamed action';const control=document.createElement('div');control.className='previewControl';if(a.kind==='measurement'){const value=document.createElement('div');value.className='previewValue';value.textContent='--'+(a.unit?' '+a.unit:'');const button=document.createElement('button');button.className='button secondary';button.textContent='Read';control.append(value,button);}else if(a.kind==='numeric'){const input=document.createElement('input');input.type='number';input.value=String(a.defaultValue??0);input.disabled=true;const unit=document.createElement('span');unit.textContent=a.unit||'';const apply=document.createElement('button');apply.className='button';apply.textContent='Apply';control.append(input,unit,apply);if(a.readback){const read=document.createElement('button');read.className='button secondary';read.textContent='Read';control.appendChild(read);}}else if(a.kind==='toggle'){const input=document.createElement('input');input.type='checkbox';input.disabled=true;const text=document.createElement('span');text.textContent='Enabled';const apply=document.createElement('button');apply.className='button';apply.textContent='Apply';control.append(input,text,apply);if(a.readback){const read=document.createElement('button');read.className='button secondary';read.textContent='Read';control.appendChild(read);}}else{const button=document.createElement('button');button.className='button';button.textContent='Execute';control.appendChild(button);}row.append(label,control);grid.appendChild(row);});}
function compactIdentityToken(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');}
function canonicalVendor(value){const c=compactIdentityToken(value);if(c.includes('keysight')||c.includes('agilent')||c.includes('hewlettpackard'))return'keysight';if(c.includes('rigol'))return'rigol';if(c.includes('fluke'))return'fluke';if(c.includes('tektronix'))return'tektronix';if(c.includes('rohdeschwarz')||c==='rs')return'rohdeschwarz';if(c.includes('siglent'))return'siglent';return c;}
function parseIdn(value){const f=String(value||'').trim().split(',');return{manufacturer:(f[0]||'').trim(),model:(f[1]||'').trim()};}
function profileScore(profile,idn){if(!idn.manufacturer&&!idn.model)return 0;const pm=canonicalVendor(profile.manufacturer),im=canonicalVendor(idn.manufacturer),pmodel=compactIdentityToken(profile.model),imodel=compactIdentityToken(idn.model);if(pm==='generic')return 0;let score=0;if(pm&&pm===im)score+=30;if(pmodel&&imodel){if(pmodel===imodel)score+=70;else if(imodel.includes(pmodel)||pmodel.includes(imodel))score+=55;}return Math.min(100,score);}
function renderIdnMatches(){const box=byId('idnMatches');const raw=byId('idnTest').value.trim();if(!raw){box.textContent='No identity entered.';return;}const idn=parseIdn(raw);const matches=catalog.map(entry=>({entry,score:profileScore(entry.profile,idn)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);if(!matches.length){box.textContent='No manufacturer/model profile match in the catalogue.';return;}box.textContent=matches.map(x=>x.entry.profile.displayName+' — '+x.score+'%'+(x.score>=90?' high':x.score>=60?' medium':' low')).join(' · ');}
function renderCatalog(){const search=byId('catalogSearch').value.trim().toLowerCase();const family=byId('catalogFamily').value;const idn=parseIdn(byId('idnTest').value);const list=byId('catalogList');list.textContent='';const filtered=catalog.filter(entry=>{const p=entry.profile;const hay=[p.displayName,p.manufacturer,p.model,p.family,entry.notes].join(' ').toLowerCase();return(!family||p.family===family)&&(!search||hay.includes(search));});if(!filtered.length){list.innerHTML='<div class="empty">No catalog profile matches the filters.</div>';return;}filtered.forEach(entry=>{const p=entry.profile;const score=profileScore(p,idn);const card=document.createElement('div');card.className='catalogCard';const title=document.createElement('h3');title.textContent=p.displayName;const meta=document.createElement('div');meta.className='meta';meta.textContent=[p.manufacturer,p.model,p.family].filter(Boolean).join(' · ');const badge=document.createElement('span');badge.className='badge';badge.textContent=entry.status+(score?' · match '+score+'%':'');const notes=document.createElement('div');notes.className='catalogNotes';notes.textContent=entry.notes||p.description||'';const button=document.createElement('button');button.className='button';button.textContent='Use this profile';button.onclick=()=>{if(confirm('Replace the current editor contents with this catalog profile?'))send('loadCatalog',{catalogId:entry.catalogId});};card.append(title,meta,badge,notes,button);list.appendChild(card);});renderIdnMatches();}
fillMetadata();renderRows();renderCapabilities();renderPreview();renderCatalog();
['profileId','displayName','family','manufacturer','model','documentationUrl','description'].forEach(id=>{byId(id).addEventListener('input',renderPreview);byId(id).addEventListener('change',renderPreview);});
byId('catalogSearch').oninput=renderCatalog;byId('catalogFamily').onchange=renderCatalog;byId('idnTest').oninput=renderCatalog;byId('addAction').onclick=()=>{syncRows();const a=defaultAction();let index=state.actions.length+1;const used=new Set(state.actions.map(x=>x.id));while(used.has(a.id))a.id='new-action-'+index++;state.actions.push(a);renderRows();renderPreview();};
byId('addCapability').onclick=()=>{syncCapabilities();const c=defaultCapability();let index=state.capabilities.length+1;const used=new Set(state.capabilities.map(x=>x.id));while(used.has(c.id))c.id='custom.capability.'+index++;state.capabilities.push(c);renderCapabilities();};
byId('newProfile').onclick=()=>send('newProfile');byId('openProfile').onclick=()=>send('openProfile');byId('save').onclick=()=>send('save');byId('saveAs').onclick=()=>send('saveAs');byId('validate').onclick=()=>send('validate');byId('openJson').onclick=()=>send('openJson');byId('reload').onclick=()=>send('reload');byId('revealDirectory').onclick=()=>send('revealDirectory');byId('openDocumentation').onclick=()=>send('openDocumentation',{documentationUrl:byId('documentationUrl').value});
</script></body></html>`;
    }
}
exports.QtInstrumentProfileEditorPanel = QtInstrumentProfileEditorPanel;
function createBlankInstrumentProfile() {
    return {
        schemaVersion: 1,
        id: 'custom-instrument',
        displayName: 'Custom SCPI Instrument',
        family: 'generic',
        manufacturer: '',
        model: '',
        documentationUrl: '',
        description: '',
        actions: [{
                id: 'identify',
                label: 'Identify',
                kind: 'measurement',
                query: '*IDN?',
                write: '',
                unit: '',
                minimum: -1.0e12,
                maximum: 1.0e12,
                decimals: 6,
                defaultValue: 0,
                readback: true
            }],
        capabilities: [{
                id: 'system.identify',
                label: 'Identify instrument',
                category: 'system',
                actionIds: ['identify']
            }]
    };
}
function normalizeQtInstrumentProfile(raw) {
    const value = raw;
    const familyValues = ['generic', 'dmm', 'power-supply', 'signal-generator', 'oscilloscope'];
    const family = familyValues.includes(value.family) ? value.family : 'generic';
    return {
        schemaVersion: 1,
        id: String(value.id ?? '').trim(),
        displayName: String(value.displayName ?? '').trim(),
        family,
        manufacturer: String(value.manufacturer ?? '').trim(),
        model: String(value.model ?? '').trim(),
        documentationUrl: String(value.documentationUrl ?? '').trim(),
        description: String(value.description ?? ''),
        actions: Array.isArray(value.actions) ? value.actions.map((entry) => normalizeAction(entry)) : [],
        capabilities: Array.isArray(value.capabilities) ? value.capabilities.map((entry) => normalizeCapability(entry)) : inferCapabilitiesFromActions(Array.isArray(value.actions) ? value.actions.map((entry) => normalizeAction(entry)) : [], family)
    };
}
function normalizeAction(raw) {
    const value = (raw && typeof raw === 'object' ? raw : {});
    const kinds = ['measurement', 'numeric', 'toggle', 'action'];
    const kind = kinds.includes(value.kind) ? value.kind : 'measurement';
    const query = String(value.query ?? '');
    return {
        id: String(value.id ?? '').trim(),
        label: String(value.label ?? '').trim(),
        kind,
        query,
        write: String(value.write ?? value.writeTemplate ?? ''),
        unit: String(value.unit ?? ''),
        minimum: finiteNumber(value.minimum, -1.0e12),
        maximum: finiteNumber(value.maximum, 1.0e12),
        decimals: Math.max(0, Math.min(15, Math.trunc(finiteNumber(value.decimals, 6)))),
        defaultValue: finiteNumber(value.defaultValue, 0),
        readback: typeof value.readback === 'boolean' ? value.readback : query.length > 0
    };
}
function normalizeCapability(raw) {
    const value = (raw && typeof raw === 'object' ? raw : {});
    const rawActions = Array.isArray(value.actions) ? value.actions : Array.isArray(value.actionIds) ? value.actionIds : [];
    return {
        id: String(value.id ?? '').trim(),
        label: String(value.label ?? '').trim(),
        category: String(value.category ?? 'general').trim() || 'general',
        actionIds: rawActions.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    };
}
function inferCapabilitiesFromActions(actions, family) {
    const map = {
        'voltage-dc': { id: 'measure.dc-voltage', label: 'DC voltage measurement', category: 'measurement' },
        'current-dc': { id: 'measure.dc-current', label: 'DC current measurement', category: 'measurement' },
        resistance: { id: 'measure.resistance', label: 'Resistance measurement', category: 'measurement' },
        frequency: { id: family === 'signal-generator' ? 'source.frequency' : 'measure.frequency', label: family === 'signal-generator' ? 'Frequency control' : 'Frequency measurement', category: family === 'signal-generator' ? 'source' : 'measurement' },
        voltage: { id: 'power.voltage-set', label: 'Voltage setpoint', category: 'power' },
        current: { id: 'power.current-limit', label: 'Current limit', category: 'power' },
        output: { id: family === 'signal-generator' ? 'source.output' : 'power.output', label: 'Output enable', category: family === 'signal-generator' ? 'source' : 'power' },
        amplitude: { id: 'source.amplitude', label: 'Amplitude control', category: 'source' },
        offset: { id: 'source.offset', label: 'DC offset control', category: 'source' },
        run: { id: 'scope.run', label: 'Run acquisition', category: 'oscilloscope' },
        stop: { id: 'scope.stop', label: 'Stop acquisition', category: 'oscilloscope' },
        single: { id: 'scope.single', label: 'Single acquisition', category: 'oscilloscope' },
        'time-scale': { id: 'scope.time-scale', label: 'Timebase control', category: 'oscilloscope' },
        'channel1-scale': { id: 'scope.vertical-scale', label: 'Vertical scale control', category: 'oscilloscope' },
        vpp: { id: 'measure.vpp', label: 'Peak-to-peak measurement', category: 'measurement' },
        'measured-voltage': { id: 'measure.dc-voltage', label: 'DC voltage measurement', category: 'measurement' },
        'measured-current': { id: 'measure.dc-current', label: 'DC current measurement', category: 'measurement' },
        identify: { id: 'system.identify', label: 'Identify instrument', category: 'system' }
    };
    const result = [];
    const seen = new Set();
    for (const action of actions) {
        const spec = map[action.id];
        if (!spec || seen.has(spec.id))
            continue;
        seen.add(spec.id);
        result.push({ ...spec, actionIds: [action.id] });
    }
    return result;
}
function readQtInstrumentProfile(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        throw new Error(`Invalid JSON in ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Instrument profile root must be a JSON object.');
    const normalized = normalizeQtInstrumentProfile(parsed);
    const errors = validateQtInstrumentProfile(normalized).filter((issue) => issue.severity === 'error');
    if (errors.length > 0)
        throw new Error(errors.map((issue) => issue.message).join(' '));
    return normalized;
}
function serializeQtInstrumentProfile(profile) {
    const normalized = normalizeQtInstrumentProfile(profile);
    const root = {
        schemaVersion: 1,
        id: normalized.id,
        displayName: normalized.displayName,
        family: normalized.family
    };
    if (normalized.manufacturer)
        root.manufacturer = normalized.manufacturer;
    if (normalized.model)
        root.model = normalized.model;
    if (normalized.documentationUrl)
        root.documentationUrl = normalized.documentationUrl;
    if (normalized.description)
        root.description = normalized.description;
    root.actions = normalized.actions.map((action) => {
        const result = {
            id: action.id,
            label: action.label,
            kind: action.kind
        };
        if (action.query)
            result.query = action.query;
        if (action.write)
            result.write = action.write;
        if (action.unit)
            result.unit = action.unit;
        if (action.kind === 'numeric') {
            result.minimum = action.minimum;
            result.maximum = action.maximum;
            result.decimals = action.decimals;
            result.defaultValue = action.defaultValue;
        }
        else if (action.kind === 'measurement') {
            result.decimals = action.decimals;
        }
        result.readback = action.readback;
        return result;
    });
    root.capabilities = normalized.capabilities.map((capability) => ({
        id: capability.id,
        label: capability.label,
        category: capability.category,
        actions: capability.actionIds
    }));
    return `${JSON.stringify(root, null, 2)}\n`;
}
function validateQtInstrumentProfile(profile) {
    const issues = [];
    if (!profile.id.trim())
        issues.push({ severity: 'error', message: 'Profile ID is required.' });
    else if (!/^[A-Za-z0-9._-]+$/.test(profile.id))
        issues.push({ severity: 'error', message: 'Profile ID may only contain letters, digits, dot, underscore and hyphen.' });
    if (!profile.displayName.trim())
        issues.push({ severity: 'error', message: 'Display name is required.' });
    if ((profile.manufacturer && !profile.model) || (!profile.manufacturer && profile.model))
        issues.push({ severity: 'warning', message: 'Manufacturer and model are normally specified together for model-specific profiles.' });
    if (profile.documentationUrl && !isPlausibleDocumentationUrl(profile.documentationUrl))
        issues.push({ severity: 'warning', message: 'Documentation URL is neither an http(s) URL nor an obvious local/project-relative path.' });
    if (profile.actions.length === 0)
        issues.push({ severity: 'error', message: 'At least one SCPI action is required.' });
    const ids = new Set();
    for (const action of profile.actions) {
        const prefix = action.id ? `Action "${action.id}"` : 'An action';
        if (!action.id)
            issues.push({ severity: 'error', message: 'Every action requires a non-empty ID.' });
        else if (!/^[A-Za-z0-9._-]+$/.test(action.id))
            issues.push({ severity: 'error', message: `${prefix} has an invalid ID.`, actionId: action.id });
        else if (ids.has(action.id.toLowerCase()))
            issues.push({ severity: 'error', message: `Duplicate action ID: ${action.id}.`, actionId: action.id });
        else
            ids.add(action.id.toLowerCase());
        if (!action.label)
            issues.push({ severity: 'error', message: `${prefix} requires a label.`, actionId: action.id });
        if (action.kind === 'measurement' && !action.query.trim())
            issues.push({ severity: 'error', message: `${prefix} is a measurement but has no query command.`, actionId: action.id });
        if (action.kind === 'action' && !action.write.trim())
            issues.push({ severity: 'error', message: `${prefix} is an action but has no write command.`, actionId: action.id });
        if (action.kind === 'numeric') {
            if (!action.write.trim())
                issues.push({ severity: 'error', message: `${prefix} is numeric but has no write template.`, actionId: action.id });
            else if (!action.write.includes('%1'))
                issues.push({ severity: 'warning', message: `${prefix} numeric write template does not contain %1, so the entered value will not be inserted.`, actionId: action.id });
            if (action.minimum > action.maximum)
                issues.push({ severity: 'error', message: `${prefix} minimum is greater than maximum.`, actionId: action.id });
            if (action.defaultValue < action.minimum || action.defaultValue > action.maximum)
                issues.push({ severity: 'warning', message: `${prefix} default value is outside its configured numeric range.`, actionId: action.id });
        }
        if (action.kind === 'toggle') {
            if (!action.write.trim())
                issues.push({ severity: 'error', message: `${prefix} is a toggle but has no write template.`, actionId: action.id });
            else if (!action.write.includes('%1'))
                issues.push({ severity: 'warning', message: `${prefix} toggle write template does not contain %1; the control cannot insert ON/OFF state.`, actionId: action.id });
        }
        if (action.readback && !action.query.trim() && action.kind !== 'action')
            issues.push({ severity: 'warning', message: `${prefix} enables readback but does not define a query.`, actionId: action.id });
        if (action.decimals < 0 || action.decimals > 15)
            issues.push({ severity: 'warning', message: `${prefix} decimals should be between 0 and 15.`, actionId: action.id });
    }
    const capabilityIds = new Set();
    const actionIds = new Set(profile.actions.map((action) => action.id.toLowerCase()));
    for (const capability of profile.capabilities) {
        const prefix = capability.id ? `Capability "${capability.id}"` : 'A capability';
        if (!capability.id)
            issues.push({ severity: 'error', message: 'Every capability requires a non-empty ID.' });
        else if (!/^[A-Za-z0-9._-]+$/.test(capability.id))
            issues.push({ severity: 'error', message: `${prefix} has an invalid ID.` });
        else if (capabilityIds.has(capability.id.toLowerCase()))
            issues.push({ severity: 'error', message: `Duplicate capability ID: ${capability.id}.` });
        else
            capabilityIds.add(capability.id.toLowerCase());
        if (!capability.label)
            issues.push({ severity: 'error', message: `${prefix} requires a label.` });
        if (!capability.category)
            issues.push({ severity: 'warning', message: `${prefix} has no category.` });
        if (capability.actionIds.length === 0)
            issues.push({ severity: 'warning', message: `${prefix} is not linked to any profile action.` });
        for (const actionId of capability.actionIds) {
            if (!actionIds.has(actionId.toLowerCase()))
                issues.push({ severity: 'error', message: `${prefix} references unknown action "${actionId}".` });
        }
    }
    return issues;
}
function readQtInstrumentProfileCatalog(catalogPath) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    }
    catch (error) {
        throw new Error(`Unable to read SCPI instrument profile catalog: ${error instanceof Error ? error.message : String(error)}`);
    }
    const entries = [];
    for (const candidate of raw.entries ?? []) {
        if (!candidate || typeof candidate !== 'object')
            continue;
        const value = candidate;
        if (!value.profile || typeof value.profile !== 'object')
            continue;
        const profile = normalizeQtInstrumentProfile(value.profile);
        if (!profile.id || !profile.displayName || profile.actions.length === 0)
            continue;
        const status = value.status === 'verified' || value.status === 'custom' ? value.status : 'starter';
        entries.push({
            catalogId: String(value.catalogId ?? profile.id),
            status,
            notes: String(value.notes ?? ''),
            profile
        });
    }
    return entries;
}
function parseScpiIdentity(response) {
    const raw = String(response ?? '').trim();
    const fields = raw.split(',');
    return {
        raw,
        manufacturer: String(fields[0] ?? '').trim(),
        model: String(fields[1] ?? '').trim(),
        serialNumber: String(fields[2] ?? '').trim(),
        firmware: fields.slice(3).join(',').trim()
    };
}
function matchScpiIdentityToCatalog(catalog, response) {
    const identity = parseScpiIdentity(response);
    return catalog
        .map((entry) => scoreCatalogEntry(entry, identity))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.profile.displayName.localeCompare(b.entry.profile.displayName));
}
function scoreCatalogEntry(entry, identity) {
    const profile = entry.profile;
    const profileManufacturer = canonicalScpiManufacturer(profile.manufacturer);
    const identityManufacturer = canonicalScpiManufacturer(identity.manufacturer);
    const profileModel = compactScpiIdentityToken(profile.model);
    const identityModel = compactScpiIdentityToken(identity.model);
    let score = 0;
    const reasons = [];
    if (profileManufacturer === 'generic')
        return { entry, score: 0, confidence: 'none', reason: 'Generic profiles are not auto-detection candidates.' };
    if (profileManufacturer && profileManufacturer === identityManufacturer) {
        score += 30;
        reasons.push('manufacturer match');
    }
    if (profileModel && identityModel) {
        if (profileModel === identityModel) {
            score += 70;
            reasons.push('exact model match');
        }
        else if (identityModel.includes(profileModel) || profileModel.includes(identityModel)) {
            score += 55;
            reasons.push('model token match');
        }
    }
    score = Math.max(0, Math.min(100, score));
    const confidence = score >= 90 ? 'high' : score >= 60 ? 'medium' : score > 0 ? 'low' : 'none';
    return { entry, score, confidence, reason: reasons.join(' + ') || 'No manufacturer/model match.' };
}
function compactScpiIdentityToken(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function canonicalScpiManufacturer(value) {
    const compact = compactScpiIdentityToken(value);
    if (compact.includes('keysight') || compact.includes('agilent') || compact.includes('hewlettpackard'))
        return 'keysight';
    if (compact.includes('rigol'))
        return 'rigol';
    if (compact.includes('fluke'))
        return 'fluke';
    if (compact.includes('tektronix'))
        return 'tektronix';
    if (compact.includes('rohdeschwarz') || compact === 'rs')
        return 'rohdeschwarz';
    if (compact.includes('siglent'))
        return 'siglent';
    return compact;
}
function finiteNumber(value, fallback) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}
function sanitizeProfileFileName(value) {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'instrument-profile';
}
function ensureJsonExtension(filePath) {
    return filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`;
}
function isPlausibleDocumentationUrl(value) {
    return /^https?:\/\//i.test(value) || /^file:/i.test(value) || /^[.]{0,2}[\\/]/.test(value) || /[\\/]/.test(value);
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}
