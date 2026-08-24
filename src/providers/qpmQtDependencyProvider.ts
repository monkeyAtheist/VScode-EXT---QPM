import * as vscode from 'vscode';
import { QpmQtDependencyService, QpmQtDependencyStatus } from '../services/qpmQtDependencyService';

interface DependencyNode { id:string; label:string; description?:string; icon:string; command?:string; tooltip?:string; }
export class QpmQtDependencyProvider implements vscode.TreeDataProvider<DependencyNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>(); readonly onDidChangeTreeData = this.emitter.event; private disposables:vscode.Disposable[]=[];
  constructor(private readonly dependencies: QpmQtDependencyService){ this.disposables.push(dependencies.onDidChange(()=>this.emitter.fire())); }
  attachView(view:vscode.TreeView<DependencyNode>):void { this.disposables.push(view.onDidChangeVisibility(e=>{if(e.visible) void this.dependencies.refresh();})); if(view.visible) void this.dependencies.refresh(); }
  dispose():void { for(const d of this.disposables)d.dispose(); this.emitter.dispose(); }
  refresh():void { this.emitter.fire(); }
  getTreeItem(node:DependencyNode):vscode.TreeItem { const item=new vscode.TreeItem(node.label); item.id=node.id; item.description=node.description; item.tooltip=node.tooltip??[node.label,node.description].filter(Boolean).join(' — '); item.iconPath=new vscode.ThemeIcon(node.icon); if(node.command)item.command={command:node.command,title:node.label}; return item; }
  getChildren():DependencyNode[] { const manifest=this.dependencies.activeManifestPath; if(!manifest)return [{id:'none',label:'Active project has no C++ dependency configuration',description:'Open a native Qt C++ project',icon:'info'}]; const s=this.dependencies.status; if(!s){void this.dependencies.refresh();return [{id:'loading',label:'Inspecting dependency managers…',icon:'sync~spin'}];} return nodes(s); }
}
function nodes(s:QpmQtDependencyStatus):DependencyNode[]{ const icon=s.state==='ready'?'pass-filled':s.state==='disabled'?'circle-slash':s.state==='error'?'error':'warning'; return [
{id:'project',label:s.projectName,description:`${s.configuredPackages} package declaration(s)`,icon:'package',tooltip:s.manifestPath},
{id:'state',label:'State',description:s.state,icon,tooltip:s.message},
{id:'managers',label:'Managers',description:s.managers.join(' + ')||'none',icon:'extensions'},
{id:'vcpkg',label:'vcpkg',description:s.vcpkgPath||'not found',icon:s.vcpkgPath?'pass':'warning'},
{id:'conan',label:'Conan 2',description:s.conanPath||'not found',icon:s.conanPath?'pass':'warning'},
{id:'pkg',label:'pkg-config',description:s.pkgConfigPath||'not found',icon:s.pkgConfigPath?'pass':'warning'},
{id:'configure',label:'Configure dependency managers',description:'Enable vcpkg, Conan 2 or pkg-config',icon:'settings-gear',command:'qpm.dependencies.configure'},
{id:'detect',label:'Detect dependency tools',description:'Refresh executable readiness',icon:'search',command:'qpm.dependencies.detectTools'},
{id:'generate',label:'Generate dependency manifests',description:'vcpkg.json, conanfile.txt and integration metadata',icon:'file-code',command:'qpm.dependencies.generateManifests'},
{id:'install',label:'Install / synchronize dependencies',description:'Run enabled package managers',icon:'cloud-download',command:'qpm.dependencies.install'},
{id:'report',label:'Open dependency report',description:s.lastSync?`Last sync ${s.lastSync}`:'No integration generated yet',icon:'preview',command:'qpm.dependencies.openReport'},
{id:'reveal',label:'Reveal dependency output',description:s.outputDirectory,icon:'folder-opened',command:'qpm.dependencies.revealOutput'},
{id:'clean',label:'Clean dependency output',description:'Remove generated integration and package-manager output',icon:'trash',command:'qpm.dependencies.clean'}
]; }
