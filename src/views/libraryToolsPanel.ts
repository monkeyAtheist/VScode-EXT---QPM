import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { QpmWorkspaceProjectRef } from '../model/types';
import { QpmWorkspaceService } from '../services/qpmWorkspaceService';
import { QpmDllAnalysis, analyzeDllFile, renderDllAnalysisMarkdown } from '../services/qpmDllAnalyzerService';
import { QpmLibraryAnalysis, analyzeLibraryFile, renderLibraryAnalysisMarkdown } from '../services/qpmLibraryAnalyzerService';

export class LibraryToolsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private mode: 'dll' | 'library' = 'dll';
  private projectRef?: QpmWorkspaceProjectRef;
  private filePath = '';
  private dllAnalysis?: QpmDllAnalysis;
  private libraryAnalysis?: QpmLibraryAnalysis;

  constructor(private readonly workspaces: QpmWorkspaceService) {}

  dispose(): void { this.panel?.dispose(); }

  showDllAnalyzer(projectRef?: QpmWorkspaceProjectRef, filePath?: string): void {
    this.mode = 'dll';
    this.projectRef = projectRef ?? this.workspaces.activeProjectRef;
    if (filePath) this.analyzeDll(filePath, false);
    this.show();
  }

  showLibraryAnalyzer(projectRef?: QpmWorkspaceProjectRef, filePath?: string): void {
    this.mode = 'library';
    this.projectRef = projectRef ?? this.workspaces.activeProjectRef;
    if (filePath) this.analyzeLibrary(filePath, false);
    this.show();
  }

  private show(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('qpm.libraryTools', 'QPM Library Tools', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
      this.panel.onDidDispose(() => { this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message));
    }
    this.panel.title = this.mode === 'dll' ? 'QPM DLL Analyzer' : 'QPM .a / .lib Analyzer';
    this.panel.webview.html = this.render();
    this.panel.reveal(vscode.ViewColumn.Active);
  }

  private async handleMessage(message: any): Promise<void> {
    const type = String(message?.type ?? '');
    if (type === 'switch') {
      this.mode = message.mode === 'library' ? 'library' : 'dll';
      this.filePath = '';
      this.show();
      return;
    }
    if (type === 'browse') {
      const library = this.mode === 'library';
      const chosen = await vscode.window.showOpenDialog({
        title: library ? 'Select .a / .dll.a / .lib library to analyze' : 'Select Windows DLL to analyze',
        canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
        defaultUri: vscode.Uri.file(this.defaultDirectory()),
        filters: library ? { 'Static/import libraries': ['a', 'lib'], 'All files': ['*'] } : { 'Windows DLL': ['dll'], 'All files': ['*'] }
      });
      if (!chosen?.[0]) return;
      if (library) this.analyzeLibrary(chosen[0].fsPath); else this.analyzeDll(chosen[0].fsPath);
      return;
    }
    if (type === 'analyze') {
      const requested = String(message.path ?? '').trim();
      if (!requested) return;
      if (this.mode === 'library') this.analyzeLibrary(requested); else this.analyzeDll(requested);
      return;
    }
    if (type === 'export') {
      await this.exportReport();
    }
  }

  private analyzeDll(filePath: string, rerender = true): void {
    try {
      this.filePath = path.resolve(filePath);
      this.dllAnalysis = analyzeDllFile(this.filePath);
      this.libraryAnalysis = undefined;
    } catch (error) {
      this.dllAnalysis = undefined;
      vscode.window.showErrorMessage(`Unable to analyze DLL: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (rerender) this.show();
  }

  private analyzeLibrary(filePath: string, rerender = true): void {
    try {
      this.filePath = path.resolve(filePath);
      this.libraryAnalysis = analyzeLibraryFile(this.filePath);
      this.dllAnalysis = undefined;
    } catch (error) {
      this.libraryAnalysis = undefined;
      vscode.window.showErrorMessage(`Unable to analyze library: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (rerender) this.show();
  }

  private async exportReport(): Promise<void> {
    const analysis = this.mode === 'dll' ? this.dllAnalysis : this.libraryAnalysis;
    if (!analysis) { vscode.window.showInformationMessage('Analyze a file first.'); return; }
    const root = this.projectRef?.exists ? path.dirname(this.projectRef.absolutePath) : this.defaultDirectory();
    const base = path.parse(analysis.fileName).name;
    const target = await vscode.window.showSaveDialog({
      title: 'Export QPM analyzer report',
      defaultUri: vscode.Uri.file(path.join(root, '.qpm', this.mode === 'dll' ? 'dll-analyzer' : 'library-analyzer', `${base}-analysis.md`)),
      filters: { Markdown: ['md'], 'Text files': ['txt'] }
    });
    if (!target) return;
    fs.mkdirSync(path.dirname(target.fsPath), { recursive: true });
    fs.writeFileSync(target.fsPath, this.mode === 'dll' ? renderDllAnalysisMarkdown(this.dllAnalysis!) : renderLibraryAnalysisMarkdown(this.libraryAnalysis!), 'utf8');
    vscode.window.showInformationMessage(`Analysis report exported: ${target.fsPath}`);
  }

  private defaultDirectory(): string {
    if (this.filePath && fs.existsSync(path.dirname(this.filePath))) return path.dirname(this.filePath);
    if (this.projectRef?.exists) return path.dirname(this.projectRef.absolutePath);
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  }

  private render(): string {
    const active = this.mode === 'dll' ? this.dllAnalysis : this.libraryAnalysis;
    const body = this.mode === 'dll' ? renderDll(this.dllAnalysis) : renderLibrary(this.libraryAnalysis);
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}body{font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-foreground);padding:20px;max-width:1450px;margin:auto}.tabs{display:flex;gap:6px;margin-bottom:14px}.tabs button.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}button{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:7px 12px;border-radius:3px;cursor:pointer}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:end;margin-bottom:16px}.field{display:flex;flex-direction:column;gap:5px}.field input{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);padding:7px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin:10px 0 16px}.kv{border:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:9px;border-radius:4px;display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}.kv strong{font-size:11px;color:var(--vscode-descriptionForeground);text-transform:uppercase}.scroll{overflow:auto;max-height:440px;border:1px solid var(--vscode-panel-border);margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border);padding:6px;vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editorWidget-background)}code{font-family:var(--vscode-editor-font-family)}.badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.badge{border:1px solid var(--vscode-panel-border);padding:4px 7px;border-radius:12px;background:var(--vscode-editorWidget-background)}.empty{border:1px dashed var(--vscode-panel-border);padding:30px;text-align:center;color:var(--vscode-descriptionForeground)}h3{margin-top:20px}.note{color:var(--vscode-descriptionForeground)}
    </style></head><body><div class="tabs"><button data-mode="dll" class="${this.mode === 'dll' ? 'active' : 'secondary'}">DLL Analyzer</button><button data-mode="library" class="${this.mode === 'library' ? 'active' : 'secondary'}">.a / .lib Analyzer</button></div><div class="toolbar"><label class="field">${this.mode === 'dll' ? 'DLL file' : 'Library file'}<input id="path" value="${esc(this.filePath)}" placeholder="${this.mode === 'dll' ? 'Select a .dll file…' : 'Select .a, .dll.a or .lib…'}"></label><button id="browse" class="secondary">Browse…</button><button id="analyze">Analyze</button></div><div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="export" class="secondary" ${active ? '' : 'disabled'}>Export report…</button></div>${body}<script>const vscode=acquireVsCodeApi();document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>vscode.postMessage({type:'switch',mode:b.dataset.mode}));document.getElementById('browse').onclick=()=>vscode.postMessage({type:'browse'});document.getElementById('analyze').onclick=()=>vscode.postMessage({type:'analyze',path:document.getElementById('path').value});document.getElementById('export').onclick=()=>vscode.postMessage({type:'export'});</script></body></html>`;
  }
}

function renderDll(a?: QpmDllAnalysis): string {
  if (!a) return '<div class="empty">Select a DLL to inspect PE architecture, versions, exports, imports/dependencies, resources, sections, certificate presence and CodeView/PDB metadata.</div>';
  const meta: Array<[string,string]> = [['File',a.fileName],['Architecture',`${a.architecture} · ${a.machineLabel}`],['PE format',a.peFormat],['File version',a.version.fileVersion??'Not available'],['Product version',a.version.productVersion??'Not available'],['Revision',a.version.fileVersion?.split('.')[3]??'Not available'],['Link timestamp',a.timestampIso??'Not set'],['Image base',a.imageBase],['Entry point',`RVA 0x${a.entryPointRva.toString(16).toUpperCase()}`],['Subsystem',a.subsystemLabel],['File size',`${a.fileSize} bytes`],['SHA-256',a.sha256],['Authenticode',a.authenticodePresent?`Certificate table present (${a.authenticodeSize} bytes)`:'No certificate table'],['.NET / CLR',a.dotNet?'CLR header present':'Native PE / no CLR header']];
  const exports=a.exports.map(x=>`<tr><td>${x.ordinal}</td><td><code>${esc(x.name)}</code></td><td>0x${x.rva.toString(16).toUpperCase()}</td><td>${esc(x.forwarder??'')}</td></tr>`).join('')||'<tr><td colspan="4">No named exports.</td></tr>';
  const imports=a.imports.flatMap(m=>m.symbols.length?m.symbols.map(x=>`<tr><td><code>${esc(m.dll)}</code></td><td>${x.name?`<code>${esc(x.name)}</code>`:`ordinal ${x.ordinal??''}`}</td><td>${x.hint??''}</td></tr>`):[`<tr><td><code>${esc(m.dll)}</code></td><td colspan="2">No decoded symbols</td></tr>`]).join('')||'<tr><td colspan="3">No imports.</td></tr>';
  return `<div class="grid">${meta.map(([k,v])=>`<div class="kv"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('')}</div>${Object.keys(a.version.strings).length?`<h3>Version strings</h3><div class="grid">${Object.entries(a.version.strings).map(([k,v])=>`<div class="kv"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`:''}<h3>Exports (${a.exports.length}${a.ordinalOnlyExportCount?` + ${a.ordinalOnlyExportCount} ordinal-only`:''})</h3><div class="scroll"><table><thead><tr><th>Ordinal</th><th>Name</th><th>RVA</th><th>Forwarder</th></tr></thead><tbody>${exports}</tbody></table></div><h3>Imports / dependencies (${a.imports.length} DLLs)</h3><div class="scroll"><table><thead><tr><th>DLL</th><th>Symbol</th><th>Hint</th></tr></thead><tbody>${imports}</tbody></table></div><h3>Sections</h3><div class="scroll"><table><thead><tr><th>Name</th><th>RVA</th><th>Virtual</th><th>Raw</th><th>Characteristics</th></tr></thead><tbody>${a.sections.map(x=>`<tr><td><code>${esc(x.name)}</code></td><td>0x${x.virtualAddress.toString(16).toUpperCase()}</td><td>${x.virtualSize}</td><td>${x.rawSize}</td><td>0x${x.characteristics.toString(16).toUpperCase()}</td></tr>`).join('')}</tbody></table></div><h3>Resources</h3><div class="badges">${a.resources.length?a.resources.map(x=>`<span class="badge">${esc(x.name??`type ${x.id??'?'}`)}: ${x.count}</span>`).join(''):'<span class="note">No resources.</span>'}</div><h3>PE flags</h3><div class="badges">${[...a.fileCharacteristics,...a.dllCharacteristics].map(x=>`<span class="badge">${esc(x)}</span>`).join('')||'<span class="note">No decoded flags.</span>'}</div>${a.debug.pdbPath||a.debug.pdbGuid?`<h3>Debug / PDB</h3><div class="grid">${a.debug.pdbPath?`<div class="kv"><strong>PDB path</strong><span>${esc(a.debug.pdbPath)}</span></div>`:''}${a.debug.pdbGuid?`<div class="kv"><strong>PDB GUID</strong><span>${esc(a.debug.pdbGuid)}</span></div>`:''}${a.debug.pdbAge!==undefined?`<div class="kv"><strong>PDB age</strong><span>${a.debug.pdbAge}</span></div>`:''}</div>`:''}`;
}

function renderLibrary(a?: QpmLibraryAnalysis): string {
  if (!a) return '<div class="empty">Select a GNU .a, MinGW .dll.a or Windows/LLVM .lib archive to inspect members, target architectures, linker symbols and import-library metadata.</div>';
  const meta: Array<[string,string]> = [['File',a.fileName],['Extension',a.extension],['Classification',`${a.libraryKind} library`],['Archive format',a.archiveFormat],['Architectures',a.architectures.length?a.architectures.join(', '):'Not detected'],['Members',String(a.memberCount)],['Object members',String(a.objectMemberCount)],['Import-object members',String(a.importObjectCount)],['Linker symbols',String(a.linkerSymbolCount)],['File size',`${a.fileSize} bytes`],['Modified',a.modifiedIso],['SHA-256',a.sha256]];
  return `<div class="grid">${meta.map(([k,v])=>`<div class="kv"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join('')}</div><h3>Referenced runtime DLLs</h3><div class="badges">${a.importDlls.length?a.importDlls.map(x=>`<span class="badge">${esc(x)}</span>`).join(''):'<span class="note">No DLL reference detected.</span>'}</div><h3>Linker symbols (${a.symbols.length})</h3><div class="scroll"><table><thead><tr><th>#</th><th>Symbol</th></tr></thead><tbody>${a.symbols.map((x,i)=>`<tr><td>${i+1}</td><td><code>${esc(x)}</code></td></tr>`).join('')||'<tr><td colspan="2">No symbols decoded.</td></tr>'}</tbody></table></div><h3>Archive members</h3><div class="scroll"><table><thead><tr><th>Name</th><th>Kind</th><th>Architecture</th><th>Size</th><th>Import DLL</th><th>Import symbol</th><th>Symbols</th></tr></thead><tbody>${a.members.map(x=>`<tr><td><code>${esc(x.name)}</code></td><td>${esc(x.kind)}</td><td>${esc(x.architecture??'')}</td><td>${x.size}</td><td>${x.importDll?`<code>${esc(x.importDll)}</code>`:''}</td><td>${x.importSymbol?`<code>${esc(x.importSymbol)}</code>`:''}</td><td>${x.symbols.length}</td></tr>`).join('')}</tbody></table></div><h3>Notes</h3><ul>${a.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
}

function esc(value: unknown): string { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
