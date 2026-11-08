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
exports.QpmImportLibraryService = void 0;
exports.collectHeaderImportSymbols = collectHeaderImportSymbols;
exports.parsePeExports = parsePeExports;
exports.renderModuleDefinition = renderModuleDefinition;
exports.buildImportLibraryInvocation = buildImportLibraryInvocation;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const vscode = __importStar(require("vscode"));
const qtProjectManifest_1 = require("../model/qtProjectManifest");
const qpmProjectSettingsService_1 = require("./qpmProjectSettingsService");
const qpmSymbolService_1 = require("./qpmSymbolService");
class QpmImportLibraryService {
    workspaces;
    settings;
    installations;
    output;
    qtInstallations;
    lastReportPath;
    dllPanel;
    dllBatchRows = [];
    dllBatchRef;
    dllRowSequence = 0;
    constructor(workspaces, settings, installations, output, qtInstallations) {
        this.workspaces = workspaces;
        this.settings = settings;
        this.installations = installations;
        this.output = output;
        this.qtInstallations = qtInstallations;
    }
    dispose() { this.dllPanel?.dispose(); }
    async generateFromHeaderSelection(clicked, selection = []) {
        const candidates = [clicked, ...selection]
            .filter((value) => !!value && typeof value === 'object' && value.kind === 'file')
            .filter((node) => isHeaderPath(node.file.absolutePath));
        const unique = dedupePaths(candidates.map((node) => node.file.absolutePath));
        const ref = clicked?.ref ?? candidates[0]?.ref ?? this.workspaces.activeProjectRef;
        await this.generateFromHeaders(unique.length ? unique : undefined, ref);
    }
    async generateFromHeaders(headerPaths, projectRef) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists) {
            vscode.window.showErrorMessage('No existing Qt/C++ project is selected.');
            return;
        }
        let headers = dedupePaths(headerPaths ?? []);
        if (!headers.length) {
            const chosen = await vscode.window.showOpenDialog({
                title: 'Select one or more C/C++ headers for import-library generation',
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: true,
                defaultUri: vscode.Uri.file(path.dirname(ref.absolutePath)),
                filters: { 'C/C++ headers': ['h', 'hh', 'hpp', 'hxx'], 'All files': ['*'] }
            });
            if (!chosen?.length)
                return;
            headers = dedupePaths(chosen.map((uri) => uri.fsPath).filter(isHeaderPath));
        }
        if (!headers.length) {
            vscode.window.showErrorMessage('No C/C++ header was selected.');
            return;
        }
        const discovered = [];
        const warnings = [];
        for (const headerPath of headers) {
            if (!fs.existsSync(headerPath)) {
                warnings.push(`Header not found: ${headerPath}`);
                continue;
            }
            const extraction = collectHeaderImportSymbols(fs.readFileSync(headerPath, 'utf8'), headerPath);
            discovered.push(...extraction.symbols);
            warnings.push(...extraction.warnings);
        }
        const deduped = dedupeHeaderSymbols(discovered);
        if (!deduped.length) {
            vscode.window.showErrorMessage('No importable free-function declarations were detected in the selected header(s).');
            return;
        }
        const selected = await vscode.window.showQuickPick(deduped.map((symbol) => ({
            label: symbol.name,
            description: `${path.basename(symbol.filePath)}:${symbol.line + 1}`,
            detail: symbol.signature,
            picked: true,
            symbol
        })), {
            title: `Select exported symbols for the import library (${deduped.length} detected)`,
            placeHolder: 'Header-based generation assumes the DLL exports these exact symbol names.',
            canPickMany: true,
            ignoreFocusOut: true
        });
        if (!selected?.length)
            return;
        const projectSettings = this.settings.getSettings(ref);
        const dllNameInput = await vscode.window.showInputBox({
            title: 'Runtime DLL name',
            prompt: 'Name of the DLL that will satisfy these imports at runtime. The DLL itself is not created.',
            value: `${sanitizeBaseName(ref.name)}.dll`,
            validateInput: (value) => value.trim() ? undefined : 'Enter a DLL file name.'
        });
        if (dllNameInput === undefined)
            return;
        const dllName = ensureDllExtension(path.basename(dllNameInput.trim()));
        const architecture = resolveConfiguredArchitecture(projectSettings.importLibraries.architecture, this.settings.getQpmConfigurationValue('buildMode', 'debug'), this.activeCompilerPath());
        const outputLibrary = await this.chooseOutputLibraryPath(ref, projectSettings.importLibraries, path.parse(dllName).name);
        if (!outputLibrary)
            return;
        const defPath = changeExtension(outputLibrary, '.def');
        const names = selected.map((item) => item.symbol.name);
        fs.mkdirSync(path.dirname(outputLibrary), { recursive: true });
        fs.writeFileSync(defPath, renderModuleDefinition(dllName, names.map((name) => ({ name }))), 'utf8');
        warnings.push('Header-based generation creates an import library, not a static library implementation. The matching DLL is still required at runtime.');
        if (headers.some((entry) => /\.(?:hpp|hxx|hh)$/i.test(entry))) {
            warnings.push('C++ symbol decoration cannot be inferred reliably from headers. Prefer DLL-based generation for C++ exports or APIs without extern "C" names.');
        }
        const generator = await this.resolveGeneratorSafely(ref, projectSettings.importLibraries);
        if (!generator)
            return;
        await this.finishGeneration({
            inputLabel: headers.map((entry) => path.basename(entry)).join(', '),
            outputLibrary,
            definitionFile: defPath,
            architecture,
            dllName,
            exportCount: names.length,
            warnings,
            generator
        }, ref, projectSettings.importLibraries);
    }
    async generateFromDll(dllPath, projectRef) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists) {
            vscode.window.showErrorMessage('No existing Qt/C++ project is selected.');
            return;
        }
        await this.openDllBatchPanel(dllPath ? [dllPath] : [], ref);
    }
    async openDllBatchPanel(initialPaths, ref) {
        this.dllBatchRef = ref;
        if (!this.dllPanel) {
            this.dllPanel = vscode.window.createWebviewPanel('qpm.importLibraryDllBatch', 'QPM DLL Import Libraries', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
            this.dllPanel.onDidDispose(() => { this.dllPanel = undefined; this.dllBatchRows = []; this.dllBatchRef = undefined; });
            this.dllPanel.webview.onDidReceiveMessage((message) => void this.handleDllPanelMessage(message));
        }
        this.dllPanel.title = `DLL → Import Libraries — ${ref.name}`;
        if (initialPaths.length) {
            for (const filePath of dedupePaths(initialPaths)) {
                if (!this.dllBatchRows.some((row) => samePath(row.dllPath, filePath)))
                    this.dllBatchRows.push(this.createDllBatchRow(filePath, ref));
            }
        }
        this.dllPanel.webview.html = this.renderDllBatchPanel();
        this.dllPanel.reveal(vscode.ViewColumn.Active);
    }
    createDllBatchRow(filePath, ref) {
        const id = `dll-${++this.dllRowSequence}`;
        const config = this.settings.getSettings(ref).importLibraries;
        const row = {
            id,
            dllPath: path.resolve(filePath),
            outputLibrary: this.uniqueBatchOutputPath(ref, config, path.parse(filePath).name)
        };
        this.refreshDllBatchRow(row);
        return row;
    }
    refreshDllBatchRow(row) {
        row.exports = undefined;
        row.error = undefined;
        if (!row.dllPath || !fs.existsSync(row.dllPath) || path.extname(row.dllPath).toLowerCase() !== '.dll') {
            row.error = row.dllPath ? `DLL not found or invalid path: ${row.dllPath}` : 'No DLL selected.';
            return;
        }
        try {
            row.exports = parsePeExports(fs.readFileSync(row.dllPath));
        }
        catch (error) {
            row.error = error instanceof Error ? error.message : String(error);
        }
    }
    async handleDllPanelMessage(message) {
        const panel = this.dllPanel;
        const ref = this.dllBatchRef;
        if (!panel || !ref?.exists)
            return;
        const type = String(message?.type ?? '');
        if (type === 'addDll') {
            const chosen = await vscode.window.showOpenDialog({
                title: 'Add one or more DLL files',
                canSelectFiles: true, canSelectFolders: false, canSelectMany: true,
                defaultUri: vscode.Uri.file(path.dirname(ref.absolutePath)),
                filters: { 'Windows DLL': ['dll'], 'All files': ['*'] }
            });
            for (const uri of chosen ?? [])
                if (!this.dllBatchRows.some((row) => samePath(row.dllPath, uri.fsPath)))
                    this.dllBatchRows.push(this.createDllBatchRow(uri.fsPath, ref));
            await this.pushDllBatchState();
            return;
        }
        if (type === 'browseDll') {
            const row = this.dllBatchRows.find((entry) => entry.id === String(message.id ?? ''));
            if (!row)
                return;
            const chosen = await vscode.window.showOpenDialog({
                title: 'Select DLL', canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                defaultUri: vscode.Uri.file(fs.existsSync(row.dllPath) ? row.dllPath : path.dirname(ref.absolutePath)),
                filters: { 'Windows DLL': ['dll'], 'All files': ['*'] }
            });
            if (chosen?.[0]) {
                row.dllPath = chosen[0].fsPath;
                row.outputLibrary = this.uniqueBatchOutputPath(ref, this.settings.getSettings(ref).importLibraries, path.parse(row.dllPath).name, row.id);
                this.refreshDllBatchRow(row);
                await this.pushDllBatchState();
            }
            return;
        }
        if (type === 'browseOutput') {
            const row = this.dllBatchRows.find((entry) => entry.id === String(message.id ?? ''));
            if (!row)
                return;
            const chosen = await vscode.window.showSaveDialog({ title: 'Save Windows import library', defaultUri: vscode.Uri.file(row.outputLibrary), filters: { 'Windows import library': ['lib'] } });
            if (chosen) {
                row.outputLibrary = chosen.fsPath;
                await this.pushDllBatchState();
            }
            return;
        }
        if (type === 'removeDll') {
            this.dllBatchRows = this.dllBatchRows.filter((entry) => entry.id !== String(message.id ?? ''));
            await this.pushDllBatchState();
            return;
        }
        if (type === 'generateBatch') {
            await this.generateDllBatch(Array.isArray(message.rows) ? message.rows : []);
            return;
        }
    }
    async pushDllBatchState() {
        await this.dllPanel?.webview.postMessage({ type: 'state', state: this.serializeDllBatchState() });
    }
    serializeDllBatchState() {
        return {
            rows: this.dllBatchRows.map((row) => ({
                id: row.id, dllPath: row.dllPath, outputLibrary: row.outputLibrary, error: row.error,
                architecture: row.exports?.architecture, dllName: row.exports?.dllName, ordinalOnlyCount: row.exports?.ordinalOnlyCount ?? 0,
                symbols: (row.exports?.symbols ?? []).map((symbol) => ({ name: symbol.name, ordinal: symbol.ordinal, rva: symbol.rva, forwarder: symbol.forwarder }))
            }))
        };
    }
    renderDllBatchPanel() {
        const initialState = safeScriptJson(this.serializeDllBatchState());
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>
      body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:18px;max-width:1300px;margin:auto}.top{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:14px}.actions{display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:6px 11px;border-radius:3px;cursor:pointer}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.row{border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);border-radius:6px;padding:12px;margin:10px 0}.row-head{display:grid;grid-template-columns:1fr auto auto;gap:7px;align-items:end}.field{display:flex;flex-direction:column;gap:4px}.field label{font-size:12px;color:var(--vscode-descriptionForeground)}input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);padding:6px 8px}.meta{margin:8px 0;color:var(--vscode-descriptionForeground);font-size:12px}.error{color:var(--vscode-errorForeground)}.exports{max-height:280px;overflow:auto;border-top:1px solid var(--vscode-panel-border);margin-top:9px;padding-top:8px}.export{display:grid;grid-template-columns:auto minmax(180px,1fr) 110px 110px;gap:8px;align-items:center;padding:3px 2px;font-family:var(--vscode-editor-font-family);font-size:12px}.export small{color:var(--vscode-descriptionForeground)}.export-tools{display:flex;gap:6px;align-items:center;margin-bottom:7px}.export-tools input{flex:1}.notice{border-left:3px solid var(--vscode-textLink-foreground);padding:8px 10px;background:var(--vscode-textBlockQuote-background);margin:10px 0;color:var(--vscode-descriptionForeground)}.empty{padding:28px;border:1px dashed var(--vscode-panel-border);text-align:center;color:var(--vscode-descriptionForeground)}
    </style></head><body><div class="top"><div><h2>DLL import-library batch</h2><div class="notice">Add one or more DLLs. QPM generates <strong>one .lib per DLL</strong>; each row has its own source browser, output browser and export selection.</div></div><div class="actions"><button id="add">+ Add DLL(s)…</button><button id="generate">Generate selected .lib files</button></div></div><div id="rows"></div><script>
      const vscode=acquireVsCodeApi();let state=${initialState};const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      function render(){const host=document.getElementById('rows');if(!state.rows.length){host.innerHTML='<div class="empty">No DLL selected. Use <strong>+ Add DLL(s)…</strong>.</div>';return;}host.innerHTML=state.rows.map(r=>{const symbols=r.symbols||[];return '<div class="row" data-row="'+esc(r.id)+'"><div class="row-head"><div class="field"><label>DLL file</label><input class="dll-path" value="'+esc(r.dllPath)+'" readonly></div><button data-browse-dll="'+esc(r.id)+'" class="secondary">Browse…</button><button data-remove="'+esc(r.id)+'" class="secondary">Remove</button></div><div class="row-head" style="margin-top:7px"><div class="field"><label>Output import library</label><input class="out-path" value="'+esc(r.outputLibrary)+'" readonly></div><button data-browse-out="'+esc(r.id)+'" class="secondary">Browse…</button><span></span></div>'+(r.error?'<div class="meta error">'+esc(r.error)+'</div>':'<div class="meta">'+esc(r.architecture||'unknown')+' · '+symbols.length+' named export(s)'+(r.ordinalOnlyCount?' · '+r.ordinalOnlyCount+' ordinal-only skipped':'')+'</div>')+(symbols.length?'<div class="exports"><div class="export-tools"><input data-filter="'+esc(r.id)+'" placeholder="Filter exports…"><button data-all="'+esc(r.id)+'" class="secondary">All</button><button data-none="'+esc(r.id)+'" class="secondary">None</button></div><div data-export-list="'+esc(r.id)+'">'+symbols.map(s=>'<label class="export" data-name="'+esc(s.name.toLowerCase())+'"><input type="checkbox" data-export-row="'+esc(r.id)+'" value="'+esc(s.name)+'" checked><span>'+esc(s.name)+'</span><small>ordinal '+s.ordinal+'</small><small>RVA 0x'+Number(s.rva).toString(16).toUpperCase()+'</small></label>').join('')+'</div></div>':'')+'</div>';}).join('');wire();}
      function wire(){document.querySelectorAll('[data-browse-dll]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'browseDll',id:b.dataset.browseDll}));document.querySelectorAll('[data-browse-out]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'browseOutput',id:b.dataset.browseOut}));document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'removeDll',id:b.dataset.remove}));document.querySelectorAll('[data-all]').forEach(b=>b.onclick=()=>document.querySelectorAll('[data-export-row="'+b.dataset.all+'"]').forEach(x=>x.checked=true));document.querySelectorAll('[data-none]').forEach(b=>b.onclick=()=>document.querySelectorAll('[data-export-row="'+b.dataset.none+'"]').forEach(x=>x.checked=false));document.querySelectorAll('[data-filter]').forEach(f=>f.oninput=()=>{const q=f.value.toLowerCase();document.querySelectorAll('[data-export-list="'+f.dataset.filter+'"] .export').forEach(x=>x.style.display=!q||x.dataset.name.includes(q)?'':'none');});}
      document.getElementById('add').onclick=()=>vscode.postMessage({type:'addDll'});document.getElementById('generate').onclick=()=>{const rows=state.rows.map(r=>({id:r.id,dllPath:r.dllPath,outputLibrary:r.outputLibrary,selected:[...document.querySelectorAll('[data-export-row="'+r.id+'"]:checked')].map(x=>x.value)}));vscode.postMessage({type:'generateBatch',rows});};window.addEventListener('message',e=>{if(e.data?.type==='state'){state=e.data.state;render();}});render();
    </script></body></html>`;
    }
    uniqueBatchOutputPath(ref, config, baseName, excludeId) {
        const directory = this.resolveOutputDirectory(ref, config);
        const clean = sanitizeBaseName(baseName);
        let candidate = path.join(directory, `${clean}.lib`);
        let suffix = 2;
        const used = () => this.dllBatchRows.some((row) => row.id !== excludeId && samePath(row.outputLibrary, candidate));
        while (used())
            candidate = path.join(directory, `${clean}_${suffix++}.lib`);
        return candidate;
    }
    async generateDllBatch(requestRows) {
        const ref = this.dllBatchRef;
        if (!ref?.exists)
            return;
        const config = this.settings.getSettings(ref).importLibraries;
        const generator = await this.resolveGeneratorSafely(ref, config);
        if (!generator)
            return;
        const results = [];
        const generated = [];
        for (const request of requestRows) {
            const row = this.dllBatchRows.find((entry) => entry.id === String(request?.id ?? ''));
            if (!row?.exports || row.error) {
                results.push({ dllPath: row?.dllPath ?? '', outputLibrary: row?.outputLibrary ?? '', ok: false, exportCount: 0, message: row?.error ?? 'DLL row is invalid.' });
                continue;
            }
            const selectedNames = new Set(Array.isArray(request?.selected) ? request.selected.map(String) : []);
            const selected = row.exports.symbols.filter((symbol) => selectedNames.has(symbol.name));
            const outputLibrary = String(request?.outputLibrary ?? row.outputLibrary).trim();
            if (!selected.length || !outputLibrary) {
                results.push({ dllPath: row.dllPath, outputLibrary, ok: false, exportCount: selected.length, message: !selected.length ? 'No exports selected.' : 'No output library selected.' });
                continue;
            }
            const defPath = changeExtension(outputLibrary, '.def');
            fs.mkdirSync(path.dirname(outputLibrary), { recursive: true });
            fs.writeFileSync(defPath, renderModuleDefinition(path.basename(row.dllPath), selected), 'utf8');
            const warnings = [];
            if (row.exports.ordinalOnlyCount)
                warnings.push(`${row.exports.ordinalOnlyCount} ordinal-only export(s) were skipped because they have no linkable name.`);
            warnings.push('PE export tables do not identify exported data versus functions. Review the generated .def and add DATA where required for exported data objects.');
            const generation = { inputLabel: row.dllPath, outputLibrary, definitionFile: defPath, architecture: row.exports.architecture, dllName: path.basename(row.dllPath), exportCount: selected.length, warnings, generator };
            const executed = await this.executeGeneration(generation, config, false);
            results.push({ dllPath: row.dllPath, outputLibrary, ok: executed.ok, exportCount: selected.length, message: executed.message });
            if (executed.ok)
                generated.push(outputLibrary);
        }
        const report = this.writeBatchReport(ref, results, generator);
        this.lastReportPath = report;
        const failures = results.filter((entry) => !entry.ok).length;
        const action = generated.length
            ? await vscode.window.showInformationMessage(`${generated.length} import librar${generated.length === 1 ? 'y' : 'ies'} generated${failures ? `; ${failures} failed/skipped` : ''}.`, 'Add generated .lib files to project', 'Open report')
            : await vscode.window.showWarningMessage(`No import library was generated${failures ? `; ${failures} row(s) failed/skipped` : ''}.`, 'Open report');
        if (action === 'Add generated .lib files to project' && generated.length)
            await this.workspaces.addFilePaths(ref, generated, 'Libraries');
        else if (action === 'Open report')
            await this.openReport();
    }
    async generateBuiltDllImportLibrary(projectRef, dllPath, outputLibrary) {
        const ref = projectRef;
        if (!ref?.exists || !fs.existsSync(dllPath))
            return { ok: false, message: 'Built DLL was not found.' };
        let exports;
        try {
            exports = parsePeExports(fs.readFileSync(dllPath));
        }
        catch (error) {
            return { ok: false, message: `Unable to read built DLL exports: ${error instanceof Error ? error.message : String(error)}` };
        }
        if (!exports.symbols.length)
            return { ok: false, message: 'The built DLL has no named exports; a named import library cannot be generated automatically.' };
        const config = this.settings.getSettings(ref).importLibraries;
        const generator = this.resolveGeneratorWithoutPrompt(ref, config);
        if (!generator)
            return { ok: false, message: 'No configured/compatible .lib generator (lib.exe, llvm-lib, llvm-dlltool or dlltool) was found.' };
        const defPath = changeExtension(outputLibrary, '.def');
        fs.mkdirSync(path.dirname(outputLibrary), { recursive: true });
        fs.writeFileSync(defPath, renderModuleDefinition(path.basename(dllPath), exports.symbols), 'utf8');
        const result = {
            inputLabel: dllPath, outputLibrary, definitionFile: defPath, architecture: exports.architecture,
            dllName: path.basename(dllPath), exportCount: exports.symbols.length, warnings: [
                'This .lib is an import library for the built DLL; the DLL remains required at runtime.',
                'C++ ABI compatibility depends on the exported decorated names and the consuming toolchain.'
            ], generator
        };
        const executed = await this.executeGeneration(result, config, false);
        return { ok: executed.ok, message: executed.message };
    }
    async extractDefinitionFromDll(dllPath, projectRef) {
        const ref = projectRef ?? this.workspaces.activeProjectRef;
        if (!ref?.exists) {
            vscode.window.showErrorMessage('No existing Qt/C++ project is selected.');
            return;
        }
        let input = dllPath;
        if (!input) {
            const chosen = await vscode.window.showOpenDialog({ title: 'Select DLL', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Windows DLL': ['dll'] } });
            input = chosen?.[0]?.fsPath;
        }
        if (!input)
            return;
        let exports;
        try {
            exports = parsePeExports(fs.readFileSync(input));
        }
        catch (error) {
            vscode.window.showErrorMessage(`Unable to read DLL exports: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        const target = await vscode.window.showSaveDialog({
            title: 'Save module-definition file',
            defaultUri: vscode.Uri.file(path.join(this.resolveOutputDirectory(ref, this.settings.getSettings(ref).importLibraries), `${path.parse(input).name}.def`)),
            filters: { 'Module definition': ['def'] }
        });
        if (!target)
            return;
        fs.mkdirSync(path.dirname(target.fsPath), { recursive: true });
        fs.writeFileSync(target.fsPath, renderModuleDefinition(path.basename(input), exports.symbols), 'utf8');
        vscode.window.showInformationMessage(`DLL exports written to ${target.fsPath}`);
    }
    async openReport() {
        const ref = this.workspaces.activeProjectRef;
        const report = this.lastReportPath ?? (ref ? this.reportPath(ref) : undefined);
        if (!report || !fs.existsSync(report)) {
            vscode.window.showInformationMessage('No import-library generation report is available yet.');
            return;
        }
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(report)), { preview: false });
    }
    async finishGeneration(result, ref, config) {
        const executed = await this.executeGeneration(result, config, true, ref);
        if (!executed.ok) {
            vscode.window.showErrorMessage(`Import-library generation failed. See ${executed.report ?? 'the QPM output channel'}.`);
            return;
        }
        const action = await vscode.window.showInformationMessage(`Import library generated: ${result.outputLibrary}`, 'Add to project', 'Open report', 'Reveal in Explorer');
        if (action === 'Add to project')
            await this.workspaces.addFilePaths(ref, [result.outputLibrary], 'Libraries');
        else if (action === 'Open report')
            await this.openReport();
        else if (action === 'Reveal in Explorer')
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputLibrary));
    }
    async executeGeneration(result, config, writeReport, ref) {
        this.output.show(true);
        this.output.appendLine(`[QPM Import Library] ${result.inputLabel}`);
        this.output.appendLine(`[QPM Import Library] DLL: ${result.dllName}`);
        this.output.appendLine(`[QPM Import Library] Architecture: ${result.architecture}`);
        this.output.appendLine(`[QPM Import Library] Generator: ${result.generator.label} (${result.generator.executable})`);
        this.output.appendLine(`[QPM Import Library] Definition: ${result.definitionFile}`);
        this.output.appendLine(`[QPM Import Library] Output: ${result.outputLibrary}`);
        const invocation = buildImportLibraryInvocation(result.generator, result.definitionFile, result.outputLibrary, result.dllName, result.architecture);
        const processResult = await runProcess(invocation.executable, invocation.args, invocation.cwd, (line) => this.output.appendLine(line));
        const ok = processResult.ok && fs.existsSync(result.outputLibrary);
        const message = processResult.stderr || processResult.stdout || (ok ? 'Generation completed successfully.' : `Generator exited with code ${processResult.code}.`);
        let report;
        if (writeReport && ref) {
            report = this.writeReport(ref, result, ok, message);
            this.lastReportPath = report;
        }
        if (!ok)
            return { ok, message, report };
        const expPath = changeExtension(result.outputLibrary, '.exp');
        if (fs.existsSync(expPath)) {
            try {
                fs.unlinkSync(expPath);
            }
            catch { /* best effort */ }
        }
        if (!config.keepDefinitionFile) {
            try {
                fs.unlinkSync(result.definitionFile);
            }
            catch { /* best effort */ }
        }
        return { ok, message, report };
    }
    writeBatchReport(ref, entries, generator) {
        const reportPath = this.reportPath(ref);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        const lines = ['# QPM DLL Import Library Batch', '', `- Generator: \`${generator.label}\``, `- Generator executable: \`${generator.executable}\``, `- DLL count: ${entries.length}`, '', '| Status | DLL | Exports | Output | Message |', '| --- | --- | ---: | --- | --- |'];
        for (const entry of entries)
            lines.push(`| ${entry.ok ? 'SUCCESS' : 'FAILED'} | \`${entry.dllPath}\` | ${entry.exportCount} | \`${entry.outputLibrary}\` | ${entry.message.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()} |`);
        lines.push('');
        fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
        return reportPath;
    }
    async chooseOutputLibraryPath(ref, config, baseName) {
        const directory = this.resolveOutputDirectory(ref, config);
        fs.mkdirSync(directory, { recursive: true });
        const chosen = await vscode.window.showSaveDialog({
            title: 'Save Windows import library',
            defaultUri: vscode.Uri.file(path.join(directory, `${sanitizeBaseName(baseName)}.lib`)),
            filters: { 'Windows import library': ['lib'] }
        });
        return chosen?.fsPath;
    }
    resolveOutputDirectory(ref, config) {
        const projectDir = path.dirname(ref.absolutePath);
        const raw = String(config.outputDirectory || qpmProjectSettingsService_1.DEFAULT_IMPORT_LIBRARY_CONFIGURATION.outputDirectory)
            .replace(/\$\{projectDir\}/g, projectDir)
            .replace(/\$\{projectName\}/g, ref.name);
        return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectDir, raw);
    }
    resolveGeneratorWithoutPrompt(ref, config) {
        const requested = config.generator || 'auto';
        if (config.generatorPath.trim()) {
            const rawGeneratorPath = config.generatorPath.trim();
            const explicitPath = path.isAbsolute(rawGeneratorPath) ? path.normalize(rawGeneratorPath) : path.resolve(path.dirname(ref.absolutePath), rawGeneratorPath);
            if (fs.existsSync(explicitPath)) {
                const kind = requested === 'auto' ? inferGeneratorKind(explicitPath) : requested;
                return { kind, executable: explicitPath, label: generatorLabel(kind) };
            }
        }
        const installation = this.installations.getActiveInstallation(this.workspaces.currentWorkspace?.qpmDir, true);
        const compiler = this.activeCompilerPath();
        let qtKitBin = '';
        let qtArchiverDir = '';
        const activeRef = this.workspaces.activeProjectRef;
        if (activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath) && this.qtInstallations) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                const kit = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
                qtKitBin = kit?.binDir ?? '';
                qtArchiverDir = kit?.toolchain.archiverPath ? path.dirname(kit.toolchain.archiverPath) : '';
            }
            catch { /* use generic candidates */ }
        }
        const dirs = dedupePaths([
            compiler ? path.dirname(compiler) : '',
            qtArchiverDir,
            qtKitBin,
            installation?.cppCompilerExe ? path.dirname(installation.cppCompilerExe) : '',
            installation?.cCompilerExe ? path.dirname(installation.cCompilerExe) : '',
            installation?.root ?? '',
            ...(process.env.PATH || '').split(path.delimiter)
        ].filter(Boolean));
        const preferred = requested === 'auto' ? preferredGeneratorKinds(compiler || installation?.root || '') : [requested];
        for (const kind of preferred) {
            const executable = findGeneratorExecutable(kind, dirs, compiler);
            if (executable)
                return { kind, executable, label: generatorLabel(kind) };
        }
        return undefined;
    }
    async resolveGeneratorSafely(ref, config) {
        try {
            return await this.resolveGenerator(ref, config);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/cancel/i.test(message))
                vscode.window.showErrorMessage(message);
            return undefined;
        }
    }
    async resolveGenerator(ref, config) {
        const requested = config.generator || 'auto';
        if (config.generatorPath.trim()) {
            const rawGeneratorPath = config.generatorPath.trim();
            const explicitPath = path.isAbsolute(rawGeneratorPath) ? path.normalize(rawGeneratorPath) : path.resolve(path.dirname(ref.absolutePath), rawGeneratorPath);
            if (fs.existsSync(explicitPath)) {
                return { kind: requested === 'auto' ? inferGeneratorKind(explicitPath) : requested, executable: explicitPath, label: generatorLabel(requested === 'auto' ? inferGeneratorKind(explicitPath) : requested) };
            }
        }
        const installation = this.installations.getActiveInstallation(this.workspaces.currentWorkspace?.qpmDir, true);
        const compiler = this.activeCompilerPath();
        let qtKitBin = '';
        let qtArchiverDir = '';
        const activeRef = this.workspaces.activeProjectRef;
        if (activeRef?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(activeRef.absolutePath) && this.qtInstallations) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(activeRef.absolutePath);
                const kit = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
                qtKitBin = kit?.binDir ?? '';
                qtArchiverDir = kit?.toolchain.archiverPath ? path.dirname(kit.toolchain.archiverPath) : '';
            }
            catch { /* use generic candidates */ }
        }
        const dirs = dedupePaths([
            compiler ? path.dirname(compiler) : '',
            qtArchiverDir,
            qtKitBin,
            installation?.cppCompilerExe ? path.dirname(installation.cppCompilerExe) : '',
            installation?.cCompilerExe ? path.dirname(installation.cCompilerExe) : '',
            installation?.root ?? '',
            ...(process.env.PATH || '').split(path.delimiter)
        ].filter(Boolean));
        const preferred = requested === 'auto' ? preferredGeneratorKinds(compiler || installation?.root || '') : [requested];
        for (const kind of preferred) {
            const executable = findGeneratorExecutable(kind, dirs, compiler);
            if (executable)
                return { kind, executable, label: generatorLabel(kind) };
        }
        const answer = await vscode.window.showWarningMessage('No compatible import-library generator was detected automatically. Select lib.exe, llvm-lib, llvm-dlltool or dlltool manually?', 'Select generator');
        if (answer !== 'Select generator')
            throw new Error('No import-library generator was found.');
        const chosen = await vscode.window.showOpenDialog({ title: 'Select import-library generator', canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'Executable': ['exe'], 'All files': ['*'] } });
        if (!chosen?.[0])
            throw new Error('Import-library generator selection was cancelled.');
        const kind = requested === 'auto' ? inferGeneratorKind(chosen[0].fsPath) : requested;
        return { kind, executable: chosen[0].fsPath, label: generatorLabel(kind) };
    }
    activeCompilerPath() {
        const ref = this.workspaces.activeProjectRef;
        if (ref?.exists && (0, qtProjectManifest_1.isQtProjectManifestPath)(ref.absolutePath) && this.qtInstallations) {
            try {
                const manifest = (0, qtProjectManifest_1.readQtProjectManifest)(ref.absolutePath);
                const kit = this.qtInstallations.getActive((0, qtProjectManifest_1.getQtInstallationPreference)(manifest));
                if (kit?.toolchain.cppCompilerPath)
                    return kit.toolchain.cppCompilerPath;
                if (kit?.toolchain.cCompilerPath)
                    return kit.toolchain.cCompilerPath;
            }
            catch { /* fall back to generic QPM compiler settings */ }
        }
        return this.settings.getQpmConfigurationValue('cppCompilerPath', '')
            || this.settings.getQpmConfigurationValue('cCompilerPath', '')
            || this.installations.getActiveInstallation(this.workspaces.currentWorkspace?.qpmDir, true)?.cppCompilerExe
            || this.installations.getActiveInstallation(this.workspaces.currentWorkspace?.qpmDir, true)?.cCompilerExe
            || '';
    }
    reportPath(ref) {
        return path.join(path.dirname(ref.absolutePath), '.qpm', 'import-libraries', 'last-report.md');
    }
    writeReport(ref, result, success, toolOutput) {
        const reportPath = this.reportPath(ref);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        const warnings = result.warnings.length ? result.warnings.map((entry) => `- ${entry}`).join('\n') : '- None';
        const text = `# QPM Import Library Generation\n\n- Status: **${success ? 'SUCCESS' : 'FAILED'}**\n- Input: \`${result.inputLabel}\`\n- Runtime DLL: \`${result.dllName}\`\n- Architecture: \`${result.architecture}\`\n- Export count: ${result.exportCount}\n- Generator: \`${result.generator.label}\`\n- Generator executable: \`${result.generator.executable}\`\n- Output library: \`${result.outputLibrary}\`\n- Definition file: \`${result.definitionFile}\`\n\n## Warnings\n\n${warnings}\n\n## Tool output\n\n\`\`\`text\n${toolOutput.trim()}\n\`\`\`\n`;
        fs.writeFileSync(reportPath, text, 'utf8');
        return reportPath;
    }
}
exports.QpmImportLibraryService = QpmImportLibraryService;
function collectHeaderImportSymbols(source, filePath) {
    const parsed = (0, qpmSymbolService_1.scanCFunctions)(source, filePath);
    const symbols = [];
    const warnings = [];
    const duplicateNames = new Map();
    for (const symbol of parsed) {
        const declaration = symbol.declaration || symbol.signature;
        const qualified = symbol.qualifiedName || symbol.name;
        if (symbol.kind !== vscode.SymbolKind.Function)
            continue;
        if (qualified.includes('::') || !/^[A-Za-z_]\w*$/.test(symbol.name))
            continue;
        if (/^\s*static\b/.test(declaration))
            continue;
        duplicateNames.set(symbol.name, (duplicateNames.get(symbol.name) ?? 0) + 1);
        symbols.push({ name: symbol.name, signature: symbol.signature, filePath, line: symbol.line });
    }
    for (const [name, count] of duplicateNames) {
        if (count > 1)
            warnings.push(`Header contains ${count} declarations named ${name}; an import library stores one external symbol name, so overload decoration cannot be inferred from the header alone.`);
    }
    return { symbols: dedupeHeaderSymbols(symbols), warnings };
}
function parsePeExports(buffer) {
    if (buffer.length < 0x100 || buffer.toString('ascii', 0, 2) !== 'MZ')
        throw new Error('File is not a PE image (missing MZ header).');
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset <= 0 || peOffset + 24 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0')
        throw new Error('Invalid PE signature.');
    const machine = buffer.readUInt16LE(peOffset + 4);
    const architecture = machineToImportArchitecture(machine);
    if (!architecture)
        throw new Error(`Unsupported PE machine type 0x${machine.toString(16)}.`);
    const sectionCount = buffer.readUInt16LE(peOffset + 6);
    const optionalSize = buffer.readUInt16LE(peOffset + 20);
    const optionalOffset = peOffset + 24;
    if (optionalOffset + optionalSize > buffer.length)
        throw new Error('Truncated PE optional header.');
    const magic = buffer.readUInt16LE(optionalOffset);
    const dataDirectoryOffset = magic === 0x20b ? optionalOffset + 112 : magic === 0x10b ? optionalOffset + 96 : -1;
    const numberOfDirectoriesOffset = magic === 0x20b ? optionalOffset + 108 : magic === 0x10b ? optionalOffset + 92 : -1;
    if (dataDirectoryOffset < 0 || numberOfDirectoriesOffset < 0 || numberOfDirectoriesOffset + 4 > buffer.length)
        throw new Error('Unsupported PE optional-header format.');
    const numberOfDirectories = buffer.readUInt32LE(numberOfDirectoriesOffset);
    if (numberOfDirectories < 1)
        return { architecture, symbols: [], ordinalOnlyCount: 0 };
    if (dataDirectoryOffset + 8 > buffer.length)
        throw new Error('Truncated PE data directory.');
    const exportRva = buffer.readUInt32LE(dataDirectoryOffset);
    const exportSize = buffer.readUInt32LE(dataDirectoryOffset + 4);
    if (!exportRva || !exportSize)
        return { architecture, symbols: [], ordinalOnlyCount: 0 };
    const sizeOfHeaders = buffer.readUInt32LE(optionalOffset + 60);
    const sectionOffset = optionalOffset + optionalSize;
    const sections = [];
    for (let index = 0; index < sectionCount; index += 1) {
        const offset = sectionOffset + index * 40;
        if (offset + 40 > buffer.length)
            break;
        sections.push({
            virtualSize: buffer.readUInt32LE(offset + 8),
            virtualAddress: buffer.readUInt32LE(offset + 12),
            rawSize: buffer.readUInt32LE(offset + 16),
            rawPointer: buffer.readUInt32LE(offset + 20)
        });
    }
    const rvaToOffset = (rva) => {
        if (rva < sizeOfHeaders && rva < buffer.length)
            return rva;
        for (const section of sections) {
            const span = Math.max(section.virtualSize, section.rawSize);
            if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
                const offset = section.rawPointer + (rva - section.virtualAddress);
                if (offset >= 0 && offset < buffer.length)
                    return offset;
            }
        }
        throw new Error(`Unable to map PE RVA 0x${rva.toString(16)}.`);
    };
    const exportOffset = rvaToOffset(exportRva);
    if (exportOffset + 40 > buffer.length)
        throw new Error('Truncated PE export directory.');
    const nameRva = buffer.readUInt32LE(exportOffset + 12);
    const ordinalBase = buffer.readUInt32LE(exportOffset + 16);
    const functionCount = buffer.readUInt32LE(exportOffset + 20);
    const nameCount = buffer.readUInt32LE(exportOffset + 24);
    const functionsOffset = rvaToOffset(buffer.readUInt32LE(exportOffset + 28));
    const namesOffset = nameCount ? rvaToOffset(buffer.readUInt32LE(exportOffset + 32)) : 0;
    const ordinalsOffset = nameCount ? rvaToOffset(buffer.readUInt32LE(exportOffset + 36)) : 0;
    const dllName = nameRva ? readCString(buffer, rvaToOffset(nameRva)) : undefined;
    const symbols = [];
    const namedFunctionIndexes = new Set();
    for (let index = 0; index < nameCount; index += 1) {
        if (namesOffset + index * 4 + 4 > buffer.length || ordinalsOffset + index * 2 + 2 > buffer.length)
            break;
        const symbolNameRva = buffer.readUInt32LE(namesOffset + index * 4);
        const functionIndex = buffer.readUInt16LE(ordinalsOffset + index * 2);
        if (functionIndex >= functionCount || functionsOffset + functionIndex * 4 + 4 > buffer.length)
            continue;
        const functionRva = buffer.readUInt32LE(functionsOffset + functionIndex * 4);
        const symbolName = readCString(buffer, rvaToOffset(symbolNameRva));
        if (!symbolName)
            continue;
        namedFunctionIndexes.add(functionIndex);
        const forwarded = functionRva >= exportRva && functionRva < exportRva + exportSize;
        symbols.push({
            name: symbolName,
            ordinal: ordinalBase + functionIndex,
            rva: functionRva,
            forwarder: forwarded ? readCString(buffer, rvaToOffset(functionRva)) : undefined
        });
    }
    let ordinalOnlyCount = 0;
    for (let functionIndex = 0; functionIndex < functionCount; functionIndex += 1) {
        if (namedFunctionIndexes.has(functionIndex) || functionsOffset + functionIndex * 4 + 4 > buffer.length)
            continue;
        if (buffer.readUInt32LE(functionsOffset + functionIndex * 4) !== 0)
            ordinalOnlyCount += 1;
    }
    symbols.sort((a, b) => a.ordinal - b.ordinal || a.name.localeCompare(b.name));
    return { architecture, dllName, symbols, ordinalOnlyCount };
}
function renderModuleDefinition(dllName, exports) {
    const lines = [`LIBRARY "${path.basename(dllName).replace(/"/g, '')}"`, 'EXPORTS'];
    const seen = new Set();
    for (const symbol of exports) {
        const name = String(symbol.name || '').trim();
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        lines.push(`    ${name}${symbol.ordinal ? ` @${symbol.ordinal}` : ''}`);
    }
    lines.push('');
    return lines.join('\n');
}
function buildImportLibraryInvocation(tool, defPath, outputLibrary, dllName, architecture) {
    const cwd = path.dirname(outputLibrary);
    if (tool.kind === 'msvc-lib' || tool.kind === 'llvm-lib') {
        return {
            executable: tool.executable,
            args: ['/NOLOGO', `/DEF:${defPath}`, `/OUT:${outputLibrary}`, `/MACHINE:${msvcMachine(architecture)}`],
            cwd
        };
    }
    return {
        executable: tool.executable,
        args: ['-d', defPath, '-l', outputLibrary, '-D', path.basename(dllName), '-m', dlltoolMachine(architecture)],
        cwd
    };
}
function resolveConfiguredArchitecture(configured, buildMode, compilerPath) {
    if (configured !== 'auto')
        return configured;
    const lower = compilerPath.toLowerCase().replace(/\\/g, '/');
    if (/aarch64|arm64/.test(lower))
        return 'arm64';
    return buildMode === 'debug64' || buildMode === 'release64' ? 'x64' : 'x86';
}
function preferredGeneratorKinds(compilerPath) {
    const lower = compilerPath.toLowerCase();
    if (/clang-cl|visual studio|\\cl\.exe$|\/cl\.exe$/.test(lower))
        return ['msvc-lib', 'llvm-lib', 'llvm-dlltool', 'gnu-dlltool'];
    if (/clang/.test(lower))
        return ['llvm-dlltool', 'llvm-lib', 'gnu-dlltool', 'msvc-lib'];
    return ['gnu-dlltool', 'llvm-dlltool', 'msvc-lib', 'llvm-lib'];
}
function findGeneratorExecutable(kind, dirs, compilerPath) {
    const compilerBase = path.basename(compilerPath || '').replace(/(?:gcc|g\+\+|clang\+\+|clang)(?:\.exe)?$/i, '');
    const names = kind === 'msvc-lib' ? ['lib.exe', 'lib']
        : kind === 'llvm-lib' ? ['llvm-lib.exe', 'llvm-lib']
            : kind === 'llvm-dlltool' ? ['llvm-dlltool.exe', 'llvm-dlltool']
                : [`${compilerBase}dlltool.exe`, `${compilerBase}dlltool`, 'dlltool.exe', 'dlltool', 'x86_64-w64-mingw32-dlltool.exe', 'i686-w64-mingw32-dlltool.exe'];
    for (const dir of dirs) {
        if (!dir)
            continue;
        for (const name of names) {
            const candidate = path.join(dir, name);
            if (fs.existsSync(candidate))
                return candidate;
        }
    }
    return undefined;
}
function inferGeneratorKind(executable) {
    const name = path.basename(executable).toLowerCase();
    if (name.startsWith('llvm-lib'))
        return 'llvm-lib';
    if (name.includes('llvm-dlltool'))
        return 'llvm-dlltool';
    if (name === 'lib.exe' || name === 'lib')
        return 'msvc-lib';
    return 'gnu-dlltool';
}
function generatorLabel(kind) {
    switch (kind) {
        case 'msvc-lib': return 'Microsoft LIB';
        case 'llvm-lib': return 'LLVM llvm-lib';
        case 'llvm-dlltool': return 'LLVM llvm-dlltool';
        case 'gnu-dlltool': return 'GNU dlltool';
    }
}
function msvcMachine(architecture) {
    return architecture === 'x86' ? 'X86' : architecture === 'arm64' ? 'ARM64' : 'X64';
}
function dlltoolMachine(architecture) {
    return architecture === 'x86' ? 'i386' : architecture === 'arm64' ? 'arm64' : 'i386:x86-64';
}
function machineToImportArchitecture(machine) {
    if (machine === 0x014c)
        return 'x86';
    if (machine === 0x8664)
        return 'x64';
    if (machine === 0xaa64)
        return 'arm64';
    return undefined;
}
function readCString(buffer, offset) {
    if (offset < 0 || offset >= buffer.length)
        return '';
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0)
        end += 1;
    return buffer.toString('utf8', offset, end);
}
function dedupeHeaderSymbols(symbols) {
    const seen = new Set();
    const result = [];
    for (const symbol of symbols) {
        if (seen.has(symbol.name))
            continue;
        seen.add(symbol.name);
        result.push(symbol);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}
function dedupePaths(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (!value)
            continue;
        const normalized = path.resolve(value);
        const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(normalized);
        }
    }
    return result;
}
function isHeaderPath(filePath) {
    return /\.(?:h|hh|hpp|hxx)$/i.test(filePath);
}
function sanitizeBaseName(value) {
    return String(value || 'library').replace(/\.(?:dll|lib)$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_') || 'library';
}
function ensureDllExtension(value) {
    return /\.dll$/i.test(value) ? value : `${value}.dll`;
}
function changeExtension(filePath, extension) {
    return path.join(path.dirname(filePath), `${path.parse(filePath).name}${extension}`);
}
function samePath(a, b) {
    const left = path.resolve(a || '');
    const right = path.resolve(b || '');
    return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function safeScriptJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
async function runProcess(executable, args, cwd, log) {
    return await new Promise((resolve) => {
        const child = (0, child_process_1.spawn)(executable, args, { cwd, windowsHide: true, shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (data) => { const text = data.toString(); stdout += text; for (const line of text.split(/\r?\n/).filter(Boolean))
            log(`[tool] ${line}`); });
        child.stderr?.on('data', (data) => { const text = data.toString(); stderr += text; for (const line of text.split(/\r?\n/).filter(Boolean))
            log(`[tool:stderr] ${line}`); });
        child.on('error', (error) => resolve({ ok: false, code: null, stdout, stderr: `${stderr}${error.message}` }));
        child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
    });
}
