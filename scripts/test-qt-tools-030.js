'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '0.17.6');

const commandIds = pkg.contributes.commands.map((entry) => entry.command);
for (const command of [
  'qpm.createTranslation', 'qpm.updateTranslations', 'qpm.releaseTranslations',
  'qpm.openTranslationInLinguist', 'qpm.showTranslationStatus',
  'qpm.openQrcEditor', 'qpm.validateQrc',
  'qpm.qmlLintFile', 'qpm.qmlLintProject', 'qpm.qmlFormatFile',
  'qpm.qmlFormatProject', 'qpm.qmlPreviewFile',
  'qpm.openQtDocumentation'
]) assert(commandIds.includes(command), `${command} must be contributed`);
assert(pkg.contributes.views.qpm.some((view) => view.id === 'qpm.qtTools'), 'Qt Tools view must be contributed');
assert.strictEqual(pkg.contributes.configuration.properties['qpm.qmlLintOnSave'].default, true);
assert.strictEqual(pkg.contributes.configuration.properties['qpm.qrcCreateBackups'].default, true);

const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
assert(extension.includes('new QpmQtToolsService'), 'Qt tools service must be activated');
assert(extension.includes("register('qpm.createTranslation'"));
assert(extension.includes("register('qpm.qmlLintProject'"));

const installSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmQtInstallationService.ts'), 'utf8');
for (const token of ['linguistPath', 'lupdatePath', 'lreleasePath', 'qmlLintPath', 'qmlFormatPath', 'qmlRuntimePath']) {
  assert(installSource.includes(token), `Qt kit metadata must expose ${token}`);
}

const resourceSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtResourceEditorPanel.ts'), 'utf8');
for (const token of ['serializeQtResourceDocument', 'validateQtResourceDocument', 'alias=', 'qresource']) {
  assert(resourceSource.includes(token), `Qt Resource Editor missing ${token}`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'qpm-tools-030-'));
const originalLoad = Module._load;
class Position { constructor(line, character) { this.line=line; this.character=character; } }
class Range { constructor(a,b,c,d) { if (typeof a === 'number') { this.start=new Position(a,b); this.end=new Position(c,d); } else { this.start=a; this.end=b; } } }
class Diagnostic { constructor(range,message,severity) { this.range=range; this.message=message; this.severity=severity; } }
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return {
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    Diagnostic, Range, Position,
    languages: { createDiagnosticCollection: () => ({ set(){}, get(){return [];}, clear(){}, dispose(){} }) },
    workspace: { onDidSaveTextDocument: () => ({ dispose(){} }), getConfiguration: () => ({ get: (_k,v)=>v }), textDocuments: [] },
    window: {}, Uri: class Uri {}, ProgressLocation: { Notification: 15 }, ViewColumn: { Active: 1 }
  };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  const tools = require('../out/services/qpmQtToolsService');
  const tsPath = path.join(temp, 'app_fr.ts');
  fs.writeFileSync(tsPath, `<?xml version="1.0"?><TS><context><name>Main</name>
    <message><source>A</source><translation>Un</translation></message>
    <message><source>B</source><translation type="unfinished"></translation></message>
    <message><source>C</source><translation type="obsolete">Ancien</translation></message>
  </context></TS>`);
  const stats = tools.readQtTranslationStatistics(tsPath);
  assert.deepStrictEqual({contexts:stats.contexts,messages:stats.messages,finished:stats.finished,unfinished:stats.unfinished,obsolete:stats.obsolete}, {contexts:1,messages:3,finished:1,unfinished:1,obsolete:1});
  const diagnostics = tools.parseQmlLintDiagnostics(path.join(temp, 'Main.qml'), `Warning: ${path.join(temp, 'Main.qml')}:4:9: Unqualified access [unqualified]`);
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].range.start.line, 3);
  assert.strictEqual(diagnostics[0].code, 'unqualified');


  const resource = require('../out/views/qtResourceEditorPanel');
  const imagePath = path.join(temp, 'images', 'logo.png');
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });
  fs.writeFileSync(imagePath, 'png');
  const qrcPath = path.join(temp, 'resources.qrc');
  const qrcDocument = { groups: [{ id:'g1', prefix:'/', language:'', files:[{ id:'f1', source:'images/logo.png', alias:'logo.png', empty:false }] }] };
  fs.writeFileSync(qrcPath, resource.serializeQtResourceDocument(qrcDocument));
  const parsedQrc = resource.readQtResourceDocument(qrcPath);
  assert.strictEqual(parsedQrc.groups[0].prefix, '/');
  assert.strictEqual(parsedQrc.groups[0].files[0].alias, 'logo.png');
  assert.deepStrictEqual(resource.validateQtResourceDocument(qrcPath, parsedQrc), []);

  const settingsSource = fs.readFileSync(path.join(root, 'src', 'views', 'qtProjectSettingsPanel.ts'), 'utf8');
  assert(settingsSource.includes('deployProfile.translations = payload.deployTranslations === true'));
  const buildSource = fs.readFileSync(path.join(root, 'src', 'services', 'qpmBuildService.ts'), 'utf8');
  assert(buildSource.includes('releaseAndDeployApplicationTranslations'));
  assert(buildSource.includes("'-fail-on-unfinished'"));
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('QPM 0.3.1 Qt tools regression tests: PASS');
